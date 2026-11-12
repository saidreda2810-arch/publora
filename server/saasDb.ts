import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const GOD_OWNER_EMAIL = process.env.GOD_OWNER_EMAIL || 'saidreda2810@gmail.com';

export type UserRole =
  | 'god'
  | 'super_admin'
  | 'admin'
  | 'moderator'
  | 'support'
  | 'user'
  | 'platform_admin';

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  god: 100,
  super_admin: 80,
  platform_admin: 80,
  admin: 60,
  moderator: 40,
  support: 20,
  user: 0,
};

export function hasRoleLevel(userRole: UserRole, requiredRole: UserRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}

export type UserStatus = 'active' | 'suspended' | 'deleted';
export type WorkspaceRole = 'owner' | 'admin' | 'manager' | 'editor' | 'publisher' | 'analyst' | 'viewer' | 'member';

// Permission matrix — rank order: viewer < analyst < publisher < editor < manager < admin < owner
// 'admin' and 'member' kept as legacy aliases (admin≈manager, member≈viewer)
export const WORKSPACE_ROLE_RANK: Record<string, number> = {
  viewer: 1, member: 1,
  analyst: 2,
  publisher: 3,
  editor: 4,
  manager: 5, admin: 5,
  owner: 6,
};

export function roleRank(role?: string): number {
  return WORKSPACE_ROLE_RANK[role || 'viewer'] ?? 1;
}

export function hasWorkspacePermission(userRole: string | undefined, required: string): boolean {
  const rank = roleRank(userRole);
  switch (required) {
    case 'view': return rank >= 1;
    case 'create_content': return rank >= 4;      // editor+
    case 'publish': return rank >= 3;            // publisher+
    case 'manage_team': return rank >= 5;        // manager+
    case 'manage_workspace': return rank >= 6;   // owner only
    case 'manage_brand_settings': return rank >= 5;
    case 'view_analytics': return rank >= 2;     // analyst+
    case 'run_automation': return rank >= 4;
    default: return rank >= 1;
  }
}
export type PlanTier = 'free' | 'starter' | 'professional' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';

export interface UserNotificationPreferences {
  publishingSuccess: boolean;
  publishingFailure: boolean;
  scheduledPostReminders: boolean;
  disconnectionAlerts: boolean;
  analyticsReports: boolean;
  aiRecommendations: boolean;
  productAnnouncements: boolean;
  emailNotifications: boolean;
  inAppNotifications: boolean;
}

export interface UserPreferences {
  theme?: 'dark' | 'light' | 'system';
  language?: 'en' | 'ar';
  density?: 'compact' | 'comfortable';
  defaultLanding?: string;
  sidebarCollapsed?: boolean;
  notifications?: Partial<UserNotificationPreferences>;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  fullName: string;
  avatarUrl?: string;
  role: UserRole;
  isEmailVerified: boolean;
  status: UserStatus;
  mfaEnabled?: boolean;
  mfaSecret?: string;
  createdAt: string;
  lastLoginAt: string;
  // Extended profile fields (all user-editable, none protected)
  username?: string;
  phone?: string;
  bio?: string;
  country?: string;
  city?: string;
  timezone?: string;
  language?: 'en' | 'ar';
  dateFormat?: string;
  timeFormat?: '12h' | '24h';
  profileUpdatedAt?: string;
  pendingEmail?: string;
  deactivatedAt?: string;
  deactivationReason?: string;
  deletedAt?: string;
  deleteScheduledAt?: string;
  preferences?: UserPreferences;
}

export interface UserSession {
  id: string;
  userId: string;
  token: string;
  userAgent?: string;
  ip?: string;
  createdAt: string;
  expiresAt: string;
}

export interface VerificationToken {
  id: string;
  userId: string;
  token: string; // SHA-256 hash of the raw token/code — never stored plaintext
  type: 'email_verification' | 'password_reset' | 'email_change' | 'magic_link';
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  attempts?: number; // failed verification attempts — token dies at MAX
}

