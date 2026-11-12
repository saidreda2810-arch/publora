# 07 — Feature Status Matrix

Statuses: ✅ VERIFIED WORKING · 🟡 IMPLEMENTED—NOT FULLY VERIFIED · 🟠 PARTIALLY WORKING · 🖥 UI ONLY · 🎭 MOCK/SIMULATED · ❌ BROKEN · ⛔ NOT IMPLEMENTED · 🔌 BLOCKED—EXTERNAL

*Note: "VERIFIED" here means code-path verified by inspection + local data inspection; no runtime tests were possible (no Node.js in audit env). Treat 🟡 as the ceiling for most rows.*

## Auth & users
| ID | Feature | FE | BE | DB | Ext | Status | Evidence |
|---|---|---|---|---|---|---|---|
| A1 | Register | ✅ | ✅ | ✅ | — | 🟡 | authRouter.ts:292; session+workspace created |
| A2 | Login | ✅ | ✅ | ✅ | — | 🟡 | scrypt+timingSafeEqual; bruteForceGuard |
| A3 | Logout | ✅ | ✅ | ✅ | — | 🟡 | session delete + cookie clear |
| A4 | Email verify | ✅ | ✅ | ✅ | 📧 none | 🟠 | token stored; never emailed; dev hint hidden in prod |
| A5 | Password reset | ✅ | ✅ | ✅ | 📧 none | 🟠 | 6-digit code never delivered in prod |
| A6 | Change password | ✅ | ✅ | ✅ | — | 🟡 | authRouter.ts:567 |
| A7 | Sessions mgmt | ✅ | ✅ | ✅ | — | 🟡 | authRouter.ts:843-888 |
| A8 | Profile/prefs | ✅ | ✅ | ✅ | — | 🟡 | PUT /profile whitelist-merge |
| A9 | Avatar | ✅ | ✅ | ✅ | — | 🟡 | data-URL ≤2MB inline in user record |
| A10 | Account delete/deactivate | ✅ | ✅ | ✅ | — | 🟡 | two overlapping paths (DELETE /account, POST /account/delete-request) |
| A11 | MFA | ✅ | ⚠️ | ✅ | — | 🟠 | accepts '123456'; not real TOTP |
| A12 | Social login | ✅ | ⚠️ | ✅ | — | ❌ | no IdP verification — auth bypass |
| A13 | Magic link | ✅ | ✅ | ✅ | 📧 none | 🟠 | OTP generated, never sent |
| A14 | Passkey | ✅ | ⚠️ | ✅ | — | ❌ | arbitrary-email login bypass |
| A15 | SSO/SAML | ✅ | ⚠️ | ✅ | — | ❌ | auto-provision bypass |
| A16 | Demo login | ✅ | ⚠️ | ✅ | — | ❌ | unauthenticated admin session |

## Workspaces & teams
| ID | Feature | Status | Evidence |
|---|---|---|---|
| B1 | Create/edit/switch workspace | 🟡 | saasRouter.ts:550-603; header-based selection |
| B2 | Invite/accept/revoke | 🟠 | token hashed+expiry works; email never sent (manual link) |
| B3 | Member roles/permissions | 🟡 | WORKSPACE_ROLE_RANK + hasWorkspacePermission |
| B4 | Ownership transfer | 🟡 | confirm-flagged swap |
| B5 | Custom roles | 🟡 | baseRole aliases, ≤10 |
| B6 | Tenant isolation | 🟡 | workspaceId-keyed; blob endpoint lacks referential checks |

## Brands
| ID | Feature | Status |
|---|---|---|
| C1 | Brand CRUD + dependency guard | 🟡 |
| C2 | Brand members/roles | 🟡 |
| C3 | Archive/restore | 🟠 (status field only) |
| C4 | Brand assets (logo/cover) | 🟠 (free-form fields, no upload) |

## Social accounts
| ID | Feature | YT | FB | IG | TT |
|---|---|---|---|---|---|
| D1 | OAuth flow | 🟡 | 🟡 | 🟡 | 🟡 |
| D2 | Channel discovery | 🟡 | 🟡 | 🟡 | 🟡 |
| D3 | Token store/refresh | 🟡 | 🟡 | 🟡 | 🟡 |
| D4 | Diagnostics/capabilities | 🟡 | 🟡 | 🟡 | 🟡 |
| D5 | Disconnect | 🟡 | 🟡 | 🟡 | 🟡 |
| D6 | **Publish** | ❌ | ❌ | ❌ | ❌ adapter_missing |
| D7 | **Analytics pull** | ⛔ | ⛔ | ⛔ | ⛔ |
| D8 | FB/IG credentials | — | 🔌 META_* empty | 🔌 | — |

## Content, media, AI
| ID | Feature | Status |
|---|---|---|
| E1 | Media upload (base64) | 🟡 real disk persistence + policy |
| E2 | Chunked resumable upload | 🟡 |
| E3 | Media list/delete | 🟡 |
| E4 | Media search/folders/thumbs | ⛔ |
| E5 | AI endpoints (6) | 🟡 real Gemini; 503 w/o key; dead fallback code |
| E6 | Video analysis (inline file) | 🟡 ≤100MB only |
| E7 | Drafts/posts persistence | 🟡 via state blob |

## Publishing
| ID | Feature | Status |
|---|---|---|
| F1 | Scheduler cycle | 🟡 runs every 30s, claim/lock/retry |
| F2 | Platform publish | ❌ no adapters — all posts fail |
| F3 | Retry/backoff/dead-letter | 🟡 implemented, unreachable success path |
| F4 | Queue pause/resume | 🟡 |
| F5 | Calendar/queue UI | 🟡 client-rendered over synced state |
| F6 | History | 🟡 real queries; will only contain failed/scheduled |
| F7 | Idempotency/ops IDs | 🟡 publishOperationId + lockedForPublishing |

## Analytics/automations/admin
| ID | Feature | Status |
|---|---|---|
| G1 | Analytics records | 🟠 only via client state writes; no provider sync |
| G2 | Automation engine | 🟡 real triggers/steps/executions/approvals |
| G3 | Automation→queue posts | 🟠 posts created but fail at publish |
| G4 | GOD console (~30 endpoints) | 🟡 real over JSON DB |
| G5 | Maintenance modes | 🟡 enforced API+page |
| G6 | Backups/recovery | 🟡 manual file copies + rollback |
| G7 | Notifications | 🟠 in-app derived only; no email |
| G8 | Billing/subscription | 🎭 instant plan flip, no payment |
| G9 | Drive integration | 🟡 real OAuth+import; watch-folder mock |
| G10 | Public site/legal | 🟡 static; claims exceed capability |
