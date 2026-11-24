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
import fs from 'node:fs';
import path from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { STORAGE_LOCAL_DIR } from '../config.ts';

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
    const root = path.resolve(this.rootDir);
    if (key === '.') return root; // list() root marker
    if (!key || path.isAbsolute(key) || key.split(/[\\/]/).includes('..')) {
      throw new Error('invalid storage key');
    }
    const p = path.resolve(root, key);
    const rel = path.relative(root, p);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('storage key escapes root');
    }
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
  private client: S3Client;
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
    this.client = new S3Client({
      endpoint,
      region: env.S3_REGION || 'auto',
      forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async put(key: string, body: Buffer | Uint8Array, contentType?: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: body, ContentType: contentType,
    }));
  }
  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.Body as NodeJS.ReadableStream;
  }
  async head(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (e: any) {
      // Only a genuine NotFound maps to null — auth/network/server errors propagate.
      const status = e?.$metadata?.httpStatusCode;
      const name = e?.name || '';
      if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') return null;
      throw e;
    }
  }
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    if (this.publicBase) return `${this.publicBase.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttlSeconds });
  }
  async list(prefix: string): Promise<string[]> {
    const out: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket, Prefix: prefix, ContinuationToken: token,
      }));
      for (const o of res.Contents || []) if (o.Key) out.push(o.Key);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
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
    const root = STORAGE_LOCAL_DIR;
    cached = new LocalStorageProvider(root);
  }
  return cached;
}

export function resetStorageProviderForTests(): void { cached = null; }
