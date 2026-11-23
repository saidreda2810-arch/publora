-- WP10: extend role enums to cover application-level roles used by
-- workspace members, invitations, and platform users.
ALTER TYPE workspace_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE workspace_role ADD VALUE IF NOT EXISTS 'publisher';
ALTER TYPE workspace_role ADD VALUE IF NOT EXISTS 'analyst';
ALTER TYPE workspace_role ADD VALUE IF NOT EXISTS 'member';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'moderator';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'support';
