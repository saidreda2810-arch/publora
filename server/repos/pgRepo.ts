import crypto from 'node:crypto';
/**
 * PgRepo — Postgres implementation of SaasRepos (WP4).
 * UNTESTED — no live Postgres in this environment. Written against
 * db/migrations/0001+0002 schema; expect fixes on first real run.
 */
import type { SaasRepos } from './repo.ts';
import { query, withTransaction } from '../db/client.ts';

const rowToUser = (r: any) => r && ({
  id: r.legacy_id || r.id, email: r.email, fullName: r.full_name,
  avatarUrl: r.avatar_url, role: r.role, isEmailVerified: r.email_verified,
  status: r.status, createdAt: r.created_at, lastLoginAt: r.last_login_at,
  username: r.username, phone: r.phone, bio: r.bio, preferences: r.preferences,
  pendingEmail: r.pending_email,
});

export function createPgRepos(): SaasRepos {
  return {
    driver: 'pg',
    users: {
      findByEmail: async (email) => rowToUser((await query('SELECT * FROM users WHERE lower(email)=lower($1)', [email])).rows[0]),
      findById: async (id) => rowToUser((await query('SELECT * FROM users WHERE legacy_id=$1 OR id::text=$1', [id])).rows[0]),
      create: async (data: any) => { throw new Error('PgRepo.users.create not yet implemented'); },
      update: async (id, updates) => { throw new Error('PgRepo.users.update not yet implemented'); },
      delete: async (id) => { throw new Error('PgRepo.users.delete not yet implemented'); },
    },
    sessions: {
      create: async (userId, meta) => {
        const token = crypto.randomBytes(32).toString('base64url');
        const hash = crypto.createHash('sha256').update(token).digest('hex');
        await query(`INSERT INTO sessions(user_id, token_hash, ip, user_agent, expires_at)
          SELECT id, $2, $3, $4, now() + interval '30 days' FROM users WHERE legacy_id=$1 OR id::text=$1`,
          [userId, hash, meta?.ip ?? null, meta?.userAgent ?? null]);
        return { token, userId } as any; // caller must use raw token for cookie only
      },
      findByToken: async (token) => {
        const hash = crypto.createHash('sha256').update(token).digest('hex');
        const r = await query(`SELECT s.*, u.legacy_id AS uid FROM sessions s JOIN users u ON u.id=s.user_id
          WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now()`, [hash]);
        return r.rows[0] ? { ...r.rows[0], userId: r.rows[0].uid } as any : undefined;
      },
      delete: async (token) => {
        const hash = crypto.createHash('sha256').update(token).digest('hex');
        await query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1', [hash]);
      },
      deleteForUser: async (userId) => {
        await query(`UPDATE sessions SET revoked_at=now() WHERE user_id=(SELECT id FROM users WHERE legacy_id=$1 OR id::text=$1) AND revoked_at IS NULL`, [userId]);
      },
    },
    workspaces: {
      findById: async (id) => (await query('SELECT * FROM workspaces WHERE legacy_id=$1 OR id::text=$1', [id])).rows[0] as any,
      create: async (ownerId, name) => { throw new Error('PgRepo.workspaces.create not yet implemented'); },
      update: async (id, updates) => { throw new Error('PgRepo.workspaces.update not yet implemented'); },
      forUser: async (userId) => (await query(`SELECT w.* FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id JOIN users u ON u.id=m.user_id WHERE u.legacy_id=$1 OR u.id::text=$1`, [userId])).rows as any,
      memberRole: async (userId, workspaceId) => (await query(`SELECT m.role FROM workspace_members m JOIN users u ON u.id=m.user_id JOIN workspaces w ON w.id=m.workspace_id WHERE (u.legacy_id=$1 OR u.id::text=$1) AND (w.legacy_id=$2 OR w.id::text=$2)`, [userId, workspaceId])).rows[0]?.role,
      members: async (workspaceId) => (await query(`SELECT m.*, u.full_name, u.email FROM workspace_members m JOIN users u ON u.id=m.user_id JOIN workspaces w ON w.id=m.workspace_id WHERE w.legacy_id=$1 OR w.id::text=$1`, [workspaceId])).rows as any,
    },
    workspaceState: {
      get: async () => { throw new Error('PgRepo.workspaceState.get not yet implemented'); },
      getVersion: async (workspaceId) => Number((await query('SELECT state_version FROM workspaces WHERE legacy_id=$1 OR id::text=$1', [workspaceId])).rows[0]?.state_version ?? 0),
      save: async (workspaceId, _data, baseVersion) => {
        // CAS on state_version — blob assembly lives in WP6 facade.
        const r = await query('UPDATE workspaces SET state_version=state_version+1 WHERE (legacy_id=$1 OR id::text=$1) AND state_version=$2', [workspaceId, baseVersion]);
        return (r.rowCount ?? 0) > 0;
      },
    },
    audit: {
      log: async (entry) => { await query('INSERT INTO audit_logs(workspace_id, actor_id, action, metadata) VALUES($1,$2,$3,$4)', [entry.workspaceId ?? null, entry.userId ?? null, entry.action, JSON.stringify(entry)]); },
      list: async (filter) => (await query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1', [filter?.limit ?? 100])).rows as any,
    },
    authTokens: {
      create: async () => { throw new Error('PgRepo.authTokens.create not yet implemented'); },
      findValid: async () => { throw new Error('PgRepo.authTokens.findValid not yet implemented'); },
      consume: async () => { throw new Error('PgRepo.authTokens.consume not yet implemented'); },
      purgeExpired: async () => { const r = await query('DELETE FROM auth_tokens WHERE expires_at < now() - interval \'7 days\''); return r.rowCount ?? 0; },
    },
  };
}
