import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import {
  hashPassword,
  generateSalt,
  generateToken,
  sanitizeUserForClient,
  getSystemSettings,
  User,
  UserRole,
  Workspace,
  UserSession,
  GOD_OWNER_EMAIL,
  hasRoleLevel,
  UserPreferences,
} from './saasDb.ts';
import { authStore } from './authStore.ts';
import { bruteForceGuard } from './bruteForceGuard.ts';
import { findMediaViolations, MEDIA_INGRESS_ERROR_CODE } from './mediaIngress.ts';

export interface AuthenticatedRequest extends Request {
  user?: User;
  session?: UserSession;
  workspace?: Workspace;
}

export const authRouter = express.Router();

// Development-only token hints: OFF by default. Must be explicitly enabled in
// development AND never in production (enforced again at boot by env validation).
const EXPOSE_DEV_TOKENS =
  process.env.NODE_ENV === 'development' && process.env.SRA_EXPOSE_DEV_TOKENS === 'true';

function devTokenField(key: string, value: string) {
  return EXPOSE_DEV_TOKENS ? { [key]: value } : {};
}

// Auth tokens/codes are stored as SHA-256 hashes — a DB leak doesn't yield
// usable credentials. Legacy plaintext tokens are still accepted during the
// transition window (they're short-lived anyway).
function hashAuthToken(raw: string): string {
  return crypto.createHash('sha256').update(raw.trim()).digest('hex');
}
const MAX_TOKEN_ATTEMPTS = 5;

function tokenMatches(stored: string, raw: string): boolean {
  return stored === hashAuthToken(raw) || stored === raw.trim();
}

// All candidate session tokens on the request (Bearer header, then cookie).
// requireAuth tries each — a stale/invalid Bearer never shadows a valid cookie.
export function extractTokens(req: Request): string[] {
  const tokens: string[] = [];
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    tokens.push(authHeader.substring(7).trim());
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    const sessionCookie = cookies.find((c) => c.startsWith('sra_session='));
    if (sessionCookie) {
      tokens.push(sessionCookie.substring('sra_session='.length).trim());
    }
  }
  return tokens;
}

// Backwards-compatible single-token extractor (first candidate).
export function extractToken(req: Request): string | null {
  return extractTokens(req)[0] || null;
}

async function resolveSession(req: Request): Promise<{ session: UserSession; token: string } | null> {
  for (const token of extractTokens(req)) {
    const session = await authStore.findSessionByToken(token);
    if (session) return { session, token };
  }
  return null;
}

// Authentication middleware
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const resolved = await resolveSession(req);
    if (!resolved) {
      return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
    }
    const { session } = resolved;

    const user = await authStore.findUserById(session.userId);
    if (!user) {
      return res.status(401).json({ success: false, error: 'User account not found.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'Your account has been suspended by the platform administrator.' });
    }

    const workspaces = await authStore.getUserWorkspaces(user.id);
    const requestedWsId = req.headers['x-workspace-id'] as string;
    const activeWorkspace = workspaces.find((w: any) => w.id === requestedWsId) || workspaces[0];

    req.user = user;
    req.session = session;
    req.workspace = activeWorkspace;
    next();
  } catch (e) { next(e); }
}

// Role Authorization Middleware (Server-Side Enforced)
export function requireRole(minRoleOrRoles: UserRole | UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const userRole = req.user.role;

    // GOD Primary Owner always passes all role gates
    if (userRole === 'god') {
      return next();
    }

    if (Array.isArray(minRoleOrRoles)) {
      if (minRoleOrRoles.includes(userRole)) {
        return next();
      }
      return res.status(403).json({ success: false, error: 'Insufficient administrative privileges.' });
    }

    if (hasRoleLevel(userRole, minRoleOrRoles)) {
      return next();
    }

    return res.status(403).json({ success: false, error: 'Insufficient administrative privileges.' });
  };
}

