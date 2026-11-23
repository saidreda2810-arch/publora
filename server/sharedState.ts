/**
 * server/sharedState.ts — WP6: Postgres-backed shared state.
 * Active only when SHARED_STATE_DRIVER=pg AND DATABASE_URL is set.
 * Default 'memory' keeps existing in-process behavior (single instance).
 * UNTESTED against live PG until WP6 verification runs.
 */
import crypto from 'node:crypto';
import { query, withTransaction } from './db/client.ts';

export function sharedStateDriver(): 'pg' | 'memory' {
  return process.env.SHARED_STATE_DRIVER === 'pg' && process.env.DATABASE_URL ? 'pg' : 'memory';
}

// ---------------------------------------------------------------- rate limits
// Fixed-window counter: bucket = limiter id, key = route:ip, window_start = floor(now/windowMs).
export async function pgRateLimit(bucket: string, key: string, windowMs: number, max: number): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const r = await query(
    `INSERT INTO rate_limits(bucket,key,window_start,count) VALUES($1,$2,$3,1)
     ON CONFLICT (bucket,key,window_start) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`, [bucket, key, windowStart]);
  const count = Number(r.rows[0].count);
  if (count > max) {
    const retryMs = windowStart.getTime() + windowMs - Date.now();
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(retryMs / 1000)) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

// ------------------------------------------------------------ brute force
export interface BfRecord {
  failures: number; firstFailureAt: number; lastFailureAt: number;
  restrictedUntil: number; restrictionStrikes: number;
}

const emptyBf = (): BfRecord => ({ failures: 0, firstFailureAt: 0, lastFailureAt: 0, restrictedUntil: 0, restrictionStrikes: 0 });

export async function pgBfGet(scope: string, identifier: string): Promise<BfRecord> {
  const r = await query(`SELECT failures, first_failure_at, last_failure_at, restricted_until, restriction_strikes
    FROM brute_force_state WHERE scope=$1 AND identifier=$2`, [scope, identifier]);
  const row = r.rows[0];
  if (!row) return emptyBf();
  return {
    failures: row.failures,
    firstFailureAt: row.first_failure_at ? new Date(row.first_failure_at).getTime() : 0,
    lastFailureAt: row.last_failure_at ? new Date(row.last_failure_at).getTime() : 0,
    restrictedUntil: row.restricted_until ? new Date(row.restricted_until).getTime() : 0,
    restrictionStrikes: row.restriction_strikes || 0,
  };
}

export async function pgBfPut(scope: string, identifier: string, rec: BfRecord): Promise<void> {
  await query(`INSERT INTO brute_force_state(scope,identifier,failures,first_failure_at,last_failure_at,restricted_until,restriction_strikes,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,now())
    ON CONFLICT (scope,identifier) DO UPDATE SET failures=$3, first_failure_at=$4, last_failure_at=$5,
      restricted_until=$6, restriction_strikes=$7, updated_at=now()`,
    [scope, identifier, rec.failures,
     rec.firstFailureAt ? new Date(rec.firstFailureAt) : null,
     rec.lastFailureAt ? new Date(rec.lastFailureAt) : null,
     rec.restrictedUntil ? new Date(rec.restrictedUntil) : null,
     rec.restrictionStrikes]);
}

export async function pgBfDelete(scope: string, identifier: string): Promise<void> {
  await query('DELETE FROM brute_force_state WHERE scope=$1 AND identifier=$2', [scope, identifier]);
}

