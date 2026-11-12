import { getDb, saveDatabase, logAuditEvent } from './saasDb.ts';
import { processPost, manualRetry } from './publishEngine.ts';
import { runAutomationCycle } from './automationEngine.ts';

let isRunning = false;
let schedulerPaused = false;
let intervalTimer: NodeJS.Timeout | null = null;
let lastCycleTimestamp: string | null = null;
let publishedPostsCounter = 0;
let lastCycleDurationMs: number | null = null;
let lastCycleError: string | null = null;

export function setSchedulerPaused(paused: boolean) {
  schedulerPaused = paused;
  return schedulerPaused;
}
export function isSchedulerPaused() { return schedulerPaused; }

export async function runSchedulerCycleNow() {
  if (isRunning) return { ran: false, message: 'Cycle already in flight' };
  if (schedulerPaused) return { ran: false, message: 'Scheduler is paused' };
  isRunning = true;
  const cycleStart = Date.now();

  try {
    const db = getDb();
    const now = new Date();
    let publishedInThisCycle = 0;
    const pending: Promise<void>[] = [];

    Object.entries(db.workspaceData).forEach(([workspaceId, wsData]) => {
      if (!wsData || !wsData.posts || !Array.isArray(wsData.posts)) return;
      // Queue-level pause: blocks NEW jobs from starting; in-flight posts
      // already marked 'publishing' are untouched (they complete normally).
      if ((wsData as any).queuePaused) return;

      // Check if autopilot emergency pause is active
      const isPaused = wsData.autopilotConfig?.emergencyPaused;
      if (isPaused) return;

      wsData.posts.forEach((post: any) => {
        // Manual retry reset or scheduled/optimizing post due for processing
        const due =
          (post.status === 'scheduled' || post.status === 'optimizing') &&
          new Date(post.scheduledTime) <= now &&
          (!post.nextRetryAt || new Date(post.nextRetryAt) <= now);
        // Recover stuck 'publishing' posts after restart (>10 min = abandoned claim)
        const stuckPublishing =
          post.status === 'publishing' &&
          post.lockedForPublishing &&
          post.updatedAt &&
          now.getTime() - new Date(post.updatedAt).getTime() > 10 * 60 * 1000;

        if (due || stuckPublishing) {
          post.updatedAt = now.toISOString();
          // processPost is async but the engine's platform step is currently
          // synchronous-in-practice; run sequentially per workspace.
          pending.push(processPost(post, wsData).then((outcome) => {
            if (outcome === 'published') {
              publishedInThisCycle++;
              publishedPostsCounter++;
              // record audit log
              const auditEntry = {
                id: `audit_pub_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                timestamp: now.toISOString(),
                actionType: 'published' as const,
                postId: post.id,
                videoTitle: post.postTitle || post.title || 'Untitled Video',
                details: `Post "${post.title || 'untitled'}" published via engine (op ${post.publishOperationId}).`,
                performedBy: 'Publishing Engine',
              };
              if (!wsData.auditLogs) wsData.auditLogs = [];
              wsData.auditLogs.unshift(auditEntry);
              logAuditEvent({
                workspaceId,
                action: 'post_published',
                details: `Engine published post ${post.id} (${post.publishOperationId}).`,
              });
            } else if (outcome === 'failed') {
              logAuditEvent({
                workspaceId,
                action: 'post_publish_failed',
                details: `Post ${post.id} failed: ${post.lastPublishError?.message || 'unknown'}`,
              });
            }
          }));
        }
      });
    });

    // Wait for all publish attempts, then persist once
    await Promise.allSettled(pending);
    saveDatabase(db);

    lastCycleTimestamp = now.toISOString();
    lastCycleError = null;
    return {
      ran: true,
      publishedInThisCycle,
      totalPublished: publishedPostsCounter,
      timestamp: lastCycleTimestamp,
    };
  } catch (err) {
    lastCycleError = String(err);
    console.error('Error in background scheduler cycle:', err);
    return { ran: false, error: String(err) };
  } finally {
    lastCycleDurationMs = Date.now() - cycleStart;
    isRunning = false;
    // Automation engine runs after publishing cycle — non-blocking, errors isolated
    runAutomationCycle().catch((e) => console.error('[automation] cycle error:', e?.message));
  }
}

export function startBackgroundScheduler() {
  if (intervalTimer) return;
  // Run every 30 seconds
  intervalTimer = setInterval(() => {
    runSchedulerCycleNow();
  }, 30000);
  console.log('Multi-Tenant Background Publishing Scheduler initialized (every 30s).');
}

export function getSchedulerStatus() {
  // Real queue stats across all workspaces
  let pendingJobs = 0, runningJobs = 0, failedJobs = 0, delayedJobs = 0;
  try {
    const db = getDb();
    for (const ws of Object.values(db.workspaceData || {})) {
      for (const p of (ws as any).posts || []) {
        if (p.status === 'scheduled' || p.status === 'optimizing') pendingJobs++;
        else if (p.status === 'publishing') runningJobs++;
        else if (p.status === 'failed') failedJobs++;
        else if (p.status === 'delayed') delayedJobs++;
      }
    }
  } catch {}
  return {
    isRunning,
    paused: schedulerPaused,
    lastCycleTimestamp,
    lastCycleDurationMs,
    publishedPostsCounter,
    intervalSeconds: 30,
    queue: { pendingJobs, runningJobs, failedJobs, delayedJobs },
    status: schedulerPaused ? 'paused' : 'healthy',
  };
}
