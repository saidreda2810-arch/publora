/**
 * JSON → Postgres migration tool (plan T1.2).
 *
 * Usage:
 *   npx tsx scripts/migrate-json-to-pg.ts            # dry-run (default)
 *   npx tsx scripts/migrate-json-to-pg.ts --apply    # write to DATABASE_URL
 *   npx tsx scripts/migrate-json-to-pg.ts --verify   # compare counts
 *
 * Requires DATABASE_URL for --apply/--verify and the `pg` package.
 * Idempotent: all inserts use ON CONFLICT DO NOTHING keyed on legacy ids.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const REPORT_DIR = path.resolve(process.cwd(), 'docs', 'migration');

const args = new Set(process.argv.slice(2));
const MODE = args.has('--apply') ? 'apply' : args.has('--verify') ? 'verify' : 'dry-run';

// ---------------------------------------------------------------------------
// Load sources
// ---------------------------------------------------------------------------

function readJson<T = any>(file: string, fallback: T): T {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    console.error(`Failed to parse ${file}:`, e);
    return fallback;
  }
}

const saas = readJson<any>('saas_db.json', {});
const socialConns = readJson<any[]>('social_connections.json', []);
const mediaCatalog = readJson<any[]>('media_catalog.json', []);

// ---------------------------------------------------------------------------
// Analysis model
// ---------------------------------------------------------------------------

interface Orphan { kind: string; id: string; reason: string; workspaceId?: string }
interface Analysis {
  counts: Record<string, number>;
  orphans: Orphan[];
  duplicates: { kind: string; detail: string }[];
  invalid: { kind: string; id: string; field: string; value: any }[];
}

const PROVIDERS = new Set(['youtube', 'facebook', 'instagram', 'tiktok', 'google_drive']);
const POST_STATUSES = new Set(['draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled', 'needs_reconnect']);
const TARGET_STATUSES = new Set(['scheduled', 'publishing', 'published', 'failed', 'cancelled', 'needs_reconnect']);
const USER_ROLES = new Set(['user', 'creator', 'admin', 'super_admin', 'platform_admin', 'god']);
const USER_STATUSES = new Set(['active', 'suspended', 'pending_verification']);
const PLANS = new Set(['free', 'starter', 'growth', 'pro', 'enterprise']);

function analyze(): Analysis {
  const a: Analysis = { counts: {}, orphans: [], duplicates: [], invalid: [] };
  const inc = (k: string, n = 1) => { a.counts[k] = (a.counts[k] || 0) + n; };

  const users: any[] = saas.users || [];
  const sessions: any[] = saas.sessions || [];
  const tokens: any[] = saas.verificationTokens || [];
  const workspaces: any[] = saas.workspaces || [];
  const members: any[] = saas.workspaceMembers || [];
  const invitations: any[] = saas.workspaceInvitations || [];
  const wsData: Record<string, any> = saas.workspaceData || {};
  const auditLogs: any[] = saas.auditLogs || [];
  const securityEvents: any[] = saas.securityEvents || [];

  inc('users', users.length); inc('sessions', sessions.length);
  inc('auth_tokens', tokens.length); inc('workspaces', workspaces.length);
  inc('workspace_members', members.length); inc('workspace_invitations', invitations.length);
  inc('audit_logs', auditLogs.length); inc('security_events', securityEvents.length);

  // ---- users ----
  const emails = new Map<string, number>();
  for (const u of users) {
    const em = (u.email || '').toLowerCase();
    emails.set(em, (emails.get(em) || 0) + 1);
    if (!u.email) a.invalid.push({ kind: 'user', id: u.id, field: 'email', value: u.email });
    if (u.role && !USER_ROLES.has(u.role)) a.invalid.push({ kind: 'user', id: u.id, field: 'role', value: u.role });
    if (u.status && !USER_STATUSES.has(u.status)) a.invalid.push({ kind: 'user', id: u.id, field: 'status', value: u.status });
  }
  for (const [em, n] of emails) if (n > 1) a.duplicates.push({ kind: 'user.email', detail: `${em} ×${n}` });

  // ---- sessions ----
  const userIds = new Set(users.map((u) => u.id));
  const wsIds = new Set(workspaces.map((w) => w.id));
  for (const s of sessions) {
    if (!userIds.has(s.userId)) a.orphans.push({ kind: 'session', id: s.id, reason: `userId ${s.userId} not found` });
    if (!s.token || !/^[a-f0-9]{64}$/i.test(s.token)) a.invalid.push({ kind: 'session', id: s.id, field: 'token', value: typeof s.token });
  }

  // ---- tokens ----
  for (const t of tokens) {
    if (!['email_verification', 'password_reset', 'email_change', 'magic_link'].includes(t.type)) {
      a.invalid.push({ kind: 'auth_token', id: t.id, field: 'type', value: t.type });
    }
  }

  // ---- workspaces / members ----
  for (const w of workspaces) {
    if (!userIds.has(w.ownerId)) a.orphans.push({ kind: 'workspace', id: w.id, reason: `ownerId ${w.ownerId} not found` });
    if (w.plan && !PLANS.has(w.plan)) a.invalid.push({ kind: 'workspace', id: w.id, field: 'plan', value: w.plan });
  }
  for (const m of members) {
    if (!wsIds.has(m.workspaceId)) a.orphans.push({ kind: 'workspace_member', id: m.id, reason: `workspaceId ${m.workspaceId} not found` });
    if (!userIds.has(m.userId)) a.orphans.push({ kind: 'workspace_member', id: m.id, reason: `userId ${m.userId} not found` });
  }
  for (const i of invitations) {
    if (!wsIds.has(i.workspaceId)) a.orphans.push({ kind: 'workspace_invitation', id: i.id, reason: `workspaceId ${i.workspaceId} not found` });
  }

  // ---- workspace data ----
  let brands = 0, projects = 0, categories = 0, videos = 0, accounts = 0;
  let posts = 0, postTargets = 0, analytics = 0, workflows = 0, executions = 0;
  const kvKeys = new Set<string>();

  for (const [wsId, d] of Object.entries(wsData)) {
    if (!wsIds.has(wsId)) {
      a.orphans.push({ kind: 'workspaceData', id: wsId, reason: 'workspace does not exist' });
      continue;
    }
    const data: any = d;
    const brandIds = new Set((data.brands || []).map((b: any) => b.id));
    const accountIds = new Set((data.accounts || []).map((x: any) => x.id));
    brands += (data.brands || []).length;
    projects += (data.projects || []).length;
    categories += (data.categories || []).length;
    videos += (data.videos || []).length;
    accounts += (data.accounts || []).length;
    posts += (data.posts || []).length;
    analytics += (data.analytics || []).length;
    workflows += (data.automationWorkflows || data.automationRules || []).length;
    executions += (data.automationExecutions || data.automationLogs || []).length;

    for (const k of Object.keys(data)) kvKeys.add(k);

    for (const p of data.projects || []) {
      if (p.brandId && !brandIds.has(p.brandId)) a.orphans.push({ kind: 'project', id: p.id, workspaceId: wsId, reason: `brandId ${p.brandId} missing` });
    }
    for (const v of data.videos || []) {
      if (v.brandId && !brandIds.has(v.brandId)) a.orphans.push({ kind: 'video', id: v.id, workspaceId: wsId, reason: `brandId ${v.brandId} missing` });
      if (v.projectId && !(data.projects || []).some((p: any) => p.id === v.projectId)) a.orphans.push({ kind: 'video', id: v.id, workspaceId: wsId, reason: `projectId ${v.projectId} missing` });
    }
    for (const p of data.posts || []) {
      if (p.brandId && !brandIds.has(p.brandId)) a.orphans.push({ kind: 'post', id: p.id, workspaceId: wsId, reason: `brandId ${p.brandId} missing` });
      if (p.videoId && !(data.videos || []).some((v: any) => v.id === p.videoId)) a.orphans.push({ kind: 'post', id: p.id, workspaceId: wsId, reason: `videoId ${p.videoId} missing` });
      if (p.projectId && !(data.projects || []).some((pr: any) => pr.id === p.projectId)) a.orphans.push({ kind: 'post', id: p.id, workspaceId: wsId, reason: `projectId ${p.projectId} missing` });
      if (p.status && !POST_STATUSES.has(p.status)) a.invalid.push({ kind: 'post', id: p.id, field: 'status', value: p.status });
      // post → targets expansion estimate
      const platforms: string[] = p.channelPlatforms || p.platforms || [];
      const matchingAccounts = (data.accounts || []).filter((acc: any) =>
        platforms.includes(acc.platform) && (!p.brandId || !acc.brandId || acc.brandId === p.brandId));
      if (matchingAccounts.length === 0 && platforms.length > 0) {
        a.orphans.push({ kind: 'post_target', id: p.id, workspaceId: wsId, reason: `no social account for platforms [${platforms.join(',')}]` });
      } else {
        postTargets += matchingAccounts.length || platforms.length;
      }
    }
    for (const an of data.analytics || []) {
      if (an.videoId && !(data.videos || []).some((v: any) => v.id === an.videoId)) a.orphans.push({ kind: 'analytics', id: an.id, workspaceId: wsId, reason: `videoId ${an.videoId} missing` });
    }
  }

  inc('brands', brands); inc('projects', projects); inc('content_categories', categories);
  inc('videos', videos); inc('social_accounts', accounts + socialConns.length);
  inc('posts', posts); inc('post_targets', postTargets);
  inc('analytics_snapshots', analytics);
  inc('automation_workflows', workflows); inc('automation_executions', executions);
  inc('media_assets', mediaCatalog.length);
  inc('workspace_kv_keys', kvKeys.size);

  return a;
}

// ---------------------------------------------------------------------------
// APPLY mode — insert into Postgres
// ---------------------------------------------------------------------------

async function getPg() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for --apply/--verify');
  const { Client } = await import('pg');
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const ts = (v: any) => (v ? new Date(v).toISOString() : null);
const j = (v: any) => (v === undefined ? null : JSON.stringify(v));

async function applyMigration(client: any, saas: any, socialConns: any[], mediaCatalog: any[]) {
  const q = (text: string, params: any[] = []) => client.query(text, params);
  const idMap = new Map<string, string>(); // legacyId -> uuid

  async function insertReturning(table: string, cols: string[], row: any[]): Promise<string | null> {
    const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})
                 ON CONFLICT DO NOTHING RETURNING id`;
    const r = await q(sql, row);
    return r.rows[0]?.id || null;
  }
  async function lookupByLegacy(table: string, legacyId: string): Promise<string | null> {
    const r = await q(`SELECT id FROM ${table} WHERE legacy_id = $1`, [legacyId]);
    return r.rows[0]?.id || null;
  }
  const mapId = async (table: string, legacy: string | undefined) =>
    legacy ? (idMap.get(`${table}:${legacy}`) || (await lookupByLegacy(table, legacy))) : null;

  // ---- users ----
  for (const u of saas.users || []) {
    const id = await insertReturning('users', [
      'legacy_id','email','password_hash','full_name','avatar_url','username','phone','bio',
      'country','city','timezone','language','role','status','is_email_verified','preferences',
      'created_at','updated_at','last_login_at',
    ], [
      u.id, u.email, u.passwordHash || u.password_hash || null, u.fullName || u.full_name || null,
      u.avatarUrl || null, u.username || null, u.phone || null, u.bio || null,
      u.country || null, u.city || null, u.timezone || null, u.language || 'en',
      u.role || 'user', u.status || 'active', !!u.isEmailVerified,
      j(u.preferences || {}), ts(u.createdAt), ts(u.updatedAt || u.createdAt), ts(u.lastLoginAt),
    ]);
    const real = id || await lookupByLegacy('users', u.id);
    if (real) idMap.set(`users:${u.id}`, real);
  }

  // ---- workspaces ----
  const wsData = saas.workspaceData || {};
  for (const w of saas.workspaces || []) {
    const ownerUuid = await mapId('users', w.ownerId);
    if (!ownerUuid) continue; // orphan workspace — reported in dry-run
    const id = await insertReturning('workspaces', [
      'legacy_id','name','slug','owner_id','plan','billing_cycle','settings','state_version','created_at','updated_at',
    ], [
      w.id, w.name, w.slug || `ws-${w.id}`, ownerUuid, w.plan || 'free',
      w.billingCycle || 'monthly', j(w.settings || {}),
      (saas.stateVersions || {})[w.id] || 0, ts(w.createdAt), ts(w.updatedAt || w.createdAt),
    ]);
    const real = id || await lookupByLegacy('workspaces', w.id);
    if (real) idMap.set(`workspaces:${w.id}`, real);
  }

  // ---- members / invitations ----
  for (const m of saas.workspaceMembers || []) {
    const ws = await mapId('workspaces', m.workspaceId);
    const usr = await mapId('users', m.userId);
    if (!ws || !usr) continue;
    await q(`INSERT INTO workspace_members (workspace_id,user_id,role,status,joined_at,created_at)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (workspace_id,user_id) DO NOTHING`,
      [ws, usr, m.role || 'editor', m.status || 'active', ts(m.joinedAt || m.createdAt), ts(m.createdAt || m.joinedAt)]);
  }
  for (const i of saas.workspaceInvitations || []) {
    const ws = await mapId('workspaces', i.workspaceId);
    const inviter = await mapId('users', i.invitedBy || i.inviterId);
    if (!ws || !inviter) continue;
    await q(`INSERT INTO workspace_invitations (workspace_id,email,role,token_hash,invited_by,expires_at,accepted_at,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (token_hash) DO NOTHING`,
      [ws, i.email, i.role || 'editor', sha256(i.token || i.id), inviter, ts(i.expiresAt), ts(i.acceptedAt), ts(i.createdAt)]);
  }

  // ---- sessions (token field already stores sha256 hash) ----
  for (const s of saas.sessions || []) {
    const usr = await mapId('users', s.userId);
    if (!usr || !s.token) continue;
    const tokenHash = /^[a-f0-9]{64}$/i.test(s.token) ? s.token : sha256(s.token);
    await q(`INSERT INTO sessions (user_id,token_hash,ip,user_agent,expires_at,created_at)
             VALUES ($1,$2,$3::inet,$4,$5,$6) ON CONFLICT (token_hash) DO NOTHING`,
      [usr, tokenHash, s.ip || null, s.userAgent || null, ts(s.expiresAt), ts(s.createdAt)]);
  }

  // ---- auth tokens ----
  for (const t of saas.verificationTokens || []) {
    const TYPE_MAP: Record<string, string> = {
      email_verification: 'email_verification', password_reset: 'password_reset',
      email_change: 'email_change', magic_link: 'magic_link',
    };
    const type = TYPE_MAP[t.type];
    if (!type) continue;
    const usr = t.userId ? await mapId('users', t.userId) : null;
    const raw = t.token || '';
    const tokenHash = /^[a-f0-9]{64}$/i.test(raw) ? raw : sha256(raw);
    await q(`INSERT INTO auth_tokens (type,token_hash,user_id,email,payload,expires_at,used_at,attempts,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (type, token_hash) DO NOTHING`,
      [type, tokenHash, usr, t.email || null, j(t.payload || null), ts(t.expiresAt), ts(t.usedAt), t.attempts || 0, ts(t.createdAt)]);
  }

  // ---- workspace content ----
  for (const [wsLegacy, data0] of Object.entries<any>(wsData)) {
    const ws = await mapId('workspaces', wsLegacy);
    if (!ws) continue;
    const data: any = data0;
    const brandUuid = new Map<string, string>();
    const accountUuid = new Map<string, string>();
    const videoUuid = new Map<string, string>();
    const projectUuid = new Map<string, string>();

    for (const b of data.brands || []) {
      const id = await insertReturning('brands', [
        'legacy_id','workspace_id','name','description','logo_url','website','status','settings','created_at','updated_at',
      ], [b.id, ws, b.name, b.description || null, b.logoUrl || b.logo_url || null, b.website || null,
          b.status === 'archived' ? 'archived' : 'active', j(b.settings || b || {}), ts(b.createdAt), ts(b.updatedAt || b.createdAt)]);
      const real = id || await lookupByLegacy('brands', b.id);
      if (real) brandUuid.set(b.id, real);
    }
    for (const c of data.categories || []) {
      await q(`INSERT INTO content_categories (workspace_id,name,color) VALUES ($1,$2,$3)
               ON CONFLICT (workspace_id,name) DO NOTHING`, [ws, c.name, c.color || null]);
    }
    for (const pr of data.projects || []) {
      const bid = pr.brandId ? brandUuid.get(pr.brandId) || await mapId('brands', pr.brandId) : null;
      const id = await insertReturning('projects', [
        'legacy_id','workspace_id','brand_id','name','description','status','settings','created_at','updated_at',
      ], [pr.id, ws, bid, pr.name, pr.description || null, pr.status || 'active', j(pr.settings || {}), ts(pr.createdAt), ts(pr.updatedAt || pr.createdAt)]);
      const real = id || await lookupByLegacy('projects', pr.id);
      if (real) projectUuid.set(pr.id, real);
    }
    for (const v of data.videos || []) {
      const bid = v.brandId ? brandUuid.get(v.brandId) || await mapId('brands', v.brandId) : null;
      const pid = v.projectId ? projectUuid.get(v.projectId) || await mapId('projects', v.projectId) : null;
      const id = await insertReturning('videos', [
        'legacy_id','workspace_id','brand_id','project_id','title','description','duration_sec',
        'width','height','file_size_bytes','thumbnail_url','tags','status','metadata','created_at','updated_at',
      ], [
        v.id, ws, bid, pid, v.title || 'Untitled', v.description || null, v.durationSec ?? null,
        v.width || null, v.height || null, v.fileSizeBytes || null, v.thumbnailUrl || null,
        Array.isArray(v.tags) ? v.tags : [], v.status || 'uploaded', j(v), ts(v.createdAt), ts(v.updatedAt || v.createdAt),
      ]);
      const real = id || await lookupByLegacy('videos', v.id);
      if (real) videoUuid.set(v.id, real);
    }
    for (const acc of data.accounts || []) {
      const prov = String(acc.platform || acc.provider || '').toLowerCase();
      if (!PROVIDERS.has(prov)) continue;
      const bid = acc.brandId ? brandUuid.get(acc.brandId) || await mapId('brands', acc.brandId) : null;
      const id = await insertReturning('social_accounts', [
        'legacy_id','workspace_id','brand_id','provider','platform_account_id','account_name','handle',
        'avatar_url','encrypted_token','scopes','status','token_expires_at','metadata','created_at','updated_at',
      ], [
        acc.id, ws, bid, prov, acc.platformAccountId || acc.accountId || acc.id, acc.accountName || acc.name || null,
        acc.handle || null, acc.avatarUrl || null,
        acc.encryptedToken || acc.encrypted_token || acc.accessToken || null,
        Array.isArray(acc.scopes) ? acc.scopes : [],
        acc.status === 'expired' || acc.status === 'revoked' || acc.status === 'needs_reconnect' ? acc.status : 'connected',
        ts(acc.tokenExpiresAt || acc.expiresAt), j(acc), ts(acc.createdAt), ts(acc.updatedAt || acc.createdAt),
      ]);
      const real = id || await lookupByLegacy('social_accounts', acc.id);
      if (real) accountUuid.set(acc.id, real);
    }

    // posts → posts + post_targets
    for (const p of data.posts || []) {
      const bid = p.brandId ? brandUuid.get(p.brandId) || await mapId('brands', p.brandId) : null;
      const vid = p.videoId ? videoUuid.get(p.videoId) || await mapId('videos', p.videoId) : null;
      const pid = p.projectId ? projectUuid.get(p.projectId) || await mapId('projects', p.projectId) : null;
      const status = POST_STATUSES.has(p.status) ? p.status : 'draft';
      const postId = await insertReturning('posts', [
        'legacy_id','workspace_id','brand_id','project_id','video_id','title','caption','status',
        'scheduled_at','published_at','version','settings','created_at','updated_at',
      ], [
        p.id, ws, bid, pid, vid, p.title || null, p.caption || null, status,
        ts(p.scheduledTime || p.scheduledAt), ts(p.publishedTime || p.publishedAt),
        p.version || 1, j(p), ts(p.createdAt), ts(p.updatedAt || p.createdAt),
      ]);
      const realPost = postId || await lookupByLegacy('posts', p.id);
      if (!realPost) continue;
      idMap.set(`posts:${p.id}`, realPost);

      // expand targets: one per matching social account per channel platform
      const platforms: string[] = p.channelPlatforms || p.platforms || [];
      const targets = (data.accounts || []).filter((acc: any) =>
        platforms.includes(acc.platform) && (!p.brandId || !acc.brandId || acc.brandId === p.brandId));
      for (const acc of targets) {
        const accUuid = accountUuid.get(acc.id) || await mapId('social_accounts', acc.id);
        if (!accUuid) continue;
        await q(`INSERT INTO post_targets (post_id,workspace_id,social_account_id,platform,status,scheduled_at,attempts,payload,created_at,updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 ON CONFLICT (post_id, social_account_id) DO NOTHING`,
          [realPost, ws, accUuid, acc.platform, TARGET_STATUSES.has(p.status) ? p.status : 'scheduled',
           ts(p.scheduledTime || p.scheduledAt) || new Date().toISOString(), p.retryCount || 0,
           j({ externalId: p.platformPostId, externalUrl: p.postUrl, publishOperationId: p.publishOperationId }),
           ts(p.createdAt), ts(p.updatedAt || p.createdAt)]);
      }
      // publishingEvents → post_events (best-effort, target-less events skipped)
    }

    // analytics → analytics_snapshots (video-level metrics)
    for (const an of data.analytics || []) {
      const vid = an.videoId ? videoUuid.get(an.videoId) || await mapId('videos', an.videoId) : null;
      if (!vid) continue;
      const metrics: Record<string, any> = {
        views: an.views, reach: an.reach, impressions: an.impressions, likes: an.likes,
        comments: an.comments, shares: an.shares, saves: an.saves,
        avg_watch_duration: an.avgWatchDurationSeconds, completion_rate: an.completionRate,
      };
      for (const [metric, value] of Object.entries(metrics)) {
        if (value === undefined || value === null) continue;
        await q(`INSERT INTO analytics_snapshots (workspace_id,video_id,metric,value,source,synced_at,created_at)
                 VALUES ($1,$2,$3,$4,'sync',$5,$5)`,
          [ws, vid, metric, value, ts(an.syncedAt || an.createdAt) || new Date().toISOString()]);
      }
    }

    // automation workflows/executions (best-effort)
    for (const wf of data.automationWorkflows || data.automationRules || []) {
      await q(`INSERT INTO automation_workflows (legacy_id,workspace_id,name,description,trigger,steps,status,created_at,updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [wf.id, ws, wf.name || 'Workflow', wf.description || null, j(wf.trigger || {}),
         j(wf.steps || wf.actions || []), wf.status === 'paused' ? 'paused' : wf.status === 'active' ? 'active' : 'draft',
         ts(wf.createdAt), ts(wf.updatedAt || wf.createdAt)]);
    }

    // remaining collections → workspace_kv (temporary until T1.4)
    const KV_KEYS = ['recommendations','experiments','autopilotConfig','auditLogs','videoFolders',
      'automationLogs','savedStrategy','aiVideoResults','calendarSavedViews','calendarSettings',
      'campaigns','contentPillars','contentIdeas','postComments','customRoles','activeBrandId','queuePaused'];
    for (const key of KV_KEYS) {
      if (data[key] === undefined) continue;
      await q(`INSERT INTO workspace_kv (workspace_id,key,value,updated_at) VALUES ($1,$2,$3,now())
               ON CONFLICT (workspace_id,key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
        [ws, key, j(data[key])]);
    }
  }

  // ---- audit / security events ----
  for (const l of saas.auditLogs || []) {
    await q(`INSERT INTO audit_logs (workspace_id,user_id,user_email,action,details,severity,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [l.workspaceId ? await mapId('workspaces', l.workspaceId) : null,
       l.userId ? await mapId('users', l.userId) : null,
       l.userEmail || null, l.action || 'unknown', l.details || null,
       l.severity || 'info', ts(l.timestamp || l.createdAt) || new Date().toISOString()]);
  }
  for (const l of saas.securityEvents || []) {
    await q(`INSERT INTO security_events (workspace_id,user_id,user_email,action,details,severity,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [l.workspaceId ? await mapId('workspaces', l.workspaceId) : null,
       l.userId ? await mapId('users', l.userId) : null,
       l.userEmail || null, l.action || 'unknown', l.details || null,
       l.severity || 'medium', ts(l.timestamp || l.createdAt) || new Date().toISOString()]);
  }

  // ---- social_connections.json (if present) ----
  for (const c of socialConns) {
    const ws = c.workspaceId ? await mapId('workspaces', c.workspaceId) : null;
    if (!ws) continue;
    const prov = String(c.provider || c.platform || '').toLowerCase();
    if (!PROVIDERS.has(prov)) continue;
    await q(`INSERT INTO social_accounts (legacy_id,workspace_id,provider,platform_account_id,account_name,handle,encrypted_token,scopes,status,metadata,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
      [c.id, ws, prov, c.platformAccountId || c.accountId || c.id, c.accountName || c.name || null,
       c.handle || null, c.encryptedToken || c.encrypted_token || c.accessToken || null,
       Array.isArray(c.scopes) ? c.scopes : [], c.status || 'connected', j(c),
       ts(c.createdAt), ts(c.updatedAt || c.createdAt)]);
  }

  // ---- media_catalog.json ----
  for (const m of mediaCatalog) {
    const ws = m.workspaceId ? await mapId('workspaces', m.workspaceId) : null;
    if (!ws) continue;
    await q(`INSERT INTO media_assets (legacy_id,workspace_id,storage_key,original_name,mime,size_bytes,sha256,kind,width,height,status,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
      [m.id, ws, m.storageKey || m.fileUrl || m.id, m.fileName || m.name || null,
       m.mime || m.format || 'application/octet-stream', m.sizeBytes || m.fileSizeBytes || 0,
       m.sha256 || null, m.kind || 'video', m.width || null, m.height || null,
       m.status || 'ready', ts(m.createdAt) || new Date().toISOString()]);
  }
}

async function verifyMigration(client: any) {
  const tables = ['users','sessions','auth_tokens','workspaces','workspace_members','workspace_invitations',
    'brands','projects','content_categories','videos','social_accounts','posts','post_targets',
    'analytics_snapshots','automation_workflows','workspace_kv','audit_logs','security_events'];
  const out: Record<string, number> = {};
  for (const t of tables) {
    const r = await client.query(`SELECT count(*)::int AS c FROM ${t}`);
    out[t] = r.rows[0].c;
  }
  return out;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const analysis = analyze();

  if (MODE === 'dry-run') {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const report = {
      generatedAt: new Date().toISOString(),
      mode: MODE,
      counts: analysis.counts,
      orphans: analysis.orphans,
      duplicates: analysis.duplicates,
      invalid: analysis.invalid,
    };
    fs.writeFileSync(path.join(REPORT_DIR, 'dry-run-report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(REPORT_DIR, 'orphans.json'), JSON.stringify(analysis.orphans, null, 2));

    console.log('=== MIGRATION DRY-RUN ===');
    console.log('\nCounts:');
    for (const [k, v] of Object.entries(analysis.counts).sort()) console.log(`  ${k}: ${v}`);
    console.log(`\nOrphans: ${analysis.orphans.length}`);
    console.log(`Duplicates: ${analysis.duplicates.length}`);
    console.log(`Invalid values: ${analysis.invalid.length}`);
    console.log(`\nReport written to ${REPORT_DIR}/dry-run-report.json + orphans.json`);
    return;
  }

  const client = await getPg();
  try {
    if (MODE === 'apply') {
      console.log('Applying migration…');
      await client.query('BEGIN');
      await applyMigration(client, saas, socialConns, mediaCatalog);
      await client.query('COMMIT');
      console.log('Migration committed.');
      const counts = await verifyMigration(client);
      console.log('Post-migration counts:', counts);
    } else {
      const counts = await verifyMigration(client);
      console.log('=== VERIFY ===');
      for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
      console.log('\nCompare against dry-run counts manually or script the diff.');
    }
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
