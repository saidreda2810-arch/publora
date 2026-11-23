/**
 * authStore — driver-aware auth persistence facade (WP9).
 *
 * DB_DRIVER=json → delegates to saasDb (identical legacy behavior).
 * DB_DRIVER=pg   → PostgreSQL via db/client (users/sessions/workspaces/
 *                  members/auth_tokens/audit_logs).
 *
 * Global system settings intentionally stay JSON-backed in both modes
 * (they are platform config, not tenant data) — documented divergence.
 */
import crypto from 'node:crypto';
import * as db from './saasDb.ts';
import { query, withTransaction } from './db/client.ts';
import { getRepos } from './repos/index.ts';
import type { User, UserSession, VerificationToken, Workspace, WorkspaceMember } from './saasDb.ts';

const isPg = () => process.env.DB_DRIVER === 'pg';
const sha256 = (s: string) => crypto.createHash('sha256').update(s.trim()).digest('hex');
const rid = (p: string) => `${p}_${crypto.randomBytes(8).toString('hex')}`;
const tsOrNull = (v: any) => (v ? new Date(v).toISOString() : null);
const LEGACY = (col: string) => `(${col}::text=$1 OR legacy_id=$2)`;

const USER_COLS = `id,legacy_id,email,password_hash,password_salt,full_name,avatar_url,username,phone,bio,
  country,city,timezone,language,date_format,time_format,role,status,is_email_verified,preferences,
  pending_email,profile_updated_at,mfa_enabled,mfa_secret,deactivated_at,deactivation_reason,
  deleted_at,delete_scheduled_at,created_at,updated_at,last_login_at`;

function mapUser(r: any): User {
  if (!r) return r;
  return {
    id: r.legacy_id || r.id,
    email: r.email,
    passwordHash: r.password_hash ?? r.passwordHash,
    salt: r.password_salt ?? r.salt,
    fullName: r.full_name ?? r.fullName,
    avatarUrl: r.avatar_url ?? r.avatarUrl,
    username: r.username,
    phone: r.phone,
    bio: r.bio,
    country: r.country,
    city: r.city,
    timezone: r.timezone,
    language: r.language,
    dateFormat: r.date_format ?? r.dateFormat,
    timeFormat: r.time_format ?? r.timeFormat,
    role: r.role,
    status: r.status,
    isEmailVerified: r.is_email_verified ?? r.isEmailVerified,
    mfaEnabled: r.mfa_enabled ?? r.mfaEnabled,
    mfaSecret: r.mfa_secret ?? r.mfaSecret,
    pendingEmail: r.pending_email ?? r.pendingEmail,
    profileUpdatedAt: r.profile_updated_at ?? r.profileUpdatedAt,
    deactivatedAt: r.deactivated_at ?? r.deactivatedAt,
    deactivationReason: r.deactivation_reason ?? r.deactivationReason,
    deletedAt: r.deleted_at ?? r.deletedAt,
    deleteScheduledAt: r.delete_scheduled_at ?? r.deleteScheduledAt,
    preferences: typeof r.preferences === 'string' ? JSON.parse(r.preferences) : (r.preferences || undefined),
    createdAt: r.created_at ?? r.createdAt,
    updatedAt: r.updated_at ?? r.updatedAt,
    lastLoginAt: r.last_login_at ?? r.lastLoginAt,
  } as User;
}

function mapWorkspace(r: any, ownerLegacy?: string): Workspace {
  const settings = typeof r.settings === 'string' ? JSON.parse(r.settings) : (r.settings || {});
  return {
    id: r.legacy_id || r.id,
    name: r.name,
    slug: r.slug,
    ownerId: ownerLegacy ?? r.owner_id,
    plan: r.plan,
    billingCycle: r.billing_cycle ?? r.billingCycle,
    createdAt: r.created_at ?? r.createdAt,
    settings,
  } as Workspace;
}

function mapSession(r: any, rawToken?: string): UserSession {
  return {
    id: r.legacy_id || r.id,
    userId: r.user_legacy || r.userId,
    token: rawToken ?? r.token,
    ip: r.ip ?? undefined,
    userAgent: r.user_agent ?? r.userAgent,
    createdAt: r.created_at ?? r.createdAt,
    expiresAt: r.expires_at ?? r.expiresAt,
  } as UserSession;
}

function mapInvitation(r: any, withToken = false) {
  const now = Date.now();
  const status = r.revoked_at ? 'revoked'
    : r.accepted_at ? 'accepted'
    : new Date(r.expires_at).getTime() < now ? 'expired'
    : 'pending';
  return {
    id: r.id,
    workspaceId: r.ws_legacy || r.workspaceId,
    email: r.email,
    role: r.role,
    tokenHash: withToken ? r.token_hash : undefined,
    status,
    invitedBy: r.inviter_legacy || r.invitedBy || undefined,
    createdAt: r.created_at ?? r.createdAt,
    expiresAt: r.expires_at ?? r.expiresAt,
    acceptedAt: r.accepted_at ?? r.acceptedAt ?? undefined,
  };
}

function mapToken(r: any): VerificationToken {
  return {
    id: r.id,
    userId: r.user_legacy || r.user_id || r.userId || r.email || '',
    token: r.token_hash ?? r.token,
    type: r.type,
    createdAt: r.created_at ?? r.createdAt,
    expiresAt: r.expires_at ?? r.expiresAt,
    usedAt: r.used_at ?? r.usedAt,
    attempts: r.attempts ?? 0,
  } as VerificationToken;
}

const validInet = (ip?: string) => (ip && /^[0-9a-fA-F.:]+$/.test(ip) && ip.length <= 45 ? ip : null);

// ---------------------------------------------------------------- JSON driver

