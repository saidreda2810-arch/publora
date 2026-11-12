# 03 — Platform Module Inventory

Frontend tabs (`src/lib/routes.ts`) → view components → backend surface.

## A. Authentication & User Management
| Feature | Frontend | Backend | Status |
|---|---|---|---|
| Sign Up | SignUpModal | POST /api/auth/register | WORKS (session issued immediately; email verification token generated but never sent) |
| Sign In | SignInModal | POST /api/auth/login | WORKS (scrypt verify, timing-equalized) |
| Sign Out | AuthContext | POST /api/auth/logout | WORKS |
| Email verification | VerifyEmailModal | POST /api/auth/verify-email | PARTIAL — token exists in DB; no email sent; in dev the token is returned in response (`verificationToken` dev hint), in prod user can never get it |
| Password reset | ForgotPasswordModal | POST /api/auth/forgot-password + /reset-password | PARTIAL — 6-digit code generated but never emailed; prod hides `testTokenHint` → dead end |
| Password change | SecuritySection | POST /api/auth/change-password | WORKS |
| Session management | SecuritySection | GET/DELETE /api/auth/sessions, /sessions/revoke-others | WORKS |
| Remember Me | — | — | NOT IMPLEMENTED (fixed 30-day session, no checkbox) |
| Session expiry | — | 30-day `expiresAt` check in findSessionByToken | WORKS (server-side) |
| Profile / preferences | profile/* | PUT /api/auth/profile (validated whitelist) | WORKS |
| Avatar upload | PersonalSection | POST /api/saas/account/avatar (data-URL, ≤2MB, mime-checked) | WORKS (stored inline in user record — bloats saas_db.json) |
| Account deletion | SecuritySection | DELETE /api/saas/account (password confirm); POST /account/delete-request (soft, 30-day); POST /account/deactivate | WORKS (two overlapping deletion paths — debt) |
| Login history | SecuritySection | GET /api/auth/security/activity | WORKS (reads auditLogs) |
| Rate limiting | — | express rate limiter on /api/auth (30/min/IP) + bruteForceGuard | WORKS |
| Brute-force protection | — | bruteForceGuard.ts (per-IP + per-account + admin thresholds, progressive delay, escalation cap) | WORKS (in-process only — single instance) |
| Password hashing | — | crypto.scrypt + per-user salt + timingSafeEqual | WORKS |
| MFA | SecuritySection | POST /api/auth/mfa/setup|verify|disable | PARTIAL/BROKEN — accepts hardcoded code `123456`; `mfaSecret` format `secret:code` is not TOTP; no QR/real second factor |
| Social login (Google/GitHub/Apple) | SignInModal | POST /api/auth/social-login | **MOCK/BROKEN** — trusts client-supplied email/provider with zero token verification; auto-creates/logs into accounts |
| Magic link / OTP | SignInModal | POST /api/auth/magic-link/send + /verify | PARTIAL — 6-digit OTP never emailed (dev hint only in non-prod); 6-digit space brute-forceable within 15-min window |
| Passkey/WebAuthn | SignInModal | POST /api/auth/passkey/login | **BROKEN — auth bypass**: logs in as ANY user by email (or first active user) with no cryptographic verification |
| Enterprise SSO/SAML | SignInModal | POST /api/auth/sso/login | **BROKEN — auth bypass**: same pattern, auto-provisions `executive@domain` users |
| Demo login | SignInModal | POST /api/auth/demo-login | **CRITICAL** — unauthenticated instant login as admin/creator seeds; reachable in production |

## B. Workspaces & Team Collaboration
| Feature | Backend | Status |
|---|---|---|
| Workspace create | POST /api/saas/workspace | WORKS |
| Workspace edit/settings/onboarding | PUT /api/saas/workspace/:id | WORKS (any member can edit — owner check is `membership exists OR platform_admin`, so **any member can modify plan/name/settings** — see SECURITY) |
| Workspace switching | `x-workspace-id` header → requireAuth resolves | WORKS |
| Members list | GET /api/saas/members | WORKS |
| Invite | POST /api/saas/members/invite | PARTIAL — token created+hashed, but **no email sent**; invite link returned to inviter for manual sharing (honest) |
| Accept invite | POST /api/saas/members/invitations/accept | WORKS (email-match enforced, 7-day expiry, pending→accepted) |
| Revoke/expire | POST .../invitations/:id/revoke | WORKS |
| Member role change / suspend / remove | PATCH/DELETE /api/saas/members/:id | WORKS (owner protected, last-owner guard) |
| Roles & permissions | GET/POST/DELETE /api/saas/roles + hasWorkspacePermission | WORKS (custom roles = baseRole alias; ≤10) |
| Ownership transfer | POST /api/saas/workspaces/transfer-ownership | WORKS (confirm flag, owner-only) |
| Workspace isolation | workspaceData keyed by workspaceId; all /api/saas requires workspace | WORKS at this scale (verify cross-tenant in tests — BLOCKED, no runtime) |
| Workspace subscription/plan | PUT workspace + POST /subscription/upgrade | PARTIAL — plan change is instant, no payment, no proration |
| Workspace activity | auditLogs (per-workspace + global) | WORKS |
| Team UI | TeamWorkspaceView | UI present; wired to above endpoints |

## C. Brand Management
| Feature | Backend | Status |
|---|---|---|
| CRUD brands | GET/POST/PATCH/DELETE /api/saas/brands | WORKS (name-unique, dependency check w/ force flag) |
| Archive/restore | via `status` field PATCH | PARTIAL (no dedicated archive endpoint; status string unvalidated) |
| Brand members/roles | PATCH /brands/:id `members[]` + canAccessBrand rank checks | WORKS (open brands = all workspace members) |
| Logo/cover/industry/timezone | stored as arbitrary fields in brand object via PATCH | PARTIAL — free-form JSON, no upload/validation of asset fields |
| Brand↔accounts/projects/posts/media | brandId scoping in queries + getScopedSocialAccounts | WORKS (enforced server-side for social accounts; posts rely on workspace data blob) |
| Brand detail page | BrandDetailView (/brands/:id) | UI present |

## D. Social Accounts (per platform)
Common backend: POST /api/oauth/authorize-url → provider consent → GET /api/oauth/callback/:provider → token exchange → channel discovery → encrypted storage in `social_connections.json`. Endpoints: GET /api/oauth/config|diagnostics|accounts|accounts/:id/capabilities; POST select-channels|brand|refresh|diagnostics; DELETE accounts/:id. Plus GET/DELETE /api/saas/social-accounts.

| Capability | YouTube | Facebook Pages | Instagram Pro | TikTok |
|---|---|---|---|---|
| OAuth authorize URL | REAL (Google v2, offline+consent) | REAL (FB dialog v19) | REAL (FB dialog, IG scopes) | REAL (Login Kit v2 + PKCE S256) |
| Callback + state/CSRF | REAL (pending-attempt store, 30-min TTL) | same | same | same |
| Token exchange | REAL | REAL | REAL | REAL (code_verifier) |
| Channel/account discovery | REAL (channels.list mine=true) | REAL (me/accounts + tasks) | REAL (instagram_business_account via pages) | REAL (user/info) |
| Token storage | AES-256-CBC encrypted (key = OAUTH_ENCRYPTION_KEY or **hardcoded fallback**) | same | same | same |
| Token refresh | REAL refresh_token grant | validity check only (long-lived token) | validity check only | REAL refresh grant |
| Diagnostics | REAL API ping | REAL | REAL | REAL |
| Disconnect/revoke | REAL (google revoke + delete) | delete only | delete only | delete only |
| **Publishing** | **NOT IMPLEMENTED** (adapter_missing) | NOT IMPLEMENTED | NOT IMPLEMENTED | NOT IMPLEMENTED |
| **Analytics sync** | NOT IMPLEMENTED (no worker) | NOT IMPLEMENTED | NOT IMPLEMENTED | NOT IMPLEMENTED |

Credentials (.env): Google ✓, TikTok ✓, **Meta ✗ (empty)** → Facebook/Instagram connect will 400 `requiresConfig`. Whether Google/TikTok secrets are valid is UNVERIFIED (no live test possible).

## E. Dashboard
DashboardView + stats derive from workspace state (`/api/saas/state`) and queue/history endpoints — all real computations over stored posts. Empty states exist. No hardcoded metric fabrication found in backend; verify per-card sources in UI (NOT fully audited line-by-line — flagged NOT TESTED for individual cards).

## F. Media Library
| Feature | Status |
|---|---|
| Upload (base64) | WORKS — POST /api/media/upload, mime+ext+size+magic-byte checks, plan limits, workspace quota |
| Chunked resumable upload | WORKS — init/chunk/status/complete/delete, session TTL sweep, per-workspace auth |
| List/Delete | WORKS — workspace-scoped catalog, file unlink, audit log |
| Storage provider | Local disk only (`data/uploads`, static `/uploads`) — no S3/GCS |
| Search/filter/folders/thumbnails | NOT IMPLEMENTED server-side (frontend filters client-side over full catalog) |
| Media↔brand association | via workspace data `videos[]`, not media catalog — two parallel media concepts (catalog assets vs `videos` entities) — DEBT |

## G. Content Creation & AI Studio
- 6 real Gemini endpoints (`/api/ai/*`): analyze-retention, inspect-creative, optimize-timing, generate-hooks, analyze-video (inline video ≤100MB via base64), generate-strategy. All `requireAuth`; 503 when `GEMINI_API_KEY` unset (dead fallback code after `return` — bug).
- VideoLibraryView/AddVideoWizard: video entities live in workspace `videos[]` synced via /api/saas/state.
- Drafts/posts: `posts[]` in workspace state; scheduling writes status='scheduled'.
- Templates/caption-gen UI exist in views; actual AI calls only via the 6 endpoints — other "AI" buttons may be UI-only (NOT fully verified per-button).

## H. Publishing Engine — see dedicated section in BUGS. Scheduler real; adapters absent → **all publishes fail**.

## I. Publishing Calendar & Queue
- PublishingCalendarView (107KB), PublishingQueueView: client-side rendering over `posts[]` synced via /api/saas/state; queue pause/resume real (POST /api/saas/queue/pause|resume, workspace-scoped, audit-logged); queue analytics/best-times/notifications computed from real post records.
- Timezone: `calendarSettings.timezone` stored; conversion client-side — verify correctness NOT TESTED.

## J. Publishing History
GET /api/saas/history (+/history/analytics): real filtering/sorting/pagination over posts + analytics join. Since no post ever reaches 'published' (no adapters), history will only ever show scheduled/failed — honest but empty of successes.

## K. Analytics
No sync workers. `data.analytics[]` populated only if clients write via /api/saas/state. RetentionIntelligenceView/ReportsView render stored records + call AI endpoints for analysis. **All platform metrics (views/likes/watch-time) are UI-entered or absent — no provider pulls exist.**

## L. Automations
Real engine (automationEngine.ts): triggers interval/daily/weekly/drive_new_file/video_uploaded/post_scheduled/post_failed/manual; steps notify_user/assign_brand/assign_project/add_to_queue/wait/approval/condition; executions persisted per workspace; approvals file; runs inside scheduler cycle. add_to_queue creates real scheduled posts (which then fail at publish). PARTIALLY WORKING end-to-end.

## M. GOD Console (AdminDashboardView)
Real endpoints for: overview, users list/status/role/sessions/delete, system settings, announcements, sessions, audit logs (+export), storage metrics/details, upload policy, security overview, infrastructure, scheduler pause/resume, privacy-shield (self-reporting), maintenance config, background-ops, backups (file copies + verify), maintenance tasks (5 real checks), maintenance history, recovery (rollback/full). All requireRole/requireGodOwner. Maintenance middleware enforces modes on API + serves HTML maintenance page. WORKS (single-instance caveats).

## N. Notifications
In-app: derived from post publishingEvents + automation notices in auditLogs (GET /api/saas/queue/notifications). Email: NONE. Preferences stored on user but nothing delivers by them. PARTIAL.

## O. Subscription & Billing
Plans free/starter/professional/enterprise stored on workspace; POST /subscription/upgrade changes instantly — **no payment provider, no checkout, no webhooks, no invoices, no enforcement of plan limits except upload size/quota**. SIMULATED billing.

## P. Public Website & Legal
Public landing/pricing/features/platforms/FAQ/legal modals — static marketing content. Claims (e.g., "publish everywhere") exceed actual capability (no publish adapters). LegalContent exists; accuracy vs reality questionable.

## Q. Localization & Theme
language en/ar stored in user prefs + language field; ThemeContext dark/light/system persisted. RTL handling NOT verified (index.css 16KB — not fully audited). Date/number formatting per user prefs partially implemented.

## R. Other modules discovered
- Google Drive integration (driveRouter): REAL OAuth (drive.readonly + PKCE), file browse/download/import to media, import jobs + retry. Distinct from the mocked `/api/drive/watch-folder`.
- AutopilotControlCenter, ExperimentManager, PublishingTimeOptimizer, ContentIntelligence, MetricAvailability, RetentionIntelligence, AIStrategist — views over workspace state + AI endpoints.
