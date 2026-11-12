import express, { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth, requireRole, requireGodOwner, AuthenticatedRequest } from './authRouter.ts';
import {
  getWorkspaceData,
  saveWorkspaceData,
  getWorkspaceStateVersion,
  createWorkspace,
  updateWorkspace,
  findWorkspaceById,
  getUserWorkspaces,
  getWorkspaceMembers,
  getDb,
  saveDatabase,
  logAuditEvent,
  updateUser,
  deleteUser,
  sanitizeUserForClient,
  getSystemSettings,
  updateSystemSettings,
  addAnnouncement,
  removeAnnouncement,
  getAuditLogs,
  GOD_OWNER_EMAIL,
  ROLE_HIERARCHY,
  UserRole,
  PlanTier,
  BillingCycle,
  getMemberRole,
  hasWorkspacePermission,
  verifyPassword,
} from './saasDb.ts';
import {
  getAllAccounts,
  removeAccount,
  getOAuthConfig,
  decryptToken,
} from './oauthStore.ts';

export const saasRouter = express.Router();

// Enforce authentication on all SaaS workspace endpoints
saasRouter.use(requireAuth);

// 1. GET WORKSPACE ISOLATED DATA
saasRouter.get('/state', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  if (!workspaceId) {
    return res.status(400).json({ success: false, error: 'No active workspace selected.' });
  }

  const data = getWorkspaceData(workspaceId);
  res.json({
    success: true,
    workspaceId,
    workspace: req.workspace,
    data,
    stateVersion: getWorkspaceStateVersion(workspaceId),
  });
});

// Top-level keys the workspace-state blob is allowed to carry. Anything else
// is rejected so a crafted payload cannot smuggle unexpected fields into the
// stored document.
const STATE_ALLOWED_KEYS = new Set([
  'brands', 'activeBrandId', 'projects', 'accounts', 'categories', 'videos',
  'videoFolders', 'analytics', 'posts', 'recommendations', 'experiments',
  'autopilotConfig', 'auditLogs', 'automationWorkflows', 'automationExecutions',
  'automationRules', 'automationLogs', 'savedStrategy', 'aiVideoResults',
  'customRoles', 'campaigns', 'contentPillars', 'contentIdeas',
  'postComments', 'calendarSavedViews', 'calendarSettings', 'queuePaused',
]);

// Core collections that must never silently shrink — guards against a client
// pushing a near-empty blob (e.g. localStorage fallback before first GET)
// and wiping real server-side data.
const STATE_CORE_ARRAYS = ['posts', 'videos', 'brands', 'accounts'] as const;
const STATE_SHRINK_MIN_OLD = 10;
const STATE_SHRINK_RATIO = 0.5;

// Referential integrity: a post/video may not point at a brand or account
// that does not exist in the same workspace. Orphaned legacy rows already in
// storage are grandfathered — only NEW or CHANGED bad references are rejected.
function findStateReferenceViolations(
  current: any,
  merged: any
): string[] {
  const violations: string[] = [];
  const brandIds = new Set((merged.brands || []).map((b: any) => b.id));
  const accountIds = new Set((merged.accounts || []).map((a: any) => a.id));
  const currentPosts = new Map<string, any>((current.posts || []).map((p: any) => [p.id, p] as [string, any]));
  const currentVideos = new Map<string, any>((current.videos || []).map((v: any) => [v.id, v] as [string, any]));

  for (const p of merged.posts || []) {
    const prev = currentPosts.get(p.id);
    const unchanged = prev && prev.brandId === p.brandId && prev.accountId === p.accountId;
    if (unchanged) continue;
    if (p.brandId && !brandIds.has(p.brandId)) violations.push(`post ${p.id}: unknown brandId`);
    if (p.accountId && !accountIds.has(p.accountId)) violations.push(`post ${p.id}: unknown accountId`);
  }
  for (const v of merged.videos || []) {
    const prev = currentVideos.get(v.id);
    if (prev && prev.brandId === v.brandId) continue;
    if (v.brandId && !brandIds.has(v.brandId)) violations.push(`video ${v.id}: unknown brandId`);
  }
  return violations;
}

// 2. SAVE WORKSPACE ISOLATED DATA
saasRouter.post('/state', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  if (!workspaceId) {
    return res.status(400).json({ success: false, error: 'No active workspace selected.' });
  }

  const { data, baseVersion } = req.body || {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ success: false, error: 'Invalid state payload.' });
  }

  const current = getWorkspaceData(workspaceId);
  const currentVersion = getWorkspaceStateVersion(workspaceId);

  // Optimistic concurrency: when the client declares the version it based its
  // edits on, a mismatch means someone else wrote in between — reject so the
  // client re-fetches and merges instead of silently losing updates.
  if (typeof baseVersion === 'number' && baseVersion !== currentVersion) {
    return res.status(409).json({
      success: false,
      conflict: true,
      error: 'Workspace state changed since your last sync. Refreshing…',
      stateVersion: currentVersion,
    });
  }

  // Top-level key whitelist + prototype-pollution guard.
  for (const key of Object.keys(data)) {
    if (!STATE_ALLOWED_KEYS.has(key)) {
      return res.status(400).json({ success: false, error: `Unexpected state key: ${key}` });
    }
  }

  // Anti-wipe: core collections must not collapse below half their size.
  for (const key of STATE_CORE_ARRAYS) {
    const next = data[key];
    if (!Array.isArray(next)) continue;
    const prev = Array.isArray(current[key]) ? current[key] : [];
    if (prev.length >= STATE_SHRINK_MIN_OLD && next.length < Math.floor(prev.length * STATE_SHRINK_RATIO)) {
      return res.status(409).json({
        success: false,
        error: `Refusing to shrink '${key}' from ${prev.length} to ${next.length} items.`,
        stateVersion: currentVersion,
      });
    }
  }

  // Referential integrity on the merged result.
  const merged = { ...current, ...data };
  const violations = findStateReferenceViolations(current, merged);
  if (violations.length > 0) {
    return res.status(400).json({
      success: false,
      error: `State references unknown entities: ${violations.slice(0, 5).join('; ')}`,
    });
  }

  saveWorkspaceData(workspaceId, data);
  res.json({
    success: true,
    message: 'Workspace state synchronized.',
    stateVersion: getWorkspaceStateVersion(workspaceId),
  });
});

// ---- Publishing Queue controls (workspace-scoped, persisted) ----

function queueStatusPayload(wsData: any) {
  const posts = Array.isArray(wsData?.posts) ? wsData.posts : [];
  const now = Date.now();
  const active = posts.filter((p: any) => p.status === 'publishing' || p.status === 'optimizing').length;
  const pending = posts.filter((p: any) => p.status === 'scheduled' && p.scheduledTime && new Date(p.scheduledTime).getTime() <= now).length;
  const upcoming = posts
    .filter((p: any) => p.status === 'scheduled' && p.scheduledTime)
    .sort((a: any, b: any) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
  return {
    paused: Boolean(wsData?.queuePaused),
    activeJobs: active,
    pendingJobs: pending,
    nextScheduled: upcoming[0] ? { id: upcoming[0].id, title: upcoming[0].title, scheduledTime: upcoming[0].scheduledTime } : null,
    totalScheduled: posts.filter((p: any) => p.status === 'scheduled').length,
  };
}

saasRouter.get('/queue/status', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'No active workspace selected.' });
  res.json({ success: true, ...queueStatusPayload(getWorkspaceData(workspaceId)) });
});

saasRouter.post('/queue/pause', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'No active workspace selected.' });
  const wsData = getWorkspaceData(workspaceId);
  const status = queueStatusPayload(wsData);
  if (status.activeJobs > 0 && req.body?.confirmActive !== true) {
    return res.status(409).json({ success: false, needsConfirm: true, activeJobs: status.activeJobs, error: `${status.activeJobs} job(s) currently publishing — pausing will not interrupt them.` });
  }
  saveWorkspaceData(workspaceId, { ...(wsData as any), queuePaused: true } as any);
  logAuditEvent({ workspaceId, userId: req.user!.id, userEmail: req.user!.email, action: 'queue_paused', details: 'Publishing queue paused by user' });
  res.json({ success: true, ...queueStatusPayload(getWorkspaceData(workspaceId)), message: 'Queue paused — no new jobs will start. Running jobs continue.' });
});

saasRouter.post('/queue/resume', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'No active workspace selected.' });
  const wsData = getWorkspaceData(workspaceId);
  saveWorkspaceData(workspaceId, { ...(wsData as any), queuePaused: false } as any);
  logAuditEvent({ workspaceId, userId: req.user!.id, userEmail: req.user!.email, action: 'queue_resumed', details: 'Publishing queue resumed by user' });
  res.json({ success: true, ...queueStatusPayload(getWorkspaceData(workspaceId)), message: 'Queue resumed.' });
});

// Queue analytics — real metrics computed from workspace post records
saasRouter.get('/queue/analytics', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'No active workspace selected.' });
  const wsData = getWorkspaceData(workspaceId);
  const posts: any[] = Array.isArray(wsData?.posts) ? wsData.posts : [];
  const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || '30'), 10) || 30));
  const since = Date.now() - days * 86400_000;

  const inRange = posts.filter((p) => {
    const t = new Date(p.publishedAt || p.updatedAt || p.createdAt).getTime();
    return t >= since;
  });

  const published = inRange.filter((p) => p.status === 'published');
  const failed = inRange.filter((p) => p.status === 'failed');
  const scheduled = inRange.filter((p) => p.status === 'scheduled');
  const retrying = inRange.filter((p) => (p.retryCount || 0) > 0);

  // avg time scheduledTime → publishedAt (only where both exist)
  const durations = published
    .map((p) => new Date(p.publishedAt).getTime() - new Date(p.scheduledTime || p.createdAt).getTime())
    .filter((d) => d >= 0 && d < 30 * 86400_000);
  const avgMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

  // per-platform breakdown
  const byPlatform: Record<string, { total: number; published: number; failed: number }> = {};
  inRange.forEach((p) => {
    (p.channelPlatforms || p.platforms || ['unknown']).forEach((pl: string) => {
      if (!byPlatform[pl]) byPlatform[pl] = { total: 0, published: 0, failed: 0 };
      byPlatform[pl].total++;
      if (p.status === 'published') byPlatform[pl].published++;
      if (p.status === 'failed') byPlatform[pl].failed++;
    });
  });

  // top error categories
  const errorClasses: Record<string, number> = {};
  failed.forEach((p) => {
    const cls = p.lastPublishError?.class || 'unknown';
    errorClasses[cls] = (errorClasses[cls] || 0) + 1;
  });

  res.json({
    success: true,
    days,
    totals: {
      posts: inRange.length,
      published: published.length,
      failed: failed.length,
      scheduled: scheduled.length,
      retrying: retrying.length,
      successRate: inRange.length ? Math.round((published.length / Math.max(1, published.length + failed.length)) * 100) : null,
      avgPublishMs: avgMs,
    },
    byPlatform,
    topErrors: Object.entries(errorClasses).sort((a, b) => b[1] - a[1]).slice(0, 5),
  });
});

// Smart scheduling — best publish windows from real published-post history
saasRouter.get('/queue/best-times', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'No active workspace selected.' });
  const wsData = getWorkspaceData(workspaceId);
  const posts: any[] = Array.isArray(wsData?.posts) ? wsData.posts : [];
  const published = posts.filter((p) => p.status === 'published' && p.scheduledTime && p.publishedAt);

  if (published.length < 5) {
    return res.json({
      success: true, sufficient: false, sampleSize: published.length,
      message: `Insufficient data — ${published.length}/5 published posts needed for reliable recommendations.`,
      suggestions: [],
    });
  }

  // score each (dayOfWeek, hour) slot by publish success density
  const slots = new Map<string, { dow: number; hour: number; count: number }>();
  published.forEach((p) => {
    const d = new Date(p.scheduledTime);
    const key = `${d.getDay()}_${d.getHours()}`;
    const cur = slots.get(key) || { dow: d.getDay(), hour: d.getHours(), count: 0 };
    cur.count++;
    slots.set(key, cur);
  });
  const top = Array.from(slots.values()).sort((a, b) => b.count - a.count).slice(0, 5);
  const max = top[0]?.count || 1;
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  res.json({
    success: true, sufficient: true, sampleSize: published.length,
    suggestions: top.map((s) => ({
      day: DAY[s.dow], hour: s.hour,
      label: `${DAY[s.dow]} ${String(s.hour).padStart(2, '0')}:00`,
      confidence: Math.min(95, Math.round((s.count / max) * 70 + Math.min(25, published.length))),
      basis: `${s.count} published post(s) at this window`,
    })),
    message: 'Based on your actual published-post history.',
  });
});

