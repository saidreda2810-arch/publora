import {
  getOAuthConfig,
  decryptToken,
  encryptToken,
  upsertAccount,
  type SocialAccountRecord,
} from '../oauthStore.ts';

/**
 * Resolve a fresh access token for an OAuth account.
 * - Google/TikTok: refresh via provider token endpoint when expired/missing.
 * - Meta: long-lived tokens — verify validity; no refresh grant exists.
 * Throws Error with 'token expired'/'401' style messages so classifyError maps correctly.
 */
export async function ensureAccessToken(account: SocialAccountRecord): Promise<string> {
  const config = getOAuthConfig();
  const expiresAt = account.tokenExpiresAt ? Date.parse(account.tokenExpiresAt) : 0;
  const expired = !expiresAt || expiresAt - Date.now() < 5 * 60 * 1000;

  const current = decryptToken(account.accessTokenEncrypted || '');

  if (account.provider === 'youtube') {
    if (!expired && current) return current;
    const refreshToken = decryptToken(account.refreshTokenEncrypted || '');
    if (!refreshToken) {
      account.tokenValid = false;
      account.requiresReconnection = true;
      account.connectionStatus = 'token_expired';
      upsertAccount(account);
      throw new Error('YouTube access token expired and no refresh token stored — reconnect required (401).');
    }
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!resp.ok) {
      account.tokenValid = false;
      account.requiresReconnection = true;
      account.connectionStatus = 'token_expired';
      upsertAccount(account);
      throw new Error(`YouTube token refresh failed (${resp.status}) — reconnect required.`);
    }
    const data: any = await resp.json();
    account.accessTokenEncrypted = encryptToken(data.access_token);
    account.tokenExpiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
    account.tokenValid = true;
    account.requiresReconnection = false;
    account.connectionStatus = 'connected';
    upsertAccount(account);
    return data.access_token as string;
  }

  if (account.provider === 'tiktok') {
    if (!expired && current) return current;
    const refreshToken = decryptToken(account.refreshTokenEncrypted || '');
    if (!refreshToken) {
      account.tokenValid = false;
      account.requiresReconnection = true;
      account.connectionStatus = 'token_expired';
      upsertAccount(account);
      throw new Error('TikTok access token expired and no refresh token stored — reconnect required (401).');
    }
    const resp = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: config.tiktokClientKey,
        client_secret: config.tiktokClientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    if (!resp.ok) {
      account.tokenValid = false;
      account.requiresReconnection = true;
      account.connectionStatus = 'token_expired';
      upsertAccount(account);
      throw new Error(`TikTok token refresh failed (${resp.status}) — reconnect required.`);
    }
    const data: any = await resp.json();
    if (data.error) {
      account.tokenValid = false;
      account.requiresReconnection = true;
      upsertAccount(account);
      throw new Error(`TikTok token refresh rejected: ${data.error_description || data.error}`);
    }
    account.accessTokenEncrypted = encryptToken(data.access_token);
    if (data.refresh_token) account.refreshTokenEncrypted = encryptToken(data.refresh_token);
    account.tokenExpiresAt = new Date(Date.now() + (data.expires_in || 86400) * 1000).toISOString();
    account.tokenValid = true;
    account.requiresReconnection = false;
    account.connectionStatus = 'connected';
    upsertAccount(account);
    return data.access_token as string;
  }

  // Meta — access tokens are long-lived; verify they still work.
  if (!current) {
    account.tokenValid = false;
    account.requiresReconnection = true;
    account.connectionStatus = 'token_expired';
    upsertAccount(account);
    throw new Error('Meta access token missing — reconnect required (401).');
  }
  const check = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${encodeURIComponent(current)}`);
  if (!check.ok) {
    account.tokenValid = false;
    account.requiresReconnection = true;
    account.connectionStatus = 'token_expired';
    upsertAccount(account);
    throw new Error(`Meta access token expired or revoked (${check.status}) — reconnect required.`);
  }
  account.tokenValid = true;
  account.connectionStatus = 'connected';
  upsertAccount(account);
  return current;
}
