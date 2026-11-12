# 13 — Configuration Registry

Source: `.env.example` (documented) vs `.env` (actual, values not disclosed) vs `process.env` references in code.

| Variable | Purpose | Used by | Required | .env status |
|---|---|---|---|---|
| PORT | server port | server.ts | yes | SET |
| NODE_ENV | prod/dev behavior | server.ts, authRouter (devTokenField), oauthStore | yes | SET |
| APP_URL | canonical base URL for OAuth redirects | oauthRouter.getBaseUrl, driveRouter | yes (prod) | SET (len21 — likely localhost?) |
| SHARED_APP_URL | shared/preprod URL for callbacks | oauthRouter, driveRouter | prod | SET |
| GEMINI_API_KEY | Gemini AI | aiRouter | for AI features | SET |
| SESSION_SECRET | documented as session signing | **UNUSED in code** | no | SET (dead config) |
| OAUTH_ENCRYPTION_KEY | AES key for token encryption | oauthStore.ts:116 | yes (else hardcoded fallback — SEC-10) | SET (len48) |
| GOOGLE_CLIENT_ID/SECRET | YouTube+Drive OAuth | oauthStore.getOAuthConfig, automationEngine, saasRouter task | for YT/Drive | SET |
| META_APP_ID/SECRET (+FACEBOOK_APP_ID/SECRET aliases) | FB/IG OAuth | same | for Meta | **EMPTY** |
| TIKTOK_CLIENT_KEY/SECRET | TikTok OAuth | same | for TikTok | SET |
| UPLOAD_DIR | documented upload dir | **not referenced** — code hardcodes data/uploads | no | SET (dead config) |
| MAX_UPLOAD_SIZE_BYTES | documented cap | **not referenced** — policy file governs | no | SET (dead config) |
| ALLOWED_MIME_TYPES | documented | **not referenced** — hardcoded list + policy | no | SET (dead config) |
| BRUTE_FORCE_* (11 vars) | guard tuning | bruteForceGuard.ts | optional | absent → defaults (enabled) |
| TRUST_PROXY | X-Forwarded-For trust | server.ts | prod behind LB | absent → false (safe default) |
| SRA_EXPOSE_DEV_TOKENS | dev token hints | authRouter devTokenField | NEVER in prod | absent → hidden in prod (NODE_ENV=production?) |

## Findings
- 3 documented vars are dead (SESSION_SECRET, UPLOAD_DIR, MAX_UPLOAD_SIZE_BYTES, ALLOWED_MIME_TYPES).
- NODE_ENV value in .env is len=11 → likely "development" — if deployed as-is, dev token hints (verificationToken, testTokenHint, testOtpHint, emailChangeToken) would be exposed in API responses → **critical if this .env ships to production**.
- APP_URL len=21 suggests localhost — OAuth callbacks would be unreachable/misconfigured if deployed with it.
- No secrets found hardcoded in source except the OAUTH_ENCRYPTION_KEY fallback string and seed passwords (admin/demo — see SECURITY).
- oauth_config.json provides a second, plaintext credential channel (GOD-managed) — env takes precedence.
