import express, { Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { requireAuth, AuthenticatedRequest } from './authRouter.ts';
import { getWorkspaceData } from './saasDb.ts';
import { getRepos } from './repos/index.ts';
import { authStore } from './authStore.ts';
import { getStorageProvider } from './storage/storageProvider.ts';
import {
  createAsset, findBySha256, getAsset, listAssets, softDeleteAsset,
  signMediaKey, verifyMediaSignature, assetPublicUrl, orphanReport,
  usageBytes as assetsUsageBytes, videoCount as assetsVideoCount,
} from './mediaAssets.ts';
import {
  getUploadPolicy, planLimitBytes, workspaceUsageBytes, workspaceVideoCount, pendingUploadBytes,
  createSession, getSession, saveSession, deleteSession, listActiveSessions,
  sweepExpiredSessions, activeSessionCount, sniffVideoType, storeChunk, readChunk,
  UploadSession,
} from './uploadPolicy.ts';

export const mediaRouter = express.Router();

import { UPLOADS_DIR, MEDIA_CATALOG_FILE } from './config.ts';

// Ensure upload directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface MediaAsset {
  id: string;
  workspaceId: string;
  userId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
}

function loadMediaCatalog(): MediaAsset[] {
  if (fs.existsSync(MEDIA_CATALOG_FILE)) {
    try {
      const content = fs.readFileSync(MEDIA_CATALOG_FILE, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }
  return [];
}

function saveMediaCatalog(catalog: MediaAsset[]) {
  fs.writeFileSync(MEDIA_CATALOG_FILE, JSON.stringify(catalog, null, 2), 'utf-8');
}

const ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'image/png',
  'image/jpeg',
  'image/webp',
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // legacy fallback; policy governs real limit

const fmtBytes = (b: number) =>
  b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;

/**
 * WP2: persist bytes via StorageProvider + media_assets record.
 * Dedupes by sha256 within the workspace; returns the record plus a fresh
 * signed URL in the legacy `url` field for frontend compatibility.
 */
async function persistAsset(input: {
  workspaceId: string; userId: string; buffer: Buffer;
  originalName: string; mimeType: string;
  quotaBytes?: number | null;
  reservedBytes?: number;
}): Promise<any> {
  const sha256 = crypto.createHash('sha256').update(input.buffer).digest('hex');
  const existing = findBySha256(input.workspaceId, sha256);
  if (existing) return { ...existing, url: assetPublicUrl(existing), deduplicated: true };

  const ext = path.extname(input.originalName) || '';
  const storageKey = `ws/${input.workspaceId}/media/${sha256}${ext}`;
  const store = getStorageProvider();
  if (!(await store.head(storageKey))) {
    await store.put(storageKey, input.buffer, input.mimeType);
  }
  const rec = await createAsset({
    workspaceId: input.workspaceId, userId: input.userId, storageKey, sha256,
    mimeType: input.mimeType, sizeBytes: input.buffer.length, originalName: input.originalName,
  }, { quotaBytes: input.quotaBytes, reservedBytes: input.reservedBytes });
  return { ...rec, url: assetPublicUrl(rec), deduplicated: false };
}

// GET /api/media/object — signed-URL object serving (replaces public /uploads for new assets)
mediaRouter.get('/object', async (req: AuthenticatedRequest, res: Response) => {
  const key = String(req.query.key || '');
  const exp = Number(req.query.exp);
  const sig = String(req.query.sig || '');
  if (!key.startsWith('ws/') || !verifyMediaSignature(key, exp, sig)) {
    return res.status(403).json({ success: false, error: 'Invalid or expired media URL' });
  }
  // Tenant check: key embeds workspaceId — caller must be member of it.
  const wsId = key.split('/')[1];
  const ws = (req as any).workspace;
  if (ws?.id !== wsId && req.user!.role !== 'platform_admin') {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  try {
    const stream = await getStorageProvider().getStream(key);
    const head = await getStorageProvider().head(key);
    res.setHeader('Content-Type', head?.contentType || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment');
    (stream as any).pipe(res);
  } catch {
    res.status(404).json({ success: false, error: 'Object not found' });
  }
});

// GET /api/media/gc/report — orphan scan, report-only (WP2.7)
mediaRouter.get('/gc/report', async (req: AuthenticatedRequest, res: Response) => {
  if (req.user!.role !== 'platform_admin') return res.status(403).json({ success: false, error: 'Admin only' });
  const report = await orphanReport();
  res.json({ success: true, ...report, counts: { orphanObjects: report.orphanObjects.length, missingObjects: report.missingObjects.length } });
});

// Enforce auth on all media routes
mediaRouter.use(requireAuth);

// 0. GET /api/media/policy - effective upload policy for the caller's workspace
mediaRouter.get('/policy', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'Workspace context missing' });
  const policy = getUploadPolicy();
  const plan = (req.workspace as any)?.plan || 'free';
  const maxBytes = planLimitBytes(plan, policy);
  const usedBytes = workspaceUsageBytes(workspaceId);
  const quotaBytes = policy.workspaceQuotaBytes;
  const remainingBytes = quotaBytes > 0 && usedBytes !== null ? Math.max(0, quotaBytes - usedBytes) : null;
  res.json({
    success: true,
    policy: {
      uploadsEnabled: policy.uploadsEnabled,
      plan,
      maxFileBytes: maxBytes,
      globalMaxBytes: policy.globalMaxBytes,
      quotaBytes: quotaBytes || null,
      usedBytes,
      remainingBytes,
      videoCount: workspaceVideoCount(workspaceId),
      allowedMimeTypes: policy.allowedMimeTypes.filter((m) => m.startsWith('video/')),
      allowedExtensions: policy.allowedExtensions,
      chunkSizeBytes: policy.chunkSizeBytes,
      resumableEnabled: policy.resumableEnabled,
      maxConcurrentUploads: policy.maxConcurrentUploads,
    },
  });
});

// 1. GET /api/media - List media assets in workspace
mediaRouter.get('/', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  if (!workspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace context missing' });
  }

  const catalog = listAssets(workspaceId).map((a) => ({ ...a, url: assetPublicUrl(a) }));

  res.json({
    success: true,
    count: catalog.length,
    media: catalog,
  });
});

