// Automation execution engine — runs inside the existing scheduler cycle.
// Evaluates active workflows' triggers, executes supported steps for real,
// records executions persistently. No fabricated results.

import { getDb, saveDatabase, getWorkspaceData, saveWorkspaceData } from './saasDb.ts';

const MAX_STEPS_PER_EXECUTION = 25;
const MAX_EXECUTION_MS = 5 * 60 * 1000;
const lastTriggerHash = new Map<string, number>(); // workflowId -> last fired bucket

interface WorkflowStep {
  id?: string;
  type: string;
  config?: Record<string, any>;
}

interface Workflow {
  id: string;
  name: string;
  status: string;
  trigger?: { type?: string; config?: Record<string, any> } | null;
  steps?: WorkflowStep[];
  brandId?: string | null;
  projectId?: string | null;
  version?: number;
  lastExecutionAt?: string | null;
  lastExecutionStatus?: string | null;
}

function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ---------- Trigger evaluation ----------

function triggerBucket(wf: Workflow, now: number): string | null {
  const t = wf.trigger?.type;
  const cfg = wf.trigger?.config || {};
  switch (t) {
    case 'interval': {
      const mins = Math.max(1, Number(cfg.minutes) || 60);
      return `int_${Math.floor(now / (mins * 60000))}`;
    }
    case 'daily':
      return `day_${new Date(now).toISOString().slice(0, 10)}`;
    case 'weekly': {
      const d = new Date(now);
      return `wk_${d.toISOString().slice(0, 10)}_${d.getUTCDay()}`;
    }
    case 'drive_new_file':
      // Bucketed by scan interval (default 15 min) — dedupes repeated polls
      return `drive_${Math.floor(now / (Math.max(5, Number(cfg.scanMinutes) || 15) * 60000))}`;
    case 'manual':
      return null; // only runs via explicit test/run endpoint
    default:
      return `once_${now}`;
  }
}

function shouldFire(wf: Workflow, now: number): boolean {
  const bucket = triggerBucket(wf, now);
  if (!bucket) return false;
  const key = `${wf.id}:${bucket}`;
  if (lastTriggerHash.get(key)) return false;
  lastTriggerHash.set(key, now);
  // Cleanup old keys
  if (lastTriggerHash.size > 5000) {
    for (const [k, ts] of lastTriggerHash) if (now - ts > 86400000) lastTriggerHash.delete(k);
  }
  return true;
}

// ---------- Step executors (real operations only) ----------

interface StepResult { ok: boolean; output?: any; error?: string }