// In-app publishing notifications — derived from real post events (last 50)
saasRouter.get('/queue/notifications', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'No active workspace selected.' });
  const wsData = getWorkspaceData(workspaceId);
  const posts: any[] = Array.isArray(wsData?.posts) ? wsData.posts : [];

  const events: any[] = [];
  posts.forEach((p) => {
    (p.publishingEvents || []).forEach((e: any) => {
      if (['completed', 'failed', 'retry_scheduled'].includes(e.stage)) {
        events.push({
          id: `${p.id}_${e.ts}`,
          postId: p.id,
          postTitle: p.title || 'Untitled post',
          ts: e.ts,
          stage: e.stage,
          message: e.message,
        });
      }
    });
  });
  events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  res.json({ success: true, notifications: events.slice(0, 50) });
});

// GET /api/saas/history — workspace-scoped publishing history with server-side
// filtering, sorting, and pagination. Joins posts with analytics records.
saasRouter.get('/history', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const data = getWorkspaceData(wsId);

  const { days, brandId, platform, status, accountId, q, sort = 'date_desc', page = '1', pageSize = '25', from, to } = req.query as Record<string, string>;

  // Date range filter: explicit from/to (ISO dates) takes precedence over days
  const daysNum = Math.min(Math.max(parseInt(days || '0', 10) || 0, 0), 3650);
  const fromTs = from ? new Date(from).getTime() : NaN;
  const toTs = to ? new Date(to + 'T23:59:59').getTime() : NaN;
  const since = !isNaN(fromTs) ? fromTs : daysNum > 0 ? Date.now() - daysNum * 86400e3 : 0;
  const until = !isNaN(toTs) ? toTs : Infinity;

  let items = (data.posts || []).filter((p: any) => {
    const t = new Date(p.scheduledTime || p.publishedTime || p.createdAt || 0).getTime();
    if (since && t < since) return false;
    if (t > until) return false;
    if (brandId && brandId !== 'all' && p.brandId !== brandId) return false;
    if (platform && platform !== 'all' && !(p.channelPlatforms || []).includes(platform)) return false;
    if (accountId && accountId !== 'all' && !((p.accountIds || []).includes(accountId))) return false;
    if (status && status !== 'all' && p.status !== status) return false;
    if (q) {
      const hay = `${p.title || ''} ${p.caption || ''}`.toLowerCase();
      if (!hay.includes(String(q).toLowerCase())) return false;
    }
    return true;
  });

  // Sort
  const sorters: Record<string, (a: any, b: any) => number> = {
    date_desc: (a, b) => new Date(b.scheduledTime || b.publishedTime || 0).getTime() - new Date(a.scheduledTime || a.publishedTime || 0).getTime(),
    date_asc: (a, b) => new Date(a.scheduledTime || a.publishedTime || 0).getTime() - new Date(b.scheduledTime || b.publishedTime || 0).getTime(),
    title: (a, b) => String(a.title || '').localeCompare(String(b.title || '')),
    status: (a, b) => String(a.status).localeCompare(String(b.status)),
  };
  items.sort(sorters[sort] || sorters.date_desc);

  // Analytics join (per post+platform)
  const analyticsByPost = new Map<string, any[]>();
  (data.analytics || []).forEach((a: any) => {
    if (!analyticsByPost.has(a.postId)) analyticsByPost.set(a.postId, []);
    analyticsByPost.get(a.postId)!.push(a);
  });

  const total = items.length;
  const ps = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 100);
  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const pageItems = items.slice((pg - 1) * ps, pg * ps).map((p: any) => ({
    ...p,
    analytics: analyticsByPost.get(p.id) || [],
  }));

  res.json({
    success: true,
    items: pageItems,
    pagination: { page: pg, pageSize: ps, total, totalPages: Math.ceil(total / ps) },
    syncedAt: new Date().toISOString(),
  });
});

// GET /api/saas/history/analytics — workspace-scoped synced analytics joined
// with post/video/brand context for the performance dashboard.
saasRouter.get('/history/analytics', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const data = getWorkspaceData(wsId);
  const { days = '30', brandId, platform } = req.query as Record<string, string>;
  const daysNum = Math.min(Math.max(parseInt(days, 10) || 30, 1), 3650);
  const since = Date.now() - daysNum * 86400e3;

  const postById = new Map((data.posts || []).map((p: any) => [p.id, p]));
  const videoById = new Map((data.videos || []).map((v: any) => [v.id, v]));
  const brandById = new Map((data.brands || []).map((b: any) => [b.id, b]));

  const items = (data.analytics || [])
    .map((a: any) => {
      const post = postById.get(a.postId);
      const video = post ? videoById.get(post.videoId) : null;
      const brand = post ? brandById.get(post.brandId) : null;
      return { ...a, postTitle: post?.title || video?.title || 'Unknown', brandName: brand?.name || null, postStatus: post?.status || null, scheduledTime: post?.scheduledTime || null };
    })
    .filter((a: any) => {
      const t = new Date(a.syncedAt || a.snapshotAt || 0).getTime();
      if (t && t < since) return false;
      if (brandId && brandId !== 'all' && a.brandName !== brandId) return false;
      if (platform && platform !== 'all' && a.platform !== platform) return false;
      return true;
    });

  // Freshness per platform
  const freshness: Record<string, { lastSync: string | null; records: number }> = {};
  items.forEach((a: any) => {
    if (!freshness[a.platform]) freshness[a.platform] = { lastSync: null, records: 0 };
    const f = freshness[a.platform];
    f.records++;
    if (a.syncedAt && (!f.lastSync || a.syncedAt > f.lastSync)) f.lastSync = a.syncedAt;
  });

  res.json({ success: true, items, freshness, total: items.length });
});

// ---- Brands & Projects: validated workspace-scoped CRUD ----

// ---- Brand membership & permissions ----
// Brand roles: owner > admin > editor > publisher > analyst > viewer
const BRAND_ROLE_RANK: Record<string, number> = { viewer: 0, analyst: 1, publisher: 2, editor: 3, admin: 4, owner: 5 };

function brandMemberRole(brand: any, userId: string | undefined): string | null {
  if (!userId) return null;
  const m = (brand?.members || []).find((x: any) => x.userId === userId);
  return m?.role || null;
}

// Workspace owner/admin always have full access. Otherwise brand.members governs.
function canAccessBrand(req: AuthenticatedRequest, brand: any, minRank = 0): { ok: boolean; role: string | null } {
  const wsId = req.workspace?.id;
  const wsMemberRole = wsId && req.user?.id ? getMemberRole(req.user.id, wsId) : undefined;
  const memberRole = brandMemberRole(brand, req.user?.id);
  // Workspace owners/admins bypass brand-level restrictions
  if (req.user?.role === 'god' || wsMemberRole === 'owner' || wsMemberRole === 'admin') {
    return { ok: true, role: 'owner' };
  }
  const brandMembers = brand?.members || [];
  if (brandMembers.length === 0) {
    // No explicit members → any workspace member may access (open brand)
    return { ok: true, role: 'member' };
  }
  const rank = memberRole ? (BRAND_ROLE_RANK[memberRole] ?? -1) : -1;
  return { ok: rank >= minRank, role: memberRole };
}

function brandDependencyCounts(wsData: any, brandId: string) {
  return {
    projects: (wsData.projects || []).filter((p: any) => p.brandId === brandId).length,
    videos: (wsData.videos || []).filter((v: any) => v.brandId === brandId).length,
    posts: (wsData.posts || []).filter((p: any) => p.brandId === brandId).length,
    campaigns: (wsData.campaigns || []).filter((c: any) => c.brandId === brandId).length,
  };
}

saasRouter.get('/brands', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const data = getWorkspaceData(wsId);
  // Brand-level access: open brands (no members) visible to all workspace members
  const brands = (data.brands || []).filter((b: any) => canAccessBrand(req, b, 0).ok);
  res.json({ success: true, brands });
});

saasRouter.post('/brands', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const { name, ...rest } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ success: false, error: 'Brand name is required' });
  const data = getWorkspaceData(wsId);
  const brands = data.brands || [];
  if (brands.some((b: any) => b.name.toLowerCase() === String(name).trim().toLowerCase())) {
    return res.status(409).json({ success: false, error: 'A brand with this name already exists in this workspace' });
  }
  const brand = {
    id: `brand_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: String(name).trim(),
    color: rest.color || '#00D6B2',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...rest,
  };
  saveWorkspaceData(wsId, { ...data, brands: [...brands, brand] });
  res.json({ success: true, brand });
});

saasRouter.patch('/brands/:id', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const data = getWorkspaceData(wsId);
  const brands = data.brands || [];
  const idx = brands.findIndex((b: any) => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Brand not found' });
  const access = canAccessBrand(req, brands[idx], 3); // editor rank required to edit
  if (!access.ok) return res.status(403).json({ success: false, error: 'Insufficient brand permissions' });
  const { members, ...rest } = req.body || {};
  // Validate member roles if provided
  if (members !== undefined) {
    if (!Array.isArray(members)) return res.status(400).json({ success: false, error: 'members must be an array' });
    const validRoles = ['owner', 'admin', 'editor', 'publisher', 'analyst', 'viewer'];
    const wsMemberIds = new Set(getWorkspaceMembers(wsId).map((m: any) => m.userId || m.user?.id));
    for (const m of members) {
      if (!m.userId || !validRoles.includes(m.role)) return res.status(400).json({ success: false, error: 'Invalid member entry' });
      if (!wsMemberIds.has(m.userId)) return res.status(403).json({ success: false, error: `User ${m.userId} is not a workspace member` });
    }
  }
  const updated = { ...brands[idx], ...rest, ...(members !== undefined ? { members } : {}), id: brands[idx].id, updatedAt: new Date().toISOString() };
  brands[idx] = updated;
  saveWorkspaceData(wsId, { ...data, brands });
  logAuditEvent({ workspaceId: wsId, userId: req.user!.id, userEmail: req.user!.email, action: 'brand_updated', details: `Brand "${updated.name}" updated${members !== undefined ? ' (members changed)' : ''}` });
  res.json({ success: true, brand: updated });
});

// Delete with dependency check — prefers archive when dependencies exist
saasRouter.delete('/brands/:id', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const data = getWorkspaceData(wsId);
  const brands = data.brands || [];
  const idx = brands.findIndex((b: any) => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Brand not found' });
  const delAccess = canAccessBrand(req, brands[idx], 4); // admin rank required to delete
  if (!delAccess.ok) return res.status(403).json({ success: false, error: 'Insufficient brand permissions' });
  const deps = brandDependencyCounts(data, req.params.id);
  const totalDeps = Object.values(deps).reduce((a: number, b: any) => a + b, 0);
  if (totalDeps > 0 && req.query.force !== 'true') {
    return res.status(409).json({
      success: false,
      error: 'Brand has dependent records',
      dependencies: deps,
      suggestion: 'Archive the brand instead, or pass force=true to delete anyway',
    });
  }
  const deletedName = brands[idx].name;
  brands.splice(idx, 1);
  saveWorkspaceData(wsId, { ...data, brands });
  logAuditEvent({ workspaceId: wsId, userId: req.user!.id, userEmail: req.user!.email, action: 'brand_deleted', details: `Brand "${deletedName}" deleted` });
  res.json({ success: true, message: 'Brand deleted', removedDependencies: deps });
});

// ---- Projects (must reference a brand in the same workspace) ----

function validateProjectBrand(wsData: any, brandId: string): boolean {
  return (wsData.brands || []).some((b: any) => b.id === brandId);
}

saasRouter.get('/projects', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const { brandId } = req.query as Record<string, string>;
  let projects = getWorkspaceData(wsId).projects || [];
  if (brandId) projects = projects.filter((p: any) => p.brandId === brandId);
  res.json({ success: true, projects });
});

saasRouter.post('/projects', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const { name, brandId, ...rest } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ success: false, error: 'Project name is required' });
  if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });
  const data = getWorkspaceData(wsId);
  if (!validateProjectBrand(data, brandId)) {
    return res.status(403).json({ success: false, error: 'Brand not found in this workspace' });
  }
  const project = {
    id: `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: String(name).trim(),
    brandId,
    status: 'planning',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...rest,
  };
  saveWorkspaceData(wsId, { ...data, projects: [...(data.projects || []), project] });
  res.json({ success: true, project });
});

