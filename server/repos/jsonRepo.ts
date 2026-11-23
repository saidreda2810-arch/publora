/** JsonRepo — wraps existing saasDb functions unchanged (DB_DRIVER=json). */
import * as db from '../saasDb.ts';
import type { SaasRepos } from './repo.ts';

export function createJsonRepos(): SaasRepos {
  return {
    driver: 'json',
    users: {
      findByEmail: async (email) => db.findUserByEmail(email),
      findById: async (id) => db.findUserById(id),
      create: async (data: any) => db.createUser(data),
      update: async (id, updates) => db.updateUser(id, updates),
      delete: async (id) => db.deleteUser(id),
    },
    sessions: {
      create: async (userId, meta) => db.createSession(userId, meta),
      findByToken: async (token) => db.findSessionByToken(token),
      delete: async (token) => db.deleteSession(token),
      deleteForUser: async (userId) => db.deleteUserSessions(userId),
    },
    workspaces: {
      findById: async (id) => db.findWorkspaceById(id),
      create: async (ownerId, name) => db.createWorkspace(ownerId, name),
      update: async (id, updates) => db.updateWorkspace(id, updates),
      forUser: async (userId) => db.getUserWorkspaces(userId),
      memberRole: async (userId, workspaceId) => db.getMemberRole(userId, workspaceId),
      members: async (workspaceId) => db.getWorkspaceMembers(workspaceId) as any,
    },
    workspaceState: {
      get: async (workspaceId) => db.getWorkspaceData(workspaceId),
      getVersion: async (workspaceId) => db.getWorkspaceStateVersion(workspaceId),
      save: async (workspaceId, data, baseVersion) => {
        const current = db.getWorkspaceStateVersion(workspaceId);
        if (baseVersion !== current) return false;
        db.saveWorkspaceData(workspaceId, data);
        return true;
      },
    },
    audit: {
      log: async (entry) => db.logAuditEvent(entry),
      list: async (filter) => db.getAuditLogs(filter) as any,
    },
    authTokens: {
      // JsonRepo keeps legacy saasDb token functions; PgRepo uses auth_tokens table.
      create: async (t: any) => { const d = db.getDb(); d.verificationTokens = d.verificationTokens || []; const rec = { id: `vt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, ...t } as any; d.verificationTokens.push(rec); db.saveDatabase(d); return rec; },
      findValid: async (type, tokenHash) => {
        const d = db.getDb();
        return (d.verificationTokens || []).find((t: any) => t.type === type && (t.token === tokenHash || t.tokenHash === tokenHash) && !t.consumedAt && new Date(t.expiresAt).getTime() > Date.now()) as any;
      },
      consume: async (id) => { const d = db.getDb(); const t = (d.verificationTokens || []).find((x: any) => x.id === id); if (t) { (t as any).consumedAt = new Date().toISOString(); db.saveDatabase(d); } },
      purgeExpired: async () => { const d = db.getDb(); const before = (d.verificationTokens || []).length; d.verificationTokens = (d.verificationTokens || []).filter((t: any) => new Date(t.expiresAt).getTime() > Date.now()); db.saveDatabase(d); return before - d.verificationTokens.length; },
    },
  };
}
