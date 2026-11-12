# Changelog

## 2026-11-12 — Phase 0 Security Emergency (partial)

Closes the critical auth-bypass and token-exposure findings from `docs/audit/`.
Verified by `tests/security-phase0-smoke.mts` (12/12 PASS against live server)
plus `tsc --noEmit` clean and `vite build` OK.

### T0.2 — Auth bypasses removed
- Deleted `/api/auth/demo-login`, `/social-login`, `/passkey/login`, `/sso/login`
  route handlers entirely (`server/authRouter.ts`).
- Frontend: `AuthContext` stubs return "not available" without API calls;
  dead buttons/forms removed from `SignInModal`, `SignUpModal`;
  landing-page demo buttons now open the real sandbox mode.

### T0.3 — Fake MFA removed
- Removed hardcoded `123456` acceptance (login + verify paths).
- `/mfa/setup` and `/mfa/verify` now return 501.
- Login no longer enforces the fake MFA gate.
- `applyDatabaseInvariants` migrates all users: `mfaEnabled=false`, `mfaSecret` cleared.

### T0.4 — Dev token leakage + env validation
- `devTokenField` now requires `NODE_ENV=development` AND `SRA_EXPOSE_DEV_TOKENS=true`.
- New `server/env.ts`: process refuses to boot in production with localhost
  `APP_URL`, `SRA_EXPOSE_DEV_TOKENS=true`, or `ENABLE_DEMO_LOGIN=true`.

### T0.5 — Scheduler endpoints protected
- `/api/scheduler/status` and `/api/scheduler/run-now` now require GOD owner.
- `/health` returns minimal liveness; detailed diagnostics moved to
  `GET /api/system/diagnostics` (GOD only).

### T0.6 — Mock Drive watch removed
- Deleted hardcoded `/api/drive/watch-folder`; automation UI reports honestly
  that folder watching isn't implemented.

### T0.7 — Workspace/billing authorization
- `PUT /api/saas/workspace/:id`: owner/admin only, whitelisted fields
  (`name`, `settings`); `plan`/`billingCycle` can no longer be set via API.
- `POST /api/saas/subscription/upgrade` is now GOD-owner only.

### T0.9 — Session hardening (server + frontend, cookie-only)
- Sessions stored as SHA-256 hashes; `?token=` query-param auth removed.
  Migration hashes legacy plaintext tokens.
- `sessionToken` removed from all response bodies (register, login, /me,
  magic-link verify). Auth is now **HttpOnly cookie only**.
- `extractTokens()` tries Bearer then cookie — a stale Bearer never shadows
  a valid cookie. Logout destroys every candidate session.
- Frontend: `apiFetch` sends `credentials: 'include'`; `AuthContext` no
  longer stores tokens in localStorage (`sessionToken` context value is a
  non-credential `'cookie'` sentinel for existing guards). All
  `Authorization: Bearer` headers removed from AdminDashboardView,
  TeamWorkspaceView, PublisherContext, AddVideoWizard.
- Verified live: register/login set `Set-Cookie` with no token in body;
  `/me` → 200 via cookie, 401 without, 200 with stale Bearer + cookie.

### T0.9b — MFA UI hidden
- `SecuritySection` and `AdminDashboardView` no longer offer MFA setup
  (backend returns 501). Legacy `mfaEnabled` users can still disable via
  `/mfa/disable` (functional, password-gated).

### T0.10 — CSRF origin check
- Mutating requests with a foreign `Origin` are rejected (403).

### T0.11 (partial) — Body size limits
- Global JSON 2mb; 150mb scoped to `/api/media` + `/api/ai`; 25mb for `/api/saas`.

### T0.12 — Central error handling
- `X-Request-Id` on every request; final error middleware returns
  `{error:'internal_error', requestId}` for 5xx.
- Removed `err.message` leaks in saasRouter/driveRouter/oauthRouter/aiRouter.

### T0.15 — Security headers
- HSTS in production; full `Content-Security-Policy-Report-Only` policy added.

### T0.16 — Security event stream
- New `securityEvents` array (cap 5000) in `saas_db.json`; auth/privilege/
  infra audit events are preserved independently of the 1000-entry audit log.

