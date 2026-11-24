/**
 * tests/test-env.ts — MUST be the first import of run-all-tests.ts.
 * ES module evaluation order guarantees this module's side effects run
 * before saasDb/config modules read process.env.
 *
 * Isolation contract:
 *  - DB_DRIVER forced to 'json' so tests never touch PostgreSQL.
 *  - SRA_DATA_DIR pointed at a fresh mkdtemp dir so tests never touch
 *    the developer's real data/ directory.
 *  - Test-only OAuth encryption key (production code has no fallback).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DB_DRIVER = 'json';
delete process.env.DATABASE_URL;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'publora-test-'));
process.env.SRA_DATA_DIR = path.join(tmp, 'data');
fs.mkdirSync(process.env.SRA_DATA_DIR, { recursive: true });

process.env.OAUTH_ENCRYPTION_KEY =
  process.env.OAUTH_ENCRYPTION_KEY || 'test-only-oauth-encryption-key-0123456789';