saasRouter.patch('/projects/:id', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const data = getWorkspaceData(wsId);
  const projects = data.projects || [];
  const idx = projects.findIndex((p: any) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Project not found' });
  const { brandId, ...rest } = req.body || {};
  if (brandId && !validateProjectBrand(data, brandId)) {
    return res.status(403).json({ success: false, error: 'Brand not found in this workspace' });
  }
  projects[idx] = { ...projects[idx], ...rest, ...(brandId ? { brandId } : {}), id: projects[idx].id, updatedAt: new Date().toISOString() };
  saveWorkspaceData(wsId, { ...data, projects });
  res.json({ success: true, project: projects[idx] });
});

saasRouter.delete('/projects/:id', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const data = getWorkspaceData(wsId);
  const projects = data.projects || [];
  const idx = projects.findIndex((p: any) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Project not found' });
  const videoCount = (data.videos || []).filter((v: any) => v.projectId === req.params.id).length;
  if (videoCount > 0 && req.query.force !== 'true') {
    return res.status(409).json({ success: false, error: 'Project has associated videos', dependencies: { videos: videoCount }, suggestion: 'Archive instead, or force=true' });
  }
  projects.splice(idx, 1);
  saveWorkspaceData(wsId, { ...data, projects });
  res.json({ success: true, message: 'Project deleted' });
});

// 3. CREATE NEW WORKSPACE
saasRouter.post('/workspace', (req: AuthenticatedRequest, res: Response) => {
  const { name } = req.body;
  const user = req.user!;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Workspace name is required.' });
  }

  const ws = createWorkspace(user.id, name.trim());
  const workspaces = getUserWorkspaces(user.id);

  logAuditEvent({
    workspaceId: ws.id,
    userId: user.id,
    userEmail: user.email,
    action: 'workspace_created',
    details: `Workspace "${ws.name}" created by ${user.fullName}.`,
  });

  res.status(201).json({
    success: true,
    workspace: ws,
    workspaces,
  });
});

// 4. UPDATE WORKSPACE SETTINGS / ONBOARDING
saasRouter.put('/workspace/:id', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.params.id;
  const user = req.user!;
  const db = getDb();

  const membership = db.workspaceMembers.find(
    (m) => m.workspaceId === workspaceId && m.userId === user.id
  );
  const isPlatformAdmin = user.role === 'platform_admin' || user.role === 'god';

  if (!membership && !isPlatformAdmin) {
    return res.status(403).json({ success: false, error: 'Unauthorized to modify this workspace.' });
  }

  // Whitelist mutable fields only — plan/billingCycle are NEVER settable via
  // this endpoint (they change only through billing webhooks / GOD console).
  const { name, settings } = req.body;
  const updates: any = {};

  const memberRole = membership?.role;
  const canManageWorkspace = isPlatformAdmin || memberRole === 'owner' || memberRole === 'admin';
  if (!canManageWorkspace) {
    return res.status(403).json({ success: false, error: 'Only workspace owners/admins can modify workspace settings.' });
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
      return res.status(400).json({ success: false, error: 'Invalid workspace name.' });
    }
    updates.name = name.trim();
  }
  if (settings !== undefined) {
    if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
      return res.status(400).json({ success: false, error: 'Invalid settings payload.' });
    }
    const current = findWorkspaceById(workspaceId);
    updates.settings = { ...current?.settings, ...settings };
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, error: 'No valid fields to update.' });
  }

  const updated = updateWorkspace(workspaceId, updates);
  res.json({ success: true, workspace: updated });
});

// 5. GET WORKSPACE MEMBERS
saasRouter.get('/members', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  if (!workspaceId) {
    return res.status(400).json({ success: false, error: 'No workspace context.' });
  }
  const members = getWorkspaceMembers(workspaceId);
  res.json({ success: true, members });
});