// 2. POST /api/media/upload - Upload file with validation
mediaRouter.post('/upload', async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  const user = req.user!;

  if (!workspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace context missing' });
  }

  const { filename, mimeType, dataBase64, sizeBytes } = req.body;

  // ---- upload policy enforcement (server-side, never trusts client) ----
  const policy = getUploadPolicy();
  if (!policy.uploadsEnabled) {
    return res.status(403).json({ success: false, error: 'Video uploads are currently disabled by the platform administrator.' });
  }
  const plan = (req.workspace as any)?.plan || 'free';
  const maxBytes = planLimitBytes(plan, policy);
  if (typeof sizeBytes === 'number' && sizeBytes > maxBytes) {
    return res.status(413).json({
      success: false,
      error: `File exceeds your plan limit of ${fmtBytes(maxBytes)} (${plan} plan).`,
      limitBytes: maxBytes,
      plan,
    });
  }

  if (!filename || !mimeType || !dataBase64) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: filename, mimeType, dataBase64',
    });
  }

  // Validate MIME type against policy
  const videoOnly = mimeType.toLowerCase().startsWith('video/');
  const allowed = videoOnly
    ? policy.allowedMimeTypes.map((m) => m.toLowerCase())
    : ALLOWED_MIME_TYPES;
  if (!allowed.includes(mimeType.toLowerCase())) {
    return res.status(400).json({
      success: false,
      error: `Invalid file format: ${mimeType}. Allowed formats: ${allowed.join(', ')}`,
    });
  }

  // Extension must match an allowed video extension for video uploads
  const fileExt = path.extname(path.basename(filename)).toLowerCase();
  if (videoOnly && !policy.allowedExtensions.includes(fileExt)) {
    return res.status(400).json({ success: false, error: `File extension "${fileExt}" is not allowed.` });
  }

  // Prevent path traversal
  const sanitizedOriginalName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');

  // Decode buffer
  let fileBuffer: Buffer;
  try {
    // Strip possible data:image/...;base64, prefix if provided
    const base64Data = dataBase64.replace(/^data:[^;]+;base64,/, '');
    fileBuffer = Buffer.from(base64Data, 'base64');
  } catch {
    return res.status(400).json({ success: false, error: 'Malformed base64 file data' });
  }

  // Check file size against plan limit + workspace quota
  const actualSize = fileBuffer.length;
  if (actualSize > maxBytes) {
    return res.status(413).json({
      success: false,
      error: `Your video is ${fmtBytes(actualSize)}, but your ${plan} plan allows a maximum of ${fmtBytes(maxBytes)}.`,
      limitBytes: maxBytes,
      plan,
    });
  }
  if (policy.workspaceQuotaBytes > 0) {
    const used = workspaceUsageBytes(workspaceId);
    if (used === null) {
      return res.status(503).json({ success: false, error: 'Storage usage statistics are unavailable — upload rejected. Retry shortly.' });
    }
    if (used + actualSize > policy.workspaceQuotaBytes) {
      return res.status(413).json({
        success: false,
        error: `Workspace storage quota exceeded. Used ${fmtBytes(used)} of ${fmtBytes(policy.workspaceQuotaBytes)}.`,
        quotaBytes: policy.workspaceQuotaBytes,
        usedBytes: used,
      });
    }
  }

  // Magic-byte verification for video uploads (anti-spoofing)
  if (videoOnly) {
    const sniffed = sniffVideoType(fileBuffer);
    if (!sniffed) {
      return res.status(400).json({ success: false, error: 'File content does not match a supported video format.' });
    }
  }

  try {
    const asset = await persistAsset({
      workspaceId, userId: user.id, buffer: fileBuffer,
      originalName: sanitizedOriginalName, mimeType,
      quotaBytes: policy.workspaceQuotaBytes || null,
      reservedBytes: await pendingUploadBytes(workspaceId),
    });

    await authStore.logAudit({
      workspaceId,
      userId: user.id,
      userEmail: user.email,
      action: 'media_uploaded',
      details: `Uploaded asset "${sanitizedOriginalName}" (${(actualSize / 1024).toFixed(1)} KB)`,
    });

    res.status(201).json({
      success: true,
      asset,
      message: 'File successfully processed and stored',
    });
  } catch (err: any) {
    if (err?.code === 'QUOTA_EXCEEDED') {
      return res.status(413).json({ success: false, error: err.message, quotaBytes: err.quotaBytes, usedBytes: err.usedBytes });
    }
    console.error('Failed to write media asset to disk:', err);
    res.status(500).json({ success: false, error: 'Failed to persist media asset to storage' });
  }
});

