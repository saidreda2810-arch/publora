# PUBLORA — Backend & Database Discovery & Design — Final Report

**Mode:** read-only discovery + design. No new application code written in this phase; artifacts are docs + analysis scripts only. Pre-existing Phase-A artifacts (schema DDL, migration script, T1.0 hotfix) are validated here, not re-implemented.
**Evidence tags:** [RUN]=executed/observed · [READ]=code/doc inspected · [INFER]=reasoned conclusion · [UNKNOWN]=no evidence.

---

## 1. Executive summary

The data layer is a **single 7.5 MB JSON file** rewritten atomically on every mutation [RUN]. The headline discovery: **99.9% of that file is ONE brand's three base64-encoded images** — all structured business data combined is <90 KB [RUN]. The architecture problem is therefore **media-in-database**, not record volume; fixing it is the highest-leverage change and must precede row migration.

149 API endpoints [RUN extractor] sit on 6 routers; 31 `requireAuth`, 25 `requireGodOwner`, 11 `requireRole`, 6 `bruteForceGuard` middleware references [READ grep — approximate]. Persistence is JSON-file-based with **no transactions, no indexes, no FK enforcement, no backups on disk, and 14 leaked tmp files** [RUN].

**Recommendation:** PostgreSQL 16 (self-hosted or Neon — cheapest-that-works per budget answer) + S3-compatible object storage (R2/MinIO) + optional Redis deferred. The pre-existing `0001_schema_v2.sql` design is **validated as sound**; deltas needed are listed in §5/§9.

## 2. Current state (evidence index)

| Area | Finding | Evidence |
| --- | --- | ---  |
| Baseline | Node 26.13.1, npm 11.20.1; `tsc` clean; `vite build` clean; tests 42 → 41 pass / 1 fail (firebase config, pre-existing); npm audit 6 vulns (jspdf→dompurify, no forced fix) | [RUN] `01-baseline.md` |
| Endpoints | 149 routes extracted programmatically → `endpoints.csv` | [RUN] `02-endpoint-inventory.md` |
| Data access | `saveDatabase` full-rewrite per mutation; `getWorkspaceData` blob RMW; in-memory caches/limiters/OAuth attempts/upload sessions | [READ] `03-data-access-map.md`, `07-stateful-components.md` |
| Data inventory | users 5, sessions 8, tokens 53, workspaces 10, members 9, audit 220, secEvents 3; **workspaceData 7.76 MB of 7.88 MB file**; 5/10 workspaces have no blob | [RUN] `data_inventory.json`, `04-data-inventory.md` |
| Dominant record | 1 brand = 7,756,549 B: coverImageUrl 3.25 MB + logoUrl 2.25 MB + avatarUrl 2.25 MB (base64 data-URLs) | [RUN] |
| Implicit schema | ~53 TS interfaces; 3 divergent "account" shapes; role vocabulary drift FE/BE/DDL; blob has 5 keys not in `WorkspaceDataPayload` type | [READ] `05-implicit-schema.md` |
| Access patterns | full-file rewrite O(7.5MB) per mutation; scheduler 30s scan, no SKIP LOCKED; debounced state push | [READ] `06-access-patterns.md` |
| Storage | uploads/ local FS (2 files), media_catalog tiny, **backups absent**, tmp leak 14 files ~9 MB | [RUN] `08-storage-analysis.md` |
| Integrity | 5 migration orphans (test fixtures), 0 dup emails, 0 bad dates, accounts-without-tokens possible | [RUN] `09-integrity-findings.md` |
| Classification | credentials hashed (sessions/tokens done); OAuth tokens plaintext pending T0.8; PII moderate; audit forensic | [INFER] `10-data-classification.md` |
| Frontend contract | blob-shaped `GET/POST /state` + `stateVersion`; cookie-only auth; no Bearer | [READ] `11-frontend-data-contract.md` |
| Tests | smoke suite covers T1.0 protections; **no tests for save/load roundtrip on real file, repo parity, or migration apply** | [READ] `12-test-coverage.md` |

## 3. Requirements (Part 2 answers)

Recorded in `02-requirements/requirements.md`. Summary: size/traffic/hosting/team/RPO-RTO = **unknown** (design for headroom, medium-traffic assumption); **budget = cheapest that works**; compliance = none; constraints = none; growth = medium; regions = **multi-region (conflicts with cheapest — resolved as single-region DB + CDN media, open decision D-REGION)**.

## 4. Gap analysis (current → required)

| Gap | Severity | Design answer |
| --- | --- | ---  |
| Media bytes inside DB (7.7 MB base64) | 🔴 critical | object storage + `media_assets` + signed URLs; extract-first migration |
| No real DB (JSON file, no ACID) | 🔴 critical | Postgres + repo interfaces behind `DB_DRIVER` flag |
| No FK/unique enforcement → orphans possible | 🟠 high | normalized schema + constraints (03.3) |
| No backups | 🟠 high | backup precondition P-4 before any migration |
| Single-instance assumptions (in-memory limiters, OAuth attempts, upload sessions, scheduler) | 🟠 high | Redis-or-PG shared state plan (03.4C); SKIP LOCKED claiming |
| Dual account models + role drift | 🟡 medium | canonical `SocialAccount`; D-ROLE/D-ACCT decisions |
| Partial-success publishing ambiguity | 🟡 medium | `posts` + `post_targets` split (already in DDL) |
| `workspaceData` blob opaque to typecheck (5 extra keys) | 🟡 medium | `workspace_kv` transition + whitelist; normalize hot keys later |
| Untested migration apply path | 🟠 high | embedded-postgres CI + parity suite (03.7) |

