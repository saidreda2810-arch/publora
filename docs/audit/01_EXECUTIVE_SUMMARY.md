# Publora — Complete Technical Audit

**Date:** 2026-11-11 · **Scope:** Full repository (frontend, backend, data layer, integrations, security, infra)
**Method:** Read-only source audit + configuration inspection. No code was modified. Tests could not be executed (Node.js runtime is not installed in this environment — see `TEST_RESULTS.md`).

## Executive Summary

Publora is a **single-process Express + React SPA** that presents itself as a multi-tenant social-media publishing SaaS. The frontend is large (~60 view components, ~20k LOC) and the backend is a set of Express routers (~4,400 LOC) backed by **flat JSON files on local disk** — there is no SQL/NoSQL database, no external queue, no email provider, no payment provider, and **no platform publish/upload adapters**.

The codebase is unusually honest in places: `publishEngine.ts` explicitly documents that platform publishing is **not implemented**, `automationEngine.ts` only executes real steps, and several GOD Console panels self-report `not_implemented` status. However, the UI surface is far larger than the operational backend, and several authentication endpoints are effectively **authentication bypasses**.

### Headline numbers

| Metric | Count |
|---|---|
| API endpoints (Express routes) | ~145 |
| Server modules | 14 files (~4,400 LOC) |
| Frontend views/components | ~60 TSX files (~35k LOC) |
| Data stores | 6 JSON files + `data/uploads/` |
| External providers wired | 5 (Google/YouTube+Drive, Meta/FB+IG, TikTok, Gemini AI, Firebase client SDK) |
| Providers with credentials configured (.env) | 3 of 5 (Meta empty) |
| Publish adapters implemented | **0 of 4** |

### Overall condition

- **Authentication core:** works (register/login/session/scrypt hashing), but is undermined by **four unauthenticated-account-creation/login bypass endpoints** (`/demo-login`, `/social-login`, `/passkey/login`, `/sso/login`) and an MFA backdoor code.
- **Workspace/tenant model:** real and mostly consistent — all `/api/saas` data is keyed by `workspaceId`; brand-level checks exist. Isolation is enforced by convention (header `x-workspace-id` resolved server-side) — solid at this scale, fragile at scale.
- **OAuth connect flows:** genuinely implemented for YouTube, Facebook Pages, Instagram Professional, TikTok (real authorize URLs, token exchange, channel discovery, encrypted token storage, refresh endpoints). Cannot be fully verified without live provider credentials.
- **Publishing pipeline:** scheduler + retry/backoff/idempotency machinery is real, but `attemptPlatformPublish` **always returns `adapter_missing`** → every scheduled post will end `failed`. Publishing is effectively non-functional end-to-end.
- **Analytics:** no provider sync workers exist; analytics records only appear if written through `/api/saas/state`. Any displayed metrics are client-side or empty.
- **AI Studio:** real Gemini calls (`@google/genai`) for 6 endpoints; unreachable code after `return` means the algorithmic fallbacks are dead code — if `GEMINI_API_KEY` is missing, endpoints return 503, not fallback.
- **Automations:** real execution engine (interval/daily/weekly/drive/video/post triggers; notify/assign/queue/condition/approval steps) running inside the 30s scheduler cycle. Publishing-dependent steps will fail downstream.
- **GOD Console:** mostly real admin endpoints over the JSON DB (users, roles, sessions, audit logs, maintenance modes, backups-as-file-copies, recovery rollback). Several panels honestly report `not_implemented`.
- **Storage/uploads:** real local-disk persistence with policy enforcement, chunked resumable uploads, magic-byte sniffing, workspace quotas. Single-node only.

### Top risks

1. **Critical auth bypasses** — `/api/auth/passkey/login`, `/sso/login`, `social-login`, `demo-login` create sessions for arbitrary/seeded accounts with no credential verification (`authRouter.ts:972-1459`).
2. **No production database** — entire platform state is one mutable JSON file rewritten atomically on every write; no transactions, no indexes, single-writer, ~7.8 MB already.
3. **Publishing cannot work** — zero platform adapters; all posts fail with `adapter_missing`.
4. **No email delivery** — verification, password reset, magic-link, and team invites generate tokens server-side but nothing sends them; dev hints are hidden in production → those flows are dead ends for real users.
5. **Secrets/config** — OAuth secrets can be stored plaintext in `data/oauth_config.json`; encryption key falls back to a hardcoded string if `OAUTH_ENCRYPTION_KEY` unset.

### Production readiness

**Not production-ready.** Suitable as a functional prototype/demo on a single instance with trusted users. Blockers before real customers: fix auth bypasses, add real DB, implement publish adapters or disable scheduling UI, add email delivery, remove demo/seed endpoints from production builds.

See `FEATURE_STATUS_MATRIX.md`, `SECURITY_AUDIT.md`, `BUGS_AND_TECHNICAL_DEBT.md`, `BACKEND_IMPLEMENTATION_ROADMAP.md`.