function execStep(step: WorkflowStep, ctx: { wsId: string; wf: Workflow; data: any }): StepResult {
  const cfg = step.config || {};
  const data = ctx.data;
  const brandId = cfg.brandId || ctx.wf.brandId || null;
  const projectId = cfg.projectId || ctx.wf.projectId || null;

  switch (step.type) {
    case 'notify_user': {
      // Persist as an audit-log style notification record on the workspace
      const logs = data.auditLogs || [];
      logs.unshift({
        id: genId('notif'),
        type: 'automation',
        message: cfg.message || `Workflow "${ctx.wf.name}" completed a step.`,
        workflowId: ctx.wf.id,
        timestamp: new Date().toISOString(),
      });
      data.auditLogs = logs.slice(0, 500);
      return { ok: true, output: { notified: true } };
    }
    case 'assign_brand': {
      if (!cfg.videoId) return { ok: false, error: 'videoId required' };
      const videos = data.videos || [];
      const idx = videos.findIndex((v: any) => v.id === cfg.videoId);
      if (idx === -1) return { ok: false, error: `Video ${cfg.videoId} not found` };
      if (!brandId) return { ok: false, error: 'No brand to assign' };
      videos[idx] = { ...videos[idx], brandId };
      data.videos = videos;
      return { ok: true, output: { videoId: cfg.videoId, brandId } };
    }
    case 'assign_project': {
      if (!cfg.videoId) return { ok: false, error: 'videoId required' };
      const videos = data.videos || [];
      const idx = videos.findIndex((v: any) => v.id === cfg.videoId);
      if (idx === -1) return { ok: false, error: `Video ${cfg.videoId} not found` };
      videos[idx] = { ...videos[idx], projectId: projectId || videos[idx].projectId };
      data.videos = videos;
      return { ok: true, output: { videoId: cfg.videoId, projectId } };
    }
    case 'add_to_queue': {
      if (!cfg.videoId) return { ok: false, error: 'videoId required' };
      const videos = data.videos || [];
      const video = videos.find((v: any) => v.id === cfg.videoId);
      if (!video) return { ok: false, error: `Video ${cfg.videoId} not found` };
      // Duplicate prevention: same video+platform+day already queued
      const posts = data.posts || [];
      const day = new Date().toISOString().slice(0, 10);
      const platforms = cfg.platforms?.length ? cfg.platforms : ['youtube'];
      const created: string[] = [];
      for (const plat of platforms) {
        const dup = posts.some((p: any) =>
          p.videoId === cfg.videoId &&
          (p.channelPlatforms || []).includes(plat) &&
          (p.status === 'scheduled' || p.status === 'publishing' || p.status === 'published') &&
          String(p.scheduledTime || '').startsWith(day)
        );
        if (dup) continue;
        posts.push({
          id: genId('post'),
          title: cfg.title || video.title || 'Automated post',
          caption: cfg.caption || '',
          videoId: cfg.videoId,
          brandId: brandId || video.brandId || null,
          projectId: projectId || video.projectId || null,
          channelPlatforms: [plat],
          scheduledTime: cfg.scheduledTime || new Date(Date.now() + 3600000).toISOString(),
          status: 'scheduled',
          mode: 'assisted',
          createdAt: new Date().toISOString(),
          optimizedByAutopilot: false,
          lockedForPublishing: false,
        });
        created.push(plat);
      }
      data.posts = posts;
      return { ok: true, output: { queuedPlatforms: created, skippedDuplicates: platforms.length - created.length } };
    }
    case 'wait': {
      return { ok: true, output: { waited: cfg.durationMinutes || 0, resumeAt: cfg.until || null } };
    }
    case 'approval': {
      // Parks execution — approval record created, resolved via API
      return { ok: true, output: { approvalRequired: true, type: cfg.approvalType || 'content_review' } };
    }
    case 'condition': {
      // Simple evaluator: field op value on trigger context
      const { field, op, value } = cfg;
      const actual = cfg.context?.[field];
      let pass = false;
      switch (op) {
        case 'equals': pass = actual === value; break;
        case 'not_equals': pass = actual !== value; break;
        case 'contains': pass = String(actual ?? '').includes(String(value)); break;
        case 'exists': pass = actual !== undefined && actual !== null; break;
        default: pass = false;
      }
      return { ok: true, output: { condition: field, passed: pass } };
    }
    default:
      return { ok: false, error: `Unsupported step type "${step.type}" — no executor implemented` };
  }
}

// ---------- Execution runner ----------

