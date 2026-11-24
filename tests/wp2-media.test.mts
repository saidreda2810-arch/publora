/**
 * WP2 media_assets tests — store, dedupe, signed URLs, quota, delete guard.
 * Uses SRA_DATA_DIR + STORAGE_LOCAL_DIR temp dirs — never touches real data/.
 * Run: npx tsx tests/wp2-media.test.mts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wp2-media-'));
process.env.SRA_DATA_DIR = path.join(tmp, 'data');
process.env.STORAGE_LOCAL_DIR = path.join(tmp, 'storage');
process.env.MEDIA_SIGNING_SECRET = 'test-secret';

const { createAsset, findBySha256, listAssets, softDeleteAsset, usageBytes, videoCount, signMediaKey, verifyMediaSignature, assetPublicUrl, orphanReport, resetMediaAssetsForTests } = await import('../server/mediaAssets.ts');
const { LocalStorageProvider } = await import('../server/storage/storageProvider.ts');
const crypto = await import('node:crypto');

let passed = 0, failed = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  [PASS] ${name}`); }
  catch (e) { failed++; console.log(`  [FAIL] ${name}: ${(e as Error).message}`); }
}

const store = new LocalStorageProvider(process.env.STORAGE_LOCAL_DIR!);
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

console.log('WP2 media_assets tests');

await t('createAsset + listAssets + usageBytes', async () => {
  resetMediaAssetsForTests();
  const key = 'ws/w1/media/' + sha('a') + '.png';
  await store.put(key, Buffer.from('aaa'));
  await createAsset({ workspaceId: 'w1', userId: 'u1', storageKey: key, sha256: sha('a'), mimeType: 'image/png', sizeBytes: 3, originalName: 'a.png' });
  assert.equal(listAssets('w1').length, 1);
  assert.equal(usageBytes('w1'), 3);
});

await t('dedupe: findBySha256 returns existing', async () => {
  const found = findBySha256('w1', sha('a'));
  assert.ok(found);
  assert.equal(found!.storageKey, 'ws/w1/media/' + sha('a') + '.png');
});

await t('signed URL verifies; tampered sig rejected; expired rejected', async () => {
  const key = 'ws/w1/media/x.png';
  const url = signMediaKey(key, 900);
  const params = new URL('http://x' + url).searchParams;
  assert.ok(verifyMediaSignature(key, Number(params.get('exp')), params.get('sig')!));
  assert.ok(!verifyMediaSignature(key, Number(params.get('exp')), 'bad'));
  assert.ok(!verifyMediaSignature(key, Math.floor(Date.now() / 1000) - 10, params.get('sig')!));
});

await t('assetPublicUrl returns signed path for new assets', async () => {
  const rec = listAssets('w1')[0];
  const url = assetPublicUrl(rec);
  assert.ok(url.startsWith('/api/media/object?key='));
});

await t('softDelete excludes from list + usage', async () => {
  const rec = listAssets('w1')[0];
  await softDeleteAsset(rec.id);
  assert.equal(listAssets('w1').length, 0);
  assert.equal(usageBytes('w1'), 0);
  assert.equal(listAssets('w1', true).length, 1);
});

await t('videoCount counts only video mime', async () => {
  resetMediaAssetsForTests();
  await createAsset({ workspaceId: 'w2', userId: 'u1', storageKey: 'ws/w2/media/v.mp4', sha256: sha('v'), mimeType: 'video/mp4', sizeBytes: 10 });
  await createAsset({ workspaceId: 'w2', userId: 'u1', storageKey: 'ws/w2/media/i.png', sha256: sha('i'), mimeType: 'image/png', sizeBytes: 5 });
  assert.equal(videoCount('w2'), 1);
  assert.equal(usageBytes('w2'), 15);
});

await t('orphanReport detects object without asset row', async () => {
  await store.put('ws/w2/media/orphan.bin', Buffer.from('x'));
  const report = await orphanReport();
  assert.ok(report.orphanObjects.includes('ws/w2/media/orphan.bin'));
});

await t('quota: atomic check rejects over-quota insert', async () => {
  resetMediaAssetsForTests();
  await createAsset({ workspaceId: 'wq', userId: 'u1', storageKey: 'ws/wq/media/a.bin', sha256: sha('qa'), mimeType: 'video/mp4', sizeBytes: 8 });
  let threw = false;
  try {
    await createAsset({ workspaceId: 'wq', userId: 'u1', storageKey: 'ws/wq/media/b.bin', sha256: sha('qb'), mimeType: 'video/mp4', sizeBytes: 5 }, { quotaBytes: 10 });
  } catch (e: any) { threw = e?.code === 'QUOTA_EXCEEDED'; }
  assert.ok(threw, 'over-quota insert must throw QUOTA_EXCEEDED');
  assert.equal(listAssets('wq').length, 1, 'rejected insert must not be cataloged');
  // Under-quota insert with room for exactly the remaining bytes succeeds.
  await createAsset({ workspaceId: 'wq', userId: 'u1', storageKey: 'ws/wq/media/c.bin', sha256: sha('qc'), mimeType: 'video/mp4', sizeBytes: 2 }, { quotaBytes: 10 });
  assert.equal(listAssets('wq').length, 2);
});

await t('tenant isolation: assets scoped by workspaceId', async () => {
  assert.equal(listAssets('w1').length, 0);
  assert.equal(listAssets('w2').length, 2);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
