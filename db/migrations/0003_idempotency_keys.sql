-- 0003_idempotency_keys.sql — WP5: make JSON→PG migration re-runnable.
-- legacy_id unique indexes let ON CONFLICT DO NOTHING actually dedupe.
-- audit/security are partitioned on created_at, so dedupe index must include it.

CREATE UNIQUE INDEX IF NOT EXISTS brands_legacy_id_key        ON brands(legacy_id)        WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS projects_legacy_id_key      ON projects(legacy_id)      WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS videos_legacy_id_key        ON videos(legacy_id)        WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS social_accounts_legacy_key  ON social_accounts(legacy_id) WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_legacy_key      ON media_assets(legacy_id)  WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS posts_legacy_id_key          ON posts(legacy_id)         WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS post_targets_legacy_key      ON post_targets(legacy_id)  WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS automation_wf_legacy_key     ON automation_workflows(legacy_id) WHERE legacy_id IS NOT NULL;

-- Log tables: carry the JSON entry id so re-runs dedupe. Partition key (created_at) included.
ALTER TABLE audit_logs      ADD COLUMN IF NOT EXISTS source_legacy_id text;
ALTER TABLE security_events ADD COLUMN IF NOT EXISTS source_legacy_id text;
CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_dedupe_key      ON audit_logs(source_legacy_id, created_at)      WHERE source_legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS security_events_dedupe_key ON security_events(source_legacy_id, created_at) WHERE source_legacy_id IS NOT NULL;
