/**
 * seed-global-stores.mts — one-time import of legacy JSON file stores into
 * PostgreSQL system_settings (gs:* keys) for DB_DRIVER=pg deployments.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/seed-global-stores.mts [--force]
 *
 * Idempotent: skips gs:* keys that already exist unless --force is passed.
 * Only imports files that exist; absent files are skipped (defaults apply).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { query, getPool } from '../server/db/client.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const FORCE = process.argv.includes('--force');

function readJson(file: string): any {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return undefined;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return undefined; }
}

/** Map legacy media_catalog.json entries to MediaAssetRecord shape
 *  (same mapping as mediaAssets.ts legacy import). */
function legacyCatalogToAssets(catalog: any[]): any[] {
  return catalog.map((m: any) => ({
    id: m.id || `med_${crypto.randomUUID()}`,
    workspaceId: m.workspaceId,
    userId: m.userId,
    storageKey: `legacy/${m.filename || m.id}`,
    sha256: '',
    mimeType: m.mimeType,
    sizeBytes: m.sizeBytes || 0,
    status: 'active',
    originalName: m.originalName,
    filename: m.filename,
    url: m.url,
    createdBy: m.userId,
    createdAt: m.createdAt,
    deletedAt: null,
  }));
}

async function upsert(key: string, value: any): Promise<'inserted' | 'skipped'> {
  if (!FORCE) {
    const existing = await query(`SELECT 1 FROM system_settings WHERE key=$1`, [key]);
    if (existing.rowCount) return 'skipped';
  }
  await query(
    `INSERT INTO system_settings(key, value, updated_at) VALUES($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value ?? null)]
  );
  return 'inserted';
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const saasDb = readJson('saas_db.json');
  const sources: [string, any][] = [
    ['gs:system_settings', saasDb?.systemSettings],
    ['gs:upload_policy', readJson('upload_policy.json')],
    ['gs:oauth_config', readJson('oauth_config.json')],
    ['gs:oauth_accounts', readJson('social_connections.json')],
    ['gs:media_assets', readJson('media_assets.json') ?? legacyCatalogToAssets(readJson('media_catalog.json') || [])],
    ['gs:drive_connections', readJson('drive_connections.json')],
    ['gs:drive_imports', readJson('drive_imports.json')],
    ['gs:automation_approvals', readJson('automation_approvals.json')],
  ];

  for (const [key, value] of sources) {
    if (value === undefined) {
      console.log(`SKIP ${key} — no source file`);
      continue;
    }
    const result = await upsert(key, value);
    console.log(`${result === 'inserted' ? 'INSERT' : 'SKIP(existing)'} ${key}`);
  }

  await getPool().end();
}

main().catch((e) => { console.error(e); process.exit(1); });
