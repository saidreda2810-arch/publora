import assert from 'node:assert/strict';
process.env.SRA_DATA_DIR = process.env.TEMP + '/wp9-auth/data';
process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/publora_scratch';
process.env.DB_DRIVER = 'pg';
const { authStore, authDriver } = await import('../server/authStore.ts');
let p = 0, f = 0;
const t = async (n: string, fn: () => Promise<void>) => {
  try { await fn(); p++; console.log('  [PASS]', n); }
  catch (e) { f++; console.log('  [FAIL]', n, (e as Error).message); }
};
console.log(`WP9 authStore (${authDriver})`);
assert.equal(authDriver, 'pg');

const email = `wp9_${Date.now()}@test.dev`;
const password = 'testpass123';
let user: any, ws: any, session: any;

await t('registerUser creates user+workspace+member+token', async () => {
  const res: any = await (authStore as any).registerUser({ email, password, fullName: 'WP9 Tester' });
  user = res.user;
  assert.ok(user.id.startsWith('usr_'), 'legacy user id');
  assert.ok(res.verificationToken, 'verification token returned');
});

await t('findUserByEmail/Id roundtrip with credentials', async () => {
  const byEmail = await (authStore as any).findUserByEmail(email);
  assert.equal(byEmail.id, user.id);
  assert.ok(byEmail.passwordHash && byEmail.salt, 'credentials present for login');
  const byId = await (authStore as any).findUserById(user.id);
  assert.equal(byId.email, email);
});

await t('getUserWorkspaces returns default workspace', async () => {
  const wss = await (authStore as any).getUserWorkspaces(user.id);
  assert.ok(wss.length >= 1, 'at least one workspace');
  ws = wss[0];
  assert.equal(ws.ownerId, user.id);
  assert.ok(ws.settings && typeof ws.settings === 'object', 'settings object');
});

await t('createSession/findSessionByToken/deleteSession', async () => {
  session = await (authStore as any).createSession(user.id, { ip: '203.0.113.9', userAgent: 'wp9-test' });
  assert.ok(session.token, 'raw token returned once');
  const found = await (authStore as any).findSessionByToken(session.token);
  assert.ok(found, 'session found by token');
  assert.equal(found.userId, user.id);
  await (authStore as any).deleteSession(session.token);
  assert.equal(await (authStore as any).findSessionByToken(session.token), undefined, 'session revoked');
});

await t('listUserSessions + revokeOtherSessions', async () => {
  const s1 = await (authStore as any).createSession(user.id, {});
  const s2 = await (authStore as any).createSession(user.id, {});
  const list = await (authStore as any).listUserSessions(user.id);
  assert.ok(list.length >= 2, 'sessions listed');
  const revoked = await (authStore as any).revokeOtherSessions(user.id, s1.id);
  assert.ok(revoked >= 1, 'others revoked');
  assert.ok(await (authStore as any).findSessionByToken(s1.token), 'current kept');
  assert.equal(await (authStore as any).findSessionByToken(s2.token), undefined, 'other revoked');
});

await t('auth token lifecycle: create/find/markUsed', async () => {
  const crypto = await import('node:crypto');
  const raw = 'rawtoken_' + Date.now();
  const hash = crypto.createHash('sha256').update(raw.trim()).digest('hex');
  const rec = await (authStore as any).createAuthToken({ type: 'password_reset', tokenHash: hash, userId: user.id, expiresAt: new Date(Date.now() + 3600e3).toISOString() });
  const found = await (authStore as any).findAuthToken('password_reset', raw);
  assert.ok(found, 'token found by raw secret');
  assert.equal(found.id, rec.id);
  await (authStore as any).markAuthTokenUsed(rec.id);
  assert.equal(await (authStore as any).findAuthToken('password_reset', raw), undefined, 'used token not returned');
});

await t('magic_link token keyed by email + attempt bump', async () => {
  const mEmail = `magic_${Date.now()}@test.dev`;
  await (authStore as any).invalidateUnusedByEmail('magic_link', mEmail);
  const rec = await (authStore as any).createAuthToken({ type: 'magic_link', tokenHash: 'h_' + Date.now(), userId: mEmail, email: mEmail, expiresAt: new Date(Date.now() + 600e3).toISOString(), attempts: 0 });
  const latest = await (authStore as any).latestAuthTokenByEmail('magic_link', mEmail);
  assert.equal(latest.id, rec.id);
  const n = await (authStore as any).bumpAuthTokenAttempts(rec.id);
  assert.equal(n, 1);
});

await t('updateUser fields + god guards', async () => {
  const upd = await (authStore as any).updateUser(user.id, { fullName: 'WP9 Renamed', username: 'wp9user', pendingEmail: 'pend@test.dev' });
  assert.equal(upd.fullName, 'WP9 Renamed');
  const cleared = await (authStore as any).updateUser(user.id, { pendingEmail: undefined });
  assert.equal(cleared.pendingEmail, undefined);
});

await t('getMemberRole owner', async () => {
  const role = await (authStore as any).getMemberRole(user.id, ws.id);
  assert.equal(role, 'owner');
});

await t('audit log write + readback', async () => {
  await (authStore as any).logAudit({ userId: user.id, userEmail: email, workspaceId: ws.id, action: 'user_logged_in', details: 'wp9 test login' });
  const logs = await (authStore as any).getAuditLogs({ userId: user.id, limit: 10 });
  assert.ok(logs.some((l: any) => l.action === 'user_logged_in'), 'audit entry found');
});

console.log(`\n${p} passed, ${f} failed`);
process.exit(f ? 1 : 0);
