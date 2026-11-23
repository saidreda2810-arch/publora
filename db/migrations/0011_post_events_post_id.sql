-- 0011_post_events_post_id.sql — allow post-level lifecycle events.
--
-- post_events previously required post_target_id (per-platform). The
-- publishing engine records post-level stages (claimed/uploading/publishing/
-- completed/failed) before platform resolution, so events need a post_id
-- path. post_target_id becomes nullable; post_id added for post-scoped events.

ALTER TABLE post_events ALTER COLUMN post_target_id DROP NOT NULL;
ALTER TABLE post_events ADD COLUMN IF NOT EXISTS post_id uuid REFERENCES posts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS post_events_post_idx ON post_events (post_id, created_at);
