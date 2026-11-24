/**
 * mediaAssets.ts — WP2: media_assets store (JSON-backed until WP4 PgRepo).
 *
 * Fields mirror the future Postgres table: id, workspace_id, storage_key,
 * sha256, mime, size_bytes, width/height/duration_ms (nullable), status,
 * created_by, created_at, deleted_at. Also keeps legacy catalog fields
 * (filename, originalName, url) for frontend compatibility.
 *
 * Storage bytes live in StorageProvider (local dir or S3), never in DB rows.
 */
import fs from 'fs';
import { DATA_DIR } from './config.ts';
import path from 'path';
import crypto from 'crypto';
import { getStorageProvider } from './storage/storageProvider.ts';
import { globalStoresEnabled, gsGet, gsSet, gsTransact } from './globalStores.ts';

const ASSETS_FILE = path.join(DATA_DIR, 'media_assets.json');
const LEGACY_CATALOG = path.join(DATA_DIR, 'media_catalog.json');
const SIGNING_KEY_FILE = path.join(DATA_DIR, '.media_signing_key');

export interface MediaAssetRecord {
  id: string;
  workspaceId: string;
  userId: string;
  storageKey: string;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  status: 'active' | 'deleted';
  originalName?: string;
  filename?: string;   // legacy compat
  url?: string;        // legacy compat (last signed URL is NOT stored; computed on read)
  createdBy: string;
  createdAt: string;
  deletedAt?: string | null;
}

let cache: MediaAssetRecord[] | null = null;

function load(): MediaAssetRecord[] {
  if (cache) return cache;
  if (globalStoresEnabled()) {
    // No local cache in pg mode — gsGet reads the refreshed globalStores
    // cache so cross-instance writes propagate on the refresh interval.
    return gsGet<MediaAssetRecord[]>('media_assets', []);
  }
  let rows: MediaAssetRecord[] = [];
  if (fs.existsSync(ASSETS_FILE)) {
    try { rows = JSON.parse(fs.readFileSync(ASSETS_FILE, 'utf8')); } catch { rows = []; }
  }
  // One-time migration of legacy media_catalog.json entries (metadata only —
  // their bytes stay in data/uploads until WP5 media relocation).
  if (rows.length === 0 && fs.existsSync(LEGACY_CATALOG)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_CATALOG, 'utf8'));
      rows = legacy.map((m: any) => ({
        id: m.id || `med_${crypto.randomUUID()}`,
        workspaceId: m.workspaceId,
        userId: m.userId,
        storageKey: `legacy/${m.filename || m.id}`,
        sha256: '', // unknown until re-hashed; dedupe treats '' as unique
        mimeType: m.mimeType,
        sizeBytes: m.sizeBytes || 0,
        status: 'active',
        originalName: m.originalName,
        filename: m.filename,
        url: m.url,
        createdBy: m.userId,
        createdAt: m.createdAt,
        deletedAt: null,
      }));
      save(rows);
    } catch { /* leave empty */ }
  }
  cache = rows;
  return rows;
}

function save(rows: MediaAssetRecord[]) {
  if (globalStoresEnabled()) {
    gsSet('media_assets', rows);
    cache = rows;
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ASSETS_FILE, JSON.stringify(rows, null, 2));
  cache = rows;
}

export function listAssets(workspaceId: string, includeDeleted = false): MediaAssetRecord[] {
  return load().filter((a) => a.workspaceId === workspaceId && (includeDeleted || a.status === 'active'));
}

export function getAsset(id: string): MediaAssetRecord | null {
  return load().find((a) => a.id === id) || null;
}

export function findBySha256(workspaceId: string, sha256: string): MediaAssetRecord | null {
  return load().find((a) => a.workspaceId === workspaceId && a.sha256 === sha256 && a.status === 'active') || null;
}

export function usageBytes(workspaceId: string): number {
  return listAssets(workspaceId).reduce((s, a) => s + (a.sizeBytes || 0), 0);
}

export function videoCount(workspaceId: string): number {
  return listAssets(workspaceId).filter((a) => (a.mimeType || '').startsWith('video/')).length;
}

export interface CreateAssetInput {
  workspaceId: string; userId: string; storageKey: string; sha256: string;
  mimeType: string; sizeBytes: number; originalName?: string;
  width?: number | null; height?: number | null; durationMs?: number | null;
}

export interface CreateAssetOptions {
  /** Workspace quota ceiling in bytes; enforced atomically with the insert. */
  quotaBytes?: number | null;
  /** Bytes reserved by in-flight uploads (chunked sessions) — counted toward quota. */
  reservedBytes?: number;
}

/** Thrown when the atomic quota check rejects an insert. */
export class MediaQuotaExceededError extends Error {
  code = 'QUOTA_EXCEEDED';
  usedBytes: number;
  quotaBytes: number;
  constructor(used: number, quota: number) {
    super(`Workspace storage quota exceeded. Used ${used} of ${quota} bytes.`);
    this.usedBytes = used;
    this.quotaBytes = quota;
  }
}

