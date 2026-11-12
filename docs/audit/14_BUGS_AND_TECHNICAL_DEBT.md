# 14 — Bugs, Gaps & Technical Debt Register

## A. Broken functionality
| ID | Sev | Issue | Location |
|---|---|---|---|
| BUG-01 | Critical | passkey/login = unauthenticated login as arbitrary user | authRouter.ts:1293 |
| BUG-02 | Critical | sso/login same bypass + auto-provision | authRouter.ts:1379 |
| BUG-03 | Critical | social-login trusts client email, no IdP token | authRouter.ts:1047 |
| BUG-04 | Critical | demo-login instant admin session | authRouter.ts:972 |
| BUG-05 | High | MFA accepts '123456' | authRouter.ts:386,932 |
| BUG-06 | High | All scheduled posts fail — no platform publish adapters | publishEngine.ts:84-118 |
| BUG-07 | High | Email verification/password-reset/magic/invite emails never sent; prod hides tokens | authRouter.ts:457-564,1160; saasRouter.ts:616 |
| BUG-08 | Med | AI heuristic fallbacks unreachable (code after `return`) → 503 not fallback | aiRouter.ts:31-52,106-… |

## B. Incomplete
| ID | Sev | Issue |
|---|---|---|
| BUG-09 | High | No analytics sync from any provider — metrics only client-written |
| BUG-10 | High | No token-refresh worker; manual refresh only |
| BUG-11 | Med | No email provider integration at all |
| BUG-12 | Med | No payment/checkout/webhooks — subscription is a flag flip |
| BUG-13 | Med | Brand archive/restore, brand asset uploads unimplemented |
| BUG-14 | Med | Media search/folders/thumbnails absent |
| BUG-15 | Med | Notification preferences stored but nothing delivers |

## C. Missing backend (UI exists)
- Per-entity CRUD for posts/videos/analytics/campaigns/contentIdeas (only blob state sync).
- Publish status sync, platform insights endpoints, webhook receivers (Meta/TikTok/Google).
- Real email, billing, MFA(TOTP), WebAuthn, SAML.

## D. Missing frontend
- Backend capabilities unexposed: scheduler run-now, OAuth diagnostics UI partial, backup verify UI?, recovery rollback UI (verify in AdminDashboardView — NOT fully audited).

## E. Mock/simulated
| ID | Issue | Location |
|---|---|---|
| BUG-16 | `/api/drive/watch-folder` returns hardcoded fake file | server.ts:165-185 |
| BUG-17 | Subscription upgrade = instant plan change, no billing | saasRouter.ts:691 |
| BUG-18 | `connectionStatus`/permissions on OAuth records are asserted at connect time, not verified per-scope | oauthRouter.ts (permissions hardcoded granted:true) |

## F. Integration blockers
- META_APP_ID/SECRET empty → FB/IG connect returns requiresConfig.
- Publish adapters absent → core value blocked regardless of OAuth.
- Redirect URIs must be registered per deployment (dev+shared URLs in .env.example).
- TikTok/Google app review status unknown.

## G. Database problems
- JSON-file DB: no indexes/constraints/transactions; full-file rewrite per mutation; ~7.8MB and growing (avatars inline).
- 15 leaked `saas_db.json.tmp.*` files (failed renames).
- Raw session tokens stored; verificationTokens.userId type-abused for emails; audit cap 1000 evicts security events.
- Blob `POST /state` allows cross-entity referential corruption; concurrent writers lose updates.
- Orphaned references on brand/project delete (force flag bypasses guards).

## H. Security risks
See SECURITY_AUDIT.md — SEC-01..05 critical auth bypasses; SEC-06..12 high.

## I. Infrastructure
- Single-instance only (file DB + memory stores + local uploads); multi-replica deploy corrupts/loses data.
- Ephemeral filesystem risk on Cloud Run/App Hosting (no volume config verified).
- No graceful shutdown; no external monitoring; no log aggregation.
- In-memory dedupe (automation lastTriggerHash, pending attempts, rate limits) resets on restart.

## J. Performance
- O(DB) write per mutation — every keystroke-debounced state sync rewrites ~8MB JSON.
- GET /api/saas/state returns entire workspace payload every load.
- /api/saas/history loads all posts then paginates in memory; analytics join is O(n·m) map-building per request (acceptable now, not at scale).
- express.json 150mb + base64 media → memory spikes; chunked upload mitigates large videos.
- Scheduler scans every post of every workspace every 30s — O(total posts) per cycle.

## K. Technical debt
- Fat controllers (oauthRouter callback ~600 lines; saasRouter 2,130 lines).
- Dead config vars (SESSION_SECRET, UPLOAD_DIR, MAX_UPLOAD_SIZE_BYTES, ALLOWED_MIME_TYPES).
- `.refactor-backup/`, committed `dist/`, unused Firebase client surface.
- Duplicate account-delete paths; magic-link token type abuse; 'admin'/'member' legacy role aliases.
- Inconsistent naming (SRA vs Publora vs SAA in strings/comments).
