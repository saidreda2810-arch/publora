import assert from 'node:assert/strict';
process.env.DATABASE_URL='postgres://postgres:postgres@localhost:5432/publora_scratch';
process.env.SHARED_STATE_DRIVER='pg';
const { pgRateLimit, pgBfRecordFailure, pgBfGet, pgBfDelete, pgStoreAttempt, pgGetAttempt, pgRemoveAttempt, sharedStateDriver } = await import('../server/sharedState.ts');
let p=0,f=0;const t=async(n:string,fn:()=>Promise<void>)=>{try{await fn();p++;console.log('  [PASS]',n)}catch(e){f++;console.log('  [FAIL]',n,(e as Error).message)}};
console.log('WP6 shared-state (pg) driver='+sharedStateDriver());
await t('rate limit allows then blocks at max', async()=>{
  const b='t_'+Date.now();
  for(let i=0;i<3;i++) assert.equal((await pgRateLimit(b,'k',60000,3)).allowed,true);
  const v=await pgRateLimit(b,'k',60000,3); assert.equal(v.allowed,false); assert.ok(v.retryAfterSec>0);
});
await t('brute force: failures escalate to restriction', async()=>{
  const id='ip:test_'+Date.now(); await pgBfDelete('ip',id);
  const now=Date.now();
  let last:any;
  for(let i=0;i<5;i++) last=await pgBfRecordFailure('ip',id,600000,5,900000,7200000,now+i);
  assert.equal(last.restricted,true); assert.ok(last.restrictUntil>now);
  const rec=await pgBfGet('ip',id); assert.ok(rec.failures>=5);
  await pgBfDelete('ip',id);
});
await t('oauth attempt store/get/remove roundtrip', async()=>{
  const st='st_'+Date.now();
  await pgStoreAttempt({id:'a1',provider:'youtube',state:st,brandId:'b1',redirectUri:'http://x/cb',createdAt:Date.now(),expiresAt:Date.now()+60000});
  const a=await pgGetAttempt(st); assert.ok(a); assert.equal(a!.provider,'youtube'); assert.equal(a!.brandId,'b1');
  await pgRemoveAttempt(st); assert.equal(await pgGetAttempt(st),undefined);
});
console.log(`\n${p} passed, ${f} failed`);process.exit(f?1:0);
