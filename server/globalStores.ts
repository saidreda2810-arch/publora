import { query } from './db/client.ts';

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
