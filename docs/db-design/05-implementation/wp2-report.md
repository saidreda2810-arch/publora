# WP2 — Media assets in production code

Branch: `wp0-safety-net` · Date: 2026-11-16 · Storage driver: `local` (S3 untested).

## What changed

| File | Change |
|---|---|
| `server/mediaAssets.ts` (new) | `media_assets` store (JSON file `data/media_assets.json` until WP4 PgRepo) — fields mirror future PG table: id, workspaceId, storageKey, sha256, mimeType, sizeBytes, width/height/durationMs, status, createdBy, timestamps, deletedAt. One-time legacy `media_catalog.json` migration on first load (metadata only). Signed-URL HMAC helpers (`signMediaKey`/`verifyMediaSignature`, 15-min TTL, timing-safe, key from `MEDIA_SIGNING_SECRET` or generated `.media_signing_key`). `orphanReport()` for GC. |
| `server/mediaRouter.ts` | `persistAsset()` helper: sha256 → dedupe per workspace → `StorageProvider.put(ws/{ws}/media/{sha256}{ext})` → asset record → returns record + fresh signed `url`. Wired into `POST /upload` and chunked `/complete` (chunk assembly now buffers in memory then persists). `GET /` lists assets with fresh signed URLs. `GET /object` serves bytes via verified signature + tenant check (404 cross-tenant). `DELETE /:id` → soft delete + reference guard (scheduled posts/videos) + best-effort object delete; cross-tenant returns **404 not 403**. `GET /gc/report` admin-only orphan scan (report-only). |
| `server/uploadPolicy.ts` | `workspaceUsageBytes`/`workspaceVideoCount` now read from `media_assets` (quota math from DB-side records, not disk scan). |
| `server/storage/storageProvider.ts` | `put()` signature accepts contentType (Local impl). |
| `tests/wp2-media.test.mts` (new) | 8 tests — all PASS |

## Test results [RUN]

- `tests/wp2-media.test.mts`: **8/8 PASS** — create/list/usage, dedupe, signed URL verify+tamper+expiry, public URL shape, soft-delete semantics, videoCount, orphan detection, tenant scoping.
- `npm test`: **42/42 PASS** · `npm run lint`: clean.

## NOT tested / residual risks

- **S3StorageProvider** still untested (no SDK/endpoint) — local driver only verified.
- **Live HTTP paths** (`/upload`, `/object`, chunked complete) typecheck + unit-level verified; not exercised end-to-end against running server this WP.
- Chunked upload state: sessions already persisted under `data/uploads/.sessions/` (discovery's "in-memory" claim was partially wrong — meta.json+chunks on disk; **correction logged**). Still filesystem-based, not a table — WP3/WP7 will decide.
- `/uploads/` static mount still public for legacy files — intentional until WP5 relocation; new assets never use it.
- width/height/durationMs fields exist but are null — image/video probing not implemented.
- `media:{key}` refs from WP1 extraction not yet mapped to asset ids (WP5).

## Rollback

`git revert` WP2 commit. `data/media_assets.json` is additive; deleting it + the file restores catalog-based behavior (legacy catalog auto-migrates on next load anyway).

## Next

**WP3 is blocked on infrastructure**: needs Postgres 16 (`DATABASE_URL` staging) and a decision on Docker/MinIO (Docker not installed). Options: (a) you provision Neon/VPS Postgres + creds, (b) I install embedded-postgres for local dev and defer docker-compose. WP3 also needs the migration-tool decision (`docs/db-design/03-design/06-developer-experience.md` referenced by prompt doesn't exist — `07-dx-test-strategy.md` is the equivalent; I'll write the missing doc).