## 5. Proposed design (concise)

Full docs: `03-design/01–08` + `schema.sql` (copy of `0001_schema_v2.sql`).

- **DB:** PostgreSQL 16; Neon-free→paid or same-VPS (identical `DATABASE_URL`).
- **Schema:** ~25 tables, 3NF core + `post_targets` split + `workspace_kv` transition blob + monthly-partitioned audit/security logs. **Delta needed vs existing DDL:** `workspaces.state_version`, media FK cols on brands/videos, `locked_by/at` on posts/targets, `upload_sessions`, `last_trigger_hash`, `rate_limits` fallback — listed in 03.5.
- **Media:** S3/R2/MinIO private bucket, content-addressed keys, `media_assets` metadata, 15-min signed URLs.
- **Queue:** keep in-process scheduler but claim rows via `FOR UPDATE SKIP LOCKED` — multi-instance-safe without new infra; dedicated queue deferred with trigger criteria.
- **Shared state:** Redis optional; Postgres fallback tables for rate limits/brute-force/OAuth attempts/upload sessions.
- **Migration:** media-extract → schema → idempotent apply → verify → 7-day shadow/dual-write → 15–30 min cutover → 30-day archive → purge. Full plan: `04-migration/migration-plan.md`.
- **Security:** AES-GCM OAuth tokens (blocked on T0.1), RLS phase-2, append-only partitioned logs, lifecycle jobs (token purge, media GC, partition maintenance).

**Decision log:** D-ROLE (map FE roles→server enum — recommended), D-ACCT (canonical SocialAccount + jsonb metadata), D-IMG (media_asset FK — recommended), D-REGION (single-region+CDN — recommended), D-JSONB (jsonb — in DDL), plus owner data decisions D-1/D-2/D-3 (fixtures/orphans/tokenless accounts — default preserve+flag).

## 6. Migration / execution plan

See `04-migration/migration-plan.md` — phases M-0 (safety: backups+snapshot) → M-1 (media extract) → M-2 (schema+rows+verify) → M-3 (7-day shadow) → M-4 (cutover, 15–30 min) → M-5 (30-day stabilization). Dependencies: P-1..P-6 preconditions (§migration plan). Estimates: M-1/M-2 background zero-downtime; M-3 zero; M-4 15–30 min window. Rollback: DB_DRIVER flag + JSON archive; no rollback after archive purge (30-day gate). Risks: top = applying before backups exist; second = media-extract bugs (mitigate dry-run+sha256 verify).

## 7. What will NOT change

- Frontend `GET/POST /api/saas/state` contract (shape + stateVersion semantics) — golden tests enforce.
- Cookie-only browser auth; no Bearer reintroduction; no sessionToken in bodies.
- Scheduler cadence (30s) and automation engine semantics.
- All Phase-0 security controls (bypass removals, CSRF, rate limits, hashed tokens, security events).
- OAuth connect flows (code-complete); publish engine remains `adapter_missing` until Phase C — **DB work does not pretend to fix publishing**.
- `workspaceData`-era API surface until T1.4 entity endpoints (optional later).

## 8. Corrections to old audit

Full table: `01-current-state/13-audit-corrections.md`. Headlines: endpoint count 145→**149**; DB problem reframed as **media-in-DB** not volume; backups gap upgraded HIGH; accounts-without-tokens new integrity issue; dataset is 9-day-old dev data (growth [UNKNOWN]); 42 tests/41 pass baseline corrected.

## 9. Open questions & decisions needed

| ID | Decision | Needed from |
| --- | --- | ---  |
| D-1 | Purge vs preserve test fixtures (`test_*`, `brand-a`, `vid-1`, `ws_sso_*`) | owner |
| D-2 | Duplicate-shaped workspace blobs — merge or keep | owner |
| D-3 | Tokenless accounts → `requires_reconnection` vs delete | owner |
| D-ROLE | role vocabulary mapping | owner (recommend map-at-boundary) |
| D-ACCT | canonical account model | owner (recommend UI shape + jsonb) |
| D-IMG | media FK vs URL string | owner (recommend FK) |
| D-REGION | single-region+CDN vs paid multi-region | owner (recommend former) |
| P-1/P-2 | provision Postgres + object storage | owner/infra |
| P-3 | T0.1 rotations + OAUTH_ENCRYPTION_KEY | owner-only |

## 10. Untested / uninspected items + closure plan

| Item | Status | Closure |
| --- | --- | ---  |
| `migrate-json-to-pg --apply/--verify` on real PG | written, **unrun** [RUN dry-run only] | needs P-1; CI embedded-pg test |
| Media-extraction script | **not yet written** | impl phase M-1 |
| Repo interfaces (JsonRepo/PgRepo) | not started | impl phase T1.3 |
| uploads/ 0-byte anomaly | flagged, unverified | check file sizes on disk during M-1 |
| `data_inventory` top-level size map empty | analyzer quirk; per-collection numbers verified via workspaceData breakdown | fix analyzer or accept per-key data (already sufficient) |
| Rendered-content XSS sweep | static-only; CSP Report-Only collecting | browser pen-test pass post-deploy |
| Live OAuth/Gemini flows | untestable without deployed creds | staging env Phase C |
| npm audit 6 vulns (jspdf chain) | unresolved; force-fix is breaking | evaluate jspdf v4 migration separately |
| firebase-applet-config test failure | pre-existing env/config mismatch | fix config or skip test — unrelated to DB |

---

*Generated by discovery phase. All claims tagged; scripts in `docs/db-design/scripts/` are re-runnable.*
