// Read-only data inventory for saas_db.json + sibling JSON stores + uploads/backups.
// Writes docs/db-design/01-current-state/data_inventory.json (structure + stats only,
// NO raw PII values — emails/names are hashed or counted, never printed).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = path.resolve(process.cwd());
const DATA = path.join(ROOT, 'data');
const OUT = path.join(ROOT, 'docs', 'db-design', '01-current-state', 'data_inventory.json');

// Work on a copy per prompt rules (read-only analysis).
const TMP = path.join(process.env.TEMP || '/tmp', 'publora-saacopy.json');
fs.copyFileSync(path.join(DATA, 'saas_db.json'), TMP);
const db = JSON.parse(fs.readFileSync(TMP, 'utf-8'));
fs.unlinkSync(TMP);

const bytes = (o) => Buffer.byteLength(JSON.stringify(o), 'utf-8');
const approx = {};
for (const [k, v] of Object.entries(db)) approx[k] = bytes(v);

function fieldProfile(arr) {
  // field -> {types:Set, nulls, missing, distinct(sample up to 500)}
  const prof = {};
  for (const item of (arr || []).slice(0, 2000)) {
    if (!item || typeof item !== 'object') continue;
    for (const [k, v] of Object.entries(item)) {
      const p = prof[k] ||= { types: new Set(), nullish: 0, present: 0, distinct: new Set() };
      p.present++;
      const t = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
      p.types.add(t);
      if (v === null || v === undefined) p.nullish++;
      else if (p.distinct.size < 500 && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) p.distinct.add(String(v).slice(0, 60));
    }
  }
  const out = {};
  for (const [k, p] of Object.entries(prof)) out[k] = { types: [...p.types], nullish: p.nullish, present: p.present, distinctCount: p.distinct.size };
  return out;
}

const result = {
  generatedAt: new Date().toISOString(),
  fileSizes: {},
  saasDbTopLevel: {},
  collections: {},
  workspaceData: { workspaces: 0, blobs: [] },
  quality: { orphans: [], duplicates: [], invalidEnums: [], dateIssues: [] },
  growth: {},
  uploads: {},
  tmpFiles: {},
  backups: {},
};

// file sizes
for (const f of fs.readdirSync(DATA)) {
  const st = fs.statSync(path.join(DATA, f));
  result.fileSizes[f] = st.isDirectory() ? 'DIR' : st.size;
}

// top-level collections
const collMap = {
  users: 'users', sessions: 'sessions', verificationTokens: 'verificationTokens',
  workspaces: 'workspaces', workspaceMembers: 'workspaceMembers',
  workspaceInvitations: 'workspaceInvitations', auditLogs: 'auditLogs',
  securityEvents: 'securityEvents', workspaceData: 'workspaceData', systemSettings: 'systemSettings',
  stateVersions: 'stateVersions',
};
for (const [key, col] of Object.entries(collMap)) {
  const v = db[key];
  if (v === undefined) continue;
  const isArr = Array.isArray(v);
  const n = isArr ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 1);
  result.collections[col] = { count: n, approxBytes: approx[key] || 0, fields: isArr ? fieldProfile(v) : undefined };
}

// workspaceData per-workspace
const wsData = db.workspaceData || {};
const wsIds = new Set((db.workspaces || []).map(w => w.id));
result.workspaceData.workspaces = Object.keys(wsData).length;
for (const [wsId, d] of Object.entries(wsData)) {
  const counts = {};
  for (const [k, v] of Object.entries(d)) if (Array.isArray(v)) counts[k] = v.length;
  result.workspaceData.blobs.push({ wsHash: crypto.createHash('sha256').update(wsId).digest('hex').slice(0, 10), exists: wsIds.has(wsId), approxBytes: bytes(d), counts });
}
result.workspaceData.blobs.sort((a, b) => b.approxBytes - a.approxBytes);

// ---- quality ----
const users = db.users || [];
const userIds = new Set(users.map(u => u.id));
const emailMap = new Map();
for (const u of users) { const e = (u.email || '').toLowerCase(); emailMap.set(e, (emailMap.get(e) || 0) + 1); }
for (const [e, n] of emailMap) if (n > 1) result.quality.duplicates.push({ kind: 'user.email', count: n });

const workspaces = db.workspaces || [];
const wsIdSet = new Set(workspaces.map(w => w.id));
for (const s of db.sessions || []) if (!userIds.has(s.userId)) result.quality.orphans.push({ kind: 'session', ref: 'userId' });
for (const m of db.workspaceMembers || []) {
  if (!wsIdSet.has(m.workspaceId)) result.quality.orphans.push({ kind: 'workspaceMember', ref: 'workspaceId' });
  if (!userIds.has(m.userId)) result.quality.orphans.push({ kind: 'workspaceMember', ref: 'userId' });
}
for (const w of workspaces) if (!userIds.has(w.ownerId)) result.quality.orphans.push({ kind: 'workspace', ref: 'ownerId' });
for (const [wsId] of Object.entries(wsData)) if (!wsIdSet.has(wsId)) result.quality.orphans.push({ kind: 'workspaceData', ref: 'workspace' });

