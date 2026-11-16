/**
 * WP1 StorageProvider contract tests — LocalStorageProvider.
 * S3StorageProvider requires @aws-sdk/* + a live endpoint (MinIO/R2): not
 * installed/tested in this environment — marked "اتنفذ ومااتختبرش".
 * Run: npx tsx tests/wp1-storage.test.mts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LocalStorageProvider } from '../server/storage/storageProvider';

let passed = 0, failed = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  [PASS] ${name}`); }
  catch (e) { failed++; console.log(`  [FAIL] ${name}: ${(e as Error).message}`); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wp1-store-'));
const store = new LocalStorageProvider(tmp);

console.log('WP1 StorageProvider contract tests (Local)');

await t('put + head + getStream round-trip', async () => {
  const body = Buffer.from('hello-storage');
  await store.put('ws1/media/abc.png', body, 'image/png');
  const h = await store.head('ws1/media/abc.png');
  assert.equal(h?.size, body.length);
  const stream = await store.getStream('ws1/media/abc.png');
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  assert.equal(Buffer.concat(chunks).toString(), 'hello-storage');
});

await t('head returns null for missing key', async () => {
  assert.equal(await store.head('nope/missing.bin'), null);
});

await t('delete removes object', async () => {
  await store.put('tmp/x.bin', Buffer.from('x'));
  await store.delete('tmp/x.bin');
  assert.equal(await store.head('tmp/x.bin'), null);
});

await t('signedUrl returns stable local path', async () => {
  const url = await store.signedUrl('ws1/media/abc.png', 900);
  assert.ok(url.includes('ws1'));
});

await t('list returns keys under prefix', async () => {
  await store.put('ws1/a/1.txt', Buffer.from('1'));
  await store.put('ws1/a/2.txt', Buffer.from('2'));
  await store.put('ws2/b/3.txt', Buffer.from('3'));
  const keys = await store.list('ws1/a');
  assert.deepEqual(keys.sort(), ['ws1/a/1.txt', 'ws1/a/2.txt']);
});

await t('path traversal key rejected', async () => {
  await assert.rejects(() => store.put('../escape.txt', Buffer.from('x')));
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
