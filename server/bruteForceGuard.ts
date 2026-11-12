import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { findUserByEmail, logAuditEvent } from './saasDb.ts';

// ============================================================================
// Brute-Force / Credential-Stuffing Protection Guard
// ----------------------------------------------------------------------------
// Storage: in-process atomic counters. This application is a single-instance
// Node.js service backed by a JSON file database (no Redis in this stack).
// If the deployment is ever scaled to multiple instances, this module MUST be
// backed by a shared store (e.g. Redis) — the record layout below is designed
// so that swap is contained to this file.
//
// Design notes:
//  - Two independent counters: per-IP and per-account (email).
//  - Privileged roles (admin and above) get stricter account thresholds.
//  - Restrictions are temporary, escalate on repeat offences, and are capped.
//  - Successful authentication clears the account counter and reduces the IP
//    counter — a shared/NAT IP is never fully reset by one user's success.
//  - No passwords, hashes, tokens, or secrets are ever logged or stored here.
//  - Emails are stored only as SHA-256 digests inside this module.
// ============================================================================

export interface BruteForceGuardConfig {
  enabled: boolean;
  // Per-account (email) thresholds
  accountMaxFailures: number;
  accountWindowMs: number;
  accountRestrictMs: number;
  // Per-IP thresholds
  ipMaxFailures: number;
  ipWindowMs: number;
  ipRestrictMs: number;
  // Stricter thresholds for privileged accounts (admin roles and above)
  adminAccountMaxFailures: number;
  // Escalation cap — restrictions can grow but never exceed this
  maxRestrictMs: number;
  // Progressive delay applied once an identity has recent failures
  progressiveDelayBaseMs: number;
  progressiveDelayMaxMs: number;
  progressiveDelayAfterFailures: number;
  // Behaviour when internal guard state fails: 'open' (allow, logged) or 'closed' (deny)
  failMode: 'open' | 'closed';
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw.toLowerCase() === 'true' || raw === '1';
}

export function loadGuardConfig(): BruteForceGuardConfig {
  const failMode = (process.env.BRUTE_FORCE_FAIL_MODE || 'open').toLowerCase();
  return {
    enabled: envBool('BRUTE_FORCE_ENABLED', true),
    accountMaxFailures: envInt('BRUTE_FORCE_ACCOUNT_MAX_FAILURES', 5),
    accountWindowMs: envInt('BRUTE_FORCE_ACCOUNT_WINDOW_MS', 10 * 60 * 1000),
    accountRestrictMs: envInt('BRUTE_FORCE_ACCOUNT_RESTRICT_MS', 15 * 60 * 1000),
    ipMaxFailures: envInt('BRUTE_FORCE_IP_MAX_FAILURES', 30),
    ipWindowMs: envInt('BRUTE_FORCE_IP_WINDOW_MS', 10 * 60 * 1000),
    ipRestrictMs: envInt('BRUTE_FORCE_IP_RESTRICT_MS', 30 * 60 * 1000),
    adminAccountMaxFailures: envInt('BRUTE_FORCE_ADMIN_MAX_FAILURES', 3),
    maxRestrictMs: envInt('BRUTE_FORCE_MAX_RESTRICT_MS', 2 * 60 * 60 * 1000),
    progressiveDelayBaseMs: envInt('BRUTE_FORCE_PROGRESSIVE_DELAY_MS', 250),
    progressiveDelayMaxMs: envInt('BRUTE_FORCE_PROGRESSIVE_DELAY_MAX_MS', 2000),
    progressiveDelayAfterFailures: envInt('BRUTE_FORCE_PROGRESSIVE_DELAY_AFTER', 3),
    failMode: failMode === 'closed' ? 'closed' : 'open',
  };
}

let config: BruteForceGuardConfig = loadGuardConfig();

// Allows tests / runtime reconfiguration without restarting.
export function configureBruteForceGuard(overrides: Partial<BruteForceGuardConfig>) {
  config = { ...config, ...overrides };
}

