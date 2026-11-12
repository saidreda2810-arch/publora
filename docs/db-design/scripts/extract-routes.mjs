// Extract Express routes → endpoints.csv with mount prefixes + middleware hints.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const SERVER_DIR = path.join(ROOT, 'server');
const OUTDIR = path.join(ROOT, 'docs', 'db-design', '01-current-state');

const MOUNTS = {
  'server/authRouter.ts': '/api/auth',
  'server/saasRouter.ts': '/api/saas',
  'server/mediaRouter.ts': '/api/media',
  'server/oauthRouter.ts': '/api/oauth',
  'server/driveRouter.ts': '/api/drive',
  'server/aiRouter.ts': '/api/ai',
};

const files = [path.join(ROOT, 'server.ts'), ...fs.readdirSync(SERVER_DIR).filter(f => f.endsWith('.ts')).map(f => path.join(SERVER_DIR, f))];

const routeRe = /(\w+)\.(get|post|put|patch|delete|all)\(\s*['"`]([^'"`]+)['"`]([^)]*)/g;

const rows = [['method','full_path','router_file','middlewares','raw_args']];
const seen = new Set();
for (const file of files) {
  const src = fs.readFileSync(file, 'utf-8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const mount = MOUNTS[rel] || '';
  const lines = src.split('\n');
  let m;
  while ((m = routeRe.exec(src))) {
    const [, routerVar, method, routePath, rest] = m;
    // only count known router/app vars
    if (!/^(app|router|authRouter|saasRouter|mediaRouter|oauthRouter|driveRouter|aiRouter|\w+Router)$/.test(routerVar)) continue;
    const full = mount + (routePath === '/' ? '' : routePath);
    const key = `${rel}|${method}|${routePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mw = [...rest.matchAll(/(requireAuth|requireRole|requireGodOwner|optionalAuth|bruteForceGuard|aiRateLimiter|authRateLimiter|checkMaintenanceMode|sanitizeInputs|requirePermission|\w+RateLimiter)/g)].map(x => x[1]);
    rows.push([method.toUpperCase(), full, rel, [...new Set(mw)].join('|'), rest.slice(0, 120).replace(/\n/g, ' ')]);
  }
}

const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
fs.writeFileSync(path.join(OUTDIR, 'endpoints.csv'), csv);
fs.writeFileSync(path.join(OUTDIR, 'endpoints_raw.csv'), csv);
console.log(`wrote ${rows.length - 1} routes`);
