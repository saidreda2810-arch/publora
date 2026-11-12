import './server/env.ts';
import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { oauthRouter } from './server/oauthRouter.ts';
import { driveRouter } from './server/driveRouter.ts';
import { authRouter, checkMaintenanceMode, requireAuth, requireGodOwner } from './server/authRouter.ts';
import { saasRouter } from './server/saasRouter.ts';
import { aiRouter, hasGeminiKey } from './server/aiRouter.ts';
import { mediaRouter } from './server/mediaRouter.ts';
import { startBackgroundScheduler, runSchedulerCycleNow, getSchedulerStatus } from './server/scheduler.ts';
import { securityHeaders, sanitizeInputs, createRateLimiter } from './server/security.ts';
import { getDb, getSystemSettings } from './server/saasDb.ts';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Trust proxy configuration: X-Forwarded-For is only honoured when the app is
// deployed behind a known reverse proxy. Set TRUST_PROXY=true (or a hop count)
// in production — e.g. Google Cloud Run / load balancers. Default is false so
// clients cannot spoof their IP to evade rate limits.
const trustProxyEnv = process.env.TRUST_PROXY;
if (trustProxyEnv === 'true' || trustProxyEnv === '1') {
  app.set('trust proxy', 1);
} else if (trustProxyEnv && /^\d+$/.test(trustProxyEnv)) {
  app.set('trust proxy', parseInt(trustProxyEnv, 10));
}

// Global Security Headers & Input Sanitization
app.use(securityHeaders);
// Large-body parsers scoped to endpoints that legitimately carry base64 media.
// body-parser skips re-parsing when req._body is already set, so the scoped
// parsers below run first and the tight global limit covers everything else.
const largeJsonParser = express.json({ limit: '150mb' }); // headroom for base64 video uploads (100MB file ≈ 133MB base64)
app.use(['/api/media', '/api/ai'], largeJsonParser);
app.use('/api/saas', express.json({ limit: '25mb' })); // workspace state blob
app.use(express.json({ limit: '2mb' }));
app.use(['/api/media', '/api/ai', '/api/saas'], express.urlencoded({ extended: true, limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(sanitizeInputs);

// Request ID for tracing — echoed back in X-Request-Id and used in error logs.
app.use((req: Request, res: Response, next) => {
  const id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  (req as any).requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
});

// CSRF defense-in-depth: reject cross-origin state-changing requests.
// Browsers always send Origin (or Referer) on cross-site POST; non-browser
// clients (curl, server-to-server) send neither and are unaffected.
app.use((req: Request, res: Response, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  const allowed = new Set<string>();
  try { allowed.add(new URL(process.env.APP_URL || `http://localhost:${PORT}`).origin); } catch {}
  if (process.env.SHARED_APP_URL) {
    try { allowed.add(new URL(process.env.SHARED_APP_URL).origin); } catch {}
  }
  const reqHost = req.get('host');
  let originHost = '';
  try { originHost = new URL(origin).host; } catch { return res.status(403).json({ success: false, error: 'Forbidden: invalid Origin.' }); }
  const hostAllowed = reqHost && originHost === reqHost;
  if (!allowed.has(origin) && !hostAllowed) {
    return res.status(403).json({ success: false, error: 'Forbidden: cross-origin request.' });
  }
  next();
});

// Static uploads serving
const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '7d',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

// Rate Limiters
const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Too many authentication attempts. Please try again in 1 minute.',
});

// Comprehensive Health & Observability Endpoints.
// Public /health returns minimal liveness only; detailed diagnostics require GOD.
const startTime = Date.now();
const healthHandler = (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    environment: IS_PROD ? 'production' : 'development',
    timestamp: new Date().toISOString(),
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Detailed system diagnostics — authenticated GOD owner only.
app.get('/api/system/diagnostics', requireAuth, requireGodOwner, (req: Request, res: Response) => {
  const memory = process.memoryUsage();
  const db = getDb();
  const scheduler = getSchedulerStatus();
  res.json({
    status: 'healthy',
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024 * 100) / 100,
      rssMb: Math.round(memory.rss / 1024 / 1024 * 100) / 100,
    },
    database: {
      status: 'online',
      usersCount: db.users.length,
      workspacesCount: db.workspaces.length,
      auditLogsCount: db.auditLogs.length,
    },
    scheduler,
  });
});

// Public System Configuration & Active Announcements
app.get('/api/system/public-config', (req: Request, res: Response) => {
  const settings = getSystemSettings();
  res.json({
    success: true,
    maintenanceMode: settings.maintenanceMode,
    maintenanceMessage: settings.maintenanceMessage,
    announcements: settings.announcements.filter((a) => a.active),
    featureFlags: settings.featureFlags,
  });
});