// 6. INVITE MEMBER TO WORKSPACE
saasRouter.post('/members/invite', async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  const { email, role = 'viewer' } = req.body;

  // RBAC: only manager+ can invite; cannot invite owner role
  const inviterRole = getMemberRole(req.user?.id || '', workspaceId);
  if (!hasWorkspacePermission(inviterRole, 'manage_team')) {
    return res.status(403).json({ success: false, error: 'You do not have permission to invite members.' });
  }
  if (role === 'owner') {
    return res.status(403).json({ success: false, error: 'Ownership cannot be granted via invite.' });
  }
  const validRoles = ['manager', 'editor', 'publisher', 'analyst', 'viewer', 'admin', 'member'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ success: false, error: `Invalid role. Allowed: ${validRoles.join(', ')}` });
  }
  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, error: 'Valid email required for team invite.' });
  }

  const db = getDb();
  // Check if user already in platform
  const existingUser = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  // Real invitation: secure token (hash stored), 7-day expiry, pending until accepted
  const crypto = await import('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();

  // Duplicate pending-invite check
  const existingInvite = (db.workspaceInvitations || []).find(
    (i: any) => i.workspaceId === workspaceId && i.email === email.toLowerCase() && i.status === 'pending'
  );
  if (existingInvite) {
    return res.status(409).json({ success: false, error: 'A pending invitation already exists for this email.' });
  }
  // Already a member?
  if (existingUser) {
    const alreadyMember = db.workspaceMembers.some((m) => m.workspaceId === workspaceId && m.userId === existingUser.id);
    if (alreadyMember) return res.status(409).json({ success: false, error: 'User is already a workspace member.' });
  }

  const invitation = {
    id: `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    workspaceId,
    email: email.toLowerCase(),
    role,
    tokenHash,
    status: 'pending',
    invitedBy: req.user?.id || null,
    createdAt: new Date().toISOString(),
    expiresAt,
  };
  db.workspaceInvitations = [...(db.workspaceInvitations || []), invitation];
  saveDatabase(db);

  logAuditEvent({
    workspaceId,
    userId: req.user?.id,
    action: 'member_invited',
    details: `Invited ${email} as ${role} (expires ${expiresAt.slice(0, 10)}).`,
  });

  // No email provider configured — return invite link for manual sharing (honest)
  res.json({
    success: true,
    message: 'Invitation created. Email delivery is not configured — share the invite link manually.',
    invitationId: invitation.id,
    inviteToken: token, // returned once for link construction; only hash is stored
    expiresAt,
  });
});

// 7. UPGRADE SUBSCRIPTION — GOD-only until a real payment provider (Stripe)
// is integrated. Self-serve plan changes would bypass billing entirely.
saasRouter.post('/subscription/upgrade', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  const { plan, billingCycle = 'monthly' } = req.body as { plan: PlanTier; billingCycle: BillingCycle };

  const validPlans: PlanTier[] = ['free', 'starter', 'professional', 'enterprise'];
  if (!validPlans.includes(plan)) {
    return res.status(400).json({ success: false, error: 'Invalid subscription tier selected.' });
  }

  const updated = updateWorkspace(workspaceId!, { plan, billingCycle });

  logAuditEvent({
    workspaceId,
    userId: req.user?.id,
    action: 'subscription_upgraded',
    details: `Workspace upgraded to ${plan.toUpperCase()} tier (${billingCycle}).`,
  });

  res.json({
    success: true,
    message: `Plan upgraded to ${plan.toUpperCase()}! Your features and quotas are now active.`,
    workspace: updated,
  });
});

// Helper to calculate storage on disk
function getStorageStats() {
  const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
  const dbFile = path.resolve(process.cwd(), 'data', 'saas_db.json');
  let uploadFilesCount = 0;
  let uploadSizeBytes = 0;
  let dbSizeBytes = 0;

  if (fs.existsSync(uploadsDir)) {
    try {
      const files = fs.readdirSync(uploadsDir);
      uploadFilesCount = files.length;
      for (const file of files) {
        const stat = fs.statSync(path.join(uploadsDir, file));
        uploadSizeBytes += stat.size;
      }
    } catch {}
  }

  if (fs.existsSync(dbFile)) {
    try {
      dbSizeBytes = fs.statSync(dbFile).size;
    } catch {}
  }

  return {
    uploadFilesCount,
    uploadSizeBytes,
    uploadSizeMb: Math.round((uploadSizeBytes / (1024 * 1024)) * 100) / 100,
    dbSizeBytes,
    dbSizeKb: Math.round((dbSizeBytes / 1024) * 100) / 100,
  };
}

// 8. ADMIN & GOD OVERVIEW
saasRouter.get('/admin/overview', requireRole(['god', 'super_admin', 'platform_admin', 'admin']), (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const caller = req.user!;
  const isGod = caller.role === 'god' && caller.email.toLowerCase() === GOD_OWNER_EMAIL.toLowerCase();

  const totalUsers = db.users.length;
  const activeUsers = db.users.filter((u) => u.status === 'active').length;
  const suspendedUsers = db.users.filter((u) => u.status === 'suspended').length;
  const verifiedUsers = db.users.filter((u) => u.isEmailVerified).length;
  const totalWorkspaces = db.workspaces.length;
  const activeSessions = db.sessions.length;

  let totalVideos = 0;
  let totalPosts = 0;
  let totalAccounts = 0;

  Object.values(db.workspaceData).forEach((wsData) => {
    totalVideos += wsData.videos?.length || 0;
    totalPosts += wsData.posts?.length || 0;
    totalAccounts += wsData.accounts?.length || 0;
  });

  const recentLogs = getAuditLogs({ limit: 50 });
  const storage = getStorageStats();
  const settings = getSystemSettings();

  res.json({
    success: true,
    isGodOwner: isGod,
    primaryOwnerEmail: GOD_OWNER_EMAIL,
    callerRole: caller.role,
    overview: {
      totalUsers,
      activeUsers,
      suspendedUsers,
      verifiedUsers,
      totalWorkspaces,
      activeSessions,
      totalVideos,
      totalPosts,
      totalAccounts,
      systemUptime: process.uptime(),
      nodeVersion: process.version,
      storage,
      maintenanceMode: settings.maintenanceMode,
      activeAnnouncementsCount: settings.announcements.filter((a) => a.active).length,
    },
    systemSettings: settings,
    recentLogs,
  });
});

// 9. USER LIST (STRICT PRIVACY ENFORCED - ZERO PASSWORDS/HASHES/PRIVATE CONTENT EXPOSED)
saasRouter.get('/admin/users', requireRole(['god', 'super_admin', 'platform_admin', 'admin', 'support']), (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const caller = req.user!;

  // Map only administrative metadata - password hashes, salts, MFA secrets, and private workspaces are strictly omitted
  const safeUsers = db.users.map((u) => {
    const sanitized = sanitizeUserForClient(u);
    const workspaces = getUserWorkspaces(u.id);
    const isGod = u.email.toLowerCase() === GOD_OWNER_EMAIL.toLowerCase() || u.role === 'god';

    return {
      ...sanitized,
      isPrimaryOwner: isGod,
      workspaceCount: workspaces.length,
      primaryWorkspace: workspaces[0]?.name || 'Personal Workspace',
    };
  });

  res.json({
    success: true,
    users: safeUsers,
    callerRole: caller.role,
    privacyCertified: true,
    notice: 'Strict Privacy Protection: Passwords, credentials, and user private content are cryptographically protected.',
  });
});

// 10. TOGGLE USER STATUS (SUSPEND / REACTIVATE)
saasRouter.put('/admin/users/:id/status', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const targetId = req.params.id;
  const { status } = req.body;
  const caller = req.user!;
  const db = getDb();

  const targetUser = db.users.find((u) => u.id === targetId);
  if (!targetUser) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  // Prevent modifying the GOD Primary Owner
  if (targetUser.email.toLowerCase() === GOD_OWNER_EMAIL.toLowerCase() || targetUser.role === 'god') {
    return res.status(403).json({
      success: false,
      error: 'CRITICAL ACCESS VIOLATION: The Primary GOD Owner account cannot be suspended or restricted under any circumstances.',
    });
  }

  // Prevent suspending oneself
  if (targetId === caller.id) {
    return res.status(400).json({ success: false, error: 'You cannot suspend your own administrative account.' });
  }

  // Hierarchy enforcement: caller must outrank target (unless caller is GOD)
  const callerLevel = ROLE_HIERARCHY[caller.role] ?? 0;
  const targetLevel = ROLE_HIERARCHY[targetUser.role] ?? 0;
  if (caller.role !== 'god' && callerLevel <= targetLevel) {
    return res.status(403).json({
      success: false,
      error: 'Hierarchy Violation: You cannot modify an administrator of equal or higher rank.',
    });
  }

  if (status !== 'active' && status !== 'suspended') {
    return res.status(400).json({ success: false, error: 'Status must be active or suspended.' });
  }

  const updated = updateUser(targetId, { status });

  logAuditEvent({
    userId: caller.id,
    userEmail: caller.email,
    action: status === 'suspended' ? 'admin_user_suspended' : 'admin_user_reactivated',
    details: `${caller.role.toUpperCase()} ${caller.email} changed user ${targetUser.email} status to ${status}.`,
    ip: req.socket.remoteAddress,
  });

  res.json({ success: true, message: `User status changed to ${status}.`, user: sanitizeUserForClient(updated!) });
});

// 11. CHANGE USER ROLE (RBAC WITH GOD & SUPER ADMIN RESTRICTIONS)
saasRouter.put('/admin/users/:id/role', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const targetId = req.params.id;
  const { role } = req.body as { role: UserRole };
  const caller = req.user!;
  const db = getDb();

  const targetUser = db.users.find((u) => u.id === targetId);
  if (!targetUser) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  // 1. Target cannot be GOD Primary Owner
  if (targetUser.email.toLowerCase() === GOD_OWNER_EMAIL.toLowerCase() || targetUser.role === 'god') {
    return res.status(403).json({
      success: false,
      error: 'CRITICAL ACCESS VIOLATION: The Primary GOD Owner role cannot be demoted, modified, or revoked.',
    });
  }

  // 2. Disallow assigning the 'god' role to anyone else
  if (role === 'god') {
    return res.status(403).json({
      success: false,
      error: 'RESTRICTED: The GOD role is permanently reserved for the Primary Owner (saidreda2810@gmail.com).',
    });
  }

  const validRoles: UserRole[] = ['super_admin', 'admin', 'moderator', 'support', 'user', 'platform_admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ success: false, error: `Invalid role specified. Valid roles: ${validRoles.join(', ')}` });
  }

  const callerLevel = ROLE_HIERARCHY[caller.role] ?? 0;
  const targetLevel = ROLE_HIERARCHY[targetUser.role] ?? 0;
  const targetAssignLevel = ROLE_HIERARCHY[role] ?? 0;

  // 3. Only GOD can promote to or demote a super_admin
  if ((role === 'super_admin' || targetUser.role === 'super_admin') && caller.role !== 'god') {
    return res.status(403).json({
      success: false,
      error: 'RESTRICTED: Only the Primary Owner (GOD) has authority to appoint or modify Super Administrators.',
    });
  }

  // 4. Caller cannot elevate someone to equal or higher than their own level
  if (caller.role !== 'god' && (targetAssignLevel >= callerLevel || targetLevel >= callerLevel)) {
    return res.status(403).json({
      success: false,
      error: 'Hierarchy Violation: You cannot assign roles equal to or exceeding your administrative authority.',
    });
  }

  const updated = updateUser(targetId, { role });

  logAuditEvent({
    userId: caller.id,
    userEmail: caller.email,
    action: 'admin_role_changed',
    details: `${caller.role.toUpperCase()} ${caller.email} updated role of ${targetUser.email} to ${role.toUpperCase()}.`,
    ip: req.socket.remoteAddress,
  });

  res.json({ success: true, message: `User role updated to ${role}.`, user: sanitizeUserForClient(updated!) });
});

saasRouter.delete('/admin/users/:id/sessions', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const targetId = req.params.id;
  const caller = req.user!;
  const db = getDb();
  const target = db.users.find((u) => u.id === targetId);
  if (!target) return res.status(404).json({ success: false, error: 'User not found.' });
  if (target.id === caller.id) return res.status(400).json({ success: false, error: 'Cannot revoke your own sessions here.' });
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => s.userId !== targetId);
  saveDatabase(db);
  logAuditEvent({
    userId: caller.id,
    userEmail: caller.email,
    action: 'admin_sessions_revoked_all',
    details: `Revoked ${before - db.sessions.length} session(s) for user ${target.email}.`,
    ip: req.socket.remoteAddress,
  });
  res.json({ success: true, revoked: before - db.sessions.length });
});

// 12. DELETE USER ACCOUNT (ADMIN / GOD INITIATED)
saasRouter.delete('/admin/users/:id', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const targetId = req.params.id;
  const caller = req.user!;
  const db = getDb();

  const targetUser = db.users.find((u) => u.id === targetId);
  if (!targetUser) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  // Protect Primary GOD Owner
  if (targetUser.email.toLowerCase() === GOD_OWNER_EMAIL.toLowerCase() || targetUser.role === 'god') {
    return res.status(403).json({
      success: false,
      error: 'CRITICAL ACCESS VIOLATION: The Primary GOD Owner account cannot be deleted.',
    });
  }

  if (targetId === caller.id) {
    return res.status(400).json({ success: false, error: 'You cannot delete your own administrative account via this endpoint.' });
  }

  const result = deleteUser(targetId);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }

  logAuditEvent({
    userId: caller.id,
    userEmail: caller.email,
    action: 'admin_user_deleted',
    details: `${caller.role.toUpperCase()} ${caller.email} permanently deleted account ${targetUser.email} and its owned workspaces.`,
    ip: req.socket.remoteAddress,
  });

  res.json({ success: true, message: `Account for ${targetUser.email} has been permanently deleted.` });
});

// 13. SYSTEM SETTINGS (GET & UPDATE)
saasRouter.get('/admin/system-settings', requireRole(['god', 'super_admin', 'platform_admin', 'admin']), (req: AuthenticatedRequest, res: Response) => {
  const settings = getSystemSettings();
  res.json({ success: true, systemSettings: settings });
});

saasRouter.put('/admin/system-settings', requireRole(['god', 'super_admin', 'platform_admin']), (req: AuthenticatedRequest, res: Response) => {
  const updates = req.body;
  const caller = req.user!;

  // Maintenance mode is Primary-Owner-only per governance spec
  if (updates.maintenanceMode !== undefined && caller.role !== 'god') {
    return res.status(403).json({ success: false, error: 'Only the Primary GOD Owner can toggle maintenance mode.' });
  }

  const updated = updateSystemSettings(updates);

  logAuditEvent({
    userId: caller.id,
    userEmail: caller.email,
    action: 'system_settings_updated',
    details: `${caller.role.toUpperCase()} ${caller.email} updated system configuration (Maintenance: ${updated.maintenanceMode}).`,
    ip: req.socket.remoteAddress,
  });

  res.json({ success: true, systemSettings: updated, message: 'System configurations updated successfully.' });
});

// 14. ANNOUNCEMENT MANAGEMENT
saasRouter.post('/admin/announcements', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const { title, message, type = 'info' } = req.body;
  const caller = req.user!;

  if (!title || !message) {
    return res.status(400).json({ success: false, error: 'Title and message are required for announcements.' });
  }

  const ann = addAnnouncement({
    title: title.trim(),
    message: message.trim(),
    type,
    active: true,
    createdBy: caller.email,
  });

  logAuditEvent({
    userId: caller.id,
    userEmail: caller.email,
    action: 'announcement_created',
    details: `Created system announcement: "${title}"`,
    ip: req.socket.remoteAddress,
  });

  res.status(201).json({ success: true, announcement: ann });
});

saasRouter.delete('/admin/announcements/:id', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const annId = req.params.id;
  const caller = req.user!;

  const removed = removeAnnouncement(annId);
  if (!removed) {
    return res.status(404).json({ success: false, error: 'Announcement not found.' });
  }

  logAuditEvent({
    userId: caller.id,
    userEmail: caller.email,
    action: 'announcement_deleted',
    details: `Deleted announcement ${annId}`,
    ip: req.socket.remoteAddress,
  });

  res.json({ success: true, message: 'Announcement deleted.' });
});

// 15. ACTIVE SESSION GOVERNANCE
saasRouter.get('/admin/sessions', requireRole(['god', 'super_admin', 'platform_admin', 'admin']), (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const sessions = db.sessions.map((s) => {
    const user = db.users.find((u) => u.id === s.userId);
    return {
      id: s.id,
      userId: s.userId,
      maskedToken: `${s.token.slice(0, 6)}...${s.token.slice(-6)}`,
      ip: s.ip || 'Unknown IP',
      userAgent: s.userAgent || 'Unknown Agent',
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      user: user ? sanitizeUserForClient(user) : null,
    };
  });

  res.json({ success: true, sessions });
});

saasRouter.delete('/admin/sessions/:id', requireRole(['god', 'super_admin', 'platform_admin']), (req: AuthenticatedRequest, res: Response) => {
  const sessionId = req.params.id;
  const caller = req.user!;
  const db = getDb();

  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found.' });
  }

  db.sessions = db.sessions.filter((s) => s.id !== sessionId);
  saveDatabase(db);

  logAuditEvent({
    userId: caller.id,
    userEmail: caller.email,
    action: 'admin_session_revoked',
    details: `Administrative revocation of session ${sessionId} for user ID ${session.userId}.`,
    ip: req.socket.remoteAddress,
  });

  res.json({ success: true, message: 'Session successfully terminated.' });
});

// 16. AUDIT LOGS QUERY
saasRouter.get('/admin/audit-logs', requireRole(['god', 'super_admin', 'platform_admin', 'admin']), (req: AuthenticatedRequest, res: Response) => {
  const { action, userId, workspaceId, from, to, limit } = req.query;
  let logs = getAuditLogs({ limit: Math.min(Number(limit) || 200, 1000) });
  if (action) logs = logs.filter((l: any) => l.action === action);
  if (userId) logs = logs.filter((l: any) => l.userId === userId);
  if (workspaceId) logs = logs.filter((l: any) => l.workspaceId === workspaceId);
  if (from) logs = logs.filter((l: any) => new Date(l.timestamp) >= new Date(String(from)));
  if (to) logs = logs.filter((l: any) => new Date(l.timestamp) <= new Date(String(to)));
  res.json({ success: true, logs, total: logs.length });
});

// GOD-only audit export (JSON download)
saasRouter.get('/admin/audit-logs/export', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const { action, from, to } = req.query;
  let logs = getAuditLogs({ limit: 5000 });
  if (action) logs = logs.filter((l: any) => l.action === action);
  if (from) logs = logs.filter((l: any) => new Date(l.timestamp) >= new Date(String(from)));
  if (to) logs = logs.filter((l: any) => new Date(l.timestamp) <= new Date(String(to)));
  logAuditEvent({
    userId: req.user?.id, userEmail: req.user?.email,
    action: 'audit_log_exported',
    details: `Exported ${logs.length} audit records`,
    ip: req.socket.remoteAddress,
  });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.json"`);
  res.send(JSON.stringify({ exportedAt: new Date().toISOString(), count: logs.length, logs }, null, 2));
});

// 17. STORAGE METRICS
saasRouter.get('/admin/storage-metrics', requireRole(['god', 'super_admin', 'platform_admin', 'admin']), (req: AuthenticatedRequest, res: Response) => {
  const storage = getStorageStats();
  res.json({ success: true, storage });
});

// ---- Video Upload & Storage policy (platform admin only to modify) ----
import {
  getUploadPolicy, updateUploadPolicy, planLimitBytes,
  listActiveSessions,
} from './uploadPolicy.ts';

saasRouter.get('/admin/upload-policy', requireRole(['god', 'super_admin', 'platform_admin']), (req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, policy: getUploadPolicy() });
});

saasRouter.put('/admin/upload-policy', requireRole(['god', 'super_admin', 'platform_admin']), (req: AuthenticatedRequest, res: Response) => {
  const result = updateUploadPolicy(req.body || {});
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });
  logAuditEvent({
    userId: req.user!.id, userEmail: req.user!.email,
    action: 'upload_policy_updated',
    details: `Upload policy updated by ${req.user!.email}: ${JSON.stringify(req.body)}`,
    ip: req.socket.remoteAddress,
  });
  res.json({ success: true, policy: result.policy });
});

saasRouter.get('/admin/storage-details', requireRole(['god', 'super_admin', 'platform_admin', 'admin']), (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const catalogPath = path.resolve(process.cwd(), 'data', 'media_catalog.json');
  let catalog: any[] = [];
  try { catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8')); } catch {}

  // Per-workspace usage
  const byWorkspace = new Map<string, { bytes: number; videos: number }>();
  for (const m of catalog) {
    const cur = byWorkspace.get(m.workspaceId) || { bytes: 0, videos: 0 };
    cur.bytes += m.sizeBytes || 0;
    if ((m.mimeType || '').startsWith('video/')) cur.videos++;
    byWorkspace.set(m.workspaceId, cur);
  }
  const workspaces = db.workspaces.map((w) => {
    const usage = byWorkspace.get(w.id) || { bytes: 0, videos: 0 };
    return {
      workspaceId: w.id,
      name: w.name,
      plan: w.plan,
      usedBytes: usage.bytes,
      videoCount: usage.videos,
      maxFileBytes: planLimitBytes(w.plan),
      quotaBytes: getUploadPolicy().workspaceQuotaBytes || null,
    };
  }).sort((a, b) => b.usedBytes - a.usedBytes);

  const largest = [...catalog]
    .filter((m) => (m.mimeType || '').startsWith('video/'))
    .sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0))
    .slice(0, 10)
    .map((m) => ({ id: m.id, name: m.originalName, sizeBytes: m.sizeBytes, workspaceId: m.workspaceId, createdAt: m.createdAt }));

  const sessions = listActiveSessions().map((s) => ({
    id: s.id, filename: s.filename, sizeBytes: s.sizeBytes,
    receivedChunks: s.received.length, totalChunks: s.totalChunks,
    workspaceId: s.workspaceId, ageMinutes: Math.round((Date.now() - s.createdAt) / 60000),
  }));

  res.json({
    success: true,
    totalBytes: catalog.reduce((s: number, m: any) => s + (m.sizeBytes || 0), 0),
    totalFiles: catalog.length,
    workspaces,
    largestVideos: largest,
    activeUploadSessions: sessions,
    policy: getUploadPolicy(),
  });
});

