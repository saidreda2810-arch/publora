# Backup & Restore Runbook — Publora (PostgreSQL mode)

The production datastore is PostgreSQL (`publora`). JSON files under `data/`
are legacy/fallback only — backing them up alone is NOT sufficient.

## What must be backed up

| Component | Location | Method |
|---|---|---|
| Database (all tenants, auth, posts, settings, outbox) | PostgreSQL `publora` | `pg_dump` (custom format) |
 | Uploaded media bytes | `data/uploads/` | file copy / tar |
| Media signing key | `data/.media_signing_key` | file copy (treat as secret) |
| Env config | `.env` | secure secrets store (never in repo/backups unencrypted) |

> `data/saas_db.json` and other JSON stores are **not** read in `DB_DRIVER=pg`
> mode. Keep them only as a rollback artifact from the cutover.

## Backup

```bash
# 1. Database — custom format (compressed, restorable)
pg_dump -h localhost -U postgres -d publora -Fc -f backups/publora-$(date +%Y%m%d-%H%M%S).dump

# 2. Media + signing key
tar -czf backups/uploads-$(date +%Y%m%d-%H%M%S).tar.gz -C data uploads .media_signing_key

# 3. (optional) legacy JSON stores for extra safety
tar -czf backups/data-json-$(date +%Y%m%d-%H%M%S).tar.gz -C data --exclude='uploads' .
```

Retention: keep daily dumps 7 days, weekly 4 weeks, monthly 3 months
(adjust `BACKUP_KEEP` for the JSON backup script which defaults to 14).

Encrypt off-site copies: `BACKUP_PASSPHRASE` is supported by
`scripts/backup-data.ts` for the JSON path; for pg_dump use `gpg -c` or your
secrets pipeline.

## Restore (disaster recovery)

```bash
# 1. Restore database into a FRESH database first — never overwrite prod blindly
createdb publora_restore
pg_restore -h localhost -U postgres -d publora_restore --no-owner --role=postgres \
  backups/publora-YYYYMMDD-HHMMSS.dump

# 2. Verify row counts before cutover
psql -d publora_restore -c "
  SELECT (SELECT count(*) FROM users) u, (SELECT count(*) FROM workspaces) w,
         (SELECT count(*) FROM posts) p, (SELECT count(*) FROM workspace_kv) kv,
         (SELECT count(*) FROM system_settings WHERE key LIKE 'gs:%') gs;"

# 3. If verified, either rename DBs or point DATABASE_URL at the restored DB:
#    ALTER DATABASE publora RENAME TO publora_old;
#    ALTER DATABASE publora_restore RENAME TO publora;

# 4. Restore media bytes
mkdir -p data/uploads
tar -xzf backups/uploads-YYYYMMDD-HHMMSS.tar.gz -C data

# 5. Start server and smoke test
DB_DRIVER=pg DATABASE_URL=postgres://postgres:postgres@localhost:5432/publora \
  SHARED_STATE_DRIVER=pg npx tsx server.ts
TEST_BASE_URL=http://localhost:3000 npx tsx tests/wp10-http-pg-smoke.mts
```

## Verification queries (sanity after restore/migration)

```sql
-- Tenant data present
SELECT count(*) FROM workspaces;
SELECT count(*) FROM workspace_kv;

-- Global stores hydrated
SELECT key FROM system_settings WHERE key LIKE 'gs:%';
-- expected: gs:system_settings, gs:oauth_config, gs:media_assets (+ any created)

-- Auth integrity: sessions reference real users
SELECT count(*) FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE u.id IS NULL;
-- expected: 0

-- Orphan check (pre-existing known issue): workspaces whose owner user is missing
SELECT w.legacy_id FROM workspaces w
WHERE NOT EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id);
```

## Known gaps

- `pg_dump` does NOT include `data/uploads/` bytes — always pair with the tar step.
- Point-in-time recovery (PITR) requires WAL archiving — not configured; dumps are
  snapshot-level only.
- The pre-cutover orphan workspace `ws_sso_f9e58107eed6` exists in the JSON
  backup only; it was intentionally skipped by migration (missing owner FK).