// Public maintenance page — served for browser page loads during active maintenance.
// API routes keep their JSON 503 via checkMaintenanceMode; GOD bypass is API-level.
app.use((req: Request, res: Response, next: any) => {
  if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.includes('.')) {
    return next();
  }
  const settings = getSystemSettings();
  const cfg = settings.maintenanceConfig;
  const active = cfg && cfg.mode && cfg.mode !== 'normal'
    ? !(cfg.scheduledStart && Date.now() < new Date(cfg.scheduledStart).getTime())
      && !(cfg.autoExpire !== false && cfg.scheduledEnd && Date.now() > new Date(cfg.scheduledEnd).getTime())
    : settings.maintenanceMode;
  if (!active) return next();

  const title = cfg?.publicTitle || "We'll Be Back Soon";
  const message = cfg?.publicMessage || 'Publora is currently undergoing scheduled maintenance to improve your experience. Your content and workspace data remain protected while we work.';
  const end = cfg?.scheduledEnd ? new Date(cfg.scheduledEnd).toLocaleString() : null;
  res.status(503).type('html').send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Publora — Maintenance</title><style>
    *{margin:0;box-sizing:border-box}body{font-family:Inter,system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0B1115;color:#EAF2F4;padding:24px}
    .card{max-width:520px;text-align:center;background:#121C22;border:1px solid #1B2931;border-radius:20px;padding:48px 32px}
    .logo{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#00D6B2,#087F78);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:20px;color:#000;margin:0 auto 24px}
    h1{font-size:24px;font-weight:800;margin-bottom:12px}.sub{color:#A8B8BE;font-size:14px;line-height:1.6;margin-bottom:8px}
    .badge{display:inline-block;margin-top:16px;padding:6px 14px;border-radius:999px;background:rgba(0,214,178,.12);border:1px solid rgba(0,214,178,.3);color:#00D6B2;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
    .end{margin-top:16px;font-size:12px;color:#84969F}${end ? `.end b{color:#ADF2E7}` : ''}
    @media(prefers-color-scheme:light){body{background:#F5F8F8;color:#17282D}.card{background:#fff;border-color:#DCE6E6}.sub{color:#52666C}.end{color:#71858A}.end b{color:#087F78}}
  </style></head><body><div class="card"><div class="logo">P</div><h1>${title}</h1><p class="sub">${message}</p>${end ? `<p class="end">Estimated return: <b>${end}</b></p>` : ''}<div class="badge">Scheduled Maintenance</div></div></body></html>`);
});

// Mount Authentication & SaaS Multi-Tenant Engine
app.use('/api/auth', authRateLimiter, authRouter);
app.use('/api/saas', checkMaintenanceMode, saasRouter);
app.use('/api/media', checkMaintenanceMode, mediaRouter);

// Mount Universal Social Media OAuth & Connection Engine
app.use('/api/oauth', checkMaintenanceMode, oauthRouter);
app.use('/api/drive', checkMaintenanceMode, driveRouter);

// Background Publishing Scheduler — GOD owner only (was publicly triggerable).
app.get('/api/scheduler/status', requireAuth, requireGodOwner, (req: Request, res: Response) => {
  res.json({ success: true, ...getSchedulerStatus() });
});

app.post('/api/scheduler/run-now', requireAuth, requireGodOwner, async (req: Request, res: Response) => {
  const result = await runSchedulerCycleNow();
  res.json({ success: true, result });
});

// System Status endpoint
app.get('/api/system/status', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    hasGeminiKey,
    platformModel: 'gemini-3.8-flash',
    environment: IS_PROD ? 'production' : 'development',
    timestamp: new Date().toISOString(),
  });
});

// Mount AI endpoints (extracted to server/aiRouter.ts) — rate-limited: AI calls
// cost real money per request.
const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: 'Too many AI requests. Please slow down.',
});
app.use('/api/ai', checkMaintenanceMode, aiRateLimiter, aiRouter);


// Setup Vite or Static File Serving
async function startServer() {
  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fileURLToPath(new URL('./dist', import.meta.url));
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req: Request, res: Response) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  // Central error handler — last middleware. Logs full detail server-side,
  // returns only a generic error + requestId to the client.
  app.use((err: any, req: Request, res: Response, _next: any) => {
    const requestId = (req as any).requestId || 'unknown';
    console.error(`[error] ${req.method} ${req.path} [${requestId}]`, err);
    if (res.headersSent) return;
    const status = err?.status || err?.statusCode || 500;
    res.status(status >= 400 && status < 600 ? status : 500).json({
      success: false,
      error: status >= 500 ? 'internal_error' : (err?.message || 'request_failed'),
      requestId,
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SRA Social Publisher] Server active at http://0.0.0.0:${PORT}`);
    startBackgroundScheduler();
  });
}

startServer();
