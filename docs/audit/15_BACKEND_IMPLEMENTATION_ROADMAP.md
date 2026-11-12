# 15 — Backend Implementation Roadmap (recommended, NOT implemented)

## Priority 0 — Critical (security/data-loss)
| Task | Problem | Acceptance |
|---|---|---|
| P0-1 Remove/gate demo-login, passkey, sso, social-login bypasses | SEC-01..04 account takeover | Endpoints return 404/403 in production or require real verification; pen-test each |
| P0-2 Remove MFA '123456' backdoor; implement real TOTP or disable MFA UI | SEC-05 | Only valid TOTP accepted |
| P0-3 Stop returning sessionToken in response bodies; rely on HttpOnly cookie; hash stored session tokens | SEC-06, SEC-12 | Token never in JSON/localStorage |
| P0-4 Restrict POST /api/saas/state payload (schema whitelist per entity) + fix PUT /workspace/:id to owner/admin only | SEC-07/08 | Cross-entity injection rejected; member can't change plan |
| P0-5 Auth-gate /api/scheduler/run-now; remove or protect /api/drive/watch-folder mock | SEC-09, BUG-16 | 401 unauthenticated |
| P0-6 Require OAUTH_ENCRYPTION_KEY (fail-fast if unset); stop persisting secrets via oauth_config.json or encrypt at rest | SEC-10/11 | No plaintext fallback |
| P0-7 Ensure NODE_ENV=production + SRA_EXPOSE_DEV_TOKENS=false in deploy; delete/rotate any committed secrets | dev-token leak | No token hints in prod responses |

## Priority 1 — Core SaaS reliability
| Task | Problem |
|---|---|
| P1-1 Replace JSON-file DB with real DB (Postgres/Firestore) or at minimum SQLite + migrations; keep workspaceData isolation | data/saas_db.ts |
| P1-2 Introduce per-entity endpoints (posts, videos, analytics) replacing blob sync — kills lost-update + injection | POST /state |
| P1-3 Add email provider (Resend/SES/SMTP) + wire verification, reset, invites, magic links, notifications | auth flows dead without it |
| P1-4 Implement publish adapters: YouTube (resumable upload), FB Pages video, IG content publish (2-step), TikTok Content Posting — inside publishEngine dispatch | BUG-06 core value |
| P1-5 Token-refresh worker + expiry handling before publish attempts | BUG-10 |
| P1-6 Persist rate-limit/brute-force/pending-attempt stores or document single-instance constraint | SEC-15 |

## Priority 2 — Essential product
- Media: search/filter/folders/thumbnails; unify media catalog vs videos entities.
- Analytics: provider sync workers (YT Analytics, Meta Insights, TikTok) → analytics[] with syncedAt/freshness.
- Automations: verify each step type end-to-end; add missing step executors; surface failures.
- Calendar: server-side timezone correctness tests; drag-drop persistence verification.
- Notifications: real delivery (in-app + email) honoring user preferences.

## Priority 3 — Platform expansion
- Billing: payment provider (Stripe), checkout, webhooks, invoices, plan enforcement.
- Team: invite email delivery, SSO/SAML real implementation or remove UI.
- MFA: real TOTP (speakeasy/otplib) + QR provisioning.
- GOD console: remaining unimplemented panels; multi-instance-safe audit store.

## Priority 4 — Optimization
- DB indexes/pagination server-side; caching; response-size limits; move avatars/media metadata out of user records; queue-based publish workers; load test at 1k/10k/100k tenants; CI pipeline (tests currently unrunnable here).

## Suggested phases
- **Phase A (this week):** P0-1..P0-7 — close auth bypasses & secret handling.
- **Phase B:** P1-1..P1-3 — real DB + email; unblocks verification/invites.
- **Phase C:** P1-4..P1-5 — publishing adapters + token refresh → product becomes real.
- **Phase D:** analytics sync + automations hardening.
- **Phase E:** billing, MFA, scale work.
