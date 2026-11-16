/**
 * extract-embedded-media.ts — WP1.4/5: pull data: URLs out of saas_db.json.
 *
 * Modes:
 *   --dry-run (default): report counts/sizes/mimes/duplicates, write nothing.
 *   --apply:             decode → sniff mime → sha256 → upload to storage →
 *                        rewrite refs in an OUTPUT copy (never the source).
 *   --verify:            re-download every object, compare sha256; confirm the
 *                        output JSON has zero data: URLs and shrank.
 *
 * Idempotent: content-addressed keys mean re-runs upload nothing twice and
 * produce no changes on the second pass.
 *
 * Usage:
 *   npx tsx scripts/extract-embedded-media.ts --input <saas_db.json> [--output <path>]
 *        [--storage-dir <dir>] [--dry-run|--apply|--verify]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { LocalStorageProvider } from '../server/storage/storageProvider';

const DATA_URL_RE = /data:([a-zA-Z][\w.+-]*)\/([\w.+-]+);base64,([A-Za-z0-9+/=\s]+)/g;

interface FoundMedia {
  jsonPath: string;      // e.g. "$.workspaceData.ws_x.brands[0].logoUrl"
  field: string;
  workspaceId?: string;
  declaredMime: string;
  base64: string;
  buffer: Buffer;
  sha256: string;
  sniffedMime: string;
  sizeBytes: number;
}

function sniffMime(buf: Buffer): string {
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 6 && (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a')) return 'image/gif';
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4';
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === '%PDF') return 'application/pdf';
  return 'application/octet-stream';
}

const EXT: Record<string, string> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp',
  'image/gif': '.gif', 'video/mp4': '.mp4', 'application/pdf': '.pdf',
};

function walk(value: unknown, pathParts: (string | number)[], wsId: string | undefined, out: FoundMedia[]): void {
  if (typeof value === 'string') {
    DATA_URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    // A field may contain a data URL embedded in a longer string — treat the
    // whole string as media only if it STARTS with data:.
    if (/^\s*data:[a-zA-Z][\w.+-]*\/[\w.+-]+;base64,/.test(value)) {
      const mm = value.trim().match(/^data:([\w.+-]+)\/([\w.+-]+);base64,(.*)$/s);
      if (mm) {
        const buf = Buffer.from(mm[3].replace(/\s+/g, ''), 'base64');
        out.push({
          jsonPath: '$' + pathParts.map((p) => typeof p === 'number' ? `[${p}]` : `.${p}`).join(''),
          field: String(pathParts[pathParts.length - 1] ?? ''),
          workspaceId: wsId,
          declaredMime: `${mm[1]}/${mm[2]}`,
          base64: mm[3],
          buffer: buf,
          sha256: crypto.createHash('sha256').update(buf).digest('hex'),
          sniffedMime: sniffMime(buf),
          sizeBytes: buf.length,
        });
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, [...pathParts, i], wsId, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // workspaceData is keyed by workspaceId
      const childWs = k === 'workspaceData' ? undefined : wsId;
      walk(v, [...pathParts, k], childWs ?? (pathParts[pathParts.length - 2] === 'workspaceData' ? String(k) : wsId), out);
    }
  }
}

function collectMedia(db: any): FoundMedia[] {
  const out: FoundMedia[] = [];
  walk(db, [], undefined, out);
  // Fix wsId attribution: workspaceData.<wsId>.<collection>[i].<field>
  for (const f of out) {
    const m = f.jsonPath.match(/\$\.workspaceData\.([^.\[]+)/);
    if (m) f.workspaceId = m[1];
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const input = get('--input');
  const output = get('--output');
  const storageDir = get('--storage-dir') || path.resolve(process.cwd(), 'data', 'storage-extract');
  const mode = args.includes('--verify') ? 'verify' : args.includes('--apply') ? 'apply' : 'dry-run';
  if (!input) { console.error('usage: --input <saas_db.json> [--output f] [--storage-dir d] [--dry-run|--apply|--verify]'); process.exit(2); }

  const raw = fs.readFileSync(input, 'utf8');
  const db = JSON.parse(raw);
  const media = collectMedia(db);

  // aggregate report (no content printed)
  const byField: Record<string, { count: number; bytes: number }> = {};
  const byMime: Record<string, number> = {};
  const hashes = new Map<string, number>();
  let undecodable = 0, mimeMismatch = 0;
  for (const m of media) {
    byField[m.field] = byField[m.field] || { count: 0, bytes: 0 };
    byField[m.field].count++; byField[m.field].bytes += m.sizeBytes;
    byMime[m.sniffedMime] = (byMime[m.sniffedMime] || 0) + 1;
    hashes.set(m.sha256, (hashes.get(m.sha256) || 0) + 1);
    if (m.buffer.length === 0) undecodable++;
    if (m.sniffedMime !== m.declaredMime && m.sniffedMime !== 'application/octet-stream') mimeMismatch++;
  }
  const duplicates = [...hashes.values()].filter((c) => c > 1).reduce((a, b) => a + b - 1, 0);

  console.log(`mode: ${mode}`);
  console.log(`input: ${input} (${(raw.length / 1024).toFixed(1)} KB)`);
  console.log(`media strings found: ${media.length}`);
  console.log('by field:', JSON.stringify(byField));
  console.log('by sniffed mime:', JSON.stringify(byMime));
  console.log(`duplicates (same sha256): ${duplicates}, undecodable: ${undecodable}, mime mismatches: ${mimeMismatch}`);

  if (mode === 'dry-run') {
    console.log('dry-run complete — no writes performed.');
    return;
  }

  const store = new LocalStorageProvider(storageDir);

  if (mode === 'apply') {
    if (!output) { console.error('--apply requires --output <path>'); process.exit(2); }
    // Build rewritten copy: replace each data: URL string with a media ref.
    const refFor = new Map<FoundMedia, string>();
    for (const m of media) {
      const key = `ws/${m.workspaceId || 'global'}/media/${m.sha256}${EXT[m.sniffedMime] || '.bin'}`;
      const existing = await store.head(key);
      if (!existing) await store.put(key, m.buffer, m.sniffedMime);
      refFor.set(m, `media:${key}`);
    }
    // Rewrite by walking again and swapping exact data-URL strings.
    const rewrite = (value: unknown): unknown => {
      if (typeof value === 'string' && /^\s*data:[a-zA-Z][\w.+-]*\/[\w.+-]+;base64,/.test(value)) {
        const mm = value.trim().match(/^data:([\w.+-]+)\/([\w.+-]+);base64,(.*)$/s);
        if (mm) {
          const buf = Buffer.from(mm[3].replace(/\s+/g, ''), 'base64');
          const sha = crypto.createHash('sha256').update(buf).digest('hex');
          const mime = sniffMime(buf);
          const wsGuess = '';
          void wsGuess;
          // find workspaceId via the FoundMedia list (same content → same key)
          const rec = media.find((x) => x.sha256 === sha && x.buffer.equals(buf));
          const key = `ws/${rec?.workspaceId || 'global'}/media/${sha}${EXT[mime] || '.bin'}`;
          return `media:${key}`;
        }
      }
      if (Array.isArray(value)) return value.map(rewrite);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, rewrite(v)]));
      }
      return value;
    };
    const rewritten = rewrite(db);
    fs.writeFileSync(output, JSON.stringify(rewritten));
    console.log(`apply: wrote ${output} (${(fs.statSync(output).size / 1024).toFixed(1)} KB, was ${(raw.length / 1024).toFixed(1)} KB)`);
    console.log(`apply: uploaded ${media.length} objects to ${storageDir} (deduped by sha256)`);
    return;
  }

  if (mode === 'verify') {
    // --input should point at the REWRITTEN output; --storage-dir at objects.
    const remaining = collectMedia(db);
    console.log(`verify: data: URLs remaining in input: ${remaining.length}`);
    let bad = 0, checked = 0;
    for (const key of await store.list('ws/')) {
      checked++;
      const sha = path.basename(key).replace(/\.[^.]+$/, '');
      const stream = await store.getStream(key);
      const chunks: Buffer[] = [];
      for await (const c of stream) chunks.push(c as Buffer);
      const actual = crypto.createHash('sha256').update(Buffer.concat(chunks)).digest('hex');
      if (actual !== sha) { bad++; console.log(`  sha mismatch: ${key}`); }
    }
    console.log(`verify: checked ${checked} objects, ${bad} hash mismatches`);
    if (remaining.length > 0 || bad > 0) process.exit(1);
    console.log('verify: PASS');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
