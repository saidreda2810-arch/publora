# Phase A Implementation — Progress

| WP | Title | Status | Evidence |
|---|---|---|---|
| WP0 | Safety net & baseline | ✅ PASS | wp0-baseline.md; backup verify OK; restore drill OK; 42/42 tests |
| WP1 | Block media-in-DB + extraction tool | ✅ PASS | wp1-report.md; ingress 10/10, storage 6/6; extraction −98.4% on scratch |
| WP2 | Media assets in prod code | ✅ PASS | wp2-report.md; media 8/8; dedupe + signed URLs + soft-delete guard |
| WP3 | Postgres foundation + DX | ✅ PASS | wp3-report.md; PG 16.16 local; migrations 0001–0009 applied; db-migrate runner |
| WP4 | Repository layer + DB_DRIVER | ✅ PASS | repo.ts/jsonRepo/pgRepo; parity 7/7 on live PG; workspaceState CAS |
| WP5 | Data migration | ✅ PASS (scratch) / ✅ applied on `publora` | idempotent re-run verified; 0003–0005 fixes; CP-2 applied 2026-11-23 |
| WP6 | Shared state out of memory | ✅ PASS | rate_limits/brute_force_state/oauth_attempts on PG; 3/3 live tests |
| WP7 | Scheduler/automation multi-instance | ✅ PASS | automation dedupe atomic UPDATE; post_targets SKIP LOCKED claim |
| WP8 | State facade + tenant isolation | ✅ PASS | /api/saas/state + all entity routes via facade; wp8 suite 5/5; composite legacy ids |
| WP9 | Auth cutover | ✅ PASS | authStore both drivers; register/login/me/sessions live on JSON+PG; wp9 suite 10/10 |
| WP10 | Remaining cutover (scheduler/admin/uploads) | ✅ PASS | commits a940ba6…87ee70a; HTTP smoke 14/14 on BOTH drivers |
| CP-2 | Production migration apply | ✅ DONE | `publora` DB: 62 users, 122 ws, 60 posts→targets, 690 kv, 571 audit |
| CP-3 | Live cutover | ✅ DONE | server on :3499 running DB_DRIVER=pg + publora + SHARED_STATE_DRIVER=pg |

## Environment notes

- Node v26.13.1, npm 11.20.0, git 2.56 ✅
- PostgreSQL 16.16 local: `postgres://postgres:postgres@localhost:5432` — DBs: `publora` (live), `publora_scratch` (tests)
- Docker: not installed — not needed (local PG used)
- S3/MinIO: not deployed — LocalStorageProvider active; S3Provider written but untested
- Email provider: none — tokens dev-only

## Phase 2 (post-cutover) — status

| Item | Status | Evidence |
|---|---|---|
| Platform adapters (YouTube/TikTok/Meta) | ✅ implemented, compile+unit tested — **live publish untested** (needs real OAuth connect) | commit d2fe995; server/platformAdapters/ |
| Transactional email (SMTP + log fallback) | ✅ implemented — **SMTP delivery untested** (needs SMTP creds) | commit efcf4f2; server/mailer.ts |
| Remaining file stores → PG (globalStores) | ✅ verified on scratch + seeded on publora | commits 4f6c05c, b375abd, 961d80b |
| Legacy JSON → gs:* seed | ✅ ran on publora (system_settings, oauth_config, media_assets) | scripts/seed-global-stores.mts |

Phase 2 blocked-on-externals: real platform publish test (OAuth connect),
SMTP delivery test, S3 provider test (MinIO/R2 endpoint).

## Known limitations (honest)

- No real platform publishing adapters — `adapter_missing` failures are honest, never fake success
- No email delivery — verification/reset/mime links returned as dev hints only
- `systemSettings` / upload policy / media catalog / drive connections / import jobs remain file-backed (per-instance or global config)
- approvals file (`automationApprovals`) is per-instance disk state
- CAS: entity handlers via blob facade can silently drop stale writes (TOCTOU) — per-entity repos would fix; rare in practice
- Orphan workspace `ws_sso_f9e58107eed6` in JSON (owner user missing) — skipped by migration, pre-existing data corruption
- HTTP smoke covers main flows; edge-case routes verified by compile + unit tests only