// GOD Primary Owner Exclusive Authorization Middleware
export async function requireGodOwner(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    // Primary Owner anchored to immutable user ID; email+role is fallback for pre-migration sessions
    const settings = getSystemSettings();
    const ownerId = settings?.primaryOwnerUserId;
    const isGod = req.user.role === 'god' && (
      (ownerId ? req.user.id === ownerId : req.user.email.toLowerCase() === GOD_OWNER_EMAIL.toLowerCase())
    );
    if (!isGod) {
      try {
        await authStore.logAudit({
          workspaceId: req.workspace?.id || 'platform',
          userId: req.user.id,
          action: 'god_access_denied',
          details: `Unauthorized GOD Console access attempt by ${req.user.email} (${req.user.role})`,
        });
      } catch {}
      return res.status(403).json({
        success: false,
        error: 'RESTRICTED: This critical operation requires Primary Owner (GOD) authorization.',
      });
    }

    next();
  } catch (e) { next(e); }
}

// Optional Auth middleware (doesn't fail if not logged in)
export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const resolved = await resolveSession(req);
    if (resolved) {
      const { session } = resolved;
      const user = await authStore.findUserById(session.userId);
      if (user && user.status !== 'suspended') {
        const workspaces = await authStore.getUserWorkspaces(user.id);
        const requestedWsId = req.headers['x-workspace-id'] as string;
        req.user = user;
        req.session = session;
        req.workspace = workspaces.find((w: any) => w.id === requestedWsId) || workspaces[0];
      }
    }
    next();
  } catch (e) { next(e); }
}

// Global Maintenance Mode Guard
// Map API path prefixes → maintenance scope keys
function maintenanceScopeFor(path: string): string {
  if (path.startsWith('/api/saas/automations')) return 'automations';
  if (path.startsWith('/api/ai')) return 'ai_studio';
  if (path.startsWith('/api/media')) return 'media_uploads';
  if (path.startsWith('/api/oauth') || path.startsWith('/api/drive')) return 'social_accounts';
  if (path.startsWith('/api/saas')) {
    if (path.includes('/brands')) return 'brands';
    if (path.includes('/projects')) return 'workspace';
    if (path.includes('/posts') || path.includes('/queue')) return 'publishing_queue';
    if (path.includes('/analytics') || path.includes('/reports')) return 'analytics';
    if (path.includes('/members') || path.includes('/workspaces')) return 'workspace';
    if (path.includes('/admin')) return 'god_console';
    return 'dashboard';
  }
  return 'api';
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function checkMaintenanceMode(req: Request, res: Response, next: NextFunction) {
  try {
    // Always permit health checks, static assets, admin login, OAuth callbacks, webhooks
    if (
      req.path.startsWith('/health') ||
      req.path.startsWith('/api/health') ||
      req.path.startsWith('/api/system') ||
      req.path.startsWith('/uploads') ||
      req.path === '/api/auth/login' ||
      req.path === '/api/auth/me' ||
      req.path.endsWith('/callback') ||
      req.path.endsWith('/oauth/callback') ||
      req.path.includes('/webhook') ||
      req.path.includes('/callback')
    ) {
      return next();
    }

    const settings = getSystemSettings();
    const cfg = settings.maintenanceConfig;
    const legacyOn = settings.maintenanceMode;

    // Resolve effective mode: new config wins; legacy boolean maps to 'full'
    let mode: string | null = null;
    let affected: string[] = [];
    if (cfg && cfg.mode && cfg.mode !== 'normal') {
      const now = Date.now();
      if (cfg.scheduledStart && now < new Date(cfg.scheduledStart).getTime()) { /* not yet active */ }
      else if (cfg.scheduledEnd && cfg.autoExpire !== false && now > new Date(cfg.scheduledEnd).getTime()) { /* expired */ }
      else { mode = cfg.mode; affected = cfg.affectedServices || []; }
    } else if (legacyOn) {
      mode = 'full';
    }
    if (!mode) return next();

    // GOD/admin bypass — authenticated privileged users always pass
    const token = extractToken(req);
    if (token) {
      const session = await authStore.findSessionByToken(token);
      if (session) {
        const user = await authStore.findUserById(session.userId);
        if (user && (user.role === 'god' || user.role === 'super_admin' || user.role === 'platform_admin')) {
          return next();
        }
      }
    }

    const scope = maintenanceScopeFor(req.path);
    const scopeBlocked = mode === 'full' || (mode === 'partial' && (affected.length === 0 || affected.includes(scope)));
    const readOnlyBlocked = mode === 'readonly' && WRITE_METHODS.has(req.method);

    if (scopeBlocked) {
      return res.status(503).json({
        success: false,
        code: 'MAINTENANCE_ACTIVE',
        maintenance: true,
        mode,
        affectedServices: affected,
        error: cfg?.publicMessage || settings.maintenanceMessage || 'Platform is under scheduled maintenance.',
      });
    }
    if (readOnlyBlocked) {
      return res.status(503).json({
        success: false,
        code: 'READ_ONLY_MODE',
        maintenance: true,
        mode,
        error: 'Platform is in read-only mode during maintenance. Changes are temporarily disabled.',
      });
    }

    next();
  } catch (e) { next(e); }
}

// Helper to set cookie
function setSessionCookie(res: Response, token: string) {
  res.setHeader(
    'Set-Cookie',
    `sra_session=${token}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${30 * 24 * 3600}`
  );
}

// 1. REGISTER
authRouter.post('/register', bruteForceGuard, async (req: Request, res: Response) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ success: false, error: 'Full name, email, and password are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters long.' });
    }

    const existing = await authStore.findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists. Please sign in.' });
    }

    const { user, verificationToken } = await authStore.registerUser({
      email,
      password,
      fullName,
    });

    // Create session
    const ip = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const session = await authStore.createSession(user.id, { ip, userAgent });

    setSessionCookie(res, session.token);

    const workspaces = await authStore.getUserWorkspaces(user.id);
    const activeWorkspace = workspaces[0];

    // Sanitize user output (never return salt or hash)
    const { passwordHash, salt, ...safeUser } = user;

    res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to SRA Social Publisher.',
      user: safeUser,
      workspace: activeWorkspace,
      workspaces,
      ...devTokenField('verificationToken', verificationToken),
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Internal registration failure. Please try again.' });
  }
});

