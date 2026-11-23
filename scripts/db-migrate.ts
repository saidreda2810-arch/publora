/**
 * db-migrate.ts — minimal SQL migration runner (see 03-design/06-developer-experience.md).
 *
 * Usage:
 *   npx tsx scripts/db-migrate.ts up|status|new <name>
 * Env: DATABASE_URL (required for up/status). MIGRATIONS_DIR optional.
 *
 * Tracks applied files in schema_migrations(version text PK, applied_at timestamptz).
 * Each file runs inside a transaction. Forward-only.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const MIGRATIONS_DIR = path.resolve(process.env.MIGRATIONS_DIR || path.join(process.cwd(), 'db', 'migrations'));

function listMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
}

async function ensureTable(client: pg.Client) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
}

async function applied(client: pg.Client): Promise<Set<string>> {
  const r = await client.query('SELECT version FROM schema_migrations');
  return new Set(r.rows.map((x: any) => x.version));
}

async function up() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is required'); process.exit(2); }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await ensureTable(client);
    const done = await applied(client);
    for (const file of listMigrationFiles()) {
      if (done.has(file)) { console.log(`skip  ${file}`); continue; }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [file]);
        await client.query('COMMIT');
        console.log(`apply ${file}`);
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`FAIL  ${file}: ${(e as Error).message}`);
        process.exitCode = 1;
        break;
      }
    }
  } finally { await client.end(); }
}

async function status() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is required'); process.exit(2); }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await ensureTable(client);
    const done = await applied(client);
    for (const f of listMigrationFiles()) console.log(`${done.has(f) ? 'applied' : 'pending'}  ${f}`);
    const extra = [...done].filter((v) => !listMigrationFiles().includes(v));
    for (const v of extra) console.log(`orphan  ${v}`);
  } finally { await client.end(); }
}

function scaffold(name: string) {
  const files = listMigrationFiles();
  const next = files.length ? String(Number(files[files.length - 1].slice(0, 4)) + 1).padStart(4, '0') : '0001';
  const file = path.join(MIGRATIONS_DIR, `${next}_${name.replace(/[^a-z0-9_-]/gi, '_')}.sql`);
  fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  fs.writeFileSync(file, `-- ${next}_${name}\n`);
  console.log(`created ${file}`);
}

const cmd = process.argv[2];
if (cmd === 'up') await up();
else if (cmd === 'status') await status();
else if (cmd === 'new') scaffold(process.argv[3] || `migration_${crypto.randomBytes(3).toString('hex')}`);
else { console.error('usage: db-migrate.ts up|status|new <name>'); process.exit(2); }
