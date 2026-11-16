/**
 * backup-data.ts — consistent snapshot of the JSON data stores.
 *
 * Creates a timestamped archive OUTSIDE data/ and outside the repo:
 *   <BACKUP_DIR>/publora-data-YYYYMMDD-HHMMSS/
 *     manifest.json      — file list + sha256 + counts (no PII values)
 *     data/...           — full copy of the JSON stores + uploads
 *   optionally <name>.tar.gz (or .tar.gz.enc when BACKUP_PASSPHRASE is set)
 *
 * Consistency: saas_db.json is replaced atomically (tmp+rename) by the app,
 * so a plain file copy can never observe a half-written DB.
 *
 * Excludes: saas_db.json.tmp.* (leaked tmp artifacts — stale snapshots, not data).
 *
 * Env:
 *   BACKUP_DIR           destination root (default: ~/publora-backups)
 *   BACKUP_KEEP          archives to retain (default 14)
 *   BACKUP_PASSPHRASE    if set, tarball is AES-256-GCM encrypted (.tar.gz.enc)
 *   SRA_BACKUP_SOURCE    source dir override (tests/drills only)
 *
 * Usage: npx tsx scripts/backup-data.ts [--verify]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export interface BackupFileEntry {
  path: string; // relative to data/
  bytes: number;
  sha256: string;
}

export interface BackupManifest {
  createdAt: string;
  sourceDir: string;
  fileCount: number;
  totalBytes: number;
  excludedTmpFiles: number;
  files: BackupFileEntry[];
  dbCounts?: Record<string, number>;
  encrypted: boolean;
  compressed: boolean;
}

const EXCLUDE_PATTERNS = [/saas_db\.json\.tmp\.\d+$/];

function sha256File(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function isExcluded(rel: string): boolean {
  return EXCLUDE_PATTERNS.some((re) => re.test(rel));
}

function* walk(dir: string, base: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (entry.isDirectory()) yield* walk(full, base);
    else if (entry.isFile()) yield rel;
  }
}

function copyTree(src: string, dst: string, files: string[]): BackupFileEntry[] {
  const entries: BackupFileEntry[] = [];
  for (const rel of files) {
    const from = path.join(src, rel);
    const to = path.join(dst, 'data', rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    entries.push({ path: rel, bytes: fs.statSync(from).size, sha256: sha256File(from) });
  }
  return entries;
}

function dbCounts(dataDir: string): Record<string, number> | undefined {
  try {
    const db = JSON.parse(fs.readFileSync(path.join(dataDir, 'saas_db.json'), 'utf8'));
    return {
      users: (db.users || []).length,
      sessions: (db.sessions || []).length,
      verificationTokens: (db.verificationTokens || []).length,
      workspaces: (db.workspaces || []).length,
      workspaceMembers: (db.workspaceMembers || []).length,
      workspaceDataKeys: Object.keys(db.workspaceData || {}).length,
      auditLogs: (db.auditLogs || []).length,
      securityEvents: (db.securityEvents || []).length,
    };
  } catch {
    return undefined;
  }
}

function encryptFile(inFile: string, outFile: string, passphrase: string): void {
  // format: salt(16) | iv(12) | tag(16) | ciphertext — AES-256-GCM
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = fs.readFileSync(inFile);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  fs.writeFileSync(outFile, Buffer.concat([salt, iv, cipher.getAuthTag(), enc]));
}

function compressDir(dir: string, outFile: string): void {
  // bsdtar ships with Windows 10+ and all Linux distros.
  execFileSync('tar', ['--force-local', '-czf', outFile, '-C', dir, '.'], { stdio: 'pipe' });
}

function pruneOld(root: string, keep: number): string[] {
  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.name.startsWith('publora-data-'))
    .map((e) => e.name)
    .sort(); // timestamped names sort chronologically
  const removed: string[] = [];
  while (entries.length > keep) {
    const oldest = entries.shift()!;
    fs.rmSync(path.join(root, oldest), { recursive: true, force: true });
    removed.push(oldest);
  }
  return removed;
}

export interface BackupOptions {
  sourceDir?: string;
  destDir?: string;
  keep?: number;
  compress?: boolean;
  passphrase?: string;
}

export interface BackupResult {
  archiveDir: string;
  archiveFile?: string;
  manifest: BackupManifest;
  pruned: string[];
}

export function runBackup(opts: BackupOptions = {}): BackupResult {
  const sourceDir = path.resolve(opts.sourceDir || process.env.SRA_BACKUP_SOURCE || path.join(process.cwd(), 'data'));
  const destDir = path.resolve(opts.destDir || process.env.BACKUP_DIR || path.join(os.homedir(), 'publora-backups'));
  const keep = opts.keep ?? Number(process.env.BACKUP_KEEP || 14);
  const compress = opts.compress ?? process.env.BACKUP_NOCOMPRESS !== '1';
  const passphrase = opts.passphrase ?? process.env.BACKUP_PASSPHRASE;

  if (!fs.existsSync(sourceDir)) throw new Error(`backup source not found: ${sourceDir}`);
  fs.mkdirSync(destDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let name = `publora-data-${stamp}`;
  let suffix = 0;
  while (fs.existsSync(path.join(destDir, name)) || fs.existsSync(path.join(destDir, `${name}.tar.gz`))) {
    suffix += 1;
    name = `publora-data-${stamp}-${suffix}`;
  }
  const staging = path.join(destDir, name);
  fs.mkdirSync(staging, { recursive: true });

  const allFiles = [...walk(sourceDir, sourceDir)];
  const excluded = allFiles.filter(isExcluded);
  const files = allFiles.filter((f) => !isExcluded(f));

  const entries = copyTree(sourceDir, staging, files);
  const totalBytes = entries.reduce((s, e) => s + e.bytes, 0);

  const manifest: BackupManifest = {
    createdAt: new Date().toISOString(),
    sourceDir,
    fileCount: entries.length,
    totalBytes,
    excludedTmpFiles: excluded.length,
    files: entries,
    dbCounts: dbCounts(sourceDir),
    encrypted: Boolean(passphrase),
    compressed: compress,
  };
  fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));

  let archiveFile: string | undefined;
  if (compress) {
    const tarPath = path.join(destDir, `${name}.tar.gz`);
    compressDir(staging, tarPath);
    if (passphrase) {
      const encPath = `${tarPath}.enc`;
      encryptFile(tarPath, encPath, passphrase);
      fs.rmSync(tarPath);
      archiveFile = encPath;
    } else {
      archiveFile = tarPath;
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }

  const pruned = pruneOld(destDir, keep);
  return { archiveDir: staging, archiveFile, manifest, pruned };
}

export function listBackups(destDir?: string): string[] {
  const root = path.resolve(destDir || process.env.BACKUP_DIR || path.join(os.homedir(), 'publora-backups'));
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .filter((n) => n.startsWith('publora-data-'))
    .sort()
    .reverse();
}

// ---- CLI ----
const isMain = (() => {
  try {
    const self = decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
    return process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === path.resolve(self).toLowerCase();
  } catch { return false; }
})();
if (isMain) {
  try {
    const result = runBackup();
    console.log(`backup created: ${result.archiveFile || result.archiveDir}`);
    console.log(`files: ${result.manifest.fileCount}, bytes: ${result.manifest.totalBytes}, excluded tmp: ${result.manifest.excludedTmpFiles}`);
    if (result.manifest.encrypted) console.log('archive encrypted (AES-256-GCM)');
    else console.log('WARNING: archive is NOT encrypted — it contains secrets and PII. Set BACKUP_PASSPHRASE or protect the backup dir.');
    if (result.pruned.length) console.log(`pruned ${result.pruned.length} old archives (keep=${process.env.BACKUP_KEEP || 14})`);
    if (process.argv.includes('--verify')) {
      const m = result.manifest;
      let verifyRoot = result.archiveDir;
      let tmpExtract: string | undefined;
      if (result.archiveFile?.endsWith('.tar.gz.enc')) {
        console.log('verify: archive is encrypted — hash verification requires decryption; skipped');
      } else if (result.archiveFile?.endsWith('.tar.gz')) {
        tmpExtract = fs.mkdtempSync(path.join(os.tmpdir(), 'publora-verify-'));
        execFileSync('tar', ['--force-local', '-xzf', result.archiveFile, '-C', tmpExtract], { stdio: 'pipe' });
        verifyRoot = tmpExtract;
      }
      if (!result.archiveFile?.endsWith('.enc')) {
        const bad = m.files.filter((f) => {
          const p = path.join(verifyRoot, 'data', f.path);
          return !fs.existsSync(p) || sha256File(p) !== f.sha256;
        });
        console.log(bad.length === 0 ? 'verify: all file hashes match' : `verify FAILED: ${bad.length} mismatches`);
        if (tmpExtract) fs.rmSync(tmpExtract, { recursive: true, force: true });
        if (bad.length) process.exit(1);
      }
    }
  } catch (err) {
    console.error('backup failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
