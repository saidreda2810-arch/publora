/**
 * WP11 — platform adapter dispatch tests (no network, no credentials).
 * Verifies honest failure paths: unknown platform → adapter_missing,
 * known platform without OAuth account → no_connected_account,
 * and that errors never fabricate success.
 */
import { publishToPlatform } from '../server/platformAdapters/index.ts';

let passed = 0, failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  [PASS] ${msg}`); }
  else { failed++; console.log(`  [FAIL] ${msg}`); }
}

const post = { id: 'p1', brandId: 'brand-x', channelPlatforms: ['youtube'], videoId: 'vid-x' };
const wsData = { videos: [], accounts: [] };

// 1. Unknown platform → adapter_missing
{
  const r = await publishToPlatform({ ...post, channelPlatforms: ['myspace'] } as any, wsData, 'myspace');
  assert(r.ok === false && r.error === 'adapter_missing', `unknown platform → adapter_missing (got ${r.error})`);
}

// 2. YouTube without OAuth account → no_connected_account (never fake success)
{
  const r = await publishToPlatform(post, wsData, 'youtube');
  assert(r.ok === false && r.error === 'no_connected_account', `youtube w/o account → no_connected_account (got ${r.error})`);
  assert(!r.platformPostId, 'no platformPostId fabricated');
}

// 3. TikTok same
{
  const r = await publishToPlatform({ ...post, channelPlatforms: ['tiktok'] } as any, wsData, 'tiktok');
  assert(r.ok === false && r.error === 'no_connected_account', `tiktok w/o account → no_connected_account (got ${r.error})`);
}

// 4. Meta (facebook) same
{
  const r = await publishToPlatform({ ...post, channelPlatforms: ['facebook'] } as any, wsData, 'facebook');
  assert(r.ok === false, `facebook w/o account fails honestly (got ${r.error})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