// Atomic failure recording inside one transaction (SELECT FOR UPDATE).
export async function pgBfRecordFailure(
  scope: string, identifier: string,
  windowMs: number, maxFailures: number, restrictMs: number, maxRestrictMs: number, now: number,
): Promise<{ restricted: boolean; restrictUntil: number; rec: BfRecord }> {
  return withTransaction(async (c) => {
    await c.query(`INSERT INTO brute_force_state(scope,identifier) VALUES($1,$2) ON CONFLICT DO NOTHING`, [scope, identifier]);
    const r = await c.query(`SELECT failures, first_failure_at, last_failure_at, restricted_until, restriction_strikes
      FROM brute_force_state WHERE scope=$1 AND identifier=$2 FOR UPDATE`, [scope, identifier]);
    const row = r.rows[0];
    const rec: BfRecord = {
      failures: row.failures,
      firstFailureAt: row.first_failure_at ? new Date(row.first_failure_at).getTime() : 0,
      lastFailureAt: row.last_failure_at ? new Date(row.last_failure_at).getTime() : 0,
      restrictedUntil: row.restricted_until ? new Date(row.restricted_until).getTime() : 0,
      restrictionStrikes: row.restriction_strikes || 0,
    };
    if (rec.restrictedUntil > 0 && now >= rec.restrictedUntil) rec.restrictedUntil = 0;
    if (now - rec.firstFailureAt > windowMs) { rec.failures = 0; rec.firstFailureAt = now; }
    if (rec.failures === 0) rec.firstFailureAt = now;
    rec.failures += 1; rec.lastFailureAt = now;
    let restricted = false; let restrictUntil = rec.restrictedUntil;
    if (rec.failures >= maxFailures && rec.restrictedUntil <= now) {
      rec.restrictionStrikes += 1;
      const escalation = Math.min(restrictMs * Math.pow(2, rec.restrictionStrikes - 1), maxRestrictMs);
      rec.restrictedUntil = now + escalation;
      restricted = true; restrictUntil = rec.restrictedUntil;
    }
    await c.query(`UPDATE brute_force_state SET failures=$3, first_failure_at=$4, last_failure_at=$5,
      restricted_until=$6, restriction_strikes=$7, updated_at=now() WHERE scope=$1 AND identifier=$2`,
      [scope, identifier, rec.failures,
       rec.firstFailureAt ? new Date(rec.firstFailureAt) : null,
       rec.lastFailureAt ? new Date(rec.lastFailureAt) : null,
       rec.restrictedUntil ? new Date(rec.restrictedUntil) : null,
       rec.restrictionStrikes]);
    return { restricted, restrictUntil, rec };
  });
}

// ------------------------------------------------------------- oauth attempts
export interface PgOAuthAttempt {
  id: string; provider: string; state: string; brandId?: string; workspaceId?: string;
  codeVerifier?: string; redirectUri: string; createdAt: number; expiresAt: number;
}

export async function pgStoreAttempt(a: PgOAuthAttempt): Promise<void> {
  await query(`INSERT INTO oauth_attempts(id,provider,state,pkce_verifier,redirect_after,expires_at,created_at,brand_id,payload)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (state) DO NOTHING`,
    [a.id, a.provider, a.state, a.codeVerifier ?? null, a.redirectUri,
     new Date(a.expiresAt), new Date(a.createdAt), a.brandId ?? null,
     JSON.stringify({ workspaceId: a.workspaceId ?? null })]);
}

export async function pgGetAttempt(state: string): Promise<PgOAuthAttempt | undefined> {
  const r = await query(`SELECT * FROM oauth_attempts WHERE state=$1 AND expires_at>now()`, [state]);
  const row = r.rows[0];
  if (!row) return undefined;
  return {
    id: row.id, provider: row.provider, state: row.state,
    brandId: row.brand_id ?? undefined, workspaceId: row.payload?.workspaceId ?? undefined,
    codeVerifier: row.pkce_verifier ?? undefined, redirectUri: row.redirect_after,
    createdAt: new Date(row.created_at).getTime(), expiresAt: new Date(row.expires_at).getTime(),
  };
}

export async function pgRemoveAttempt(state: string): Promise<void> {
  await query('DELETE FROM oauth_attempts WHERE state=$1', [state]);
}

export async function pgPurgeAttempts(): Promise<number> {
  return (await query(`DELETE FROM oauth_attempts WHERE expires_at < now()`)).rowCount ?? 0;
}

export { crypto as _crypto };
