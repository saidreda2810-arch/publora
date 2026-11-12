# 03 — Data Access Map

Stores inventoried: `saas_db.json` collections (users, sessions, verificationTokens, workspaces, workspaceMembers, workspaceInvitations, auditLogs, securityEvents, workspaceData[ws] blob, systemSettings, stateVersions), `social_connections.json`, `oauth_config.json`, `media_catalog.json`, `drive_connections.json`, `drive_imports.json`, `upload_policy.json`, `maintenance_tasks.json`, `data/uploads/**`, `data/uploads/.sessions/**`, `data/backups/**`, plus in-memory stores.

R = reads, W = writes, RW = both. Evidence: grep counts + code reads this session [RUN/READ].

## Module × store matrix

| Module | saas_db core* | workspaceData blob | social_connections | oauth_config | media_catalog | drive_*.json | upload_policy | uploads/ disk | .sessions/ | backups/ | In-memory |
|---|---|---|---|---|---|---|---|---|---|---|---|
| authRouter | RW (users, sessions, tokens, ws/members R) | — | — | — | — | — | — | — | — | — | — |
| saasRouter | RW (all collections + settings) | **RW (35 get / 17 save calls)** | R | R | — | — | R/W (upload-policy admin) | R (quota scan) | — | RW (backup create/verify/restore) | Maps for metrics |
| mediaRouter | R (workspaceData.videos for quota?) | R | — | — | RW | — | R | **RW** | RW (file-based sessions) | — | — |
| oauthRouter | R (workspaceData.accounts context) | R | **RW** | **RW** | — | — | — | — | — | — | pendingAttempts Map, rate limiters |
| driveRouter | R | RW (imports→videos?) | — | R (google creds) | RW (import→asset) | **RW** | — | RW (imported files) | — | — | pendingAttempts Map |
| aiRouter | R (workspaceData context) | R | — | — | — | — | — | — | — | — | — |
| scheduler.ts | RW (posts claim/status via blob) | **RW** | R (tokens for publish) | — | — | — | — | R (media exists check) | — | — | setInterval 30s, timers |
| publishEngine.ts | — (pure functions on post objects) | via caller | — | — | — | — | — | — | — | — | — |
| automationEngine.ts | RW | **RW (6 get / 5 save)** | — | — | — | — | — | — | — | — | lastTriggerHash Map |
| bruteForceGuard.ts | — | — | — | — | — | — | — | — | — | — | failure Maps + setInterval cleanup |
| uploadPolicy.ts | — | — | — | — | — | — | **RW** | — | RW (session dirs on disk) | — | — |
| oauthStore.ts | — | — | **RW** | **RW** | — | — | — | — | — | — | token cache?, setInterval (cleanup?) |
| security.ts | — | — | — | — | — | — | — | — | — | — | CSP/headers (stateless) |

*saas_db core = users/sessions/verificationTokens/workspaces/workspaceMembers/workspaceInvitations/auditLogs/securityEvents/systemSettings/stateVersions.

## Hot paths [INFER from call sites + READ]

1. **`requireAuth` → `resolveSession` → `findSessionByToken`** — runs on EVERY authenticated request (~130 of 150 routes). Cost: `getDb()` (cached object) + `db.sessions.find` **O(n) linear scan** + SHA-256. n=8 today; at 100k sessions this is the first thing that breaks → needs `sessions.token_hash` index.
2. **`GET /api/saas/state`** — `getWorkspaceData` returns the WHOLE workspace blob (all brands/posts/videos/analytics) in one JSON. Largest read path; O(blob size) serialize per call. Frontend calls it on workspace switch + after conflicts.
3. **`POST /api/saas/state`** — merges + `saveDatabase()` = **full-file atomic rewrite of 7.8MB JSON on every debounced push (700ms)**. O(total DB size) per mutation — the single worst write path.
4. **scheduler cycle (30s)** — iterates all workspaces' posts arrays in memory, claims due posts, calls publishEngine → all fail `adapter_missing` today.
5. **`saveDatabase()` everywhere** — every mutation in every router rewrites the entire saas_db.json (tmp+rename). ~16 call sites in saasDb + 13 in saasRouter + others.
6. **`/api/saas/history` + `/history/analytics`** — scans posts[]/analytics[] arrays in blob.
7. **GOD storage-metrics** — `fs` scans of uploads dir + JSON sizes.

## Notable structural facts

- **`getDb()` is a process-wide cached object** — all routers share one mutable `db` reference; "transactions" don't exist; a crash mid-mutation after `saveDatabase` partial states are possible only at file level (atomic rename prevents torn files, not logical inconsistency).
- **No locking** between scheduler (background) and request handlers mutating the same `workspaceData[ws].posts` array → race window documented in 1.9.
- **`social_connections.json` vs `workspaceData.accounts[]`** — two parallel account stores (oauthStore file-based + blob array). Which is authoritative? Both are read by different endpoints — flag for 1.9/1.11.
- **`drive_connections.json`/`drive_imports.json`/`media_catalog.json`/`upload_policy.json`/`maintenance_tasks.json`** — separate small JSON files each with own read/write helpers (not through saasDb).
- **Chunked upload sessions are FILE-based** (`data/uploads/.sessions/<sid>/`) with TTL sweep — survives restart, good; but chunks+session metadata live on local disk only.
- **OAuth pending attempts** (`oauthRouter`, `driveRouter`) — in-memory Map → lost on restart; OAuth flow must complete within one process lifetime.
- **`backups/`** — written by GOD backup endpoints (saasRouter readFileSync/writeFileSync ×8/×2).