// 2. LOGIN
authRouter.post('/login', bruteForceGuard, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const user = await authStore.findUserByEmail(email);

    // Always perform a scrypt hash so unknown accounts cost the same time as
    // known ones — minimizes user-enumeration via response timing.
    const computedHash = hashPassword(password, user ? user.salt : generateSalt());
    const passwordMatches = !!user && computedHash === user.passwordHash;

    if (!user || !passwordMatches) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    // Suspension is only revealed after the password has been proven, so the
    // check cannot be used to enumerate registered accounts.
    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'Your account is suspended. Contact system support.' });
    }

    // MFA is disabled platform-wide until a real TOTP implementation lands
    // (see /mfa/setup → 501). Users migrated off fake mfaEnabled flags.

    // Update lastLoginAt
    await authStore.updateUser(user.id, { lastLoginAt: new Date().toISOString() });

    const ip = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const session = await authStore.createSession(user.id, { ip, userAgent });

    setSessionCookie(res, session.token);

    const workspaces = await authStore.getUserWorkspaces(user.id);
    const activeWorkspace = workspaces[0];

    await authStore.logAudit({
      userId: user.id,
      userEmail: user.email,
      workspaceId: activeWorkspace?.id,
      action: 'user_logged_in',
      details: `User logged in from ${ip || 'unknown IP'}.`,
    });

    const safeUser = sanitizeUserForClient(user);

    res.json({
      success: true,
      message: 'Signed in successfully.',
      user: safeUser,
      workspace: activeWorkspace,
      workspaces,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Sign in failed. Please try again.' });
  }
});

// 3. ME (SESSION VALIDATION)
authRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workspaces = await authStore.getUserWorkspaces(user.id);
  const safeUser = sanitizeUserForClient(user);

  res.json({
    success: true,
    user: safeUser,
    workspace: req.workspace,
    workspaces,
    memberRole: await authStore.getMemberRole(user.id, req.workspace?.id),
  });
});

// 4. LOGOUT
authRouter.post('/logout', async (req: Request, res: Response) => {
  for (const token of extractTokens(req)) {
    await authStore.deleteSession(token);
  }
  res.setHeader(
    'Set-Cookie',
    'sra_session=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0'
  );
  res.json({ success: true, message: 'Logged out successfully.' });
});