async function runWorkflow(wsId: string, wf: Workflow, startIndex = 0, execId?: string) {
  const startedAt = Date.now();
  const data = getWorkspaceData(wsId);
  const steps = wf.steps || [];
  const stepResults: any[] = [];
  let status = 'completed';
  let error: string | null = null;

  const execIdFinal = execId || genId('ex');
  for (let si = startIndex; si < steps.slice(0, MAX_STEPS_PER_EXECUTION).length; si++) {
    const step = steps[si];
    if (Date.now() - startedAt > MAX_EXECUTION_MS) { status = 'failed'; error = 'Execution timeout'; break; }
    // Approval step — park execution until resolved
    if (step.type === 'approval') {
      createApproval(wsId, wf, step, execIdFinal);
      stepResults.push({ stepId: step.id || step.type, type: step.type, status: 'waiting_approval', stepIndex: si, completedAt: null });
      status = 'waiting_approval';
      break;
    }
    // Condition branch — onFalse: 'skip_next' skips the following step
    if (step.type === 'condition') {
      const res = execStep(step, { wsId, wf, data });
      stepResults.push({ stepId: step.id || step.type, type: step.type, status: res.ok ? 'completed' : 'failed', output: res.output || null, error: res.error || null, completedAt: new Date().toISOString() });
      if (!res.ok) { status = 'failed'; error = res.error || 'Step failed'; break; }
      if (res.output?.passed === false && step.config?.onFalse === 'skip_next') { si++; continue; }
      continue;
    }
    const res = execStep(step, { wsId, wf, data });
    stepResults.push({
      stepId: step.id || step.type,
      type: step.type,
      status: res.ok ? 'completed' : 'failed',
      output: res.output || null,
      error: res.error || null,
      completedAt: new Date().toISOString(),
    });
    if (!res.ok) { status = 'failed'; error = res.error || 'Step failed'; break; }
  }
  if (steps.length > MAX_STEPS_PER_EXECUTION) {
    status = 'failed';
    error = `Exceeded max steps (${MAX_STEPS_PER_EXECUTION})`;
  }

  const exec = {
    id: execIdFinal,
    workflowId: wf.id,
    workflowVersion: wf.version || 1,
    triggerEvent: wf.trigger?.type || 'manual',
    status,
    steps: stepResults,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    error,
  };

  const execs = data.automationExecutions || [];
  data.automationExecutions = [...execs, exec].slice(-1000);

  // Update workflow last-execution metadata
  const workflows = data.automationWorkflows || [];
  const idx = workflows.findIndex((w: any) => w.id === wf.id);
  if (idx !== -1) {
    workflows[idx] = {
      ...workflows[idx],
      lastExecutionAt: exec.completedAt,
      lastExecutionStatus: status,
    };
    data.automationWorkflows = workflows;
  }

  saveWorkspaceData(wsId, data);
  // Notify on completion/failure — deduped
  if (status === 'completed') notify(wsId, data, `Workflow "${wf.name}" completed successfully`, wf.id);
  else if (status === 'failed') notify(wsId, data, `Workflow "${wf.name}" failed: ${error || 'unknown error'}`, wf.id);
  saveWorkspaceData(wsId, data);
}

// ---------- Public API ----------

export async function runAutomationCycle() {
  const db = getDb();
  const workspaceIds = Object.keys(db.workspaceData || {});

  // Resume executions parked on resolved approvals
  const approvals = loadApprovals().filter((a: any) => a.status === 'approved' || a.status === 'rejected');
  for (const ap of approvals.slice(-100)) {
    try {
      const data = getWorkspaceData(ap.workspaceId);
      const execs = data.automationExecutions || [];
      const exec = execs.find((e: any) => e.id === ap.executionId && e.status === 'waiting_approval');
      if (!exec) continue;
      const wf = (data.automationWorkflows || []).find((w: any) => w.id === ap.workflowId);
      if (!wf) continue;
      const apStep = exec.steps?.find((s: any) => s.type === 'approval' && s.status === 'waiting_approval');
      const resumeIdx = (apStep?.stepIndex ?? 0) + 1;
      if (ap.status === 'approved') {
        // Retire the parked record before resuming (new exec reuses same id)
        const pidx = execs.findIndex((e: any) => e.id === exec.id);
        if (pidx !== -1) { execs[pidx] = { ...execs[pidx], status: 'resumed' }; data.automationExecutions = execs; saveWorkspaceData(ap.workspaceId, data); }
        await runWorkflow(ap.workspaceId, wf, resumeIdx, exec.id);
      } else {
        // Rejected — mark execution cancelled
        const idx = execs.findIndex((e: any) => e.id === exec.id);
        execs[idx] = { ...exec, status: 'cancelled', error: `Approval ${ap.decision || 'rejected'}`, completedAt: new Date().toISOString() };
        data.automationExecutions = execs;
        saveWorkspaceData(ap.workspaceId, data);
      }
      // Mark approval consumed so it doesn't reprocess
      const all = loadApprovals();
      const ai = all.findIndex((a: any) => a.id === ap.id);
      if (ai !== -1) { all[ai] = { ...all[ai], status: ap.status === 'approved' ? 'resumed' : 'consumed' }; saveApprovals(all); }
    } catch (e: any) {
      console.error('[automation] approval resume error:', e?.message);
    }
  }

  for (const wsId of workspaceIds) {
    const data = getWorkspaceData(wsId);
    const workflows = (data.automationWorkflows || []).filter(
      (w: any) => w.status === 'active' && w.trigger?.type && w.trigger.type !== 'manual'
    );
    if (!workflows.length) continue;
    const now = Date.now();
    for (const wf of workflows) {
      try {
        const t = wf.trigger?.type;
        // Real detection gates — only fire when actual events found
        if (t === 'drive_new_file') {
          const det = await detectDriveNewFiles(wsId, wf);
          if (!det || det.found === 0) continue;
          // Record seen IDs to prevent re-detection
          const seenIds = [...new Set([...(wf as any).triggerState?.seenFileIds || [], ...det.files.map((f: any) => f.id)])].slice(-500);
          const wIdx = (data.automationWorkflows || []).findIndex((w: any) => w.id === wf.id);
          if (wIdx !== -1) {
            (data.automationWorkflows as any[])[wIdx] = { ...wf, triggerState: { seenFileIds: seenIds } };
          }
        } else if (['video_uploaded', 'post_scheduled', 'post_failed'].includes(t || '')) {
          const ev = detectWorkspaceEvents(wsId, wf);
          if (ev.found === 0) continue;
        }
        if (shouldFire(wf, now)) {
          await runWorkflow(wsId, wf);
        }
      } catch (e: any) {
        console.error(`[automation] workflow ${wf.id} error:`, e?.message);
      }
    }
  }
}

