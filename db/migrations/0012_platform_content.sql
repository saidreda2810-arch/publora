-- 0012_platform_content.sql — persisted mirror of content that exists ON
-- connected platforms (scheduled uploads + published posts). Synced from
-- provider APIs; powers Queue/History/Calendar without live calls per view.

CREATE TABLE IF NOT EXISTS platform_content_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  social_account_id  text NOT NULL,           -- oauth account legacy id (gs store)
  platform           text NOT NULL,
  channel_id         text,
  platform_video_id  text NOT NULL,
  title              text NOT NULL DEFAULT '',
  url                text,
  thumbnail_url      text,
  status             text NOT NULL DEFAULT 'unknown',  -- scheduled|published|processing|private
  privacy_status     text,
  scheduled_at       timestamptz,
  published_at       timestamptz,
  duration_sec       integer,
  views              bigint,
  likes              integer,
  comments           integer,
  payload            jsonb NOT NULL DEFAULT '{}',
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_synced_at     timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (social_account_id, platform_video_id)
);
CREATE INDEX IF NOT EXISTS pci_ws_status_idx ON platform_content_items (workspace_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS pci_platform_idx ON platform_content_items (workspace_id, platform, published_at DESC);
