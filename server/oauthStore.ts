import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { globalStoresEnabled, gsGet, gsSet } from './globalStores.ts';

export type SocialProvider = 'youtube' | 'facebook' | 'instagram' | 'tiktok';

export type ConnectionStatus =
  | 'not_connected'
  | 'connecting'
  | 'authorization_pending'
  | 'connected'
  | 'permission_incomplete'
  | 'token_expired'
  | 'reconnection_required'
  | 'publishing_unavailable'
  | 'analytics_unavailable'
  | 'disconnected'
  | 'error';

export interface OAuthPermission {
  name: string;
  granted: boolean;
  description: string;
  category: 'publishing' | 'analytics' | 'profile' | 'management';
}

export interface ConnectedChannel {
  id: string;
  accountId: string;
  brandId: string;
  platform: SocialProvider;
  platformChannelId: string;
  channelName: string;
  handle: string;
  avatarUrl: string;
  accountType: 'youtube_channel' | 'facebook_page' | 'instagram_business' | 'instagram_creator' | 'tiktok_account';
  isEligibleForPublishing: boolean;
  publishingIneligibilityReason?: string;
  isEligibleForAnalytics: boolean;
  analyticsIneligibilityReason?: string;
  subscriberOrFollowerCount: number;
  selectedForBrand: boolean;
  lastSyncedAt: string;
  pageAccessToken?: string; // Stored server-side only
}

export interface SocialAccountRecord {
  id: string;
  brandId: string;
  workspaceId?: string; // Tenant scope — validated server-side
  provider: SocialProvider;
  externalAccountId: string;
  accountName: string;
  usernameOrHandle: string;
  email?: string;
  avatarUrl?: string;
  connectionStatus: ConnectionStatus;
  statusMessage: string;
  connectionDate: string;
  lastSuccessfulSync: string;
  tokenExpiresAt: string;
  tokenValid: boolean;
  requiresReconnection: boolean;
  permissions: OAuthPermission[];
  channels: ConnectedChannel[];
  rateLimitRemaining?: number;
  // Encrypted tokens (server-side only)
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
}

export interface OAuthConfig {
  googleClientId: string;
  googleClientSecret: string;
  metaAppId: string;
  metaAppSecret: string;
  tiktokClientKey: string;
  tiktokClientSecret: string;
  environment: 'development' | 'production';
}

export interface ConnectionAttempt {
  id: string;
  provider: SocialProvider;
  brandId: string;
  workspaceId?: string;
  state: string;
  codeVerifier?: string;
  redirectUri: string;
  createdAt: number;
}

import { DATA_DIR } from './config.ts';
const ACCOUNTS_FILE = path.join(DATA_DIR, 'social_connections.json');
const CONFIG_FILE = path.join(DATA_DIR, 'oauth_config.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory pending attempts (with TTL)
const pendingAttempts = new Map<string, ConnectionAttempt>();

// Clean up stale attempts every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, attempt] of pendingAttempts.entries()) {
    if (now - attempt.createdAt > 30 * 60 * 1000) {
      pendingAttempts.delete(state);
    }
  }
}, 15 * 60 * 1000);

// Token encryption — AES-256-GCM with a versioned envelope.
//
// Write format (v2):
//   {"v":2,"kid":"<key fingerprint>","iv":"<b64>","tag":"<b64>","data":"<b64>"}
//
// Key resolution for OAUTH_ENCRYPTION_KEY:
//   - 64-char hex or base64 decoding to exactly 32 bytes → used directly.
//   - any other non-empty string ≥ 32 chars → passphrase, stretched via
//     scrypt with a domain separator.
// There is NO built-in fallback secret: without the env var, encryption
// fails loudly and decryption returns '' (callers treat as reconnect-needed).

