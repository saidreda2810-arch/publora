-- Publora Schema V2 — initial Postgres migration (T1.1 approved design).
-- Idempotent-ish: safe to run once on an empty database.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user','creator','admin','super_admin','platform_admin','god');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active','suspended','pending_verification');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE workspace_role AS ENUM ('owner','admin','editor','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE member_status AS ENUM ('active','invited','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE plan_tier AS ENUM ('free','starter','growth','pro','enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE billing_cycle AS ENUM ('monthly','yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('trialing','active','past_due','canceled','incomplete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE provider AS ENUM ('youtube','facebook','instagram','tiktok','google_drive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('connected','expired','revoked','needs_reconnect','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE brand_status AS ENUM ('active','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE post_status AS ENUM ('draft','scheduled','publishing','published','failed','cancelled','needs_reconnect');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE post_target_status AS ENUM ('scheduled','publishing','published','failed','cancelled','needs_reconnect');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE media_kind AS ENUM ('video','image','audio','document','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE automation_status AS ENUM ('draft','active','paused','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE token_type AS ENUM ('email_verification','password_reset','magic_link','email_change','workspace_invite');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE security_severity AS ENUM ('info','low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ IDENTITY ============
CREATE TABLE IF NOT EXISTS users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id        text UNIQUE,
  email            citext NOT NULL UNIQUE,
  password_hash    text,
  full_name        text,
  avatar_url       text,
  username         text,
  phone            text,
  bio              text,
  country          text,
  city             text,
  timezone         text,
  language         text DEFAULT 'en',
  role             user_role NOT NULL DEFAULT 'user',
  status           user_status NOT NULL DEFAULT 'pending_verification',
  is_email_verified boolean NOT NULL DEFAULT false,
  preferences      jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  last_login_at    timestamptz
);
CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);

CREATE TABLE IF NOT EXISTS sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  ip          inet,
  user_agent  text,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        token_type NOT NULL,
  token_hash  text NOT NULL,
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  email       citext,
  payload     jsonb,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  attempts    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_tokens_hash_idx ON auth_tokens (type, token_hash);
CREATE INDEX IF NOT EXISTS auth_tokens_expiry_idx ON auth_tokens (expires_at) WHERE used_at IS NULL;

-- ============ WORKSPACES ============
CREATE TABLE IF NOT EXISTS workspaces (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id      text UNIQUE,
  name           text NOT NULL,
  slug           text NOT NULL UNIQUE,
  owner_id       uuid NOT NULL REFERENCES users(id),
  plan           plan_tier NOT NULL DEFAULT 'free',
  billing_cycle  billing_cycle NOT NULL DEFAULT 'monthly',
  subscription_status subscription_status NOT NULL DEFAULT 'active',
  trial_ends_at  timestamptz,
  current_period_end timestamptz,
  settings       jsonb NOT NULL DEFAULT '{}',
  state_version  bigint NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspaces_owner_idx ON workspaces (owner_id);

CREATE TABLE IF NOT EXISTS workspace_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         workspace_role NOT NULL DEFAULT 'editor',
  status       member_status NOT NULL DEFAULT 'active',
  invited_by   uuid REFERENCES users(id),
  joined_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members (user_id);

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        citext NOT NULL,
  role         workspace_role NOT NULL DEFAULT 'editor',
  token_hash   text NOT NULL UNIQUE,
  invited_by   uuid NOT NULL REFERENCES users(id),
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ws_invites_email_idx ON workspace_invitations (email) WHERE accepted_at IS NULL;

-- ============ CONTENT ============
CREATE TABLE IF NOT EXISTS brands (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id    text,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  logo_url     text,
  website      text,
  status       brand_status NOT NULL DEFAULT 'active',
  settings     jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS brands_ws_idx ON brands (workspace_id);

CREATE TABLE IF NOT EXISTS projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id    text,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_id     uuid REFERENCES brands(id) ON DELETE SET NULL,
  name         text NOT NULL,
  description  text,
  status       text NOT NULL DEFAULT 'active',
  settings     jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_ws_idx ON projects (workspace_id);

CREATE TABLE IF NOT EXISTS content_categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  color        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS media_assets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id    text,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_id     uuid REFERENCES brands(id) ON DELETE SET NULL,
  uploaded_by  uuid REFERENCES users(id),
  storage_key  text NOT NULL,
  original_name text,
  mime         text NOT NULL,
  size_bytes   bigint NOT NULL,
  sha256       text,
  kind         media_kind NOT NULL DEFAULT 'video',
  duration_sec numeric,
  width        int,
  height       int,
  status       text NOT NULL DEFAULT 'ready',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_assets_ws_idx ON media_assets (workspace_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_sha_idx ON media_assets (workspace_id, sha256) WHERE sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS videos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id      text,
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_id       uuid REFERENCES brands(id) ON DELETE SET NULL,
  project_id     uuid REFERENCES projects(id) ON DELETE SET NULL,
  media_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  title          text NOT NULL,
  description    text,
  category_id    uuid REFERENCES content_categories(id) ON DELETE SET NULL,
  duration_sec   numeric,
  width          int,
  height         int,
  file_size_bytes bigint,
  thumbnail_url  text,
  tags           text[] NOT NULL DEFAULT '{}',
  status         text NOT NULL DEFAULT 'uploaded',
  metadata       jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS videos_ws_idx ON videos (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS videos_brand_idx ON videos (brand_id);

CREATE TABLE IF NOT EXISTS workspace_kv (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key          text NOT NULL,
  value        jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, key)
);

-- ============ SOCIAL & PUBLISHING ============
CREATE TABLE IF NOT EXISTS social_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id        text,
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_id         uuid REFERENCES brands(id) ON DELETE SET NULL,
  provider         provider NOT NULL,
  platform_account_id text,
  account_name     text,
  handle           text,
  avatar_url       text,
  encrypted_token  text,
  token_key_version int NOT NULL DEFAULT 1,
  scopes           text[] NOT NULL DEFAULT '{}',
  status           account_status NOT NULL DEFAULT 'connected',
  token_expires_at timestamptz,
  metadata         jsonb NOT NULL DEFAULT '{}',
  connected_by     uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS social_accounts_ws_idx ON social_accounts (workspace_id, provider);
CREATE INDEX IF NOT EXISTS social_accounts_brand_idx ON social_accounts (brand_id);
CREATE UNIQUE INDEX IF NOT EXISTS social_accounts_unique_idx
  ON social_accounts (workspace_id, provider, platform_account_id)
  WHERE status <> 'revoked';

CREATE TABLE IF NOT EXISTS posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id      text,
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_id       uuid REFERENCES brands(id) ON DELETE SET NULL,
  project_id     uuid REFERENCES projects(id) ON DELETE SET NULL,
  video_id       uuid REFERENCES videos(id) ON DELETE SET NULL,
  title          text,
  caption        text,
  media_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  status         post_status NOT NULL DEFAULT 'draft',
  scheduled_at   timestamptz,
  published_at   timestamptz,
  timezone       text,
  version        int NOT NULL DEFAULT 1,
  settings       jsonb NOT NULL DEFAULT '{}',
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posts_ws_status_idx ON posts (workspace_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS posts_brand_idx ON posts (brand_id);

CREATE TABLE IF NOT EXISTS post_targets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id         text,
  post_id           uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  social_account_id uuid NOT NULL REFERENCES social_accounts(id),
  platform          provider NOT NULL,
  status            post_target_status NOT NULL DEFAULT 'scheduled',
  scheduled_at      timestamptz NOT NULL,
  attempts          int NOT NULL DEFAULT 0,
  max_attempts      int NOT NULL DEFAULT 5,
  next_retry_at     timestamptz,
  lock_id           uuid,
  locked_at         timestamptz,
  external_id       text,
  external_url      text,
  error_code        text,
  error_message     text,
  idempotency_key   uuid NOT NULL DEFAULT gen_random_uuid(),
  payload           jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, social_account_id)
);
CREATE INDEX IF NOT EXISTS post_targets_due_idx ON post_targets (scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS post_targets_ws_idx ON post_targets (workspace_id, status);
CREATE INDEX IF NOT EXISTS post_targets_lock_idx ON post_targets (locked_at)
  WHERE lock_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS post_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_target_id uuid NOT NULL REFERENCES post_targets(id) ON DELETE CASCADE,
  type           text NOT NULL,
  payload        jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS post_events_target_idx ON post_events (post_target_id, created_at);

-- ============ ANALYTICS ============
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_target_id   uuid REFERENCES post_targets(id) ON DELETE CASCADE,
  social_account_id uuid REFERENCES social_accounts(id) ON DELETE CASCADE,
  video_id         uuid REFERENCES videos(id) ON DELETE CASCADE,
  metric           text NOT NULL,
  value            numeric NOT NULL,
  period_start     timestamptz,
  period_end       timestamptz,
  source           text NOT NULL DEFAULT 'sync',
  synced_at        timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_ws_metric_idx ON analytics_snapshots (workspace_id, metric, synced_at DESC);

-- ============ AUTOMATION ============
CREATE TABLE IF NOT EXISTS automation_workflows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id    text,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  trigger      jsonb NOT NULL DEFAULT '{}',
  steps        jsonb NOT NULL DEFAULT '[]',
  status       automation_status NOT NULL DEFAULT 'draft',
  version      int NOT NULL DEFAULT 1,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_ws_idx ON automation_workflows (workspace_id, status);

CREATE TABLE IF NOT EXISTS automation_executions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  uuid REFERENCES automation_workflows(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'running',
  trigger_payload jsonb NOT NULL DEFAULT '{}',
  result       jsonb,
  error        text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX IF NOT EXISTS automation_exec_ws_idx ON automation_executions (workspace_id, started_at DESC);

CREATE TABLE IF NOT EXISTS automation_approvals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES automation_executions(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending',
  decided_by   uuid REFERENCES users(id),
  decided_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============ INTEGRATIONS ============
CREATE TABLE IF NOT EXISTS drive_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id),
  google_account   text,
  encrypted_token  text NOT NULL,
  token_expires_at timestamptz,
  scopes           text[] NOT NULL DEFAULT '{}',
  status           account_status NOT NULL DEFAULT 'connected',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drive_conn_ws_idx ON drive_connections (workspace_id);

CREATE TABLE IF NOT EXISTS drive_imports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id  uuid NOT NULL REFERENCES drive_connections(id) ON DELETE CASCADE,
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  drive_file_id  text NOT NULL,
  name           text,
  mime           text,
  size_bytes     bigint,
  media_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'pending',
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, drive_file_id)
);

-- ============ OPS ============
-- Partitioned parents; monthly partitions created by migration tooling.
CREATE TABLE IF NOT EXISTS audit_logs (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id      uuid,
  user_email   text,
  action       text NOT NULL,
  details      text,
  severity     security_severity NOT NULL DEFAULT 'info',
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS audit_logs_ws_idx ON audit_logs (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action, created_at DESC);

CREATE TABLE IF NOT EXISTS security_events (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id      uuid,
  user_email   text,
  action       text NOT NULL,
  details      text,
  severity     security_severity NOT NULL DEFAULT 'medium',
  ip           inet,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS security_events_created_idx ON security_events (created_at DESC);

CREATE TABLE IF NOT EXISTS system_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS outbox_emails (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email     citext NOT NULL,
  template     text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}',
  status       text NOT NULL DEFAULT 'pending',
  attempts     int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_due_idx ON outbox_emails (next_attempt_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  type         text NOT NULL,
  title        text NOT NULL,
  body         text,
  payload      jsonb NOT NULL DEFAULT '{}',
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

-- ============ PARTITIONS (current + next month + default) ============
-- audit_logs / security_events are RANGE-partitioned on created_at.
DO $$
DECLARE
  m_start date;
  m_end   date;
  part    text;
BEGIN
  FOR i IN 0..1 LOOP
    m_start := date_trunc('month', now())::date + (i || ' months')::interval;
    m_end   := m_start + interval '1 month';
    part    := 'audit_logs_' || to_char(m_start, 'YYYY_MM');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
      part, m_start, m_end);
    part    := 'security_events_' || to_char(m_start, 'YYYY_MM');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF security_events FOR VALUES FROM (%L) TO (%L)',
      part, m_start, m_end);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS audit_logs_default PARTITION OF audit_logs DEFAULT;
CREATE TABLE IF NOT EXISTS security_events_default PARTITION OF security_events DEFAULT;
