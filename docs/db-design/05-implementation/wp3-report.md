# WP3 — PostgreSQL foundation & DX (PARTIAL — live-PG verification blocked)

Branch: `wp0-safety-net` · Date: 2026-11-18

## Delivered

| Item | Status |
|---|---|
| `db/migrations/0002_phase_a_deltas.sql` | state_version, scheduler lock cols, media FKs, upload_sessions, automation dedupe cols, rate_limits/brute_force_state/oauth_attempts fallback tables, outbox_emails |
| `scripts/db-migrate.ts` | up/status/new runner; transaction per file; `schema_migrations` tracking; DATABASE_URL-driven |
| `server/db/client.ts` | pg Pool + withTransaction (+`app.workspace_id` GUC for future RLS) + mapDbError — **اتنفذ ومااتختبرش** (no live PG) |
| `docker-compose.yml` | postgres:16-alpine + optional minio profile, healthchecks, named volumes |
| `.env.example` | Phase-A vars documented (placeholders only) |
| `package.json` | `db:migrate`, `db:status`, `db:new` scripts |
| `docs/DEVELOPMENT.md` | one-command setup guide, migration conventions, test map |
| `docs/db-design/03-design/06-developer-experience.md` | tooling decision (plain SQL + runner, rationale) |
| `embedded-postgres` attempt | **failed**: package installed but platform binary `@embedded-postgres/windows-x64` download failed twice (network). Uninstalled. |

## Schema review notes (critical read of 0001 DDL vs report)

- ✅ Partitioned audit/security logs, post_targets split, workspace_kv, SKIP LOCKED-ready indexes all present.
- ➕ Deltas added where report required: state_version, media FKs, lock columns, upload_sessions, last_trigger_hash, shared-state tables.
- ⚠️ `rate_limits`/`brute_force_state`/`oauth_attempts` are **fallback** tables — WP7 may still prefer Redis if approved; schema supports both.

## NOT tested (explicit)

- `db-migrate.ts up/status` against a real database — **never ran** (no Postgres anywhere: no Docker, no local install, embedded binaries undownloadable, no DATABASE_URL).
- `0001`/`0002` SQL validity — reviewed by eye only; **must be smoke-applied on first real PG** (expect minor fixes e.g. enum/type name mismatches).
- `server/db/client.ts` — typechecks only.
- docker-compose — written, never started (no Docker).

## Blockers for completion

Need ONE of: Docker install, local PostgreSQL 16, or `DATABASE_URL` (Neon free tier is fastest). Once available: `npm run db:migrate` + `db:status` + fix any SQL errors → WP3 PASS.

## Rollback

All additive files/scripts; `npm uninstall pg` would revert deps (keep pg — WP4+ needs it). No data touched.
