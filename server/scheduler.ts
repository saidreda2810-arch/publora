import { getDb, saveDatabase } from './saasDb.ts';
import { authStore } from './authStore.ts';
import { processPost, manualRetry } from './publishEngine.ts';
import { runAutomationCycle } from './automationEngine.ts';
import { getRepos } from './repos/index.ts';
import { query } from './db/client.ts';

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
    if (process.env.DB_DRIVER === 'pg') {
      const r = await runPgSchedulerCycle();
      lastCycleTimestamp = new Date().toISOString();
      lastCycleError = null;
      publishedPostsCounter += r.publishedInThisCycle;
      return { ran: true, publishedInThisCycle: r.publishedInThisCycle, totalPublished: publishedPostsCounter, timestamp: lastCycleTimestamp };
    }
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
          pending.push(processPost(post, wsData).then(async (outcome) => {
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
              await authStore.logAudit({
                workspaceId,
                action: 'post_published',
                details: `Engine published post ${post.id} (${post.publishOperationId}).`,
              });
            } else if (outcome === 'failed') {
              await authStore.logAudit({
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

export async function getSchedulerStatus() {
  // Real queue stats across all workspaces
  let pendingJobs = 0, runningJobs = 0, failedJobs = 0, delayedJobs = 0;
  try {
    if (process.env.DB_DRIVER === 'pg') {
      const rows = (await query(
        `SELECT p.status, count(*)::int AS n FROM posts p GROUP BY p.status`,
      )).rows;
      for (const r of rows) {
        if (r.status === 'scheduled' || r.status === 'draft') pendingJobs += r.n;
        else if (r.status === 'publishing') runningJobs += r.n;
        else if (r.status === 'failed') failedJobs += r.n;
      }
    } else {
      const db = getDb();
      for (const ws of Object.values(db.workspaceData || {})) {
        for (const p of (ws as any).posts || []) {
          if (p.status === 'scheduled' || p.status === 'optimizing') pendingJobs++;
          else if (p.status === 'publishing') runningJobs++;
          else if (p.status === 'failed') failedJobs++;
          else if (p.status === 'delayed') delayedJobs++;
        }
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

// ---------------------------------------------------------------- WP10: PG scheduler
// Multi-instance safe claiming: posts.settings JSONB holds the blob record;
// the claim is an atomic UPDATE guarded by lockedForPublishing/lockedAt so
// two instances cannot process the same post. Results persist per-post
// (status/scheduled_at/published_at columns + full record in settings +
// post_targets mirror) — no whole-workspace CAS, so concurrent entity
// writes are not clobbered.

const CLAIM_STALE_MS = 10 * 60 * 1000;

function postDue(post: any, now: Date): boolean {
  const due =
    (post.status === 'scheduled' || post.status === 'optimizing') &&
    new Date(post.scheduledTime) <= now &&
    (!post.nextRetryAt || new Date(post.nextRetryAt) <= now);
  const stuckPublishing =
    post.status === 'publishing' &&
    post.lockedForPublishing &&
    post.updatedAt &&
    now.getTime() - new Date(post.updatedAt).getTime() > CLAIM_STALE_MS;
  return !!(due || stuckPublishing);
}

async function claimPostPg(workspaceLegacyId: string, postLegacyId: string, nowIso: string): Promise<boolean> {
  const r = await query(
    `UPDATE posts p SET settings = p.settings || jsonb_build_object('lockedForPublishing', true, 'lockedAt', $3::text), updated_at = now()
     FROM workspaces w
     WHERE p.workspace_id = w.id AND w.legacy_id = $1 AND p.legacy_id = $2
       AND p.settings->>'status' IN ('scheduled','optimizing','publishing')
       AND (
         COALESCE((p.settings->>'lockedForPublishing')::boolean, false) = false
         OR p.settings->>'lockedAt' IS NULL
         OR (p.settings->>'lockedAt')::timestamptz < now() - interval '10 minutes'
       )
     RETURNING p.id`,
    [workspaceLegacyId, postLegacyId, nowIso],
  );
  return (r.rowCount ?? 0) > 0;
}

async function persistPostResultPg(workspaceLegacyId: string, post: any) {
  const targetStatus =
    post.status === 'published' ? 'published'
    : post.status === 'failed' ? 'failed'
    : post.status === 'publishing' ? 'publishing'
    : 'scheduled';
  await query(
    `UPDATE posts SET status=$3, scheduled_at=$4, published_at=$5, settings=$6, updated_at=now()
     WHERE workspace_id=(SELECT id FROM workspaces WHERE legacy_id=$1) AND legacy_id=$2`,
    [workspaceLegacyId, post.id, post.status || 'draft',
     post.scheduledTime || post.scheduledAt ? new Date(post.scheduledTime || post.scheduledAt).toISOString() : null,
     post.publishedAt || post.publishedTime ? new Date(post.publishedAt || post.publishedTime).toISOString() : null,
     JSON.stringify(post)],
  );
  await query(
    `UPDATE post_targets t SET status=$3, payload=$4, updated_at=now()
     FROM posts p, workspaces w
     WHERE t.post_id=p.id AND p.workspace_id=w.id AND w.legacy_id=$1 AND p.legacy_id=$2`,
    [workspaceLegacyId, post.id, targetStatus, JSON.stringify(post)],
  );
  // Mirror publishingEvents into post_events (deduped by stage+ts) so the
  // lifecycle is queryable per-post, not only inside the settings blob.
  const events = Array.isArray(post.publishingEvents) ? post.publishingEvents : [];
  if (events.length) {
    await query(
      `INSERT INTO post_events(post_id, type, payload)
       SELECT p.id, e->>'stage', e
       FROM posts p,
            jsonb_array_elements($3::jsonb) e
       WHERE p.workspace_id=(SELECT id FROM workspaces WHERE legacy_id=$1)
         AND p.legacy_id=$2
         AND NOT EXISTS (
           SELECT 1 FROM post_events pe
           WHERE pe.post_id=p.id AND pe.type=e->>'stage' AND pe.payload->>'ts'=e->>'ts'
         )`,
      [workspaceLegacyId, post.id, JSON.stringify(events)],
    );
  }
}

async function runPgSchedulerCycle(): Promise<{ publishedInThisCycle: number }> {
  const repos = getRepos();
  const now = new Date();
  const nowIso = now.toISOString();
  let publishedInThisCycle = 0;

  const workspaces = (await query('SELECT legacy_id FROM workspaces')).rows;
  for (const w of workspaces) {
    const wsId = w.legacy_id as string;
    let state: any;
    try { state = await repos.workspaceState.get(wsId); } catch { continue; }
    if (!state || !Array.isArray(state.posts) || state.posts.length === 0) continue;
    if (state.queuePaused) continue;
    if (state.autopilotConfig?.emergencyPaused) continue;

    const duePosts = state.posts.filter((p: any) => postDue(p, now));
    if (!duePosts.length) continue;

    const pending: Promise<void>[] = [];
    for (const post of duePosts) {
      let claimed = false;
      try { claimed = await claimPostPg(wsId, post.id, nowIso); } catch (e) { console.warn('[scheduler] claim failed', post.id, e); }
      if (!claimed) continue;
      // The SQL claim already guards concurrency; processPost performs its own
      // in-memory claim (lockedForPublishing/status) — do not pre-set it or
      // the engine will skip the post as already locked.
      post.updatedAt = nowIso;
      pending.push(processPost(post, state).then(async (outcome) => {
        try { await persistPostResultPg(wsId, post); } catch (e) { console.warn('[scheduler] persist failed', post.id, e); }
        if (outcome === 'published') {
          publishedInThisCycle++;
          publishedPostsCounter++;
          if (!Array.isArray(state.auditLogs)) state.auditLogs = [];
          state.auditLogs.unshift({
            id: `audit_pub_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            timestamp: nowIso,
            actionType: 'published',
            postId: post.id,
            videoTitle: post.postTitle || post.title || 'Untitled Video',
            details: `Post "${post.title || 'untitled'}" published via engine (op ${post.publishOperationId}).`,
            performedBy: 'Publishing Engine',
          });
          try {
            await query(
              `INSERT INTO workspace_kv(workspace_id,key,value,updated_at)
               SELECT w.id,'auditLogs',$3::jsonb,now() FROM workspaces w WHERE w.legacy_id=$1
               ON CONFLICT (workspace_id,key) DO UPDATE SET value=$3::jsonb,updated_at=now()`,
              [wsId, wsId, JSON.stringify(state.auditLogs.slice(0, 1000))],
            );
          } catch {}
          await authStore.logAudit({ workspaceId: wsId, action: 'post_published', details: `Engine published post ${post.id} (${post.publishOperationId}).` });
        } else if (outcome === 'failed') {
          await authStore.logAudit({ workspaceId: wsId, action: 'post_publish_failed', details: `Post ${post.id} failed: ${post.lastPublishError?.message || 'unknown'}` });
        }
      }));
    }
    await Promise.allSettled(pending);
  }
  return { publishedInThisCycle };
}
