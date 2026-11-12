# 01 — Baseline

## Runtime & toolchain [RUN]

| Tool | Version |
|---|---|
| Node.js | v26.13.1 (`C:\Program Files\nodejs`) |
| npm | 11.20.0 |
| Shell note | PowerShell execution policy blocks `npm.ps1` → all npm commands run via `npm.cmd` / `npx.cmd` |

## Verification commands [RUN — this session, post-remediation code]

| Command | Result |
|---|---|
| `npm run lint` (`tsc --noEmit`) | **PASS** — 0 errors |
| `npm test` (`tsx tests/run-all-tests.ts`) | **41/42 PASS (97.6%)** — 1 failure: `firebase-applet-config.json exists with valid parameters` → "Config projectId must match assigned project" (pre-existing config mismatch, unrelated to code) |
| `npm run build` (`vite build`) | **PASS** — `✓ built`; warning: main chunk 2,231 kB (gzip 520 kB) > 500 kB limit |
| `npm audit` | **6 vulnerabilities: 5 high, 1 critical** — all via `jspdf ≤4.2.0` → `dompurify` (GHSA-6688-9rhm-gjv2, GHSA-mrv2-3pqr-j5jr, GHSA-c6gr-qvv4-5v3f). `npm audit fix --force` would install breaking `jspdf@4.2.1` — not applied |
| `npm ci` | **[NOT RUN]** — full clean reinstall (~minutes, hits npm install-scripts policy for esbuild/protobufjs postinstalls); `node_modules` is consistent with `package-lock.json` as of this session |
| Security smoke (`tests/security-phase0-smoke.mts`) | **12/12 PASS** on live server :3457 |
| Cookie-auth roundtrip (curl) | register→Set-Cookie ✓, `/me` cookie→200, no-auth→401, stale Bearer+cookie→200 |

## package.json summary [READ]

- `"type": "module"`, Vite + React 19 frontend, Express 4 + tsx backend (`server.ts` entry).
- Scripts: `dev`=tsx server.ts, `build`=vite build, `start`=NODE_ENV=production tsx, `lint`=tsc --noEmit, `test`=tsx tests/run-all-tests.ts.
- Dependencies of note: `express@^4.21.2`, `pg@^8.23.1` (added this phase for T1.2/1.3), `@google/genai`, `firebase@^13.2.0`, `jspdf@^2.5.2` (vulnerable dep chain), `dotenv`, `tsx`, `vite@^8.3.0`, `typescript@^7.0.2`.
- DevDeps: `@types/*`, tailwind, esbuild.

## Manual flow check (register → brand → upload → post → schedule) [RUN — partial]

Server run locally on `:3457` (`npm run dev`, real `data/` dir — DATA_DIR is hardcoded `process.cwd()/data`, no env override [READ saasDb.ts:264]).

| Step | Result |
|---|---|
| register (new email) | ✅ 201, workspace auto-created, HttpOnly cookie set, **no sessionToken in body** |
| login | ✅ 200 + cookie |
| GET/POST `/api/saas/state` | ✅ GET returns `stateVersion`; POST with correct `baseVersion`→200, wrong→409, unknown key→400, orphan brandId→400, shrink-to-0→409 |
| brand create | ✅ via workspace state blob (brands[] inside `/state`) |
| media upload | ⚠️ endpoint exists (`POST /api/media/upload`, magic-byte sniffing); chunked XHR path in `AddVideoWizard` — **not exercised end-to-end this session** |
| post create + schedule | ⚠️ posts live inside `/state` blob; `publishEngine` has **no platform adapters** → scheduled posts end `failed/adapter_missing` [READ publishEngine.ts] |

Test accounts used (`t0-*`, `t1-*` @example.com) were deleted via `DELETE /api/saas/account` after each run — `data/saas_db.json` left clean of test users.

## Notes for design

- No `DATABASE_URL`/Postgres available in this environment → all PG-dependent work marked untested.
- `data/saas_db.json.tmp.*` leftovers observed (atomic-write temp files not cleaned on crash) — counted in 1.4.
- Firebase client config exists but `projectId` mismatches the assigned project → only failing test.