// 5. VERIFY EMAIL
authRouter.post('/verify-email', async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, error: 'Verification token is required.' });
  }

  const tokenRecord = await authStore.findAuthToken('email_verification', token);

  if (!tokenRecord) {
    return res.status(400).json({ success: false, error: 'Invalid or already used verification code.' });
  }

  if (new Date(tokenRecord.expiresAt) < new Date()) {
    return res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new one.' });
  }

  await authStore.markAuthTokenUsed(tokenRecord.id);
  await authStore.updateUser(tokenRecord.userId, { isEmailVerified: true });

  await authStore.logAudit({
    userId: tokenRecord.userId,
    action: 'email_verified',
    details: 'User email was successfully verified.',
  });

  res.json({ success: true, message: 'Email successfully verified!' });
});

// 6. FORGOT PASSWORD
authRouter.post('/forgot-password', bruteForceGuard, async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required.' });
  }

  const user = await authStore.findUserByEmail(email);
  if (!user) {
    // For security, do not disclose if user exists
    return res.json({
      success: true,
      message: 'If an account exists with this email, a reset code has been sent.',
    });
  }

  // High-entropy reset token (not a guessable 6-digit code). Frontend accepts
  // free-text token input, so the UX is unchanged.
  const resetToken = crypto.randomBytes(24).toString('base64url');
  await authStore.createAuthToken({
    type: 'password_reset',
    tokenHash: hashAuthToken(resetToken),
    userId: user.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 60 minutes
  });

  res.json({
    success: true,
    message: 'Password reset code generated and sent.',
    ...devTokenField('testTokenHint', resetToken), // Dev-only convenience; hidden in production
  });
});

// 7. RESET PASSWORD
authRouter.post('/reset-password', bruteForceGuard, async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ success: false, error: 'Reset token and new password are required.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters long.' });
  }

  const tokenRecord = await authStore.findAuthToken('password_reset', token);

  if (!tokenRecord) {
    return res.status(400).json({ success: false, error: 'Invalid or expired reset token.' });
  }

  if (new Date(tokenRecord.expiresAt) < new Date()) {
    return res.status(400).json({ success: false, error: 'Reset token has expired.' });
  }

  const salt = generateSalt();
  const passwordHash = hashPassword(newPassword, salt);

  await authStore.markAuthTokenUsed(tokenRecord.id);
  await authStore.updateUser(tokenRecord.userId, { salt, passwordHash });
  // Invalidate all active sessions for security
  await authStore.deleteUserSessions(tokenRecord.userId);

  await authStore.logAudit({
    userId: tokenRecord.userId,
    action: 'password_reset',
    details: 'Password was successfully reset using token verification.',
  });

  res.json({ success: true, message: 'Password has been successfully reset. You can now log in.' });
});

// 8. CHANGE PASSWORD (PROTECTED)
authRouter.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const user = req.user!;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: 'Current password and new password are required.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, error: 'New password must be at least 8 characters long.' });
  }

  const currentHash = hashPassword(currentPassword, user.salt);
  if (currentHash !== user.passwordHash) {
    return res.status(401).json({ success: false, error: 'Incorrect current password.' });
  }

  const newSalt = generateSalt();
  const newHash = hashPassword(newPassword, newSalt);

  await authStore.updateUser(user.id, { salt: newSalt, passwordHash: newHash });

  await authStore.logAudit({
    userId: user.id,
    userEmail: user.email,
    workspaceId: req.workspace?.id,
    action: 'password_changed',
    details: 'User updated their password.',
  });

  res.json({ success: true, message: 'Password updated successfully.' });
});

