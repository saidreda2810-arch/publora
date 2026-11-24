import assert from 'node:assert/strict';
import fs from 'node:fs';
process.env.SRA_DATA_DIR = process.env.TEMP + '/wp8-tenant/data';
process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/publora_scratch';
const { createPgRepos } = await import('../server/repos/pgRepo.ts');
const { query } = await import('../server/db/client.ts');
let p = 0, f = 0;
const t = async (n: string, fn: () => Promise<void>) => {
  try { await fn(); p++; console.log('  [PASS]', n); }
  catch (e) { f++; console.log('  [FAIL]', n, (e as Error).message); }
};
console.log('WP8 tenant isolation + facade golden (pg-scratch)');

const wsRows = (await query(
  "SELECT legacy_id FROM workspaces WHERE legacy_id IS NOT NULL ORDER BY legacy_id LIMIT 2"
)).rows;
assert.ok(wsRows.length >= 2, 'need >=2 migrated workspaces in scratch');
const [wsA, wsB] = wsRows.map((r: any) => r.legacy_id as string);
const g = createPgRepos();
const uniq = Date.now().toString(36);

await t('tenant isolation: brand in wsA invisible to wsB facade', async () => {
  const brand = await g.brands.create(wsA, { name: `IsoBrand_${uniq}`, status: 'active' });
  const a = await g.workspaceState.get(wsA);
  const b = await g.workspaceState.get(wsB);
  assert.ok((a.brands || []).some((x: any) => x.id === (brand as any).legacy_id || x.id === (brand as any).id), 'wsA facade missing brand');
  assert.ok(!(b.brands || []).some((x: any) => x.name === `IsoBrand_${uniq}`), 'wsB facade leaked wsA brand');
});

await t('golden roundtrip: save collections+kv, read back identical', async () => {
  const before = await g.workspaceState.get(wsA);
  const v = await g.workspaceState.getVersion(wsA);
  const payload: any = {
    brands: [...(before.brands || []), { id: `gold_${uniq}`, name: `Gold_${uniq}`, status: 'active' }],
    posts: [...(before.posts || []), { id: `post_${uniq}`, title: 'gold', brandId: `gold_${uniq}`, status: 'draft', scheduledTime: null }],
    __wp8probe: { marker: uniq },
  };
  assert.equal(await g.workspaceState.save(wsA, payload, v), true);
  const after = await g.workspaceState.get(wsA);
  assert.ok((after.brands || []).some((x: any) => x.id === `gold_${uniq}`), 'brand missing after save');
  assert.ok((after.posts || []).some((x: any) => x.id === `post_${uniq}`), 'post missing after save');
  assert.equal((after as any).__wp8probe?.marker, uniq, 'kv key missing after save');
  assert.equal(await g.workspaceState.getVersion(wsA), v + 1, 'version not incremented');
});

await t('CAS: stale version rejected on second save', async () => {
  const v = await g.workspaceState.getVersion(wsA);
  assert.equal(await g.workspaceState.save(wsA, { __wp8probe: { marker: 'x' } } as any, v), true);
  assert.equal(await g.workspaceState.save(wsA, { __wp8probe: { marker: 'y' } } as any, v), false, 'stale save accepted');
});

await t('cross-tenant write: wsB version/data unaffected by wsA saves', async () => {
  const vb = await g.workspaceState.getVersion(wsB);
  const b = await g.workspaceState.get(wsB);
  const probe = `bprobe_${uniq}`;
  await g.workspaceState.save(wsA, { __wp8probe: { marker: probe } } as any, await g.workspaceState.getVersion(wsA));
  const b2 = await g.workspaceState.get(wsB);
  assert.equal(await g.workspaceState.getVersion(wsB), vb, 'wsB version changed');
  assert.ok(!(b2 as any).__wp8probe || (b2 as any).__wp8probe.marker !== probe, 'wsB kv leaked wsA write');
  assert.ok(b, 'wsB facade readable');
});

await t('static: entity routes use stateGet/stateSave, no direct blob writes', async () => {
  const src = fs.readFileSync(new URL('../server/saasRouter.ts', import.meta.url), 'utf8');
  const lines = src.split('\n');
  // helper block is lines ~53-72 (stateGet/stateVersion/stateSave)
  const helperStart = lines.findIndex((l) => l.includes('async function stateGet'));
  const helperEnd = lines.findIndex((l, i) => i > helperStart && l.includes('async function saveOrConflict'));
  const outside = lines.filter((l, i) =>
    i < helperStart || i > helperEnd
  ).join('\n');
  assert.ok(!/saveWorkspaceData\(/.test(outside), 'saveWorkspaceData called outside helpers');
  assert.ok(!/getWorkspaceStateVersion\(/.test(outside), 'getWorkspaceStateVersion called outside helpers');
  const getCalls = (outside.match(/getWorkspaceData\(/g) || []).length;
  assert.equal(getCalls, 0, 'getWorkspaceData called outside helpers');
  assert.ok((outside.match(/await stateGet\(/g) || []).length > 20, 'expected widespread stateGet usage');
});

console.log(`\n${p} passed, ${f} failed`);
process.exit(f ? 1 : 0);
