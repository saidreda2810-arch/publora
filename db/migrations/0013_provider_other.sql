-- 0013_provider_other.sql — workspace-state accounts/posts can carry platform
-- values outside the original enum (e.g. 'linkedin', 'x', 'unknown'). Without
-- a catch-all the whole workspace-state save fails with 22P02.
ALTER TYPE provider ADD VALUE IF NOT EXISTS 'other';
