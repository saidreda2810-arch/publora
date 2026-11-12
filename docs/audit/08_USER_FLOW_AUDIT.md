# 08 — User Flow Audit

Runtime execution was impossible (no Node.js in audit environment) — flows are traced through code paths. Statuses reflect code verification, not live runs.

| Flow | Path | Result |
|---|---|---|
| 01 Registration | SignUpModal → POST /api/auth/register → createUser (scrypt, workspace+member+audit) → session → cookie+token → dashboard | ✅ works in code. Caveat: `requireEmailVerification` setting exists but register does NOT enforce it — user lands fully active unverified |
| 02 Login | SignInModal → /login → verifyPassword (timing-equalized) → optional MFA branch → session → /me → workspace | ✅ works; MFA path has `123456` backdoor |
| 03 Workspace creation | UI → POST /api/saas/workspace → createWorkspace → member row → workspaces list | ✅ works |
| 04 Brand creation | BrandAccountManager/Brands → POST /api/saas/brands → workspaceData.brands → brand page | ✅ works; logo/cover are free-form fields (no upload pipeline) |
| 05 Social connect | SocialConnectionCenter → POST /api/oauth/authorize-url (brandId validated against workspace) → provider popup → /api/oauth/callback/:provider → real token exchange + channel discovery → encrypted upsert → OAUTH_AUTH_SUCCESS postMessage → accounts refresh | 🟡 fully implemented code path; UNVERIFIED live (needs real provider creds + redirect URIs registered). Meta providers blocked: META_APP_ID/SECRET empty in .env |
| 06 Media upload | VideoLibrary/AddVideoWizard → POST /api/media/upload (or chunked) → policy+quota+magic-byte checks → data/uploads → media_catalog.json → /uploads URL | ✅ works in code; files persist on disk |
| 07 Content creation | editor → caption/platform config → videos/posts in workspace state → debounced POST /api/saas/state | 🟡 persists via blob sync; last-write-wins across tabs |
| 08 Scheduling | calendar/queue → post{status:'scheduled',scheduledTime} → state sync → scheduler picks up when due | 🟡 job persisted; publish then fails (no adapters) |
| 09 Publishing | scheduler 30s → processPost claim → attemptPlatformPublish → **adapter_missing for every platform** → classify → status='failed' (non-retryable) | ❌ broken by design-gap; retry/backoff machinery correct but never reaches success |
| 10 Analytics | connected account → ??? | ⛔ no sync path exists; analytics[] only contains client-written records |
| 11 Automation | AutomationsView → workflows CRUD → engine triggers (interval/daily/weekly/drive/events) → steps → executions + approvals | 🟡 engine real; steps that queue posts produce posts that fail at publish |
| 12 Team invite | members/invite → hashed token, 7d expiry → manual link share → accept (email match) → member row | 🟠 works minus email delivery |
| 13 GOD admin | AdminDashboardView → role-gated endpoints → JSON DB mutations + auditLog | 🟡 real; single-instance only |
| 14 Maintenance | PUT /admin/maintenance → maintenanceConfig → checkMaintenanceMode on API + HTML page for browsers | 🟡 enforced; GOD/admin bypass works |
| 15 Subscription | pricing UI → POST /subscription/upgrade → plan field flip | 🎭 no payment/checkout/webhooks |

## Cross-cutting flow defects
- **Auth bypass quartet** lets any visitor become admin — invalidates every "authenticated" flow's trust boundary.
- Email-dependent flows (verify, reset, invite, magic) all dead-end without an email provider.
- localStorage-first state means UI can look correct while remote persistence silently failed.
