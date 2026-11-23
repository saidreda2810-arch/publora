# 06 — Developer Experience (migration tooling decision)

**Decision: plain SQL migration files + a ~80-line Node runner.** No ORM, no framework.

Rationale: team size unknown (R-5), schema is the deliverable, `pg` driver already installed. A tiny runner is easier to audit than a framework and works identically locally (embedded-postgres), in docker-compose, and against Neon/VPS — only `DATABASE_URL` differs.

## Layout

```
db/migrations/0001_schema_v2.sql   # base schema (existing, reviewed + deltas)
db/migrations/0002_phase_a_deltas.sql  # WP3 additions
scripts/db-migrate.ts              # up/status runner
docker-compose.yml                 # postgres:16 + minio (optional local)
.env.example                       # placeholders only
```

## Commands (package.json scripts)

| Command | Does |
|---|---|
| `npm run db:up` | start embedded-postgres (or use docker-compose if Docker present) + run migrations |
| `npm run db:migrate` | apply pending migrations, record in `schema_migrations` table |
| `npm run db:status` | list applied/pending |
| `npm run db:new <name>` | scaffold `db/migrations/NNNN_<name>.sql` |
| `npm run db:reset` | drop + recreate local DB (dev only, refuses if NODE_ENV=production) |
| `npm run db:seed` | clean reproducible seed; passwords generated at runtime, printed once |
| `npm test` | unit+integration; pg-backed suites auto-skip if no DATABASE_URL_TEST |

## Local DB options (pick one)

1. **embedded-postgres** (default, zero install): npm package downloads PG binaries; used by `db:up` when `EMBEDDED_PG=1` or no docker.
2. **docker-compose**: `postgres:16` + optional `minio` — for teams with Docker.
3. **External**: set `DATABASE_URL` (Neon free tier works).

## Conventions

- Forward-only numbered SQL files; each file idempotent where practical (`IF NOT EXISTS`).
- `schema_migrations(version PK, applied_at)` tracks state; runner applies in order inside a transaction per file.
- Timestamps `timestamptz` UTC everywhere; `created_at`/`updated_at` defaults; update trigger helper `set_updated_at()`.
- IDs: `uuid` PK + `legacy_id text` for JSON-migration traceability.
- Every index has a comment naming the query it serves.