/* ------------------------------------------------------------------ */
/* Chunked resumable uploads                                           */
/* ------------------------------------------------------------------ */

// POST /api/media/chunked/init — create an upload session
mediaRouter.post('/chunked/init', async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  const user = req.user!;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'Workspace context missing' });

  const policy = getUploadPolicy();
  if (!policy.uploadsEnabled) return res.status(403).json({ success: false, error: 'Uploads are disabled by the administrator.' });
  if (!policy.resumableEnabled) return res.status(400).json({ success: false, error: 'Resumable uploads are disabled.' });
  await sweepExpiredSessions(policy);
  if ((await activeSessionCount()) >= policy.maxConcurrentUploads * 4) {
    return res.status(429).json({ success: false, error: 'Too many concurrent upload sessions. Try again shortly.' });
  }

  const { filename, mimeType, sizeBytes } = req.body || {};
  if (!filename || !mimeType || typeof sizeBytes !== 'number' || sizeBytes <= 0) {
    return res.status(400).json({ success: false, error: 'Missing filename, mimeType or sizeBytes' });
  }
  const plan = (req.workspace as any)?.plan || 'free';
  const maxBytes = planLimitBytes(plan, policy);
  if (sizeBytes > maxBytes) {
    return res.status(413).json({ success: false, error: `File exceeds your ${plan} plan limit of ${fmtBytes(maxBytes)}.`, limitBytes: maxBytes, plan });
  }
  if (!policy.allowedMimeTypes.map((m) => m.toLowerCase()).includes(mimeType.toLowerCase())) {
    return res.status(400).json({ success: false, error: `Format ${mimeType} is not allowed.` });
  }
  const ext = path.extname(path.basename(filename)).toLowerCase();
  if (!policy.allowedExtensions.includes(ext)) {
    return res.status(400).json({ success: false, error: `Extension "${ext}" is not allowed.` });
  }
  if (policy.workspaceQuotaBytes > 0) {
    const used = workspaceUsageBytes(workspaceId);
    if (used === null) {
      return res.status(503).json({ success: false, error: 'Storage usage statistics are unavailable — upload rejected. Retry shortly.' });
    }
    const reserved = await pendingUploadBytes(workspaceId);
    if (used + reserved + sizeBytes > policy.workspaceQuotaBytes) {
      return res.status(413).json({ success: false, error: `Workspace storage quota exceeded (${fmtBytes(used + reserved)} of ${fmtBytes(policy.workspaceQuotaBytes)} used or reserved).` });
    }
  }

  const session = await createSession({
    workspaceId, userId: user.id, userEmail: user.email,
    filename: path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_'),
    mimeType, sizeBytes,
    chunkSize: policy.chunkSizeBytes,
    totalChunks: Math.ceil(sizeBytes / policy.chunkSizeBytes),
  });
  res.status(201).json({ success: true, sessionId: session.id, chunkSize: session.chunkSize, totalChunks: session.totalChunks });
});

