# Baseline — captured 2026-11-12 (before Phase 0 changes)

Environment: Windows, Node.js v26.13.1 + npm 11.20.0 installed via winget during this session.

## Commands & results (pre-change)

| Command | Result |
|---|---|
| `npm run lint` (`tsc --noEmit`) | ✅ clean, 0 errors |
| `npm test` (`tsx tests/run-all-tests.ts`) | ⚠️ 40–41/42 pass. 1 deterministic FAIL: `firebase-applet-config.json projectId must match assigned project` (pre-existing). Brute-force suite is timing-flaky (1–2 intermittent fails). |
| `npm run build` (`vite build`) | ✅ built in ~4.8s; chunk-size warning (>500kB) only |
| `npm audit --omit=dev` | ❌ 6 vulnerabilities (5 high, 1 critical) — dompurify/jspdf chain; `npm audit fix --force` would bump jspdf to 4.x (breaking) |

## Runtime verification
- `tsx server.ts` boots; `/health` 200; scheduler starts (30s interval).
- **Not verified at baseline:** real login (no user credentials available),
  OAuth flows, Gemini calls (needs valid `GEMINI_API_KEY`).

## Post-change status (same session)
- `tsc --noEmit` ✅ clean after all Phase-0 edits.
- `vite build` ✅ OK after edits.
- `tests/security-phase0-smoke.mts` → **12/12 PASS** against live server on :3457.
- `npm test` not re-run after changes (brute-force flakiness makes signal noisy;
  no test covers the changed auth paths yet — gap to close in Phase F).