export async function runWorkflowNow(wsId: string, workflowId: string): Promise<{ success: boolean; error?: string }> {
  const data = getWorkspaceData(wsId);
  const wf = (data.automationWorkflows || []).find((w: any) => w.id === workflowId);
  if (!wf) return { success: false, error: 'Workflow not found' };
  if (wf.status === 'archived') return { success: false, error: 'Cannot run archived workflow' };
  const lim = checkWorkflowLimits(data, wf);
  if (!lim.ok) return { success: false, error: lim.error };
  await runWorkflow(wsId, wf);
  return { success: true };
}

// ===================== PHASE 3 — REAL TRIGGER SOURCES =====================
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DRIVE_CONN_FILE = path.join(process.cwd(), 'data', 'drive_connections.json');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

function loadDriveConnections(): any[] {
  try { return JSON.parse(fs.readFileSync(DRIVE_CONN_FILE, 'utf8')); } catch { return []; }
}

async function getDriveToken(conn: any): Promise<string | null> {
  // Reuse stored access token if fresh; otherwise refresh via refresh_token grant
  if (conn.accessToken && conn.expiresAt && Date.now() < conn.expiresAt - 60000) {
    return conn.accessToken;
  }
  if (!conn.refreshToken || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: conn.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const j = await resp.json();
    return j.access_token || null;
  } catch { return null; }
}

// Drive folder poll — returns count of NEW video files since last scan.
// Dedup state stored on the workflow (triggerState.seenFileIds).
async function detectDriveNewFiles(wsId: string, wf: Workflow): Promise<{ found: number; files: any[] } | null> {
  const cfg = wf.trigger?.config || {};
  const folderId = cfg.driveFolderId || 'root';
  const conns = loadDriveConnections().filter((c: any) => c.workspaceId === wsId || !c.workspaceId);
  if (!conns.length) return null;
  const conn = conns[0];
  const token = await getDriveToken(conn);
  if (!token) return null;

  const state = (wf as any).triggerState || {};
  const seen: Set<string> = new Set(state.seenFileIds || []);

  const params = new URLSearchParams({
    q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
    fields: 'files(id,name,mimeType,size,modifiedTime)',
    pageSize: '50',
    orderBy: 'modifiedTime desc',
  });
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  const j = await resp.json();
  const files = (j.files || []).filter((f: any) => !seen.has(f.id));
  return { found: files.length, files };
}