### T0.17 (partial) — GOD owner email
- `GOD_OWNER_EMAIL` now read from env (fallback retained for bootstrap).

### T0.18 — Token/OTP hardening
- All verification tokens stored as SHA-256 hashes (register, email-change,
  password-reset, magic-link).
- Password reset: high-entropy `base64url` token, 60-minute expiry.
- Magic link: own `magic_link` type, 10-minute expiry, previous codes
  invalidated on resend, **5-attempt cap** then code dies.
- Legacy plaintext tokens still accepted during transition.

### T0.19 — Rate limits
- `/api/ai` now rate-limited (20 req/min). Auth router already limited (30/min).

### T0.20 — Gap audit (complete)
- No `dangerouslySetInnerHTML`/`eval`/`innerHTML`/`iframe`/`object` sinks in `src/`.
- No user-controlled paths in file operations; all `fetch()` calls target
  fixed Google/Meta/TikTok hosts (no SSRF vector found).
- `POST /api/saas/state`: rejects non-object/array payloads and
  `__proto__`/`constructor`/`prototype` keys — **verified live**: malicious
  payloads → 400, normal payload → 200.
- Open-redirect review: OAuth `authorize-url` endpoints build URLs
  server-side from fixed provider hosts; `window.location.href` targets are
  not user-controlled. OAuth popup `postMessage` validates `event.origin`.
- XSS: only user-controlled `href` sink was `post.postUrl` in ReportsView —
  now restricted to http(s) via `safeHttpUrl()` (blocks `javascript:`/`data:`).
- Residual: full rendered-content audit of every workspace-data field is
  impractical statically; React escaping covers text. CSP Report-Only will
  surface any remaining sink in production telemetry.

### Known remaining Phase-0 items
- **T0.1** (manual): rotate provider keys, wipe sessions, reset passwords — owner action.
- **T0.8**: OAuth token encryption (AES-GCM + key rotation) — blocked on T0.1.
- **T0.13**: email-verification enforcement (needs Phase B email provider).
- **T0.14**: uploads hardening (signed URLs — Phase A storage).
- Bearer-token auth still accepted server-side (for future API keys);
  no client uses it today.

## 2026-11-12 — Phase A started: T1.0 state-sync hotfix + T1.1 schema draft

### T1.0 — `POST /api/saas/state` hardened (verified live)
- **Optimistic concurrency:** `stateVersions` counter per workspace (in `saasDb`,
  bumped on every `saveWorkspaceData`). GET returns `stateVersion`; POST accepts
  `baseVersion` → mismatch returns `409 {conflict, stateVersion}`.
- **Anti-wipe:** `posts`/`videos`/`brands`/`accounts` may not shrink below 50%
  of a ≥10-item collection → 409.
- **Key whitelist:** only known state keys accepted; unknown keys → 400
  (also covers `__proto__`/`constructor`/`prototype`).
- **Referential integrity:** posts/videos may not reference unknown
  brandId/accountId — new/changed violations rejected (legacy orphans
  grandfathered; 2 pre-existing orphan posts found in data, not blocked).
- **Frontend (`PublisherContext`):** no remote push until first successful GET
  for the workspace (`hydratedWorkspaceRef`); sends `baseVersion`; on 409 or
  failure re-fetches and sets `remoteSyncError`, surfaced as a banner in `App.tsx`.
- Verified: wrong baseVersion→409, unknown key→400, orphan post→400,
  12-post push→200, shrink-to-0→409. `tsc` clean.

### T1.1 — Schema design draft
- `docs/DATABASE_SCHEMA_V2.md`: full Postgres DDL — 20+ tables, enum types,
  posts/post_targets split, sessions/auth_tokens hashing, monthly-partitioned
  audit_logs/security_events, outbox_emails, JSON→PG entity mapping.
- **Awaiting owner approval** before migrations are written (plan requirement).

## Phase 0 status
Code-side items **complete**: T0.2–T0.7, T0.9, T0.10–T0.12, T0.15–T0.20.
Blocked on owner: **T0.1** (credential rotation — manual) → then **T0.8**
(OAuth encryption). Blocked on later phases: **T0.13** (Phase B email),
**T0.14** (Phase A storage).
