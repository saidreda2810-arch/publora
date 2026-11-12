# Publora Database Schema V2 (PostgreSQL)

**Status:** DRAFT — awaiting owner approval before any migration is written (plan T1.1).
**Source:** `PUBLORA_REMEDIATION_PLAN.md` §T1.1, mapped against the actual entities in
`server/saasDb.ts`, `server/oauthStore.ts`, and `server/publishEngine.ts`.

## Design principles

- **Multi-tenant by `workspace_id`** on every business table; `users`/`sessions`/`auth_tokens` are global.
- **`posts` + `post_targets` split** — one post row holds shared content; one target row per
  (social_account × platform) so partial publish success is representable.
- **Secrets never stored plaintext** — session/token columns hold SHA-256 hashes; OAuth tokens
  stay AES-256-GCM encrypted (T0.8) in `encrypted_token` columns.
- **Optimistic concurrency** — `version` integer on mutable aggregates; `post_targets` uses
  `lock_id`/`locked_at` + `SKIP LOCKED` for the scheduler.
- **Soft-delete/audit** — `audit_logs` monthly-partitioned; `security_events` kept ≥ 12 months.
- **IDs** — `uuid` PKs (`gen_random_uuid()`); legacy JSON string IDs migrated into `legacy_id`
  columns for traceability.

## Enum types

```sql
CREATE TYPE user_role        AS ENUM ('user','creator','admin','super_admin','platform_admin','god');
CREATE TYPE user_status      AS ENUM ('active','suspended','pending_verification');
CREATE TYPE workspace_role   AS ENUM ('owner','admin','editor','viewer');
CREATE TYPE member_status    AS ENUM ('active','invited','suspended');
CREATE TYPE plan_tier        AS ENUM ('free','starter','growth','pro','enterprise');
CREATE TYPE billing_cycle    AS ENUM ('monthly','yearly');
CREATE TYPE subscription_status AS ENUM ('trialing','active','past_due','canceled','incomplete');
CREATE TYPE provider         AS ENUM ('youtube','facebook','instagram','tiktok','google_drive');
CREATE TYPE account_status   AS ENUM ('connected','expired','revoked','needs_reconnect','error');
CREATE TYPE brand_status     AS ENUM ('active','archived');
CREATE TYPE post_status      AS ENUM ('draft','scheduled','publishing','published','failed','cancelled','needs_reconnect');
CREATE TYPE post_target_status AS ENUM ('scheduled','publishing','published','failed','cancelled','needs_reconnect');
CREATE TYPE media_kind       AS ENUM ('video','image','audio','document','other');
CREATE TYPE automation_status AS ENUM ('draft','active','paused','archived');
CREATE TYPE token_type       AS ENUM ('email_verification','password_reset','magic_link','email_change','workspace_invite');
CREATE TYPE security_severity AS ENUM ('info','low','medium','high','critical');
```

## Core identity & access

```sql
CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id        text UNIQUE,               -- usr_* from JSON store
  email            citext NOT NULL UNIQUE,    -- lowercase enforced
  password_hash    text,                      -- NULL for future OAuth-only users
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
CREATE INDEX users_status_idx ON users (status);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,           -- SHA-256 of raw cookie token
  ip          inet,
  user_agent  text,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx    ON sessions (user_id);
CREATE INDEX sessions_expiry_idx  ON sessions (expires_at) WHERE revoked_at IS NULL;

CREATE TABLE auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        token_type NOT NULL,
  token_hash  text NOT NULL,                  -- SHA-256; UNIQUE per type below
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  email       citext,                         -- for pre-registration flows
  payload     jsonb,                          -- e.g. pending email change target
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  attempts    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX auth_tokens_hash_idx ON auth_tokens (type, token_hash);
CREATE INDEX auth_tokens_expiry_idx ON auth_tokens (expires_at) WHERE used_at IS NULL;

CREATE TABLE password_reset_requests (       -- optional throttle/audit helper
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_ip inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

## Workspaces & members

```sql
CREATE TABLE workspaces (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id      text UNIQUE,                 -- ws_*
  name           text NOT NULL,
  slug           text NOT NULL,
  owner_id       uuid NOT NULL REFERENCES users(id),
  plan           plan_tier NOT NULL DEFAULT 'free',
  billing_cycle  billing_cycle NOT NULL DEFAULT 'monthly',
  subscription_status subscription_status NOT NULL DEFAULT 'active',
  trial_ends_at  timestamptz,
  current_period_end timestamptz,
  settings       jsonb NOT NULL DEFAULT '{}',
  state_version  bigint NOT NULL DEFAULT 0,   -- replaces T1.0 JSON counter
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug)
);
CREATE INDEX workspaces_owner_idx ON workspaces (owner_id);

