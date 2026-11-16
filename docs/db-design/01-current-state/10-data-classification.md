# 10 — Data Classification

Classification of every data category by sensitivity, residency, and lifecycle — input to Part 3 security design. No raw values included.

| Category | Examples (fields) | Sensitivity | Current protection | Target protection |
| --- | --- | --- | --- | ---  |
| **Credentials — passwords** | `users.passwordHash`, `users.salt` (scrypt) | 🔴 critical | salted scrypt hash; never serialized to client | unchanged; `password_hash`/`salt` columns, no SELECT exposure |
| **Credentials — sessions** | `sessions.token` (now SHA-256 hash only post-T0.9) | 🔴 critical | hash-at-rest; HttpOnly Secure SameSite=None cookie | `token_hash` UNIQUE; rotation on password change |
| **Credentials — OAuth tokens** | `social_connections.json` access/refresh tokens | 🔴 critical | ⚠️ file on disk; T0.8 AES-GCM **pending OAUTH_ENCRYPTION_KEY** | `social_accounts` encrypted columns (AES-256-GCM, key in env/KMS); key-rotation table |
| **Credentials — verification tokens** | `verificationTokens` (hashed post-T0.18) | 🟠 high | SHA-256 hash, typed, expiring, attempt-limited | `auth_tokens` same; purge on expiry job |
| **PII — identity** | `users.email`, `fullName`, `phone`, `pendingEmail`, `avatarUrl` | 🟠 high | app-level only; emails appear in audit logs | column-level encryption optional; audit logs must not embed raw email (check writer) |
| **PII — member invites** | `workspaceMembers.invitedEmail`, invitation tokens | 🟠 high | plaintext in JSON | hashed invite tokens; email encrypted at rest if compliance requires |
| **Content — user media** | `uploads/` binaries, `media_catalog.json`, `videos[].fileUrl` | 🟡 medium | filesystem, app-level quotas | object storage private bucket + signed URLs; `media_assets` metadata in PG |
| **Content — brand assets** | `brands[].logoUrl/avatarUrl/coverImageUrl` (**base64 in DB today**) | 🟡 medium | inside saas_db.json — **bloat + exposure** | extract to object storage; DB keeps `media_asset_id` refs only |
| **Business data — posts/schedule** | posts, targets, calendar settings, queue state | 🟡 medium | JSON blob | normalized tables; workspace-scoped RLS |
| **Business data — analytics** | analyticsSnapshots, metrics, experiments | 🟢 low-medium | client-side mostly | `analytics_snapshots`; retention policy needed |
| **Business data — automation** | workflows, executions, approvals | 🟢 low | JSON blob | tables; `automation_approvals` already separated |
| **Operational — audit** | `auditLogs` (220), `securityEvents` (3) | 🟠 high (forensic) | capped arrays in same file | partitioned tables; **append-only**, separate retention (90d audit / 1y security suggested) |
| **Operational — telemetry** | request ids, scheduler status | 🟢 low | memory/logs | structured logs → optional sink |
| **Config — secrets** | `oauth_config.json`, env vars | 🔴 critical | file/env on host | env/KMS only; never in DB dumps |
| **Derived — AI outputs** | `aiVideoResults`, recommendations, experiments | 🟢 low | blob | `workspace_kv` or dedicated tables; may contain prompt text (check for PII echo) |

## Key risks surfaced [INFER]

1. **Base64 brand images sit inside the main DB file** — any DB backup/dump carries 7.7 MB of images; and if file perms leak, images leak with credentials.
2. **Audit logs may embed emails/IPs** — verify writer redaction before partitioning (carry to 3-security).
3. **`workspace_kv` transition table will hold mixed-sensitivity blobs** — must be excluded from read replicas/analytics exports until normalized.
4. **OAuth tokens are the only plaintext-at-rest secret class** — T0.8 encryption is a hard prerequisite for any DB migration that copies `social_connections`.
5. **Session fixation window**: pre-T0.1 sessions remain valid until owner rotates — flag in final report as open risk.