// 9. UPDATE PROFILE (extended: personal info, email change w/ verification, preferences)
authRouter.put('/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const {
    fullName,
    avatarUrl,
    username,
    phone,
    bio,
    country,
    city,
    timezone,
    language,
    dateFormat,
    timeFormat,
    email,
    preferences,
  } = req.body || {};

  const updates: Partial<User> = {};

  if (fullName !== undefined) {
    if (typeof fullName !== 'string' || !fullName.trim()) {
      return res.status(400).json({ success: false, error: 'Full name cannot be empty.' });
    }
    updates.fullName = fullName.trim();
  }
  if (avatarUrl !== undefined) {
    const violations = findMediaViolations({ avatarUrl }, { avatarUrl: user.avatarUrl });
    if (violations.length > 0) {
      return res.status(400).json({ success: false, code: MEDIA_INGRESS_ERROR_CODE, error: 'Upload the image via POST /api/media/upload and pass the returned URL.' });
    }
    updates.avatarUrl = avatarUrl || undefined;
  }

  // Username: format + uniqueness
  if (username !== undefined) {
    const clean = String(username).trim();
    if (clean) {
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(clean)) {
        return res.status(400).json({ success: false, error: 'Username must be 3-30 characters: letters, numbers, underscores only.' });
      }
      const holder = await authStore.findUserByUsername(clean);
      const taken = holder && holder.id !== user.id ? holder : undefined;
      if (taken) {
        return res.status(409).json({ success: false, error: 'This username is already taken.' });
      }
      updates.username = clean;
    } else {
      updates.username = undefined;
    }
  }

  // Optional personal fields (validated lengths)
  const stringFields: Array<[keyof User, number]> = [
    ['phone', 32],
    ['bio', 280],
    ['country', 80],
    ['city', 80],
    ['timezone', 64],
  ];
  const raw: Record<string, any> = { phone, bio, country, city, timezone };
  for (const [field, max] of stringFields) {
    if (raw[field as string] !== undefined) {
      const val = String(raw[field as string] ?? '').trim();
      if (val.length > max) {
        return res.status(400).json({ success: false, error: `${field} is too long (max ${max} characters).` });
      }
      (updates as any)[field] = val || undefined;
    }
  }

  if (language !== undefined) {
    if (!['en', 'ar'].includes(language)) {
      return res.status(400).json({ success: false, error: 'Unsupported language.' });
    }
    updates.language = language;
  }
  if (dateFormat !== undefined) {
    const allowed = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'];
    if (!allowed.includes(dateFormat)) {
      return res.status(400).json({ success: false, error: 'Invalid date format.' });
    }
    updates.dateFormat = dateFormat;
  }
  if (timeFormat !== undefined) {
    if (!['12h', '24h'].includes(timeFormat)) {
      return res.status(400).json({ success: false, error: 'Invalid time format.' });
    }
    updates.timeFormat = timeFormat;
  }

  // Email change requires verification ” store pending, never apply directly
  let emailChangeInitiated = false;
  let emailChangeToken: string | undefined;
  if (email !== undefined && typeof email === 'string' && email.trim()) {
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }
    if (cleanEmail !== user.email.toLowerCase()) {
      if (user.email.toLowerCase() === GOD_OWNER_EMAIL.toLowerCase()) {
        return res.status(403).json({ success: false, error: 'The Primary Owner email cannot be changed.' });
      }
      const existing = await authStore.findUserByEmail(cleanEmail);
      if (existing && existing.id !== user.id) {
        return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
      }
      updates.pendingEmail = cleanEmail;
      emailChangeToken = generateToken(24);
      await authStore.createAuthToken({
        type: 'email_change',
        tokenHash: hashAuthToken(emailChangeToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      });
      emailChangeInitiated = true;
    } else {
      updates.pendingEmail = undefined;
    }
  }

  // Preferences: whitelist-merge, never trust arbitrary keys
  if (preferences !== undefined && preferences && typeof preferences === 'object') {
    const current = user.preferences || {};
    const merged: UserPreferences = { ...current };
    const allowedTheme = ['dark', 'light', 'system'];
    const allowedLang = ['en', 'ar'];
    const allowedDensity = ['compact', 'comfortable'];
    if (preferences.theme !== undefined) {
      if (!allowedTheme.includes(preferences.theme)) {
        return res.status(400).json({ success: false, error: 'Invalid theme preference.' });
      }
      merged.theme = preferences.theme;
    }
    if (preferences.language !== undefined) {
      if (!allowedLang.includes(preferences.language)) {
        return res.status(400).json({ success: false, error: 'Invalid language preference.' });
      }
      merged.language = preferences.language;
    }
    if (preferences.density !== undefined) {
      if (!allowedDensity.includes(preferences.density)) {
        return res.status(400).json({ success: false, error: 'Invalid density preference.' });
      }
      merged.density = preferences.density;
    }
    if (preferences.defaultLanding !== undefined) {
      merged.defaultLanding = String(preferences.defaultLanding).slice(0, 40);
    }
    if (preferences.sidebarCollapsed !== undefined) {
      merged.sidebarCollapsed = Boolean(preferences.sidebarCollapsed);
    }
    if (preferences.notifications && typeof preferences.notifications === 'object') {
      const notifKeys = [
        'publishingSuccess', 'publishingFailure', 'scheduledPostReminders',
        'disconnectionAlerts', 'analyticsReports', 'aiRecommendations',
        'productAnnouncements', 'emailNotifications', 'inAppNotifications',
      ] as const;
      const currentNotif = { ...(current.notifications || {}) } as Record<string, boolean>;
      for (const key of notifKeys) {
        if (preferences.notifications[key] !== undefined) {
          currentNotif[key] = Boolean(preferences.notifications[key]);
        }
      }
      merged.notifications = currentNotif as UserPreferences['notifications'];
    }
    updates.preferences = merged;
  }

  updates.profileUpdatedAt = new Date().toISOString();

  const updated = await authStore.updateUser(user.id, updates);
  if (!updated) {
    return res.status(500).json({ success: false, error: 'Failed to update profile.' });
  }

  await authStore.logAudit({
    userId: user.id,
    userEmail: user.email,
    workspaceId: req.workspace?.id,
    action: emailChangeInitiated ? 'email_change_requested' : 'profile_updated',
    details: emailChangeInitiated
      ? `User requested email change to ${updates.pendingEmail} (pending verification).`
      : 'User updated their profile information.',
  });

  const safeUser = sanitizeUserForClient(updated);
  res.json({
    success: true,
    user: safeUser,
    emailChangePending: emailChangeInitiated,
    emailChangeToken: emailChangeInitiated ? emailChangeToken : undefined,
  });
});