CREATE TABLE workspace_members (
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
CREATE INDEX workspace_members_user_idx ON workspace_members (user_id);

CREATE TABLE workspace_invitations (
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
CREATE INDEX ws_invites_email_idx ON workspace_invitations (email) WHERE accepted_at IS NULL;
```

## Content model

```sql
CREATE TABLE brands (
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
CREATE INDEX brands_ws_idx ON brands (workspace_id);

CREATE TABLE projects (
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
CREATE INDEX projects_ws_idx ON projects (workspace_id);

CREATE TABLE content_categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  color        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE media_assets (                  -- replaces /uploads + data-URLs
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id    text,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_id     uuid REFERENCES brands(id) ON DELETE SET NULL,
  uploaded_by  uuid REFERENCES users(id),
  storage_key  text NOT NULL,                -- object-storage key (T1.5)
  original_name text,
  mime         text NOT NULL,
  size_bytes   bigint NOT NULL,
  sha256       text,
  kind         media_kind NOT NULL DEFAULT 'video',
  duration_sec numeric,
  width        int,
  height       int,
  status       text NOT NULL DEFAULT 'ready',-- ready|quarantined|deleted
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_assets_ws_idx ON media_assets (workspace_id, created_at DESC);
CREATE UNIQUE INDEX media_assets_sha_idx ON media_assets (workspace_id, sha256) WHERE sha256 IS NOT NULL;

CREATE TABLE videos (
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
  status         text NOT NULL DEFAULT 'uploaded', -- uploaded|analyzing|ready|archived
  metadata       jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX videos_ws_idx ON videos (workspace_id, created_at DESC);
CREATE INDEX videos_brand_idx ON videos (brand_id);

-- Per-workspace key/value blob retained ONLY for entities not yet migrated
-- (recommendations, experiments, autopilotConfig, calendar views, etc.).
-- Shrinks over time as T1.4 moves each collection to real tables.
CREATE TABLE workspace_kv (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key          text NOT NULL,
  value        jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, key)
);
```

## Social accounts & publishing

```sql
CREATE TABLE social_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id        text,
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, -- direct tenant key (SEC fix)
  brand_id         uuid REFERENCES brands(id) ON DELETE SET NULL,
  provider         provider NOT NULL,
  platform_account_id text,                 -- YouTube channel id, FB page id, …
  account_name     text,
  handle           text,
  avatar_url       text,
  encrypted_token  text,                    -- AES-256-GCM blob (T0.8)
  token_key_version int NOT NULL DEFAULT 1,
  scopes           text[] NOT NULL DEFAULT '{}',
  status           account_status NOT NULL DEFAULT 'connected',
  token_expires_at timestamptz,
  metadata         jsonb NOT NULL DEFAULT '{}',
  connected_by     uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX social_accounts_ws_idx ON social_accounts (workspace_id, provider);
CREATE INDEX social_accounts_brand_idx ON social_accounts (brand_id);
-- One live connection per (workspace, provider, platform account)
CREATE UNIQUE INDEX social_accounts_unique_idx
  ON social_accounts (workspace_id, provider, platform_account_id)
  WHERE status <> 'revoked';

CREATE TABLE posts (
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
  version        int NOT NULL DEFAULT 1,    -- optimistic concurrency
  settings       jsonb NOT NULL DEFAULT '{}',
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_ws_status_idx ON posts (workspace_id, status, scheduled_at);
CREATE INDEX posts_brand_idx ON posts (brand_id);

CREATE TABLE post_targets (
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
  external_id       text,                   -- platform-side post id
  external_url      text,
  error_code        text,
  error_message     text,
  idempotency_key   uuid NOT NULL DEFAULT gen_random_uuid(),
  payload           jsonb NOT NULL DEFAULT '{}', -- per-platform caption/hashtags overrides
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, social_account_id)
);
-- Scheduler hot path: due scheduled targets
CREATE INDEX post_targets_due_idx ON post_targets (scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX post_targets_ws_idx ON post_targets (workspace_id, status);
CREATE INDEX post_targets_lock_idx ON post_targets (locked_at)
  WHERE lock_id IS NOT NULL;

CREATE TABLE post_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_target_id uuid NOT NULL REFERENCES post_targets(id) ON DELETE CASCADE,
  type           text NOT NULL,              -- scheduled|claimed|attempt|success|failure|retry|cancelled
  payload        jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX post_events_target_idx ON post_events (post_target_id, created_at);
```

## Analytics

```sql
CREATE TABLE analytics_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_target_id   uuid REFERENCES post_targets(id) ON DELETE CASCADE,
  social_account_id uuid REFERENCES social_accounts(id) ON DELETE CASCADE,
  video_id         uuid REFERENCES videos(id) ON DELETE CASCADE,
  metric           text NOT NULL,            -- views|likes|comments|shares|watch_time|…
  value            numeric NOT NULL,
  period_start     timestamptz,
  period_end       timestamptz,
  source           text NOT NULL DEFAULT 'sync', -- sync|manual|estimate
  synced_at        timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_ws_metric_idx ON analytics_snapshots (workspace_id, metric, synced_at DESC);
CREATE UNIQUE INDEX analytics_dedupe_idx ON analytics_snapshots
  (COALESCE(post_target_id::text, ''), COALESCE(social_account_id::text, ''),
   COALESCE(video_id::text, ''), metric, period_start)
  WHERE period_start IS NOT NULL;
```

## Automation

```sql
CREATE TABLE automation_workflows (
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
CREATE INDEX automation_ws_idx ON automation_workflows (workspace_id, status);

CREATE TABLE automation_executions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  uuid NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'running', -- running|success|failed|awaiting_approval|cancelled
  trigger_payload jsonb NOT NULL DEFAULT '{}',
  result       jsonb,
  error        text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX automation_exec_ws_idx ON automation_executions (workspace_id, started_at DESC);

CREATE TABLE automation_approvals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES automation_executions(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending', -- pending|approved|rejected|expired
  decided_by   uuid REFERENCES users(id),
  decided_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

## Integrations

```sql
CREATE TABLE drive_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id),
  google_account   text,
  encrypted_token  text NOT NULL,             -- AES-256-GCM (T0.8)
  token_expires_at timestamptz,
  scopes           text[] NOT NULL DEFAULT '{}',
  status           account_status NOT NULL DEFAULT 'connected',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drive_conn_ws_idx ON drive_connections (workspace_id);

CREATE TABLE drive_imports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id  uuid NOT NULL REFERENCES drive_connections(id) ON DELETE CASCADE,
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  drive_file_id  text NOT NULL,
  name           text,
  mime           text,
  size_bytes     bigint,
  media_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'pending', -- pending|imported|failed
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, drive_file_id)
);
```

## Ops: audit, security, settings, outbox

```sql
-- Monthly range partitioning applied at creation time (see migration notes).
CREATE TABLE audit_logs (
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
CREATE INDEX audit_logs_ws_idx ON audit_logs (workspace_id, created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, created_at DESC);

CREATE TABLE security_events (
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
CREATE INDEX security_events_created_idx ON security_events (created_at DESC);

CREATE TABLE system_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

CREATE TABLE outbox_emails (                 -- T2: durable email queue
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email     citext NOT NULL,
  template     text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}',
  status       text NOT NULL DEFAULT 'pending', -- pending|sent|failed
  attempts     int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz
);
CREATE INDEX outbox_due_idx ON outbox_emails (next_attempt_at)
  WHERE status = 'pending';

CREATE TABLE notifications (
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
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;
```

## Entity mapping (JSON → Postgres, for T1.2)

| JSON location | Target |
|---|---|
| `users[]` | `users` |
| `sessions[]` | `sessions` (token_hash = sha256(raw)) |
| `verificationTokens[]` | `auth_tokens` (type mapped; expired/used dropped) |
| `workspaces[]` + `workspaceMembers[]` + `workspaceInvitations[]` | same-named tables |
| `workspaceData[ws].brands[]` | `brands` |
| `…projects[]`, `…categories[]` | `projects`, `content_categories` |
| `…videos[]` | `videos` (+ `media_assets` for file-backed assets) |
| `…accounts[]` / oauthStore connections | `social_accounts` (encrypted_token preserved) |
| `…posts[]` | `posts` + `post_targets` (one per platform/account pair) |
| `…analytics[]` | `analytics_snapshots` |
| `…automationWorkflows/Executions` | `automation_workflows` / `automation_executions` |
| `drive_connections` | `drive_connections` |
| `auditLogs[]`, `securityEvents[]` | `audit_logs`, `security_events` |
| remaining blob keys | `workspace_kv` (temporary, per-key) |
| data-URL avatars / inline media | object storage + `media_assets` row |

## Migration notes

1. **Extensions:** `citext`, `pgcrypto` (`gen_random_uuid()`), `btree_gist` (if needed).
2. **Partitions:** create monthly partitions for `audit_logs`/`security_events` via a
   scheduled job (`pg_partman` optional); retention policy drops > 12 months (audit) —
   security events retained longer per T-plan.
3. **Backfill:** `state_version` seeded from T1.0 `stateVersions` counters.
4. **Rollback:** migrations are additive-first; JSON store remains read-only archive until
   T1.3 flag flips and soak period passes.
