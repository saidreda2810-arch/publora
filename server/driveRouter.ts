import express, { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { requireAuth, AuthenticatedRequest } from './authRouter.ts';
import { getOAuthConfig, encryptToken, decryptToken, storePendingAttempt, getPendingAttempt, removePendingAttempt, ConnectionAttempt } from './oauthStore.ts';
import { logAuditEvent } from './saasDb.ts';

export const driveRouter = express.Router();

// ---- Drive connection store (per-user, workspace-scoped) ----
interface DriveConnection {
  id: string;
  userId: string;
  workspaceId: string;
  googleAccountId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted?: string;
  tokenExpiresAt: string;
  scopes: string[];
  status: 'connected' | 'expired' | 'revoked' | 'error';
  statusMessage?: string;
  connectedAt: string;
  lastSyncAt?: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CONN_FILE = path.join(DATA_DIR, 'drive_connections.json');

function loadConns(): DriveConnection[] {
  try { return JSON.parse(fs.readFileSync(CONN_FILE, 'utf8')); } catch { return []; }
}
function saveConns(conns: DriveConnection[]) {
  fs.writeFileSync(CONN_FILE, JSON.stringify(conns, null, 2));
}

// Least-privilege scope: read-only Drive access for browsing + downloading user-selected files
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

function base64URLEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function sha256(s: string): Buffer { return crypto.createHash('sha256').update(s).digest(); }

function getBaseUrl(req: Request): string {
  return process.env.SHARED_APP_URL || process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

// 1. Start OAuth — requires auth + workspace
// Select Brand step removed: Drive connection is per-user; brand chosen at import time.
driveRouter.post('/authorize-url', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const config = getOAuthConfig();
  if (!config.googleClientId || !config.googleClientSecret) {
    return res.status(503).json({ success: false, error: 'Google OAuth is not configured. Contact your administrator.' });
  }
  const wsId = req.workspace?.id;
  const userId = req.user?.id;
  if (!wsId || !userId) return res.status(400).json({ success: false, error: 'Workspace required' });

  const redirectUri = `${getBaseUrl(req)}/api/drive/callback`;
  const stateNonce = crypto.randomBytes(16).toString('hex');
  const codeVerifier = base64URLEncode(crypto.randomBytes(32));
  const codeChallenge = base64URLEncode(sha256(codeVerifier));

  const state = Buffer.from(JSON.stringify({
    nonce: stateNonce, provider: 'google_drive', workspaceId: wsId, userId,
    timestamp: Date.now(),
  })).toString('base64url');

  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    include_granted_scopes: 'true',
  });

  storePendingAttempt({
    id: `att_drive_${Date.now()}`,
    provider: 'youtube', // reuse attempt store; provider field unused for drive flow
    brandId: 'drive',
    workspaceId: wsId,
    state,
    codeVerifier,
    redirectUri,
    createdAt: Date.now(),
  } as ConnectionAttempt);

  res.json({ success: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

// 2. OAuth callback (public — protected by state nonce)
driveRouter.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error: oauthError } = req.query as Record<string, string>;
  const fail = (msg: string) => res.redirect(`/drive?error=${encodeURIComponent(msg)}`);

  if (oauthError) return fail(oauthError === 'access_denied' ? 'Authorization was cancelled.' : oauthError);
  if (!code || !state) return fail('Missing authorization code or state.');

  const attempt = getPendingAttempt(state);
  if (!attempt) return fail('Invalid or expired state session. Please try connecting again.');
  removePendingAttempt(state);

  const config = getOAuthConfig();
  const redirectUri = attempt.redirectUri || `${getBaseUrl(req)}/api/drive/callback`;

  try {
    // Exchange code
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: attempt.codeVerifier || '',
      }),
    });
    const tokens = await tokenResp.json();
    if (!tokenResp.ok || !tokens.access_token) {
      return fail(tokens.error_description || 'Token exchange failed.');
    }

    // Fetch Google account identity
    const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const gUser = userResp.ok ? await userResp.json() : {};

    const wsId = attempt.workspaceId || '';
    const userId = (attempt as any).userId || '';
    const conns = loadConns();

    // Upsert: one Drive connection per user+workspace+google account
    const existing = conns.findIndex((c) => c.userId === userId && c.workspaceId === wsId && c.googleAccountId === (gUser.id || ''));
    const conn: DriveConnection = {
      id: existing >= 0 ? conns[existing].id : `drv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      workspaceId: wsId,
      googleAccountId: gUser.id || '',
      email: gUser.email || '',
      displayName: gUser.name,
      avatarUrl: gUser.picture,
      accessTokenEncrypted: encryptToken(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? encryptToken(tokens.refresh_token) : (existing >= 0 ? conns[existing].refreshTokenEncrypted : undefined),
      tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      scopes: (tokens.scope || DRIVE_SCOPE).split(' '),
      status: 'connected',
      connectedAt: existing >= 0 ? conns[existing].connectedAt : new Date().toISOString(),
      lastSyncAt: new Date().toISOString(),
    };
    if (existing >= 0) conns[existing] = conn; else conns.push(conn);
    saveConns(conns);

    logAuditEvent({ workspaceId: wsId, userId, action: 'drive_connected', details: `Google Drive connected: ${conn.email}` });
    res.redirect('/drive?connected=1');
  } catch (e: any) {
    fail(e.message || 'Connection failed.');
  }
});

// 3. List connections for current user+workspace (sanitized — no tokens)
driveRouter.get('/connections', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  const userId = req.user?.id;
  const conns = loadConns()
    .filter((c) => c.workspaceId === wsId && c.userId === userId)
    .map(({ accessTokenEncrypted, refreshTokenEncrypted, ...safe }) => safe);
  res.json({ success: true, connections: conns });
});

// 4. Disconnect — revoke + remove credentials, preserve imported videos
driveRouter.delete('/connections/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  const userId = req.user?.id;
  const conns = loadConns();
  const idx = conns.findIndex((c) => c.id === req.params.id && c.workspaceId === wsId && c.userId === userId);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Connection not found.' });

  const conn = conns[idx];
  // Best-effort revocation
  try {
    const token = decryptToken(conn.accessTokenEncrypted);
    if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' });
  } catch { /* revocation best-effort */ }

  conns.splice(idx, 1);
  saveConns(conns);
  logAuditEvent({ workspaceId: wsId, userId, action: 'drive_disconnected', details: `Google Drive disconnected: ${conn.email}` });
  res.json({ success: true, message: 'Google Drive disconnected. Imported videos are preserved.' });
});

// ---- Token refresh ----
async function getValidToken(conn: DriveConnection): Promise<string | null> {
  try {
    const token = decryptToken(conn.accessTokenEncrypted);
    if (new Date(conn.tokenExpiresAt).getTime() > Date.now() + 60000) return token;
    const refresh = conn.refreshTokenEncrypted ? decryptToken(conn.refreshTokenEncrypted) : null;
    if (!refresh) return null;
    const config = getOAuthConfig();
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        refresh_token: refresh,
        grant_type: 'refresh_token',
      }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.access_token) {
      // Mark expired/revoked
      const conns = loadConns();
      const c = conns.find((x) => x.id === conn.id);
      if (c) { c.status = 'expired'; c.statusMessage = data.error_description || 'Token refresh failed'; saveConns(conns); }
      return null;
    }
    const conns = loadConns();
    const c = conns.find((x) => x.id === conn.id);
    if (c) {
      c.accessTokenEncrypted = encryptToken(data.access_token);
      c.tokenExpiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
      c.status = 'connected';
      saveConns(conns);
    }
    return data.access_token;
  } catch { return null; }
}

// 5. Browse Drive files (server-side proxy — token never leaves server)
driveRouter.get('/files', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  const userId = req.user?.id;
  const conn = loadConns().find((c) => c.workspaceId === wsId && c.userId === userId && c.status === 'connected');
  if (!conn) return res.status(404).json({ success: false, error: 'No Google Drive connection found.' });

  const token = await getValidToken(conn);
  if (!token) return res.status(401).json({ success: false, error: 'Google authorization expired — please reconnect.' });

  const { folderId = 'root', q, videosOnly, pageSize = 50, pageToken, orderBy } = req.query as Record<string, string>;

  // Build Drive API query
  const clauses: string[] = [`'${folderId}' in parents`, 'trashed = false'];
  if (videosOnly === 'true') clauses.push(`mimeType contains 'video/'`);
  if (q) clauses.push(`name contains '${String(q).replace(/'/g, "\\'")}'`);

  const params = new URLSearchParams({
    q: clauses.join(' and '),
    fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, thumbnailLink, parents, md5Checksum, capabilities(canDownload))',
    pageSize: String(Math.min(Number(pageSize) || 50, 100)),
    orderBy: orderBy || 'folder,name_natural',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  if (pageToken) params.set('pageToken', pageToken);

  try {
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json();
    if (!resp.ok) {
      const msg = data.error?.message || 'Drive API error';
      if (resp.status === 401 || resp.status === 403) {
        const conns = loadConns();
        const c = conns.find((x) => x.id === conn.id);
        if (c) { c.status = 'expired'; c.statusMessage = msg; saveConns(conns); }
        return res.status(401).json({ success: false, error: 'Google authorization expired or lacks permission — please reconnect.' });
      }
      return res.status(resp.status).json({ success: false, error: msg });
    }
    // Update last sync
    const conns = loadConns();
    const c = conns.find((x) => x.id === conn.id);
    if (c) { c.lastSyncAt = new Date().toISOString(); saveConns(conns); }
    res.json({ success: true, files: data.files || [], nextPageToken: data.nextPageToken });
  } catch (e: any) {
    console.error('[drive] files request failed:', e);
    res.status(500).json({ success: false, error: 'Drive request failed' });
  }
});

