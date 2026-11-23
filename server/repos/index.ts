import type { SaasRepos } from './repo.ts';
import { createJsonRepos } from './jsonRepo.ts';
import { createPgRepos } from './pgRepo.ts';

let cached: SaasRepos | null = null;

export function getRepos(): SaasRepos {
  if (cached) return cached;
  const driver = (process.env.DB_DRIVER || 'json').toLowerCase();
  if (driver === 'pg') {
    if (!process.env.DATABASE_URL) throw new Error('DB_DRIVER=pg requires DATABASE_URL');
    cached = createPgRepos();
  } else {
    cached = createJsonRepos();
  }
  return cached;
}

export function resetReposForTests(): void { cached = null; }
export type { SaasRepos } from './repo.ts';
