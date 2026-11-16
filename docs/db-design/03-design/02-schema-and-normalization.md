# 03.2 — Schema & Normalization

**Canonical DDL:** `db/migrations/0001_schema_v2.sql` (already written & dry-run-validated; copied to `03-design/schema.sql`). Doc: `docs/DATABASE_SCHEMA_V2.md`.

## Entity map (legacy → new)

| Legacy location | New table(s) | Notes |
| --- | --- | ---  |
| `users[]` | `users` | password_hash/salt stay server-only; `preferences`→jsonb; `pendingEmail` column |
| `sessions[]` | `sessions` | `token_hash` UNIQUE; `ip`,`user_agent` indexed for "active sessions" UI |
| `verificationTokens[]` | `auth_tokens` | typed (email_verification/password_reset/email_change/magic_link), hashed, expiry + attempt_count |
| `workspaces[]` | `workspaces` | + `state_version INT` for optimistic concurrency (replaces in-JSON counter) |
| `workspaceMembers[]` | `workspace_members` | UNIQUE(workspace_id,user_id); role enum — **see D-ROLE below** |
| invitations (embedded/derived) | `workspace_invitations` | hashed token, expiry |
| `workspaceData.brands[]` | `brands` | **image fields extracted to `media_assets`** — `logo_url/avatar_url/cover_image_url` become `media_asset_id` FKs after media migration |
| `.projects[]` | `projects` | FK brand_id |
| `.videos[]` | `videos` | FK brand/project; `file_url` → `media_asset_id` |
| `.accounts[]` | `social_accounts` | **reconciles blob-shape vs OAuth-store shape** (see D-ACCT) |
| `.posts[]` | `posts` + `post_targets` | **split**: post = content/schedule; target = per-platform status/url/errors — fixes partial-success ambiguity |
| `.analytics[]`, `.recommendations[]`, `.experiments[]` | `analytics_snapshots` (+ kv for sparse ones) | time-series → snapshots table |
| `.automationWorkflows/Executions/Rules/Logs` | `automation_workflows`, `automation_executions`, `automation_approvals` | rules/logs → `workspace_kv` until proven hot |
| `.categories/.campaigns/.contentPillars/.contentIdeas/.postComments/.calendarSavedViews` | `workspace_kv` (transition) | normalize later only if they become hot |
| `.calendarSettings/.autopilotConfig/.queuePaused/.activeBrandId/.savedStrategy/.aiVideoResults` | `workspace_kv` or dedicated small tables | settings → `workspace_settings` jsonb column candidate |
| `social_connections.json` | `social_accounts` token columns | **encrypted** access/refresh tokens + `token_expires_at`, `key_version` for rotation |
| `media_catalog.json` + `uploads/` | `media_assets` + object storage | metadata in PG, bytes in S3/R2 |
| `auditLogs[]` | `audit_logs` (partitioned) | append-only; 90-day retention suggested |
| `securityEvents[]` | `security_events` (partitioned) | append-only; 1-year retention suggested |
| `oauth_config.json`, env | **NOT in DB** | secrets stay in env/KMS |
| scheduler state | `scheduled_jobs`-style claim via `posts`/`automation_executions` row locks | no separate table needed initially |
| rate limits / brute-force / OAuth attempts / upload sessions | **Redis** (or PG fallback tables) | see 03.5 |

## Normalization decisions

- **3NF for core entities** (users, workspaces, brands, posts, targets, accounts, media).
- **Deliberate denormalization:** `posts` keeps `content_snapshot jsonb` (immutable copy of caption/hashtags at schedule time) — avoids join cost and preserves history if template changes.
- **`post_targets` split** is the key structural fix: one post → N platform targets, each with own status (`pending/scheduled/publishing/published/failed`), `platform_post_id`, `post_url`, `error`, `attempt_count`. Matches how `publishEngine` actually tracks per-platform outcomes.
- **`workspace_kv` is transitional**, not permanent: holds un-normalized collections during Phase-2; each key whitelisted (same list as T1.0). Drop keys as T1.4 entity endpoints land.

## Open schema decisions (need owner sign-off — carried to final report)

| ID | Question | Options |
| --- | --- | ---  |
| D-ROLE | Member role vocabulary: FE has `manager/publisher/analyst/viewer`, server+DDL has `owner/admin/editor/viewer` | (a) extend enum to union, (b) map FE roles→server roles at boundary — **recommend (b)** |
| D-ACCT | Account model: blob `accounts[]` vs `SocialConnectionAccount` vs UI `SocialAccount` — 3 shapes | canonical = UI `SocialAccount`; OAuth metadata joins via `social_accounts.external_account_id`; blob extras → jsonb `metadata` |
| D-IMG | Brand images: replace `logo_url` text with `media_asset_id` FK vs keep URL string + separate asset row | **recommend FK** — enables signed URLs, dedup by sha256, quota accounting |
| D-REGION | Multi-region ask vs cheapest budget | single primary region + CDN media (recommended) vs paid multi-region |
| D-JSONB | `workspace_kv.value` as jsonb vs text | **jsonb** (already in DDL) — queryable during transition |