// GET /api/media/chunked/:sid/status — which chunks are already stored
mediaRouter.get('/chunked/:sid/status', async (req: AuthenticatedRequest, res: Response) => {
  const s = await getSession(req.params.sid);
  if (!s) return res.status(404).json({ success: false, error: 'Upload session not found or expired' });
  if (s.workspaceId !== req.workspace?.id && req.user!.role !== 'platform_admin') {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  await sweepExpiredSessions();
  res.json({ success: true, received: s.received, totalChunks: s.totalChunks, chunkSize: s.chunkSize });
});

// PUT /api/media/chunked/:sid/chunk/:idx — raw octet-stream body
mediaRouter.put('/chunked/:sid/chunk/:idx',
  express.raw({ type: 'application/octet-stream', limit: '70mb' }),
  async (req: AuthenticatedRequest, res: Response) => {
    const s = await getSession(req.params.sid);
    if (!s) return res.status(404).json({ success: false, error: 'Upload session not found or expired' });
    if (s.workspaceId !== req.workspace?.id && req.user!.role !== 'platform_admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const idx = parseInt(req.params.idx, 10);
    if (!Number.isInteger(idx) || idx < 0 || idx >= s.totalChunks) {
      return res.status(400).json({ success: false, error: 'Invalid chunk index' });
    }
    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ success: false, error: 'Empty chunk' });
    }
    const expected = idx === s.totalChunks - 1 ? s.sizeBytes - s.chunkSize * (s.totalChunks - 1) : s.chunkSize;
    if (buf.length !== expected) {
      return res.status(400).json({ success: false, error: `Chunk size mismatch: expected ${expected} bytes, got ${buf.length}` });
    }
    await storeChunk(s.id, idx, buf);
    if (!s.received.includes(idx)) { s.received.push(idx); s.received.sort((a, b) => a - b); }
    await saveSession(s);
    res.json({ success: true, received: s.received.length, totalChunks: s.totalChunks });
  });

