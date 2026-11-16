# 03.3 — Indexes & Constraints

Already encoded in `0001_schema_v2.sql`; this doc is the **rationale + gaps to add**.

## Constraint checklist (must-have)

| Table | Constraint | Why |
| --- | --- | ---  |
| users | `email UNIQUE` (citext or `lower(email)` unique index) | login lookup; today app-level only |
| sessions | `token_hash UNIQUE NOT NULL` | auth lookup per request |
| auth_tokens | `UNIQUE(user_id,type,token_hash)` + `expires_at` | OTP verify; partial index `WHERE consumed_at IS NULL` |
| workspaces | `slug UNIQUE` | URLs/routing |
| workspace_members | `UNIQUE(workspace_id,user_id)` | role checks; prevents dup joins |
| brands | `UNIQUE(workspace_id, name)`? — **soft**: names can repeat; use `UNIQUE(workspace_id, legacy_id)` for migration only | decide: keep legacy unique, drop after |
| posts | `UNIQUE(workspace_id, legacy_id)` transitional | idempotent re-run safety |
| post_targets | `UNIQUE(post_id, platform, account_id)` | one target per platform/account — prevents double-publish rows |
| media_assets | `UNIQUE(workspace_id, sha256)` | dedup; quota accounting |
| social_accounts | `UNIQUE(workspace_id, provider, external_account_id)` | prevents duplicate connects |
| audit_logs/security_events | `PRIMARY KEY (id, created_at)` composite for partitioning | required by PG declarative partitioning |
| FK `ON DELETE` policy | `RESTRICT` for brands/projects/videos referenced by posts; `CASCADE` for members/sessions/targets | preserve history; never orphan posts |

## Indexes beyond PKs (hot paths from doc 06)

```sql
-- auth (every request)
CREATE INDEX sessions_user_idx ON sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX auth_tokens_lookup ON auth_tokens(user_id, type, expires_at) WHERE consumed_at IS NULL;

-- workspace scoping (every tenant query)
CREATE INDEX posts_ws_sched ON posts(workspace_id, status, scheduled_time)
  WHERE status IN ('scheduled','publishing');
CREATE INDEX post_targets_due ON post_targets(status, scheduled_time)
  WHERE status = 'scheduled';          -- SKIP LOCKED scan
CREATE INDEX brands_ws ON brands(workspace_id);
CREATE INDEX projects_ws_brand ON projects(workspace_id, brand_id);
CREATE INDEX videos_ws_brand ON videos(workspace_id, brand_id);
CREATE INDEX social_accounts_ws ON social_accounts(workspace_id, brand_id);
CREATE INDEX media_assets_ws ON media_assets(workspace_id, brand_id);
CREATE INDEX analytics_ws_period ON analytics_snapshots(workspace_id, brand_id, period_start DESC);
CREATE INDEX automation_exec_ws ON automation_executions(workspace_id, status, scheduled_time);

-- logs (partitioned → index per partition or on parent pre-PG11 style)
CREATE INDEX audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX security_events_created ON security_events(created_at DESC);
CREATE INDEX security_events_type ON security_events(event_type, created_at DESC);

-- transition
CREATE INDEX workspace_kv_ws ON workspace_kv(workspace_id);
```

## Deliberately NOT indexed

- `content_snapshot` jsonb (write-once, read-with-post)
- `workspace_kv.value` contents (blob during transition; add GIN only if a specific key becomes query-hot)
- `audit_logs.metadata` jsonb (forensic search is rare; can add GIN later)

## Constraints to add during implementation (not yet in DDL — flag)

1. `CHECK (char_length(email) <= 320)` on users/invitations.
2. `CHECK (status IN (...))` already via enums — verify every enum covers FE vocabulary (D-ROLE).
3. `posts.scheduled_time` sanity `CHECK (scheduled_time > created_at - interval '1 day')`? — optional, low value; skip.
4. `media_assets.size_bytes >= 0`, `mime_type` whitelist enforced app-level (already in uploadPolicy).
5. **Exclusion constraint** for overlapping scheduled targets per account? — overkill; app-level queue prevents.
