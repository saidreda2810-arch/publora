# 04 — Migration Plan

Preserves 100% of data; idempotent; reversible until archive purge. Builds on existing `scripts/migrate-json-to-pg.ts` (dry-run verified) — **needs 2 additions**: media-extraction step and schema deltas (03.5).

## Preconditions (blockers)

| # | Precondition | Status |
| --- | --- | ---  |
| P-1 | Postgres instance + `DATABASE_URL` | ⛔ none available yet — owner action |
| P-2 | Object storage bucket + creds (R2/MinIO/S3) | ⛔ not provisioned |
| P-3 | `OAUTH_ENCRYPTION_KEY` + T0.1 rotations | ⛔ owner-only (T0.1) |
| P-4 | Backup job running at least once successfully | ⛔ backups dir empty today (I-6) — **must fix first** |
| P-5 | Owner decisions D-1/D-2/D-3 (test fixtures, dup blobs, tokenless accounts) | ⛔ open |
| P-6 | Schema deltas applied (state_version, media FKs, lock cols, upload_sessions, last_trigger_hash) | ⏳ DDL update needed |

## Phase M-0 — Safety net (before touching data)

1. Run existing backup endpoint → verify `data/backups/` file exists + restores.
2. `pg_dump`-equivalent: after schema apply, take baseline dump.
3. Snapshot `data/` dir → `archive/pre-migration-YYYYMMDD/` (copy, not move).
4. Delete 14 leaked `saas_db.json.tmp.*` files after confirming main file integrity (they're stale copies).

## Phase M-1 — Media extraction (new, highest leverage)

`scripts/extract-media-to-storage.ts` (to write):
- Scan all JSON + workspaceData for `data:` URLs (brands confirmed; check users.avatarUrl, accounts.avatarUrl, posts media fields).
- Decode → sha256 → upload to bucket `media/{ws}/{hash}/{id}.{ext}` → insert `media_assets` row → replace field with `media:{asset_id}` placeholder or signed URL.
- **Dry-run first**: report counts/bytes per field without writing.
- Verify: re-scan finds zero `data:` URLs; sha256 round-trip matches.

## Phase M-2 — Schema apply + row migration

1. Apply `0001_schema_v2.sql` (+ deltas) to empty DB.
2. `migrate-json-to-pg.ts --dry-run` → review `docs/migration/orphans.json` + new media report.
3. `--apply` (transactional, `ON CONFLICT DO NOTHING` — idempotent, safe to re-run).
4. `--verify`: per-table counts vs JSON counts; FK orphan scan; sample entity diffs (5 random rows/entity deep-compared).

**Orphan policy (needs D-1..D-3):** default = **preserve** — insert with `legacy_id`, mark `metadata.migrated_orphan=true`, never silently drop. Test fixtures flagged in report for owner purge decision post-cutover.

## Phase M-3 — Shadow / dual-write

1. `DB_DRIVER=pg` repo implemented; `DB_DRIVER=json` default.
2. Shadow mode: writes go to **both** (pg primary, json mirror async) for N days; reads still json.
3. Nightly diff job: compare pg vs json aggregates (counts per collection, checksum of sorted ids) → report drift.
4. Duration: **minimum 7 days** or until zero unexplained drift, whichever longer.

## Phase M-4 — Cutover

1. Maintenance window (~15–30 min): enable read-only mode (existing pattern) → final delta sync (rows changed since last shadow sync — via `updated_at` watermark or state_version diff) → flip `DB_DRIVER=pg` reads.
2. Verify: smoke suite + manual critical paths (login, state load, post schedule, upload).
3. JSON becomes read-only archive → `data/archive/saas_db-final-YYYYMMDD.json`.

## Phase M-5 — Stabilization & cleanup

- 30-day watch: json archive retained; pg is sole writer.
- After 30 days + owner sign-off: secure-delete archive (or move to cold storage).
- Delete `DB_DRIVER=json` code path in a later cleanup release (keep flag one release for safety).

## Verification checklist (every phase)

- [ ] counts per table == counts per JSON collection (± documented orphans)
- [ ] checksum: sha256 over sorted `legacy_id` list per entity matches source
- [ ] FK orphan scan returns only the 5 documented orphans
- [ ] `GET /api/saas/state` golden-response diff = empty (contract test)
- [ ] media: zero `data:` URLs remain; every `media_assets.object_key` HEAD-requests 200
- [ ] sessions/auth still work post-cutover (cookie flow re-verified)

## Rollback

| Point | Rollback |
| --- | ---  |
| Before M-3 | nothing to roll back — json untouched |
| During shadow | stop shadow writer; json still authoritative |
| After cutover (<30d) | flip `DB_DRIVER=json`; json archive is frozen-at-cutover + replay delta if needed (worst case: brief data loss window = cutover→rollback interval; mitigate by keeping shadow writes to json for 7d post-cutover — **recommended**: continue dual-write 7 days after read cutover) |
| After archive purge | **no rollback** — hence 30-day gate + owner sign-off |

## Downtime estimate

- M-1/M-2: zero (background, read-only on app)
- M-3: zero (shadow)
- M-4 cutover: **15–30 min** read-only window (R-7 allows 4h)
- M-5: zero

## Frontend compatibility during migration

- `GET /state` shape identical throughout (contract tests enforce).
- Brand images: frontend `<img>` gets signed URL instead of data-URL — same rendering, ~7.5 MB → ~100 KB page weight. One-time check: grep `data:image` consumers in `src/` (carry to impl).
- No frontend deploy required until T1.4 entity endpoints (optional later optimization).
