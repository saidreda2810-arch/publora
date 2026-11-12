# 16 — Audit Evidence Index

All evidence is source-level (read-only). No runtime tests executed (Node.js unavailable). Line numbers refer to files at audit date 2026-11-11/12.

## Key file:line evidence

### Critical auth bypasses
- `server/authRouter.ts:972-1044` — demo-login seeds/logs in admin & creator, no credentials.
- `server/authRouter.ts:1047-1157` — social-login trusts `provider,email,fullName,avatarUrl` from body; no token exchange.
- `server/authRouter.ts:1160-1290` — magic-link 6-digit OTP, stored with userId=email; devTokenField hides hint only when NODE_ENV=production.
- `server/authRouter.ts:1293-1376` — passkey/login: finds user by email or first active user → createSession unconditionally.
- `server/authRouter.ts:1379-1459` — sso/login: same + auto-provisions `executive@domain` enterprise user.
- `server/authRouter.ts:386,932` — `mfaCode !== '123456'` bypass.
- `server/authRouter.ts:43-48` — devTokenField exposes verificationToken/testTokenHint/testOtpHint when not production.
- `server/authRouter.ts:284-289` — cookie `SameSite=None; Secure`; token also returned in body (login:419, register:339, me:439).

### Publishing gap
- `server/publishEngine.ts:9-15` — header comment: "actual third-party platform API calls are NOT implemented".
- `server/publishEngine.ts:84-118` — attemptPlatformPublish resolves account then always pushes `adapter_missing`.
- `server/scheduler.ts:19-113` — 30s cycle; claim/lock/retry/backoff; stuck-publish recovery; queuePaused/emergencyPaused.
- `server/scheduler.ts:115-122` — setInterval 30000.

### Database
- `server/saasDb.ts:262-263` — DATA_DIR/data/saas_db.json; `:419-429` atomic tmp+rename save; `:293` dbCache; `:5` GOD_OWNER_EMAIL hardcoded; `:271-282` scrypt+timingSafeEqual; `:611-614` sanitizeUserForClient.
- `data/` listing — saas_db.json 7,841,710 bytes + 15 `.tmp.*` files; social_connections.json, oauth_config.json, media_catalog.json, uploads/ (2 files).

### Tenant isolation
- `server/authRouter.ts:97-106` — requireAuth resolves workspace via membership + x-workspace-id.
- `server/saasRouter.ts:1239-1265` — getScopedSocialAccounts filters by workspace brands.
- `server/saasRouter.ts:62-75` — POST /state whole-blob merge, no per-entity validation.
- `server/saasRouter.ts:577-603` — PUT /workspace/:id allows any member.
- `server/oauthRouter.ts:38-50` — accountInWorkspace + findExistingAccount dedupe.
- `server/oauthRouter.ts:234-420` — authorize-url: brandId workspace-validated, state nonce, PKCE for TikTok.
- `server/oauthRouter.ts:514-1146` — callbacks: real token exchange + discovery for all 4 providers.
- `server/oauthRouter.ts:1319-1462` — refresh: real grants for YouTube/TikTok; validity check for Meta.

### Media/uploads
- `server/mediaRouter.ts:117-252` — base64 upload w/ policy, plan limit, quota, magic bytes, catalog.
- `server/mediaRouter.ts:259-420` — chunked session lifecycle.
- `server/uploadPolicy.ts:29-45` — default policy (1GB global, plan tiers, 10GB quota, 8MB chunks).
- `server.ts:45-50` — /uploads static, no auth.

### AI
- `server/aiRouter.ts:13-25` — Gemini client, gemini-3.8-flash; `:28-100` analyze-retention; `:280-…` analyze-video inline base64 ≤100MB; 503 paths with dead fallback code.

### Automations
- `server/automationEngine.ts:36-71` — trigger buckets/dedupe; `:77-178` step executors; `:262-331` cycle; `:344-426` real Drive/events detection; `:449-476` approvals+notify.

### Admin/GOD
- `server/saasRouter.ts:751-2371` — admin endpoints; requireGodOwner on destructive ops; maintenance config `:2116-2147`; backups `:2199-2238`; tasks `:2245-2315`; recovery `:2328-2371`; privacy-shield self-report `:1942-2030`.
- `server/authRouter.ts:139-167` — requireGodOwner anchored to primaryOwnerUserId.

### Mock/dead
- `server.ts:165-185` — hardcoded watch-folder response.
- `server.ts:141-148` — unauthenticated scheduler endpoints.
- `src/utils/demoData.ts` — returns empty arrays (clean, not mock).
- `src/utils/firebase.ts` — Firebase client init, no app usage found.
- `.env` — META_APP_ID/SECRET EMPTY; GOOGLE/TIKTOK/GEMINI set; NODE_ENV len=11 (likely development); APP_URL len=21 (likely localhost).

### Tests/config
- `tests/run-all-tests.ts` exists; NOT executed (no Node runtime — `node`/`npx` not found).
- `package.json` scripts: dev/build/start/lint/test.

## Limitations
- No live server run, no DB queries, no OAuth callbacks, no Gemini calls, no load tests.
- Frontend audited at wiring/context level; all 60 view components not line-by-line verified for dead buttons.
- `data/saas_db.json` contents not dumped (privacy); size/structure inferred from schema code.
- Prior markdown docs (COMPLETE_AUDIT.md etc.) reviewed only for cross-reference, not trusted as evidence.
