import { query, withTransaction } from './db/client.ts';

/**
 * globalStores — PG-backed replacement for the remaining JSON file stores
 * (systemSettings, uploadPolicy, oauthConfig, oauthAccounts, mediaAssets,
 * driveConnections, driveImports, automationApprovals).
 *
 * Design: each store is a single JSONB blob keyed `gs:<name>` in
 * system_settings. Reads are synchronous from an in-memory cache hydrated
 * from PG; writes update the cache immediately and persist asynchronously
 * (write-through). A periodic refresh re-reads PG so changes made by OTHER
 * instances propagate within `REFRESH_MS`.
 *
 * Honest limitations:
 *  - Cross-instance visibility is eventual (≤ REFRESH_MS), not instant.
 *  - Blob-per-store means last-writer-wins on concurrent edits to the SAME
 *    store — acceptable for low-contention config/metadata stores; high-
 *    contention entity data already lives in normalized tables.
 */

const REFRESH_MS = 15_000;

const cache = new Map<string, any>();
const pendingWrites = new Map<string, Promise<void>>();
let refreshTimer: NodeJS.Timeout | null = null;

export function globalStoresEnabled(): boolean {
  return (process.env.DB_DRIVER || 'json').toLowerCase() === 'pg';
}

function key(name: string): string {
  return `gs:${name}`;
}

/** Synchronous read — returns cached value or fallback until hydrated. */
export function gsGet<T = any>(name: string, fallback: T): T {
  return (cache.has(key(name)) ? cache.get(key(name)) : fallback) as T;
}

/** Write-through: update cache now, persist to PG in background. */
export function gsSet(name: string, value: any): void {
  const k = key(name);
  cache.set(k, value);
  if (!globalStoresEnabled()) return;
  const prev = pendingWrites.get(k) || Promise.resolve();
  const next = prev
    .then(() => query(
      `INSERT INTO system_settings(key, value, updated_at) VALUES($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [k, JSON.stringify(value ?? null)]
    ))
    .then(() => undefined)
    .catch((e) => console.error(`[globalStores] persist '${name}' failed:`, e?.message || e));
  pendingWrites.set(k, next);
  void next.finally(() => { if (pendingWrites.get(k) === next) pendingWrites.delete(k); });
}

/**
 * Atomic read-modify-write for a gs:* blob. In pg mode the row is locked
 * with SELECT ... FOR UPDATE inside a transaction, so concurrent writers
 * serialize instead of last-writer-wins. Use for stores whose contents are
 * mutated incrementally (e.g. media_assets) where gsSet's whole-blob
 * write-through could drop records.
 */
export async function gsTransact<T>(name: string, fn: (current: T | undefined) => T): Promise<T> {
  const k = key(name);
  if (!globalStoresEnabled()) {
    const cur = cache.has(k) ? (cache.get(k) as T) : undefined;
    const next = fn(cur);
    cache.set(k, next);
    return next;
  }
  const next = await withTransaction(async (c) => {
    // Ensure the row exists so FOR UPDATE has something to lock.
    await c.query(
      `INSERT INTO system_settings(key, value, updated_at) VALUES($1, 'null'::jsonb, now()) ON CONFLICT (key) DO NOTHING`,
      [k]
    );
    const r = await c.query<{ value: T }>(`SELECT value FROM system_settings WHERE key=$1 FOR UPDATE`, [k]);
    const out = fn(r.rows[0]?.value);
    await c.query(
      `UPDATE system_settings SET value=$2::jsonb, updated_at=now() WHERE key=$1`,
      [k, JSON.stringify(out ?? null)]
    );
    return out;
  });
  cache.set(k, next);
  return next;
}

/** Hydrate all gs:* keys from PG into cache (skips keys with pending writes). */
export async function gsHydrate(): Promise<void> {
  if (!globalStoresEnabled()) return;
  try {
    const r = await query(`SELECT key, value FROM system_settings WHERE key LIKE 'gs:%'`);
    for (const row of r.rows) {
      if (pendingWrites.has(row.key)) continue; // local write in flight — don't clobber
      cache.set(row.key, row.value);
    }
  } catch (e: any) {
    console.error('[globalStores] hydrate failed:', e?.message || e);
  }
}

/** Periodic re-hydrate so cross-instance writes propagate. */
export function gsStartRefresh(): void {
  if (!globalStoresEnabled() || refreshTimer) return;
  refreshTimer = setInterval(() => { void gsHydrate(); }, REFRESH_MS);
  refreshTimer.unref?.();
}

/** Test hook. */
export function gsResetForTests(): void {
  cache.clear();
  pendingWrites.clear();
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}