// Helper: social accounts scoped to the caller's active workspace brands.
// OAuth records are keyed by brandId; workspace isolation is enforced here,
// never trusted from the client.
function getScopedSocialAccounts(workspaceId: string | undefined) {
  if (!workspaceId) return { accounts: [] as any[], brandIds: new Set<string>() };
  const wsData = getWorkspaceData(workspaceId);
  const brands = wsData.brands || [];
  const brandIds = new Set<string>(brands.map((b: any) => b.id).filter(Boolean));
  const accounts = getAllAccounts()
    .filter((a) => brandIds.has(a.brandId))
    .map((acc) => {
      const { accessTokenEncrypted, refreshTokenEncrypted, ...safe } = acc;
      const channels = (safe.channels || []).map((ch: any) => {
        const { pageAccessToken, ...chSafe } = ch;
        return chSafe;
      });
      return { ...safe, channels };
    });
  return { accounts, brandIds };
}

function oauthProviderStatus() {
  const config = getOAuthConfig();
  return {
    youtube: Boolean(config.googleClientId && config.googleClientSecret),
    facebook: Boolean(config.metaAppId && config.metaAppSecret),
    instagram: Boolean(config.metaAppId && config.metaAppSecret),
    tiktok: Boolean(config.tiktokClientKey && config.tiktokClientSecret),
  };
}

// 19. ACCOUNT OVERVIEW (real aggregated account data for the profile page)
saasRouter.get('/account-overview', (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workspace = req.workspace;
  const db = getDb();

  const wsData = workspace ? getWorkspaceData(workspace.id) : null;
  const { accounts: socialAccounts } = getScopedSocialAccounts(workspace?.id);

  const memberRole = getMemberRole(user.id, workspace?.id);
  const memberRecord = workspace
    ? db.workspaceMembers.find((m) => m.workspaceId === workspace.id && m.userId === user.id)
    : undefined;

  const ownerUser = workspace ? db.users.find((u) => u.id === workspace.ownerId) : undefined;

  const videosCount = wsData?.videos?.length || 0;
  const scheduledPostsCount = (wsData?.posts || []).filter((p: any) => p.status === 'scheduled').length;
  const connectedAccountsCount = socialAccounts.filter(
    (a: any) => a.connectionStatus === 'connected' || a.connectionStatus === 'permission_incomplete'
  ).length;
  const activeSessionsCount = db.sessions.filter(
    (s) => s.userId === user.id && new Date(s.expiresAt) > new Date()
  ).length;

  const storage = getStorageStats();

  res.json({
    success: true,
    user: sanitizeUserForClient(user),
    workspace,
    workspaces: getUserWorkspaces(user.id),
    memberRole: memberRole || null,
    joinedAt: memberRecord?.joinedAt || null,
    workspaceOwner: ownerUser
      ? { fullName: ownerUser.fullName, email: ownerUser.email }
      : null,
    usage: {
      videosStored: videosCount,
      scheduledPosts: scheduledPostsCount,
      connectedSocialAccounts: connectedAccountsCount,
      activeSessions: activeSessionsCount,
      maxDailyPosts: workspace?.settings?.maxDailyPosts ?? null,
      storageUsedMb: storage.uploadSizeMb,
      plan: workspace?.plan || 'free',
      billingCycle: workspace?.billingCycle || 'monthly',
    },
    socialAccounts,
    oauthProviders: oauthProviderStatus(),
  });
});

// 20. SCOPED SOCIAL ACCOUNTS (workspace-isolated; tokens never exposed)
saasRouter.get('/social-accounts', (req: AuthenticatedRequest, res: Response) => {
  const { accounts } = getScopedSocialAccounts(req.workspace?.id);
  res.json({ success: true, accounts, oauthProviders: oauthProviderStatus() });
});

// 21. DISCONNECT SCOPED SOCIAL ACCOUNT (ownership verified server-side)
saasRouter.delete('/social-accounts/:id', async (req: AuthenticatedRequest, res: Response) => {
  const accountId = req.params.id;
  const { accounts, brandIds } = getScopedSocialAccounts(req.workspace?.id);
  const account = accounts.find((a: any) => a.id === accountId);

  if (!account || !brandIds.has(account.brandId)) {
    return res.status(404).json({ success: false, error: 'Social account not found in this workspace.' });
  }

  // Best-effort token revocation where the provider supports it
  const raw = getAllAccounts().find((a) => a.id === accountId);
  const token = raw ? decryptToken(raw.accessTokenEncrypted || '') : '';
  if (token && account.provider === 'youtube') {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' });
    } catch (e) {
      console.warn('OAuth token revocation failed:', e);
    }
  }

  removeAccount(accountId);

  logAuditEvent({
    workspaceId: req.workspace?.id,
    userId: req.user?.id,
    userEmail: req.user?.email,
    action: 'social_account_disconnected',
    details: `Disconnected ${account.provider} account "${account.accountName}".`,
  });

  res.json({ success: true, message: `Account ${account.accountName} disconnected and credentials deleted.` });
});

// 18. DELETE ACCOUNT (SELF-SERVICE, PASSWORD CONFIRMED, GOD OWNER IMMUNITY)
saasRouter.delete('/account', async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { password } = req.body || {};

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: 'Password confirmation is required to delete your account.' });
  }

  if (!verifyPassword(password, user.salt, user.passwordHash)) {
    return res.status(401).json({ success: false, error: 'Incorrect password. Account was not deleted.' });
  }

  if (user.email.toLowerCase() === GOD_OWNER_EMAIL.toLowerCase() || user.role === 'god') {
    return res.status(403).json({
      success: false,
      error: 'CRITICAL ACCESS VIOLATION: The Primary GOD Owner account cannot be deleted.',
    });
  }

  // Clean up OAuth connections belonging to this user's owned workspaces
  try {
    const db = getDb();
    const ownedWorkspaceIds = db.workspaceMembers
      .filter((m) => m.userId === user.id && m.role === 'owner')
      .map((m) => m.workspaceId);
    const brandIds = new Set<string>();
    ownedWorkspaceIds.forEach((wsId) => {
      const wsData = getWorkspaceData(wsId);
      (wsData.brands || []).forEach((b: any) => b.id && brandIds.add(b.id));
    });
    for (const acc of getAllAccounts()) {
      if (brandIds.has(acc.brandId)) {
        const token = decryptToken(acc.accessTokenEncrypted || '');
        if (token && acc.provider === 'youtube') {
          try {
            await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' });
          } catch {}
        }
        removeAccount(acc.id);
      }
    }
  } catch (e) {
    console.warn('OAuth cleanup during account deletion failed:', e);
  }

  const result = deleteUser(user.id);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }

  res.setHeader(
    'Set-Cookie',
    'sra_session=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0'
  );

  res.json({ success: true, message: 'Account, workspaces, and connected platform credentials deleted.' });
});

// ===================== AUTOMATION WORKFLOWS =====================
// Persistent workflow definitions + execution records, workspace-scoped.

const validWorkflowStatus = new Set(['draft', 'active', 'paused', 'disabled', 'archived']);

saasRouter.get('/automations/workflows', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const data = getWorkspaceData(wsId);
  res.json({ success: true, workflows: data.automationWorkflows || [] });
});

saasRouter.post('/automations/workflows', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const { name, description, brandId, projectId, trigger, steps, status } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ success: false, error: 'Workflow name is required' });
  if (status && !validWorkflowStatus.has(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
  const data = getWorkspaceData(wsId);
  const workflows = data.automationWorkflows || [];
  const wf = {
    id: `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: String(name).trim(),
    description: description || '',
    brandId: brandId || null,
    projectId: projectId || null,
    status: status || 'draft',
    trigger: trigger || null,
    steps: Array.isArray(steps) ? steps : [],
    version: 1,
    createdBy: req.user?.id || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastExecutionAt: null,
    lastExecutionStatus: null,
  };
  saveWorkspaceData(wsId, { ...data, automationWorkflows: [...workflows, wf] });
  res.json({ success: true, workflow: wf });
});

saasRouter.patch('/automations/workflows/:id', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const data = getWorkspaceData(wsId);
  const workflows = data.automationWorkflows || [];
  const idx = workflows.findIndex((w: any) => w.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Workflow not found' });
  const { status, name, description, brandId, projectId, trigger, steps } = req.body || {};
  if (status && !validWorkflowStatus.has(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
  const updated = {
    ...workflows[idx],
    ...(name !== undefined ? { name: String(name).trim() } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(brandId !== undefined ? { brandId } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    ...(trigger !== undefined ? { trigger } : {}),
    ...(steps !== undefined ? { steps: Array.isArray(steps) ? steps : [] } : {}),
    ...(status !== undefined ? { status } : {}),
    updatedAt: new Date().toISOString(),
  };
  // Version bump when configuration changes
  if (trigger !== undefined || steps !== undefined) updated.version = (workflows[idx].version || 1) + 1;
  const next = [...workflows];
  next[idx] = updated;
  saveWorkspaceData(wsId, { ...data, automationWorkflows: next });
  res.json({ success: true, workflow: updated });
});

saasRouter.delete('/automations/workflows/:id', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const data = getWorkspaceData(wsId);
  const workflows = data.automationWorkflows || [];
  const idx = workflows.findIndex((w: any) => w.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Workflow not found' });
  const next = [...workflows];
  next.splice(idx, 1);
  saveWorkspaceData(wsId, { ...data, automationWorkflows: next });
  res.json({ success: true });
});

saasRouter.post('/automations/workflows/:id/duplicate', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const data = getWorkspaceData(wsId);
  const workflows = data.automationWorkflows || [];
  const src = workflows.find((w: any) => w.id === req.params.id);
  if (!src) return res.status(404).json({ success: false, error: 'Workflow not found' });
  const copy = {
    ...src,
    id: `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: `${src.name} (copy)`,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastExecutionAt: null,
    lastExecutionStatus: null,
  };
  saveWorkspaceData(wsId, { ...data, automationWorkflows: [...workflows, copy] });
  res.json({ success: true, workflow: copy });
});

saasRouter.get('/automations/executions', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const data = getWorkspaceData(wsId);
  const { workflowId, status, limit } = req.query;
  let execs = data.automationExecutions || [];
  if (workflowId) execs = execs.filter((e: any) => e.workflowId === workflowId);
  if (status) execs = execs.filter((e: any) => e.status === status);
  execs = [...execs].sort((a: any, b: any) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  const lim = Math.min(Number(limit) || 100, 500);
  res.json({ success: true, executions: execs.slice(0, lim) });
});

