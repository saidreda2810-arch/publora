# Development — Phase A data layer

## Prerequisites

- Node.js 22+ (developed on 26), npm.
- **Postgres**: pick one —
  - `docker compose up -d` (needs Docker) → `DATABASE_URL=postgres://publora:publora@localhost:5432/publora`
  - Neon/Supabase free tier → set `DATABASE_URL`
  - local PostgreSQL 16 install
  - *embedded-postgres npm package exists but its platform binaries failed to download in this environment — retry `npm i -D embedded-postgres @embedded-postgres/windows-x64` on a better network.*
- Object storage optional: `STORAGE_DRIVER=local` uses `data/storage/`; `s3` needs the S3_* env vars (+ `npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`).

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | app on :3457 (JSON driver by default) |
| `npm run db:migrate` | apply pending `db/migrations/*.sql` |
| `npm run db:status` | show applied/pending |
| `npm run db:new <name>` | scaffold migration |
| `npm run lint` / `npm test` / `npm run build` | typecheck / 42-test suite / frontend build |
| `npx tsx scripts/backup-data.ts --verify` | JSON-store backup + hash verify |
| `npx tsx scripts/db-migrate.ts up` | same as db:migrate |

## DB_DRIVER flag

`DB_DRIVER=json` (default) keeps current behavior. `DB_DRIVER=pg` switches repositories once WP4 lands — until then the flag is inert. Never set `DB_DRIVER=pg` without `DATABASE_URL`.

## Migrations

- Files: `db/migrations/NNNN_name.sql`, forward-only, applied in order inside a transaction, tracked in `schema_migrations`.
- `0001_schema_v2.sql` = base schema (pre-existing, reviewed). `0002_phase_a_deltas.sql` = WP3 additions (state_version, scheduler locks, media FKs, upload_sessions, automation dedupe, shared-state fallback tables, outbox).
- Rollback: no auto down-migrations — write compensating SQL manually if needed.

## Tests

- `npm test` runs the 42-test suite (must stay green every WP).
- WP-specific suites: `npx tsx tests/wp0-backup.test.mts`, `wp1-ingress`, `wp1-storage`, `wp2-media`.
- PG-backed tests (WP4+) will need `DATABASE_URL_TEST` or skip gracefully.

## Secrets

Never commit `.env`, `data/`, or `firebase-applet-config.json` values beyond what's already tracked. `MEDIA_SIGNING_SECRET` auto-generates into `data/.media_signing_key` if unset.
