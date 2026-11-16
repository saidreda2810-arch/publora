# 03.7 — Developer Experience & Test Strategy

## DX goals (small/unknown team — R-5)

| Concern | Approach |
| --- | ---  |
| Local dev DB | **`embedded-postgres` npm package** (downloads PG binaries, zero install) OR `docker-compose.yml` with postgres:16 — provide both, default embedded for zero-dependency `npm run dev` |
| Schema iteration | plain SQL files + `npm run db:migrate` (runner to write); `npm run db:reset` rebuilds from migrations + optional seed |
| Seed data | `scripts/seed-dev.ts` — small realistic fixture (1 user, 1 ws, 1 brand, 1 post) so new devs aren't blocked |
| Env template | `.env.example` updated with all new vars + comments; `server/env.ts` prints missing-var names on boot failure |
| Repo abstraction | `DB_DRIVER=json|pg` env flag; `JsonRepo` wraps current saasDb functions unchanged; `PgRepo` new. Same interface → A/B testable, instant rollback |
| Observability | keep `X-Request-Id`; add query timing log (pino or console) behind `LOG_LEVEL` |
| Docs | this `docs/db-design/` tree + `docs/DATABASE_SCHEMA_V2.md` kept in sync — schema.sql copied artifact prevents drift |

## Test strategy additions (gap list from doc 12)

| Layer | Test | Tooling |
| --- | --- | ---  |
| Contract | golden `GET /state` + auth response snapshots pre/post repo swap | existing test runner + snapshot files |
| Repo parity | identical op sequences on JsonRepo vs PgRepo (embedded-pg) → diff | vitest/node:test via `tsx` (match existing `tests/run-all-tests.ts` style) |
| Migration | `--apply` + `--verify` on fixture DB; idempotent re-run; orphan scan | embedded-postgres in CI |
| Scheduler | two "instances" racing claims → assert no double-publish | unit test with two PgRepo clients |
| Security | RLS policy test (cross-workspace read denied), signed-URL expiry, token-hash-only storage | extend `security-phase0-smoke.mts` |
| Load | N concurrent `/state` pushes → no lost updates | simple `autocannon`/custom loop, manual gate |
| Regression | existing 42-test suite must stay green throughout | `npm test` |

## Rollback posture

- `DB_DRIVER` flag = instant rollback to JSON (data frozen at cutover snapshot + JSON archive).
- Postgres data is **never** the only copy during transition — JSON archive retained 30 days.
- Every migration has manual rollback SQL documented before apply.