export interface WorkspaceSettings {
  defaultTimezone: string;
  defaultSchedulingMode: 'manual' | 'assisted' | 'autopilot';
  contentNiche?: string;
  maxDailyPosts: number;
  autoOptimizeTitles: boolean;
  onboardingCompleted: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: PlanTier;
  billingCycle: BillingCycle;
  createdAt: string;
  settings: WorkspaceSettings;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  invitedBy?: string | null;
  status?: 'active' | 'suspended' | 'pending' | 'removed';
  joinedAt: string;
  invitedEmail?: string;
}

export interface AuditLogEntry {
  id: string;
  workspaceId?: string;
  userId?: string;
  userEmail?: string;
  action: string;
  details: string;
  ip?: string;
  timestamp: string;
}

export interface WorkspaceDataPayload {
  brands: any[];
  activeBrandId: string | null;
  projects: any[];
  accounts: any[];
  categories: any[];
  videos: any[];
  analytics: any[];
  posts: any[];
  recommendations: any[];
  experiments: any[];
  autopilotConfig: any;
  auditLogs: any[];
  automationWorkflows?: any[];
  automationExecutions?: any[];
  customRoles?: any[];
  // Calendar module entities
  campaigns?: any[];
  contentPillars?: any[];
  contentIdeas?: any[];
  postComments?: any[];
  calendarSavedViews?: any[];
  calendarSettings?: any;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'alert' | 'success';
  active: boolean;
  createdAt: string;
  createdBy: string;
}

export interface SystemSettings {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  announcements: Announcement[];
  featureFlags: {
    userRegistration: boolean;
    socialOAuth: boolean;
    aiRetentionEngine: boolean;
    scheduledPublishing: boolean;
    workspaceSharing: boolean;
  };
  security: {
    requireEmailVerification: boolean;
    sessionExpiryDays: number;
    maxLoginAttemptsPerMinute: number;
  };
  // Immutable Primary Owner anchor — set once at GOD registration, never changed by email
  primaryOwnerUserId?: string;
  // Maintenance Center config (Phase 02)
  maintenanceConfig?: {
    mode: 'normal' | 'readonly' | 'partial' | 'full' | 'emergency';
    reason?: string;
    publicTitle?: string;
    publicMessage?: string;
    affectedServices?: string[]; // service keys; empty = all when mode=full
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    autoExpire?: boolean;
    activatedAt?: string | null;
    activatedBy?: string | null;
    previousConfig?: any | null; // rollback snapshot
  };
}

