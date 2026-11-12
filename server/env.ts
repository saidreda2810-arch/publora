// Boot-time environment validation. Runs before any router/module reads env
// vars (imported first in server.ts). Exits the process on fatal misconfig.
import dotenv from 'dotenv';
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const errors: string[] = [];

if (!['development', 'test', 'production'].includes(NODE_ENV)) {
  errors.push(`NODE_ENV must be development|test|production, got "${NODE_ENV}"`);
}

if (NODE_ENV === 'production') {
  const appUrl = process.env.APP_URL || '';
  if (!appUrl || appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
    errors.push('APP_URL must be a public https URL in production (localhost is not allowed)');
  }
  if (process.env.SRA_EXPOSE_DEV_TOKENS === 'true') {
    errors.push('SRA_EXPOSE_DEV_TOKENS must never be true in production');
  }
  if (process.env.ENABLE_DEMO_LOGIN === 'true') {
    errors.push('ENABLE_DEMO_LOGIN must never be true in production');
  }
}

if (errors.length > 0) {
  console.error('[env] FATAL configuration errors:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
