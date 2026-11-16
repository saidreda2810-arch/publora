# 08 — Storage Analysis

## Current stores [READ + RUN]

| Store | Path | Format | Size | Writer | Reader | Durability |
| --- | --- | --- | --- | --- | --- | ---  |
| Main DB | `data/saas_db.json` | single JSON doc | 7.5 MB | `saveDatabase` atomic tmp+rename | `loadDatabase` → memory cache | ⚠️ tmp files leak on crash (14 found) |
| OAuth connections | `data/social_connections.json` | JSON array | small | oauthStore | oauthStore | ✅ separate file (good isolation) |
| OAuth config | `data/oauth_config.json` | JSON | 366 B | manual/env | oauthStore | contains provider creds — **file perms matter** |
| Media catalog | `data/media_catalog.json` | JSON | 809 B | mediaRouter | mediaRouter | ⚠️ metadata only; binaries in uploads/ |
| Uploads | `data/uploads/` | binary files | 2 files | mediaRouter | static serve | ⚠️ inside repo dir; no quota enforcement at FS level (app-level only) |
| Upload sessions | `data/uploads/.sessions/` | dirs | empty now | uploadPolicy | uploadPolicy | chunked-upload staging |
| Tmp | `data/saas_db.json.tmp.*` | full DB copies | ~9 MB total | saveDatabase | cleanup on success | ❌ **14 leaked** |
| Backups | `data/backups/` | — | **absent** | backup endpoint exists | — | ❌ nothing ever backed up |
| Logs | stdout | — | — | console | — | no log files, no rotation |

## Problems ranked by impact [INFER]

1. **7.5 MB rewrite-per-mutation** — dominated by base64 brand images (see 04). Fix = extract media first.
2. **No backups** despite backup endpoint — backup feature untested/never run.
3. **Tmp leak** — crash between write and rename leaves full DB copies (also a mild info-exposure on shared hosts).
4. **Uploads inside app dir** — no CDN, no object storage, path is server-local; T0.14/T1.5 must move to S3-compatible.
5. **Two parallel OAuth stores** — `social_connections.json` (tokens) vs `workspaceData.accounts[]` (UI metadata) — drift risk; schema already separates `social_accounts` (metadata) from encrypted token columns.
6. **JSON files have no locking** — concurrent writers corrupt (single-instance assumption).

## Target storage split (feeds Part 3) [INFER]

- **Postgres**: all structured data incl. `media_assets` metadata.
- **Object storage (S3/R2/MinIO)**: brand images, video files, thumbnails — referenced by `media_assets.object_key`, signed URLs for read.
- **Redis (optional phase)**: rate limits, OAuth pending attempts, scheduler locks, cache.
- **Filesystem**: only ephemeral tmp/uploads staging during transition.
