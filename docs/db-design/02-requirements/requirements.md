# 02 — Requirements (Part 2 answers)

Collected via structured questions. "Unknown" answers are recorded as explicit assumptions, not guesses presented as facts.

| # | Question | Answer | Design assumption |
| --- | --- | --- | ---  |
| R-1 | Expected size (users/workspaces/posts-mo) | **Unknown** | Design for headroom: schema must not assume <10K users; all hot paths indexed; partitions ready. |
| R-2 | Traffic (req/day, uploads/day) | **Unknown** | Assume medium (100K–1M req/day) with headroom; stateless app tier so it can scale horizontally once shared-state gaps (07) are fixed. |
| R-3 | Hosting preference | **Unknown** | Recommend cheapest-managed: single VPS or Railway/Render + managed Postgres (Neon free→paid / Supabase / RDS-small). Final pick deferred to owner. |
| R-4 | Monthly infra budget | **Cheapest that works** | Constraint: no AWS-scale spend. Postgres self-hosted on same VPS OR Neon free tier; object storage = Cloudflare R2 (zero egress) or MinIO on VPS; Redis optional/deferred. |
| R-5 | Team size | **Unknown** | Optimize for small-team DX: simple migrations (`psql`/`node-pg-migrate`-style SQL files), no exotic tooling, good local dev (`embedded-postgres` or docker-compose). |
| R-6 | Compliance | **None / general** | No GDPR/PDPL residency constraints. Still apply baseline: encryption at rest for secrets, TLS, audit retention. Revisit if MENA/GCC market targeted later. |
| R-7 | RPO/RTO | **Unknown** | Propose minimum: **RPO ≤24h, RTO ≤4h** via nightly `pg_dump` + WAL archiving optional; upgrade path documented if stricter needed. |
| R-8 | Operational constraints | **None** | Single-instance acceptable initially; design must not *prevent* horizontal scaling (shared-state plan included). |
| R-9 | Data growth rate | **Medium** | Posts/media grow steadily. Media dominates bytes → object storage mandatory; structured rows stay small → Postgres comfortable for years. Monthly partitions for logs already in DDL. |
| R-10 | Geographic regions | **Multi-region** ⚠️ | **Tension with R-4 (cheapest).** Resolution proposal: single primary region for DB (multi-region DB is expensive), **CDN/edge for media** (R2/Cloudflare) which covers latency for the bulk of bytes; revisit active-active only if metrics demand. Logged as open decision D-REGION. |

## Derived non-functional requirements

- NFR-1: Zero-downtime migration path (dual-read/shadow-write then cutover) — data must be preserved 100%.
- NFR-2: `GET /api/saas/state` response shape must remain byte-compatible during repo swap (frontend contract, doc 11).
- NFR-3: All secrets (OAuth tokens, session hashes, passwords) encrypted/hashed at rest; OAuth tokens need AES-GCM + rotation (T0.8 prerequisite).
- NFR-4: Idempotent, resumable migration; verification by counts + checksums + FK-orphan scan.
- NFR-5: Backups must exist **before** migration starts (currently zero — I-6).
- NFR-6: Test-first where practical; anything written-but-unrun marked "اتنفذ ومااتختبرش".
