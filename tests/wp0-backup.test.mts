/**
 * WP0 backup-script tests. Run: npx tsx tests/wp0-backup.test.mts
 * Uses only temp fixture dirs — never touches real data/.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { runBackup, listBackups } from '../scripts/backup-data';

let passed = 0;
let failed = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  [PASS] ${name}`); }
  catch (e) { failed++; console.log(`  [FAIL] ${name}: ${(e as Error).message}`); }
}

function makeFixture(): { src: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wp0-bk-'));
  const src = path.join(root, 'data');
  fs.mkdirSync(path.join(src, 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(src, 'saas_db.json'), JSON.stringify({ users: [{ id: 'u1' }], sessions: [], workspaces: [{ id: 'w1' }], workspaceData: { w1: {} }, auditLogs: [], securityEvents: [] }));
  fs.writeFileSync(path.join(src, 'media_catalog.json'), '[]');
  fs.writeFileSync(path.join(src, 'uploads', 'a.jpg'), Buffer.alloc(1024, 1));
  fs.writeFileSync(path.join(src, 'saas_db.json.tmp.1234567890'), '{"stale":true}');
  fs.writeFileSync(path.join(src, 'saas_db.json.tmp.1234567891'), '{"stale":2}');
  return { src, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

console.log('WP0 backup script tests');

await t('creates archive dir with data copy + manifest', () => {
  const { src, cleanup } = makeFixture();
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'wp0-bkd-'));
  try {
    const r = runBackup({ sourceDir: src, destDir: dest, compress: false });
    assert.ok(fs.existsSync(path.join(r.archiveDir, 'manifest.json')));
    assert.ok(fs.existsSync(path.join(r.archiveDir, 'data', 'saas_db.json')));
    assert.ok(fs.existsSync(path.join(r.archiveDir, 'data', 'uploads', 'a.jpg')));
    assert.equal(r.manifest.fileCount, 3); // saas_db + catalog + upload (2 tmps excluded)
    assert.equal(r.manifest.excludedTmpFiles, 2);
    assert.equal(r.manifest.dbCounts?.users, 1);
    assert.equal(r.manifest.dbCounts?.workspaces, 1);
  } finally { cleanup(); fs.rmSync(dest, { recursive: true, force: true }); }
});

await t('manifest sha256 verifies against copied file', () => {
  const { src, cleanup } = makeFixture();
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'wp0-bkd-'));
  try {
    const r = runBackup({ sourceDir: src, destDir: dest, compress: false });
    const entry = r.manifest.files.find((f) => f.path === 'saas_db.json')!;
    const copied = fs.readFileSync(path.join(r.archiveDir, 'data', 'saas_db.json'));
    assert.equal(crypto.createHash('sha256').update(copied).digest('hex'), entry.sha256);
  } finally { cleanup(); fs.rmSync(dest, { recursive: true, force: true }); }
});

await t('retention keeps only N newest archives', () => {
  const { src, cleanup } = makeFixture();
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'wp0-bkd-'));
  try {
    // seed 5 old archives with sortable timestamped names
    for (let i = 0; i < 5; i++) {
      const d = path.join(dest, `publora-data-2020010${i}-000000`);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'marker.txt'), String(i));
    }
    const r = runBackup({ sourceDir: src, destDir: dest, compress: false, keep: 3 });
    const remaining = fs.readdirSync(dest).filter((n) => n.startsWith('publora-data-'));
    assert.equal(remaining.length, 3, `expected 3 archives, got ${remaining.length}`);
    assert.ok(remaining.includes(path.basename(r.archiveDir)), 'newest archive retained');
    assert.ok(!remaining.includes('publora-data-20200100-000000'), 'oldest pruned');
    assert.ok(r.pruned.length === 3, `expected 3 pruned, got ${r.pruned.length}`);
  } finally { cleanup(); fs.rmSync(dest, { recursive: true, force: true }); }
});

await t('compressed tarball is created when compress=true and tar exists', () => {
  const { src, cleanup } = makeFixture();
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'wp0-bkd-'));
  try {
    const r = runBackup({ sourceDir: src, destDir: dest, compress: true });
    if (r.archiveFile) {
      assert.ok(fs.existsSync(r.archiveFile));
      assert.ok(r.archiveFile.endsWith('.tar.gz') || r.archiveFile.endsWith('.tar.gz.enc'));
      assert.ok(!fs.existsSync(r.archiveDir), 'staging dir removed after compression');
    } else {
      console.log('    (tar unavailable — skipped compress assertion)');
    }
  } finally { cleanup(); fs.rmSync(dest, { recursive: true, force: true }); }
});

await t('missing source dir throws', () => {
  assert.throws(() => runBackup({ sourceDir: '/nonexistent-path-xyz', destDir: os.tmpdir(), compress: false }));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