const json = {
  findUserByEmail: (email: string) => db.findUserByEmail(email),
  findUserById: (id: string) => db.findUserById(id),
  findUserByUsername: (username: string) => {
    const d = db.getDb();
    const u = (d.users || []).find((x: any) => x.username && x.username.toLowerCase() === username.toLowerCase());
    return u as User | undefined;
  },
  updateUser: (id: string, updates: Partial<User>) => db.updateUser(id, updates),
  deleteUser: (id: string) => db.deleteUser(id),
  registerUser: (input: { email: string; password: string; fullName: string }) => db.createUser(input),
  createMagicUser: (input: { email: string; fullName: string }) => {
    // Mirrors the magic-link auto-provision block in authRouter (JSON path).
    const d = db.getDb();
    const salt = db.generateSalt();
    const user: User = {
      id: rid('usr'),
      email: input.email.toLowerCase().trim(),
      passwordHash: db.hashPassword(db.generateToken(16), salt),
      salt,
      fullName: input.fullName,
      role: (d.users.length === 0 ? 'platform_admin' : 'user') as any,
      isEmailVerified: true,
      status: 'active',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    d.users.push(user);
    const wsId = rid('ws');
    const ws: Workspace = {
      id: wsId,
      name: `${user.fullName}'s Workspace`,
      slug: `${user.fullName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${user.id.slice(-4)}`,
      ownerId: user.id,
      plan: 'free',
      billingCycle: 'monthly',
      createdAt: new Date().toISOString(),
      settings: { defaultTimezone: 'UTC', defaultSchedulingMode: 'assisted', maxDailyPosts: 2, autoOptimizeTitles: true, onboardingCompleted: false },
    };
    d.workspaces.push(ws);
    d.workspaceMembers.push({ id: rid('mem'), workspaceId: wsId, userId: user.id, role: 'owner', joinedAt: new Date().toISOString() } as any);
    db.saveDatabase(d);
    return user;
  },
  createSession: (userId: string, meta?: { ip?: string; userAgent?: string }) => db.createSession(userId, meta),
  findSessionByToken: (token: string) => db.findSessionByToken(token),
  deleteSession: (token: string) => db.deleteSession(token),
  deleteUserSessions: (userId: string) => db.deleteUserSessions(userId),
  listUserSessions: (userId: string) => {
    const d = db.getDb();
    const now = Date.now();
    return (d.sessions || [])
      .filter((s: any) => s.userId === userId && new Date(s.expiresAt).getTime() > now)
      .map((s: any) => ({ id: s.id, createdAt: s.createdAt, expiresAt: s.expiresAt, ip: s.ip || null, userAgent: s.userAgent || null })) as any[];
  },
  deleteSessionById: (userId: string, sessionId: string) => {
    const d = db.getDb();
    const s = (d.sessions || []).find((x: any) => x.id === sessionId);
    if (!s || s.userId !== userId) return false;
    d.sessions = d.sessions.filter((x: any) => x.id !== sessionId);
    db.saveDatabase(d);
    return true;
  },
  revokeOtherSessions: (userId: string, keepId?: string) => {
    const d = db.getDb();
    const before = (d.sessions || []).filter((s: any) => s.userId === userId).length;
    d.sessions = (d.sessions || []).filter((s: any) => s.userId !== userId || s.id === keepId);
    db.saveDatabase(d);
    return before - d.sessions.filter((s: any) => s.userId === userId).length;
  },
  getUserWorkspaces: (userId: string) => db.getUserWorkspaces(userId),
  findWorkspaceById: (id: string) => db.findWorkspaceById(id),
  createWorkspace: (ownerId: string, name: string) => db.createWorkspace(ownerId, name),
  updateWorkspace: (id: string, updates: Partial<Workspace>) => db.updateWorkspace(id, updates),
  getMemberRole: (userId: string, workspaceId?: string) => db.getMemberRole(userId, workspaceId),
  getWorkspaceMembers: (workspaceId: string) => db.getWorkspaceMembers(workspaceId) as any,
  findAuthToken: (type: string, secret: string) => {
    const d = db.getDb();
    const hash = sha256(secret);
    const rec = (d.verificationTokens || []).find(
      (t: any) => t.type === type && (t.token === hash || t.token === secret.trim()) && !t.usedAt,
    );
    return rec as VerificationToken | undefined;
  },
  latestAuthTokenByEmail: (type: string, email: string) => {
    const d = db.getDb();
    const key = email.toLowerCase().trim();
    return (d.verificationTokens || [])
      .filter((t: any) => t.type === type && t.userId === key && !t.usedAt)
      .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] as VerificationToken | undefined;
  },
  createAuthToken: (t: { type: string; tokenHash: string; userId?: string; email?: string; expiresAt: string; attempts?: number }) => {
    const d = db.getDb();
    d.verificationTokens = d.verificationTokens || [];
    const rec = {
      id: rid('tok'),
      userId: t.userId || '',
      token: t.tokenHash,
      type: t.type,
      createdAt: new Date().toISOString(),
      expiresAt: t.expiresAt,
      attempts: t.attempts || 0,
    } as any;
    d.verificationTokens.push(rec);
    db.saveDatabase(d);
    return rec as VerificationToken;
  },
  markAuthTokenUsed: (id: string) => {
    const d = db.getDb();
    const t = (d.verificationTokens || []).find((x: any) => x.id === id);
    if (t) { t.usedAt = new Date().toISOString(); db.saveDatabase(d); }
  },
  bumpAuthTokenAttempts: (id: string) => {
    const d = db.getDb();
    const t = (d.verificationTokens || []).find((x: any) => x.id === id);
    if (t) { t.attempts = (t.attempts || 0) + 1; db.saveDatabase(d); return t.attempts; }
    return 0;
  },
  invalidateUnusedByEmail: (type: string, email: string) => {
    const d = db.getDb();
    const key = email.toLowerCase().trim();
    const now = new Date().toISOString();
    for (const t of d.verificationTokens || []) {
      if ((t as any).type === type && (t as any).userId === key && !(t as any).usedAt) (t as any).usedAt = now;
    }
    db.saveDatabase(d);
  },
  logAudit: (entry: any) => db.logAuditEvent(entry),
  getAuditLogs: (filter?: any) => db.getAuditLogs(filter) as any[],
  listUsers: () => (db.getDb().users || []) as any[],
  listWorkspaces: () => (db.getDb().workspaces || []) as any[],
  listSessions: () => {
    const d = db.getDb();
    return ((d.sessions || []) as any[]).map((s) => ({
      ...s,
      user: (d.users || []).find((u: any) => u.id === s.userId) || null,
    }));
  },
  adminDeleteSession: (sessionId: string) => {
    const d = db.getDb();
    const before = (d.sessions || []).length;
    d.sessions = (d.sessions || []).filter((s: any) => s.id !== sessionId);
    db.saveDatabase(d);
    return before - (d.sessions || []).length;
  },
  // ---- workspace invitations ----
  listInvitations: (workspaceId: string) =>
    ((db.getDb().workspaceInvitations || []) as any[]).filter((i) => i.workspaceId === workspaceId),
  findInvitationByTokenHash: (tokenHash: string) =>
    ((db.getDb().workspaceInvitations || []) as any[]).find((i) => i.tokenHash === tokenHash),
  findInvitationById: (id: string, workspaceId: string) =>
    ((db.getDb().workspaceInvitations || []) as any[]).find((i) => i.id === id && i.workspaceId === workspaceId),
  createInvitation: (inv: any) => {
    const d = db.getDb();
    d.workspaceInvitations = [...(d.workspaceInvitations || []), inv];
    db.saveDatabase(d);
    return inv;
  },
  updateInvitation: (id: string, updates: any) => {
    const d = db.getDb();
    const inv = (d.workspaceInvitations || []).find((i: any) => i.id === id);
    if (!inv) return undefined;
    Object.assign(inv, updates);
    db.saveDatabase(d);
    return inv;
  },
  // ---- workspace member mutations ----
  listWorkspaceMemberRecords: (workspaceId: string) =>
    ((db.getDb().workspaceMembers || []) as any[]).filter((m) => m.workspaceId === workspaceId),
  listUserMemberships: (userId: string) =>
    ((db.getDb().workspaceMembers || []) as any[]).filter((m) => m.userId === userId),
  addWorkspaceMember: (m: any) => {
    const d = db.getDb();
    d.workspaceMembers = [...(d.workspaceMembers || []), m];
    db.saveDatabase(d);
    return m;
  },
  updateWorkspaceMember: (memberId: string, workspaceId: string, updates: any) => {
    const d = db.getDb();
    const m = (d.workspaceMembers || []).find((x: any) => x.id === memberId && x.workspaceId === workspaceId);
    if (!m) return undefined;
    Object.assign(m, updates);
    db.saveDatabase(d);
    return m;
  },
  removeWorkspaceMember: (memberId: string, workspaceId: string) => {
    const d = db.getDb();
    const before = (d.workspaceMembers || []).length;
    d.workspaceMembers = (d.workspaceMembers || []).filter((x: any) => !(x.id === memberId && x.workspaceId === workspaceId));
    db.saveDatabase(d);
    return before - (d.workspaceMembers || []).length;
  },
  transferOwnership: (workspaceId: string, actorUserId: string, targetMemberId: string) => {
    const d = db.getDb();
    const members = d.workspaceMembers || [];
    const target = members.find((m: any) => m.id === targetMemberId && m.workspaceId === workspaceId);
    if (!target) return { ok: false as const, error: 'Member not found' };
    if (target.userId === actorUserId) return { ok: false as const, error: 'Already the owner' };
    if (target.status && target.status !== 'active') return { ok: false as const, error: 'Target member is not active' };
    const currentOwner = members.find((m: any) => m.workspaceId === workspaceId && m.userId === actorUserId && m.role === 'owner');
    if (currentOwner) currentOwner.role = 'manager';
    target.role = 'owner';
    db.saveDatabase(d);
    return { ok: true as const, target };
  },
};

