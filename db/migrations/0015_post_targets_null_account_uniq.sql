-- 0015_post_targets_null_account_uniq.sql — fix silent target loss.
--
-- 0010's unique index keyed on COALESCE(social_account_id, zero-uuid): every
-- target WITHOUT a resolved account collapsed to the same sentinel, so only
-- the first platform target per post was inserted and the rest were dropped
-- by ON CONFLICT DO NOTHING. Adding platform to the key gives each
-- account-less platform its own row.
DROP INDEX IF EXISTS post_targets_post_account_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS post_targets_post_account_uniq
  ON post_targets (post_id, COALESCE(social_account_id, '00000000-0000-0000-0000-000000000000'::uuid), platform);
