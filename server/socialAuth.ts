/**
 * Social sign-in (authentication) — DISTINCT from social account connections
 * (publishing OAuth in oauthRouter). These flows prove user identity only;
 * they do NOT create social_accounts records or store platform tokens.
 *
 * Providers: google, facebook, tiktok.
 * Scopes are identity-only (profile/email) — no publishing permissions.
 */
import crypto from 'crypto';

export type SocialLoginProvider = 'google' | 'facebook' | 'tiktok';

export interface SocialProfile {
  /** Provider-stable subject id (google sub / fb id / tiktok open_id) */
  id: string;
  email?: string;
  emailVerified?: boolean;
  name: string;
  avatarUrl?: string;
}

interface ProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  profileUrl: string;
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  scope: string;
}

const env = (k: string) => process.env[k];

const PROVIDERS: Record<SocialLoginProvider, ProviderConfig> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    clientId: () => env('GOOGLE_CLIENT_ID'),
    clientSecret: () => env('GOOGLE_CLIENT_SECRET'),
    scope: 'openid email profile',
  },
  facebook: {
    authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    profileUrl: 'https://graph.facebook.com/v19.0/me?fields=id,name,email,picture.width(200)',
    clientId: () => env('META_APP_ID') || env('FACEBOOK_APP_ID'),
    clientSecret: () => env('META_APP_SECRET') || env('FACEBOOK_APP_SECRET'),
    scope: 'public_profile,email',
  },
  tiktok: {
    authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    profileUrl: 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name',
    clientId: () => env('TIKTOK_CLIENT_KEY'),
    clientSecret: () => env('TIKTOK_CLIENT_SECRET'),
    scope: 'user.info.basic',
  },
};

export function isSocialLoginProvider(p: string): p is SocialLoginProvider {
  return p === 'google' || p === 'facebook' || p === 'tiktok';
}

export function getLoginProviderConfig(p: SocialLoginProvider) {
  const cfg = PROVIDERS[p];
  return { ...cfg, clientId: cfg.clientId(), clientSecret: cfg.clientSecret() };
}

export function isProviderConfigured(p: SocialLoginProvider): boolean {
  const c = getLoginProviderConfig(p);
  return !!(c.clientId && c.clientSecret);
}

export function buildLoginAuthorizeUrl(p: SocialLoginProvider, redirectUri: string, state: string): string {
  const c = getLoginProviderConfig(p);
  const params = new URLSearchParams({
    client_id: c.clientId!,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });
  if (p === 'tiktok') {
    params.set('scope', c.scope);
  } else {
    params.set('scope', c.scope);
    if (p === 'google') {
      params.set('access_type', 'online');
      params.set('prompt', 'select_account');
    }
  }
  return `${c.authorizeUrl}?${params.toString()}`;
}

async function postForm(url: string, body: Record<string, string>): Promise<any> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Token exchange failed (${resp.status}): ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const resp = await fetch(url, { headers });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Profile fetch failed (${resp.status}): ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

/** Exchange authorization code → provider profile. Throws on failure. */
export async function exchangeLoginCode(p: SocialLoginProvider, code: string, redirectUri: string): Promise<SocialProfile> {
  const c = getLoginProviderConfig(p);
  if (!c.clientId || !c.clientSecret) throw new Error(`${p} login is not configured`);

  let accessToken: string;
  if (p === 'google') {
    const t = await postForm(c.tokenUrl, {
      code, client_id: c.clientId, client_secret: c.clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    });
    accessToken = t.access_token;
    const me = await getJson(c.profileUrl, { authorization: `Bearer ${accessToken}` });
    return {
      id: me.sub, email: me.email, emailVerified: me.email_verified === true,
      name: me.name || me.email || 'User', avatarUrl: me.picture,
    };
  }

  if (p === 'facebook') {
    const t = await getJson(`${c.tokenUrl}?${new URLSearchParams({
      client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirectUri, code,
    })}`);
    accessToken = t.access_token;
    const me = await getJson(`${c.profileUrl}&access_token=${encodeURIComponent(accessToken)}`);
    return {
      id: me.id, email: me.email, name: me.name || me.email || 'Facebook User',
      avatarUrl: me.picture?.data?.url,
    };
  }

  // tiktok — token endpoint returns JSON with access_token; user info needs Bearer
  const t = await postForm(c.tokenUrl, {
    client_key: c.clientId, client_secret: c.clientSecret, code,
    grant_type: 'authorization_code', redirect_uri: redirectUri,
  });
  accessToken = t.access_token;
  const me = await getJson(c.profileUrl, { authorization: `Bearer ${accessToken}` });
  const u = me.data?.user || me.user || {};
  const openId = u.open_id || me.data?.open_id;
  if (!openId) throw new Error('TikTok profile missing open_id');
  return {
    id: openId,
    name: u.display_name || 'TikTok User',
    avatarUrl: u.avatar_url,
  };
}

export function newLoginState(): string {
  return crypto.randomBytes(24).toString('base64url');
}
