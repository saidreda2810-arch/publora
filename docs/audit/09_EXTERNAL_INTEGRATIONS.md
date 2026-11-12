# 09 — External Integrations

Legend: CODE = implemented · CREDS = env/config present · APPROVED = provider-side approval · TESTED = live call verified.

## Google / YouTube (+ Drive)
- **CODE:** OAuth2 authorize (youtube scopes: youtube.upload, youtube.readonly, yt-analytics.readonly; drive.readonly for Drive flow), token exchange, channel discovery (`channels.list?mine=true`), userinfo, token refresh, revoke, diagnostics ping, Drive file browse/import.
- **CREDS:** GOOGLE_CLIENT_ID/SECRET set in `.env` (values not inspected). oauth_config.json may also hold GOD-entered values (env takes precedence).
- **APPROVED/TESTED:** unknown — requires registered redirect URIs (`/api/oauth/callback/youtube`, `/api/drive/callback`) on the deployed domain. NOT TESTED.
- **Publishing:** NOT IMPLEMENTED — `attemptPlatformPublish` returns `adapter_missing` for all platforms. No YouTube upload/Shorts/analytics-pull code exists.
- **Analytics:** yt-analytics scope requested but never used.

## Meta (Facebook Pages + Instagram Professional)
- **CODE:** FB Login dialog v19, token exchange, `me/accounts` page discovery w/ task-permission eligibility, IG business account discovery via pages, token validity check, disconnect.
- **CREDS:** META_APP_ID / META_APP_SECRET are **EMPTY** in `.env` → `authorize-url` returns 400 `requiresConfig` for both providers. GOD console could store creds in oauth_config.json — file exists (366 bytes) but contents not treated as verified.
- **Publishing/Insights:** NOT IMPLEMENTED.
- **APPROVED:** App Review/Advanced Access status unknown — scopes (pages_manage_posts, instagram_content_publish) require Meta app review for production.

## TikTok
- **CODE:** Login Kit v2 authorize with PKCE(S256), token exchange w/ code_verifier, user/info fetch, refresh grant, diagnostics.
- **CREDS:** TIKTOK_CLIENT_KEY/SECRET set in `.env`.
- **Publishing:** NOT IMPLEMENTED — no Content Posting API call anywhere.
- **APPROVED/TESTED:** unknown (app review + redirect URI registration required).

## AI — Google Gemini
- **CODE:** `@google/genai` client, model `gemini-3.8-flash`, 6 endpoints, JSON-mode responses, inline video ≤100MB.
- **CREDS:** GEMINI_API_KEY set (len 53).
- **TESTED:** not executed (no runtime). `/api/system/status` would report hasGeminiKey=true.
- **Gaps:** dead heuristic fallback after `return` (503 instead of fallback); no usage/cost tracking; no rate limiting beyond auth limiter.

## Firebase
- **CODE:** client SDK init (Auth Google provider + Firestore) in `src/utils/firebase.ts`; `firebase-applet-config.json`, `firestore.rules`, `apphosting.yaml`, `.firebaserc` present.
- **Usage:** effectively NONE — no Firestore reads/writes in app code; auth is custom Express. Firebase Auth popup helper exists but app login uses `/api/auth/*`. Deployment target = Firebase App Hosting (static+Node).
- **Status:** decorative/unused integration surface.

## Other services
- **Email:** NONE — no SMTP/SendGrid/etc. anywhere. All "sent" emails are dev-hint tokens.
- **Storage:** local disk only.
- **Payments:** NONE.
- **Monitoring/logging:** console.log + auditLogs JSON only.
- **Analytics providers:** NONE.

## Blockers summary
1. Meta credentials empty → FB/IG connect impossible until configured.
2. Publish adapters missing for ALL providers → core product value absent.
3. Analytics sync absent for ALL providers.
4. Email delivery absent → verification/reset/invite/magic flows dead.
5. Live OAuth unverified — needs deployed URL + registered redirect URIs + real consent test.