function keyBytesFromEnv(): Buffer | null {
  const raw = process.env.OAUTH_ENCRYPTION_KEY;
  if (!raw || raw === 'sra_social_publisher_secret_key_32_bytes_salt!') return null;
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');
  // Strict base64 → exactly 32 bytes?
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) && trimmed.length % 4 === 0) {
    const b64 = Buffer.from(trimmed, 'base64');
    if (b64.length === 32 && b64.toString('base64') === trimmed) return b64;
  }
  if (trimmed.length >= 32) return crypto.scryptSync(trimmed, 'publora-oauth-v2', 32);
  return null;
}

let cachedKey: Buffer | null | undefined;
function activeKey(): Buffer | null {
  if (cachedKey === undefined) cachedKey = keyBytesFromEnv();
  return cachedKey;
}

/** Key fingerprint used as envelope `kid` — identifies which key sealed the data. */
function keyId(key: Buffer): string {
  return 'k_' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
}

/** Legacy v1 key — only used to READ old iv:data CBC ciphertexts. */
function legacyKey(): Buffer | null {
  const raw = process.env.OAUTH_ENCRYPTION_KEY;
  if (!raw || raw === 'sra_social_publisher_secret_key_32_bytes_salt!') return null;
  return crypto.scryptSync(raw.trim(), 'salt', 32);
}

export function encryptToken(token: string): string {
  if (!token) return '';
  const key = activeKey();
  if (!key) throw new Error('OAUTH_ENCRYPTION_KEY is not configured — cannot encrypt token.');
  const iv = crypto.randomBytes(12); // GCM standard nonce
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 2,
    kid: keyId(key),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: data.toString('base64'),
  });
}

