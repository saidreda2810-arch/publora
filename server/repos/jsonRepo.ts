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
    ...blobEntities(),
  };
}

/** Generic blob-backed entity repo over WorkspaceDataPayload arrays (JSON driver). */
function blobEntities() {
  const entity = (key: keyof import('../saasDb.ts').WorkspaceDataPayload): any => ({
    list: async (workspaceId: string) => (db.getWorkspaceData(workspaceId) as any)[key] || [],
    findById: async (workspaceId: string, id: string) =>
      ((db.getWorkspaceData(workspaceId) as any)[key] || []).find((x: any) => x.id === id || x.legacyId === id),
    create: async (workspaceId: string, data: any) => {
      const payload = db.getWorkspaceData(workspaceId) as any;
      const arr = payload[key] = payload[key] || [];
      const rec = { id: `ent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString(), ...data };
      arr.push(rec); db.saveWorkspaceData(workspaceId, payload); return rec;
    },
    update: async (workspaceId: string, id: string, updates: any) => {
      const payload = db.getWorkspaceData(workspaceId) as any;
      const arr = payload[key] || [];
      const rec = arr.find((x: any) => x.id === id || x.legacyId === id);
      if (!rec) return undefined;
      Object.assign(rec, updates, { updatedAt: new Date().toISOString() });
      db.saveWorkspaceData(workspaceId, payload); return rec;
    },
    remove: async (workspaceId: string, id: string) => {
      const payload = db.getWorkspaceData(workspaceId) as any;
      const arr = payload[key] || [];
      const i = arr.findIndex((x: any) => x.id === id || x.legacyId === id);
      if (i < 0) return false;
      arr.splice(i, 1); db.saveWorkspaceData(workspaceId, payload); return true;
    },
  });

  const media = {
    list: async (workspaceId: string) => (await import('../mediaAssets.ts')).listAssets(workspaceId),
    findById: async (_ws: string, id: string) => (await import('../mediaAssets.ts')).getAsset(id) ?? undefined,
    create: async (workspaceId: string, data: any) => (await import('../mediaAssets.ts')).createAsset({ workspaceId, ...data } as any),
    update: async () => undefined,
    remove: async (_ws: string, id: string) => !!(await import('../mediaAssets.ts')).softDeleteAsset(id),
  };

  return {
    brands: entity('brands'),
    projects: entity('projects'),
    videos: entity('videos'),
    socialAccounts: entity('accounts'),
    posts: {
      ...entity('posts'),
      targets: {
        listForPost: async (workspaceId: string, postId: string) => {
          const post = await entity('posts').findById(workspaceId, postId);
          const plats = post?.platforms || post?.targets || [];
          return (Array.isArray(plats) ? plats : Object.keys(plats)).map((p: any) => ({ postId, platform: typeof p === 'string' ? p : p.platform, status: 'pending' }));
        },
        claimDue: async () => [],
        markResult: async () => {},
      },
    },
    mediaAssets: media,
    notifications: {
      listForUser: async () => [],
      markRead: async () => {},
    },
  };
}
