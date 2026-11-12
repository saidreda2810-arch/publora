# 10 — Security Audit

## Critical
| ID | Finding | Evidence | Impact |
|---|---|---|---|
| SEC-01 | **Passkey login bypass** — POST /api/auth/passkey/login creates a session for ANY email (or first active user) with zero verification | authRouter.ts:1293-1376 | Full account takeover of any user incl. admin |
| SEC-02 | **SSO login bypass** — POST /api/auth/sso/login same pattern; auto-provisions users | authRouter.ts:1379-1459 | Same |
| SEC-03 | **Social login bypass** — POST /api/auth/social-login trusts client-supplied provider+email; auto-creates verified accounts | authRouter.ts:1047-1157 | Attacker registers as any email incl. god-owner email? (god role only via createUser path — social path sets role 'user' unless first user; still full impersonation of existing users) |
| SEC-04 | **Demo login** — POST /api/auth/demo-login unauthenticated; role='admin' returns platform_admin session | authRouter.ts:972-1044 | Instant admin access in production |
| SEC-05 | **MFA backdoor** — code '123456' accepted at login & verify | authRouter.ts:386, 932 | MFA provides no protection |

## High
| ID | Finding | Evidence |
|---|---|---|
| SEC-06 | Session tokens stored **plaintext** in saas_db.json and returned in response bodies | saasDb.ts createSession; login responses include sessionToken |
| SEC-07 | `PUT /api/saas/workspace/:id` — any workspace member can change name/**plan**/settings (check is membership-only) | saasRouter.ts:577-603 |
| SEC-08 | `POST /api/saas/state` accepts arbitrary JSON blob — no schema/ownership validation of nested entities | saasRouter.ts:62-75 |
| SEC-09 | `POST /api/scheduler/run-now` + `GET /api/scheduler/status` unauthenticated | server.ts:141-148 |
| SEC-10 | OAuth token encryption key falls back to **hardcoded string** if OAUTH_ENCRYPTION_KEY unset | oauthStore.ts:116 |
| SEC-11 | OAuth client secrets can be persisted **plaintext** in data/oauth_config.json via GOD console | oauthStore.ts saveOAuthConfig |
| SEC-12 | No CSRF protection; session cookie `SameSite=None; Secure` + token also in localStorage & response body → XSS exfiltration path | authRouter.ts:284-289; AuthContext |

## Medium
| SEC-13 | Password reset = 6-digit numeric code, 2h validity, no attempt counter beyond generic bruteForceGuard; never emailed anyway | authRouter.ts:506 |
| SEC-14 | Magic-link OTP 6-digit, 15-min, find() without type check — token record type 'email_verification' reused | authRouter.ts:1160-1290 |
| SEC-15 | In-memory rate limiter + brute-force guard + pending OAuth attempts: reset on restart, ineffective multi-instance | security.ts, bruteForceGuard.ts, oauthStore.ts |
| SEC-16 | `/uploads` static dir is world-readable — media URLs unguessable (UUID names) but no auth on files | server.ts:45-50 |
| SEC-17 | `express.json({limit:'150mb'})` — memory pressure / DoS surface | server.ts:36 |
| SEC-18 | Error messages leak internals occasionally (`err.message` returned to clients in AI/oauth paths) | aiRouter.ts, oauthRouter.ts |
| SEC-19 | `requireEmailVerification` setting never enforced at register/login | authRouter.ts:292 |
| SEC-20 | Avatar data-URL stored inline → DB bloat; only prefix-checked (data:image/...;base64,) not decoded+re-encoded | saasRouter.ts:2095 |

## Low / Informational
- GOD owner email hardcoded (`saidreda2810@gmail.com`) — by design but a fixed target.
- `SESSION_SECRET` env var unused.
- sanitizeInputs only strips null bytes — minimal.
- CSP header only sets frame-ancestors (no script-src etc.).
- `?token=` query-param auth leaks tokens into logs/history.
- Audit log capped at 1000 — security-relevant events evicted.
- `.env` present in repo dir with real-looking secrets (not verified as live); ensure gitignored — `.gitignore` exists but repo shipped as zip so history unknown.

## Verified-good practices observed
scrypt+salt+timingSafeEqual; user-enumeration timing equalization; sanitizeUserForClient strips secrets; GOD-owner immutability guards; role hierarchy enforcement; workspace-scoped social account filtering; hashed invite tokens; upload magic-byte sniffing + quotas; audit logging on privileged actions; maintenance-mode bypass correctly limited to privileged roles.
