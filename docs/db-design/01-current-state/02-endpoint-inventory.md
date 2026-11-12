# 02 — Endpoint Inventory

**Method:** programmatic extraction (`docs/db-design/scripts/extract-routes.mjs`) → `endpoints.csv` (149 routes) + manual middleware/permission review [RUN+READ].
**Count vs audit:** audit said ~145 → actual **149** route definitions (+4: the new `/api/system/diagnostics`, `/api/saas/state` versioning unchanged, MFA disable retained, misc). Diff explained by post-audit security edits (deleted 4 bypass routes −4, added diagnostics +1, others net).

## Router-level auth (applies to every route in the router) [READ]

| Router | Mount | Router-level middleware |
|---|---|---|
| authRouter | `/api/auth` | none (per-route guards; `authRateLimiter` at mount in server.ts) |
| saasRouter | `/api/saas` | **`requireAuth` on ALL 86 routes** + `checkMaintenanceMode` at mount |
| mediaRouter | `/api/media` | **`requireAuth` on ALL 9 routes** + `checkMaintenanceMode` |
| aiRouter | `/api/ai` | **`requireAuth` on ALL 6 routes** + `aiRateLimiter` + `checkMaintenanceMode` |
| oauthRouter | `/api/oauth` | per-route `requireAuth`; `checkMaintenanceMode` at mount |
| driveRouter | `/api/drive` | per-route `requireAuth`; `checkMaintenanceMode` at mount |

Public (unauthenticated) routes: `/health`, `/api/health`, `/api/system/public-config`, `/api/system/status`, `GET *` (SPA), `/api/auth/{register,login,logout,verify-email,forgot-password,reset-password,verify-email-change,magic-link/send,magic-link/verify}`, `/api/drive/callback`, `/api/oauth/callback/*` (callback routes are inside oauthRouter? — see note), `/api/saas/members/invitations/accept` is authed (router-level) even though semantically pre-login.

> **Note:** `GET /api/oauth/callback/:provider` uses an array-path pattern (`['/callback/:provider','/callback/:provider/']`) that the extractor regex missed — counted manually (+1 → **150 total**).

## Full route table

Legend: MW = middleware detected on the route line; router-level `requireAuth` applies additionally where noted above.

### server.ts (8) — infra
| Method | Path | MW | Notes |
|---|---|---|---|
| GET | /health, /api/health | — | liveness, minimal payload |
| GET | /api/system/diagnostics | requireAuth+requireGodOwner | detailed diagnostics (moved out of /health) |
| GET | /api/system/public-config | — | maintenance flag + announcements (public) |
| GET | /api/system/status | — | public status |
| GET | /api/scheduler/status | requireAuth+requireGodOwner | was public pre-T0.5 |
| POST | /api/scheduler/run-now | requireAuth+requireGodOwner | GOD only |
| GET | * | — | SPA fallback / vite |

### authRouter (19) — /api/auth
| Method | Path | MW | Reads | Writes | Notes |
|---|---|---|---|---|---|
| POST | /register | bruteForceGuard | — | users, workspaces, workspaceMembers, verificationTokens, securityEvents, auditLogs | creates workspace+member in one flow; returns cookie only |
| POST | /login | bruteForceGuard | users, sessions | sessions, users.lastLoginAt, securityEvents | scrypt verify; cookie set |
| GET | /me | requireAuth | users, workspaces, workspaceMembers | — | session→user→workspace chain |
| POST | /logout | — | sessions | sessions(delete), cookie clear | deletes ALL candidate sessions |
| POST | /verify-email | — | verificationTokens, users | verificationTokens.usedAt, users.isEmailVerified | hashed token match |
| POST | /forgot-password | bruteForceGuard | users | verificationTokens(password_reset) | no email delivery — token only via dev hint |
| POST | /reset-password | bruteForceGuard | verificationTokens, users | verificationTokens.usedAt, users.passwordHash, sessions(delete) | 60-min token |
| POST | /change-password | requireAuth | users | users.passwordHash | requires current pw |
| PUT | /profile | requireAuth | users | users(profile fields), verificationTokens(email_change) | email change → pending token |
| POST | /verify-email-change | — | verificationTokens, users | users.email, tokens.usedAt | |
| GET | /sessions | requireAuth | sessions | — | own sessions list |
| DELETE | /sessions/:id | requireAuth | sessions | sessions(delete) | own session only |
| POST | /sessions/revoke-others | requireAuth | sessions | sessions(delete others) | |
| GET | /security/activity | requireAuth | securityEvents/auditLogs | — | own activity feed |
| POST | /mfa/setup | requireAuth | — | — | **501 disabled** (T0.3) |
| POST | /mfa/verify | requireAuth | — | — | **501 disabled** |
| POST | /mfa/disable | requireAuth | users | users.mfaEnabled=false | still functional (legacy escape hatch) |
| POST | /magic-link/send | bruteForceGuard | users | verificationTokens(magic_link) | 6-digit OTP hashed, 5-attempt cap, 10-min TTL |
| POST | /magic-link/verify | bruteForceGuard | verificationTokens, users, workspaces | sessions(create), tokens.usedAt | creates session+cookie |

### saasRouter (86) — /api/saas — ALL requireAuth + maintenance check
Grouped by function (full per-route detail in `endpoints.csv`):

