# 03.5 — Migrations & Deployment

## Migration tooling

- **SQL-first**: numbered files `db/migrations/NNNN_*.sql` applied by a tiny runner (`scripts/migrate.ts` — to be written; ~50 lines using `pg`). No ORM migration framework — team size unknown (R-5), keep it obvious.
- `0001_schema_v2.sql` exists and is dry-run-shaped; needs: `state_version` on workspaces (verify present), media_asset FK columns on brands/videos, `locked_by/locked_at` on posts/post_targets, `upload_sessions` table, `rate_limits` fallback table (if no Redis), `last_trigger_hash` on automation rules. **Delta list to apply in implementation phase.**
- Forward-only migrations + documented manual rollback SQL per migration (no down-migrations auto-run — too dangerous).

## Deployment stages

```
Stage 0  Provision Postgres (Neon/VPS) + object storage bucket + env vars
Stage 1  Apply 0001 schema to EMPTY db; run migrate-json-to-pg --dry-run → review orphans
Stage 2  Extract media (data: URLs → object storage)  [new script]
Stage 3  --apply migration (idempotent, transactional)
Stage 4  --verify: counts/checksums/orphan-scan
Stage 5  Repo swap behind flag: DB_DRIVER=json|pg; shadow-write both; compare
Stage 6  Cutover reads to pg; json becomes read-only archive
Stage 7  Decommission json writes; keep file 30 days then archive
```

Details + rollback in `docs/db-design/04-migration/migration-plan.md`.

## Environment contract (new vars)

```
DATABASE_URL=postgres://...           # required when DB_DRIVER=pg
DB_DRIVER=json|pg                     # default json during transition
S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY / S3_SECRET_KEY   # object storage
S3_PUBLIC_BASE_URL                    # for signed/public URL generation
OAUTH_ENCRYPTION_KEY                  # T0.8 prerequisite — already planned
RATE_LIMIT_BACKEND=memory|redis|pg    # default memory until scaling needed
REDIS_URL                             # optional
```

`server/env.ts` boot-validation extended: `DB_DRIVER=pg` requires `DATABASE_URL`; production forbids `DB_DRIVER=json` once cutover flag day passes (env `ALLOW_JSON_DRIVER=true` escape hatch during transition only).

## CI/CD implications

- Migration dry-run in CI against ephemeral Postgres (embedded-postgres or service container) — catches DDL drift.
- `tsc --noEmit` + `vite build` + test suite gates (existing).
- No blue-green needed at this scale; maintenance window ~15–30 min acceptable for cutover (R-7 allows 4h RTO).
