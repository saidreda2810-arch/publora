import express, { Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { requireAuth, AuthenticatedRequest } from './authRouter.ts';
import { logAuditEvent } from './saasDb.ts';
import {
  getUploadPolicy, planLimitBytes, workspaceUsageBytes, workspaceVideoCount,
  createSession, getSession, saveSession, deleteSession, listActiveSessions,
  sweepExpiredSessions, activeSessionCount, sniffVideoType, chunkPath,
  UploadSession,
} from './uploadPolicy.ts';

export const mediaRouter = express.Router();

const UPLOADS_DIR = path.resolve(process.cwd(), 'data', 'uploads');
const MEDIA_CATALOG_FILE = path.resolve(process.cwd(), 'data', 'media_catalog.json');

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
  const remainingBytes = quotaBytes > 0 ? Math.max(0, quotaBytes - usedBytes) : null;
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

  const catalog = loadMediaCatalog();
  const workspaceMedia = catalog.filter((m) => m.workspaceId === workspaceId);

  res.json({
    success: true,
    count: workspaceMedia.length,
    media: workspaceMedia,
  });
});

// 2. POST /api/media/upload - Upload file with validation
mediaRouter.post('/upload', (req: AuthenticatedRequest, res: Response) => {
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

  // Generate unique safe storage name
  const ext = path.extname(sanitizedOriginalName) || (mimeType.startsWith('video/') ? '.mp4' : '.png');
  const storedFilename = `${crypto.randomUUID()}${ext}`;
  const targetPath = path.join(UPLOADS_DIR, storedFilename);

  try {
    fs.writeFileSync(targetPath, fileBuffer);

    const asset: MediaAsset = {
      id: `med_${crypto.randomUUID()}`,
      workspaceId,
      userId: user.id,
      filename: storedFilename,
      originalName: sanitizedOriginalName,
      mimeType,
      sizeBytes: actualSize,
      url: `/uploads/${storedFilename}`,
      createdAt: new Date().toISOString(),
    };

    const catalog = loadMediaCatalog();
    catalog.unshift(asset);
    saveMediaCatalog(catalog);

    logAuditEvent({
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
    console.error('Failed to write media asset to disk:', err);
    res.status(500).json({ success: false, error: 'Failed to persist media asset to storage' });
  }
});

/* ------------------------------------------------------------------ */
/* Chunked resumable uploads                                           */
/* ------------------------------------------------------------------ */

// POST /api/media/chunked/init — create an upload session
mediaRouter.post('/chunked/init', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  const user = req.user!;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'Workspace context missing' });

  const policy = getUploadPolicy();
  if (!policy.uploadsEnabled) return res.status(403).json({ success: false, error: 'Uploads are disabled by the administrator.' });
  if (!policy.resumableEnabled) return res.status(400).json({ success: false, error: 'Resumable uploads are disabled.' });
  sweepExpiredSessions(policy);
  if (activeSessionCount() >= policy.maxConcurrentUploads * 4) {
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
    if (used + sizeBytes > policy.workspaceQuotaBytes) {
      return res.status(413).json({ success: false, error: `Workspace storage quota exceeded (${fmtBytes(used)} of ${fmtBytes(policy.workspaceQuotaBytes)} used).` });
    }
  }

  const session = createSession({
    workspaceId, userId: user.id, userEmail: user.email,
    filename: path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_'),
    mimeType, sizeBytes,
    chunkSize: policy.chunkSizeBytes,
    totalChunks: Math.ceil(sizeBytes / policy.chunkSizeBytes),
  });
  res.status(201).json({ success: true, sessionId: session.id, chunkSize: session.chunkSize, totalChunks: session.totalChunks });
});

