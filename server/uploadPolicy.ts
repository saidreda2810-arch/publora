import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Centralized video upload policy — persisted in data/upload_policy.json.
 * Plans map to the existing Workspace.plan tiers; enterprise uses the
 * configurable global limit. All sizes stored in bytes.
 */

export interface UploadPolicy {
  uploadsEnabled: boolean;
  globalMaxBytes: number;          // fallback / enterprise cap
  planLimitsBytes: {
    free: number;
    starter: number;
    professional: number;
    enterprise: number;            // 0 = use globalMaxBytes
  };
  workspaceQuotaBytes: number;    // total storage per workspace (0 = unlimited)
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  maxConcurrentUploads: number;
  chunkSizeBytes: number;
  sessionTtlMinutes: number;       // abandon incomplete uploads after this
  resumableEnabled: boolean;
}

export const DEFAULT_UPLOAD_POLICY: UploadPolicy = {
  uploadsEnabled: true,
  globalMaxBytes: 1024 * 1024 * 1024,          // 1 GB
  planLimitsBytes: {
    free: 500 * 1024 * 1024,                    // 500 MB
    starter: 1024 * 1024 * 1024,                // 1 GB
    professional: 2 * 1024 * 1024 * 1024,      // 2 GB
    enterprise: 0,                              // → globalMaxBytes
  },
  workspaceQuotaBytes: 10 * 1024 * 1024 * 1024, // 10 GB per workspace
  allowedMimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
  allowedExtensions: ['.mp4', '.webm', '.mov'],
  maxConcurrentUploads: 3,
  chunkSizeBytes: 8 * 1024 * 1024,              // 8 MB chunks
  sessionTtlMinutes: 120,
  resumableEnabled: true,
};

const POLICY_FILE = path.resolve(process.cwd(), 'data', 'upload_policy.json');
const SESSIONS_DIR = path.resolve(process.cwd(), 'data', 'uploads', '.sessions');
const UPLOADS_DIR = path.resolve(process.cwd(), 'data', 'uploads');
const CATALOG_FILE = path.resolve(process.cwd(), 'data', 'media_catalog.json');

export function getUploadPolicy(): UploadPolicy {
  try {
    if (fs.existsSync(POLICY_FILE)) {
      const raw = JSON.parse(fs.readFileSync(POLICY_FILE, 'utf-8'));
      return { ...DEFAULT_UPLOAD_POLICY, ...raw, planLimitsBytes: { ...DEFAULT_UPLOAD_POLICY.planLimitsBytes, ...(raw.planLimitsBytes || {}) } };
    }
  } catch {}
  return { ...DEFAULT_UPLOAD_POLICY };
}

export function updateUploadPolicy(updates: Partial<UploadPolicy>): { ok: boolean; error?: string; policy?: UploadPolicy } {
  const current = getUploadPolicy();
  const next: UploadPolicy = {
    ...current,
    ...updates,
    planLimitsBytes: { ...current.planLimitsBytes, ...(updates.planLimitsBytes || {}) },
    allowedMimeTypes: updates.allowedMimeTypes ?? current.allowedMimeTypes,
    allowedExtensions: updates.allowedExtensions ?? current.allowedExtensions,
  };

  // ---- validation ----
  const byteFields: (keyof UploadPolicy)[] = ['globalMaxBytes', 'workspaceQuotaBytes', 'chunkSizeBytes'];
  for (const k of byteFields) {
    const v = next[k] as number;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return { ok: false, error: `${k} must be a non-negative number` };
  }
  for (const [k, v] of Object.entries(next.planLimitsBytes)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return { ok: false, error: `planLimitsBytes.${k} must be a non-negative number` };
  }
  if (typeof next.uploadsEnabled !== 'boolean' || typeof next.resumableEnabled !== 'boolean') return { ok: false, error: 'Boolean flags must be true/false' };
  if (!Number.isInteger(next.maxConcurrentUploads) || next.maxConcurrentUploads < 1 || next.maxConcurrentUploads > 20) return { ok: false, error: 'maxConcurrentUploads must be 1-20' };
  if (!Number.isInteger(next.sessionTtlMinutes) || next.sessionTtlMinutes < 5 || next.sessionTtlMinutes > 10080) return { ok: false, error: 'sessionTtlMinutes must be 5-10080' };
  if (next.chunkSizeBytes < 1024 * 1024 || next.chunkSizeBytes > 64 * 1024 * 1024) return { ok: false, error: 'chunkSizeBytes must be 1-64 MB' };
  if (!Array.isArray(next.allowedMimeTypes) || next.allowedMimeTypes.length === 0) return { ok: false, error: 'allowedMimeTypes must be a non-empty array' };
  if (!Array.isArray(next.allowedExtensions) || next.allowedExtensions.length === 0) return { ok: false, error: 'allowedExtensions must be a non-empty array' };

  try {
    fs.mkdirSync(path.dirname(POLICY_FILE), { recursive: true });
    fs.writeFileSync(POLICY_FILE, JSON.stringify(next, null, 2), 'utf-8');
    return { ok: true, policy: next };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to persist policy' };
  }
}

