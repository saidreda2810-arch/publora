-- 0002_phase_a_deltas.sql — WP3 additions on top of 0001_schema_v2.sql
-- Forward-only. Idempotent where practical.

-- Optimistic-concurrency counter for the /state facade (replaces JSON counter).
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS state_version integer NOT NULL DEFAULT 0;

-- Scheduler claiming columns on posts + per-target rows.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS locked_by text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE post_targets ADD COLUMN IF NOT EXISTS locked_by text;
ALTER TABLE post_targets ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE post_targets ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
ALTER TABLE post_targets ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

-- Media foreign keys (D-IMG): brand/user/video image fields reference media_assets.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS logo_media_id uuid REFERENCES media_assets(id) ON DELETE SET NULL;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS avatar_media_id uuid REFERENCES media_assets(id) ON DELETE SET NULL;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS cover_media_id uuid REFERENCES media_assets(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_media_id uuid REFERENCES media_assets(id) ON DELETE SET NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS media_id uuid REFERENCES media_assets(id) ON DELETE SET NULL;

-- Chunked upload sessions moved out of .sessions/ dirs.
CREATE TABLE IF NOT EXISTS upload_sessions (
  id text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_email text,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  chunk_size integer NOT NULL,
  total_chunks integer NOT NULL,
  received_chunks jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS upload_sessions_ws ON upload_sessions(workspace_id, status);
CREATE INDEX IF NOT EXISTS upload_sessions_expiry ON upload_sessions(expires_at) WHERE status = 'active';

-- Automation trigger dedupe survives restarts.
ALTER TABLE automation_workflows ADD COLUMN IF NOT EXISTS last_trigger_hash text;
ALTER TABLE automation_workflows ADD COLUMN IF NOT EXISTS last_triggered_at timestamptz;

-- Shared-state fallback tables (used when Redis is absent — WP7).
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket text NOT NULL,
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, key, window_start)
);
CREATE INDEX IF NOT EXISTS rate_limits_window ON rate_limits(bucket, key, window_start DESC);

CREATE TABLE IF NOT EXISTS brute_force_state (
  scope text NOT NULL,           -- 'ip' | 'account' | 'admin'
  identifier text NOT NULL,      -- ip or account key
  failures integer NOT NULL DEFAULT 0,
  restricted_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, identifier)
);

CREATE TABLE IF NOT EXISTS oauth_attempts (
  id text PRIMARY KEY,
  provider text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  state text NOT NULL,
  pkce_verifier text,
  redirect_after text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oauth_attempts_expiry ON oauth_attempts(expires_at);

-- Email outbox (Phase B prep; harmless if unused).
CREATE TABLE IF NOT EXISTS outbox_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  template text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_emails_pending ON outbox_emails(status, created_at) WHERE status = 'pending';
