import assert from 'node:assert/strict';
process.env.SRA_DATA_DIR = process.env.TEMP + '/wp4-parity/data';
process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/publora_scratch';
const { createJsonRepos } = await import('../server/repos/jsonRepo.ts');
const { createPgRepos } = await import('../server/repos/pgRepo.ts');
let p=0,f=0; const t=async(n:string,fn:()=>Promise<void>)=>{try{await fn();p++;console.log('  [PASS]',n)}catch(e){f++;console.log('  [FAIL]',n,(e as Error).message)}};
console.log('WP4 parity smoke (json vs pg-scratch)');
await t('users.findByEmail resolves on both', async()=>{
  const j=createJsonRepos(), g=createPgRepos();
  const email=(j as any); // get an email from json db
  const db=(await import('../server/saasDb.ts')).getDb();
  const e=db.users[0].email;
  const a=await j.users.findByEmail(e), b=await g.users.findByEmail(e);
  assert.ok(a&&b); assert.equal(a!.email.toLowerCase(),b!.email.toLowerCase());
});
await t('sessions create/find/delete roundtrip pg', async()=>{
  const g=createPgRepos(); const db=(await import('../server/saasDb.ts')).getDb();
  const uid=db.users[0].id;
  const s=await g.sessions.create(uid,{ip:'1.2.3.4',userAgent:'t'});
  const f2=await g.sessions.findByToken((s as any).token);
  assert.ok(f2); await g.sessions.delete((s as any).token);
  assert.equal(await g.sessions.findByToken((s as any).token),undefined);
});
await t('workspaceState CAS: stale version rejected', async()=>{
  const g=createPgRepos(); const {query}=await import('../server/db/client.ts'); const wid=(await query('SELECT legacy_id FROM workspaces WHERE legacy_id IS NOT NULL LIMIT 1')).rows[0].legacy_id;
  const v=await g.workspaceState.getVersion(wid);
  const ok=await g.workspaceState.save(wid,{__probe:{a:1}} as any,v);
  const stale=await g.workspaceState.save(wid,{__probe:{a:2}} as any,v);
  assert.equal(ok,true); assert.equal(stale,false);
});
await t('authTokens create/find/consume pg', async()=>{
  const g=createPgRepos();
  const tok='testtok_'+Date.now();
  const crypto=await import('node:crypto');
  const h=crypto.createHash('sha256').update(tok).digest('hex');
  const rec=await g.authTokens.create({type:'magic_link',tokenHash:h,expiresAt:new Date(Date.now()+60000).toISOString(),attempts:0} as any);
  const f2=await g.authTokens.findValid('magic_link',h);
  assert.ok(f2); await g.authTokens.consume((rec as any).id);
  assert.equal(await g.authTokens.findValid('magic_link',h),undefined);
});
await t('brands CRUD parity json+pg', async()=>{
  const j=createJsonRepos(), g=createPgRepos();
  const {query}=await import('../server/db/client.ts');
  const wid=(await import('../server/saasDb.ts')).getDb().workspaces[0].id;
  const jb=await j.brands.create(wid,{name:'ParityBrand_'+Date.now(),status:'active'});
  assert.ok(await j.brands.findById(wid,jb.id));
  const pgwid=(await query('SELECT legacy_id FROM workspaces WHERE legacy_id IS NOT NULL LIMIT 1')).rows[0].legacy_id;
  const gb=await g.brands.create(pgwid,{name:'ParityBrandPg_'+Date.now(),status:'active'});
  assert.ok((await g.brands.list(pgwid)).length>=1);
  assert.ok(await g.brands.update(pgwid,(gb as any).legacy_id||(gb as any).id,{name:'Renamed_'+Date.now()}));
});
await t('automationWorkflows CRUD pg', async()=>{
  const g=createPgRepos();
  const {query}=await import('../server/db/client.ts');
  const pgwid=(await query('SELECT legacy_id FROM workspaces WHERE legacy_id IS NOT NULL LIMIT 1')).rows[0].legacy_id;
  const w=await g.automationWorkflows.create(pgwid,{name:'wf_'+Date.now(),trigger:{type:'manual'},steps:[],status:'active'});
  assert.ok(w); assert.ok((await g.automationWorkflows.list(pgwid)).length>=1);
});
await t('posts.targets.claimDue pg SKIP LOCKED', async()=>{
  const g=createPgRepos(); assert.ok(Array.isArray(await g.posts.targets.claimDue('w1',5)));
});
console.log(`\n${p} passed, ${f} failed`); process.exit(f?1:0);
