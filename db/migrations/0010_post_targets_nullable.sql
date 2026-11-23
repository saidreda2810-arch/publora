-- 0010_post_targets_nullable.sql — allow post_targets without a resolved
-- social account and without a scheduled time.
--
-- Rationale: the workspaceState facade expands every post's channelPlatforms
-- into post_targets rows at save time. A post may legitimately target a
-- platform that has no connected account yet (adapter reports
-- no_connected_account at publish time), and draft/unscheduled posts have no
-- scheduled_at. The previous NOT NULL constraints made ANY such save fail
-- with 23502, silently dropping the whole workspace write.

ALTER TABLE post_targets ALTER COLUMN social_account_id DROP NOT NULL;
ALTER TABLE post_targets ALTER COLUMN scheduled_at DROP NOT NULL;

-- NULL social_account_id rows are distinct under the old UNIQUE(post_id,
-- social_account_id); replace with a COALESCE-based unique index so a post
-- can't accumulate duplicate platform targets.
ALTER TABLE post_targets DROP CONSTRAINT IF EXISTS post_targets_post_id_social_account_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS post_targets_post_account_uniq
  ON post_targets (post_id, COALESCE(social_account_id, '00000000-0000-0000-0000-000000000000'::uuid));
