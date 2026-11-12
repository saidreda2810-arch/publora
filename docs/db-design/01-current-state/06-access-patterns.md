# 06 — Access Patterns

Full call-graph map: `03-data-access-map.md`. This doc classifies each hot path and maps it to required index/constraint in the target schema.

## Pattern classes observed [READ]

| Class | Where | Frequency | Cost today |
|---|---|---|---|
| **Full-file rewrite** | `saveDatabase()` → write tmp + rename | every mutation | O(file) = **7.5 MB** per write |
| **Full-file parse** | `loadDatabase()` at boot; cache invalidated on every write | per boot + per write | 7.5 MB JSON.parse per save cycle |
| **Workspace blob read-modify-write** | `getWorkspaceData`/`saveWorkspaceData` | per saas API call | deserializes whole blob; shallow merge loses nested diffs |
| **Linear array scans** | `findUserByEmail`, `findSessionByToken` (post-hash), members lookup, token lookup by hash | per auth request | O(n) over ≤220 audit / 53 tokens — trivial now, wrong shape at scale |
| **Scheduler scan** | `setInterval(30s)` iterates all workspaces → posts where `status='scheduled' && scheduledTime<=now` | 2,880×/day | scans JSON blobs in memory; no `FOR UPDATE SKIP LOCKED` → double-publish risk on multi-instance |
| **Debounced state push** | `POST /api/saas/state` (frontend, ~1s debounce) | per user edit | full blob replace per push |
| **Audit append** | `auditLogs` capped 1000, `securityEvents` capped 5000 | per sensitive op | array-slice churn inside the same 7.5 MB file |
| **File I/O** | uploads chunked→final, media catalog JSON, oauth JSON files, tmp sweep | per upload/connect | separate small files — fine |

## Hot path → required index/constraint [INFER from code + RUN counts]

| Hot path | Query shape | Target index / constraint |
|---|---|---|
| Session auth (every authed request) | `WHERE token_hash = $1` | `sessions.token_hash UNIQUE` ✅ in DDL |
| Email login/register | `WHERE lower(email) = $1` | `users.email UNIQUE` (citext or lower index) ✅ |
| Magic-link/OTP verify | `WHERE user_id AND type AND token_hash` + expiry | `auth_tokens(user_id,type,token_hash)` + `expires_at` partial index ✅ |
| Workspace resolution | `WHERE id = $1` per request | PK ✅ |
| Member role check | `WHERE workspace_id AND user_id` | `workspace_members(workspace_id,user_id) UNIQUE` ✅ |
| Scheduler due posts | `WHERE status='scheduled' AND scheduled_time <= now() AND workspace_id = … FOR UPDATE SKIP LOCKED` | `posts(status,scheduled_time)` partial + `post_targets` same ✅ in DDL |
| Automation triggers | `WHERE workspace_id AND enabled` scan every tick | `automation_workflows(workspace_id) WHERE enabled` ✅ |
| Analytics reads | `WHERE workspace_id AND brand_id AND period` | `analytics_snapshots(workspace_id,brand_id,period_start)` ✅ |
| Audit/security append | `INSERT` only + `ORDER BY created_at DESC LIMIT n` | PK + `created_at` index; monthly partitions ✅ |
| Media lookup by url/hash | `WHERE workspace_id AND (file_url OR sha256)` | `media_assets(workspace_id, sha256)` ✅ |
| Blob-compat reads (transition) | `workspace_kv(workspace_id,key)` | PK `(workspace_id,key)` ✅ |

## Write amplification analysis [INFER]

Today: 1 mutation = read 7.5 MB + write 7.5 MB + fsync. With P active users pushing debounced state every ~1s during editing sessions, disk write bandwidth ≈ P × 7.5 MB/s worst case.

Target: row-level writes are O(row). The **only** remaining blob is `workspace_kv` for un-migrated collections — writes there stay O(blob) until T1.4 normalizes them; acceptable during transition because blobs shrink to KBs once brands' base64 moves to object storage.

## Concurrency gaps to fix in design [READ]

1. `saveDatabase` has **no cross-process lock** — two instances = lost updates (single-instance assumption baked in).
2. Scheduler has **no claim/lease** — `FOR UPDATE SKIP LOCKED` required before horizontal scaling.
3. `stateVersions` optimistic check is **per-workspace, in-memory-cached** — fine single-node; under PgRepo becomes `UPDATE … WHERE state_version = base` atomic.
4. Upload sessions + OAuth pending attempts are **in-memory Maps** — break on restart/multi-instance (see 07).