// 9.4 VERIFY EMAIL CHANGE
authRouter.post('/verify-email-change', async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, error: 'Verification token is required.' });
  }

  const tokenRecord = await authStore.findAuthToken('email_change', token);
  if (!tokenRecord) {
    return res.status(400).json({ success: false, error: 'Invalid or already used verification token.' });
  }
  if (new Date(tokenRecord.expiresAt) < new Date()) {
    return res.status(400).json({ success: false, error: 'Verification token has expired. Request a new email change.' });
  }

  const targetUser = await authStore.findUserById(tokenRecord.userId);
  if (!targetUser || !targetUser.pendingEmail) {
    return res.status(400).json({ success: false, error: 'No pending email change found for this account.' });
  }

  // Ensure new email still available
  const conflict = await authStore.findUserByEmail(targetUser.pendingEmail);
  if (conflict && conflict.id !== targetUser.id) {
    return res.status(409).json({ success: false, error: 'This email is now associated with another account.' });
  }

  await authStore.markAuthTokenUsed(tokenRecord.id);
  const newEmail = targetUser.pendingEmail;
  await authStore.updateUser(targetUser.id, { email: newEmail, pendingEmail: undefined, isEmailVerified: true, profileUpdatedAt: new Date().toISOString() });

  await authStore.logAudit({
    userId: targetUser.id,
    userEmail: newEmail,
    action: 'email_changed',
    details: `User email changed to ${newEmail} after verification.`,
  });

  res.json({ success: true, message: 'Email address updated and verified successfully.', email: newEmail });
});

// 9.5 ACTIVE SESSIONS (own sessions only)
authRouter.get('/sessions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const sessions = (await authStore.listUserSessions(user.id)).map((s: any) => ({
    id: s.id,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    ip: s.ip || null,
    userAgent: s.userAgent || null,
    isCurrent: s.id === req.session?.id,
  }));
  res.json({ success: true, sessions });
});

authRouter.delete('/sessions/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const ok = await authStore.deleteSessionById(user.id, req.params.id);
  if (!ok) {
    return res.status(404).json({ success: false, error: 'Session not found.' });
  }
  res.json({ success: true, message: 'Session revoked.' });
});

authRouter.post('/sessions/revoke-others', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const currentId = req.session?.id;
  const revoked = await authStore.revokeOtherSessions(user.id, currentId);
  await authStore.logAudit({
    userId: user.id,
    userEmail: user.email,
    workspaceId: req.workspace?.id,
    action: 'sessions_revoked',
    details: `User revoked ${revoked} other active session(s).`,
  });
  res.json({ success: true, message: `Signed out of ${revoked} other session(s).` });
});