/** Effective per-file limit for a workspace plan (bytes). 0 in planLimits = use global. */
export function planLimitBytes(plan: string | undefined, policy = getUploadPolicy()): number {
  const tier = (plan || 'free') as keyof UploadPolicy['planLimitsBytes'];
  const planLimit = policy.planLimitsBytes[tier] ?? 0;
  const effective = planLimit > 0 ? planLimit : policy.globalMaxBytes;
  return Math.min(effective, policy.globalMaxBytes || effective);
}

/** Total bytes stored for a workspace according to the media catalog. */
export function workspaceUsageBytes(workspaceId: string): number {
  try {
    if (!fs.existsSync(CATALOG_FILE)) return 0;
    const catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
    return catalog
      .filter((m: any) => m.workspaceId === workspaceId)
      .reduce((s: number, m: any) => s + (m.sizeBytes || 0), 0);
  } catch {
    return 0;
  }
}

export function workspaceVideoCount(workspaceId: string): number {
  try {
    if (!fs.existsSync(CATALOG_FILE)) return 0;
    const catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
    return catalog.filter((m: any) => m.workspaceId === workspaceId && (m.mimeType || '').startsWith('video/')).length;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/* Chunked resumable upload sessions                                   */
/* ------------------------------------------------------------------ */

export interface UploadSession {
  id: string;
  workspaceId: string;
  userId: string;
  userEmail: string;
  filename: string;        // sanitized original name
  mimeType: string;
  sizeBytes: number;
  chunkSize: number;
  totalChunks: number;
  received: number[];      // chunk indexes confirmed on disk
  createdAt: number;
  updatedAt: number;
}

function sessionDir(id: string) { return path.join(SESSIONS_DIR, id); }
function sessionMetaPath(id: string) { return path.join(sessionDir(id), 'meta.json'); }

export function listActiveSessions(): UploadSession[] {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return [];
    return fs.readdirSync(SESSIONS_DIR)
      .map((d) => {
        try { return JSON.parse(fs.readFileSync(sessionMetaPath(d), 'utf-8')) as UploadSession; } catch { return null; }
      })
      .filter((s): s is UploadSession => !!s);
  } catch { return []; }
}

export function getSession(id: string): UploadSession | null {
  try {
    return JSON.parse(fs.readFileSync(sessionMetaPath(id), 'utf-8'));
  } catch { return null; }
}

export function saveSession(s: UploadSession) {
  fs.mkdirSync(sessionDir(s.id), { recursive: true });
  s.updatedAt = Date.now();
  fs.writeFileSync(sessionMetaPath(s.id), JSON.stringify(s, null, 2));
}

export function deleteSession(id: string) {
  try { fs.rmSync(sessionDir(id), { recursive: true, force: true }); } catch {}
}

export function createSession(input: Omit<UploadSession, 'id' | 'received' | 'createdAt' | 'updatedAt'>): UploadSession {
  const id = `ups_${crypto.randomUUID()}`;
  const s: UploadSession = { ...input, id, received: [], createdAt: Date.now(), updatedAt: Date.now() };
  fs.mkdirSync(sessionDir(id), { recursive: true });
  saveSession(s);
  return s;
}

/** Remove sessions older than TTL (called lazily on session ops). */
export function sweepExpiredSessions(policy = getUploadPolicy()) {
  const ttl = policy.sessionTtlMinutes * 60 * 1000;
  const now = Date.now();
  for (const s of listActiveSessions()) {
    if (now - s.updatedAt > ttl) deleteSession(s.id);
  }
}

export function activeSessionCount(): number {
  return listActiveSessions().length;
}

/* Magic-byte sniffing — verifies the file is really the claimed video type. */
export function sniffVideoType(buf: Buffer): 'mp4' | 'webm' | 'quicktime' | null {
  if (buf.length < 12) return null;
  // ISO BMFF: bytes 4-8 = 'ftyp'
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii');
    if (brand === 'qt  ') return 'quicktime';
    return 'mp4'; // includes mov-in-mp4-container; mime decided by extension
  }
  // EBML (WebM/MKV)
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  return null;
}

export function chunkPath(sessionId: string, index: number) {
  return path.join(sessionDir(sessionId), `chunk_${String(index).padStart(5, '0')}`);
}
