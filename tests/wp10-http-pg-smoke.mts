/**
 * WP10 HTTP-level smoke — verifies the auth/state/member/upload lifecycle
 * end-to-end against a real running server. Driver-agnostic: passes on both
 * DB_DRIVER=json and DB_DRIVER=pg (verified 14/14 on each).
 *
 * Usage:
 *   1. Start server:  PORT=3511 DB_DRIVER=pg DATABASE_URL=postgres://postgres:postgres@localhost:5432/publora_scratch SHARED_STATE_DRIVER=pg npx tsx server.ts
 *      (or JSON mode:  PORT=3513 DB_DRIVER=json npx tsx server.ts)
 *   2. Run:           TEST_BASE_URL=http://localhost:3511 npx tsx tests/wp10-http-pg-smoke.mts
 * Exits non-zero on any failure.
 */
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3511';

let failures = 0;
async function check(name: string, fn: () => Promise<boolean>) {
  try {
    const ok = await fn();
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) failures++;
  } catch (e: any) {
    console.log(`FAIL  ${name} — ${e.message}`);
    failures++;
  }
}

const email = `wp10smoke_${Date.now()}@example.com`;
const password = 'SmokeTest123!';
let cookie = '';
let workspaceId = '';

const req = (path: string, opts: RequestInit = {}, auth = true) =>
  fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && cookie ? { Cookie: cookie } : {}),
      ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
      ...(opts.headers || {}),
    },
  });
const post = (path: string, body: any, auth = true) =>
  req(path, { method: 'POST', body: JSON.stringify(body) }, auth);
const captureCookie = (res: Response) => {
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
};

// ---- auth lifecycle on PG ----
await check('register creates user+workspace in PG', async () => {
  const res = await post('/api/auth/register', { email, password, fullName: 'WP10 Smoke' }, false);
  const body = await res.json().catch(() => ({}));
  workspaceId = body.workspace?.id || '';
  return (res.status === 200 || res.status === 201) && body.success === true && !!workspaceId;
});

await check('login returns session cookie', async () => {
  const res = await post('/api/auth/login', { email, password }, false);
  captureCookie(res);
  const body = await res.json().catch(() => ({}));
  return res.status === 200 && body.success === true && cookie.includes('sra_session=');
});

await check('GET /me returns PG-backed user', async () => {
  const res = await req('/api/auth/me');
  const body = await res.json().catch(() => ({}));
  return res.status === 200 && body.user?.email === email;
});

await check('GET /sessions lists PG session', async () => {
  const res = await req('/api/auth/sessions');
  const body = await res.json().catch(() => ({}));
  return res.status === 200 && Array.isArray(body.sessions) && body.sessions.length >= 1;
});

// ---- workspace state facade on PG ----
await check('GET /api/saas/state returns workspace blob', async () => {
  const res = await req('/api/saas/state');
  const body = await res.json().catch(() => ({}));
  return res.status === 200 && body.success === true && body.workspaceId === workspaceId;
});

await check('POST /api/saas/state persists brand to PG', async () => {
  const get = await (await req('/api/saas/state')).json();
  const base = get.stateVersion ?? 0;
  const res = await post('/api/saas/state', {
    baseVersion: base,
    data: { brands: [{ id: 'b_smoke1', name: 'Smoke Brand', status: 'active' }], queuePaused: false },
  });
  const body = await res.json().catch(() => ({}));
  return res.status === 200 && body.success === true;
});

await check('state roundtrip returns the brand', async () => {
  const res = await req('/api/saas/state');
  const body = await res.json().catch(() => ({}));
  return (body.data?.brands || []).some((b: any) => b.id === 'b_smoke1');
});

// ---- member/invitation surfaces (authStore pg paths) ----
await check('GET /members/invitations works on PG', async () => {
  const res = await req('/api/saas/members/invitations');
  const body = await res.json().catch(() => ({}));
  return res.status === 200 && body.success === true && Array.isArray(body.invitations);
});

await check('GET /members lists owner membership', async () => {
  const res = await req('/api/saas/members');
  const body = await res.json().catch(() => ({}));
  return res.status === 200 && Array.isArray(body.members) && body.members.length >= 1;
});

await check('GET /account-overview works on PG', async () => {
  const res = await req('/api/saas/account-overview');
  const body = await res.json().catch(() => ({}));
  return res.status === 200 && body.success === true && body.user?.email === email;
});

// ---- admin surfaces return sane authz (user role → 403, not 500) ----
await check('GET /admin/users forbidden for non-admin (403)', async () => {
  const res = await req('/api/saas/admin/users');
  return res.status === 403;
});

await check('GET /admin/overview forbidden for non-admin (403)', async () => {
  const res = await req('/api/saas/admin/overview');
  return res.status === 403;
});

// ---- chunked upload session on PG ----
await check('chunked/init creates PG upload session', async () => {
  const res = await post('/api/media/chunked/init', {
    filename: 'smoke.mp4', mimeType: 'video/mp4', sizeBytes: 100,
  });
  const body = await res.json().catch(() => ({}));
  return res.status === 201 && body.success === true && typeof body.sessionId === 'string';
});

// ---- brand CRUD via dedicated endpoints (exercises saveOrConflict) ----
let brandId = '';
await check('POST /brands creates brand', async () => {
  const res = await post('/api/saas/brands', { name: 'CRUD Smoke Brand', color: '#123456' });
  const body = await res.json().catch(() => ({}));
  brandId = body.brand?.id || '';
  return res.status === 200 && body.success === true && !!brandId;
});

await check('GET /brands lists created brand', async () => {
  const res = await req('/api/saas/brands');
  const body = await res.json().catch(() => ({}));
  const brands = body.brands || body.data?.brands || [];
  return res.status === 200 && brands.some((b: any) => b.id === brandId);
});

await check('PATCH /brands/:id updates brand', async () => {
  const res = await req(`/api/saas/brands/${brandId}`, { method: 'PATCH', body: JSON.stringify({ color: '#654321' }) });
  const body = await res.json().catch(() => ({}));
  return res.status === 200 && body.success === true;
});

await check('DELETE /brands/:id removes brand', async () => {
  const res = await req(`/api/saas/brands/${brandId}`, { method: 'DELETE' });
  const body = await res.json().catch(() => ({}));
  const res2 = await req('/api/saas/brands');
  const body2 = await res2.json().catch(() => ({}));
  const brands = body2.brands || body2.data?.brands || [];
  return res.status === 200 && body.success === true && !brands.some((b: any) => b.id === brandId);
});

// ---- notifications + oauth accounts + history surfaces ----
await check('GET /queue/notifications returns array', async () => {
  const res = await req('/api/saas/queue/notifications');
  const body = await res.json().catch(() => ({}));
  return res.status === 200 && body.success === true && Array.isArray(body.notifications);
});

await check('GET /api/oauth/accounts returns array', async () => {
  const res = await req('/api/oauth/accounts');
  const body = await res.json().catch(() => ({}));
  return res.status === 200 && body.success === true && Array.isArray(body.accounts);
});

await check('GET /history returns success', async () => {
  const res = await req('/api/saas/history');
  const body = await res.json().catch(() => ({}));
  return res.status === 200 && body.success === true;
});

// ---- cleanup: self-delete account (exercises delete-request path on PG) ----
await check('account/delete-request schedules deletion on PG', async () => {
  const res = await post('/api/saas/account/delete-request', { password, confirmText: 'DELETE' });
  const body = await res.json().catch(() => ({}));
  return res.status === 200 && body.success === true;
});

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'} (${BASE})`);
process.exit(failures === 0 ? 0 : 1);
