# WP1 — Stop the bleeding: block new media-in-DB + extraction tool

Branch: `wp0-safety-net` (continued) · Date: 2026-11-16 · **No real data modified** — all runs on scratch copies.

## What changed

| File | Change |
|---|---|
| `server/mediaIngress.ts` (new) | `findMediaViolations`/`findTopLevelMediaViolations` — rejects `data:` URLs (mime-shaped regex, prose-safe) and >4 KB strings in media-named fields; **grandfathers unchanged legacy values** via pairwise prev/next comparison (arrays matched by `id`) |
| `server/saasRouter.ts` | wired into `POST /state` (vs current blob), `POST /brands`, `PATCH /brands/:id` (vs existing brand); rewrote `POST /account/avatar` — now accepts only a media URL/path, rejects data: URLs with `media_must_use_upload_api` |
| `server/authRouter.ts` | `PUT /profile` avatarUrl guarded the same way |
| `src/lib/uploadImage.ts` (new) | `uploadImageFile()` — FileReader→base64→`POST /api/media/upload`→returns `asset.url` |
| `src/components/Modals.tsx` | `NewBrandModal` logo/cover now upload via media API (async, error display, `imgUploading` state) instead of embedding data URLs |
| `src/components/profile/PersonalSection.tsx` | avatar preview stays local; upload via media API then POST returned URL to `/account/avatar` |
| `server/storage/storageProvider.ts` (new) | `StorageProvider` interface + `LocalStorageProvider` (tested) + `S3StorageProvider` (AWS SDK v3, env-configured, **untested — no SDK/endpoint here**) + `getStorageProvider()` factory (`STORAGE_DRIVER=local\|s3`) |
| `scripts/extract-embedded-media.ts` (new) | `--dry-run`/`--apply`/`--verify`; walks JSON for data: URLs, magic-byte mime sniff, sha256, content-addressed keys `ws/{wsId}/media/{sha256}{ext}`, rewrites to `media:{key}` refs in an OUTPUT copy only; idempotent |
| `tests/wp1-ingress.test.mts` (new) | 10 tests — all PASS |
| `tests/wp1-storage.test.mts` (new) | 6 contract tests (Local) — all PASS |

## Extraction proof on scratch copy [RUN]

- Input: real `saas_db.json` copy (7,732.1 KB)
- Found: **3 media strings** — logoUrl 1.69 MB, avatarUrl 1.69 MB (same sha256 → 1 duplicate), coverImageUrl 2.44 MB; all sniffed `image/png`; 0 undecodable; 0 mime mismatches
- `--apply` output: **121.2 KB** (−98.4%), 2 unique objects stored (dedup worked)
- `--verify`: 0 data: URLs remain, 2 objects hash-verified, **PASS**
- Idempotency: second `--apply` produced **byte-identical output** [RUN]

## Test results [RUN]

- `tests/wp1-ingress.test.mts`: 10/10 PASS
- `tests/wp1-storage.test.mts`: 6/6 PASS
- `npm test` (main suite): **42/42 PASS**
- `npm run lint` (tsc): clean · `npm run build`: clean

## NOT tested / residual risks

- **S3StorageProvider**: written, env-validated, but **"اتنفذ ومااتختبرش"** — `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` not installed, no MinIO/R2 endpoint (no Docker). Needs `npm i` + live endpoint.
- **Live ingress rejection**: unit-tested at function level; route wiring verified by tsc + code review, not by HTTP calls against a running server this WP.
- **Frontend upload flow**: typechecks/builds; not clicked through in a browser.
- `media:{key}` refs in extracted JSON are placeholders — WP2/WP5 must map them to `media_assets` rows + signed URLs; nothing serves `media:` refs yet.
- Brand modal still allows pasting an external https image URL into fields? (payload sends logoUrl string — https URLs still allowed by design; only data:/oversized rejected.)
- `/uploads/` static path still public — WP2 replaces with signed URLs.

## Rollback

`git revert` WP1 commit(s). Server-side guards are additive; removing `mediaIngress` import + call sites restores prior behavior. Frontend falls back to old data-URL flow (which server would then accept again).

## >>> CHECKPOINT CP-1

Per the prompt: **stop here**. The dry-run/apply/verify evidence above is the extraction report. `--apply` against real `data/saas_db.json` waits for your explicit approval (WP0 backups + restore drill are done ✅). Also flagging: S3 provider needs credentials + SDK install decision before WP2/WP3.
