# 05 — Security & Data Lifecycle

Canonical doc: `docs/db-design/03-design/06-security-lifecycle.md` (encryption, tenant isolation, RLS, audit retention, lifecycle events, secrets handling, new-threat mitigations).

Summary of binding decisions:

- OAuth tokens: AES-256-GCM + `key_version`, env/KMS-held key — **blocked on T0.1/OAUTH_ENCRYPTION_KEY**.
- Tenant isolation: `workspace_id` on every row + repo-enforced filtering; RLS as phase-2 hardening.
- `audit_logs` 90-day / `security_events` 1-year retention, append-only, partitioned.
- Signed URLs (15-min TTL) for all media; private buckets only.
- No PII/secrets in reports, logs, or `workspace_kv`.
- JSON archive read-only post-cutover, purged after 30 days + sign-off.