// 5b. Get file metadata (for import eligibility checks)
driveRouter.get('/files/:fileId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  const userId = req.user?.id;
  const conn = loadConns().find((c) => c.workspaceId === wsId && c.userId === userId);
  if (!conn) return res.status(404).json({ success: false, error: 'No Google Drive connection found.' });
  const token = await getValidToken(conn);
  if (!token) return res.status(401).json({ success: false, error: 'Authorization expired — reconnect.' });

  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(req.params.fileId)}?fields=id,name,mimeType,size,modifiedTime,md5Checksum,parents,capabilities(canDownload),thumbnailLink&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  if (!resp.ok) return res.status(resp.status).json({ success: false, error: data.error?.message || 'File not accessible' });
  res.json({ success: true, file: data });
});

// ==================== PHASE 4: IMPORT PIPELINE ====================
import { getWorkspaceData, saveWorkspaceData } from './saasDb.ts';
import { getUploadPolicy, planLimitBytes, workspaceUsageBytes, workspaceVideoCount } from './uploadPolicy.ts';

const IMPORTS_FILE = path.join(DATA_DIR, 'drive_imports.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

interface ImportJob {
  id: string;
  connectionId: string;
  userId: string;
  workspaceId: string;
  driveFileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  brandId: string;
  projectId?: string;
  destination: 'library';
  status: 'queued' | 'downloading' | 'verifying' | 'extracting' | 'ready' | 'failed' | 'cancelled';
  progressBytes: number;
  error?: string;
  videoId?: string;
  createdAt: string;
  updatedAt: string;
}

function loadJobs(): ImportJob[] { try { return JSON.parse(fs.readFileSync(IMPORTS_FILE, 'utf8')); } catch { return []; } }
function saveJobs(jobs: ImportJob[]) { fs.writeFileSync(IMPORTS_FILE, JSON.stringify(jobs, null, 2)); }
function updateJob(id: string, patch: Partial<ImportJob>) {
  const jobs = loadJobs();
  const j = jobs.find((x) => x.id === id);
  if (j) { Object.assign(j, patch, { updatedAt: new Date().toISOString() }); saveJobs(jobs); }
}

const VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/x-matroska', 'video/mpeg']);
const MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024; // 2GB hard cap; policy may be lower

// Start import jobs (one per file)
driveRouter.post('/import', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  const userId = req.user?.id;
  if (!wsId || !userId) return res.status(400).json({ success: false, error: 'Workspace required' });

  const { fileIds, brandId, projectId, destination = 'library' } = req.body as any;
  if (!Array.isArray(fileIds) || fileIds.length === 0) return res.status(400).json({ success: false, error: 'fileIds required' });
  if (fileIds.length > 20) return res.status(400).json({ success: false, error: 'Max 20 files per import' });

  const data = getWorkspaceData(wsId);
  const brand = (data.brands || []).find((b: any) => b.id === brandId);
  if (!brand) return res.status(403).json({ success: false, error: 'Brand not found in this workspace' });
  if (projectId && !(data.projects || []).some((p: any) => p.id === projectId && p.brandId === brandId)) {
    return res.status(403).json({ success: false, error: 'Project not found for this brand' });
  }

  const conn = loadConns().find((c) => c.workspaceId === wsId && c.userId === userId && c.status === 'connected');
  if (!conn) return res.status(404).json({ success: false, error: 'No Google Drive connection found.' });

  // Quota pre-check (policy-driven, server-side)
  const policy = getUploadPolicy();
  const used = workspaceUsageBytes(wsId);
  const quotaBytes = policy.workspaceQuotaBytes > 0 ? policy.workspaceQuotaBytes : policy.globalMaxBytes;

  const token = await getValidToken(conn);
  if (!token) return res.status(401).json({ success: false, error: 'Authorization expired — reconnect.' });

  const jobs: ImportJob[] = [];
  const rejected: any[] = [];

  for (const fileId of fileIds) {
    // Duplicate check: same drive file already imported by this connection
    const existing = loadJobs().find((j) => j.connectionId === conn.id && j.driveFileId === fileId && (j.status === 'ready' || j.status === 'downloading' || j.status === 'queued' || j.status === 'verifying' || j.status === 'extracting'));
    if (existing) { rejected.push({ fileId, reason: `Already imported or in progress (job ${existing.id})` }); continue; }

    // Fetch metadata
    const metaResp = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,md5Checksum&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
    const meta = metaResp.ok ? await metaResp.json() : null;
    if (!meta) { rejected.push({ fileId, reason: 'File not accessible or deleted' }); continue; }
    if (!VIDEO_MIMES.has(meta.mimeType)) { rejected.push({ fileId: meta.id, name: meta.name, reason: `Unsupported type: ${meta.mimeType}` }); continue; }
    const size = Number(meta.size || 0);
    if (size <= 0) { rejected.push({ fileId: meta.id, name: meta.name, reason: 'Unknown file size' }); continue; }
    if (size > MAX_IMPORT_BYTES) { rejected.push({ fileId: meta.id, name: meta.name, reason: 'Exceeds 2GB limit' }); continue; }
    if (quotaBytes > 0 && used + size > quotaBytes) { rejected.push({ fileId: meta.id, name: meta.name, reason: 'Workspace storage quota exceeded' }); continue; }
    if (policy.globalMaxBytes > 0 && size > policy.globalMaxBytes) { rejected.push({ fileId: meta.id, name: meta.name, reason: `Exceeds max file size (${Math.round(policy.globalMaxBytes / 1024 / 1024)}MB)` }); continue; }

    const job: ImportJob = {
      id: `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      connectionId: conn.id, userId, workspaceId: wsId,
      driveFileId: meta.id, fileName: meta.name, mimeType: meta.mimeType, sizeBytes: size,
      brandId, projectId, destination, status: 'queued', progressBytes: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    jobs.push(job);
    const all = loadJobs(); all.push(job); saveJobs(all);
    // Kick off background download
    void runImport(job.id, token);
  }

  res.json({ success: true, jobs, rejected });
});

async function runImport(jobId: string, token: string) {
  const job = loadJobs().find((j) => j.id === jobId);
  if (!job) return;
  const tmpPath = path.join(UPLOADS_DIR, `drive_${job.driveFileId}_${Date.now()}.tmp`);
  const finalPath = path.join(UPLOADS_DIR, `drive_${job.driveFileId}_${Date.now()}.${job.fileName.split('.').pop() || 'mp4'}`);
  try {
    updateJob(jobId, { status: 'downloading' });
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(job.driveFileId)}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok || !resp.body) throw new Error(`Download failed: HTTP ${resp.status}`);
    const writer = fs.createWriteStream(tmpPath);
    let received = 0;
    const reader = (resp.body as any).getReader ? (resp.body as any).getReader() : null;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        writer.write(Buffer.from(value));
        if (received % (5 * 1024 * 1024) < value.length) updateJob(jobId, { progressBytes: received });
      }
    } else {
      const buf = Buffer.from(await resp.arrayBuffer());
      received = buf.length;
      writer.write(buf);
    }
    await new Promise((r) => writer.end(r));
    if (received !== job.sizeBytes && job.sizeBytes > 0) {
      // Tolerate minor mismatch; flag if wildly different
      if (Math.abs(received - job.sizeBytes) > job.sizeBytes * 0.01) throw new Error(`Size mismatch: got ${received}, expected ${job.sizeBytes}`);
    }

    updateJob(jobId, { status: 'verifying', progressBytes: received });
    // Magic-byte validation for video containers
    const head = Buffer.alloc(16);
    const fd = fs.openSync(tmpPath, 'r');
    fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
    const isMp4 = head.slice(4, 8).toString() === 'ftyp';
    const isWebm = head.slice(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    const isAvi = head.slice(0, 4).toString() === 'RIFF' && head.slice(8, 12).toString() === 'AVI ';
    if (!isMp4 && !isWebm && !isAvi && !job.mimeType.includes('matroska')) {
      fs.unlinkSync(tmpPath);
      throw new Error('File content does not match a supported video format');
    }

    fs.renameSync(tmpPath, finalPath);
    updateJob(jobId, { status: 'extracting' });

    // Create VideoAsset in workspace
    const wsData = getWorkspaceData(job.workspaceId);
    const videoId = `vid_drive_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const ext = job.fileName.split('.').pop() || 'mp4';
    const video = {
      id: videoId,
      brandId: job.brandId,
      projectId: job.projectId,
      title: job.fileName.replace(/\.[^.]+$/, ''),
      description: `Imported from Google Drive (${job.driveFileId})`,
      durationSeconds: 0, // extracted later by metadata pipeline
      aspectRatio: '9:16',
      hookType: 'visual_reveal',
      editingPace: 'medium',
      sceneChangesCount: 0,
      tags: [],
      fileUrl: `/api/media/file/${path.basename(finalPath)}`,
      fileName: job.fileName,
      fileSizeBytes: received,
      format: ext,
      sourceDriveFileId: job.driveFileId,
      sourceDriveAccount: job.connectionId,
      createdAt: new Date().toISOString(),
    };
    saveWorkspaceData(job.workspaceId, { ...wsData, videos: [...(wsData.videos || []), video] });
    updateJob(jobId, { status: 'ready', videoId, progressBytes: received });
  } catch (e: any) {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
    updateJob(jobId, { status: 'failed', error: e.message || 'Import failed' });
  }
}

// List import jobs for workspace
driveRouter.get('/imports', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  const jobs = loadJobs().filter((j) => j.workspaceId === wsId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
  res.json({ success: true, jobs });
});

// Job detail / retry
driveRouter.get('/imports/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  const job = loadJobs().find((j) => j.id === req.params.id && j.workspaceId === wsId);
  if (!job) return res.status(404).json({ success: false, error: 'Import not found' });
  res.json({ success: true, job });
});

// Retry failed job
driveRouter.post('/imports/:id/retry', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const wsId = req.workspace?.id;
  const userId = req.user?.id;
  const job = loadJobs().find((j) => j.id === req.params.id && j.workspaceId === wsId && j.userId === userId);
  if (!job) return res.status(404).json({ success: false, error: 'Import not found' });
  if (job.status !== 'failed' && job.status !== 'cancelled') return res.status(400).json({ success: false, error: 'Only failed or cancelled jobs can be retried' });
  const conn = loadConns().find((c) => c.id === job.connectionId);
  if (!conn) return res.status(404).json({ success: false, error: 'Source connection removed' });
  const token = await getValidToken(conn);
  if (!token) return res.status(401).json({ success: false, error: 'Authorization expired' });
  updateJob(job.id, { status: 'queued', error: undefined, progressBytes: 0 });
  void runImport(job.id, token);
  res.json({ success: true, message: 'Import retried' });
});
