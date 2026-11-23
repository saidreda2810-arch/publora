import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { globalStoresEnabled, gsGet, gsSet } from './globalStores.ts';

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
  if (globalStoresEnabled()) {
    const raw = gsGet<any>('upload_policy', null);
    if (raw) return { ...DEFAULT_UPLOAD_POLICY, ...raw, planLimitsBytes: { ...DEFAULT_UPLOAD_POLICY.planLimitsBytes, ...(raw.planLimitsBytes || {}) } };
    return { ...DEFAULT_UPLOAD_POLICY };
  }
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

  if (globalStoresEnabled()) {
    gsSet('upload_policy', next);
    return { ok: true, policy: next };
  }
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

/** Total bytes stored for a workspace — from media_assets records (WP2). */
export function workspaceUsageBytes(workspaceId: string): number {
  try {
    // Lazy require to avoid a module cycle at import time.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { usageBytes } = require('./mediaAssets.ts');
    return usageBytes(workspaceId);
  } catch {
    return 0;
  }
}

export function workspaceVideoCount(workspaceId: string): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { videoCount } = require('./mediaAssets.ts');
    return videoCount(workspaceId);
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

// WP10: when DB_DRIVER=pg, session metadata lives in upload_sessions and
// chunk payloads in upload_session_chunks — safe across multiple instances.
// Otherwise the legacy per-instance disk layout under data/uploads/.sessions.
import { query } from './db/client.ts';
const usePgSessions = () => process.env.DB_DRIVER === 'pg';

function sessionDir(id: string) { return path.join(SESSIONS_DIR, id); }
function sessionMetaPath(id: string) { return path.join(sessionDir(id), 'meta.json'); }

const SESSION_SELECT = `SELECT s.id, s.filename, s.mime_type, s.size_bytes, s.chunk_size, s.total_chunks,
  s.received_chunks, s.created_at, s.updated_at, s.user_email,
  w.legacy_id AS ws_legacy, u.legacy_id AS user_legacy
  FROM upload_sessions s
  JOIN workspaces w ON w.id = s.workspace_id
  JOIN users u ON u.id = s.user_id`;

function mapPgSession(r: any): UploadSession {
  return {
    id: r.id,
    workspaceId: r.ws_legacy,
    userId: r.user_legacy,
    userEmail: r.user_email || '',
    filename: r.filename,
    mimeType: r.mime_type,
    sizeBytes: Number(r.size_bytes),
    chunkSize: r.chunk_size,
    totalChunks: r.total_chunks,
    received: Array.isArray(r.received_chunks) ? r.received_chunks.map(Number).sort((a: number, b: number) => a - b) : [],
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
  };
}

export async function listActiveSessions(): Promise<UploadSession[]> {
  if (usePgSessions()) {
    try {
      const r = await query(`${SESSION_SELECT} WHERE s.status='active' ORDER BY s.created_at`);
      return r.rows.map(mapPgSession);
    } catch { return []; }
  }
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return [];
    return fs.readdirSync(SESSIONS_DIR)
      .map((d) => {
        try { return JSON.parse(fs.readFileSync(sessionMetaPath(d), 'utf-8')) as UploadSession; } catch { return null; }
      })
      .filter((s): s is UploadSession => !!s);
  } catch { return []; }
}

export async function getSession(id: string): Promise<UploadSession | null> {
  if (usePgSessions()) {
    try {
      const r = await query(`${SESSION_SELECT} WHERE s.id=$1 AND s.status='active'`, [id]);
      return r.rows[0] ? mapPgSession(r.rows[0]) : null;
    } catch { return null; }
  }
  try {
    return JSON.parse(fs.readFileSync(sessionMetaPath(id), 'utf-8'));
  } catch { return null; }
}

export async function saveSession(s: UploadSession) {
  s.updatedAt = Date.now();
  if (usePgSessions()) {
    try {
      const ttlMs = getUploadPolicy().sessionTtlMinutes * 60 * 1000;
      await query(
        `UPDATE upload_sessions SET received_chunks=$2, updated_at=now(), expires_at=now() + ($3 || ' milliseconds')::interval
         WHERE id=$1`,
        [s.id, JSON.stringify(s.received), String(ttlMs)],
      );
    } catch (e) { console.error('[uploadPolicy] pg saveSession failed:', e); }
    return;
  }
  fs.mkdirSync(sessionDir(s.id), { recursive: true });
  fs.writeFileSync(sessionMetaPath(s.id), JSON.stringify(s, null, 2));
}