// POST /api/media/chunked/:sid/complete — assemble + verify + catalog
mediaRouter.post('/chunked/:sid/complete', async (req: AuthenticatedRequest, res: Response) => {
  const s = await getSession(req.params.sid);
  if (!s) return res.status(404).json({ success: false, error: 'Upload session not found or expired' });
  if (s.workspaceId !== req.workspace?.id && req.user!.role !== 'platform_admin') {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  if (s.received.length !== s.totalChunks) {
    return res.status(409).json({ success: false, error: `Incomplete upload: ${s.received.length}/${s.totalChunks} chunks received`, received: s.received });
  }

  // Assemble chunks into a single buffer (disk in JSON mode, PG bytea in pg mode).
  const parts: Buffer[] = [];
  for (let i = 0; i < s.totalChunks; i++) {
    const chunk = await readChunk(s.id, i);
    if (!chunk) {
      return res.status(409).json({ success: false, error: `Missing chunk ${i}` });
    }
    parts.push(chunk);
  }
  const assembled = Buffer.concat(parts);
  if (assembled.length !== s.sizeBytes) {
    return res.status(422).json({ success: false, error: `Assembled size ${assembled.length} does not match declared ${s.sizeBytes}` });
  }
  const head = assembled.subarray(0, 16);
  if (!sniffVideoType(head)) {
    await deleteSession(s.id);
    return res.status(400).json({ success: false, error: 'File content does not match a supported video format.' });
  }

  persistAsset({
    workspaceId: s.workspaceId, userId: s.userId, buffer: assembled,
    originalName: s.filename, mimeType: s.mimeType,
    quotaBytes: getUploadPolicy().workspaceQuotaBytes || null,
    reservedBytes: await pendingUploadBytes(s.workspaceId, s.id),
  }).then(async (asset) => {
    await deleteSession(s.id);
    await authStore.logAudit({
      workspaceId: s.workspaceId, userId: s.userId, userEmail: s.userEmail,
      action: 'media_uploaded',
      details: `Chunked upload "${s.filename}" (${fmtBytes(s.sizeBytes)})`,
    });
    res.status(201).json({ success: true, asset, message: 'Upload complete' });
  }).catch((err: any) => {
    if (err?.code === 'QUOTA_EXCEEDED') {
      return res.status(413).json({ success: false, error: err.message, quotaBytes: err.quotaBytes, usedBytes: err.usedBytes });
    }
    res.status(500).json({ success: false, error: 'Failed to persist media asset' });
  });
});

// DELETE /api/media/chunked/:sid — cancel/abandon session
mediaRouter.delete('/chunked/:sid', async (req: AuthenticatedRequest, res: Response) => {
  const s = await getSession(req.params.sid);
  if (!s) return res.status(404).json({ success: false, error: 'Session not found' });
  if (s.workspaceId !== req.workspace?.id && req.user!.role !== 'platform_admin') {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  await deleteSession(s.id);
  res.json({ success: true, message: 'Upload session cancelled' });
});

// 3. DELETE /api/media/:id - soft delete (WP2); refuses while referenced
mediaRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  const user = req.user!;
  const mediaId = req.params.id;

  const asset = getAsset(mediaId);
  if (!asset) {
    return res.status(404).json({ success: false, error: 'Media asset not found' });
  }
  if (asset.workspaceId !== workspaceId && user.role !== 'platform_admin') {
    return res.status(404).json({ success: false, error: 'Media asset not found' }); // 404 not 403 — no existence leak
  }

  // Reference guard: scheduled/published posts and videos may point at this asset.
  const wsData: any = process.env.DB_DRIVER === 'pg' ? await getRepos().workspaceState.get(workspaceId!) : getWorkspaceData(workspaceId!);
  const refs: string[] = [];
  const needle = asset.storageKey || asset.filename || '';
  for (const v of (wsData.videos || []) as any[]) {
    if (v.fileUrl && (v.fileUrl === needle || v.fileUrl === asset.url || v.fileUrl === `/uploads/${asset.filename}`)) refs.push(`video:${v.id}`);
  }
  for (const p of (wsData.posts || []) as any[]) {
    if (p.status === 'scheduled' || p.status === 'publishing') {
      const s = JSON.stringify(p);
      if (needle && s.includes(needle)) refs.push(`post:${p.id}`);
    }
  }
  if (refs.length > 0) {
    return res.status(409).json({ success: false, error: 'Asset is referenced by scheduled content', references: refs.slice(0, 10) });
  }

  const deleted = await softDeleteAsset(mediaId);
  if (!deleted) return res.status(404).json({ success: false, error: 'Media asset not found' });

  // Best-effort object removal; legacy files under uploads/ kept for WP5 relocation.
  if (asset.storageKey && !asset.storageKey.startsWith('legacy/')) {
    try { await getStorageProvider().delete(asset.storageKey); } catch (e) { console.warn('storage delete failed:', e); }
  } else if (asset.filename) {
    const legacyPath = path.join(UPLOADS_DIR, asset.filename);
    try { if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath); } catch {}
  }

  await authStore.logAudit({
    workspaceId: asset.workspaceId,
    userId: user.id,
    userEmail: user.email,
    action: 'media_deleted',
    details: `Soft-deleted media asset "${asset.originalName || asset.filename}" (${asset.id})`,
  });

  res.json({ success: true, message: `Asset ${asset.originalName || asset.filename} removed successfully` });
});
