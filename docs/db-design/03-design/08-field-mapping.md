# 03.8 — Legacy → New Field Mapping

Every current field → target column or explicit removal reason. Sources: `src/types/*`, `data_inventory.json` field profiles, `0001_schema_v2.sql`. Format: `legacy.path → table.column (transform)`.

## users[] → users

| Legacy | New | Transform |
| --- | --- | ---  |
| id | id (uuid PK) + legacy_id | new uuid; keep `usr_*` in legacy_id |
| email | email | lower(); unique |
| fullName | full_name | — |
| avatarUrl | avatar_media_id? | if data:/uploads path → media_assets row; else keep as external URL text in `avatar_url` |
| role | role | enum map (user_role) |
| isEmailVerified | email_verified | — |
| status | status | enum map |
| mfaEnabled | — | **REMOVED** (MFA disabled T0.3; re-add when real MFA ships) |
| createdAt / lastLoginAt | created_at / last_login_at | timestamptz |
| username, phone, bio, country, city, timezone, language, dateFormat, timeFormat | same-name snake cols | nullable |
| pendingEmail | pending_email | — |
| preferences | preferences jsonb | passthrough |
| passwordHash / salt | password_hash / password_salt | **never selected to client** |

## sessions[] → sessions

id→legacy_id; userId→user_id FK; token→**token_hash** (already hashed at rest; store hash, lookup by hash); createdAt/expiresAt→timestamptz; ip,userAgent passthrough; **+ revoked_at** (new).

## verificationTokens[] → auth_tokens

id→legacy_id; userId→user_id; type→type enum; token→token_hash; createdAt/expiresAt; **+ attempt_count, consumed_at** (new, T0.18).

## workspaces[] → workspaces

id→uuid+legacy_id; name; slug unique; ownerId→owner_id FK; plan→plan enum; billingCycle→billing_cycle; createdAt; settings→settings jsonb; **+ state_version** (replaces JSON counter).

## workspaceMembers[] → workspace_members

id→legacy_id; workspaceId→workspace_id FK; userId→user_id FK; role→role (**D-ROLE mapping**); joinedAt→joined_at; invitedEmail→invited_email (nullable).

## workspaceData blob → tables + workspace_kv

### brands[] → brands

id→uuid+legacy_id; name; description; color; industry; customIndustry→custom_industry; website; secondaryColor→secondary_color; brandGuidelines→brand_guidelines; voiceProfile→voice_profile jsonb; timezone; defaultLanguage→default_language; status; createdAt/updatedAt.
- **avatarUrl/logoUrl/coverImageUrl → *_media_id FK → media_assets** (D-IMG): data-URL bytes extracted to object storage first; if extraction fails for an image, keep original string in `legacy_image_url` text col + flag.

### projects[] → projects

id→legacy_id; brandId→brand_id FK; name; description; status enum; dates; **+ workspace_id denormalized** for tenant scoping.

### videos[] → videos

id→legacy_id; brandId/projectId FKs; title; fileUrl→**media_id FK** (or file_url text if external); duration/thumbnails metadata cols; status.

### accounts[] → social_accounts

Blob shape is sparse; canonical = UI `SocialAccount`. Map: id→legacy_id; brandId→brand_id; platform→provider enum; accountName/handle; email; avatarUrl→avatar_media_id?; isConnected/connectionStatus→connection_status enum; tokenExpiresAt/tokenValid/requiresReconnection→same; permissions/apiPermissions→permissions jsonb; channels→channels jsonb (or child table later); rateLimitRemaining/statusMessage→metadata jsonb; **+ workspace_id, external_account_id** (from social_connections.json join, nullable until OAuth reconnect); **encrypted token cols NULL until OAuth re-connect** (I-9: accounts without tokens marked `requires_reconnection=true`).

### posts[] → posts + post_targets

Post-level: id→legacy_id; workspace_id; brandId→brand_id; projectId→project_id?; videoId→video_id?; content fields (caption, hashtags, title, description)→cols + **content_snapshot jsonb**; schedulingMode→scheduling_mode; scheduledTime→scheduled_time; status→status enum; reviewStatus→review_status; publishOperationId→publish_operation_id; retryCount/nextRetryAt→cols; createdAt/updatedAt; **+ state_version linkage via workspace**.

Per-platform entries inside post (channelPlatforms/platforms[] + publishingEvents[] + platformPostId/postUrl/accountId) → **post_targets** rows: post_id FK; platform enum; account_id FK?; status; platform_post_id; post_url; error; attempt_count; scheduled_time; published_at; **UNIQUE(post_id,platform,account_id)**.

### Remaining blob keys → workspace_kv (transition) or small tables

| Blob key | Target |
| --- | ---  |
| categories, campaigns, contentPillars, contentIdeas, postComments, calendarSavedViews, videoFolders | `workspace_kv` key=collection name (normalize in T1.4 if hot) |
| automationWorkflows, automationExecutions | dedicated tables (already in DDL) |
| automationRules, automationLogs | `workspace_kv` (logs → could go audit-ish table later) |
| calendarSettings, autopilotConfig, queuePaused, activeBrandId, savedStrategy | `workspace_kv` (or `workspace_settings` jsonb merge — decide at impl) |
| aiVideoResults, recommendations, experiments, analytics | `analytics_snapshots` for analytics; rest `workspace_kv` |

## social_connections.json → social_accounts (token columns)

provider→provider; externalAccountId→external_account_id; tokens→**encrypted cols**; tokenExpiresAt; permissions/channels→jsonb; connectionStatus/statusMessage/dates→cols. Join to blob accounts via (workspace_id, provider, external_account_id) or legacy_id where present.

## media_catalog.json + uploads/ → media_assets + object storage

catalog id→legacy_id; filename/mime/size→cols; path→object_key; workspaceId→workspace_id; sha256 computed at extraction; **bytes moved to bucket**.

## auditLogs[] → audit_logs (partitioned)

id→legacy_id; workspaceId?→workspace_id nullable; userId→actor_id nullable; action; details/metadata→jsonb; ip; createdAt→created_at (partition key). **Cap 1000→partition retention.**

## securityEvents[] → security_events (partitioned)

same pattern; event_type enum-ish text; **1-year retention**.

## systemSettings → app_settings table (or env)

7 keys — small; `app_settings(key PK, value jsonb)`.

## Removed fields (explicit)

| Field | Reason |
| --- | ---  |
| `users.mfaEnabled` | MFA disabled pending real implementation (T0.3) |
| plaintext `sessions.token` | already hash-only; column is token_hash |
| plaintext verification tokens | already hashed |
| `data:` URLs inside brand/user/account image fields | replaced by media_asset refs + object storage |
| `__proto__`/unknown blob keys | rejected by whitelist — never migrated |
| tmp files `saas_db.json.tmp.*` | leaked artifacts — deleted, not migrated |
