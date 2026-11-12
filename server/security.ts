import { Request, Response, NextFunction } from 'express';

// Sliding window in-memory rate limiter
interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  for (const [key, record] of rateLimitStore.entries()) {
    record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);
    if (record.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
}) {
  const { windowMs, maxRequests, message = 'Too many requests, please slow down.' } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // req.ip honours app.set('trust proxy') — X-Forwarded-For is only trusted
    // when TRUST_PROXY is configured, preventing IP spoofing to evade limits.
    const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
    const key = `${req.baseUrl || req.path}:${ip}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);
    if (!record) {
      record = { timestamps: [] };
      rateLimitStore.set(key, record);
    }

    // Filter out timestamps outside window
    record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

    if (record.timestamps.length >= maxRequests) {
      const retryAfter = Math.ceil((record.timestamps[0] + windowMs - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        error: message,
        retryAfterSeconds: retryAfter,
      });
    }

    record.timestamps.push(now);
    next();
  };
}

// Security Headers Middleware
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent reflected XSS in legacy browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Strict Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');

  // HSTS — production only (never on localhost dev)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Frame Ancestors for AI Studio iframe embedding support
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://*.google.com https://*.googleusercontent.com https://*.aistudio.google.com;"
  );

  // Full CSP in Report-Only mode — collect violations before enforcing.
  // Covers the app's real needs: self-hosted bundle, inline styles (React
  // style attributes), Google APIs (Gemini/OAuth/Drive), data/blob media.
  res.setHeader(
    'Content-Security-Policy-Report-Only',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.google.com https://*.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: data:",
      "connect-src 'self' https://generativelanguage.googleapis.com https://oauth2.googleapis.com https://www.googleapis.com https://*.googleapis.com",
      "frame-ancestors 'self' https://*.google.com https://*.googleusercontent.com https://*.aistudio.google.com",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ')
  );

  next();
}

// Input Sanitizer Middleware
export function sanitizeInputs(req: Request, res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  next();
}

function sanitizeObject(obj: Record<string, any>) {
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string') {
      // Strip dangerous null bytes and format strings
      obj[key] = val.replace(/\0/g, '');
    } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      sanitizeObject(val);
    }
  }
}