export interface SaaSDatabaseSchema {
  users: User[];
  sessions: UserSession[];
  verificationTokens: VerificationToken[];
  workspaces: Workspace[];
  workspaceMembers: WorkspaceMember[];
  workspaceInvitations?: any[];
  auditLogs: AuditLogEntry[];
  securityEvents?: AuditLogEntry[]; // separate stream — security events are never evicted by routine activity
  workspaceData: Record<string, WorkspaceDataPayload>; // key: workspaceId
  stateVersions?: Record<string, number>; // optimistic-concurrency counter per workspace (T1.0)
  systemSettings?: SystemSettings;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'saas_db.json');

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Password hashing helper using crypto.scrypt
export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  if (!password || !salt || !expectedHash) return false;
  const hash = hashPassword(password, salt);
  const hashBuf = Buffer.from(hash, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  if (hashBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, expectedBuf);
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

// In-memory cache with atomic file writes
let dbCache: SaaSDatabaseSchema | null = null;

function applyDatabaseInvariants(db: SaaSDatabaseSchema): SaaSDatabaseSchema {
  if (!db.systemSettings) {
    db.systemSettings = {
      maintenanceMode: false,
      maintenanceMessage: 'The platform is undergoing scheduled maintenance. Please check back shortly.',
      announcements: [],
      featureFlags: {
        userRegistration: true,
        socialOAuth: true,
        aiRetentionEngine: true,
        scheduledPublishing: true,
        workspaceSharing: true,
      },
      security: {
        requireEmailVerification: true,
        sessionExpiryDays: 30,
        maxLoginAttemptsPerMinute: 30,
      },
    };
  }

  // MFA migration: the previous MFA implementation used a fake shared code,
  // not real TOTP. Disable it for all users until a real implementation lands.
  for (const u of db.users) {
    if (u.mfaEnabled || u.mfaSecret) {
      u.mfaEnabled = false;
      delete u.mfaSecret;
    }
  }

  // Session migration: tokens are now stored as SHA-256 hashes. Plaintext
  // legacy sessions are upgraded in place so existing logins keep working
  // while the DB no longer holds usable tokens.
  for (const s of db.sessions || []) {
    if (s.token && !/^[0-9a-f]{64}$/.test(s.token)) {
      s.token = hashSessionToken(s.token);
    }
  }

  // Ensure GOD Primary Owner is permanently assigned to saidreda2810@gmail.com
  const godUser = db.users.find(
    (u) => u.email.toLowerCase() === GOD_OWNER_EMAIL.toLowerCase()
  );
  if (godUser) {
    godUser.role = 'god';
    godUser.isEmailVerified = true;
    godUser.status = 'active';
    // Backfill immutable owner anchor for pre-existing GOD accounts (one-time)
    if (db.systemSettings && !db.systemSettings.primaryOwnerUserId) {
      db.systemSettings.primaryOwnerUserId = godUser.id;
      saveDatabase(db);
    }
  }

  return db;
}

function loadDatabase(): SaaSDatabaseSchema {
  if (dbCache) return dbCache;

  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      dbCache = applyDatabaseInvariants(JSON.parse(content));
      return dbCache!;
    } catch (e) {
      console.error('Failed to parse saas_db.json, creating backup and reinitializing', e);
    }
  }

  // Initial seed with demo administrator and empty collections
  const adminSalt = generateSalt();
  const adminHash = hashPassword('AdminPass2026!', adminSalt);
  const adminId = 'usr_admin_master';
  const workspaceId = 'ws_default_admin';

  const initialDb: SaaSDatabaseSchema = {
    users: [
      {
        id: adminId,
        email: 'admin@srapublisher.io',
        passwordHash: adminHash,
        salt: adminSalt,
        fullName: 'Platform Administrator',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        role: 'platform_admin',
        isEmailVerified: true,
        status: 'active',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      },
    ],
    sessions: [],
    verificationTokens: [],
    workspaces: [
      {
        id: workspaceId,
        name: 'Enterprise Command',
        slug: 'enterprise-command',
        ownerId: adminId,
        plan: 'enterprise',
        billingCycle: 'yearly',
        createdAt: new Date().toISOString(),
        settings: {
          defaultTimezone: 'America/New_York',
          defaultSchedulingMode: 'assisted',
          contentNiche: 'Multi-Platform SaaS & Tech',
          maxDailyPosts: 5,
          autoOptimizeTitles: true,
          onboardingCompleted: true,
        },
      },
    ],
    workspaceMembers: [
      {
        id: 'mem_admin_default',
        workspaceId: workspaceId,
        userId: adminId,
        role: 'owner',
        joinedAt: new Date().toISOString(),
      },
    ],
    workspaceInvitations: [],
    auditLogs: [
      {
        id: 'log_seed_init',
        workspaceId,
        userId: adminId,
        userEmail: 'admin@srapublisher.io',
        action: 'system_initialized',
        details: 'Multi-Tenant SaaS database and initial Enterprise workspace provisioned.',
        timestamp: new Date().toISOString(),
      },
    ],
    workspaceData: {},
  };

  dbCache = applyDatabaseInvariants(initialDb);
  saveDatabase(initialDb);
  return initialDb;
}