export async function deleteSession(id: string) {
  if (usePgSessions()) {
    try { await query('DELETE FROM upload_sessions WHERE id=$1', [id]); } catch {}
    return;
  }
  try { fs.rmSync(sessionDir(id), { recursive: true, force: true }); } catch {}
}

export async function createSession(input: Omit<UploadSession, 'id' | 'received' | 'createdAt' | 'updatedAt'>): Promise<UploadSession> {
  const id = `ups_${crypto.randomUUID()}`;
  const s: UploadSession = { ...input, id, received: [], createdAt: Date.now(), updatedAt: Date.now() };
  if (usePgSessions()) {
    try {
      const ttlMs = getUploadPolicy().sessionTtlMinutes * 60 * 1000;
      await query(
        `INSERT INTO upload_sessions(id,workspace_id,user_id,user_email,filename,mime_type,size_bytes,chunk_size,total_chunks,received_chunks,status,expires_at)
         SELECT $1, w.id, u.id, $4, $5, $6, $7, $8, $9, '[]', 'active', now() + ($10 || ' milliseconds')::interval
         FROM workspaces w, users u
         WHERE (w.legacy_id=$2 OR w.id::text=$2) AND (u.legacy_id=$3 OR u.id::text=$3)`,
        [id, input.workspaceId, input.userId, input.userEmail, input.filename, input.mimeType, input.sizeBytes, input.chunkSize, input.totalChunks, String(ttlMs)],
      );
    } catch (e) {
      console.error('[uploadPolicy] pg createSession failed:', e);
      throw e;
    }
    return s;
  }
  fs.mkdirSync(sessionDir(id), { recursive: true });
  await saveSession(s);
  return s;
}

/** Remove sessions older than TTL (called lazily on session ops). */
export async function sweepExpiredSessions(policy = getUploadPolicy()) {
  if (usePgSessions()) {
    try {
      await query(
        `UPDATE upload_sessions SET status='expired', updated_at=now()
         WHERE status='active' AND expires_at < now()`,
      );
      await query(
        `DELETE FROM upload_session_chunks c USING upload_sessions s
         WHERE c.session_id = s.id AND s.status='expired'`,
      );
    } catch {}
    return;
  }
  const ttl = policy.sessionTtlMinutes * 60 * 1000;
  const now = Date.now();
  for (const s of await listActiveSessions()) {
    if (now - s.updatedAt > ttl) await deleteSession(s.id);
  }
}

export async function activeSessionCount(): Promise<number> {
  if (usePgSessions()) {
    try {
      const r = await query(`SELECT count(*)::int AS n FROM upload_sessions WHERE status='active'`);
      return r.rows[0]?.n ?? 0;
    } catch { return 0; }
  }
  return (await listActiveSessions()).length;
}

/* Chunk payload storage — disk in JSON mode, upload_session_chunks in PG mode. */
export async function storeChunk(sessionId: string, index: number, buf: Buffer) {
  if (usePgSessions()) {
    await query(
      `INSERT INTO upload_session_chunks(session_id, chunk_index, data) VALUES($1,$2,$3)
       ON CONFLICT (session_id, chunk_index) DO UPDATE SET data=EXCLUDED.data`,
      [sessionId, index, buf],
    );
    return;
  }
  fs.writeFileSync(chunkPath(sessionId, index), buf);
}

export async function readChunk(sessionId: string, index: number): Promise<Buffer | null> {
  if (usePgSessions()) {
    try {
      const r = await query(`SELECT data FROM upload_session_chunks WHERE session_id=$1 AND chunk_index=$2`, [sessionId, index]);
      return r.rows[0]?.data ?? null;
    } catch { return null; }
  }
  const p = chunkPath(sessionId, index);
  try { return fs.readFileSync(p); } catch { return null; }
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
