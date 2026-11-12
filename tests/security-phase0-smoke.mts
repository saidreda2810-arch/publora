/**
 * Phase 0 security smoke test — verifies the auth bypass closures end-to-end
 * against a real running server. Usage:
 *   1. Start server:  $env:PORT=3457; npm run dev   (separate terminal)
 *   2. Run:           tsx tests/security-phase0-smoke.mts
 * Exits non-zero on any failure.
 */
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3457';

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

const post = (path: string, body: any) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// SEC-01..04: the four auth bypasses must be gone (404, no sessionToken)
for (const path of ['/api/auth/demo-login', '/api/auth/social-login', '/api/auth/passkey/login', '/api/auth/sso/login']) {
  await check(`${path} returns 404`, async () => {
    const res = await post(path, { email: 'admin@x.com', provider: 'google', role: 'admin' });
    const body = await res.json().catch(() => ({}));
    return res.status === 404 && !('sessionToken' in body);
  });
}

// SEC-05: MFA backdoor code must not be accepted anywhere
await check('mfa/verify rejects code 123456', async () => {
  const res = await post('/api/auth/mfa/verify', { code: '123456' });
  return res.status === 401 || res.status === 501;
});
await check('mfa/setup is disabled (501)', async () => {
  const res = await post('/api/auth/mfa/setup', {});
  return res.status === 401 || res.status === 501;
});

// SEC-09: scheduler endpoints require GOD auth
await check('GET /api/scheduler/status unauthenticated → 401', async () => {
  const res = await fetch(`${BASE}/api/scheduler/status`);
  return res.status === 401;
});
await check('POST /api/scheduler/run-now unauthenticated → 401', async () => {
  const res = await post('/api/scheduler/run-now', {});
  return res.status === 401;
});

// BUG-16: mock watch-folder removed. The SPA fallback may return index.html
// for unknown GETs — what matters is the fake JSON payload is gone.
await check('GET /api/drive/watch-folder no longer returns mock data', async () => {
  const res = await fetch(`${BASE}/api/drive/watch-folder`);
  const text = await res.text();
  return !text.includes('filesDetected') && !text.includes('monitoringActive');
});

// SEC-12/CSRF: cross-origin POST rejected
await check('cross-origin POST rejected (403)', async () => {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example.com' },
    body: JSON.stringify({ email: 'a@b.c', password: 'x' }),
  });
  return res.status === 403;
});

// T0.4: no dev token hints leak when NODE_ENV != development+flag
await check('magic-link/send leaks no OTP hint by default', async () => {
  const res = await post('/api/auth/magic-link/send', { email: 'someone@example.com' });
  const body = await res.json().catch(() => ({}));
  return !('testOtpHint' in body);
});

// T0.9: ?token= query param no longer authenticates
await check('?token= query param ignored', async () => {
  const res = await fetch(`${BASE}/api/auth/me?token=deadbeef`);
  return res.status === 401;
});

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