export function getBruteForceGuardConfig(): BruteForceGuardConfig {
  return { ...config };
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface GuardRecord {
  failures: number;
  firstFailureAt: number;
  lastFailureAt: number;
  restrictedUntil: number;
  restrictionStrikes: number;
}

const store = new Map<string, GuardRecord>();
const PRIVILEGED_ROLES = new Set(['god', 'super_admin', 'platform_admin', 'admin', 'moderator', 'support']);

function hashIdentity(value: string): string {
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex').slice(0, 32);
}

function getRecord(key: string): GuardRecord | undefined {
  return store.get(key);
}

function ensureRecord(key: string): GuardRecord {
  let rec = store.get(key);
  if (!rec) {
    rec = { failures: 0, firstFailureAt: 0, lastFailureAt: 0, restrictedUntil: 0, restrictionStrikes: 0 };
    store.set(key, rec);
  }
  return rec;
}

function pruneRecord(key: string, rec: GuardRecord, now: number) {
  const windowMs = Math.max(config.accountWindowMs, config.ipWindowMs);
  // Fully reset records that have been quiet for 3x the largest window.
  // lastFailureAt === 0 marks a freshly created record — never prune it here.
  if (rec.lastFailureAt > 0 && rec.failures === 0 && rec.restrictedUntil <= now && now - rec.lastFailureAt > windowMs * 3) {
    store.delete(key);
    return;
  }
  // Expire restriction once it has elapsed and failures window has passed
  if (rec.restrictedUntil > 0 && now >= rec.restrictedUntil) {
    rec.restrictedUntil = 0;
  }
}

// Periodic cleanup so the map cannot grow unboundedly under spray attacks
setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of store.entries()) {
    pruneRecord(key, rec, now);
    if (rec.failures === 0 && rec.restrictedUntil === 0) store.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

// ---------------------------------------------------------------------------
// Core operations (exported for unit tests)
// ---------------------------------------------------------------------------

export interface GuardIdentity {
  ip: string;
  email?: string;
}

function isPrivilegedEmail(email?: string): boolean {
  if (!email) return false;
  try {
    const user = findUserByEmail(email);
    return !!user && PRIVILEGED_ROLES.has(user.role);
  } catch {
    return false;
  }
}

function recordFailureFor(key: string, windowMs: number, maxFailures: number, restrictMs: number, now: number): { restricted: boolean; restrictUntil: number } {
  const rec = ensureRecord(key);
  pruneRecord(key, rec, now);

  // Slide the failure window
  if (now - rec.firstFailureAt > windowMs) {
    rec.failures = 0;
    rec.firstFailureAt = now;
  }
  if (rec.failures === 0) rec.firstFailureAt = now;

  rec.failures += 1;
  rec.lastFailureAt = now;

  if (rec.failures >= maxFailures && rec.restrictedUntil <= now) {
    rec.restrictionStrikes += 1;
    // Escalating restriction: base * 2^(strikes-1), capped
    const escalation = Math.min(restrictMs * Math.pow(2, rec.restrictionStrikes - 1), config.maxRestrictMs);
    rec.restrictedUntil = now + escalation;
    return { restricted: true, restrictUntil: rec.restrictedUntil };
  }
  return { restricted: false, restrictUntil: rec.restrictedUntil };
}

export function checkRestricted(identity: GuardIdentity): { restricted: boolean; retryAfterSeconds: number; scope: 'ip' | 'account' | null } {
  const now = Date.now();
  const ipKey = `ip:${identity.ip || 'unknown'}`;
  const acctKey = identity.email ? `acct:${hashIdentity(identity.email)}` : null;

  const ipRec = getRecord(ipKey);
  if (ipRec) {
    pruneRecord(ipKey, ipRec, now);
    if (ipRec.restrictedUntil > now) {
      return { restricted: true, retryAfterSeconds: Math.ceil((ipRec.restrictedUntil - now) / 1000), scope: 'ip' };
    }
  }
  if (acctKey) {
    const acctRec = getRecord(acctKey);
    if (acctRec) {
      pruneRecord(acctKey, acctRec, now);
      if (acctRec.restrictedUntil > now) {
        return { restricted: true, retryAfterSeconds: Math.ceil((acctRec.restrictedUntil - now) / 1000), scope: 'account' };
      }
    }
  }
  return { restricted: false, retryAfterSeconds: 0, scope: null };
}

export function failureCount(identity: GuardIdentity): { ip: number; account: number } {
  const now = Date.now();
  const ipRec = getRecord(`ip:${identity.ip || 'unknown'}`);
  const acctRec = identity.email ? getRecord(`acct:${hashIdentity(identity.email)}`) : undefined;
  if (ipRec) pruneRecord(`ip:${identity.ip || 'unknown'}`, ipRec, now);
  if (acctRec && identity.email) pruneRecord(`acct:${hashIdentity(identity.email)}`, acctRec, now);
  return { ip: ipRec?.failures ?? 0, account: acctRec?.failures ?? 0 };
}

function auditSecurityEvent(action: string, details: string, ip?: string, email?: string) {
  try {
    logAuditEvent({
      action,
      details,
      ip: ip || undefined,
      userEmail: email || undefined,
    });
  } catch (e) {
    console.error('[brute-force-guard] audit log failed:', e);
  }
}

export function recordAuthFailure(identity: GuardIdentity): { accountRestricted: boolean; ipRestricted: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const ip = identity.ip || 'unknown';
  const ipKey = `ip:${ip}`;
  const result = { accountRestricted: false, ipRestricted: false, retryAfterSeconds: 0 };

  try {
    const ipOutcome = recordFailureFor(ipKey, config.ipWindowMs, config.ipMaxFailures, config.ipRestrictMs, now);
    if (ipOutcome.restricted) {
      result.ipRestricted = true;
      result.retryAfterSeconds = Math.max(result.retryAfterSeconds, Math.ceil((ipOutcome.restrictUntil - now) / 1000));
      auditSecurityEvent('brute_force_ip_restricted', `IP temporarily restricted after repeated failed authentications.`, ip);
      console.warn(`[security] brute-force: IP restricted for ${Math.ceil((ipOutcome.restrictUntil - now) / 1000)}s`);
    }

    if (identity.email) {
      const privileged = isPrivilegedEmail(identity.email);
      const maxFailures = privileged ? config.adminAccountMaxFailures : config.accountMaxFailures;
      const acctKey = `acct:${hashIdentity(identity.email)}`;
      const acctOutcome = recordFailureFor(acctKey, config.accountWindowMs, maxFailures, config.accountRestrictMs, now);
      if (acctOutcome.restricted) {
        result.accountRestricted = true;
        result.retryAfterSeconds = Math.max(result.retryAfterSeconds, Math.ceil((acctOutcome.restrictUntil - now) / 1000));
        auditSecurityEvent(
          'brute_force_account_restricted',
          `Account temporarily restricted after repeated failed authentications${privileged ? ' (privileged role — stricter policy)' : ''}.`,
          ip,
          identity.email
        );
        console.warn(`[security] brute-force: account restricted for ${Math.ceil((acctOutcome.restrictUntil - now) / 1000)}s`);
      }
    }
  } catch (e) {
    console.error('[brute-force-guard] recordAuthFailure failed:', e);
  }

  return result;
}

export function recordAuthSuccess(identity: GuardIdentity) {
  try {
    const now = Date.now();
    const ipKey = `ip:${identity.ip || 'unknown'}`;

    // Clear the account counter entirely — legitimate user proved identity
    if (identity.email) {
      const acctKey = `acct:${hashIdentity(identity.email)}`;
      const acctRec = getRecord(acctKey);
      const hadFailures = acctRec ? acctRec.failures : 0;
      store.delete(acctKey);
      if (hadFailures >= config.progressiveDelayAfterFailures) {
        auditSecurityEvent('login_success_after_failures', 'Successful authentication after repeated prior failures.', identity.ip, identity.email);
      }
    }

    // Reduce (not clear) the IP counter — it may be shared via NAT/proxy
    const ipRec = getRecord(ipKey);
    if (ipRec && ipRec.failures > 0) {
      ipRec.failures = Math.max(0, ipRec.failures - 1);
      ipRec.lastFailureAt = now;
    }
  } catch (e) {
    console.error('[brute-force-guard] recordAuthSuccess failed:', e);
  }
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

const GENERIC_BLOCK_MESSAGE = 'Too many failed sign-in attempts. Please wait a few minutes and try again.';

function clientIp(req: Request): string {
  // req.ip respects app.set('trust proxy', ...) configured in server.ts.
  // X-Forwarded-For is only honoured when TRUST_PROXY is enabled.
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function requestEmail(req: Request): string | undefined {
  const body = req.body;
  if (body && typeof body === 'object') {
    const email = (body as any).email ?? (body as any).username;
    if (typeof email === 'string' && email.includes('@')) {
      return email.trim().toLowerCase();
    }
  }
  return undefined;
}

// Applies to credential-guessing endpoints. Inspects JSON responses so that
// failed credential checks (401/403) count as failures and successful
// authentications (2xx + success:true) reset counters — no handler changes
// needed at each call site.
export function bruteForceGuard(req: Request, res: Response, next: NextFunction) {
  if (!config.enabled) return next();

  try {
    const identity: GuardIdentity = { ip: clientIp(req), email: requestEmail(req) };

    const verdict = checkRestricted(identity);
    if (verdict.restricted) {
      res.setHeader('Retry-After', String(verdict.retryAfterSeconds));
      auditSecurityEvent('brute_force_blocked', `Blocked authentication attempt during active restriction (${verdict.scope}).`, identity.ip, identity.email);
      return res.status(429).json({
        success: false,
        error: GENERIC_BLOCK_MESSAGE,
        retryAfterSeconds: verdict.retryAfterSeconds,
      });
    }

    // Progressive delay: slow down repeat offenders before they reach the cap
    const counts = failureCount(identity);
    const recentFailures = Math.max(counts.ip, counts.account);
    let delayMs = 0;
    if (recentFailures >= config.progressiveDelayAfterFailures) {
      delayMs = Math.min(
        config.progressiveDelayBaseMs * (recentFailures - config.progressiveDelayAfterFailures + 1),
        config.progressiveDelayMaxMs
      );
    }

    // Wrap res.json once to classify the outcome
    const originalJson = res.json.bind(res);
    (res as any).json = (body: any) => {
      try {
        const status = res.statusCode;
        if (status === 401 || status === 403) {
          recordAuthFailure(identity);
        } else if (status >= 200 && status < 300 && body && body.success === true) {
          recordAuthSuccess(identity);
        }
      } catch (e) {
        console.error('[brute-force-guard] outcome classification failed:', e);
      }
      return originalJson(body);
    };

    if (delayMs > 0) {
      setTimeout(next, delayMs);
    } else {
      next();
    }
  } catch (e) {
    // Fail-safe: never take down authentication because of the guard itself.
    console.error('[brute-force-guard] middleware failure:', e);
    if (config.failMode === 'closed') {
      return res.status(503).json({ success: false, error: 'Authentication temporarily unavailable. Please try again shortly.' });
    }
    next();
  }
}

// Test helper — clears all in-memory guard state.
export function resetBruteForceGuardForTests() {
  store.clear();
}
