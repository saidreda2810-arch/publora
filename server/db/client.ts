/**
 * server/db/client.ts — single Postgres access module (WP3.5).
 * Pool from DATABASE_URL; statement timeout; withTransaction helper;
 * error mapping (23505→409, 23503→409/422). Written but UNTESTED — no live
 * Postgres in this environment ("اتنفذ ومااتختبرش").
 */
import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  pool = new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 15_000),
  });
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));
  return pool;
}

export async function query<T extends pg.QueryResultRow = any>(text: string, params: any[] = []): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

/** Run fn inside BEGIN/COMMIT; rolls back on throw. Sets app.workspace_id GUC for RLS later. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>, workspaceId?: string): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (workspaceId) await client.query(`SELECT set_config('app.workspace_id', $1, true)`, [workspaceId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Map Postgres errors to HTTP-friendly shapes. */
export function mapDbError(err: any): { status: number; code: string; message: string } {
  const code = err?.code as string | undefined;
  if (code === '23505') return { status: 409, code: 'conflict', message: 'Duplicate or conflicting record' };
  if (code === '23503') return { status: 422, code: 'reference_violation', message: 'Referenced record does not exist' };
  if (code === '23502') return { status: 422, code: 'missing_field', message: 'Required field missing' };
  if (code === '23514') return { status: 422, code: 'check_violation', message: 'Value violates a constraint' };
  return { status: 500, code: 'internal_error', message: 'Database error' };
}

export async function closePool(): Promise<void> {
  if (pool) { await pool.end(); pool = null; }
}
