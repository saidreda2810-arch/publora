# 12 — Test Results

## Execution attempt
- `npm test` → `tsx tests/run-all-tests.ts` — **NOT RUN**: Node.js is not installed in the audit environment (`node`/`npx` not found). `node_modules/` exists but no runtime.
- `npm run lint` (tsc --noEmit) — **NOT RUN** for the same reason.
- `npm run build` — **NOT RUN**.

## Existing test infrastructure
- `tests/run-all-tests.ts` (~37 KB, single bespoke tsx script, no Jest/Vitest). Prior `TEST_REPORT.md`/`TEST_LOG.md` exist claiming results — **not independently reproduced**; treat as unverified claims.
- No CI/CD pipeline config found in repo (no .github/workflows etc.).

## Verification levels used in this audit
- Code-path verified (VERIFIED WORKING limited to inspection-backed claims): auth register/login/logout, workspace CRUD, brand/project CRUD, media upload pipeline, OAuth authorize/callback/refresh/diagnostics code paths, automation engine, admin endpoints, maintenance enforcement, queue controls.
- BLOCKED—EXTERNAL: all live OAuth flows, Gemini calls, Drive import — need deployed URL + credentials.
- NOT TESTED: frontend per-component interactions (60 views audited at wiring level only), cross-tenant isolation at runtime, timezone correctness, RTL layout, load behavior.

## Manual/inspection "tests" performed
- Route inventory: ~145 endpoints enumerated from source.
- Env audit: `.env` var presence checked (names + set/empty only; no values printed).
- Data inspection: `data/` directory listing; saas_db.json size ~7.8MB confirms real persisted state.
- Static serving check: `/uploads` maps to `data/uploads` (2 real files present).
