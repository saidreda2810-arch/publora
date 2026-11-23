-- 0004_shared_state.sql — WP6: columns needed to back in-memory stores in Postgres.

-- brute_force_state: full GuardRecord semantics (sliding window + escalation)
ALTER TABLE brute_force_state
  ADD COLUMN IF NOT EXISTS first_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_failure_at  timestamptz,
  ADD COLUMN IF NOT EXISTS restriction_strikes integer NOT NULL DEFAULT 0;

-- oauth_attempts: carry the full ConnectionAttempt payload
ALTER TABLE oauth_attempts
  ADD COLUMN IF NOT EXISTS brand_id text,
  ADD COLUMN IF NOT EXISTS payload jsonb;

-- state is the lookup key for pending OAuth attempts
CREATE UNIQUE INDEX IF NOT EXISTS oauth_attempts_state_key ON oauth_attempts(state);
