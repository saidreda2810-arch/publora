# 09 — Integrity Findings

Cross-referenced: `data_inventory.json` (orphans/dupes/dates), `saasRouter` T1.0 checks, migration dry-run (`docs/migration/orphans.json`), audit docs.

## Confirmed issues in current data [RUN]

| # | Issue | Evidence | Severity | Treatment |
| --- | --- | --- | --- | ---  |
| I-1 | 2 posts reference missing `brandId` | data_inventory orphans; `test_sched_post_1` fixtures | low (test data) | migration report flags; owner decides purge vs keep |
| I-2 | 2 posts reference missing `videoId` | same | low | same |
| I-3 | 5 workspaces have no `workspaceData` blob | 10 workspaces vs 5 blobs | info | lazy-init is by design; migration inserts empty/defaults |
| I-4 | Duplicate-shaped workspace blobs (2 pairs ~identical counts) | wsBlobs table | info | likely test fixtures; flag for owner |
| I-5 | 14 leaked `saas_db.json.tmp.*` files (~9 MB) | fileSizes | low | cleanup sweep + fix crash path |
| I-6 | Zero backups on disk | backups absent | **high** (ops risk) | enable backup job before migration |
| I-7 | `brand-a`, `vid-1`, `test_sched_post_1` readable fixture ids inside "real" DB | posts/brands fields | low | same as I-1 |
| I-8 | Session tokens: 8 sessions, hashes stored post-T0.9 — **all pre-date owner rotation (T0.1 pending)** | sessions count | **high** | owner must invalidate all sessions |
| I-9 | `social_connections.json` absent → OAuth store empty; but `workspaceData.accounts[]` has 2-account blobs → UI shows connected accounts with **no backing tokens** | blobs + file absence | medium | accounts are metadata-only orphans of OAuth layer; migration must mark `connection_status` honestly |
| I-10 | `mfaEnabled` legacy flags | saasDb migration zeroes them | resolved | T0.3 |

## Structural integrity gaps (not data bugs — design gaps) [READ]

| # | Gap | Consequence |
| --- | --- | ---  |
| S-1 | No FK enforcement anywhere | orphans I-1/I-2 possible; will recur until Postgres FKs |
| S-2 | No unique constraint on blob entity ids | duplicate brands/posts possible |
| S-3 | `stateVersions` racy across instances | lost-update window (mitigated single-node) |
| S-4 | No transaction around multi-file writes (saas_db + social_connections + media_catalog) | partial-failure inconsistency |
| S-5 | `POST /state` shallow-merge can drop nested keys the client didn't send | silent data loss risk remains for un-whitelisted nested objects |
| S-6 | Audit/security logs live inside the same rewritten file | log churn amplifies write cost; cap-slice loses history |

## Migration dry-run cross-check [RUN]

`scripts/migrate-json-to-pg.ts --dry-run` reported the same 5 orphans (I-1/I-2 + fake-SSO workspace owner + test refs) → **consistent across two independent analyses**. `docs/migration/orphans.json` is the authoritative list for owner decision.

## Owner decisions needed (carried to Part 4)

- D-1: purge vs preserve test fixtures (`test_*`, `brand-a`, `vid-1`, `ws_sso_*`)
- D-2: duplicate-shaped workspace blobs — merge or keep separate
- D-3: accounts-without-tokens — mark `requires_reconnection` or delete
