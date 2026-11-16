/**
 * StorageProvider — WP1 abstraction over object storage.
 * Implementations: LocalStorageProvider (dev/current files) and
 * S3StorageProvider (any S3-compatible endpoint: AWS S3, R2, MinIO).
 *
 * Env (S3 provider):
 *   S3_ENDPOINT        e.g. https://<acct>.r2.cloudflarestorage.com or http://localhost:9000
 *   S3_REGION          default 'auto'
 *   S3_BUCKET          required
 *   S3_ACCESS_KEY_ID   required
 *   S3_SECRET_ACCESS_KEY required
 *   S3_FORCE_PATH_STYLE 'true' for MinIO
 *   S3_PUBLIC_BASE_URL optional public/CDN base for unsigned URLs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface StorageProvider {
  put(key: string, body: Buffer | Uint8Array, contentType?: string): Promise<void>;
  getStream(key: string): Promise<NodeJS.ReadableStream>;
  head(key: string): Promise<{ size: number; contentType?: string } | null>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  list(prefix: string): Promise<string[]>;
}

/* ------------------------------ Local ------------------------------ */

export class LocalStorageProvider implements StorageProvider {
  constructor(private rootDir: string) {
    fs.mkdirSync(rootDir, { recursive: true });
  }
  private resolve(key: string): string {
    const p = path.resolve(this.rootDir, key);
    if (!p.startsWith(path.resolve(this.rootDir))) throw new Error('storage key escapes root');
    return p;
  }
  async put(key: string, body: Buffer | Uint8Array, _contentType?: string): Promise<void> {
    const p = this.resolve(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    return fs.createReadStream(this.resolve(key));
  }
  async head(key: string) {
    try {
      const st = fs.statSync(this.resolve(key));
      return { size: st.size };
    } catch { return null; }
  }
  async delete(key: string): Promise<void> {
    fs.rmSync(this.resolve(key), { force: true });
  }
  async signedUrl(key: string, _ttlSeconds: number): Promise<string> {
    // Local dev: no signing — return a stable app-relative path.
    return `/storage-local/${encodeURIComponent(key)}`;
  }
  async list(prefix: string): Promise<string[]> {
    const base = this.resolve(prefix || '.');
    const out: string[] = [];
    const walk = (d: string) => {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else out.push(path.relative(this.rootDir, full).split(path.sep).join('/'));
      }
    };
    walk(base);
    return out;
  }
}

/* ------------------------------- S3 -------------------------------- */

// Minimal S3 client using aws4fetch-style manual signing is heavy; use the
// official AWS SDK v3 if installed, otherwise fail fast with a clear error.
export class S3StorageProvider implements StorageProvider {
  private client: any;
  private bucket: string;
  private publicBase?: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const endpoint = env.S3_ENDPOINT;
    const bucket = env.S3_BUCKET;
    const accessKeyId = env.S3_ACCESS_KEY_ID;
    const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error('S3 storage requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY');
    }
    this.bucket = bucket;
    this.publicBase = env.S3_PUBLIC_BASE_URL;
    // Dynamic import keeps LocalStorage usable without the SDK installed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { S3Client } = require('@aws-sdk/client-s3');
    this.client = new S3Client({
      endpoint,
      region: env.S3_REGION || 'auto',
      forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
      credentials: { accessKeyId, secretAccessKey },
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cmds = require('@aws-sdk/client-s3');
    this.cmds = cmds;
  }
  private cmds: any;

  async put(key: string, body: Buffer | Uint8Array, contentType?: string): Promise<void> {
    await this.client.send(new this.cmds.PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: body, ContentType: contentType,
    }));
  }
  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    const res = await this.client.send(new this.cmds.GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.Body as NodeJS.ReadableStream;
  }
  async head(key: string) {
    try {
      const res = await this.client.send(new this.cmds.HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch { return null; }
  }
  async delete(key: string): Promise<void> {
    await this.client.send(new this.cmds.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    if (this.publicBase) return `${this.publicBase.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    return getSignedUrl(this.client, new this.cmds.GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttlSeconds });
  }
  async list(prefix: string): Promise<string[]> {
    const res = await this.client.send(new this.cmds.ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }));
    return (res.Contents || []).map((o: any) => o.Key).filter(Boolean);
  }
}

/* --------------------------- factory ------------------------------- */

let cached: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  const kind = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
  if (kind === 's3') {
    cached = new S3StorageProvider();
  } else {
    const root = process.env.STORAGE_LOCAL_DIR || path.resolve(process.cwd(), 'data', 'storage');
    cached = new LocalStorageProvider(root);
  }
  return cached;
}

export function resetStorageProviderForTests(): void { cached = null; }