export function saveDatabase(data?: SaaSDatabaseSchema) {
  const toSave = data || dbCache;
  if (!toSave) return;
  try {
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(toSave, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('Failed to atomically save saas_db.json:', err);
  }
}

// Getter functions
export function getDb(): SaaSDatabaseSchema {
  return loadDatabase();
}

// User methods
export function findUserByEmail(email: string): User | undefined {
  const db = getDb();
  return db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
}

export function findUserById(id: string): User | undefined {
  const db = getDb();
  return db.users.find((u) => u.id === id);
}

export function createUser(userData: {
  email: string;
  password: string;
  fullName: string;
  role?: UserRole;
  isEmailVerified?: boolean;
}): { user: User; verificationToken: string } {
  const db = getDb();
  const salt = generateSalt();
  const passwordHash = hashPassword(userData.password, salt);
  const userId = `usr_${crypto.randomBytes(8).toString('hex')}`;
  const cleanEmail = userData.email.toLowerCase().trim();
  const isGodOwner = cleanEmail === GOD_OWNER_EMAIL.toLowerCase();

  const assignedRole: UserRole = isGodOwner
    ? 'god'
    : (userData.role === 'god' ? 'user' : (userData.role || (db.users.length === 0 ? 'platform_admin' : 'user')));

  const newUser: User = {
    id: userId,
    email: cleanEmail,
    passwordHash,
    salt,
    fullName: userData.fullName.trim(),
    role: assignedRole,
    isEmailVerified: isGodOwner ? true : (userData.isEmailVerified || false),
    status: 'active',
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  db.users.push(newUser);

  // Generate verification token
  const token = generateToken(24);
  const verification: VerificationToken = {
    id: `tok_${crypto.randomBytes(8).toString('hex')}`,
    userId,
    token: crypto.createHash('sha256').update(token).digest('hex'), // store hash only
    type: 'email_verification',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), // 24h
  };
  db.verificationTokens.push(verification);

  // Create default workspace for new user
  const workspaceName = `${newUser.fullName}'s Workspace`;
  const workspaceId = `ws_${crypto.randomBytes(8).toString('hex')}`;
  const slug = `${newUser.fullName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${userId.slice(-4)}`;

  const workspace: Workspace = {
    id: workspaceId,
    name: workspaceName,
    slug,
    ownerId: userId,
    plan: isGodOwner ? 'enterprise' : 'free',
    billingCycle: 'monthly',
    createdAt: new Date().toISOString(),
    settings: {
      defaultTimezone: 'UTC',
      defaultSchedulingMode: 'assisted',
      maxDailyPosts: isGodOwner ? 20 : 2,
      autoOptimizeTitles: true,
      onboardingCompleted: false,
    },
  };

  db.workspaces.push(workspace);

  db.workspaceMembers.push({
    id: `mem_${crypto.randomBytes(8).toString('hex')}`,
    workspaceId,
    userId,
    role: 'owner',
    joinedAt: new Date().toISOString(),
  });

  // Anchor Primary Owner to immutable user ID (set once, never reassigned)
  if (isGodOwner && !db.systemSettings?.primaryOwnerUserId) {
    if (!db.systemSettings) {
      db.systemSettings = {
        maintenanceMode: false,
        maintenanceMessage: '',
        announcements: [],
        featureFlags: { userRegistration: true, socialOAuth: true, aiRetentionEngine: true, scheduledPublishing: true, workspaceSharing: true },
        security: { requireEmailVerification: false, sessionExpiryDays: 30, maxLoginAttemptsPerMinute: 10 },
      };
    }
    db.systemSettings.primaryOwnerUserId = userId;
  }

  // Log action
  db.auditLogs.unshift({
    id: `log_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    workspaceId,
    userId,
    userEmail: newUser.email,
    action: isGodOwner ? 'primary_god_owner_registered' : 'user_registered',
    details: isGodOwner
      ? `Primary GOD Owner (${newUser.email}) registered and assigned supreme platform authority.`
      : `User ${newUser.email} registered and default workspace created.`,
    timestamp: new Date().toISOString(),
  });

  saveDatabase(db);
  return { user: newUser, verificationToken: token };
}

export function updateUser(id: string, updates: Partial<User>): User | undefined {
  const db = getDb();
  const index = db.users.findIndex((u) => u.id === id);
  if (index === -1) return undefined;

  const targetUser = db.users[index];
  const isTargetGod = targetUser.email.toLowerCase() === GOD_OWNER_EMAIL.toLowerCase() || targetUser.role === 'god';

  // Primary GOD Owner Protection Guards:
  if (isTargetGod) {
    if (updates.role && updates.role !== 'god') {
      throw new Error('IMMUTABLE: The Primary GOD Owner role cannot be demoted, modified, or revoked.');
    }
    if (updates.email && updates.email.toLowerCase() !== GOD_OWNER_EMAIL.toLowerCase()) {
      throw new Error('IMMUTABLE: The Primary GOD Owner email cannot be altered.');
    }
    if (updates.status && updates.status === 'suspended') {
      throw new Error('IMMUTABLE: The Primary GOD Owner account cannot be suspended.');
    }
  } else {
    if (updates.role === 'god') {
      throw new Error('RESERVED: The GOD role is permanently reserved for the Primary Owner (saidreda2810@gmail.com).');
    }
  }

  db.users[index] = { ...db.users[index], ...updates };
  saveDatabase(db);
  return db.users[index];
}

export function deleteUser(id: string): { success: boolean; error?: string } {
  const db = getDb();
  const target = db.users.find((u) => u.id === id);
  if (!target) return { success: false, error: 'User not found.' };

  if (target.email.toLowerCase() === GOD_OWNER_EMAIL.toLowerCase() || target.role === 'god') {
    return { success: false, error: 'PROTECTED: The Primary GOD Owner account cannot be deleted under any circumstances.' };
  }

  // Remove sessions
  db.sessions = db.sessions.filter((s) => s.userId !== id);
  // Remove workspace memberships and owned workspaces
  const userMemberships = db.workspaceMembers.filter((m) => m.userId === id && m.role === 'owner');
  userMemberships.forEach((m) => {
    delete db.workspaceData[m.workspaceId];
    db.workspaces = db.workspaces.filter((w) => w.id !== m.workspaceId);
  });
  db.workspaceMembers = db.workspaceMembers.filter((m) => m.userId !== id);
  // Remove user record
  db.users = db.users.filter((u) => u.id !== id);

  saveDatabase(db);
  return { success: true };
}

// Strict Privacy Sanitizer: Redacts passwordHash, salt, and mfaSecret
export function sanitizeUserForClient(user: User) {
  const { passwordHash, salt, mfaSecret, ...safe } = user;
  return safe;
}

export function getSystemSettings(): SystemSettings {
  const db = getDb();
  if (!db.systemSettings) {
    db.systemSettings = {
      maintenanceMode: false,
      maintenanceMessage: 'The platform is undergoing scheduled maintenance. Please check back shortly.',
      announcements: [],
      featureFlags: {
        userRegistration: true,
        socialOAuth: true,
        aiRetentionEngine: true,
        scheduledPublishing: true,
        workspaceSharing: true,
      },
      security: {
        requireEmailVerification: true,
        sessionExpiryDays: 30,
        maxLoginAttemptsPerMinute: 30,
      },
    };
    saveDatabase(db);
  }
  return db.systemSettings;
}

export function updateSystemSettings(updates: Partial<SystemSettings>): SystemSettings {
  const db = getDb();
  const current = getSystemSettings();
  db.systemSettings = {
    ...current,
    ...updates,
    featureFlags: { ...current.featureFlags, ...(updates.featureFlags || {}) },
    security: { ...current.security, ...(updates.security || {}) },
  };
  saveDatabase(db);
  return db.systemSettings;
}

export function addAnnouncement(announcement: Omit<Announcement, 'id' | 'createdAt'>): Announcement {
  const settings = getSystemSettings();
  const newAnn: Announcement = {
    ...announcement,
    id: `ann_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    createdAt: new Date().toISOString(),
  };
  settings.announcements.unshift(newAnn);
  updateSystemSettings({ announcements: settings.announcements });
  return newAnn;
}

export function removeAnnouncement(id: string): boolean {
  const settings = getSystemSettings();
  const initialLen = settings.announcements.length;
  settings.announcements = settings.announcements.filter((a) => a.id !== id);
  if (settings.announcements.length !== initialLen) {
    updateSystemSettings({ announcements: settings.announcements });
    return true;
  }
  return false;
}

// Session tokens are high-entropy random values, so SHA-256 is sufficient —
// the DB never stores a usable token, only its hash.
function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// Session methods. The raw token is returned to the caller exactly once
// (cookie/response body); only its SHA-256 hash is persisted.
export function createSession(userId: string, reqMeta?: { ip?: string; userAgent?: string }): UserSession {
  const db = getDb();
  const rawToken = generateToken(48);
  const session: UserSession = {
    id: `ses_${crypto.randomBytes(8).toString('hex')}`,
    userId,
    token: rawToken,
    ip: reqMeta?.ip,
    userAgent: reqMeta?.userAgent,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(), // 30 days
  };

  db.sessions.push({ ...session, token: hashSessionToken(rawToken) });
  saveDatabase(db);
  return session;
}

export function findSessionByToken(token: string): UserSession | undefined {
  const db = getDb();
  const hash = hashSessionToken(token);
  const stored = db.sessions.find((s) => s.token === hash);
  if (!stored) return undefined;

  // Check expiration
  if (new Date(stored.expiresAt) < new Date()) {
    deleteSession(token);
    return undefined;
  }
  return { ...stored, token };
}

export function deleteSession(token: string) {
  const db = getDb();
  const hash = hashSessionToken(token);
  db.sessions = db.sessions.filter((s) => s.token !== hash && s.token !== token);
  saveDatabase(db);
}

export function deleteUserSessions(userId: string) {
  const db = getDb();
  db.sessions = db.sessions.filter((s) => s.userId !== userId);
  saveDatabase(db);
}

// Workspaces
export function getUserWorkspaces(userId: string): Workspace[] {
  const db = getDb();
  const memberWorkspaceIds = db.workspaceMembers
    .filter((m) => m.userId === userId)
    .map((m) => m.workspaceId);
  return db.workspaces.filter((w) => memberWorkspaceIds.includes(w.id));
}

export function findWorkspaceById(id: string): Workspace | undefined {
  const db = getDb();
  return db.workspaces.find((w) => w.id === id);
}

export function createWorkspace(ownerId: string, name: string): Workspace {
  const db = getDb();
  const id = `ws_${crypto.randomBytes(8).toString('hex')}`;
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${id.slice(-4)}`;

  const ws: Workspace = {
    id,
    name,
    slug,
    ownerId,
    plan: 'free',
    billingCycle: 'monthly',
    createdAt: new Date().toISOString(),
    settings: {
      defaultTimezone: 'UTC',
      defaultSchedulingMode: 'assisted',
      maxDailyPosts: 2,
      autoOptimizeTitles: true,
      onboardingCompleted: true,
    },
  };

  db.workspaces.push(ws);
  db.workspaceMembers.push({
    id: `mem_${crypto.randomBytes(8).toString('hex')}`,
    workspaceId: id,
    userId: ownerId,
    role: 'owner',
    joinedAt: new Date().toISOString(),
  });

  saveDatabase(db);
  return ws;
}

export function updateWorkspace(id: string, updates: Partial<Workspace>): Workspace | undefined {
  const db = getDb();
  const index = db.workspaces.findIndex((w) => w.id === id);
  if (index === -1) return undefined;
  db.workspaces[index] = { ...db.workspaces[index], ...updates };
  saveDatabase(db);
  return db.workspaces[index];
}

export function getMemberRole(userId: string, workspaceId?: string): WorkspaceRole | undefined {
  if (!workspaceId) return undefined;
  const db = getDb();
  const member = db.workspaceMembers.find((m) => m.workspaceId === workspaceId && m.userId === userId);
  if (!member) return undefined;
  // Resolve custom role → its baseRole for permission checks
  const customRoleId = (member as any).customRoleId;
  if (customRoleId) {
    const wsData = db.workspaceData?.[workspaceId];
    const custom = wsData?.customRoles?.find((r: any) => r.id === customRoleId);
    if (custom?.baseRole) return custom.baseRole as WorkspaceRole;
  }
  return member.role;
}

export function getWorkspaceMembers(workspaceId: string): (WorkspaceMember & { user?: { fullName: string; email: string; avatarUrl?: string } })[] {
  const db = getDb();
  const members = db.workspaceMembers.filter((m) => m.workspaceId === workspaceId);
  return members.map((m) => {
    const user = db.users.find((u) => u.id === m.userId);
    return {
      ...m,
      user: user ? { fullName: user.fullName, email: user.email, avatarUrl: user.avatarUrl } : undefined,
    };
  });
}

// Workspace Data persistence (tenant-isolated)
export function getWorkspaceData(workspaceId: string): WorkspaceDataPayload {
  const db = getDb();
  if (!db.workspaceData[workspaceId]) {
    db.workspaceData[workspaceId] = {
      brands: [],
      activeBrandId: null,
      projects: [],
      accounts: [],
      categories: [],
      videos: [],
      analytics: [],
      posts: [],
      recommendations: [],
      experiments: [],
      autopilotConfig: {
        mode: 'assisted',
        emergencyPaused: false,
        permissions: {
          useRetentionAnalysis: true,
          autoOptimizePublishingTimes: true,
          optimizeCaptionsTitlesTags: true,
          adjustPublishingFrequency: false,
        },
        safeguards: {
          maxDailyPostsPerChannel: 3,
          minSpacingHours: 4,
          blackoutHoursStart: 0,
          blackoutHoursEnd: 7,
          neverRescheduleInFlight: true,
          requireApprovalBelowConfidence: 70,
        },
        totalAutonomousActions: 0,
      },
      auditLogs: [],
      automationWorkflows: [],
      automationExecutions: [],
      campaigns: [],
      contentPillars: [],
      contentIdeas: [],
      postComments: [],
      calendarSavedViews: [],
      calendarSettings: {
        timezone: 'UTC',
        weekStartsOn: 0, // 0=Sun, 1=Mon, 6=Sat
        workingDays: [1, 2, 3, 4, 5],
        workingHoursStart: 9,
        workingHoursEnd: 18,
        defaultView: 'month',
        density: 'comfortable',
        autoRefreshSec: 30,
      },
    };
    saveDatabase(db);
  }
  return db.workspaceData[workspaceId];
}

export function getWorkspaceStateVersion(workspaceId: string): number {
  const db = getDb();
  return db.stateVersions?.[workspaceId] || 0;
}

export function saveWorkspaceData(workspaceId: string, data: Partial<WorkspaceDataPayload>) {
  const db = getDb();
  const current = getWorkspaceData(workspaceId);
  db.workspaceData[workspaceId] = {
    ...current,
    ...data,
  };
  // Every persisted mutation bumps the version so clients holding a stale
  // baseVersion get a 409 instead of silently lost-updating.
  db.stateVersions = db.stateVersions || {};
  db.stateVersions[workspaceId] = (db.stateVersions[workspaceId] || 0) + 1;
  saveDatabase(db);
}

// Actions that must survive routine audit-log churn — auth, privilege,
// session, billing, and infrastructure events.
const SECURITY_ACTION_PATTERN =
  /(login|logout|auth|session|mfa|password|passkey|sso|magic|otp|verification|role|permission|god_|owner|admin_|scheduler|backup|recovery|maintenance|plan|subscription|billing|invite|member_|ownership|account_self|security|brute|restricted|oauth|token)/i;

// Audit Logs
export function logAuditEvent(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) {
  const db = getDb();
  const record: AuditLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    ...entry,
    timestamp: new Date().toISOString(),
  };

  if (SECURITY_ACTION_PATTERN.test(entry.action)) {
    db.securityEvents = db.securityEvents || [];
    db.securityEvents.unshift(record);
    if (db.securityEvents.length > 5000) {
      db.securityEvents = db.securityEvents.slice(0, 5000);
    }
  }

  db.auditLogs.unshift(record);
  // Cap general audit log to 1000 items (security events are preserved above)
  if (db.auditLogs.length > 1000) {
    db.auditLogs = db.auditLogs.slice(0, 1000);
  }
  saveDatabase(db);
}

export function getAuditLogs(filter?: { workspaceId?: string; userId?: string; limit?: number }) {
  const db = getDb();
  let logs = db.auditLogs;
  if (filter?.workspaceId) {
    logs = logs.filter((l) => l.workspaceId === filter.workspaceId);
  }
  if (filter?.userId) {
    logs = logs.filter((l) => l.userId === filter.userId);
  }
  return logs.slice(0, filter?.limit || 100);
}