// ---------------------------------------------------------------- PG driver

const pg = {
  async findUserByEmail(email: string) {
    return mapUser((await query(`SELECT ${USER_COLS} FROM users WHERE lower(email)=lower($1)`, [email])).rows[0]);
  },
  async findUserById(id: string) {
    return mapUser((await query(`SELECT ${USER_COLS} FROM users WHERE ${LEGACY('id::text')} OR id::text=$3`, [id, id, id])).rows[0]);
  },
  async findUserByUsername(username: string) {
    return mapUser((await query(`SELECT ${USER_COLS} FROM users WHERE lower(username)=lower($1)`, [username])).rows[0]);
  },
  async updateUser(id: string, updates: Partial<User>) {
    const target = await pg.findUserById(id);
    if (!target) return undefined;
    const isGod = target.email.toLowerCase() === db.GOD_OWNER_EMAIL.toLowerCase() || target.role === 'god';
    if (isGod) {
      if (updates.role && updates.role !== 'god') throw new Error('IMMUTABLE: The Primary GOD Owner role cannot be demoted, modified, or revoked.');
      if (updates.email && updates.email.toLowerCase() !== db.GOD_OWNER_EMAIL.toLowerCase()) throw new Error('IMMUTABLE: The Primary GOD Owner email cannot be altered.');
      if (updates.status && updates.status === 'suspended') throw new Error('IMMUTABLE: The Primary GOD Owner account cannot be suspended.');
    } else if (updates.role === 'god') {
      throw new Error('RESERVED: The GOD role is permanently reserved for the Primary Owner.');
    }
    const colMap: Record<string, string> = {
      email: 'email', fullName: 'full_name', avatarUrl: 'avatar_url', username: 'username', phone: 'phone',
      bio: 'bio', country: 'country', city: 'city', timezone: 'timezone', language: 'language',
      dateFormat: 'date_format', timeFormat: 'time_format', role: 'role', status: 'status',
      isEmailVerified: 'is_email_verified', mfaEnabled: 'mfa_enabled', mfaSecret: 'mfa_secret',
      pendingEmail: 'pending_email', profileUpdatedAt: 'profile_updated_at', deactivatedAt: 'deactivated_at',
      deactivationReason: 'deactivation_reason', deletedAt: 'deleted_at', deleteScheduledAt: 'delete_scheduled_at',
      lastLoginAt: 'last_login_at', passwordHash: 'password_hash', salt: 'password_salt',
      preferences: 'preferences',
    };
    const dateCols = new Set(['profileUpdatedAt', 'deactivatedAt', 'deleteScheduledAt', 'lastLoginAt']);
    const jsonCols = new Set(['preferences']);
    const sets: string[] = ['updated_at=now()']; const vals: any[] = []; let i = 1;
    for (const [k, col] of Object.entries(colMap)) {
      if (!(k in updates)) continue;
      const v = (updates as any)[k];
      if (v === undefined) { sets.push(`${col}=NULL`); continue; } // literal NULL — pg can't type untyped null params
      sets.push(`${col}=$${i++}`);
      vals.push(jsonCols.has(k) ? JSON.stringify(v) : dateCols.has(k) ? tsOrNull(v) : v);
    }
    const uidRow = (await query(`SELECT id FROM users WHERE ${LEGACY('id::text')} OR id::text=$3`, [id, id, id])).rows[0];
    if (!uidRow) return undefined;
    vals.push(uidRow.id);
    await query(`UPDATE users SET ${sets.join(',')} WHERE id=$${i}`, vals);
    return pg.findUserById(id);
  },
  async deleteUser(id: string) {
    const target = await pg.findUserById(id);
    if (!target) return { success: false, error: 'User not found.' };
    if (target.email.toLowerCase() === db.GOD_OWNER_EMAIL.toLowerCase() || target.role === 'god') {
      return { success: false, error: 'PROTECTED: The Primary GOD Owner account cannot be deleted under any circumstances.' };
    }
    await withTransaction(async (c) => {
      const u = (await c.query(`SELECT id FROM users WHERE ${LEGACY('id::text')} OR id::text=$3`, [id, id, id])).rows[0];
      if (!u) return;
      await c.query('DELETE FROM workspaces WHERE owner_id=$1', [u.id]);
      await c.query('DELETE FROM users WHERE id=$1', [u.id]);
    });
    return { success: true };
  },
  async registerUser(input: { email: string; password: string; fullName: string }) {
    const cleanEmail = input.email.toLowerCase().trim();
    const isGod = cleanEmail === db.GOD_OWNER_EMAIL.toLowerCase();
    return withTransaction(async (c) => {
      const count = Number((await c.query('SELECT count(*)::int AS n FROM users')).rows[0].n);
      const role = isGod ? 'god' : (count === 0 ? 'platform_admin' : 'user');
      const salt = db.generateSalt();
      const userLegacy = rid('usr');
      const u = (await c.query(
        `INSERT INTO users(legacy_id,email,password_hash,password_salt,full_name,role,status,is_email_verified,created_at,updated_at,last_login_at)
         VALUES($1,$2,$3,$4,$5,$6,'active',$7,now(),now(),now()) RETURNING id`,
        [userLegacy, cleanEmail, db.hashPassword(input.password, salt), salt, input.fullName.trim(), role, isGod],
      )).rows[0];
      // verification token (hash only)
      const rawToken = db.generateToken(24);
      await c.query(
        `INSERT INTO auth_tokens(type,token_hash,user_id,expires_at,attempts,created_at)
         VALUES('email_verification',$1,$2,now()+interval '24 hours',0,now())`,
        [sha256(rawToken), u.id],
      );
      // default workspace + owner member
      const wsLegacy = rid('ws');
      const wsName = `${input.fullName.trim()}'s Workspace`;
      let slug = `${wsName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${userLegacy.slice(-4)}`;
      let w;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          w = (await c.query(
            `INSERT INTO workspaces(legacy_id,name,slug,owner_id,plan,settings,state_version,created_at,updated_at)
             VALUES($1,$2,$3,$4,$5,$6,0,now(),now()) RETURNING id`,
            [wsLegacy, wsName, slug, u.id, isGod ? 'enterprise' : 'free',
             JSON.stringify({ defaultTimezone: 'UTC', defaultSchedulingMode: 'assisted', maxDailyPosts: isGod ? 20 : 2, autoOptimizeTitles: true, onboardingCompleted: false })],
          )).rows[0];
          break;
        } catch (e: any) {
          if (attempt === 2 || !String(e.message).includes('slug')) throw e;
          slug = `${slug}-${attempt + 1}`;
        }
      }
      await c.query(
        `INSERT INTO workspace_members(legacy_id,workspace_id,user_id,role,status,joined_at,created_at)
         VALUES($1,$2,$3,'owner','active',now(),now())`,
        [rid('mem'), w.id, u.id],
      );
      await c.query(
        `INSERT INTO audit_logs(workspace_id,user_id,user_email,action,details,created_at)
         VALUES($1,$2,$3,$4,$5,now())`,
        [w.id, u.id, cleanEmail,
         isGod ? 'primary_god_owner_registered' : 'user_registered',
         isGod ? `Primary GOD Owner (${cleanEmail}) registered and assigned supreme platform authority.` : `User ${cleanEmail} registered and default workspace created.`],
      );
      const user = mapUser((await c.query(`SELECT ${USER_COLS} FROM users WHERE id=$1`, [u.id])).rows[0]);
      return { user, verificationToken: rawToken };
    }).then(async (res: any) => {
      if (isGod && !db.getSystemSettings().primaryOwnerUserId) {
        db.updateSystemSettings({ primaryOwnerUserId: res.user.id } as any);
      }
      return res;
    });
  },
  async createMagicUser(input: { email: string; fullName: string }) {
    const email = input.email.toLowerCase().trim();
    return withTransaction(async (c) => {
      const count = Number((await c.query('SELECT count(*)::int AS n FROM users')).rows[0].n);
      const salt = db.generateSalt();
      const userLegacy = rid('usr');
      const u = (await c.query(
        `INSERT INTO users(legacy_id,email,password_hash,password_salt,full_name,role,status,is_email_verified,created_at,updated_at,last_login_at)
         VALUES($1,$2,$3,$4,$5,$6,'active',true,now(),now(),now()) RETURNING id`,
        [userLegacy, email, db.hashPassword(db.generateToken(16), salt), salt, input.fullName, count === 0 ? 'platform_admin' : 'user'],
      )).rows[0];
      const wsLegacy = rid('ws');
      const wsName = `${input.fullName}'s Workspace`;
      const w = (await c.query(
        `INSERT INTO workspaces(legacy_id,name,slug,owner_id,plan,settings,state_version,created_at,updated_at)
         VALUES($1,$2,$3,$4,'free',$5,0,now(),now()) RETURNING id`,
        [wsLegacy, wsName, `${wsName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${userLegacy.slice(-4)}`, u.id,
         JSON.stringify({ defaultTimezone: 'UTC', defaultSchedulingMode: 'assisted', maxDailyPosts: 2, autoOptimizeTitles: true, onboardingCompleted: false })],
      )).rows[0];
      await c.query(
        `INSERT INTO workspace_members(legacy_id,workspace_id,user_id,role,status,joined_at,created_at)
         VALUES($1,$2,$3,'owner','active',now(),now())`,
        [rid('mem'), w.id, u.id],
      );
      return mapUser((await c.query(`SELECT ${USER_COLS} FROM users WHERE id=$1`, [u.id])).rows[0]);
    });
  },
  async createSession(userId: string, meta?: { ip?: string; userAgent?: string }) {
    const token = crypto.randomBytes(32).toString('base64url');
    const legacy = rid('ses');
    const u = (await query(`SELECT id FROM users WHERE ${LEGACY('id::text')} OR id::text=$3`, [userId, userId, userId])).rows[0];
    if (!u) throw new Error('user not found');
    const r = (await query(
      `INSERT INTO sessions(legacy_id,user_id,token_hash,ip,user_agent,expires_at,created_at)
       VALUES($1,$2,$3,$4::inet,$5,now()+interval '30 days',now()) RETURNING created_at,expires_at`,
      [legacy, u.id, sha256(token), validInet(meta?.ip), meta?.userAgent ?? null],
    )).rows[0];
    return {
      id: legacy, userId, token,
      ip: meta?.ip, userAgent: meta?.userAgent,
      createdAt: r.created_at, expiresAt: r.expires_at,
    } as UserSession;
  },
  async findSessionByToken(token: string) {
    const r = (await query(
      `SELECT s.legacy_id,s.id,s.created_at,s.expires_at,host(s.ip) AS ip,s.user_agent,u.legacy_id AS user_legacy
       FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`,
      [sha256(token)],
    )).rows[0];
    return r ? mapSession(r, token) : undefined;
  },
  async deleteSession(token: string) {
    await query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1', [sha256(token)]);
  },
  async deleteUserSessions(userId: string) {
    await query(
      `UPDATE sessions SET revoked_at=now() WHERE revoked_at IS NULL AND user_id=(SELECT id FROM users WHERE ${LEGACY('id::text')} OR id::text=$3)`,
      [userId, userId, userId],
    );
  },
  async listUserSessions(userId: string) {
    const rows = (await query(
      `SELECT s.legacy_id,s.id,s.created_at,s.expires_at,host(s.ip) AS ip,s.user_agent
       FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE u.legacy_id=$1 AND s.revoked_at IS NULL AND s.expires_at>now() ORDER BY s.created_at DESC`,
      [userId],
    )).rows;
    return rows.map((r: any) => ({ id: r.legacy_id || r.id, createdAt: r.created_at, expiresAt: r.expires_at, ip: r.ip || null, userAgent: r.user_agent || null }));
  },
  async deleteSessionById(userId: string, sessionId: string) {
    const r = await query(
      `UPDATE sessions s SET revoked_at=now() FROM users u
       WHERE s.user_id=u.id AND u.legacy_id=$1 AND s.revoked_at IS NULL AND (s.legacy_id=$2 OR s.id::text=$2)`,
      [userId, sessionId],
    );
    return (r.rowCount ?? 0) > 0;
  },
  async revokeOtherSessions(userId: string, keepId?: string) {
    const r = await query(
      `UPDATE sessions s SET revoked_at=now() FROM users u
       WHERE s.user_id=u.id AND u.legacy_id=$1 AND s.revoked_at IS NULL
         AND ($2::text IS NULL OR (s.legacy_id IS DISTINCT FROM $2 AND s.id::text<>$2))`,
      [userId, keepId ?? null],
    );
    return r.rowCount ?? 0;
  },
  async getUserWorkspaces(userId: string) {
    const rows = (await query(
      `SELECT w.*, o.legacy_id AS owner_legacy FROM workspaces w
       JOIN workspace_members m ON m.workspace_id=w.id AND m.status='active'
       JOIN users u ON u.id=m.user_id JOIN users o ON o.id=w.owner_id
       WHERE u.legacy_id=$1 ORDER BY w.created_at`,
      [userId],
    )).rows;
    return rows.map((r: any) => mapWorkspace(r, r.owner_legacy));
  },
  async findWorkspaceById(id: string) {
    const r = (await query(
      `SELECT w.*, o.legacy_id AS owner_legacy FROM workspaces w JOIN users o ON o.id=w.owner_id
       WHERE w.legacy_id=$1 OR w.id::text=$1`, [id, id],
    )).rows[0];
    return r ? mapWorkspace(r, r.owner_legacy) : undefined;
  },
  async createWorkspace(ownerId: string, name: string) {
    return withTransaction(async (c) => {
      const o = (await c.query(`SELECT id FROM users WHERE ${LEGACY('id::text')} OR id::text=$3`, [ownerId, ownerId, ownerId])).rows[0];
      if (!o) throw new Error('owner not found');
      const wsLegacy = rid('ws');
      const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${wsLegacy.slice(-4)}`;
      const w = (await c.query(
        `INSERT INTO workspaces(legacy_id,name,slug,owner_id,plan,settings,state_version,created_at,updated_at)
         VALUES($1,$2,$3,$4,'free',$5,0,now(),now()) RETURNING *`,
        [wsLegacy, name, slug, o.id, JSON.stringify({ defaultTimezone: 'UTC', defaultSchedulingMode: 'assisted', maxDailyPosts: 2, autoOptimizeTitles: true, onboardingCompleted: true })],
      )).rows[0];
      await c.query(
        `INSERT INTO workspace_members(legacy_id,workspace_id,user_id,role,status,joined_at,created_at)
         VALUES($1,$2,$3,'owner','active',now(),now())`,
        [rid('mem'), w.id, o.id],
      );
      return mapWorkspace({ ...w, owner_legacy: ownerId });
    });
  },
  async updateWorkspace(id: string, updates: Partial<Workspace>) {
    const colMap: Record<string, string> = { name: 'name', slug: 'slug', plan: 'plan', billingCycle: 'billing_cycle', settings: 'settings' };
    const sets: string[] = ['updated_at=now()']; const vals: any[] = []; let i = 1;
    for (const [k, col] of Object.entries(colMap)) {
      if (!(k in updates)) continue;
      const v = (updates as any)[k];
      if (v === undefined) { sets.push(`${col}=NULL`); continue; }
      sets.push(`${col}=$${i++}`);
      vals.push(k === 'settings' ? JSON.stringify(v ?? {}) : v);
    }
    const w = (await query(`SELECT id FROM workspaces WHERE legacy_id=$1 OR id::text=$1`, [id, id])).rows[0];
    if (!w) return undefined;
    vals.push(w.id);
    await query(`UPDATE workspaces SET ${sets.join(',')} WHERE id=$${i}`, vals);
    return pg.findWorkspaceById(id);
  },
  async getMemberRole(userId: string, workspaceId?: string) {
    if (!workspaceId) return undefined;
    const r = (await query(
      `SELECT m.role, m.custom_role_id FROM workspace_members m
       JOIN users u ON u.id=m.user_id JOIN workspaces w ON w.id=m.workspace_id
       WHERE u.legacy_id=$1 AND w.legacy_id=$2`,
      [userId, workspaceId],
    )).rows[0];
    if (!r) return undefined;
    if (r.custom_role_id) {
      const state: any = await getRepos().workspaceState.get(workspaceId);
      const custom = (state.customRoles || []).find((x: any) => x.id === r.custom_role_id);
      if (custom?.baseRole) return custom.baseRole;
    }
    return r.role;
  },
  async getWorkspaceMembers(workspaceId: string) {
    const rows = (await query(
      `SELECT m.legacy_id, m.role, m.status, m.joined_at, m.custom_role_id,
              u.legacy_id AS user_legacy, u.full_name, u.email, u.avatar_url
       FROM workspace_members m
       JOIN workspaces w ON w.id=m.workspace_id
       JOIN users u ON u.id=m.user_id
       WHERE w.legacy_id=$1`,
      [workspaceId],
    )).rows;
    return rows.map((r: any) => ({
      id: r.legacy_id, workspaceId, userId: r.user_legacy, role: r.role,
      status: r.status, customRoleId: r.custom_role_id || undefined,
      joinedAt: r.joined_at,
      user: { fullName: r.full_name, email: r.email, avatarUrl: r.avatar_url || undefined },
    }));
  },
  async findAuthToken(type: string, secret: string) {
    const hash = sha256(secret);
    const r = (await query(
      `SELECT t.*, u.legacy_id AS user_legacy FROM auth_tokens t LEFT JOIN users u ON u.id=t.user_id
       WHERE t.type=$1 AND t.token_hash=$2 AND t.used_at IS NULL
       ORDER BY t.created_at ASC LIMIT 1`,
      [type, hash],
    )).rows[0];
    return r ? mapToken(r) : undefined;
  },
  async latestAuthTokenByEmail(type: string, email: string) {
    const r = (await query(
      `SELECT t.*, u.legacy_id AS user_legacy FROM auth_tokens t LEFT JOIN users u ON u.id=t.user_id
       WHERE t.type=$1 AND lower(t.email)=lower($2) AND t.used_at IS NULL
       ORDER BY t.created_at DESC LIMIT 1`,
      [type, email.toLowerCase().trim()],
    )).rows[0];
    return r ? mapToken(r) : undefined;
  },
  async createAuthToken(t: { type: string; tokenHash: string; userId?: string; email?: string; expiresAt: string; attempts?: number }) {
    const u = t.userId
      ? (await query(`SELECT id FROM users WHERE ${LEGACY('id::text')} OR id::text=$3`, [t.userId, t.userId, t.userId])).rows[0]
      : null;
    // magic_link keys on email (JSON stores the email in userId); other types on user uuid
    const isMagic = t.type === 'magic_link';
    const r = (await query(
      `INSERT INTO auth_tokens(type,token_hash,user_id,email,payload,expires_at,attempts,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,now()) RETURNING id,created_at`,
      [t.type, t.tokenHash, isMagic ? null : (u?.id ?? null), isMagic ? (t.email ?? t.userId ?? null) : (t.email ?? null),
       JSON.stringify(isMagic ? { userKey: t.userId ?? t.email } : {}), t.expiresAt, t.attempts ?? 0],
    )).rows[0];
    return {
      id: r.id,
      userId: isMagic ? (t.email ?? t.userId ?? '') : (t.userId || ''),
      token: t.tokenHash,
      type: t.type,
      createdAt: r.created_at,
      expiresAt: t.expiresAt,
      attempts: t.attempts || 0,
    } as VerificationToken;
  },
  async markAuthTokenUsed(id: string) {
    await query('UPDATE auth_tokens SET used_at=now() WHERE id=$1', [id]);
  },
  async bumpAuthTokenAttempts(id: string) {
    const r = await query('UPDATE auth_tokens SET attempts=attempts+1 WHERE id=$1 RETURNING attempts', [id]);
    return r.rows[0]?.attempts ?? 0;
  },
  async invalidateUnusedByEmail(type: string, email: string) {
    await query(
      `UPDATE auth_tokens SET used_at=now() WHERE type=$1 AND lower(email)=lower($2) AND used_at IS NULL`,
      [type, email.toLowerCase().trim()],
    );
  },
  async logAudit(entry: any) {
    const ws = entry.workspaceId
      ? (await query(`SELECT id FROM workspaces WHERE ${LEGACY('id::text')} OR id::text=$3`, [entry.workspaceId, entry.workspaceId, entry.workspaceId])).rows[0]
      : null;
    const usr = entry.userId
      ? (await query(`SELECT id FROM users WHERE ${LEGACY('id::text')} OR id::text=$3`, [entry.userId, entry.userId, entry.userId])).rows[0]
      : null;
    const SEC = /(login|logout|auth|session|mfa|password|passkey|sso|magic|otp|verification|role|permission|god_|owner|admin_|scheduler|backup|recovery|maintenance|plan|subscription|billing|invite|member_|ownership|account_self|security|brute|restricted|oauth|token)/i;
    if (SEC.test(entry.action)) {
      await query(
        `INSERT INTO security_events(workspace_id,user_id,user_email,action,details,severity,ip,user_agent,created_at)
         VALUES($1,$2,$3,$4,$5,'info',$6::inet,$7,now())`,
        [ws?.id ?? null, usr?.id ?? null, entry.userEmail ?? null, entry.action,
         typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details ?? {}),
         validInet(entry.ip), entry.userAgent ?? null],
      );
    }
    await query(
      `INSERT INTO audit_logs(workspace_id,user_id,user_email,action,details,severity,created_at)
       VALUES($1,$2,$3,$4,$5,'info',now())`,
      [ws?.id ?? null, usr?.id ?? null, entry.userEmail ?? null, entry.action,
       typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details ?? {})],
    );
  },
  async getAuditLogs(filter?: { workspaceId?: string; userId?: string; limit?: number }) {
    const cond: string[] = []; const vals: any[] = []; let i = 1;
    if (filter?.workspaceId) {
      const w = (await query(`SELECT id FROM workspaces WHERE ${LEGACY('id::text')} OR id::text=$3`, [filter.workspaceId, filter.workspaceId, filter.workspaceId])).rows[0];
      if (!w) return [];
      cond.push(`workspace_id=$${i++}`); vals.push(w.id);
    }
    if (filter?.userId) {
      const u = (await query(`SELECT id FROM users WHERE ${LEGACY('id::text')} OR id::text=$3`, [filter.userId, filter.userId, filter.userId])).rows[0];
      if (!u) return [];
      cond.push(`user_id=$${i++}`); vals.push(u.id);
    }
    const lim = filter?.limit ?? 100;
    const rows = (await query(
      `SELECT a.id,a.action,a.details,a.user_email,a.created_at,u.legacy_id AS user_legacy,w.legacy_id AS ws_legacy
       FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN workspaces w ON w.id=a.workspace_id
       ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY a.created_at DESC LIMIT ${Number(lim) || 100}`,
      vals,
    )).rows;
    return rows.map((r: any) => ({
      id: r.id, action: r.action, details: r.details, timestamp: r.created_at,
      userId: r.user_legacy, userEmail: r.user_email, workspaceId: r.ws_legacy, ip: null,
    }));
  },
  async listUsers() {
    const rows = (await query(`SELECT ${USER_COLS} FROM users ORDER BY created_at`)).rows;
    return rows.map(mapUser);
  },
  async listWorkspaces() {
    const rows = (await query(
      `SELECT w.*, o.legacy_id AS owner_legacy FROM workspaces w JOIN users o ON o.id=w.owner_id ORDER BY w.created_at`,
    )).rows;
    return rows.map((r: any) => mapWorkspace(r, r.owner_legacy));
  },
  async listSessions() {
    const rows = (await query(
      `SELECT s.legacy_id,s.id,s.token_hash,host(s.ip) AS ip,s.user_agent,s.created_at,s.expires_at,u.legacy_id AS user_legacy
       FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.revoked_at IS NULL ORDER BY s.created_at DESC`,
    )).rows;
    return rows.map((r: any) => ({
      id: r.legacy_id || r.id, userId: r.user_legacy, token: r.token_hash,
      ip: r.ip || null, userAgent: r.user_agent || null,
      createdAt: r.created_at, expiresAt: r.expires_at, user: null,
    }));
  },
  async adminDeleteSession(sessionId: string) {
    const r = await query(
      `UPDATE sessions SET revoked_at=now() WHERE revoked_at IS NULL AND (legacy_id=$1 OR id::text=$1)`,
      [sessionId],
    );
    return r.rowCount ?? 0;
  },
  // ---- workspace invitations ----
  async listInvitations(workspaceId: string) {
    const rows = (await query(
      `SELECT i.id::text AS id, i.email::text AS email, i.role, i.expires_at, i.accepted_at, i.revoked_at, i.created_at
       FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id
       WHERE w.legacy_id=$1 ORDER BY i.created_at DESC`,
      [workspaceId],
    )).rows;
    return rows.map((r: any) => mapInvitation(r));
  },
  async findInvitationByTokenHash(tokenHash: string) {
    const r = (await query(
      `SELECT i.id::text AS id, i.email::text AS email, i.role, i.token_hash, i.expires_at, i.accepted_at, i.revoked_at, i.created_at,
              w.legacy_id AS ws_legacy, u.legacy_id AS inviter_legacy
       FROM workspace_invitations i
       JOIN workspaces w ON w.id=i.workspace_id
       JOIN users u ON u.id=i.invited_by
       WHERE i.token_hash=$1`,
      [tokenHash],
    )).rows[0];
    return r ? mapInvitation(r, true) : undefined;
  },
  async findInvitationById(id: string, workspaceId: string) {
    const r = (await query(
      `SELECT i.id::text AS id, i.email::text AS email, i.role, i.token_hash, i.expires_at, i.accepted_at, i.revoked_at, i.created_at,
              w.legacy_id AS ws_legacy, u.legacy_id AS inviter_legacy
       FROM workspace_invitations i
       JOIN workspaces w ON w.id=i.workspace_id
       JOIN users u ON u.id=i.invited_by
       WHERE i.id::text=$1 AND w.legacy_id=$2`,
      [id, workspaceId],
    )).rows[0];
    return r ? mapInvitation(r, true) : undefined;
  },
  async createInvitation(inv: any) {
    const ws = (await query(`SELECT id FROM workspaces WHERE ${LEGACY('id::text')} OR id::text=$3`, [inv.workspaceId, inv.workspaceId, inv.workspaceId])).rows[0];
    const inviter = (await query(`SELECT id FROM users WHERE ${LEGACY('id::text')} OR id::text=$3`, [inv.invitedBy, inv.invitedBy, inv.invitedBy])).rows[0];
    if (!ws || !inviter) throw new Error('workspace or inviter not found');
    const r = (await query(
      `INSERT INTO workspace_invitations(workspace_id,email,role,token_hash,invited_by,expires_at,created_at)
       VALUES($1,$2,$3,$4,$5,$6,now()) RETURNING id::text AS id`,
      [ws.id, inv.email, inv.role || 'editor', inv.tokenHash, inviter.id, inv.expiresAt],
    )).rows[0];
    return { ...inv, id: r.id, status: 'pending', createdAt: new Date().toISOString() };
  },
  async updateInvitation(id: string, updates: any) {
    const sets: string[] = []; const vals: any[] = []; let i = 1;
    if (updates.status === 'accepted') { sets.push(`accepted_at=now()`); }
    else if (updates.status === 'revoked') { sets.push(`revoked_at=now()`); }
    if (updates.acceptedAt) { sets.push(`accepted_at=$${i++}`); vals.push(updates.acceptedAt); }
    if (!sets.length) return this.findInvitationById(id, updates.workspaceId);
    await query(`UPDATE workspace_invitations SET ${sets.join(',')} WHERE id::text=$${i}`, [...vals, id]);
    return this.findInvitationById(id, updates.workspaceId || '');
  },
  // ---- workspace member mutations ----
  async listWorkspaceMemberRecords(workspaceId: string) {
    const rows = (await query(
      `SELECT m.legacy_id AS id, m.role, m.status, m.joined_at, m.custom_role_id,
              u.legacy_id AS user_legacy, inv.legacy_id AS inviter_legacy
       FROM workspace_members m
       JOIN workspaces w ON w.id=m.workspace_id
       JOIN users u ON u.id=m.user_id
       LEFT JOIN users inv ON inv.id=m.invited_by
       WHERE w.legacy_id=$1`,
      [workspaceId],
    )).rows;
    return rows.map((r: any) => ({
      id: r.id, workspaceId, userId: r.user_legacy, role: r.role,
      status: r.status, customRoleId: r.custom_role_id || undefined,
      joinedAt: r.joined_at, invitedBy: r.inviter_legacy || undefined,
    }));
  },
  async listUserMemberships(userId: string) {
    const rows = (await query(
      `SELECT m.legacy_id AS id, m.role, m.status, m.joined_at, m.custom_role_id,
              w.legacy_id AS ws_legacy, u.legacy_id AS user_legacy
       FROM workspace_members m
       JOIN workspaces w ON w.id=m.workspace_id
       JOIN users u ON u.id=m.user_id
       WHERE u.legacy_id=$1 OR u.id::text=$1`,
      [userId, userId],
    )).rows;
    return rows.map((r: any) => ({
      id: r.id, workspaceId: r.ws_legacy, userId: r.user_legacy, role: r.role,
      status: r.status, customRoleId: r.custom_role_id || undefined, joinedAt: r.joined_at,
    }));
  },
  async addWorkspaceMember(m: any) {
    return withTransaction(async (c) => {
      const ws = (await c.query(`SELECT id FROM workspaces WHERE ${LEGACY('id::text')} OR id::text=$3`, [m.workspaceId, m.workspaceId, m.workspaceId])).rows[0];
      const usr = (await c.query(`SELECT id FROM users WHERE ${LEGACY('id::text')} OR id::text=$3`, [m.userId, m.userId, m.userId])).rows[0];
      if (!ws || !usr) throw new Error('workspace or user not found');
      const inviter = m.invitedBy
        ? (await c.query(`SELECT id FROM users WHERE ${LEGACY('id::text')} OR id::text=$3`, [m.invitedBy, m.invitedBy, m.invitedBy])).rows[0]?.id ?? null
        : null;
      await c.query(
        `INSERT INTO workspace_members(legacy_id,workspace_id,user_id,role,status,invited_by,joined_at,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT (workspace_id,user_id) DO NOTHING`,
        [m.id || rid('mem'), ws.id, usr.id, m.role || 'editor', m.status || 'active', inviter, m.joinedAt || null],
      );
      return m;
    });
  },
  async updateWorkspaceMember(memberId: string, workspaceId: string, updates: any) {
    const sets: string[] = []; const vals: any[] = []; let i = 1;
    if (updates.role !== undefined) { sets.push(`role=$${i++}`); vals.push(updates.role); }
    if (updates.status !== undefined) { sets.push(`status=$${i++}`); vals.push(updates.status); }
    if (!sets.length) return undefined;
    const r = await query(
      `UPDATE workspace_members m SET ${sets.join(',')}
       FROM workspaces w WHERE m.workspace_id=w.id AND w.legacy_id=$${i} AND m.legacy_id=$${i + 1}`,
      [...vals, workspaceId, memberId],
    );
    return (r.rowCount ?? 0) > 0 ? { id: memberId, ...updates } : undefined;
  },
  async removeWorkspaceMember(memberId: string, workspaceId: string) {
    const r = await query(
      `DELETE FROM workspace_members m USING workspaces w
       WHERE m.workspace_id=w.id AND w.legacy_id=$1 AND m.legacy_id=$2`,
      [workspaceId, memberId],
    );
    return r.rowCount ?? 0;
  },
  async transferOwnership(workspaceId: string, actorUserId: string, targetMemberId: string) {
    return withTransaction(async (c) => {
      const ws = (await c.query(`SELECT id FROM workspaces WHERE ${LEGACY('id::text')} OR id::text=$3`, [workspaceId, workspaceId, workspaceId])).rows[0];
      if (!ws) return { ok: false as const, error: 'Workspace not found' };
      const actor = (await c.query(`SELECT id FROM users WHERE ${LEGACY('id::text')} OR id::text=$3`, [actorUserId, actorUserId, actorUserId])).rows[0];
      const target = (await c.query(
        `SELECT m.id, m.user_id, u.legacy_id AS user_legacy, m.status FROM workspace_members m
         JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.legacy_id=$2`,
        [ws.id, targetMemberId],
      )).rows[0];
      if (!target) return { ok: false as const, error: 'Member not found' };
      if (target.user_legacy === actorUserId) return { ok: false as const, error: 'Already the owner' };
      if (target.status && target.status !== 'active') return { ok: false as const, error: 'Target member is not active' };
      if (actor) {
        await c.query(
          `UPDATE workspace_members SET role='manager' WHERE workspace_id=$1 AND user_id=$2 AND role='owner'`,
          [ws.id, actor.id],
        );
      }
      await c.query(`UPDATE workspace_members SET role='owner' WHERE id=$1`, [target.id]);
      return { ok: true as const, target: { id: targetMemberId, userId: target.user_legacy, role: 'owner' } };
    });
  },
};

// ---------------------------------------------------------------- facade

export const authStore = isPg() ? pg : (json as any);
export const authDriver = isPg() ? 'pg' : 'json';
