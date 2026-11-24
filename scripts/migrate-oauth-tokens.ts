/**
 * scripts/migrate-oauth-tokens.ts — re-encrypt stored OAuth tokens from the
 * legacy AES-256-CBC format to the AES-256-GCM v2 envelope.
 *
 * Usage:
 *   npx tsx scripts/migrate-oauth-tokens.ts --dry-run   # counts only, no writes
 *   npx tsx scripts/migrate-oauth-tokens.ts             # perform migration
 *
 * Covers: oauth_accounts (access/refresh tokens + channel pageAccessToken)
 * and drive_connections (access/refresh tokens). Prints counts only — never
 * token values. Undecryptable records are left untouched and reported.
 */
import '../server/env.ts';
import { gsHydrate, gsGet, gsSet, globalStoresEnabled } from '../server/globalStores.ts';
import { migrateTokenToV2, decryptToken } from '../server/oauthStore.ts';
import * as fs from 'fs';
import * as path from 'path';

const DRY = process.argv.includes('--dry-run');

interface Stats { scanned: number; v1: number; migrated: number; alreadyV2: number; undecryptable: number; }

function bumpFields(obj: any, fields: string[], st: Stats, apply: (k: string, v: string) => void) {
  for (const f of fields) {
    const v = obj?.[f];
    if (typeof v !== 'string' || !v) continue;
    st.scanned++;
    if (v.startsWith('{')) { st.alreadyV2++; continue; }
    st.v1++;
    if (!decryptToken(v)) { st.undecryptable++; continue; }
    if (!DRY) apply(f, migrateTokenToV2(v));
    st.migrated++;
  }
}

async function main() {
  if (!globalStoresEnabled()) {
    console.error('DB_DRIVER=pg required — JSON-file stores are migrated by rewriting files directly (not covered here).');
    process.exit(2);
  }
  await gsHydrate();

  const st: Stats = { scanned: 0, v1: 0, migrated: 0, alreadyV2: 0, undecryptable: 0 };

  // oauth_accounts
  const accounts: any[] = gsGet('oauth_accounts', []) || [];
  for (const acc of accounts) {
    bumpFields(acc, ['accessTokenEncrypted', 'refreshTokenEncrypted'], st, (k, v) => { acc[k] = v; });
    for (const ch of acc.channels || []) {
      bumpFields(ch, ['pageAccessToken'], st, (k, v) => { ch[k] = v; });
    }
  }
  if (!DRY && st.v1) gsSet('oauth_accounts', accounts);

  // drive_connections
  const conns: any[] = gsGet('drive_connections', []) || [];
  for (const conn of conns) {
    bumpFields(conn, ['accessTokenEncrypted', 'refreshTokenEncrypted'], st, (k, v) => { conn[k] = v; });
  }
  if (!DRY && conns.length) gsSet('drive_connections', conns);

  console.log(`${DRY ? '[dry-run] ' : ''}token fields scanned=${st.scanned} v1=${st.v1} migrated=${st.migrated} alreadyV2=${st.alreadyV2} undecryptable=${st.undecryptable}`);
  if (st.undecryptable) console.log('WARNING: undecryptable records left untouched — they will need re-connection.');
  process.exit(0);
}

main().catch((e) => { console.error('migration failed:', e?.message || e); process.exit(1); });