function quotaGuard(rows: MediaAssetRecord[], input: CreateAssetInput, opts?: CreateAssetOptions) {
  const quota = opts?.quotaBytes ?? 0;
  if (!quota || quota <= 0) return;
  const used = rows
    .filter((a) => a.workspaceId === input.workspaceId && a.status === 'active')
    .reduce((s, a) => s + (a.sizeBytes || 0), 0);
  const reserved = opts?.reservedBytes ?? 0;
  if (used + reserved + input.sizeBytes > quota) throw new MediaQuotaExceededError(used + reserved, quota);
}

export async function createAsset(input: CreateAssetInput, opts?: CreateAssetOptions): Promise<MediaAssetRecord> {
  const make = (id?: string): MediaAssetRecord => ({
    id: id || `med_${crypto.randomUUID()}`,
    workspaceId: input.workspaceId,
    userId: input.userId,
    storageKey: input.storageKey,
    sha256: input.sha256,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    width: input.width ?? null,
    height: input.height ?? null,
    durationMs: input.durationMs ?? null,
    status: 'active',
    originalName: input.originalName,
    filename: path.basename(input.storageKey),
    createdBy: input.userId,
    createdAt: new Date().toISOString(),
    deletedAt: null,
  });

  if (globalStoresEnabled()) {
    // Atomic read-modify-write: dedupe + quota + insert happen under the
    // same row lock, so concurrent uploads cannot lose rows or race past
    // the workspace quota.
    let result: MediaAssetRecord | undefined;
    await gsTransact<MediaAssetRecord[]>('media_assets', (rows) => {
      const list = Array.isArray(rows) ? rows : [];
      const dup = input.sha256
        ? list.find((a) => a.workspaceId === input.workspaceId && a.sha256 === input.sha256 && a.status === 'active')
        : undefined;
      if (dup) { result = dup; return list; }
      quotaGuard(list, input, opts);
      result = make();
      return [result, ...list];
    });
    return result!;
  }

  const rows = load();
  const dup = input.sha256
    ? rows.find((a) => a.workspaceId === input.workspaceId && a.sha256 === input.sha256 && a.status === 'active')
    : undefined;
  if (dup) return dup;
  quotaGuard(rows, input, opts);
  const rec = make();
  rows.unshift(rec);
  save(rows);
  return rec;
}

/** Soft delete; hard delete left to the lifecycle job (WP8). */
export async function softDeleteAsset(id: string): Promise<MediaAssetRecord | null> {
  const apply = (rows: MediaAssetRecord[]): { rows: MediaAssetRecord[]; rec: MediaAssetRecord | null } => {
    const rec = rows.find((a) => a.id === id);
    if (!rec || rec.status === 'deleted') return { rows, rec: null };
    rec.status = 'deleted';
    rec.deletedAt = new Date().toISOString();
    return { rows, rec };
  };
  if (globalStoresEnabled()) {
    let result: MediaAssetRecord | null = null;
    await gsTransact<MediaAssetRecord[]>('media_assets', (rows) => {
      const list = Array.isArray(rows) ? rows : [];
      const { rows: next, rec } = apply(list);
      result = rec;
      return next;
    });
    return result;
  }
  const rows = load();
  const { rec } = apply(rows);
  if (rec) save(rows);
  return rec;
}

/** Report-only orphan scan: storage objects with no asset row, rows whose object is missing. */
export async function orphanReport(): Promise<{ orphanObjects: string[]; missingObjects: string[] }> {
  const store = getStorageProvider();
  const objects = await store.list('ws/');
  const rows = load().filter((a) => a.status === 'active' && a.storageKey && !a.storageKey.startsWith('legacy/'));
  const keys = new Set(rows.map((a) => a.storageKey));
  const objSet = new Set(objects);
  return {
    orphanObjects: objects.filter((o) => !keys.has(o)),
    missingObjects: [...keys].filter((k) => !objSet.has(k)),
  };
}

/* ------------------------- signed URLs ------------------------------ */

let signingKey: Buffer | null = null;
function getSigningKey(): Buffer {
  if (signingKey) return signingKey;
  const envKey = process.env.MEDIA_SIGNING_SECRET;
  if (envKey) { signingKey = crypto.createHash('sha256').update(envKey).digest(); return signingKey; }
  if (fs.existsSync(SIGNING_KEY_FILE)) {
    signingKey = Buffer.from(fs.readFileSync(SIGNING_KEY_FILE, 'utf8').trim(), 'hex');
    return signingKey;
  }
  const key = crypto.randomBytes(32);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SIGNING_KEY_FILE, key.toString('hex'), { mode: 0o600 });
  signingKey = key;
  return key;
}

export function signMediaKey(storageKey: string, ttlSeconds = 900): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto.createHmac('sha256', getSigningKey()).update(`${storageKey}:${exp}`).digest('hex');
  return `/api/media/object?key=${encodeURIComponent(storageKey)}&exp=${exp}&sig=${sig}`;
}

export function verifyMediaSignature(storageKey: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = crypto.createHmac('sha256', getSigningKey()).update(`${storageKey}:${exp}`).digest('hex');
  const a = Buffer.from(sig, 'utf8'); const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function assetPublicUrl(rec: MediaAssetRecord): string {
  // Legacy rows keep their stored URL; new rows get a fresh 15-min signed URL.
  if (rec.url && rec.storageKey.startsWith('legacy/')) return rec.url;
  return signMediaKey(rec.storageKey);
}

export function resetMediaAssetsForTests(): void { cache = null; }