function decryptV2(envelope: any, key: Buffer): string {
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const data = Buffer.from(envelope.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function decryptV1Legacy(packed: string): string {
  const key = legacyKey();
  if (!key) return '';
  const [ivHex, dataHex] = packed.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  return decipher.update(dataHex, 'hex', 'utf8') + decipher.final('utf8');
}

export function decryptToken(encryptedToken: string): string {
  if (!encryptedToken) return '';
  try {
    if (encryptedToken.startsWith('{')) {
      const envelope = JSON.parse(encryptedToken);
      if (envelope?.v !== 2) return '';
      const key = activeKey();
      if (!key || envelope.kid !== keyId(key)) return ''; // unknown key — reconnect required
      return decryptV2(envelope, key);
    }
    // Legacy AES-256-CBC "iv:data" format — read-only migration path.
    if (encryptedToken.includes(':')) return decryptV1Legacy(encryptedToken);
    return '';
  } catch {
    // Auth-tag mismatch / malformed input — never leak details upward.
    return '';
  }
}

/**
 * Re-encrypt a stored token into the v2 format when it is still v1.
 * Returns the (possibly unchanged) stored value. Used by the migration
 * script; safe to call on already-v2 values (returns input unchanged).
 */
export function migrateTokenToV2(stored: string): string {
  if (!stored) return stored;
  if (stored.startsWith('{')) return stored; // already v2
  const plain = decryptToken(stored);
  if (!plain) return stored; // undecryptable — leave untouched for review
  return encryptToken(plain);
}

// Read/write OAuthConfig
export function getOAuthConfig(): OAuthConfig {
  let fileConfig: Partial<OAuthConfig> = {};
  if (globalStoresEnabled()) {
    fileConfig = gsGet<Partial<OAuthConfig>>('oauth_config', {});
  } else if (fs.existsSync(CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) {
      console.error('Error reading oauth_config.json:', e);
    }
  }

  return {
    googleClientId: process.env.GOOGLE_CLIENT_ID || fileConfig.googleClientId || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || fileConfig.googleClientSecret || '',
    metaAppId: process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || fileConfig.metaAppId || '',
    metaAppSecret: process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || fileConfig.metaAppSecret || '',
    tiktokClientKey: process.env.TIKTOK_CLIENT_KEY || fileConfig.tiktokClientKey || '',
    tiktokClientSecret: process.env.TIKTOK_CLIENT_SECRET || fileConfig.tiktokClientSecret || '',
    environment: (process.env.NODE_ENV === 'production' ? 'production' : fileConfig.environment || 'development') as 'development' | 'production',
  };
}

export function saveOAuthConfig(updated: Partial<OAuthConfig>): OAuthConfig {
  const current = getOAuthConfig();
  const merged: OAuthConfig = {
    ...current,
    ...updated,
  };
  if (globalStoresEnabled()) {
    gsSet('oauth_config', merged);
  } else {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  }
  return merged;
}

// Read/write Social Accounts
export function getAllAccounts(): SocialAccountRecord[] {
  if (globalStoresEnabled()) {
    return gsGet<SocialAccountRecord[]>('oauth_accounts', []);
  }
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading social_connections.json:', err);
    return [];
  }
}

export function saveAccounts(accounts: SocialAccountRecord[]): void {
  if (globalStoresEnabled()) {
    gsSet('oauth_accounts', accounts);
    return;
  }
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
}

export function getAccountById(id: string): SocialAccountRecord | undefined {
  return getAllAccounts().find((a) => a.id === id);
}

export function upsertAccount(account: SocialAccountRecord): void {
  const accounts = getAllAccounts();
  const idx = accounts.findIndex((a) => a.id === account.id || (a.provider === account.provider && a.externalAccountId === account.externalAccountId && a.brandId === account.brandId));
  if (idx >= 0) {
    accounts[idx] = account;
  } else {
    accounts.push(account);
  }
  saveAccounts(accounts);
}

export function removeAccount(id: string): boolean {
  const accounts = getAllAccounts();
  const filtered = accounts.filter((a) => a.id !== id);
  if (filtered.length !== accounts.length) {
    saveAccounts(filtered);
    return true;
  }
  return false;
}

// Pending Connection Attempt tracking
export function storePendingAttempt(attempt: ConnectionAttempt): void {
  pendingAttempts.set(attempt.state, attempt);
}

export function getPendingAttempt(state: string): ConnectionAttempt | undefined {
  return pendingAttempts.get(state);
}

export function removePendingAttempt(state: string): void {
  pendingAttempts.delete(state);
}

// ---------------------------------------------------------------------------
// WP6: async variants backed by Postgres when SHARED_STATE_DRIVER=pg.
// PG failures degrade to the in-memory map (logged) so auth flows never break.
// ---------------------------------------------------------------------------
import { sharedStateDriver, pgStoreAttempt, pgGetAttempt, pgRemoveAttempt } from './sharedState.ts';

function toPgAttempt(a: ConnectionAttempt) {
  return {
    id: a.id, provider: a.provider, state: a.state, brandId: a.brandId,
    workspaceId: a.workspaceId, codeVerifier: a.codeVerifier, redirectUri: a.redirectUri,
    createdAt: a.createdAt, expiresAt: a.createdAt + 30 * 60 * 1000,
  };
}

export async function storePendingAttemptAsync(attempt: ConnectionAttempt): Promise<void> {
  if (sharedStateDriver() !== 'pg') return storePendingAttempt(attempt);
  try { await pgStoreAttempt(toPgAttempt(attempt)); }
  catch (e) { console.error('[oauth] pg attempt store failed, memory fallback:', e); storePendingAttempt(attempt); }
}

export async function getPendingAttemptAsync(state: string): Promise<ConnectionAttempt | undefined> {
  if (sharedStateDriver() !== 'pg') return getPendingAttempt(state);
  try {
    const a = await pgGetAttempt(state);
    if (!a) return undefined;
    return { id: a.id, provider: a.provider as SocialProvider, brandId: a.brandId || '', workspaceId: a.workspaceId, state: a.state, codeVerifier: a.codeVerifier, redirectUri: a.redirectUri, createdAt: a.createdAt };
  } catch (e) { console.error('[oauth] pg attempt read failed, memory fallback:', e); return getPendingAttempt(state); }
}

export async function removePendingAttemptAsync(state: string): Promise<void> {
  if (sharedStateDriver() !== 'pg') return removePendingAttempt(state);
  try { await pgRemoveAttempt(state); } catch (e) { console.error('[oauth] pg attempt delete failed:', e); }
  removePendingAttempt(state);
}
