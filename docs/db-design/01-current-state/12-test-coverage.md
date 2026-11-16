# 12 — Data-Layer Test Coverage

Test inventory: `tests/run-all-tests.ts` orchestrates suites; 42 tests total, 41 pass / 1 fail (firebase config mismatch — pre-existing, unrelated to data layer).

## What IS tested [READ tests/]

| Suite | Covers | Data-layer relevance |
| --- | --- | ---  |
| `security-phase0-smoke.mts` | 12 checks: auth bypasses 404, cookie flow, CSRF, state endpoint protections (whitelist/anti-wipe/ref-integrity/version), rate limits | **directly covers** T1.0 state hardening ✅ |
| brute-force protection suite | lockout counters | touches in-memory guard state |
| auth flow tests | register/login/logout/me | session create/find/delete path (hashed tokens post-T0.9) |
| upload/media tests | quotas, chunking, magic bytes | media catalog + uploads FS |
| misc unit tests | utils, validators | — |

## What is NOT tested [READ — gaps]

| Gap | Risk |
| --- | ---  |
| `saveDatabase`/`loadDatabase` round-trip on the **real 7.5 MB file** | corruption/regression invisible until prod |
| `getWorkspaceData`/`saveWorkspaceData` merge semantics | shallow-merge key loss (S-5) untested |
| Migration script `--apply`/`--verify` against real Postgres | **completely untested** — only `--dry-run` ran |
| Repo-interface parity (future JsonRepo vs PgRepo) | no golden-file contract tests exist yet |
| Scheduler claim/dedupe under concurrency | single-threaded assumption only |
| OAuth token refresh/encryption path | T0.8 pending; untested |
| Backup/restore round-trip | backup endpoint never exercised |
| Concurrent write safety (two saves racing) | no lock exists to test |
| `stateVersions` overflow/conflict edge cases | only happy-path 409 tested |

## Required additions for DB migration (carry to Part 3 test strategy)

1. **Golden contract tests**: snapshot `GET /state` + auth responses before repo swap; assert byte-identical shape after.
2. **Repo parity suite**: same CRUD ops against JsonRepo and PgRepo (testcontainers/embedded-pg), diff results.
3. **Migration verification tests**: row counts, checksums, FK-orphan scan = 0 (excluding documented orphans), sampled entity diffs.
4. **Chaos tests**: kill mid-save → tmp cleanup; kill mid-migration → resume idempotency (`ON CONFLICT DO NOTHING` already helps).
5. **Load test**: N concurrent `/state` pushes → assert no lost updates (validates SKIP LOCKED + optimistic versioning).
