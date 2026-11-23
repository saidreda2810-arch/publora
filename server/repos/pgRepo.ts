import crypto from 'node:crypto';
/**
 * PgRepo — Postgres implementation of SaasRepos (WP4).
 * Verified against publora_scratch schema 2026-11-23; full parity suite pending.
 */
import type { SaasRepos } from './repo.ts';
import { query, withTransaction } from '../db/client.ts';

const rid = (prefix: string) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const byLegacy = (col: string, id: string) => `(${id}=$1 OR ${col}=$2)`;

const uRow = (r: any) => r && ({
  id: r.legacy_id || r.id, email: r.email, fullName: r.full_name,
  avatarUrl: r.avatar_url, role: r.role, isEmailVerified: r.is_email_verified,
  status: r.status, createdAt: r.created_at, lastLoginAt: r.last_login_at,
  username: r.username, phone: r.phone, bio: r.bio, preferences: r.preferences,
  pendingEmail: r.pending_email,
});

export function createPgRepos(): SaasRepos {
  return {
    driver: 'pg',
    users: {
      findByEmail: async (email) => uRow((await query('SELECT * FROM users WHERE lower(email)=lower($1)', [email])).rows[0]),
      findById: async (id) => uRow((await query(`SELECT * FROM users WHERE ${byLegacy('id::text', 'legacy_id')}`, [id, id])).rows[0]),
      create: async (d: any) => {
        const id = rid('usr');
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(d.password, salt, 64).toString('hex');
        await query(`INSERT INTO users(id,legacy_id,email,password_hash,password_salt,full_name,role,status,is_email_verified,created_at,updated_at)
          VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,now(),now())`,
          [id, d.email, hash, salt, d.fullName, d.role || 'user', d.status || 'active', d.isEmailVerified ?? false]);
        return { id, ...d };
      },
      update: async (id, u) => {
        const sets: string[] = []; const vals: any[] = [id, id]; let i = 3;
        const map: Record<string, string> = { fullName: 'full_name', avatarUrl: 'avatar_url', username: 'username', phone: 'phone', bio: 'bio', role: 'role', status: 'status', isEmailVerified: 'is_email_verified', lastLoginAt: 'last_login_at', pendingEmail: 'pending_email' };
        for (const [k, col] of Object.entries(map)) if ((u as any)[k] !== undefined) { sets.push(`${col}=$${i++}`); vals.push((u as any)[k]); }
        if (sets.length) { sets.push(`updated_at=now()`); await query(`UPDATE users SET ${sets.join(',')} WHERE ${byLegacy('id::text', 'legacy_id')}`, vals); }
        return uRow((await query(`SELECT * FROM users WHERE ${byLegacy('id::text', 'legacy_id')}`, [id, id])).rows[0]);
      },
      delete: async (id) => { const r = await query(`DELETE FROM users WHERE ${byLegacy('id::text', 'legacy_id')}`, [id, id]); return { success: (r.rowCount ?? 0) > 0 }; },
    },
    sessions: {
      create: async (userId, meta) => {
        const token = crypto.randomBytes(32).toString('base64url');
        const hash = hashToken(token);
        await query(`INSERT INTO sessions(user_id,token_hash,ip,user_agent,expires_at,created_at)
          SELECT id,$2,$3,$4,now()+interval '30 days',now() FROM users WHERE ${byLegacy('id::text','legacy_id')}`, [userId, hash, meta?.ip ?? null, meta?.userAgent ?? null]);
        return { token, userId } as any;
      },
      findByToken: async (token) => {
        const r = await query(`SELECT s.*,u.legacy_id AS uid FROM sessions s JOIN users u ON u.id=s.user_id
          WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`, [hashToken(token)]);
        return r.rows[0] ? { ...r.rows[0], userId: r.rows[0].uid } as any : undefined;
      },
      delete: async (token) => { await query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1', [hashToken(token)]); },
      deleteForUser: async (userId) => { await query(`UPDATE sessions SET revoked_at=now() WHERE user_id=(SELECT id FROM users WHERE ${byLegacy('id::text','legacy_id')}) AND revoked_at IS NULL`, [userId, userId]); },
    },
    workspaces: {
      findById: async (id) => (await query(`SELECT * FROM workspaces WHERE ${byLegacy('id::text','legacy_id')}`, [id, id])).rows[0] as any,
      create: async (ownerId, name) => {
        const id = rid('ws');
        const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${id.slice(-6)}`;
        const owner = (await query(`SELECT id FROM users WHERE ${byLegacy('id::text','legacy_id')}`, [ownerId, ownerId])).rows[0];
        const r = await query(`INSERT INTO workspaces(id,legacy_id,name,slug,owner_id,plan,billing_cycle,settings,state_version,created_at,updated_at)
          VALUES(gen_random_uuid(),$1,$2,$3,$4,'free','monthly','{}',0,now(),now()) RETURNING *`, [id, name, slug, owner?.id ?? null]);
        return r.rows[0] as any;
      },
      update: async (id, u) => {
        const sets: string[] = []; const vals: any[] = [id, id]; let i = 3;
        for (const [k, col] of Object.entries({ name: 'name', plan: 'plan', billingCycle: 'billing_cycle', slug: 'slug', settings: 'settings' })) if ((u as any)[k] !== undefined) { sets.push(`${col}=$${i++}`); vals.push(typeof (u as any)[k] === 'object' ? JSON.stringify((u as any)[k]) : (u as any)[k]); }
        if (sets.length) await query(`UPDATE workspaces SET ${sets.join(',')},updated_at=now() WHERE ${byLegacy('id::text','legacy_id')}`, vals);
        return (await query(`SELECT * FROM workspaces WHERE ${byLegacy('id::text','legacy_id')}`, [id, id])).rows[0] as any;
      },
      forUser: async (userId) => (await query(`SELECT w.* FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id JOIN users u ON u.id=m.user_id WHERE ${byLegacy('u.id::text','u.legacy_id')}`, [userId, userId])).rows as any,
      memberRole: async (userId, workspaceId) => (await query(`SELECT m.role FROM workspace_members m JOIN users u ON u.id=m.user_id JOIN workspaces w ON w.id=m.workspace_id WHERE ${byLegacy('u.id::text','u.legacy_id')} AND ${byLegacy('w.id::text','w.legacy_id')}`, [userId, userId, workspaceId, workspaceId])).rows[0]?.role,
      members: async (workspaceId) => (await query(`SELECT m.*,u.full_name,u.email FROM workspace_members m JOIN users u ON u.id=m.user_id JOIN workspaces w ON w.id=m.workspace_id WHERE ${byLegacy('w.id::text','w.legacy_id')}`, [workspaceId, workspaceId])).rows as any,
    },
    workspaceState: {
      get: async (workspaceId) => {
        const ws = (await query(`SELECT id FROM workspaces WHERE ${byLegacy('id::text','legacy_id')}`, [workspaceId, workspaceId])).rows[0];
        if (!ws) return {} as any;
        const out: any = {};
        // 1) leftover keys live in workspace_kv
        for (const r of (await query('SELECT key,value FROM workspace_kv WHERE workspace_id=$1', [ws.id])).rows) out[r.key] = r.value;
        // 2) normalized collections reconstructed from their tables.
        //    settings/metadata JSONB holds the original record (migration contract).
        const coll = async (sql: string, key: string, mapFn?: (r: any) => any) => {
          const rows = (await query(sql, [ws.id])).rows;
          out[key] = rows.map(mapFn || ((r: any) => r.settings ?? r.metadata ?? r));
        };
        await coll('SELECT settings FROM brands WHERE workspace_id=$1', 'brands');
        await coll('SELECT legacy_id,name,description,status,settings,brand_id,created_at,updated_at FROM projects WHERE workspace_id=$1', 'projects',
          (r: any) => ({ ...(r.settings || {}), id: r.legacy_id, name: r.name, description: r.description, status: r.status, brandId: r.brand_id || undefined, createdAt: r.created_at, updatedAt: r.updated_at }));
        await coll('SELECT metadata FROM social_accounts WHERE workspace_id=$1', 'accounts');
        await coll('SELECT metadata FROM videos WHERE workspace_id=$1', 'videos');
        await coll('SELECT settings FROM posts WHERE workspace_id=$1', 'posts');
        await coll(`SELECT id,video_id,metric,value,period_start,period_end,source,synced_at FROM analytics_snapshots WHERE workspace_id=$1`, 'analytics',
          (r: any) => ({ id: r.id, videoId: r.video_id, metric: r.metric, value: r.value, periodStart: r.period_start, periodEnd: r.period_end, source: r.source, syncedAt: r.synced_at }));
        await coll('SELECT legacy_id,name,description,trigger,steps,status,version,created_by,created_at,updated_at,last_trigger_hash FROM automation_workflows WHERE workspace_id=$1', 'automationWorkflows',
          (r: any) => ({ id: r.legacy_id, name: r.name, description: r.description, trigger: r.trigger, steps: r.steps, status: r.status, version: r.version, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at, lastTriggerHash: r.last_trigger_hash }));
        return out;
      },
      getVersion: async (workspaceId) => Number((await query(`SELECT state_version FROM workspaces WHERE ${byLegacy('id::text','legacy_id')}`, [workspaceId, workspaceId])).rows[0]?.state_version ?? 0),
      save: async (workspaceId, data, baseVersion) => withTransaction(async (c) => {
        const ws = (await c.query(`SELECT id FROM workspaces WHERE ${byLegacy('id::text','legacy_id')} FOR UPDATE`, [workspaceId, workspaceId])).rows[0];
        if (!ws) return false;
        const cur = (await c.query('SELECT state_version FROM workspaces WHERE id=$1', [ws.id])).rows[0].state_version;
        if (Number(cur) !== baseVersion) return false;

        const resolveFk = async (table: string, legacy: any) => {
          if (!legacy) return null;
          const r = await c.query(`SELECT id FROM ${table} WHERE legacy_id=$1 OR id::text=$1 LIMIT 1`, [legacy]);
          return r.rows[0]?.id ?? null;
        };
        const tsOrNull = (v: any) => (v ? new Date(v).toISOString() : null);

        // Normalized collections: rewrite table contents for keys present in payload.
        const normalized = ['brands', 'projects', 'accounts', 'videos', 'posts', 'analytics', 'automationWorkflows'] as const;
        const present = normalized.filter((k) => (data as any)[k] !== undefined);

        if ((data as any).brands !== undefined) {
          await c.query('DELETE FROM brands WHERE workspace_id=$1', [ws.id]);
          for (const b of (data as any).brands || []) {
            await c.query(`INSERT INTO brands(legacy_id,workspace_id,name,description,logo_url,website,status,settings,created_at,updated_at)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),now()) ON CONFLICT DO NOTHING`,
              [b.id || b.legacyId, ws.id, b.name || '', b.description || null, b.logoUrl || null, b.website || null, b.status || 'active', JSON.stringify(b)]);
          }
        }
        if ((data as any).projects !== undefined) {
          await c.query('DELETE FROM projects WHERE workspace_id=$1', [ws.id]);
          for (const p of (data as any).projects || []) {
            await c.query(`INSERT INTO projects(legacy_id,workspace_id,brand_id,name,description,status,settings,created_at,updated_at)
              VALUES($1,$2,$3,$4,$5,$6,$7,now(),now()) ON CONFLICT DO NOTHING`,
              [p.id || p.legacyId, ws.id, await resolveFk('brands', p.brandId), p.name || '', p.description || null, p.status || 'active', JSON.stringify(p.settings || {})]);
          }
        }
        if ((data as any).accounts !== undefined) {
          await c.query('DELETE FROM social_accounts WHERE workspace_id=$1', [ws.id]);
          for (const a of (data as any).accounts || []) {
            await c.query(`INSERT INTO social_accounts(legacy_id,workspace_id,brand_id,provider,platform_account_id,account_name,handle,avatar_url,status,metadata,created_at,updated_at)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now()) ON CONFLICT DO NOTHING`,
              [a.id || a.legacyId, ws.id, await resolveFk('brands', a.brandId), a.provider || 'unknown', a.externalAccountId || a.id || null, a.accountName || a.name || '', a.usernameOrHandle || a.handle || null, a.avatarUrl || null, a.connectionStatus || a.status || 'disconnected', JSON.stringify(a)]);
          }
        }
        if ((data as any).videos !== undefined) {
          await c.query('DELETE FROM videos WHERE workspace_id=$1', [ws.id]);
          for (const v of (data as any).videos || []) {
            await c.query(`INSERT INTO videos(legacy_id,workspace_id,brand_id,project_id,title,description,status,metadata,created_at,updated_at)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),now()) ON CONFLICT DO NOTHING`,
              [v.id || v.legacyId, ws.id, await resolveFk('brands', v.brandId), await resolveFk('projects', v.projectId), v.title || v.name || '', v.description || null, v.status || 'uploaded', JSON.stringify(v)]);
          }
        }
        if ((data as any).posts !== undefined) {
          await c.query('DELETE FROM post_targets WHERE workspace_id=$1', [ws.id]);
          await c.query('DELETE FROM posts WHERE workspace_id=$1', [ws.id]);
          for (const p of (data as any).posts || []) {
            const pr = await c.query(`INSERT INTO posts(legacy_id,workspace_id,brand_id,project_id,video_id,title,caption,status,scheduled_at,timezone,settings,created_at,updated_at)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now()) ON CONFLICT DO NOTHING RETURNING id`,
              [p.id || p.legacyId, ws.id, await resolveFk('brands', p.brandId), await resolveFk('projects', p.projectId), await resolveFk('videos', p.videoId),
               p.title || p.postTitle || '', p.caption || null, p.status || 'draft', tsOrNull(p.scheduledTime || p.scheduledAt), p.timezone || null, JSON.stringify(p)]);
            const postUuid = pr.rows[0]?.id;
            if (!postUuid) continue;
            // Expand channel platforms into post_targets (one row per platform).
            const plats: any[] = p.channelPlatforms || p.platforms || (p.platform ? [p.platform] : []);
            for (const plat of plats) {
              const platId = typeof plat === 'string' ? plat : plat?.platform;
              if (!platId) continue;
              const accUuid = await resolveFk('social_accounts', (typeof plat === 'object' ? plat?.accountId : null) || p.accounts?.[platId]);
              await c.query(`INSERT INTO post_targets(legacy_id,post_id,workspace_id,social_account_id,platform,status,scheduled_at,payload,created_at,updated_at)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),now()) ON CONFLICT DO NOTHING`,
                [`${p.id || p.legacyId}_${platId}`, postUuid, ws.id, accUuid, platId, p.status === 'published' ? 'published' : (p.status === 'failed' ? 'failed' : 'scheduled'), tsOrNull(p.scheduledTime || p.scheduledAt), JSON.stringify(p)]);
            }
          }
        }
        if ((data as any).automationWorkflows !== undefined) {
          await c.query('DELETE FROM automation_workflows WHERE workspace_id=$1', [ws.id]);
          for (const w of (data as any).automationWorkflows || []) {
            await c.query(`INSERT INTO automation_workflows(legacy_id,workspace_id,name,description,trigger,steps,status,created_at,updated_at)
              VALUES($1,$2,$3,$4,$5,$6,$7,now(),now()) ON CONFLICT DO NOTHING`,
              [w.id || w.legacyId, ws.id, w.name || '', w.description || null, JSON.stringify(w.trigger || {}), JSON.stringify(w.steps || []), w.status || 'active']);
          }
        }

        // Non-normalized keys → workspace_kv (skip normalized + undefined).
        for (const [k, v] of Object.entries(data as any)) {
          if ((normalized as readonly string[]).includes(k) || v === undefined) continue;
          await c.query(`INSERT INTO workspace_kv(workspace_id,key,value,updated_at) VALUES($1,$2,$3,now())
            ON CONFLICT (workspace_id,key) DO UPDATE SET value=$3,updated_at=now()`, [ws.id, k, JSON.stringify(v)]);
        }
        await c.query('UPDATE workspaces SET state_version=state_version+1 WHERE id=$1', [ws.id]);
        return true;
      }, workspaceId),
    },
    audit: {
      log: async (e) => { await query(`INSERT INTO audit_logs(workspace_id,actor_id,action,metadata,created_at) VALUES($1,$2,$3,$4,now())`, [e.workspaceId ?? null, e.userId ?? null, e.action, JSON.stringify(e.details ?? {})]); },
      list: async (f) => (await query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1', [f?.limit ?? 100])).rows as any,
    },
    authTokens: {
      create: async (t: any) => {
        const hash = t.tokenHash || hashToken(t.token || crypto.randomBytes(24).toString('base64url'));
        const r = await query(`INSERT INTO auth_tokens(id,type,token_hash,user_id,email,payload,expires_at,attempts,created_at)
          VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,now()) RETURNING id`, [t.type, hash, t.userId ?? null, t.email ?? null, JSON.stringify(t.payload ?? {}), t.expiresAt, t.attempts ?? 0]);
        return { id: r.rows[0].id, ...t, tokenHash: hash } as any;
      },
      findValid: async (type, tokenHash) => (await query(`SELECT * FROM auth_tokens WHERE type=$1 AND token_hash=$2 AND used_at IS NULL AND expires_at>now()`, [type, tokenHash])).rows[0] as any,
      consume: async (id) => { await query('UPDATE auth_tokens SET used_at=now() WHERE id=$1', [id]); },
      purgeExpired: async () => (await query(`DELETE FROM auth_tokens WHERE expires_at < now() - interval '7 days'`)).rowCount ?? 0,
    },
    ...pgEntities(),
  };
}

async function wsUuid(workspaceId: string): Promise<string | null> {
  const r = await query(`SELECT id FROM workspaces WHERE ${byLegacy('id::text', 'legacy_id')}`, [workspaceId, workspaceId]);
  return r.rows[0]?.id ?? null;
}

/** Generic table-backed entity repo. `map` translates camelCase fields to columns. */
function pgEntity(table: string, map: Record<string, string>, jsonCol: string | null = 'settings', hasUpdatedAt = true): any {
  return {
    list: async (workspaceId: string, filter: Record<string, any> = {}) => {
      const ws = await wsUuid(workspaceId); if (!ws) return [];
      const cond = [`workspace_id=$1`]; const vals: any[] = [ws]; let i = 2;
      for (const [k, col] of Object.entries(map)) if (filter[k] !== undefined) { cond.push(`${col}=$${i++}`); vals.push(filter[k]); }
      return (await query(`SELECT * FROM ${table} WHERE ${cond.join(' AND ')} ORDER BY created_at DESC`, vals)).rows;
    },
    findById: async (workspaceId: string, id: string) => {
      const ws = await wsUuid(workspaceId); if (!ws) return undefined;
      return (await query(`SELECT * FROM ${table} WHERE workspace_id=$1 AND (legacy_id=$2 OR id::text=$2)`, [ws, id])).rows[0];
    },
    create: async (workspaceId: string, data: any) => {
      const ws = await wsUuid(workspaceId); if (!ws) throw new Error('workspace not found');
      const legacyId = data.legacyId || data.id || rid('ent');
      const cols = ['legacy_id', 'workspace_id', 'status', 'created_at', ...(hasUpdatedAt ? ['updated_at'] : [])];
      const vals: any[] = [legacyId, ws, data.status || 'active', new Date().toISOString(), ...(hasUpdatedAt ? [new Date().toISOString()] : [])];
      if (jsonCol) { cols.push(jsonCol); vals.push(JSON.stringify(data)); }
      const extraCols: string[] = [];
      for (const [k, col] of Object.entries(map)) {
        if (data[k] !== undefined) { extraCols.push(col); vals.push(typeof data[k] === 'object' ? JSON.stringify(data[k]) : data[k]); }
      }
      const allCols = [...cols, ...extraCols];
      const sql = `INSERT INTO ${table}(${allCols.join(',')}) VALUES(${allCols.map((_, i2) => `$${i2 + 1}`).join(',')}) RETURNING *`;
      return (await query(sql, vals)).rows[0];
    },
    update: async (workspaceId: string, id: string, updates: any) => {
      const ws = await wsUuid(workspaceId); if (!ws) return undefined;
      const sets: string[] = hasUpdatedAt ? [`updated_at=now()`] : []; const vals: any[] = [ws, id]; let i = 3;
      for (const [k, col] of Object.entries(map)) if (updates[k] !== undefined) { sets.push(`${col}=$${i++}`); vals.push(typeof updates[k] === 'object' ? JSON.stringify(updates[k]) : updates[k]); }
      if (updates.status !== undefined) { sets.push(`status=$${i++}`); vals.push(updates.status); }
      if (sets.length) await query(`UPDATE ${table} SET ${sets.join(',')} WHERE workspace_id=$1 AND (legacy_id=$2 OR id::text=$2)`, vals);
      return (await query(`SELECT * FROM ${table} WHERE workspace_id=$1 AND (legacy_id=$2 OR id::text=$2)`, [ws, id])).rows[0];
    },
    remove: async (workspaceId: string, id: string) => {
      const ws = await wsUuid(workspaceId); if (!ws) return false;
      const r = await query(`DELETE FROM ${table} WHERE workspace_id=$1 AND (legacy_id=$2 OR id::text=$2)`, [ws, id]);
      return (r.rowCount ?? 0) > 0;
    },
  };
}

function pgEntities() {
  return {
    brands: pgEntity('brands', { name: 'name', description: 'description', logoUrl: 'logo_url', website: 'website' }),
    projects: pgEntity('projects', { name: 'name', description: 'description', brandId: 'brand_id' }),
    videos: pgEntity('videos', { title: 'title', description: 'description', brandId: 'brand_id', projectId: 'project_id', durationSec: 'duration_sec', fileSizeBytes: 'file_size_bytes', thumbnailUrl: 'thumbnail_url' }, 'metadata'),
    socialAccounts: pgEntity('social_accounts', { provider: 'provider', platformAccountId: 'platform_account_id', accountName: 'account_name', handle: 'handle', avatarUrl: 'avatar_url' }, 'metadata'),
    mediaAssets: pgEntity('media_assets', { originalName: 'original_name', mime: 'mime', storageKey: 'storage_key', sha256: 'sha256', sizeBytes: 'size_bytes', kind: 'kind', width: 'width', height: 'height', durationSec: 'duration_sec', brandId: 'brand_id' }, null, false),
    posts: {
      ...pgEntity('posts', { title: 'title', caption: 'caption', brandId: 'brand_id', projectId: 'project_id', videoId: 'video_id', scheduledAt: 'scheduled_at', timezone: 'timezone' }),
      targets: {
        listForPost: async (workspaceId: string, postId: string) => {
          const ws = await wsUuid(workspaceId); if (!ws) return [];
          const p = (await query(`SELECT id FROM posts WHERE workspace_id=$1 AND (legacy_id=$2 OR id::text=$2)`, [ws, postId])).rows[0];
          if (!p) return [];
          return (await query('SELECT * FROM post_targets WHERE post_id=$1 ORDER BY created_at', [p.id])).rows;
        },
        claimDue: async (workerId: string, limit: number) => withTransaction(async (c) => {
          const r = await c.query(`UPDATE post_targets SET locked_by=$1, locked_at=now(), attempt_count=attempt_count+1
            WHERE id IN (SELECT id FROM post_targets WHERE status='scheduled' AND scheduled_at<=now()
              AND (locked_at IS NULL OR locked_at < now() - interval '15 minutes')
              ORDER BY scheduled_at LIMIT $2 FOR UPDATE SKIP LOCKED)
            RETURNING *`, [workerId, limit]);
          return r.rows;
        }),
        markResult: async (id: string, patch: any) => {
          const sets: string[] = []; const vals: any[] = [id]; let i = 2;
          const map: Record<string, string> = { status: 'status', externalId: 'external_id', externalUrl: 'external_url', errorCode: 'error_code', errorMessage: 'error_message', nextRetryAt: 'next_retry_at' };
          for (const [k, col] of Object.entries(map)) if (patch[k] !== undefined) { sets.push(`${col}=$${i++}`); vals.push(patch[k]); }
          if (patch.status === 'published' || patch.status === 'failed') sets.push('locked_by=NULL', 'locked_at=NULL');
          if (sets.length) await query(`UPDATE post_targets SET ${sets.join(',')},updated_at=now() WHERE id=$1`, vals);
        },
      },
    },
    automationWorkflows: pgEntity('automation_workflows', { name: 'name', description: 'description', trigger: 'trigger', steps: 'steps' }, null),
    analyticsSnapshots: {
      list: async (workspaceId: string) => { const ws = await wsUuid(workspaceId); return ws ? (await query('SELECT * FROM analytics_snapshots WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 500', [ws])).rows : []; },
      findById: async () => undefined,
      create: async (workspaceId: string, d: any) => { const ws = await wsUuid(workspaceId); if (!ws) throw new Error('workspace not found'); return (await query(`INSERT INTO analytics_snapshots(workspace_id,post_target_id,social_account_id,video_id,metric,value,period_start,period_end,source,synced_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now()) RETURNING *`, [ws, d.postTargetId ?? null, d.socialAccountId ?? null, d.videoId ?? null, d.metric, d.value, d.periodStart ?? null, d.periodEnd ?? null, d.source ?? 'manual'])).rows[0]; },
      update: async () => undefined,
      remove: async () => false,
    },
    driveConnections: {
      list: async (workspaceId: string) => { const ws = await wsUuid(workspaceId); return ws ? (await query('SELECT * FROM drive_connections WHERE workspace_id=$1', [ws])).rows : []; },
      findById: async (workspaceId: string, id: string) => { const ws = await wsUuid(workspaceId); return ws ? (await query('SELECT * FROM drive_connections WHERE workspace_id=$1 AND id::text=$2', [ws, id])).rows[0] : undefined; },
      create: async (workspaceId: string, d: any) => { const ws = await wsUuid(workspaceId); if (!ws) throw new Error('workspace not found'); return (await query(`INSERT INTO drive_connections(workspace_id,user_id,google_account,encrypted_token,token_expires_at,scopes,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now(),now()) RETURNING *`, [ws, d.userId ?? null, d.googleAccount ?? null, d.encryptedToken ?? null, d.tokenExpiresAt ?? null, JSON.stringify(d.scopes ?? []), d.status || 'active'])).rows[0]; },
      update: async () => undefined,
      remove: async (workspaceId: string, id: string) => { const ws = await wsUuid(workspaceId); if (!ws) return false; return ((await query('DELETE FROM drive_connections WHERE workspace_id=$1 AND id::text=$2', [ws, id])).rowCount ?? 0) > 0; },
    },
    driveImports: {
      list: async () => [],
      findById: async () => undefined,
      create: async () => { throw new Error('not implemented'); },
      update: async () => undefined,
      remove: async () => false,
    },
    notifications: {
      listForUser: async (userId: string, unreadOnly = false) => {
        const u = (await query(`SELECT id FROM users WHERE ${byLegacy('id::text', 'legacy_id')}`, [userId, userId])).rows[0];
        if (!u) return [];
        return (await query(`SELECT * FROM notifications WHERE user_id=$1 ${unreadOnly ? 'AND read_at IS NULL' : ''} ORDER BY created_at DESC LIMIT 100`, [u.id])).rows;
      },
      markRead: async (id: string, userId: string) => {
        const u = (await query(`SELECT id FROM users WHERE ${byLegacy('id::text', 'legacy_id')}`, [userId, userId])).rows[0];
        if (u) await query('UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2', [id, u.id]);
      },
    },
  };
}
