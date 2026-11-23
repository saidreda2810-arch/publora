-- 0005_scoped_legacy_ids.sql — WP5 fix: legacy ids are unique PER WORKSPACE,
-- not globally (fixture/demo blobs reuse ids like proj_a1 across workspaces).
-- Replace global legacy_id indexes with composite (workspace_id, legacy_id).

DROP INDEX IF EXISTS brands_legacy_id_key;
DROP INDEX IF EXISTS projects_legacy_id_key;
DROP INDEX IF EXISTS videos_legacy_id_key;
DROP INDEX IF EXISTS social_accounts_legacy_key;
DROP INDEX IF EXISTS media_assets_legacy_key;
DROP INDEX IF EXISTS posts_legacy_id_key;
DROP INDEX IF EXISTS post_targets_legacy_key;
DROP INDEX IF EXISTS automation_wf_legacy_key;

CREATE UNIQUE INDEX IF NOT EXISTS brands_ws_legacy_key        ON brands(workspace_id, legacy_id)        WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS projects_ws_legacy_key      ON projects(workspace_id, legacy_id)      WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS videos_ws_legacy_key        ON videos(workspace_id, legacy_id)        WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS social_accounts_ws_legacy   ON social_accounts(workspace_id, legacy_id) WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_ws_legacy      ON media_assets(workspace_id, legacy_id)  WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS posts_ws_legacy_key         ON posts(workspace_id, legacy_id)         WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS post_targets_ws_legacy_key  ON post_targets(workspace_id, legacy_id)  WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS automation_wf_ws_legacy_key ON automation_workflows(workspace_id, legacy_id) WHERE legacy_id IS NOT NULL;
