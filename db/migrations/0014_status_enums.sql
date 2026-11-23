-- 0014_status_enums.sql — workspace-state payloads carry frontend status
-- values that were missing from the PG enums, failing whole-state saves (22P02).

-- post_status: PostStatus = draft|scheduled|optimizing|publishing|published|failed|paused
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'optimizing';
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'retry_scheduled';
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'idea';
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'pending';

-- account_status: ConnectionStatus values used across the app
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'disconnected';
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'connecting';
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'authorization_pending';
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'not_connected';
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'token_expired';
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'publishing_unavailable';
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'permission_incomplete';
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'reconnection_required';

-- post_target_status mirrors post lifecycle stages
ALTER TYPE post_target_status ADD VALUE IF NOT EXISTS 'optimizing';
ALTER TYPE post_target_status ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE post_target_status ADD VALUE IF NOT EXISTS 'retry_scheduled';
ALTER TYPE post_target_status ADD VALUE IF NOT EXISTS 'processing';
