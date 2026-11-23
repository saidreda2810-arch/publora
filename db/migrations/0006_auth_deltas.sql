-- WP9: columns required for full auth cutover (users/sessions/members/tokens).
-- All additive + nullable/defaulted: safe on existing data.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_salt        text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email        citext;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_format          text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS time_format          text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_updated_at   timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled          boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret           text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at       timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivation_reason  text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at           timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS delete_scheduled_at  timestamptz;

-- Legacy session/member ids so API responses and ownership checks keep working.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS legacy_id text;
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS legacy_id text;
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS custom_role_id text;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_legacy_idx ON sessions (legacy_id) WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ws_members_legacy_idx ON workspace_members (legacy_id) WHERE legacy_id IS NOT NULL;
