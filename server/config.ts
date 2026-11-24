import path from 'node:path';

/**
 * server/config.ts — single typed source for filesystem layout and
 * env-driven limits. Precedence: explicit env var > SRA_DATA_DIR-derived
 * default > cwd/data. All modules must use these helpers instead of
 * hardcoding process.cwd()/data paths.
 */

/** Root data directory (metadata, JSON stores, sessions, backups). */
export const DATA_DIR = path.resolve(process.env.SRA_DATA_DIR || path.join(process.cwd(), 'data'));

/** Uploaded media files. UPLOAD_DIR wins when set (absolute or relative). */
export const UPLOADS_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads'));

/** Local object-storage root when STORAGE_DRIVER=local. */
export const STORAGE_LOCAL_DIR = path.resolve(process.env.STORAGE_LOCAL_DIR || path.join(DATA_DIR, 'storage'));

/** Local upload-policy file (JSON driver only). */
export const UPLOAD_POLICY_FILE = path.join(DATA_DIR, 'upload_policy.json');

/** Chunked-upload session metadata dir (JSON driver only). */
export const UPLOAD_SESSIONS_DIR = path.join(UPLOADS_DIR, '.sessions');

/** Media catalog file (JSON driver only). */
export const MEDIA_CATALOG_FILE = path.join(DATA_DIR, 'media_catalog.json');

/** Backup output directory. */
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

/**
 * Server-enforced absolute ceiling for a single uploaded file, in bytes.
 * MAX_UPLOAD_SIZE_BYTES env; null when unset/invalid → no env ceiling.
 * The stored admin policy can tighten limits but never exceed this.
 */
export function envMaxUploadBytes(): number | null {
  const raw = process.env.MAX_UPLOAD_SIZE_BYTES;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/**
 * Optional env allow-list of MIME types. When set, uploads are restricted
 * to this list IN ADDITION to the stored policy (intersection, not union).
 * Returns null when unset/empty → policy list applies unchanged.
 */
export function envAllowedMimeTypes(): string[] | null {
  const raw = process.env.ALLOWED_MIME_TYPES;
  if (!raw) return null;
  const list = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.length ? list : null;
}
