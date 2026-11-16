/**
 * WP1 ingress tests — media-in-DB blocking.
 * Run: npx tsx tests/wp1-ingress.test.mts
 */
import assert from 'node:assert/strict';
import { findMediaViolations, findTopLevelMediaViolations, isDataUrlString, MAX_MEDIA_FIELD_CHARS } from '../server/mediaIngress';

let passed = 0, failed = 0;
async function t(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  [PASS] ${name}`); }
  catch (e) { failed++; console.log(`  [FAIL] ${name}: ${(e as Error).message}`); }
}

const BIG = 'x'.repeat(MAX_MEDIA_FIELD_CHARS + 1);
const DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

console.log('WP1 media ingress tests');

await t('rejects data: URL in brand logoUrl', () => {
  const v = findTopLevelMediaViolations({ name: 'B', logoUrl: DATA_URL });
  assert.ok(v.length > 0);
});

await t('rejects data: URL in nested state brands[]', () => {
  const v = findMediaViolations({ brands: [{ id: 'b1', avatarUrl: DATA_URL }] }, { brands: [] });
  assert.ok(v.length > 0);
});

await t('allows unchanged legacy data: URL (grandfathered)', () => {
  const prev = { brands: [{ id: 'b1', logoUrl: DATA_URL, name: 'X' }] };
  const next = { brands: [{ id: 'b1', logoUrl: DATA_URL, name: 'X2' }] };
  const v = findMediaViolations(next, prev);
  assert.equal(v.length, 0);
});

await t('rejects CHANGED data: URL even if record existed', () => {
  const prev = { brands: [{ id: 'b1', logoUrl: 'https://cdn.example.com/a.png' }] };
  const next = { brands: [{ id: 'b1', logoUrl: DATA_URL }] };
  const v = findMediaViolations(next, prev);
  assert.ok(v.length > 0);
});

await t('rejects oversized string in image field', () => {
  const v = findTopLevelMediaViolations({ coverImageUrl: BIG });
  assert.ok(v.length > 0);
});

await t('allows long string in non-media field', () => {
  const v = findTopLevelMediaViolations({ brandGuidelines: BIG });
  assert.equal(v.length, 0);
});

await t('allows normal https URL in media field', () => {
  const v = findTopLevelMediaViolations({ logoUrl: 'https://example.com/logo.png' });
  assert.equal(v.length, 0);
});

await t('allows relative /uploads path', () => {
  const v = findTopLevelMediaViolations({ avatarUrl: '/uploads/abc.jpg' });
  assert.equal(v.length, 0);
});

await t('data: URL detection requires mime shape (prose safe)', () => {
  assert.equal(isDataUrlString('data: is a prefix'), false);
  assert.equal(isDataUrlString('Please use data: carefully'), false);
  assert.equal(isDataUrlString(DATA_URL), true);
});

await t('rejects data: in user avatarUrl via profile body', () => {
  const v = findTopLevelMediaViolations({ avatarUrl: DATA_URL, fullName: 'A' });
  assert.ok(v.length > 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
