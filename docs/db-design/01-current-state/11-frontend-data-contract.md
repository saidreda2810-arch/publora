# 11 — Frontend Data Contract

What the UI actually consumes — defines compatibility requirements for the DB layer. Sources: `src/context/PublisherContext.tsx`, `src/lib/api.ts`, `src/types/*`, component fetch calls.

## Contract surfaces [READ]

### A. `GET/POST /api/saas/state` — the blob contract (dominant)

- `PublisherContext` loads `state` per workspace: `{ brands, projects, videos, accounts, posts, analytics, categories, campaigns, contentPillars, contentIdeas, postComments, calendarSavedViews, automationWorkflows, automationExecutions, automationRules, automationLogs, videoFolders, queuePaused, savedStrategy, aiVideoResults, calendarSettings, autopilotConfig, activeBrandId, recommendations, experiments, auditLogs }` (+`stateVersion` post-T1.0).
- **Push model**: debounced (~1s) full-state POST with `baseVersion`; 409 → refetch + banner.
- Implication: the frontend treats workspace state as **one document**. Until T1.4 lands entity endpoints, `workspace_kv`/blob-shape must be preserved **byte-compatible** — any repo change must keep returning the same JSON shape.

### B. Auth contract

- Cookie `sra_session` HttpOnly; `credentials:'include'` on `apiFetch`; **no Bearer, no localStorage token** (post-T0.9).
- `/api/auth/me` returns sanitized user + workspaces + memberRole + usage counts.
- Login/register responses contain **no sessionToken**.

### C. Entity-ish endpoints already separate

- `/api/media/*` — upload sessions, catalog list, file serve (multipart/base64 + chunked).
- `/api/drive/*` — connections, files, imports.
- `/api/oauth/*` — provider connect/callback/status/disconnect.
- `/api/ai/*` — generation endpoints (rate-limited).
- `/api/auth/*` — profile, sessions list/revoke, security activity, invites accept.

### D. Type contracts (`src/types/*`)

- 7 files, ~53 exports; components import `Brand`, `SocialAccount`, `ScheduledPost`, `Workspace`, `User`, `WorkspaceMember`, enums (`Platform`, `PostStatus`, `SchedulingMode`, `MetricSource`…).
- **Drift found**: blob `accounts[]` ≠ `SocialConnectionAccount` (OAuth store) ≠ `SocialAccount` (UI type) — three shapes for "a connected account". Migration must pick canonical = `SocialAccount` UI shape and derive OAuth metadata separately.
- Role vocabulary drift: FE member roles include `manager/publisher/analyst/viewer` not all in server/DDL enum — needs alignment decision.

## Compatibility requirements for migration [INFER]

1. **Phase 1 (repo swap)**: `GET /state` response shape **unchanged** — JsonRepo and PgRepo must produce identical JSON. This is the #1 regression risk; needs golden-file contract tests (capture current response, diff after swap).
2. **Phase 2 (entity endpoints, T1.4)**: frontend can migrate incrementally per-collection; blob endpoint stays as fallback during transition.
3. **Base64 extraction**: brand image fields must keep working — return signed URLs instead of data-URLs; frontend `<img src>` handles both, but **size drops 7.5 MB → KBs**. Needs a one-time frontend check that nothing parses the data-URL (grep `data:image` in src).
4. **Field renames forbidden** during transition: `post.channelPlatforms` vs `platforms`, `accountId` presence — keep writer/reader field names identical until T1.4.
5. **`stateVersion` semantics**: must survive repo swap (PgRepo: `UPDATE workspaces SET state_version = state_version+1 WHERE id=$1 AND state_version=$2 RETURNING …`).
