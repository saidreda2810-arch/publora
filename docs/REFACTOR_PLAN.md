# Codebase Organization Audit & Refactoring Plan

Date: 2026-11-05 · Scope: `src/` (63 TS/TSX files), `server/` (8 files), `server.ts`, `tests/`
Constraint: no git installed — backup = copy of changed files before each stage.

## 1. Current structure

```
404-main/
├── server.ts              34KB entry (routes + Vite + all /api/ai/* handlers inline)
├── server/                authRouter, saasRouter, oauthRouter, mediaRouter,
│                          saasDb, oauthStore, scheduler, security
├── src/
│   ├── App.tsx, main.tsx, index.css
│   ├── components/        25 flat view files (avg 15–70KB) + auth/ public/ common/ profile/
│   ├── context/           AuthContext, PublisherContext, ThemeContext
│   ├── types/index.ts     all domain types (471 lines)
│   └── utils/             firebase, googleDriveService, platformSpecs, timingAlgorithm, demoData
├── tests/run-all-tests.ts 29KB single file
└── docs/*.md (10 files, flat)
```

## 2. Oversized files (top offenders)

| File | Size | Problem |
|---|---|---|
| SocialConnectionCenterView.tsx | 69KB | Multi-responsibility mega-view |
| AdminDashboardView.tsx | 52KB | User mgmt + sessions + settings + logs in one file |
| oauthRouter.ts | 46KB | 4 provider flows inline in one switch |
| authRouter.ts | 45KB | 14 auth methods incl. simulated SSO/passkey/magic-link |
| PublisherContext.tsx | 36KB | Entire app state in one context |
| GoogleDriveView.tsx | 32KB | |
| RetentionIntelligenceView.tsx | 27KB | |
| server.ts | 34KB | Express app + 6 inline AI endpoints + Vite wiring |

## 3. Duplicates & inconsistencies found

- **Duplicated account shapes:** `SocialAccount` (types) vs `SocialAccountRecord` (oauthStore) mapped ad-hoc in `PublisherContext.refreshOAuthAccounts`
- **Duplicated user sanitization:** `sanitizeUserForClient` vs inline `{passwordHash, salt, ...safeUser}` destructuring in ~6 places in authRouter
- **Hardcoded demo users** seeded inside authRouter (demo-login, social-login, magic-link, passkey, sso) — business logic mixed with route handlers
- **Flat `components/`**: 25 unrelated views at one level; `profile/` is the only feature folder
- **`server.ts` mixes**: app bootstrap, health endpoints, 6 Gemini endpoints, static/Vite serving — should be `server/routes/ai.ts`
- **types/index.ts** is a 471-line grab-bag — should split by domain
- **docs/** flat with 10 overlapping audit/setup files — should move to `docs/`
- No `README.md` at root

## 4. Unused / dead code candidates (verify before delete)

- `src/utils/firebase.ts` + `firebase-applet-config.json` — called once in App.tsx `testFirebaseConnection`; check if Firestore actually used anywhere else
- `public/assets/` — check referenced
- `metadata.json`, `firebase-blueprint.json` — AI-Studio artifacts, likely unused at runtime
- `tests/run-all-tests.ts` — single monolith; no unit-test runner (vitest/jest absent)

## 5. Proposed structure (adapted, not forced — single-app repo stays single-app)

```
404-main/
├── server.ts                  # thin entry: middleware + mount routers only
├── server/
│   ├── index.ts? (no—keep server.ts)
│   ├── routers/               # authRouter, saasRouter, oauthRouter, mediaRouter, aiRouter(new)
│   ├── services/              # saasDb→db/, oauthStore→integrations/, scheduler, security
│   ├── integrations/
│   │   ├── oauth/             # oauthStore + per-provider exchange logic
│   │   └── gemini/            # aiClient + prompt builders (extracted from server.ts)
│   └── db/saasDb.ts, oauthStore.ts
├── src/
│   ├── app/                   # App.tsx, main.tsx, routes (tab map)
│   ├── features/              # one folder per view domain
│   │   ├── dashboard/ publishing/ calendar/ videos/ drive/
│   │   ├── connections/ ai-studio/ strategist/ automations/
│   │   ├── analytics/ experiments/ brands/ team/ reports/
│   │   ├── admin/ auth-modals/ profile/ public/
│   ├── components/ui/         # SaaLogo, shared primitives (profile/ui.tsx → ui/)
│   ├── context/               # unchanged (Auth, Publisher, Theme)
│   ├── lib/api.ts             # typed fetch wrappers (authFetch, apiFetch)
│   ├── types/                 # split: user.ts, workspace.ts, publishing.ts, social.ts, ai.ts
│   ├── hooks/                 # extracted from contexts where reusable
│   └── utils/                 # platformSpecs, timingAlgorithm, demoData, firebase
├── tests/                     # keep run-all-tests.ts; add unit/ later
└── docs/                      # consolidate *.md
```

## 6. Refactoring plan — ordered by risk (lowest first)

| Stage | Change | Risk | Verify |
|---|---|---|---|
| 0 | Backup changed files; baseline `tsc --noEmit` + `npm run dev` smoke | — | ✅ done |
| 1 | Extract `/api/ai/*` from server.ts → `server/aiRouter.ts` | Low | ✅ done — verified live |
| 2 | Split `types/index.ts` → domain files w/ re-export barrel | Low | ✅ done — tsc clean |
| 3 | Create `src/lib/api.ts`; replace ad-hoc fetch in AuthContext/ProfileMenu/etc | Med | ✅ done — ~55 call sites migrated, tsc clean |
| 4 | Move view files → `features/<domain>/` (pure moves + import path fixes) | Med | tsc + manual nav |
| 5 | Split oversized views (SocialConnectionCenter, AdminDashboard) into sub-components | High | per-view manual test |
| 6 | Extract oauth provider flows from oauthRouter → `integrations/` | Med-High | OAuth config endpoint |
| 7 | Split authRouter demo/seed helpers → `server/services/demoAccounts.ts` | Low | demo-login |
| 8 | Docs consolidation + README.md | None | — |
| 9 | Delete verified-dead files only | Low | tsc + app run |

## 7. Explicit non-goals
- No monorepo/`apps/`+`packages/` split — single deployable, would add complexity without benefit
- No Prisma/DB migration — JSON-file DB stays (documented limitation)
- No new test framework unless stage allows (vitest later)
- No behavior changes — structure only

Stages 0–3 complete (backup in `.refactor-backup/`). Next: Stage 4 feature-folder moves.