// 9.6 SECURITY ACTIVITY (own audit trail only)
authRouter.get('/security/activity', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const logs = (await authStore.getAuditLogs({ userId: user.id, limit: 50 })).map((l: any) => ({
    id: l.id,
    action: l.action,
    details: l.details,
    timestamp: l.timestamp,
    ip: l.ip || null,
  }));
  res.json({ success: true, activity: logs });
});

// 9.1 MFA SETUP — disabled: previous implementation used a fake shared secret,
// not real TOTP. Re-enable only with a proper TOTP implementation (Phase E).
authRouter.post('/mfa/setup', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ success: false, error: 'Two-factor authentication is not yet available.' });
});

// 9.2 MFA VERIFY & ACTIVATE
authRouter.post('/mfa/verify', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ success: false, error: 'Two-factor authentication is not yet available.' });
});

// 9.3 MFA DISABLE
authRouter.post('/mfa/disable', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, error: 'Password required to disable MFA.' });
  }

  const currentHash = hashPassword(password, user.salt);
  if (currentHash !== user.passwordHash) {
    return res.status(401).json({ success: false, error: 'Incorrect password.' });
  }

  await authStore.updateUser(user.id, { mfaEnabled: false, mfaSecret: undefined });
  await authStore.logAudit({
    userId: user.id,
    userEmail: user.email,
    action: 'mfa_disabled',
    details: 'Two-factor authentication was disabled.',
  });

  res.json({ success: true, message: 'Two-factor authentication disabled.' });
});

// 12. PASSWORDLESS MAGIC LINK / OTP
authRouter.post('/magic-link/send', bruteForceGuard, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid email is required.' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP (UX constraint; attempt-capped below)
    const emailKey = email.toLowerCase().trim();

    // Invalidate any previous unused codes for this email
    await authStore.invalidateUnusedByEmail('magic_link', emailKey);

    await authStore.createAuthToken({
      type: 'magic_link',
      tokenHash: hashAuthToken(otpCode),
      userId: emailKey, // lookup key for magic links (type separates it from userId semantics)
      email: emailKey,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 mins
      attempts: 0,
    });

    res.json({
      success: true,
      message: `A 6-digit magic sign-in code has been sent to ${email}.`,
      ...devTokenField('testOtpHint', otpCode), // Dev-only convenience; hidden in production
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to send magic link.' });
  }
});

authRouter.post('/magic-link/verify', bruteForceGuard, async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ success: false, error: 'Email and 6-digit verification code are required.' });
    }

    const emailKey = email.toLowerCase().trim();
    // Latest unused magic_link token for this email
    const tokenRecord = await authStore.latestAuthTokenByEmail('magic_link', emailKey);

    if (!tokenRecord) {
      return res.status(400).json({ success: false, error: 'Invalid or expired magic code.' });
    }

    if (new Date(tokenRecord.expiresAt) < new Date()) {
      await authStore.markAuthTokenUsed(tokenRecord.id);
      return res.status(400).json({ success: false, error: 'Magic code has expired. Request a new one.' });
    }

    // Attempt cap: 5 wrong guesses kills the code (6-digit space is small)
    if (!tokenMatches(tokenRecord.token, code)) {
      const attempts = await authStore.bumpAuthTokenAttempts(tokenRecord.id);
      if (attempts >= MAX_TOKEN_ATTEMPTS) {
        await authStore.markAuthTokenUsed(tokenRecord.id);
      }
      return res.status(400).json({ success: false, error: 'Invalid or expired magic code.' });
    }

    await authStore.markAuthTokenUsed(tokenRecord.id);

    // Find or create user
    let user = await authStore.findUserByEmail(email);
    if (!user) {
      user = await authStore.createMagicUser({
        email,
        fullName: email.split('@')[0].replace(/[._]/g, ' ') || 'Magic User',
      }) as User;
    } else {
      await authStore.updateUser(user.id, { lastLoginAt: new Date().toISOString(), isEmailVerified: true });
    }

    const ip = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const session = await authStore.createSession(user.id, { ip, userAgent });

    setSessionCookie(res, session.token);

    const workspaces = await authStore.getUserWorkspaces(user.id);
    const activeWorkspace = workspaces[0];
    const { passwordHash, salt, ...safeUser } = user;

    res.json({
      success: true,
      message: 'Signed in successfully via Magic Code!',
      user: safeUser,
      workspace: activeWorkspace,
      workspaces,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Magic code verification failed.' });
  }
});

