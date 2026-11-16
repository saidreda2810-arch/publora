# 03.6 — Security & Data Lifecycle

Builds on `10-data-classification.md` and existing Phase-0 work. No secrets/PII in this doc.

## Encryption & hashing at rest (target state)

| Data | Mechanism | Key management |
| --- | --- | ---  |
| passwords | scrypt hash+salt (existing) | n/a |
| session tokens | SHA-256 hash stored (done T0.9) | n/a |
| verification/magic tokens | SHA-256 hash, typed, expiring, attempt-limited (done T0.18) | n/a |
| **OAuth access/refresh tokens** | **AES-256-GCM** with `key_version` column | `OAUTH_ENCRYPTION_KEY` env → KMS later; rotation = re-encrypt job per key_version (T0.8 design already planned) |
| PII (email, name, phone) | plaintext columns + TLS; **optional** column-level encryption deferred (no compliance req — R-6) | revisit if MENA/GCC targeting |
| media bytes | private bucket + signed URLs | bucket policy, no public ACL |
| DB backups | encrypted dump (`age`/`gpg`) off-box | backup encryption key separate from DB creds |

## Tenant isolation

- Every tenant table carries `workspace_id`; **repository layer enforces `WHERE workspace_id = $ctx` on every query** — never rely on app-level filtering alone.
- Postgres **Row-Level Security** as defense-in-depth: `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + policy `workspace_id = current_setting('app.workspace_id')::uuid` for tenant tables. Repo sets the GUC per transaction. Phase-2 addition — flag as recommended-hardering, not day-1 blocker.
- `workspace_kv` keyed `(workspace_id, key)` — same isolation rule.

## Audit & security events

- `audit_logs` (operational, 90-day retention suggestion) vs `security_events` (forensic, 1-year) — already partitioned monthly; **append-only**: revoke UPDATE/DELETE from app role.
- Writer must **not embed raw emails/tokens** in metadata — verify at implementation (carry-over check from doc 10).
- Partition maintenance job: create next-month partition ahead of time (cron/`pg_partman` optional).

## Data lifecycle

| Event | Behavior |
| --- | ---  |
| User deletion | cascade sessions/tokens/memberships; **anonymize** audit rows (keep event, null actor email); media → lifecycle-delete after grace period |
| Workspace deletion | owner-only + typed confirmation; cascade tenant data; media objects deleted async; audit/security rows retained (anonymized workspace_id kept as uuid) |
| Token expiry | `auth_tokens` purge job daily (`DELETE WHERE expires_at < now() - 7d`); consumed tokens purged sooner |
| Session revocation | existing revoke flow → `revoked_at` timestamp (not delete — forensic value) |
| Media orphan GC | weekly job: `media_assets` rows with no references → delete object + row |
| JSON archive | post-cutover `data/saas_db.json` → read-only, moved to `archive/` with 30-day retention then secure delete |

## Secrets handling

- `.env` never committed (verify `.gitignore` covers it — check at implementation).
- `oauth_config.json` deprecated → provider creds move to env (`META_APP_ID` etc. already env-driven post-T0.4).
- DB connection string, S3 keys, `OAUTH_ENCRYPTION_KEY` in env/KMS only — **never** in `workspace_kv`, logs, or error responses.
- `server/env.ts` production validation extended: reject missing `DATABASE_URL`, weak/absent `OAUTH_ENCRYPTION_KEY` when OAuth enabled.

## Threat-model deltas introduced by DB move

| New risk | Mitigation |
| --- | ---  |
| SQL injection via new repo layer | parameterized queries only (`pg` placeholders); no string-built SQL; lint rule/review checklist |
| Connection-string leak in logs/errors | central error handler already strips messages; ensure `DATABASE_URL` never logged |
| Backup files containing PII+tokens | encrypted backups, separate storage creds, retention policy |
| Signed-URL abuse | short TTL, scope to asset, rate-limit media endpoints (existing limiter pattern) |
| `workspace_kv` as pollution vector | same whitelist as T1.0; reject `__proto__` keys at repo layer too |