const POST_STATUSES = new Set(['draft','scheduled','publishing','published','failed','cancelled','needs_reconnect']);
const PLANS = new Set(['free','starter','growth','pro','enterprise']);
const ROLES = new Set(['user','creator','admin','super_admin','platform_admin','god']);
for (const u of users) {
  if (u.role && !ROLES.has(u.role)) result.quality.invalidEnums.push({ kind: 'user.role', value: String(u.role).slice(0, 40) });
  if (u.status && !['active','suspended','pending_verification'].includes(u.status)) result.quality.invalidEnums.push({ kind: 'user.status', value: String(u.status) });
}
for (const w of workspaces) if (w.plan && !PLANS.has(w.plan)) result.quality.invalidEnums.push({ kind: 'workspace.plan', value: String(w.plan) });

let orphanBrandRefs = 0, orphanVideoRefs = 0, orphanAcctRefs = 0, badDates = 0;
for (const [wsId, d] of Object.entries(wsData)) {
  const brandIds = new Set((d.brands || []).map(b => b.id));
  const videoIds = new Set((d.videos || []).map(v => v.id));
  const acctIds = new Set((d.accounts || []).map(a => a.id));
  for (const p of d.posts || []) {
    if (p.brandId && !brandIds.has(p.brandId)) orphanBrandRefs++;
    if (p.videoId && !videoIds.has(p.videoId)) orphanVideoRefs++;
    if (p.accountId && !acctIds.has(p.accountId)) orphanAcctRefs++;
    if (p.scheduledTime && isNaN(Date.parse(p.scheduledTime))) badDates++;
    if (p.status && !POST_STATUSES.has(p.status)) result.quality.invalidEnums.push({ kind: 'post.status', value: String(p.status).slice(0, 40) });
  }
  for (const v of d.videos || []) if (v.brandId && !brandIds.has(v.brandId)) orphanBrandRefs++;
}
result.quality.summary = { orphanBrandRefs, orphanVideoRefs, orphanAcctRefs, badDates };

// growth estimate from createdAt
const created = [];
for (const u of users) if (u.createdAt) created.push(u.createdAt);
for (const w of workspaces) if (w.createdAt) created.push(w.createdAt);
for (const [, d] of Object.entries(wsData)) for (const p of d.posts || []) if (p.createdAt) created.push(p.createdAt);
created.sort();
result.growth = { earliest: created[0] || null, latest: created[created.length - 1] || null, spanDays: created.length > 1 ? Math.round((Date.parse(created[created.length-1]) - Date.parse(created[0])) / 86400000) : 0, datedRecords: created.length };

// uploads dir
const UP = path.join(DATA, 'uploads');
if (fs.existsSync(UP)) {
  let count = 0, total = 0; const exts = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '.sessions') walk(p); }
      else { count++; total += e.size || 0; const ext = path.extname(e.name).toLowerCase() || '(none)'; exts[ext] = (exts[ext] || 0) + 1; }
    }
  };
  walk(UP);
  let sessCount = 0;
  const SD = path.join(UP, '.sessions');
  if (fs.existsSync(SD)) sessCount = fs.readdirSync(SD).length;
  result.uploads = { fileCount: count, totalBytes: total, extDistribution: exts, sessionDirs: sessCount };
}

// tmp files
result.tmpFiles = fs.readdirSync(DATA).filter(f => f.includes('.tmp.')).map(f => ({ name: f, size: fs.statSync(path.join(DATA, f)).size }));

// backups
const BK = path.join(DATA, 'backups');
if (fs.existsSync(BK)) {
  const items = fs.readdirSync(BK).map(f => ({ name: f, size: fs.statSync(path.join(BK, f)).size, mtime: fs.statSync(path.join(BK, f)).mtime }));
  result.backups = { count: items.length, totalBytes: items.reduce((s, i) => s + i.size, 0), latest: items.sort((a, b) => b.mtime - a.mtime)[0] || null, items: items.slice(0, 10) };
}

// top size contributors inside workspaceData
const contrib = {};
for (const [wsId, d] of Object.entries(wsData)) {
  for (const [k, v] of Object.entries(d)) {
    contrib[k] = (contrib[k] || 0) + bytes(v);
  }
}
result.workspaceData.keyByteContributors = Object.fromEntries(Object.entries(contrib).sort((a, b) => b[1] - a[1]).slice(0, 20));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log('wrote', OUT);
console.log('top-level sizes:', JSON.stringify(result.saasDbTopLevel));
console.log('key contributors:', JSON.stringify(result.workspaceData.keyByteContributors).slice(0, 800));
console.log('orphans:', JSON.stringify(result.quality.summary), 'dupEmails:', result.quality.duplicates.length);
console.log('uploads:', JSON.stringify(result.uploads).slice(0, 400));
console.log('tmpFiles:', result.tmpFiles.length, 'backups:', JSON.stringify(result.backups).slice(0, 300));
