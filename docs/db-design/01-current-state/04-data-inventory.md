# 04 — Data Inventory

**Method:** `docs/db-design/scripts/analyze-data.mjs` on a temp copy of `data/` [RUN]. Full machine-readable output: `data_inventory.json` (structure + counts + field profiles; **no raw PII values** — emails hashed/counted only).

## File sizes [RUN]

| File | Size | Notes |
|---|---|---|
| `saas_db.json` | **7,875,313 B (~7.5 MiB)** | single JSON doc, rewritten atomically per mutation |
| `saas_db.json.tmp.*` | **14 files** | 11 × ~140–160 KB (pre-brand-upload era) + 3 × ~7.8 MB (post-upload). Tmp files are **not cleaned on crash** and include full DB copies |
| `social_connections.json` | absent/empty | oauthStore creates on first connect |
| `oauth_config.json` | 366 B | provider credential config |
| `media_catalog.json` | 809 B | ~2 records |
| `uploads/` | DIR | 2 files (.jpg, .mp4), **0 session dirs** |
| `backups/` | — | **does not exist / empty → zero backups on disk** |

## saas_db.json top-level collections [RUN]

| Collection | Records | ~Bytes | % of file |
|---|---|---|---|
| workspaceData (blob) | 5 workspaces keyed | **7,764,827** | **98.6%** |
| auditLogs | 220 | 60,304 | 0.8% |
| verificationTokens | 53 | 12,042 | 0.15% |
| sessions | 8 | 2,776 | |
| users | 5 | 2,545 | |
| workspaces | 10 | 3,507 | |
| workspaceMembers | 9 | 1,360 | |
| securityEvents | 3 | 882 | |
| systemSettings | 7 keys | 838 | |
| stateVersions | — | (new, T1.0) | |

## The dominant finding: ONE brand = 99.9% of the database [RUN]

`workspaceData` is 98.6% of the file, and **a single workspace blob is 7,757,823 B** — inside it, **one `brands[]` record is 7,756,549 B**, almost entirely three base64 data-URL fields:

| brand field | ~Bytes | content |
|---|---|---|
| `coverImageUrl` | 3,253,284 | base64 data-URL image |
| `logoUrl` | 2,251,524 | base64 data-URL image |
| `avatarUrl` | 2,251,524 | base64 data-URL image (same image as logo) |

All other collections combined < 90 KB. **Every `saveDatabase()` rewrites ~7.5 MB of base64 images** — this is the real cost driver behind the JSON-store architecture, not record counts. Confirms SEC-20 at scale and makes object-storage migration (T1.5) the highest-leverage data fix.

The other 4 workspace blobs are tiny (1–2.4 KB): mostly `projects:1, accounts:2, posts:1` test fixtures.

## Per-workspace blob sizes [RUN] (wsHash = sha256(wsId)[:10], no raw ids)

| wsHash | Bytes | Notable contents |
|---|---|---|
| 88dbbf1d0f | 7,757,823 | 1 brand (base64 images), 1 automationLog |
| 228e8d951b | 2,408 | 1 project, 2 accounts, 1 post |
| e318502019 | 2,408 | same shape (likely duplicate fixture) |
| fe10eef2c2 | 1,036 | 1 project, 1 post |
| ea1166cb50 | 1,036 | same shape |

Note: 10 `workspaces` rows but only **5 `workspaceData` blobs** — 5 workspaces never initialized (lazy `getWorkspaceData` creates on first access).

## Data quality [RUN]

- **Orphan references:** 2 posts with missing `brandId`, 2 with missing `videoId` (the `test_sched_post_1` fixtures across 2 workspaces); 0 orphan accountIds; sessions/members/workspaces all resolve.
- **Duplicates:** 0 duplicate emails (case-insensitive check).
- **Invalid enums:** 0 — all user roles/statuses, workspace plans, post statuses within expected sets.
- **Bad dates:** 0 unparseable `scheduledTime` values.
- **workspaceData orphans:** 0 (every blob key maps to a real workspace).

## Growth estimate [INFER — very limited data]

- Dated records span **9 days** (2026-11-03 → 2026-11-12), 15 records with parseable createdAt — this is a fresh dev dataset, not production traffic.
- Meaningful growth signal is **bytes per mutation**, not records/month: every state push rewrites the full 7.5 MB file. At current size that's ~7.5 MB write per debounced sync; with N users it's O(N × file size).
- [UNKNOWN] real production growth — requires deployed telemetry.

## Field profiles

`data_inventory.json` contains per-collection field profiles (types, null rates, distinct-value counts for indexing candidates) for all top-level collections and per-key byte contributors inside workspaceData. Key contributor ranking: `brands` 7.76 MB ≫ everything else (< 3 KB each).

## uploads/ + .sessions [RUN]

- 2 files total (.jpg, .mp4), reported size 0 (likely sparse/placeholder test files — verify on disk if needed).
- `.sessions/` empty — no stuck chunked uploads.
- `media_catalog.json` has ~2 records consistent with the 2 files.

## Implications for design

1. **Base64-in-JSON is the #1 problem** — bigger than record count by 3 orders of magnitude. Migration must extract `logoUrl/avatarUrl/coverImageUrl` (and any `data:` URLs anywhere) to object storage FIRST, before any row migration, or the new DB inherits 7.7 MB blobs.
2. **tmp file leak** — 14 orphaned tmp files (~9 MB total) prove `saveDatabase` crash path leaks; add cleanup sweep.
3. **No backups exist** — `data/backups/` absent; backup endpoints exist but nothing has run.
4. **workspaceData lazy-init** means 5/10 workspaces have no blob — migration must handle missing blobs (not error).
5. **Test fixtures pollute data** (`test_sched_post_1`, `brand-a`, `vid-1`, duplicate-shaped workspaces) — migration report should flag them for owner decision (keep vs purge).