saasRouter.post('/automations/executions', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const { workflowId, workflowVersion, triggerEvent, status, steps } = req.body || {};
  if (!workflowId) return res.status(400).json({ success: false, error: 'workflowId required' });
  const data = getWorkspaceData(wsId);
  const exec = {
    id: `ex_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    workflowId,
    workflowVersion: workflowVersion || null,
    triggerEvent: triggerEvent || null,
    status: status || 'queued',
    steps: Array.isArray(steps) ? steps : [],
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    error: null,
  };
  const execs = data.automationExecutions || [];
  saveWorkspaceData(wsId, { ...data, automationExecutions: [...execs, exec] });
  res.json({ success: true, execution: exec });
});

saasRouter.post('/automations/workflows/:id/run', async (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const { runWorkflowNow } = await import('./automationEngine.ts');
  const result = await runWorkflowNow(wsId, req.params.id);
  if (!result.success) return res.status(404).json({ success: false, error: result.error });
  res.json({ success: true });
});

// ---- Phase 6: approvals + analytics + limits ----
saasRouter.get('/automations/approvals', async (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const { loadApprovals } = await import('./automationEngine.ts');
  const all = loadApprovals().filter((a: any) => a.workspaceId === wsId);
  res.json({ success: true, approvals: all });
});

saasRouter.post('/automations/approvals/:id/resolve', async (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const { decision } = req.body || {};
  if (!['approved', 'rejected', 'changes_requested'].includes(decision)) {
    return res.status(400).json({ success: false, error: 'Invalid decision' });
  }
  const { loadApprovals, saveApprovals } = await import('./automationEngine.ts');
  const approvals = loadApprovals();
  const idx = approvals.findIndex((a: any) => a.id === req.params.id && a.workspaceId === wsId);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Approval not found' });
  approvals[idx] = { ...approvals[idx], status: decision === 'approved' ? 'approved' : 'rejected', decision, resolvedAt: new Date().toISOString(), resolvedBy: req.user?.id || null };
  saveApprovals(approvals);
  res.json({ success: true, approval: approvals[idx] });
});

saasRouter.get('/automations/analytics', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const data = getWorkspaceData(wsId);
  const execs = data.automationExecutions || [];
  const now = Date.now();
  const day = 86400000;
  const stats = {
    total: execs.length,
    last24h: execs.filter((e: any) => now - new Date(e.startedAt).getTime() < day).length,
    completed: execs.filter((e: any) => e.status === 'completed').length,
    failed: execs.filter((e: any) => e.status === 'failed').length,
    running: execs.filter((e: any) => e.status === 'running' || e.status === 'queued').length,
    waitingApproval: execs.filter((e: any) => e.status === 'waiting_approval').length,
    avgDurationMs: execs.filter((e: any) => e.durationMs).reduce((s: number, e: any) => s + e.durationMs, 0) / Math.max(1, execs.filter((e: any) => e.durationMs).length),
    byStatus: execs.reduce((m: any, e: any) => { m[e.status] = (m[e.status] || 0) + 1; return m; }, {}),
    topWorkflows: Object.entries(execs.reduce((m: any, e: any) => { m[e.workflowId] = (m[e.workflowId] || 0) + 1; return m; }, {})).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5),
  };
  res.json({ success: true, analytics: stats });
});

// ---- Invitations: list, revoke, accept ----
saasRouter.get('/members/invitations', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const db = getDb();
  const invs = (db.workspaceInvitations || [])
    .filter((i: any) => i.workspaceId === workspaceId)
    .map((i: any) => ({ id: i.id, email: i.email, role: i.role, status: i.status, expiresAt: i.expiresAt, createdAt: i.createdAt }));
  res.json({ success: true, invitations: invs });
});

saasRouter.post('/members/invitations/:id/revoke', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const inviterRole = getMemberRole(req.user?.id || '', workspaceId);
  if (!hasWorkspacePermission(inviterRole, 'manage_team')) return res.status(403).json({ success: false, error: 'No permission' });
  const db = getDb();
  const inv = (db.workspaceInvitations || []).find((i: any) => i.id === req.params.id && i.workspaceId === workspaceId);
  if (!inv) return res.status(404).json({ success: false, error: 'Invitation not found' });
  if (inv.status !== 'pending') return res.status(400).json({ success: false, error: 'Only pending invitations can be revoked' });
  inv.status = 'revoked';
  saveDatabase(db);
  res.json({ success: true });
});

saasRouter.post('/members/invitations/accept', async (req: AuthenticatedRequest, res: Response) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ success: false, error: 'Token required' });
  const crypto = await import('crypto');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const db = getDb();
  const inv = (db.workspaceInvitations || []).find((i: any) => i.tokenHash === tokenHash);
  if (!inv) return res.status(404).json({ success: false, error: 'Invalid invitation token' });
  if (inv.status !== 'pending') return res.status(400).json({ success: false, error: `Invitation is ${inv.status}` });
  if (new Date(inv.expiresAt) < new Date()) {
    inv.status = 'expired';
    saveDatabase(db);
    return res.status(400).json({ success: false, error: 'Invitation has expired' });
  }
  // Verify accepting user's email matches invitation
  const user = db.users.find((u: any) => u.id === req.user?.id);
  if (!user || user.email.toLowerCase() !== inv.email.toLowerCase()) {
    return res.status(403).json({ success: false, error: 'This invitation was sent to a different email address' });
  }
  // Create membership
  const alreadyMember = db.workspaceMembers.some((m: any) => m.workspaceId === inv.workspaceId && m.userId === user.id);
  if (!alreadyMember) {
    db.workspaceMembers.push({
      id: `mem_${Date.now().toString(36)}`,
      workspaceId: inv.workspaceId,
      userId: user.id,
      role: inv.role,
      joinedAt: new Date().toISOString(),
      invitedBy: inv.invitedBy,
    });
  }
  inv.status = 'accepted';
  inv.acceptedAt = new Date().toISOString();
  saveDatabase(db);
  logAuditEvent({ workspaceId: inv.workspaceId, userId: user.id, action: 'member_invite_accepted', details: `Accepted invite as ${inv.role}.` });
  res.json({ success: true, workspaceId: inv.workspaceId });
});

// ---- Member management: role change, suspend, remove ----
saasRouter.patch('/members/:id', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const actorRole = getMemberRole(req.user?.id || '', workspaceId);
  if (!hasWorkspacePermission(actorRole, 'manage_team')) return res.status(403).json({ success: false, error: 'No permission to manage members' });

  const db = getDb();
  const member = db.workspaceMembers.find((m: any) => m.id === req.params.id && m.workspaceId === workspaceId);
  if (!member) return res.status(404).json({ success: false, error: 'Member not found' });

  const { role, status } = req.body || {};
  const targetIsOwner = member.role === 'owner';

  // Owner protection: cannot modify owner's role/status
  if (targetIsOwner && (role || status)) {
    return res.status(403).json({ success: false, error: 'Owner membership cannot be modified. Transfer ownership first.' });
  }
  if (role) {
    const validRoles = ['manager', 'editor', 'publisher', 'analyst', 'viewer'];
    if (!validRoles.includes(role)) return res.status(400).json({ success: false, error: 'Invalid role' });
    member.role = role;
  }
  if (status) {
    if (!['active', 'suspended'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    member.status = status;
  }
  saveDatabase(db);
  logAuditEvent({ workspaceId, userId: req.user?.id, action: 'member_updated', details: `Member ${member.userId} updated: ${JSON.stringify({ role, status })}` });
  res.json({ success: true, member });
});

saasRouter.delete('/members/:id', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const actorRole = getMemberRole(req.user?.id || '', workspaceId);
  if (!hasWorkspacePermission(actorRole, 'manage_team')) return res.status(403).json({ success: false, error: 'No permission to remove members' });

  const db = getDb();
  const member = db.workspaceMembers.find((m: any) => m.id === req.params.id && m.workspaceId === workspaceId);
  if (!member) return res.status(404).json({ success: false, error: 'Member not found' });
  if (member.role === 'owner') {
    // Last-owner protection
    const owners = db.workspaceMembers.filter((m: any) => m.workspaceId === workspaceId && m.role === 'owner');
    if (owners.length <= 1) return res.status(403).json({ success: false, error: 'Cannot remove the last workspace owner' });
    return res.status(403).json({ success: false, error: 'Owner must transfer ownership before removal' });
  }
  db.workspaceMembers = db.workspaceMembers.filter((m: any) => m.id !== req.params.id);
  saveDatabase(db);
  logAuditEvent({ workspaceId, userId: req.user?.id, action: 'member_removed', details: `Removed member ${member.userId} (${member.role})` });
  res.json({ success: true });
});

// ---- Ownership transfer ----
saasRouter.post('/workspaces/transfer-ownership', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const actorRole = getMemberRole(req.user?.id || '', workspaceId);
  if (actorRole !== 'owner') return res.status(403).json({ success: false, error: 'Only the owner can transfer ownership' });

  const { memberId, confirm } = req.body || {};
  if (confirm !== true) return res.status(400).json({ success: false, error: 'Explicit confirmation required' });
  if (!memberId) return res.status(400).json({ success: false, error: 'memberId required' });

  const db = getDb();
  const target = db.workspaceMembers.find((m: any) => m.id === memberId && m.workspaceId === workspaceId);
  if (!target) return res.status(404).json({ success: false, error: 'Member not found' });
  if (target.userId === req.user?.id) return res.status(400).json({ success: false, error: 'Already the owner' });
  if (target.status && target.status !== 'active') return res.status(400).json({ success: false, error: 'Target member is not active' });

  // Atomic swap: current owner → manager, target → owner
  const currentOwner = db.workspaceMembers.find((m: any) => m.workspaceId === workspaceId && m.userId === req.user?.id && m.role === 'owner');
  if (currentOwner) currentOwner.role = 'manager';
  target.role = 'owner';
  saveDatabase(db);
  logAuditEvent({ workspaceId, userId: req.user?.id, action: 'ownership_transferred', details: `Ownership transferred to ${target.userId}` });
  res.json({ success: true });
});

// ---- Custom roles + suspend/reactivate + audit ----
saasRouter.get('/roles', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const data = getWorkspaceData(wsId);
  const builtins = ['owner','manager','editor','publisher','analyst','viewer'].map((r) => ({ id: r, name: r, builtin: true }));
  res.json({ success: true, roles: [...builtins, ...(data.customRoles || [])] });
});

saasRouter.post('/roles', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const actorRole = getMemberRole(req.user?.id || '', wsId);
  if (!hasWorkspacePermission(actorRole, 'manage_team')) return res.status(403).json({ success: false, error: 'No permission' });
  const { name, description, baseRole } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ success: false, error: 'Role name required' });
  const data = getWorkspaceData(wsId);
  const roles = data.customRoles || [];
  if (roles.length >= 10) return res.status(400).json({ success: false, error: 'Custom role limit reached (10)' });
  const role = { id: `role_${Date.now().toString(36)}`, name: String(name).trim(), description: description || '', baseRole: baseRole || 'viewer', builtin: false, createdAt: new Date().toISOString() };
  data.customRoles = [...roles, role];
  saveWorkspaceData(wsId, data);
  res.json({ success: true, role });
});

saasRouter.delete('/roles/:id', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const actorRole = getMemberRole(req.user?.id || '', wsId);
  if (!hasWorkspacePermission(actorRole, 'manage_team')) return res.status(403).json({ success: false, error: 'No permission' });
  const data = getWorkspaceData(wsId);
  const roles = data.customRoles || [];
  const idx = roles.findIndex((r: any) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Role not found' });
  // Check if assigned to any member
  const db = getDb();
  const inUse = db.workspaceMembers.some((m: any) => m.workspaceId === wsId && (m as any).customRoleId === req.params.id);
  if (inUse) return res.status(400).json({ success: false, error: 'Role is assigned to members — reassign first' });
  data.customRoles = roles.filter((_: any, i: number) => i !== idx);
  saveWorkspaceData(wsId, data);
  res.json({ success: true });
});

saasRouter.get('/audit-logs', (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  if (!wsId) return res.status(400).json({ success: false, error: 'Workspace required' });
  const actorRole = getMemberRole(req.user?.id || '', wsId);
  if (!hasWorkspacePermission(actorRole, 'view')) return res.status(403).json({ success: false, error: 'No permission' });
  const { action, limit } = req.query;
  let logs = getAuditLogs({ workspaceId: wsId, limit: Number(limit) || 100 });
  if (action) logs = logs.filter((l: any) => l.action === action);
  res.json({ success: true, logs: logs.slice(0, Math.min(Number(limit) || 100, 500)) });
});

// ---- Security Center overview (GOD-only) ----
saasRouter.get('/admin/security/overview', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const now = Date.now();
  const activeSessions = db.sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
  const users = db.users;
  const mfaEnabled = users.filter((u) => u.mfaEnabled).length;
  const suspended = users.filter((u) => u.status === 'suspended').length;
  const unverified = users.filter((u) => !u.isEmailVerified).length;

  // Threat signals from audit log (real recorded events only)
  const threatActions = ['login_failed', 'auth_failure', 'god_access_denied', 'account_locked', 'suspicious_login'];
  const threatEvents = db.auditLogs.filter((l) => threatActions.includes(l.action));
  const recentThreats = threatEvents.slice(0, 50).map((l) => ({
    id: l.id, action: l.action, userEmail: l.userEmail, timestamp: l.timestamp,
    details: l.details, ip: l.ip,
  }));

  // Session stats
  const sessionsByUser = new Map<string, number>();
  activeSessions.forEach((s) => sessionsByUser.set(s.userId, (sessionsByUser.get(s.userId) || 0) + 1));
  const multiSessionUsers = [...sessionsByUser.entries()].filter(([, c]) => c > 3).length;

  res.json({
    success: true,
    security: {
      sessions: {
        total: db.sessions.length,
        active: activeSessions.length,
        expired: db.sessions.length - activeSessions.length,
        usersWithMultipleSessions: multiSessionUsers,
      },
      accounts: {
        total: users.length,
        active: users.filter((u) => u.status === 'active').length,
        suspended,
        unverifiedEmail: unverified,
        mfaEnabled,
        mfaAdoptionRate: users.length ? Math.round((mfaEnabled / users.length) * 100) : 0,
      },
      threats: {
        totalEvents: threatEvents.length,
        last24h: threatEvents.filter((l) => now - new Date(l.timestamp).getTime() < 86400000).length,
        recent: recentThreats,
      },
      policies: {
        bruteForceGuard: 'active',
        rateLimiting: 'active',
        mfaSupport: 'available_not_enforced',
        sessionExpiry: `${getSystemSettings().security?.sessionExpiryDays || 30} days`,
      },
      generatedAt: new Date().toISOString(),
    },
  });
});

// ---- Infrastructure monitoring (GOD-only): real storage + DB + honest backup status ----
saasRouter.get('/admin/infrastructure', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const storage = getStorageStats();
  const dataDir = path.resolve(process.cwd(), 'data');
  const dbFile = path.join(dataDir, 'saas_db.json');

  // Data directory inventory (names + sizes only, no content)
  const inventory: any[] = [];
  try {
    for (const entry of fs.readdirSync(dataDir, { withFileTypes: true })) {
      const p = path.join(dataDir, entry.name);
      try {
        const st = fs.statSync(p);
        inventory.push({
          name: entry.name,
          type: entry.isDirectory() ? 'dir' : 'file',
          sizeBytes: entry.isDirectory() ? null : st.size,
          modifiedAt: st.mtime.toISOString(),
        });
      } catch {}
    }
  } catch {}

  // DB health probe — file readable + parseable
  let dbHealth: any = { status: 'unknown' };
  try {
    const raw = fs.readFileSync(dbFile, 'utf8');
    JSON.parse(raw);
    dbHealth = { status: 'healthy', sizeBytes: Buffer.byteLength(raw, 'utf8'), lastModified: fs.statSync(dbFile).mtime.toISOString() };
  } catch (e: any) {
    dbHealth = { status: 'error', error: e.message };
  }

  // Process metrics (real)
  const mem = process.memoryUsage();

  res.json({
    success: true,
    infrastructure: {
      storage,
      database: {
        engine: 'JSON file store (saas_db.json)',
        health: dbHealth,
        sizeBytes: storage.dbSizeBytes,
        backup: {
          status: 'not_implemented',
          note: 'No automated backup job exists. saasDb creates a safety copy only on parse failure.',
          lastBackupAt: null,
        },
      },
      dataDirectory: inventory,
      process: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssMb: Math.round(mem.rss / 1048576),
        memoryHeapUsedMb: Math.round(mem.heapUsed / 1048576),
        nodeVersion: process.version,
      },
      generatedAt: new Date().toISOString(),
    },
  });
});

// ---- Scheduler pause/resume (GOD-only) ----
saasRouter.post('/admin/scheduler/pause', requireGodOwner, async (req: AuthenticatedRequest, res: Response) => {
  const { setSchedulerPaused, isSchedulerPaused } = await import('./scheduler.ts');
  setSchedulerPaused(true);
  logAuditEvent({ userId: req.user?.id, userEmail: req.user?.email, action: 'scheduler_paused', details: 'Scheduler paused by Primary Owner', ip: req.socket.remoteAddress });
  res.json({ success: true, paused: isSchedulerPaused() });
});

saasRouter.post('/admin/scheduler/resume', requireGodOwner, async (req: AuthenticatedRequest, res: Response) => {
  const { setSchedulerPaused, isSchedulerPaused } = await import('./scheduler.ts');
  setSchedulerPaused(false);
  logAuditEvent({ userId: req.user?.id, userEmail: req.user?.email, action: 'scheduler_resumed', details: 'Scheduler resumed by Primary Owner', ip: req.socket.remoteAddress });
  res.json({ success: true, paused: isSchedulerPaused() });
});

// ---- Privacy Shield: verifiable control report (GOD-only) ----
// Each control reports REAL implementation status — no universal "active" claim.
saasRouter.get('/admin/privacy-shield', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const controls = [
    {
      id: 'password_hashing',
      name: 'Password hashing',
      status: 'verified',
      detail: 'PBKDF2/scrypt-style hash+salt per user (passwordHash + salt fields); salts never exposed via sanitizeUserForClient',
    },
    {
      id: 'hash_exposure',
      name: 'Credential non-exposure',
      status: 'verified',
      detail: 'sanitizeUserForClient strips passwordHash, salt, mfaSecret from all API responses',
    },
    {
      id: 'oauth_token_encryption',
      name: 'OAuth token protection',
      status: 'implemented_not_independently_verified',
      detail: 'social_connections.json stores tokens; encryption-at-rest not confirmed — tokens excluded from client responses',
    },
    {
      id: 'workspace_isolation',
      name: 'Tenant isolation',
      status: 'implemented_not_independently_verified',
      detail: 'workspaceData keyed by workspaceId; all /api/saas routes require workspace context; brand-level canAccessBrand checks exist',
    },
    {
      id: 'session_credential_logging',
      name: 'Session credential hygiene',
      status: 'verified',
      detail: 'Admin session list exposes maskedToken only (first6...last6); raw tokens never returned',
    },
    {
      id: 'sensitive_log_redaction',
      name: 'Log redaction',
      status: 'partially_implemented',
      detail: 'auditLogs store actions/metadata; no systematic secret-scanning of log details',
    },
    {
      id: 'admin_content_access',
      name: 'Admin content privacy',
      status: 'implemented_not_independently_verified',
      detail: 'Admin endpoints return metadata; no endpoint found exposing private video/message content by default',
    },
    {
      id: 'backup_protection',
      name: 'Backup protection',
      status: 'not_implemented',
      detail: 'No backup system exists; saas_db.json is a single local file',
    },
    {
      id: 'data_retention',
      name: 'Retention policy',
      status: 'not_implemented',
      detail: 'No documented retention/deletion policy enforced',
    },
    {
      id: 'mfa',
      name: 'MFA',
      status: 'partially_implemented',
      detail: 'mfaEnabled/mfaSecret fields exist; enforcement and flow not verified',
    },
    {
      id: 'gdpr_deletion',
      name: 'Account deletion lifecycle',
      status: 'partially_implemented',
      detail: 'Admin delete exists (GOD-only) but is hard-delete without retention/billing checks',
    },
  ];

  const summary = {
    verified: controls.filter((c) => c.status === 'verified').length,
    implementedNotVerified: controls.filter((c) => c.status === 'implemented_not_independently_verified').length,
    partial: controls.filter((c) => c.status === 'partially_implemented').length,
    notImplemented: controls.filter((c) => c.status === 'not_implemented').length,
    total: controls.length,
  };

  res.json({
    success: true,
    privacyShield: {
      disclaimer: 'Status reflects code-level verification, not independent audit.',
      summary,
      controls,
      generatedAt: new Date().toISOString(),
    },
  });
});

// ---- Self-service account lifecycle (Phase 1) ----

// Deactivate account — suspends access, preserves data, reversible by admin
saasRouter.post('/account/deactivate', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  if (user.email.toLowerCase() === GOD_OWNER_EMAIL.toLowerCase()) {
    return res.status(403).json({ success: false, error: 'The Primary Owner account cannot be deactivated.' });
  }
  const { password, reason } = req.body || {};
  if (!password) return res.status(400).json({ success: false, error: 'Password confirmation required.' });
  const db = getDb();
  const u = db.users.find((x) => x.id === user.id);
  if (!u || !verifyPassword(password, u.salt, u.passwordHash)) {
    return res.status(403).json({ success: false, error: 'Password verification failed.' });
  }
  u.status = 'suspended';
  u.deactivatedAt = new Date().toISOString();
  u.deactivationReason = reason || 'user_requested';
  // Revoke all sessions
  db.sessions = db.sessions.filter((s) => s.userId !== user.id);
  saveDatabase(db);
  logAuditEvent({ userId: user.id, userEmail: user.email, action: 'account_self_deactivated', details: `Self-deactivation (${reason || 'user_requested'})` });
  res.json({ success: true, message: 'Account deactivated. Contact support to reactivate.' });
});

// Delete account — checks workspace ownership before allowing
saasRouter.post('/account/delete-request', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  if (user.email.toLowerCase() === GOD_OWNER_EMAIL.toLowerCase()) {
    return res.status(403).json({ success: false, error: 'The Primary Owner account cannot be deleted.' });
  }
  const { password, confirmText } = req.body || {};
  if (confirmText !== 'DELETE') return res.status(400).json({ success: false, error: 'Type DELETE to confirm.' });
  if (!password) return res.status(400).json({ success: false, error: 'Password confirmation required.' });
  const db = getDb();
  const u = db.users.find((x) => x.id === user.id);
  if (!u || !verifyPassword(password, u.salt, u.passwordHash)) {
    return res.status(403).json({ success: false, error: 'Password verification failed.' });
  }
  // Block if sole owner of a workspace with other members
  const ownedWorkspaces = db.workspaceMembers.filter((m) => m.userId === user.id && m.role === 'owner');
  for (const ow of ownedWorkspaces) {
    const otherMembers = db.workspaceMembers.filter((m) => m.workspaceId === ow.workspaceId && m.userId !== user.id);
    if (otherMembers.length > 0) {
      return res.status(409).json({ success: false, error: 'You own a workspace with other members. Transfer ownership or remove members first.' });
    }
  }
  // Mark for deletion (soft-delete with 30-day recovery window)
  u.status = 'deleted';
  u.deletedAt = new Date().toISOString();
  u.deleteScheduledAt = new Date(Date.now() + 30 * 86400000).toISOString();
  db.sessions = db.sessions.filter((s) => s.userId !== user.id);
  // Anonymize PII
  u.email = `deleted_${u.id}@removed.local`;
  u.fullName = 'Deleted User';
  u.passwordHash = 'deleted';
  u.salt = 'deleted';
  saveDatabase(db);
  logAuditEvent({ userId: user.id, userEmail: 'deleted', action: 'account_self_deleted', details: 'Account scheduled for deletion (30-day recovery)' });
  res.json({ success: true, message: 'Account scheduled for deletion. You have 30 days to contact support for recovery.' });
});

// Avatar upload — base64 data URL, validated, size-capped
saasRouter.post('/account/avatar', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { avatarUrl } = req.body || {};
  if (!avatarUrl || typeof avatarUrl !== 'string') return res.status(400).json({ success: false, error: 'avatarUrl required' });
  if (!avatarUrl.startsWith('data:image/')) return res.status(400).json({ success: false, error: 'Must be an image data URL' });
  const allowed = ['data:image/png', 'data:image/jpeg', 'data:image/webp', 'data:image/gif'];
  if (!allowed.some((p) => avatarUrl.startsWith(p))) return res.status(400).json({ success: false, error: 'PNG, JPEG, WebP or GIF only' });
  const sizeBytes = Math.round((avatarUrl.length - avatarUrl.indexOf(',') - 1) * 0.75);
  if (sizeBytes > 2 * 1024 * 1024) return res.status(400).json({ success: false, error: 'Image must be under 2MB' });
  const db = getDb();
  const u = db.users.find((x) => x.id === user.id);
  if (u) { u.avatarUrl = avatarUrl; saveDatabase(db); }
  res.json({ success: true, avatarUrl });
});

// ---- Maintenance Center config (GOD-only) ----
saasRouter.get('/admin/maintenance', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const settings = getSystemSettings();
  res.json({ success: true, maintenance: settings.maintenanceConfig || { mode: 'normal' }, legacyMode: settings.maintenanceMode });
});

saasRouter.put('/admin/maintenance', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const { mode, reason, publicTitle, publicMessage, affectedServices, scheduledStart, scheduledEnd, autoExpire, confirm } = req.body || {};
  const validModes = ['normal', 'readonly', 'partial', 'full', 'emergency'];
  if (mode && !validModes.includes(mode)) return res.status(400).json({ success: false, error: 'Invalid mode' });
  // Critical ops need explicit confirmation
  if ((mode === 'full' || mode === 'emergency') && confirm !== true) {
    return res.status(400).json({ success: false, error: 'Full/emergency maintenance requires confirm: true' });
  }
  const settings = getSystemSettings();
  const prev = settings.maintenanceConfig || null;
  const next = {
    mode: mode || 'normal',
    reason: reason || prev?.reason,
    publicTitle: publicTitle || prev?.publicTitle,
    publicMessage: publicMessage || prev?.publicMessage,
    affectedServices: Array.isArray(affectedServices) ? affectedServices : (prev?.affectedServices || []),
    scheduledStart: scheduledStart !== undefined ? scheduledStart : (prev?.scheduledStart || null),
    scheduledEnd: scheduledEnd !== undefined ? scheduledEnd : (prev?.scheduledEnd || null),
    autoExpire: autoExpire !== undefined ? autoExpire : (prev?.autoExpire ?? false),
    activatedAt: mode && mode !== 'normal' ? new Date().toISOString() : null,
    activatedBy: req.user?.id || null,
    previousConfig: prev,
  };
  const updated = updateSystemSettings({ maintenanceConfig: next, maintenanceMode: next.mode === 'full' || next.mode === 'emergency' });
  logAuditEvent({
    userId: req.user?.id, userEmail: req.user?.email,
    action: 'maintenance_config_changed',
    details: `Mode: ${prev?.mode || 'none'} → ${next.mode}; services: ${(next.affectedServices || []).join(',') || 'all'}`,
    ip: req.socket.remoteAddress,
  });
  res.json({ success: true, maintenance: updated.maintenanceConfig });
});

// ---- Background Operations monitor (GOD-only) ----
saasRouter.get('/admin/background-ops', requireGodOwner, async (req: AuthenticatedRequest, res: Response) => {
  const { getSchedulerStatus, isSchedulerPaused } = await import('./scheduler.ts');
  const sched = getSchedulerStatus();
  const db = getDb();

  // Aggregate post/job states across all workspaces
  const postStates: Record<string, number> = {};
  let totalPosts = 0;
  for (const ws of Object.values(db.workspaceData || {})) {
    for (const p of (ws as any).posts || []) {
      postStates[p.status] = (postStates[p.status] || 0) + 1;
      totalPosts++;
    }
  }
  // Automation executions
  let totalExecs = 0, failedExecs = 0, runningExecs = 0;
  for (const ws of Object.values(db.workspaceData || {})) {
    for (const e of (ws as any).automationExecutions || []) {
      totalExecs++;
      if (e.status === 'failed') failedExecs++;
      if (e.status === 'running' || e.status === 'queued' || e.status === 'waiting_approval') runningExecs++;
    }
  }
  // Drive import jobs
  let importJobs: any[] = [];
  try { importJobs = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'drive_imports.json'), 'utf8')); } catch {}
  const importStates: Record<string, number> = {};
  importJobs.forEach((j: any) => { importStates[j.status] = (importStates[j.status] || 0) + 1; });

  res.json({
    success: true,
    operations: {
      scheduler: { ...sched, paused: isSchedulerPaused() },
      publishing: { totalPosts, byStatus: postStates },
      automations: { totalExecutions: totalExecs, failed: failedExecs, active: runningExecs },
      driveImports: { total: importJobs.length, byStatus: importStates },
      generatedAt: new Date().toISOString(),
    },
  });
});

// ---- Backup management (GOD-only): real file-copy backups of saas_db.json ----
const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');
const BACKUP_INDEX = path.join(BACKUP_DIR, 'index.json');

function ensureBackupDir() { if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true }); }
function loadBackupIndex(): any[] { try { return JSON.parse(fs.readFileSync(BACKUP_INDEX, 'utf8')); } catch { return []; } }
function saveBackupIndex(idx: any[]) { ensureBackupDir(); fs.writeFileSync(BACKUP_INDEX, JSON.stringify(idx, null, 2)); }

saasRouter.get('/admin/backups', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, backups: loadBackupIndex().slice(-50).reverse() });
});

saasRouter.post('/admin/backups', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const dbFile = path.join(process.cwd(), 'data', 'saas_db.json');
  if (!fs.existsSync(dbFile)) return res.status(500).json({ success: false, error: 'Database file not found' });
  ensureBackupDir();
  const id = `bak_${Date.now().toString(36)}`;
  const file = path.join(BACKUP_DIR, `${id}.json`);
  try {
    fs.copyFileSync(dbFile, file);
    const size = fs.statSync(file).size;
    // Verify: re-parse the copy
    let verified = false, verifyError = '';
    try { JSON.parse(fs.readFileSync(file, 'utf8')); verified = true; } catch (e: any) { verifyError = e.message; }
    const rec = { id, file: file.split(/[\\/]/).pop(), sizeBytes: size, createdAt: new Date().toISOString(), createdBy: req.user?.id, status: verified ? 'verified' : 'failed', verifyError: verifyError || null };
    saveBackupIndex([...loadBackupIndex(), rec]);
    logAuditEvent({ userId: req.user?.id, userEmail: req.user?.email, action: 'backup_created', details: `Backup ${id} (${Math.round(size/1024)}KB) ${verified ? 'verified' : 'FAILED verification'}` });
    res.json({ success: true, backup: rec });
  } catch (e: any) {
    console.error('[backup] create failed:', e);
    res.status(500).json({ success: false, error: 'Backup creation failed.' });
  }
});

saasRouter.post('/admin/backups/:id/verify', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const idx = loadBackupIndex();
  const rec = idx.find((b: any) => b.id === req.params.id);
  if (!rec) return res.status(404).json({ success: false, error: 'Backup not found' });
  const file = path.join(BACKUP_DIR, rec.file);
  if (!fs.existsSync(file)) return res.status(404).json({ success: false, error: 'Backup file missing' });
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
    rec.status = 'verified'; rec.verifiedAt = new Date().toISOString(); rec.verifyError = null;
  } catch (e: any) {
    rec.status = 'failed'; rec.verifyError = e.message;
  }
  saveBackupIndex(idx);
  res.json({ success: true, backup: rec });
});

// ---- Maintenance tasks (GOD-only): predefined safe operations ----
const TASKS_FILE = path.join(process.cwd(), 'data', 'maintenance_tasks.json');
function loadTasks(): any[] { try { return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8')); } catch { return []; } }
function saveTasks(t: any[]) { fs.writeFileSync(TASKS_FILE, JSON.stringify(t.slice(-200), null, 2)); }

const TASK_DEFS: Record<string, { title: string; desc: string; run: () => Promise<any> }> = {
  health_check: {
    title: 'Application Health Check',
    desc: 'Verify server process, memory, uptime',
    run: async () => ({ ok: true, uptime: process.uptime(), memMb: Math.round(process.memoryUsage().rss / 1048576), node: process.version }),
  },
  db_verify: {
    title: 'Verify Database Integrity',
    desc: 'Parse saas_db.json and count records',
    run: async () => {
      const raw = fs.readFileSync(path.join(process.cwd(), 'data', 'saas_db.json'), 'utf8');
      const db = JSON.parse(raw);
      return { ok: true, users: db.users?.length || 0, workspaces: db.workspaces?.length || 0, sizeBytes: Buffer.byteLength(raw) };
    },
  },
  queue_check: {
    title: 'Check Publishing Queue',
    desc: 'Count pending/failed/scheduled posts',
    run: async () => {
      const db = getDb();
      const counts: Record<string, number> = {};
      for (const ws of Object.values(db.workspaceData || {})) for (const p of (ws as any).posts || []) counts[p.status] = (counts[p.status] || 0) + 1;
      return { ok: true, byStatus: counts };
    },
  },
  scheduler_status: {
    title: 'Scheduler Status',
    desc: 'Report scheduler heartbeat and pause state',
    run: async () => {
      const { getSchedulerStatus, isSchedulerPaused } = await import('./scheduler.ts');
      return { ok: true, ...getSchedulerStatus(), paused: isSchedulerPaused() };
    },
  },
  oauth_config_check: {
    title: 'Verify OAuth Configuration',
    desc: 'Check which providers have credentials configured',
    run: async () => ({
      ok: true,
      providers: {
        youtube: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        facebook: !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
        tiktok: !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET),
      },
    }),
  },
};

saasRouter.get('/admin/maintenance-tasks', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    definitions: Object.entries(TASK_DEFS).map(([key, t]) => ({ key, title: t.title, desc: t.desc })),
    history: loadTasks().slice(-50).reverse(),
  });
});

saasRouter.post('/admin/maintenance-tasks/:key/run', requireGodOwner, async (req: AuthenticatedRequest, res: Response) => {
  const def = TASK_DEFS[req.params.key];
  if (!def) return res.status(404).json({ success: false, error: 'Unknown task' });
  const startedAt = new Date().toISOString();
  try {
    const result = await def.run();
    const rec = { id: `task_${Date.now().toString(36)}`, key: req.params.key, title: def.title, status: 'completed', result, initiatedBy: req.user?.id, startedAt, completedAt: new Date().toISOString() };
    saveTasks([...loadTasks(), rec]);
    logAuditEvent({ userId: req.user?.id, userEmail: req.user?.email, action: 'maintenance_task_run', details: `Task ${def.title} completed` });
    res.json({ success: true, task: rec });
  } catch (e: any) {
    const rec = { id: `task_${Date.now().toString(36)}`, key: req.params.key, title: def.title, status: 'failed', error: e.message, initiatedBy: req.user?.id, startedAt, completedAt: new Date().toISOString() };
    saveTasks([...loadTasks(), rec]);
    console.error(`[maintenance] task ${req.params.key} failed:`, e);
    res.status(500).json({ success: false, error: 'Maintenance task failed.', task: rec });
  }
});

// ---- Maintenance audit history (GOD-only) ----
saasRouter.get('/admin/maintenance-history', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const { action, from, to, limit } = req.query;
  const MAINT_ACTIONS = ['maintenance_config_changed','maintenance_task_run','backup_created','scheduler_paused','scheduler_resumed','god_access_denied','system_settings_updated'];
  let logs = getAuditLogs({ limit: 1000 }).filter((l: any) => MAINT_ACTIONS.includes(l.action) || (action && l.action === action));
  if (from) logs = logs.filter((l: any) => new Date(l.timestamp) >= new Date(String(from)));
  if (to) logs = logs.filter((l: any) => new Date(l.timestamp) <= new Date(String(to)));
  res.json({ success: true, history: logs.slice(0, Math.min(Number(limit) || 100, 500)), total: logs.length });
});

// ---- Recovery Center (GOD-only) ----
saasRouter.get('/admin/recovery', requireGodOwner, async (req: AuthenticatedRequest, res: Response) => {
  const settings = getSystemSettings();
  const { getSchedulerStatus, isSchedulerPaused } = await import('./scheduler.ts');
  res.json({
    success: true,
    recovery: {
      currentConfig: settings.maintenanceConfig || { mode: 'normal' },
      previousConfig: settings.maintenanceConfig?.previousConfig || null,
      hasRollback: !!settings.maintenanceConfig?.previousConfig,
      scheduler: { ...getSchedulerStatus(), paused: isSchedulerPaused() },
      backups: loadBackupIndex().slice(-5).reverse(),
      generatedAt: new Date().toISOString(),
    },
  });
});

// Rollback to previous maintenance configuration
saasRouter.post('/admin/recovery/rollback', requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const { confirm } = req.body || {};
  if (confirm !== true) return res.status(400).json({ success: false, error: 'confirm: true required' });
  const settings = getSystemSettings();
  const prev = settings.maintenanceConfig?.previousConfig;
  if (!prev) return res.status(400).json({ success: false, error: 'No previous configuration to restore' });
  const restored = { ...prev, previousConfig: settings.maintenanceConfig };
  updateSystemSettings({ maintenanceConfig: restored, maintenanceMode: restored.mode === 'full' || restored.mode === 'emergency' });
  logAuditEvent({ userId: req.user?.id, userEmail: req.user?.email, action: 'maintenance_rollback', details: `Restored previous config (mode: ${restored.mode})` });
  res.json({ success: true, maintenance: restored });
});

// Full recovery: disable maintenance + resume scheduler
saasRouter.post('/admin/recovery/full', requireGodOwner, async (req: AuthenticatedRequest, res: Response) => {
  const { confirm } = req.body || {};
  if (confirm !== true) return res.status(400).json({ success: false, error: 'confirm: true required' });
  const settings = getSystemSettings();
  const prev = settings.maintenanceConfig;
  updateSystemSettings({
    maintenanceConfig: { mode: 'normal', activatedAt: null, activatedBy: null, previousConfig: prev },
    maintenanceMode: false,
  });
  const { setSchedulerPaused } = await import('./scheduler.ts');
  setSchedulerPaused(false);
  logAuditEvent({ userId: req.user?.id, userEmail: req.user?.email, action: 'recovery_completed', details: 'Maintenance disabled + scheduler resumed' });
  res.json({ success: true, message: 'Recovery complete — maintenance disabled, scheduler resumed' });
});