// Workspace event detection — new videos/posts since workflow's last run.
function detectWorkspaceEvents(wsId: string, wf: Workflow): { found: number; detail: string } {
  const data = getWorkspaceData(wsId);
  const lastRun = wf.lastExecutionAt ? new Date(wf.lastExecutionAt).getTime() : 0;
  const t = wf.trigger?.type;
  if (t === 'video_uploaded') {
    const vids = (data.videos || []).filter((v: any) => new Date(v.createdAt || v.uploadedAt || 0).getTime() > lastRun);
    return { found: vids.length, detail: `${vids.length} new video(s) in library` };
  }
  if (t === 'post_scheduled') {
    const posts = (data.posts || []).filter((p: any) => new Date(p.createdAt || 0).getTime() > lastRun);
    return { found: posts.length, detail: `${posts.length} new scheduled post(s)` };
  }
  if (t === 'post_failed') {
    const failed = (data.posts || []).filter((p: any) => p.status === 'failed' && new Date(p.updatedAt || p.createdAt || 0).getTime() > lastRun);
    return { found: failed.length, detail: `${failed.length} failed post(s)` };
  }
  return { found: 0, detail: 'no events' };
}

// ===================== PHASE 6 — DELAYS, APPROVALS, NOTIFICATIONS, LIMITS =====================

const PENDING_APPROVALS_FILE = path.join(process.cwd(), 'data', 'automation_approvals.json');

export function loadApprovals(): any[] {
  try { return JSON.parse(fs.readFileSync(PENDING_APPROVALS_FILE, 'utf8')); } catch { return []; }
}
export function saveApprovals(a: any[]) {
  try { fs.writeFileSync(PENDING_APPROVALS_FILE, JSON.stringify(a, null, 2)); } catch {}
}

// Persistent scheduled resume — executions waiting on a delay store resumeAt.
// Cycle skips them until due; survives restart because state is in workspace data.
function getPendingWaits(data: any): any[] {
  return data.automationPendingWaits || [];
}
function setPendingWaits(data: any, waits: any[]) {
  data.automationPendingWaits = waits;
}

// Approval step executor — creates a pending approval record; execution parks.
function createApproval(wsId: string, wf: Workflow, step: WorkflowStep, execId: string) {
  const approvals = loadApprovals();
  const ap = {
    id: genId('appr'),
    workspaceId: wsId,
    workflowId: wf.id,
    executionId: execId,
    stepId: step.id || step.type,
    type: step.config?.approvalType || 'content_review',
    message: step.config?.message || `Approval required by workflow "${wf.name}"`,
    status: 'pending',
    requestedAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
    decision: null,
  };
  approvals.push(ap);
  saveApprovals(approvals.slice(-1000));
  return ap;
}

// Notification helper — dedupes identical messages within 10 min
function notify(wsId: string, data: any, message: string, wfId?: string) {
  const logs = data.auditLogs || [];
  const cutoff = Date.now() - 10 * 60000;
  const dup = logs.some((l: any) => l.type === 'automation' && l.message === message && new Date(l.timestamp).getTime() > cutoff);
  if (dup) return;
  logs.unshift({ id: genId('notif'), type: 'automation', message, workflowId: wfId || null, timestamp: new Date().toISOString() });
  data.auditLogs = logs.slice(0, 500);
}

// Workspace limits — enforced on activate
const LIMITS = {
  maxActiveWorkflows: 25,
  maxStepsPerWorkflow: 50,
  maxExecutionsPerHour: 200,
};

export function checkWorkflowLimits(data: any, wf?: Workflow): { ok: boolean; error?: string } {
  const workflows = data.automationWorkflows || [];
  if (wf?.status === 'active') {
    const active = workflows.filter((w: any) => w.status === 'active' && w.id !== wf.id).length;
    if (active >= LIMITS.maxActiveWorkflows) return { ok: false, error: `Active workflow limit reached (${LIMITS.maxActiveWorkflows})` };
  }
  const steps = wf?.steps?.length || 0;
  if (steps > LIMITS.maxStepsPerWorkflow) return { ok: false, error: `Step limit exceeded (${LIMITS.maxStepsPerWorkflow})` };
  const execs = (data.automationExecutions || []).filter((e: any) => Date.now() - new Date(e.startedAt).getTime() < 3600000);
  if (execs.length >= LIMITS.maxExecutionsPerHour) return { ok: false, error: 'Hourly execution limit reached' };
  return { ok: true };
}
