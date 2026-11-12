# 02 — Repository Inventory

## Root layout

```
404-main/
├── server.ts                  # Express bootstrap: middleware, routers, health, scheduler, Vite/static serving
├── index.html, vite.config.ts # Vite SPA entry (React 19)
├── src/                       # React frontend (no router lib — tab state + path mapping)
│   ├── App.tsx                # Tab router (~17k); renders all views
│   ├── main.tsx, index.css
│   ├── context/
│   │   ├── AuthContext.tsx    # Session auth: login/register/demo/social/magic/passkey; localStorage token
│   │   ├── PublisherContext.tsx # Workspace state: localStorage + debounced POST /api/saas/state
│   │   └── ThemeContext.tsx   # dark/light/system theme
│   ├── components/            # ~60 view components (see PLATFORM_MODULE_INVENTORY)
│   │   ├── admin/             # UploadPolicyPanel
│   │   ├── auth/              # SignIn/SignUp/ForgotPassword/VerifyEmail modals
│   │   ├── profile/           # Profile page sections (personal/security/connections/prefs)
│   │   └── public/            # Landing, pricing, features, platforms, FAQ, legal pages
│   ├── lib/                   # api.ts (fetch wrapper), routes.ts (tab⇄URL map), pageTitles.ts
│   ├── types/                 # TS domain types (content, social, workspace, user, ai, platform)
│   └── utils/                 # firebase.ts (Firebase Auth + Firestore client), googleDriveService.ts,
│                              # demoData.ts (returns EMPTY arrays — "zero-fabrication" initializer),
│                              # platformSpecs.ts, timingAlgorithm.ts
├── server/                    # Express backend routers + engines (see BACKEND_ARCHITECTURE)
├── data/                      # Runtime persistence (gitignored presumably):
│   ├── saas_db.json           # PRIMARY DB — entire app state (~7.8 MB)
│   ├── saas_db.json.tmp.*     # ~15 stale temp files from atomic writes (cleanup debt)
│   ├── social_connections.json# OAuth account records (encrypted tokens)
│   ├── oauth_config.json      # GOD-managed provider credentials (plaintext JSON)
│   ├── media_catalog.json     # Uploaded media metadata
│   ├── upload_policy.json     # Admin upload policy (absent → defaults)
│   ├── drive_connections.json, drive_imports.json, automation_approvals.json,
│   ├── maintenance_tasks.json, backups/ (file-copy backups + index.json)
│   └── uploads/               # Media files + .sessions/ chunked-upload temp dirs
├── tests/run-all-tests.ts     # Single test runner (~37 KB) — could NOT be executed (no Node runtime)
├── public/assets/aistudio/    # Static AI Studio assets
├── dist/                      # Prebuilt frontend bundle (stale relative to src)
├── .refactor-backup/          # Backup of pre-refactor code (dead weight)
├── firebase*.json/yaml, firestore.rules, apphosting.yaml, .firebaserc
│                              # Firebase App Hosting deploy config; client SDK only
├── *.md (15 files)            # Prior docs: API_DOCUMENTATION, BACKEND_ARCHITECTURE,
│                              # DATABASE_SCHEMA, DEPLOYMENT_GUIDE, ENVIRONMENT_VARIABLES,
│                              # EXTERNAL_SERVICES_SETUP, FEATURE_INVENTORY, SECURITY_AUDIT,
│                              # TEST_REPORT, UX_AUDIT, COMPLETE_AUDIT, REFACTOR_PLAN, etc.
└── .env / .env.example        # Config (see CONFIGURATION_REGISTRY)
```

## Architecture

- **Frontend:** React 19 SPA, no router library. `App.tsx` maps `window.location.pathname` → tab via `src/lib/routes.ts` (18 tabs). State in two React contexts; persistence is **dual-write**: `localStorage` immediately + debounced `POST /api/saas/state` whole-payload sync per workspace.
- **Backend:** single Express app (`server.ts`) mounting 6 routers: `/api/auth`, `/api/saas`, `/api/media`, `/api/oauth`, `/api/drive`, `/api/ai`. In-process `setInterval` scheduler (30 s) drives publishing + automations.
- **Database:** none. `server/saasDb.ts` keeps the whole DB in memory (`dbCache`) and rewrites `data/saas_db.json` atomically (tmp+rename) on **every mutation**. OAuth accounts live in a second JSON file; media catalog, drive connections, approvals, backups each in their own JSON file.
- **Storage:** local filesystem `data/uploads/` served statically at `/uploads`.
- **Auth:** custom session tokens (Bearer header / `sra_session` cookie / `?token=`), scrypt password hashing, in-memory+JSON session store, in-process brute-force guard.

## Entry points

- Dev: `npm run dev` → `tsx server.ts` (Express + Vite middleware, port 3000)
- Prod: `npm run build && npm start` → serves `dist/` statically; deploy config = Firebase App Hosting (`apphosting.yaml`, `firebase.json`).

## Dependencies (package.json)

Runtime: `express`, `firebase` (client SDK only — **no firebase-admin**), `@google/genai` (Gemini), `vite`, `tsx`, `react`, `react-dom`, `lucide-react`, `react-icons`, `motion`, `jspdf`, `dotenv`, tailwind v4 toolchain. No DB driver, no queue lib, no email SDK, no payment SDK, no test framework.

## Tests

`tests/run-all-tests.ts` — bespoke tsx test script (no Jest/Vitest). **Not executed**: Node.js is not installed in the audit environment. Prior `TEST_REPORT.md`/`TEST_LOG.md` exist but were not independently reproduced.

## Dead/unused/legacy

- `.refactor-backup/` — superseded code snapshot.
- `dist/` — build output committed/present; may drift from `src/`.
- `src/utils/firebase.ts` + `firebase-applet-config.json` + `firestore.rules` — Firebase Auth/Firestore client initialized, but **no Firestore reads/writes found in app code**; auth is fully custom Express. Effectively unused integration surface.
- `src/utils/demoData.ts` — intentionally returns empty arrays (clean initializer, not mock data).
- `server.ts:165-185` — `/api/drive/watch-folder` returns **hardcoded fake response** (mock).
- `data/saas_db.json.tmp.*` — 15 leaked temp files from non-atomic rename edge cases.
- `SESSION_SECRET` referenced in env example but **never used** in code (sessions are random tokens, not signed cookies).
- Firebase `auth`/`signInWithPopup` exported but app login uses `/api/auth/*` — Google sign-in button may be unwired or unused (see USER_FLOW_AUDIT).

## Unclear/undocumented areas

- `saas_db.json` is 7.8 MB — contents include real user/workspace/post data; treated as production-like data. Audited read-only.
- GOD Owner identity hardcoded: `saidreda2810@gmail.com` (`saasDb.ts:5`).
- Two parallel "account" concepts: SaaS `users` vs OAuth `social_connections.json` — bridged only via `brandId`/`workspaceId`.
