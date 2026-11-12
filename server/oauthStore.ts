import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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

const DATA_DIR = path.resolve(process.cwd(), 'data');
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

// Basic AES-256 encryption helper for sensitive tokens
const ENCRYPTION_SECRET = process.env.OAUTH_ENCRYPTION_KEY || 'sra_social_publisher_secret_key_32_bytes_salt!';
const KEY = crypto.scryptSync(ENCRYPTION_SECRET, 'salt', 32);

export function encryptToken(token: string): string {
  if (!token) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decryptToken(encryptedToken: string): string {
  if (!encryptedToken || !encryptedToken.includes(':')) return '';
  try {
    const [ivHex, dataHex] = encryptedToken.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
    let decrypted = decipher.update(dataHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Failed to decrypt token:', err);
    return '';
  }
}

// Read/write OAuthConfig
export function getOAuthConfig(): OAuthConfig {
  let fileConfig: Partial<OAuthConfig> = {};
  if (fs.existsSync(CONFIG_FILE)) {
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
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

// Read/write Social Accounts
export function getAllAccounts(): SocialAccountRecord[] {
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
