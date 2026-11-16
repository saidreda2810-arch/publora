# 03.4 — Storage / Media / Queue / Shared State

## A. Media & object storage

**Problem:** 7.7 MB of base64 inside `saas_db.json`; uploads on local FS; no CDN (docs 04/08).

**Design:**

| Layer | Choice | Detail |
| --- | --- | ---  |
| Bytes | **S3-compatible object storage** — Cloudflare R2 (zero egress, cheap) or MinIO on VPS | private bucket; no public ACLs |
| Keys | `media/{workspace_id}/{sha256-prefix}/{asset_id}.{ext}` | content-addressed → dedup + cache-friendly |
| Access | **signed URLs** (GET ~15min, PUT via presigned POST for direct browser upload) | replaces base64 POST for large files; small images may still go through API→server→storage initially |
| Metadata | `media_assets` table: id, workspace_id, brand_id?, kind(image/video/thumbnail), mime, size_bytes, sha256, object_key, created_by, created_at | `sha256 UNIQUE(workspace_id)` for dedup |
| Brand images | `brands.logo_media_id`, `avatar_media_id`, `cover_media_id` FK → `media_assets` | **API returns signed URL**, never base64 |
| Thumbnails | generated async (job) → `media_assets` kind=thumbnail | optional phase-2 |
| Quotas | enforced at `media_assets` sum per workspace (plan-based) | replaces FS-level guesswork |
| Local `uploads/` | becomes **staging only** during transition; final bytes → object storage | `.sessions/` chunk state → DB table or Redis |

**Migration:** extract every `data:` URL from brands/users/accounts → upload to bucket → rewrite refs → verify sha256. Script: `scripts/extract-media-to-storage.ts` (to be written in implementation phase — **not yet written**).

## B. Queue & scheduler

**Problem:** `setInterval(30s)` in-process scan; no claiming → double-publish risk on multi-instance; in-memory dedupe hashes (doc 07).

**Design (phase-appropriate):**

| Stage | Approach |
| --- | ---  |
| **Now (single instance)** | Keep in-process scheduler BUT claim via DB: `UPDATE posts SET status='publishing', locked_by=$instance, locked_at=now() WHERE id IN (SELECT id FROM posts WHERE status='scheduled' AND scheduled_time<=now() FOR UPDATE SKIP LOCKED LIMIT n) RETURNING *` — makes it multi-instance-safe even before dedicated queue. |
| **Near-term** | Same pattern for `automation_executions`; `last_trigger_hash` moves to DB column (kills restart double-fire). |
| **If volume demands** | Dedicated queue (BullMQ+Redis or PG-based `pg-boss`) — **defer**; document trigger criteria (>~500 jobs/min or need for delayed-retry semantics beyond posts). |

Retries: `post_targets.attempt_count`, `next_retry_at` exponential backoff already modeled in schema.

## C. Shared state / cache (enables horizontal scaling)

| State today (in-memory) | Target |
| --- | ---  |
| Rate limiters (auth/ai) | **Redis** fixed-window (`INCR`+`EXPIRE`) — or Postgres `rate_limits` table if Redis deferred (simpler, slightly slower) |
| Brute-force counters/lockouts | same store as rate limits |
| `pendingOAuthAttempts` | Redis `SET attempt:{id} JSON EX 600` — survives restart, works multi-instance |
| Upload session chunk state | `upload_sessions` DB table (survives restart; needed for resume) |
| Automation trigger dedupe | DB column (above) |
| DB cache | **eliminated** — PgRepo queries directly; optional Redis read-cache later only if profiling demands |
| Session lookup | DB per request (`token_hash` index) — ~1ms; cache optional later |

**Redis decision:** introduce **only when** second app instance is planned or OAuth/upload UX suffers. Everything above has a Postgres fallback — design does not hard-require Redis on day 1 (budget R-4).
