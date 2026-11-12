# 07 — Stateful In-Memory Components

All module-level state that dies on restart or diverges across instances [READ server/*.ts].

| Component | File | State | Lifetime | Multi-instance safe? | Migration target |
|---|---|---|---|---|---|
| `dbCache` | saasDb.ts | parsed saas_db.json | until next write | ❌ (stale reads) | eliminated by PgRepo |
| `stateVersions` | saasDb.ts | ws→int counter | persisted in JSON | ⚠️ works but racy | `workspaces.state_version` column + atomic UPDATE |
| Rate limiters (auth 30/m, ai 20/m) | server.ts, aiRouter | sliding-window counters | process | ❌ per-instance → N× limit | Redis or Postgres fixed-window table |
| `bruteForceGuard` state | security.ts | failed-attempt counters + lockouts | process | ❌ attacker rotates instances | same as above |
| `pendingOAuthAttempts` | oauthRouter | attemptId→{provider,pkce,exp} | ~10 min | ❌ callback hits other instance = fail | Redis with TTL (or DB table) |
| Upload sessions | uploadPolicy/mediaRouter | chunked-upload progress, quotas | process + `.sessions/` dir | ⚠️ partial — dir survives, memory doesn't | object-storage multipart or DB table |
| OAuth token store cache | oauthStore.ts | decrypted tokens in memory? (verify) | process | ⚠️ | `social_connections` table is source of truth already |
| Automation trigger dedupe hashes | publishEngine/automation | last-trigger hash per rule | process | ❌ restart → possible double-fire | DB `last_triggered_hash` column or Redis SETNX |
| Scheduler tick state | server.ts | `setInterval` handle | process | n/a single | DB-backed job queue (SKIP LOCKED) |
| Session cookie signing | authRouter | none (random token + hash lookup) | — | ✅ already stateless | unchanged |

## Implications [INFER]

- **Horizontal scaling is blocked by 4 things**: rate-limit/brute-force state, OAuth pending attempts, upload sessions, scheduler claiming. All four have cheap Redis fixes; scheduler also needs DB row-locking regardless.
- **Restart safety**: pending OAuth attempts and upload sessions evaporate — users mid-flow get a clean error today (verify UX copy exists); acceptable, but document.
- **No secrets in memory beyond tokens** — OAuth access tokens ARE held in `social_connections.json` (encrypted post-T0.8); keep them server-side only, never serialize to client.
