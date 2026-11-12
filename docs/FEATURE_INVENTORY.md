# SRA Social Publisher — Complete Feature Inventory

Audit baseline: 2026-11-05. Discovery based on actual code inspection (server.ts, server/*, src/*). No functionality assumed — statuses below reflect implementation presence, not verified behavior. Nothing is marked PASS until tested.

Status legend: IMPLEMENTED / PARTIALLY IMPLEMENTED / UI ONLY / NOT IMPLEMENTED / BLOCKED / NEEDS VERIFICATION

---

## 1. Public Website & Landing
| ID | Feature | Location | Status | Notes |
|----|---------|----------|--------|-------|
| PUB-01 | Landing page | `PublicLandingView` (unauthenticated) | NEEDS VERIFICATION | Hero, features, platforms, pricing, FAQ, footer, legal modals |
| PUB-02 | Sandbox/test-drive mode | `onEnterSandbox` → PublisherContext demo data | NEEDS VERIFICATION | Uses demo data, not backend |
| PUB-03 | Legal pages (privacy/terms) | `PublicLegalModals` | NEEDS VERIFICATION | |
| PUB-04 | Public pricing display | `PublicPricing` | UI ONLY | Static tiers, no checkout |
| PUB-05 | System announcements banner | `App.tsx` + `/api/system/public-config` | IMPLEMENTED | GOD-managed |

## 2. Authentication & Registration
| ID | Feature | API | Status | Notes |
|----|---------|-----|--------|-------|
| AUTH-01 | Email/password register | `POST /api/auth/register` | IMPLEMENTED | Creates user + workspace + verification token |
| AUTH-02 | Login | `POST /api/auth/login` | IMPLEMENTED | Session cookie + Bearer token, MFA hook |
| AUTH-03 | Logout | `POST /api/auth/logout` | IMPLEMENTED | |
| AUTH-04 | Session validation | `GET /api/auth/me` | IMPLEMENTED | Returns user, workspaces, memberRole |
| AUTH-05 | Email verification | `POST /api/auth/verify-email` | NEEDS VERIFICATION | Token flow; no real email sending |
| AUTH-06 | Password reset (forgot) | `POST /api/auth/forgot-password` | PARTIALLY | Returns `testTokenHint` in response — no real email |
| AUTH-07 | Password reset confirm | `POST /api/auth/reset-password` | IMPLEMENTED | Invalidates all sessions |
| AUTH-08 | Change password | `POST /api/auth/change-password` | IMPLEMENTED | Current-password verified |
| AUTH-09 | Social login (Google/GitHub/Apple) | `POST /api/auth/social-login` | PARTIALLY | Auto-provisions users; GitHub/Apple not real OAuth — simulated |
| AUTH-10 | Magic link / OTP | `/api/auth/magic-link/*` | PARTIALLY | Returns `testOtpHint`; no email delivery |
| AUTH-11 | Passkey/WebAuthn | `POST /api/auth/passkey/login` | UI ONLY | Simulated — no real WebAuthn ceremony |
| AUTH-12 | Enterprise SSO/SAML | `POST /api/auth/sso/login` | UI ONLY | Simulated provisioning |
| AUTH-13 | Demo login | `POST /api/auth/demo-login` | IMPLEMENTED | Seeded demo accounts |
| AUTH-14 | Rate limiting on auth | `authRateLimiter` | IMPLEMENTED | 30 req/min sliding window |
| AUTH-15 | Maintenance mode guard | `checkMaintenanceMode` | IMPLEMENTED | GOD/super_admin bypass |

## 3. User Profile & Account (new this session)
| ID | Feature | API | Status |
|----|---------|-----|--------|
| PROF-01 | Profile page `/profile` + section nav | `ProfilePage` | NEEDS VERIFICATION |
| PROF-02 | Personal info edit (name, username, bio, locale, formats) | `PUT /api/auth/profile` | NEEDS VERIFICATION (smoke-tested PUT) |
| PROF-03 | Email change w/ verification | `verify-email-change` | NEEDS VERIFICATION |
| PROF-04 | Avatar URL / initials fallback | client + `avatarUrl` | NEEDS VERIFICATION |
| PROF-05 | Account overview (usage, sessions, role) | `GET /api/saas/account-overview` | NEEDS VERIFICATION (smoke-tested) |
| PROF-06 | Sessions list / revoke / revoke-others | `/api/auth/sessions*` | NEEDS VERIFICATION |
| PROF-07 | Security activity log | `GET /api/auth/security/activity` | NEEDS VERIFICATION |
| PROF-08 | MFA setup/verify/disable | `/api/auth/mfa/*` | PARTIALLY — code-based, not TOTP |
| PROF-09 | Notification preferences (9 toggles, auto-save) | via profile PUT | NEEDS VERIFICATION |
| PROF-10 | Appearance: dark/light/system, density, language | ThemeContext + profile PUT | NEEDS VERIFICATION — language pref saved, no AR translations |
| PROF-11 | Danger zone: sign-out-all, delete account | `DELETE /api/saas/account` (password-confirmed) | NEEDS VERIFICATION |
| PROF-12 | Navbar profile dropdown | `ProfileMenu` | NEEDS VERIFICATION |

## 4. Workspace & Team
| ID | Feature | API | Status |
|----|---------|-----|--------|
| WS-01 | Workspace create/switch | `/api/saas/workspace*` | IMPLEMENTED |
| WS-02 | Workspace settings & onboarding flag | `PUT /api/saas/workspace/:id` | NEEDS VERIFICATION — any member can update (no role check) |
| WS-03 | Team members list | `GET /api/saas/members` | NEEDS VERIFICATION |
| WS-04 | Member invite | `POST /api/saas/members/invite` | PARTIALLY — simulated, no email |
| WS-05 | Subscription upgrade | `POST /api/saas/subscription/upgrade` | IMPLEMENTED — no payment, instant tier change |
| WS-06 | Plan tiers free/starter/pro/enterprise | Workspace.plan | IMPLEMENTED — quotas only partially enforced |

## 5. Dashboard & Overview
| ID | Feature | Status |
|----|---------|--------|
| DASH-01 | KPI dashboard (stats, charts) | NEEDS VERIFICATION — `DashboardView` |
| DASH-02 | Emergency pause / autopilot status | IMPLEMENTED — `toggleEmergencyPause` |

## 6. Video Library & Upload
| ID | Feature | API | Status |
|----|---------|-----|--------|
| VID-01 | Video library CRUD | workspace state + `VideoLibraryView` | NEEDS VERIFICATION |
| VID-02 | Media upload (100MB, MIME check) | `POST /api/media/upload` | IMPLEMENTED — multer disk storage |
| VID-03 | Media list/delete | `GET/DELETE /api/media/*` | NEEDS VERIFICATION |
| VID-04 | Google Drive integration | `GoogleDriveView`, `/api/drive/watch-folder` | PARTIALLY — needs GOOGLE creds |

## 7. Content Studio & AI
| ID | Feature | API | Status |
|----|---------|-----|--------|
| AI-01 | AI Video Studio (scenes, variants) | `AIVideoStudioView` + `/api/ai/analyze-video` | BLOCKED without GEMINI_API_KEY (has algorithmic fallback?) |
| AI-02 | AI Strategist (content plan) | `/api/ai/generate-strategy` | BLOCKED w/o key |
| AI-03 | Retention analysis | `/api/ai/analyze-retention` | BLOCKED w/o key |
| AI-04 | Creative inspection | `/api/ai/inspect-creative` | BLOCKED w/o key |
| AI-05 | Hook generation | `/api/ai/generate-hooks` | BLOCKED w/o key |
| AI-06 | Timing optimization | `/api/ai/optimize-timing` | BLOCKED w/o key |

## 8. Publishing & Scheduling
| ID | Feature | Status |
|----|---------|--------|
| PUB-10 | Compose post modal | NEEDS VERIFICATION |
| PUB-11 | Publishing queue | NEEDS VERIFICATION |
| PUB-12 | Publishing calendar (month/week/day) | NEEDS VERIFICATION — fixed mobile scroll this session |
| PUB-13 | Best-time optimizer heatmap | NEEDS VERIFICATION |
| PUB-14 | Publishing history/reports | NEEDS VERIFICATION — `ReportsView` |
| PUB-15 | Background scheduler (30s loop) | IMPLEMENTED — `scheduler.ts`, publishes due posts |

## 9. Social Integrations (OAuth)
| ID | Feature | Status |
|----|---------|--------|
| SOC-01 | YouTube OAuth connect | BLOCKED w/o GOOGLE_CLIENT_ID/SECRET |
| SOC-02 | Facebook Pages OAuth | BLOCKED w/o META creds |
| SOC-03 | Instagram Professional OAuth | BLOCKED w/o META creds |
| SOC-04 | TikTok OAuth (PKCE) | BLOCKED w/o TIKTOK creds |
| SOC-05 | Account list/refresh/diagnostics/disconnect | IMPLEMENTED — `oauthRouter`, encrypted tokens |
| SOC-06 | Workspace-scoped account view (profile) | IMPLEMENTED — new `/api/saas/social-accounts` |
| SOC-07 | Channel/page selection per brand | IMPLEMENTED — `select-channels` |
| SOC-08 | SocialConnectionCenterView UI | NEEDS VERIFICATION |

## 10. Analytics & Intelligence
| ID | Feature | Status |
|----|---------|--------|
| AN-01 | Retention intelligence (curves, milestones) | NEEDS VERIFICATION |
| AN-02 | Content intelligence | NEEDS VERIFICATION |
| AN-03 | Metric availability matrix | NEEDS VERIFICATION |
| AN-04 | Experiments A/B | NEEDS VERIFICATION |
| AN-05 | Automations rules engine | PARTIALLY — UI + state; execution unclear |

## 11. Admin & Governance
| ID | Feature | Status |
|----|---------|--------|
| ADM-01 | GOD console / admin dashboard | IMPLEMENTED — RBAC god>super_admin>admin>… |
| ADM-02 | User list/status/role management | IMPLEMENTED |
| ADM-03 | Session governance | IMPLEMENTED |
| ADM-04 | Audit logs | IMPLEMENTED |
| ADM-05 | System settings, announcements, feature flags | IMPLEMENTED |
| ADM-06 | Storage metrics | IMPLEMENTED |

## 12. Cross-Cutting
| ID | Feature | Status |
|----|---------|--------|
| UI-01 | Dark/light/system theme | IMPLEMENTED — new token system |
| UI-02 | Responsive layout | PARTIALLY — audited, calendar fixed, legacy views have hardcoded dark colors |
| UI-03 | Notifications center | NOT IMPLEMENTED as infra — prefs exist, no delivery |
| UI-04 | Billing/payments | NOT IMPLEMENTED — plan switching only |
| DB-01 | JSON-file persistence (`data/*.json`) | IMPLEMENTED — atomic writes, in-memory cache |
| DB-02 | Data isolation per workspace | IMPLEMENTED — `workspaceData` keyed by wsId |
| SEC-01 | Password hashing (scrypt), timing-safe compare | IMPLEMENTED |
| SEC-02 | Token encryption at rest (AES-256-CBC) | IMPLEMENTED — `OAUTH_ENCRYPTION_KEY` |
| SEC-03 | Input sanitization, CSP, security headers | IMPLEMENTED — `security.ts` |
| REL-01 | Error handling / loading states | NEEDS VERIFICATION per view |

## Known architecture gaps (pre-audit findings)
1. `/api/oauth/accounts*` endpoints are **unauthenticated** and return all accounts platform-wide (tokens stripped, but metadata leaks across tenants). Profile page uses new scoped endpoints; legacy `PublisherContext.refreshOAuthAccounts` still calls the open endpoint.
2. `PUT /api/saas/workspace/:id` allows **any member** to modify workspace name/settings/plan — no role check.
3. Email/magic-link/reset flows return tokens in API responses (`testTokenHint`, `verificationToken`) — dev convenience, must be removed/gated for production.
4. Passkey, SAML SSO, GitHub/Apple social login are simulated, not real protocols.
5. No real email/SMS/push delivery infrastructure.
6. `data/*.json` file DB — no migrations framework; schema changes are manual.

## Recommended testing order
Priority = risk × dependency. Suggested sequence:

1. **AUTH-01/02/03/04** register→login→me→logout (foundation for everything)
2. **DB isolation**: WS-01/02 + PROF-05 — two users, cross-tenant access attempts
3. **PROF-02/03/09/10** profile edit, email change, prefs persistence
4. **PROF-06/07/08/11** sessions, MFA, security activity, delete account
5. **SEC-01/03** auth rate limit, suspended user, token expiry
6. **PUB-15** scheduler cycle (safe: test workspace only)
7. **PUB-10/11/12** compose/queue/calendar CRUD
8. **VID-01/02/03** video + media upload
9. **SOC-05/06/07** OAuth store ops (mock providers; real OAuth = BLOCKED pending creds)
10. **ADM-01..06** admin console (use admin@srapublisher.io / GOD owner)
11. **AI-01..06** (BLOCKED until GEMINI_API_KEY set — verify fallback paths)
12. **UI-01/02** theme + responsive sweep
13. **PUB-01..05** public landing last (lowest risk)

Awaiting your approval to begin sequential testing at AUTH-01.
