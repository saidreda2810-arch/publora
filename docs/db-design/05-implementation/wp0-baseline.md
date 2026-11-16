# WP0 — Baseline & Safety Net

Branch: `wp0-safety-net` · Date: 2026-11-16 · All claims [RUN] unless noted.

## 1. Baseline re-run

| Check | Command | Result |
|---|---|---|
| install | `npm ci --no-audit --no-fund` | OK (install-scripts warnings for core-js/esbuild/protobufjs — informational) |
| typecheck | `npm run lint` (`tsc --noEmit`) | clean, 0 errors |
| tests | `npm test` | **42/42 PASS** (was 41/42 — firebase fix, see §4) |
| build | `npm run build` | OK; chunk-size warning only (pre-existing) |

Matches discovery baseline except the previously-failing firebase test now passes.

## 2. Backup script — `scripts/backup-data.ts` [RUN]

- Snapshots all of `data/` (JSON stores + `uploads/`) into `~/publora-backups/publora-data-<UTC-timestamp>/` — **outside data/ and outside the repo**.
- Writes `manifest.json`: per-file bytes + SHA-256 + DB counts (no PII values).
- Compresses to `.tar.gz` via system `tar --force-local` (bsdtar); staging dir removed after compression.
- Optional encryption: `BACKUP_PASSPHRASE` → AES-256-GCM `.tar.gz.enc` (salt|iv|tag|ct).
- Retention: `BACKUP_KEEP` (default 14) newest archives kept.
- Excludes `saas_db.json.tmp.*` (14 leaked tmp files — stale snapshots, verified none newer than main).
- Env: `BACKUP_DIR`, `BACKUP_KEEP`, `BACKUP_PASSPHRASE`, `BACKUP_NOCOMPRESS`, `SRA_BACKUP_SOURCE` (tests).
- **First real backup:** `publora-data-2026-11-16T10-50-29.tar.gz` — 5 files, 13,048,853 bytes, `--verify` → all SHA-256 match [RUN].
- ⚠️ **Not encrypted** (no passphrase set) — archive contains secrets+PII. Location: `C:\Users\The Devil's Space\publora-backups\`. Protect dir or set `BACKUP_PASSPHRASE` before scheduling.

### Tests — `tests/wp0-backup.test.mts` [RUN]

5/5 PASS: archive creation+manifest, sha256 verify, retention pruning, tar compression, missing-source error.

## 3. Restore drill [RUN]

1. Extracted latest tarball to `%TEMP%/publora-restore-drill/`.
2. Booted server with `SRA_DATA_DIR=<scratch>/data PORT=3459` (new env override added to `server/saasDb.ts:265` — 1-line change, default unchanged).
3. `POST /api/auth/register` → 201 (new user in restored copy) · `GET /api/auth/me` → 200 · `GET /api/saas/state` → 200.
4. Server killed; **real `data/` never touched**. Result: **backup restores and serves correctly**.

Note: other stores (media_catalog, oauth, drive) still resolve `process.cwd()/data` — acceptable for drill; WP4 repo layer will unify paths.

## 4. Firebase failing test — root cause & fix [RUN]

- Test asserted `firebase-applet-config.json.firestoreDatabaseId === 'ai-studio-srasocialpublish-…'` but the field was **absent** (config regenerated without it). `projectId` matched.
- Firebase **is** used at runtime (`src/App.tsx` init check, `GoogleDriveView` auth types) → per WP0.4, fix config not remove.
- Fix: restored `firestoreDatabaseId` field in `firebase-applet-config.json`. Suite now 42/42.

## 5. uploads/ 0-byte anomaly — RESOLVED [RUN]

Files are **not** 0 bytes: `.jpg` = 68,923 B, `.mp4` = 5,077,842 B — sizes match `media_catalog.json` exactly. Earlier analyzer reported 0 due to a stat/readdir quirk (script bug, not data bug). No failed/truncated uploads; both are real completed uploads from 2026-11-07.

## 6. Leaked tmp files analysis [RUN — scratch copy only]

All 14 `saas_db.json.tmp.*` are **stale snapshots**, none identical to main, all older (timestamps 2026-11-05 → 11-11; main file newer). Contents: earlier states with fewer sessions/audit rows. Safe to delete — **not deleted** (WP10 cleanup; root-cause fix = WP4 saveDatabase hardening).

## Files changed

- `scripts/backup-data.ts` (new)
- `tests/wp0-backup.test.mts` (new)
- `server/saasDb.ts` (+`SRA_DATA_DIR` env override, 1 line)
- `firebase-applet-config.json` (+`firestoreDatabaseId`)
- `docs/db-design/05-implementation/wp0-baseline.md` (this file)

## NOT tested / residual risks

- Backup **schedule** not installed (script is manual/cron-ready; document cron line in ops docs later).\n- Encryption path written but untested end-to-end (no passphrase used in drill).
- `tar` dependency: bsdtar present on this Windows + standard on Linux; no fallback if absent (documented).
- Restore drill covered auth+state only; media upload/drive/oauth paths not exercised (they read cwd/data — noted above).

## Rollback for this WP

`git revert` the WP0 commits; delete `~/publora-backups/` archives if unwanted; `SRA_DATA_DIR` is opt-in (unset = old behavior); firebase config field is additive.

## Next

**CP-1 gate is AFTER WP1** — proceeding to WP1 (media-in-DB ingress block + StorageProvider + extraction tool) next, still no real data modified.
