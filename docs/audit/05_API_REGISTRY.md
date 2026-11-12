# 05 — API Registry

All routes verified against source. AuthN = `requireAuth` (session token); AuthZ noted. "ws" = resolved from `x-workspace-id`.

## Public / infra (server.ts)
| Method | Path | Notes |
|---|---|---|
| GET | /health, /api/health | public; returns DB counts + scheduler status |
| GET | /api/system/public-config | public; maintenanceMode, announcements, featureFlags |
| GET | /api/system/status | public; hasGeminiKey, model name |
| GET | /api/scheduler/status | public (!) — leaks queue stats unauthenticated |
| POST | /api/scheduler/run-now | public (!) — anyone can trigger publish cycle |
| GET | /api/drive/watch-folder | public; **returns hardcoded mock data** |

## Auth (`/api/auth`, rate-limited 30/min/IP)
| Method | Path | Auth | Status |
|---|---|---|---|
| POST | /register | public+bruteForce | works; returns sessionToken + dev verificationToken hint |
| POST | /login | public+bruteForce | works; MFA branch accepts '123456' |
| POST | /demo-login | public+bruteForce | **CRITICAL bypass — instant session as admin/creator** |
| POST | /social-login | public+bruteForce | **bypass — trusts client email/provider, no IdP token check** |
| POST | /passkey/login | public+bruteForce | **bypass — session for arbitrary email** |
| POST | /sso/login | public+bruteForce | **bypass — auto-provisions SSO users** |
| POST | /magic-link/send, /magic-link/verify | public+bruteForce | works mechanically; OTP never emailed; 6-digit space |
| GET | /me | requireAuth | works |
| POST | /logout | public (token-based) | works |
| POST | /verify-email, /forgot-password, /reset-password | public | works; tokens never delivered in prod |
| POST | /change-password, /mfa/setup, /mfa/verify, /mfa/disable | requireAuth | works; MFA backdoor code |
| PUT | /profile | requireAuth | works; verified email-change flow |
| POST | /verify-email-change | public (token) | works |
| GET/DELETE | /sessions, /sessions/:id; POST /sessions/revoke-others | requireAuth | works |
| GET | /security/activity | requireAuth | works |

## SaaS (`/api/saas`, requireAuth + checkMaintenanceMode)
State/queue: GET/POST /state · GET /queue/status · POST /queue/pause|resume · GET /queue/analytics|best-times|notifications
History: GET /history · GET /history/analytics
Brands/projects: GET/POST /brands · PATCH/DELETE /brands/:id · GET/POST /projects · PATCH/DELETE /projects/:id
Workspace: POST /workspace · PUT /workspace/:id · POST /workspaces/transfer-ownership
Members: GET /members · POST /members/invite · GET /members/invitations · POST /members/invitations/:id/revoke · POST /members/invitations/accept · PATCH/DELETE /members/:id · GET/POST/DELETE /roles(/:id)
Billing: POST /subscription/upgrade (instant, no payment)
Account: GET /account-overview · DELETE /account · GET/DELETE /social-accounts(/:id) · POST /account/deactivate|delete-request|avatar · GET /audit-logs
Automations: GET/POST /automations/workflows · PATCH/DELETE /automations/workflows/:id · POST .../duplicate|.../run · GET/POST /automations/executions · GET/POST /automations/approvals(/:id/resolve) · GET /automations/analytics
Admin (role-gated): GET /admin/overview|users|system-settings|sessions|audit-logs|storage-metrics|storage-details|upload-policy|security/overview|infrastructure|privacy-shield|maintenance|background-ops|backups|maintenance-tasks|maintenance-history|recovery · PUT /admin/system-settings|upload-policy|maintenance · POST /admin/announcements|backups|backups/:id/verify|maintenance-tasks/:key/run|scheduler/pause|scheduler/resume|recovery/rollback|recovery/full · PUT /admin/users/:id/status|role · DELETE /admin/users/:id(/sessions) · GET /admin/audit-logs/export — all `requireGodOwner`/`requireRole` enforced server-side.

## OAuth (`/api/oauth`, requireAuth unless noted)
GET /config · POST /config (god) · GET /diagnostics (god) · POST /authorize-url · GET /callback/:provider (public, state-validated) · GET /accounts · POST /accounts/:id/select-channels|brand|refresh|diagnostics · GET /accounts/:id/capabilities · DELETE /accounts/:id

## Drive (`/api/drive`)
POST /authorize-url (auth) · GET /callback (public, state) · GET/DELETE /connections(/:id) · GET /files(/:fileId) · POST /import · GET /imports(/:id) · POST /imports/:id/retry

## Media (`/api/media`, requireAuth)
GET /policy · GET / · POST /upload · POST /chunked/init · GET /chunked/:sid/status · PUT /chunked/:sid/chunk/:idx · POST /chunked/:sid/complete · DELETE /chunked/:id · DELETE /:id

## AI (`/api/ai`, requireAuth)
POST /analyze-retention · /inspect-creative · /optimize-timing · /generate-hooks · /analyze-video · /generate-strategy

## Contract mismatches / gaps
- No dedicated endpoints for posts/videos/analytics CRUD — all via whole-blob `POST /api/saas/state`.
- No publish/analytics-sync endpoints exist at all (backend capability absent, not just unused).
- `/api/scheduler/run-now` and `/api/scheduler/status` are **unauthenticated**.
- Frontend `apiFetch` targets all exist; spot-check found no calls to nonexistent paths, but per-component verification is NOT exhaustive (see EVIDENCE limits).
