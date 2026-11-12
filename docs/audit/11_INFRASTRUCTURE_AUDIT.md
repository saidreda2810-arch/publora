# 11 — Infrastructure & Background Workers Audit

## Runtime
- Single Node process (`tsx server.ts`); Express on `0.0.0.0:$PORT` (default 3000).
- Dev: Vite middlewareMode. Prod: `express.static(dist)` + SPA fallback.
- Deploy config: Firebase App Hosting (`apphosting.yaml`, `firebase.json`) — Cloud Run–style; `TRUST_PROXY` env controls X-Forwarded-For trust (default off — correct).
- Health: `/health`, `/api/health` (public) expose uptime, memory, DB collection counts, scheduler status — mildly informative but acceptable.

## Background workers
| Worker | Implementation | Status |
|---|---|---|
| Publishing scheduler | `scheduler.ts` setInterval 30s → `runSchedulerCycleNow` → processPost per due post across ALL workspaces | REAL, in-process; `isRunning` guard; stuck-publish recovery >10min; honors queuePaused + autopilot emergencyPaused |
| Automation engine | `runAutomationCycle()` fired after each scheduler cycle (non-blocking) | REAL; triggers interval/daily/weekly/drive/events; approvals resume; lastTriggerHash dedupe in-memory (re-fires after restart within same bucket — minor) |
| Upload session sweeper | lazy `sweepExpiredSessions` on session ops | REAL |
| Pending-attempt GC | 15-min interval in oauthStore | REAL (in-memory only) |
| Rate-limit GC | 5-min interval in security.ts | REAL |
| Token refresh worker | NONE — refresh only via manual POST /accounts/:id/refresh | ⛔ absent; expired tokens silently mark requiresReconnection only when used |
| Analytics sync worker | NONE | ⛔ absent |
| Media processing worker | NONE (no thumbnails/transcoding) | ⛔ absent |
| Email/notification worker | NONE | ⛔ absent |
| Backup scheduler | NONE — backups only via manual GOD POST | 🟠 manual file-copy exists |

## Queues
No queue system. "Queue" = post.status field inside workspaceData JSON scanned by scheduler. No retries persistence beyond post fields (retryCount, nextRetryAt) — survives restart since in DB file.

## Deployment concerns
- **Single instance assumption everywhere**: JSON file DB, in-memory stores, file uploads → cannot run >1 replica without data loss/corruption. App Hosting may scale to zero/multiple instances → breakage.
- No process manager config (PM2/systemd) in repo; relies on platform.
- `data/` must be persistent disk — on Cloud Run ephemeral FS, **all data lost on redeploy** unless volume mounted (apphosting.yaml not verified for volumes — check before deploy).
- 15 stale `saas_db.json.tmp.*` files = evidence of failed renames (likely concurrent writes or Windows file locking).
- No graceful shutdown handling; in-flight publish claims rely on 10-min stale recovery.
- No external monitoring/alerting; scheduler status only via endpoints.

## Startup
`startServer()` → listen → `startBackgroundScheduler()`. No migrations (JSON schema implicit), no seed-on-boot beyond first-run admin workspace.