- **State blob (2):** `GET /state` (returns data + stateVersion), `POST /state` (hardened T1.0: baseVersion 409, key whitelist, anti-shrink, referential check; 25mb limit)
- **Queue (4):** `/queue/status|pause|resume|analytics|best-times|notifications` — read/write `workspaceData.queuePaused` + posts[]
- **History (2):** `/history`, `/history/analytics` — read posts/analytics from blob
- **Brands/Projects CRUD (8):** `/brands*`, `/projects*` — read/write `workspaceData.{brands,projects}`
- **Workspace (2):** `POST /workspace` (create), `PUT /workspace/:id` (owner/admin, whitelisted name+settings)
- **Members/Invites (8):** `/members`, `/members/invite`, `/members/invitations*`, `/members/:id` PATCH/DELETE, `/workspaces/transfer-ownership` — workspaceMembers, workspaceInvitations
- **Subscription (1):** `POST /subscription/upgrade` — requireGodOwner; **501 until payment provider**
- **Admin console (~30):** `/admin/*` — overview, users mgmt (status/role/sessions/delete — GOD), system-settings, announcements, sessions, audit-logs(+export), storage-metrics/details, upload-policy, security/overview, infrastructure, scheduler pause/resume, privacy-shield, maintenance(+tasks/history), background-ops, backups(+verify), recovery(+rollback/full)
- **Account self-service (5):** `/account-overview`, `/account` DELETE (password), `/account/deactivate`, `/account/delete-request`, `/account/avatar`
- **Social accounts (3):** `/social-accounts` GET/DELETE — workspaceData.accounts + oauthStore
- **Automations (11):** `/automations/workflows*`, `/executions*`, `/approvals*`, `/analytics` — workspaceData.automation*
- **Misc:** `/roles*` (custom roles in blob), `/audit-logs` (workspace audit), `/members/invitations/accept`

### mediaRouter (9) — /api/media — ALL requireAuth
| Method | Path | Notes |
|---|---|---|
| GET | /policy | upload limits per plan (uploadPolicy.json / DB?) |
| GET | / | list media (media_catalog.json + disk scan?) |
| POST | /upload | base64 JSON, 150mb parser; magic-byte sniff |
| POST | /chunked/init, GET /chunked/:sid/status, PUT /chunked/:sid/chunk/:idx, POST /chunked/:sid/complete, DELETE /chunked/:sid | chunked upload sessions — **in-memory? verify 1.7** |
| DELETE | /:id | delete asset + file |

### oauthRouter (11) — /api/oauth
| Method | Path | MW | Notes |
|---|---|---|---|
| GET | /config | requireAuth | OAuth client config status (masked) |
| POST | /config | requireAuth+requireGodOwner | set provider credentials → oauth_config.json |
| GET | /diagnostics | requireAuth+requireGodOwner | connection health |
| POST | /authorize-url | requireAuth | builds provider auth URL + state nonce → **pending attempts store (in-memory?)** |
| GET | /accounts | requireAuth | list connections (oauthStore → social_connections.json) |
| POST | /accounts/:id/select-channels | requireAuth | multi-channel pick |
| GET | /accounts/:id/capabilities | requireAuth | provider capabilities probe |
| POST | /accounts/:id/brand | requireAuth | assign account→brand |
| POST | /accounts/:id/refresh | requireAuth | token refresh → provider API |
| POST | /accounts/:id/diagnostics | requireAuth | per-account diagnostics |
| DELETE | /accounts/:id | requireAuth | revoke + delete connection |

| GET | /callback/:provider | — (public, state-nonce validated) | `oauthRouter.get(['/callback/:provider','/callback/:provider/'])` — array-path pattern missed by extractor; **+1 route → 150 total**. Exchanges code, stores encrypted tokens, posts `OAUTH_AUTH_SUCCESS` to popup |

CSRF middleware (`authRouter.ts` ~L223-234) explicitly exempts paths ending `/callback`, `/oauth/callback`, and containing `/callback` — OAuth redirects are cross-site GETs by design.

### driveRouter (10) — /api/drive
| Method | Path | MW | Notes |
|---|---|---|---|
| POST | /authorize-url | requireAuth | Google OAuth URL + PKCE → pending attempt |
| GET | /callback | — | **public** OAuth redirect target (state-validated) |
| GET | /connections | requireAuth | drive_connections.json |
| DELETE | /connections/:id | requireAuth | |
| GET | /files, /files/:fileId | requireAuth | proxy to Google Drive API (token server-side) |
| POST | /import | requireAuth | Drive file → media asset |
| GET | /imports, /imports/:id, POST /imports/:id/retry | requireAuth | drive_imports.json |

### aiRouter (6) — /api/ai — ALL requireAuth + aiRateLimiter(20/min)
`POST /analyze-retention`, `/inspect-creative`, `/optimize-timing`, `/generate-hooks`, `/analyze-video`, `/generate-strategy` — all call Gemini (`@google/genai`), read workspace state from blob for context, **no persistence of AI outputs** (returned to client which stores in blob).

## Data-access summary per router (detail in 03-data-access-map.md)

| Router | Primary stores touched |
|---|---|
| authRouter | saas_db: users, sessions, verificationTokens, workspaces(read), workspaceMembers(read), securityEvents, auditLogs |
| saasRouter | saas_db: EVERYTHING (workspaceData blob R/W, users, sessions, workspaceMembers, invitations, systemSettings, auditLogs, securityEvents) + oauthStore(accounts) + filesystem (backups/, uploads quota) |
| mediaRouter | media_catalog.json, data/uploads/**, uploadPolicy, saas_db.workspaceData.videos (quota?) |
| oauthRouter | social_connections.json, oauth_config.json, **in-memory pending attempts**, provider HTTPS APIs |
| driveRouter | drive_connections.json, drive_imports.json, Google APIs, media assets |
| aiRouter | saas_db.workspaceData (read context), Gemini API |
| scheduler.ts | saas_db.workspaceData.posts (claim/update), in-memory timers |
| publishEngine.ts | workspaceData.posts + targets (no adapters → always fails) |
| automationEngine.ts | workspaceData.automation*, in-memory lastTriggerHash |
