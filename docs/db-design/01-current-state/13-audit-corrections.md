# 13 — Corrections to the Older Audit (`docs/audit/`)

New evidence from this discovery phase that **updates or corrects** prior audit claims. Audit docs remain the historical record; this file is the delta.

| # | Prior claim (audit doc) | New evidence | Correction |
| --- | --- | --- | ---  |
| C-1 | "~145 endpoints" | extractor found **149 route records** across 7 routers (86 in saasRouter alone); earlier manual count missed OAuth array-routes like `get(['/callback/:provider','/callback/:provider/'])` | Actual: **149**. Route-extractor limitation noted: middleware counts (31 requireAuth etc.) are grep hits, not per-route verified — treat as approximate. |
| C-2 | "saas_db.json ~7.8 MB — many records" | breakdown: **98.6% is `workspaceData`; 99.9% of that is ONE brand's 3 base64 images**; all structured records < 90 KB | The problem is **media-in-DB**, not record volume. Migration priority: extract images BEFORE row migration. Record-count-based sizing would have been wrong. |
| C-3 | "JSON persistence, no transactions/indexes" | still true, but add: **14 leaked tmp files (~9 MB)** and **zero backups on disk** — ops risk higher than stated | Backup gap upgraded to HIGH in integrity findings (I-6). |
| C-4 | "4 publish adapters missing" | unchanged — `publishEngine` still `adapter_missing` | confirmed, no drift |
| C-5 | "no email delivery" | unchanged | confirmed |
| C-6 | "MFA backdoor removed / MFA disabled" | `mfaEnabled` flags zeroed by migration; `/mfa/setup|verify` → 501 | confirmed resolved code-side |
| C-7 | "prototype pollution on /api/saas/state" | **verified closed live**: `__proto__`/`constructor` → 400 (unknown-key whitelist); plus optimistic versioning + anti-wipe + ref-integrity added (T1.0) | resolved + hardened beyond original scope |
| C-8 | "sessionToken in responses / localStorage" | removed server-side AND client-side; cookie-only verified live | resolved |
| C-9 | Implicit: "accounts in workspaceData = connected accounts" | **new finding**: 2-account blobs exist while `social_connections.json` is absent → UI-facing accounts may have **no OAuth tokens backing them** | accounts-without-tokens is a data-integrity issue (I-9), needs owner decision |
| C-10 | "growth unknown" | dated records span only **9 days** — dataset is fresh dev data, not production | growth projections must be marked [UNKNOWN]; design must not size from this |
| C-11 | "43 tests / suite" vs actual | **42 tests: 41 pass, 1 fail** (firebase config — pre-existing) | baseline corrected in 01-baseline.md |
| C-12 | Phase-A artifacts pre-existed this discovery | `db/migrations/0001_schema_v2.sql`, `scripts/migrate-json-to-pg.ts`, `docs/DATABASE_SCHEMA_V2.md`, T1.0 hotfix were implemented **before** this read-only prompt | chronology conflict documented; this phase **validates** them against new evidence (schema largely consistent; migration script needs media-extraction step added — see Part 3) |

## Items confirmed unchanged (no correction needed)

- No real publish adapters; analytics have no sync workers; billing upgrade is GOD-only now but still no payment processor; OAuth connect flows code-complete but publishing unproven; Firebase unused; `gemini-3.8-flash` verified real model name.
