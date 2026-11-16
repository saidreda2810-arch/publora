# 03.1 — Database Choice

## Decision: **PostgreSQL 16+** (self-hosted on VPS or Neon/Supabase managed)

| Candidate | Verdict | Reason |
| --- | --- | ---  |
| **PostgreSQL** | ✅ chosen | Row-level locking (`FOR UPDATE SKIP LOCKED`) for scheduler; JSONB for `workspace_kv` transition + flexible fields; partial indexes; mature partitioning (needed for audit/security); `pg` driver already installed (`pg@8.23.1`); every alternative has worse fit. |
| MySQL | ❌ | weaker JSON story, no SKIP LOCKED equivalent quality, partitioning more manual |
| SQLite | ❌ | single-writer; fine for tests only (embedded-postgres covers that need better) |
| MongoDB | ❌ | would preserve blob-thinking; loses relational integrity we need for posts→targets, members, FKs |
| Firestore/Dynamo | ❌ | multi-region cost + query model mismatch; budget constraint (R-4) |

## Deployment options ranked for "cheapest that works" (R-4)

| Option | ~Cost/mo | Ops burden | Verdict |
| --- | --- | --- | ---  |
| **Postgres on same VPS as app** | $0 extra | medium (backups DIY) | ✅ best for MVP budget; backup via pg_dump cron |
| **Neon free → Launch** | $0–19 | low | ✅ best DX; scale-up path clean |
| Supabase free → Pro | $0–25 | low | ✅ alternative; realtime unused |
| AWS RDS | $15+ | low | ❌ budget |

**Recommendation:** start **Neon free tier or same-VPS Postgres**; the schema/driver are identical either way (`DATABASE_URL`). Decision deferred to owner — both supported by design.

## Version & features relied upon

- `SELECT … FOR UPDATE SKIP LOCKED` (scheduler job claiming)
- Partial indexes (`WHERE status='scheduled'`)
- `JSONB` for `workspace_kv`, `preferences`, `voice_profile`, `api_permissions`
- Declarative monthly partitioning for `audit_logs`, `security_events`
- `pgcrypto`/app-level SHA-256 for token hashes; AES-GCM in app for OAuth tokens (not pgcrypto — key must stay out of DB)