// GET /api/media/chunked/:sid/status — which chunks are already stored
mediaRouter.get('/chunked/:sid/status', (req: AuthenticatedRequest, res: Response) => {
  const s = getSession(req.params.sid);
  if (!s) return res.status(404).json({ success: false, error: 'Upload session not found or expired' });
  if (s.workspaceId !== req.workspace?.id && req.user!.role !== 'platform_admin') {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  sweepExpiredSessions();
  res.json({ success: true, received: s.received, totalChunks: s.totalChunks, chunkSize: s.chunkSize });
});

// PUT /api/media/chunked/:sid/chunk/:idx — raw octet-stream body
mediaRouter.put('/chunked/:sid/chunk/:idx',
  express.raw({ type: 'application/octet-stream', limit: '70mb' }),
  (req: AuthenticatedRequest, res: Response) => {
    const s = getSession(req.params.sid);
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
    fs.writeFileSync(chunkPath(s.id, idx), buf);
    if (!s.received.includes(idx)) { s.received.push(idx); s.received.sort((a, b) => a - b); }
    saveSession(s);
    res.json({ success: true, received: s.received.length, totalChunks: s.totalChunks });
  });

// POST /api/media/chunked/:sid/complete — assemble + verify + catalog
mediaRouter.post('/chunked/:sid/complete', (req: AuthenticatedRequest, res: Response) => {
  const s = getSession(req.params.sid);
  if (!s) return res.status(404).json({ success: false, error: 'Upload session not found or expired' });
  if (s.workspaceId !== req.workspace?.id && req.user!.role !== 'platform_admin') {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  if (s.received.length !== s.totalChunks) {
    return res.status(409).json({ success: false, error: `Incomplete upload: ${s.received.length}/${s.totalChunks} chunks received`, received: s.received });
  }

  const storedFilename = `${crypto.randomUUID()}${path.extname(s.filename)}`;
  const targetPath = path.join(UPLOADS_DIR, storedFilename);
  const out = fs.createWriteStream(targetPath);
  for (let i = 0; i < s.totalChunks; i++) {
    const chunkFile = chunkPath(s.id, i);
    if (!fs.existsSync(chunkFile)) {
      out.destroy();
      fs.unlinkSync(targetPath);
      return res.status(409).json({ success: false, error: `Missing chunk ${i}` });
    }
    out.write(fs.readFileSync(chunkFile));
  }
  out.end();

  out.on('finish', () => {
    const stat = fs.statSync(targetPath);
    if (stat.size !== s.sizeBytes) {
      fs.unlinkSync(targetPath);
      return res.status(422).json({ success: false, error: `Assembled size ${stat.size} does not match declared ${s.sizeBytes}` });
    }
    // sniff first 16 bytes for video-type verification
    const fd = fs.openSync(targetPath, 'r');
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    if (!sniffVideoType(head)) {
      fs.unlinkSync(targetPath);
      deleteSession(s.id);
      return res.status(400).json({ success: false, error: 'File content does not match a supported video format.' });
    }

    const asset: MediaAsset = {
      id: `med_${crypto.randomUUID()}`,
      workspaceId: s.workspaceId,
      userId: s.userId,
      filename: storedFilename,
      originalName: s.filename,
      mimeType: s.mimeType,
      sizeBytes: s.sizeBytes,
      url: `/uploads/${storedFilename}`,
      createdAt: new Date().toISOString(),
    };
    const catalog = loadMediaCatalog();
    catalog.unshift(asset);
    saveMediaCatalog(catalog);
    deleteSession(s.id);

    logAuditEvent({
      workspaceId: s.workspaceId, userId: s.userId, userEmail: s.userEmail,
      action: 'media_uploaded',
      details: `Chunked upload "${s.filename}" (${fmtBytes(s.sizeBytes)})`,
    });
    res.status(201).json({ success: true, asset, message: 'Upload complete' });
  });
  out.on('error', () => res.status(500).json({ success: false, error: 'Failed to assemble file' }));
});

// DELETE /api/media/chunked/:sid — cancel/abandon session
mediaRouter.delete('/chunked/:sid', (req: AuthenticatedRequest, res: Response) => {
  const s = getSession(req.params.sid);
  if (!s) return res.status(404).json({ success: false, error: 'Session not found' });
  if (s.workspaceId !== req.workspace?.id && req.user!.role !== 'platform_admin') {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  deleteSession(s.id);
  res.json({ success: true, message: 'Upload session cancelled' });
});

// 3. DELETE /api/media/:id - Remove media asset
mediaRouter.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspace?.id;
  const user = req.user!;
  const mediaId = req.params.id;

  const catalog = loadMediaCatalog();
  const assetIndex = catalog.findIndex((m) => m.id === mediaId);

  if (assetIndex === -1) {
    return res.status(404).json({ success: false, error: 'Media asset not found' });
  }

  const asset = catalog[assetIndex];

  // Check tenancy & ownership
  if (asset.workspaceId !== workspaceId && user.role !== 'platform_admin') {
    return res.status(403).json({ success: false, error: 'Access denied to this media asset' });
  }

  // Remove file from disk
  const targetPath = path.join(UPLOADS_DIR, asset.filename);
  if (fs.existsSync(targetPath)) {
    try {
      fs.unlinkSync(targetPath);
    } catch (e) {
      console.warn(`Failed to unlink file ${targetPath}:`, e);
    }
  }

  // Remove from catalog
  catalog.splice(assetIndex, 1);
  saveMediaCatalog(catalog);

  logAuditEvent({
    workspaceId: asset.workspaceId,
    userId: user.id,
    userEmail: user.email,
    action: 'media_deleted',
    details: `Deleted media asset "${asset.originalName}" (${asset.id})`,
  });

  res.json({
    success: true,
    message: `Asset ${asset.originalName} removed successfully`,
  });
});
