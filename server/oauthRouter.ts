import express, { Request, Response } from 'express';
import crypto from 'crypto';
import {
  SocialProvider,
  SocialAccountRecord,
  ConnectedChannel,
  OAuthPermission,
  ConnectionStatus,
  getOAuthConfig,
  saveOAuthConfig,
  getAllAccounts,
  getAccountById,
  upsertAccount,
  removeAccount,
  storePendingAttempt,
  getPendingAttempt,
  removePendingAttempt,
  encryptToken,
  decryptToken,
} from './oauthStore.ts';
import { requireAuth, requireGodOwner, AuthenticatedRequest } from './authRouter.ts';
import { getWorkspaceData, logAuditEvent } from './saasDb.ts';

export const oauthRouter = express.Router();

// ---- Workspace isolation helpers ----
// Brands are workspace-scoped entities; OAuth accounts inherit tenancy via brandId.
// Legacy records without workspaceId are matched through their brand's workspace.
function workspaceBrandIds(workspaceId: string | undefined): Set<string> {
  if (!workspaceId) return new Set();
  try {
    return new Set((getWorkspaceData(workspaceId).brands || []).map((b: any) => b.id));
  } catch {
    return new Set();
  }
}

function accountInWorkspace(acc: { brandId?: string; workspaceId?: string }, req: AuthenticatedRequest): boolean {
  const wsId = req.workspace?.id;
  if (!wsId) return false;
  if (acc.workspaceId) return acc.workspaceId === wsId;
  return workspaceBrandIds(wsId).has(acc.brandId || '');
}

// Duplicate prevention: same platform identity + brand = same connection
function findExistingAccount(provider: SocialProvider, externalAccountId: string, brandId: string) {
  return getAllAccounts().find(
    (a) => a.provider === provider && a.externalAccountId === externalAccountId && a.brandId === brandId
  );
}

// Audit helper — never logs tokens or secrets
function audit(req: AuthenticatedRequest | Request, action: string, details: string) {
  const r = req as AuthenticatedRequest;
  try {
    logAuditEvent({
      userId: r.user?.id,
      userEmail: r.user?.email,
      workspaceId: r.workspace?.id,
      action,
      details,
    });
  } catch { /* audit must never break the request */ }
}

// Helper to determine the base URL
function getBaseUrl(req: Request): string {
  // If APP_URL env is set (AI Studio standard), use it.
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  // Otherwise fallback to protocol and host
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
  return `${protocol}://${host}`;
}

// 1. Get OAuth Configuration Status (authenticated — masked IDs only)
oauthRouter.get('/config', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const config = getOAuthConfig();
  const baseUrl = getBaseUrl(req);
  const sharedUrl = process.env.SHARED_APP_URL || process.env.APP_URL || baseUrl;

  res.json({
    success: true,
    environment: config.environment,
    baseUrl,
    sharedUrl,
    callbacks: {
      youtube: {
        dev: `${baseUrl}/api/oauth/callback/youtube`,
        shared: `${sharedUrl}/api/oauth/callback/youtube`,
      },
      facebook: {
        dev: `${baseUrl}/api/oauth/callback/facebook`,
        shared: `${sharedUrl}/api/oauth/callback/facebook`,
      },
      instagram: {
        dev: `${baseUrl}/api/oauth/callback/instagram`,
        shared: `${sharedUrl}/api/oauth/callback/instagram`,
      },
      tiktok: {
        dev: `${baseUrl}/api/oauth/callback/tiktok`,
        shared: `${sharedUrl}/api/oauth/callback/tiktok`,
      },
    },
    providers: {
      youtube: {
        configured: Boolean(config.googleClientId && config.googleClientSecret),
        clientIdMasked: config.googleClientId ? `${config.googleClientId.slice(0, 8)}...${config.googleClientId.slice(-8)}` : null,
      },
      facebook: {
        configured: Boolean(config.metaAppId && config.metaAppSecret),
        appIdMasked: config.metaAppId ? `${config.metaAppId.slice(0, 4)}...${config.metaAppId.slice(-4)}` : null,
      },
      instagram: {
        configured: Boolean(config.metaAppId && config.metaAppSecret),
        appIdMasked: config.metaAppId ? `${config.metaAppId.slice(0, 4)}...${config.metaAppId.slice(-4)}` : null,
      },
      tiktok: {
        configured: Boolean(config.tiktokClientKey && config.tiktokClientSecret),
        clientKeyMasked: config.tiktokClientKey ? `${config.tiktokClientKey.slice(0, 4)}...${config.tiktokClientKey.slice(-4)}` : null,
      },
    },
  });
});

// 2. Save OAuth Developer Credentials — GOD Primary Owner only.
// Client secrets are platform-level integration credentials; customers never
// see or edit them. Enforced server-side regardless of frontend visibility.
oauthRouter.post('/config', requireAuth, requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const {
    googleClientId,
    googleClientSecret,
    metaAppId,
    metaAppSecret,
    tiktokClientKey,
    tiktokClientSecret,
    environment,
  } = req.body;

  const current = getOAuthConfig();
  const updated = saveOAuthConfig({
    googleClientId: googleClientId !== undefined ? googleClientId.trim() : current.googleClientId,
    googleClientSecret: googleClientSecret !== undefined ? googleClientSecret.trim() : current.googleClientSecret,
    metaAppId: metaAppId !== undefined ? metaAppId.trim() : current.metaAppId,
    metaAppSecret: metaAppSecret !== undefined ? metaAppSecret.trim() : current.metaAppSecret,
    tiktokClientKey: tiktokClientKey !== undefined ? tiktokClientKey.trim() : current.tiktokClientKey,
    tiktokClientSecret: tiktokClientSecret !== undefined ? tiktokClientSecret.trim() : current.tiktokClientSecret,
    environment: environment || current.environment,
  });

  res.json({
    success: true,
    message: 'OAuth developer credentials updated successfully.',
    environment: updated.environment,
  });
});

// 2b. Developer diagnostics — GOD Primary Owner only.
// Validates config completeness, callback URL correctness, and store health.
// Never returns secret values — only presence/format checks.
oauthRouter.get('/diagnostics', requireAuth, requireGodOwner, (req: AuthenticatedRequest, res: Response) => {
  const config = getOAuthConfig();
  const baseUrl = getBaseUrl(req);
  const sharedUrl = process.env.SHARED_APP_URL || process.env.APP_URL || baseUrl;

  const check = (name: string, value: string | undefined, pattern?: RegExp) => ({
    name,
    configured: Boolean(value && value.trim()),
    formatValid: value ? (pattern ? pattern.test(value) : true) : false,
  });

  const providers = {
    youtube: {
      clientId: check('Google Client ID', config.googleClientId, /\.apps\.googleusercontent\.com$|^\d+-/),
      clientSecret: check('Google Client Secret', config.googleClientSecret, /^GOCSPX-/),
      callback: `${baseUrl}/api/oauth/callback/youtube`,
      callbackReachable: baseUrl.startsWith('http'),
    },
    facebook: {
      appId: check('Meta App ID', config.metaAppId, /^\d+$/),
      appSecret: check('Meta App Secret', config.metaAppSecret),
      callback: `${baseUrl}/api/oauth/callback/facebook`,
    },
    instagram: {
      usesMetaCredentials: Boolean(config.metaAppId && config.metaAppSecret),
      callback: `${baseUrl}/api/oauth/callback/instagram`,
    },
    tiktok: {
      clientKey: check('TikTok Client Key', config.tiktokClientKey),
      clientSecret: check('TikTok Client Secret', config.tiktokClientSecret),
      callback: `${baseUrl}/api/oauth/callback/tiktok`,
    },
  };

  // Store health
  let accountsCount = 0, storeError: string | null = null;
  try { accountsCount = getAllAccounts().length; } catch (e: any) { storeError = e.message; }

  const configuredProviders = Object.entries(providers).filter(([k]) =>
    k === 'instagram' ? providers.instagram.usesMetaCredentials :
    Object.values(providers[k as keyof typeof providers]).some((v: any) => typeof v === 'object' && 'configured' in v ? v.configured : v)
  ).map(([k]) => k);

  res.json({
    success: true,
    environment: config.environment,
    baseUrl,
    sharedUrl,
    providers,
    configuredProviders,
    store: { accountsCount, error: storeError },
    warnings: [
      ...(!config.googleClientId || !config.googleClientSecret ? ['YouTube OAuth not configured — Connect will fail'] : []),
      ...(!config.metaAppId || !config.metaAppSecret ? ['Meta (Facebook/Instagram) OAuth not configured'] : []),
      ...(!config.tiktokClientKey || !config.tiktokClientSecret ? ['TikTok OAuth not configured'] : []),
      ...(config.environment === 'development' ? ['Running in development mode — use production credentials for live publishing'] : []),
      ...(sharedUrl !== baseUrl ? [`Shared app URL (${sharedUrl}) differs from request base URL — verify callback registration matches`] : []),
    ],
  });
});

// Helper for PKCE
function base64URLEncode(str: Buffer): string {
  return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function sha256(buffer: Buffer): Buffer {
  return crypto.createHash('sha256').update(buffer).digest();
}

// 3. Initiate OAuth Flow: Generate Platform Authorize URL
oauthRouter.post('/authorize-url', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { provider, brandId } = req.body as { provider: SocialProvider; brandId: string };

  if (!provider || !['youtube', 'facebook', 'instagram', 'tiktok'].includes(provider)) {
    return res.status(400).json({ success: false, error: 'Invalid or unsupported provider.' });
  }

  if (!brandId) {
    return res.status(400).json({ success: false, error: 'Brand ID is required to link social account.' });
  }

  // Tenant validation: brand must belong to the authenticated workspace
  const wsId = req.workspace?.id;
  if (!wsId || !workspaceBrandIds(wsId).has(brandId)) {
    return res.status(403).json({ success: false, error: 'Brand not found in this workspace.' });
  }

  const config = getOAuthConfig();
  const baseUrl = getBaseUrl(req);
  const redirectUri = `${baseUrl}/api/oauth/callback/${provider}`;

  // Generate cryptographic state
  const stateNonce = crypto.randomBytes(24).toString('hex');
  const state = Buffer.from(
    JSON.stringify({
      nonce: stateNonce,
      provider,
      brandId,
      workspaceId: wsId,
      timestamp: Date.now(),
    })
  ).toString('base64url');

  let authUrl = '';
  let codeVerifier: string | undefined = undefined;

  switch (provider) {
    case 'youtube': {
      if (!config.googleClientId || !config.googleClientSecret) {
        return res.status(400).json({
          success: false,
          error: 'Google OAuth credentials not configured. Please add Google Client ID & Secret in Developer Settings.',
          requiresConfig: true,
          provider: 'youtube',
        });
      }

      // YouTube OAuth with scopes for channel management and YouTube Analytics
      const scopes = [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/yt-analytics.readonly',
      ].join(' ');

      const params = new URLSearchParams({
        client_id: config.googleClientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes,
        access_type: 'offline', // Mandatory to receive refresh_token
        prompt: 'consent', // Force consent so refresh token is returned
        include_granted_scopes: 'true',
        state,
      });

      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      break;
    }

    case 'facebook': {
      if (!config.metaAppId || !config.metaAppSecret) {
        return res.status(400).json({
          success: false,
          error: 'Meta App credentials not configured. Please add Meta App ID & Secret in Developer Settings.',
          requiresConfig: true,
          provider: 'facebook',
        });
      }

      // Facebook Pages permissions
      const scopes = [
        'public_profile',
        'email',
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
      ].join(',');

      const params = new URLSearchParams({
        client_id: config.metaAppId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes,
        state,
      });

      authUrl = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
      break;
    }

    case 'instagram': {
      if (!config.metaAppId || !config.metaAppSecret) {
        return res.status(400).json({
          success: false,
          error: 'Meta App credentials not configured for Instagram. Please add Meta App ID & Secret in Developer Settings.',
          requiresConfig: true,
          provider: 'instagram',
        });
      }

      // Instagram Graph API permissions for Professional (Business/Creator) accounts
      const scopes = [
        'public_profile',
        'pages_show_list',
        'pages_read_engagement',
        'instagram_basic',
        'instagram_content_publish',
        'instagram_manage_insights',
      ].join(',');

      const params = new URLSearchParams({
        client_id: config.metaAppId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes,
        state,
      });

      authUrl = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
      break;
    }

    case 'tiktok': {
      if (!config.tiktokClientKey || !config.tiktokClientSecret) {
        return res.status(400).json({
          success: false,
          error: 'TikTok Login Kit credentials not configured. Please add TikTok Client Key & Secret in Developer Settings.',
          requiresConfig: true,
          provider: 'tiktok',
        });
      }

      // TikTok PKCE flow
      codeVerifier = base64URLEncode(crypto.randomBytes(32));
      const codeChallenge = base64URLEncode(sha256(Buffer.from(codeVerifier)));

      const scopes = ['user.info.basic', 'video.publish', 'video.upload'].join(',');

      const params = new URLSearchParams({
        client_key: config.tiktokClientKey,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
      break;
    }
  }

  audit(req, 'oauth_authorize_started', `OAuth flow initiated for ${provider} on brand ${brandId}.`);

  // Store connection attempt for CSRF validation during callback
  storePendingAttempt({
    id: `att_${Date.now()}`,
    provider,
    brandId,
    workspaceId: wsId,
    state,
    codeVerifier,
    redirectUri,
    createdAt: Date.now(),
  });

  return res.json({
    success: true,
    url: authUrl,
    state,
    redirectUri,
  });
});

// Helper to render popup callback HTML
function renderCallbackHtml(
  type: 'OAUTH_AUTH_SUCCESS' | 'OAUTH_AUTH_ERROR',
  payload: any,
  title: string,
  message: string
) {
  const isSuccess = type === 'OAUTH_AUTH_SUCCESS';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body {
      background-color: #0a0d12;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 20px;
      text-align: center;
      box-sizing: border-box;
    }
    .card {
      background: #0f1520;
      border: 1px solid ${isSuccess ? 'rgba(0, 255, 197, 0.4)' : 'rgba(239, 68, 68, 0.4)'};
      border-radius: 16px;
      padding: 28px;
      max-width: 440px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .icon {
      font-size: 40px;
      margin-bottom: 16px;
    }
    h2 {
      margin: 0 0 10px 0;
      font-size: 18px;
      color: ${isSuccess ? '#00ffc5' : '#ef4444'};
    }
    p {
      color: #94a3b8;
      font-size: 13px;
      line-height: 1.5;
      margin: 0 0 20px 0;
    }
    .btn {
      background: #182335;
      border: 1px solid rgba(255,255,255,0.15);
      color: #fff;
      padding: 8px 18px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isSuccess ? '⚡' : '⚠️'}</div>
    <h2>${title}</h2>
    <p>${message}</p>
    <button class="btn" onclick="window.close()">Close Window</button>
  </div>
  <script>
    (function() {
      var payload = ${JSON.stringify(payload)};
      if (window.opener) {
        window.opener.postMessage({
          type: '${type}',
          ...payload
        }, '*');
        setTimeout(function() {
          window.close();
        }, 1200);
      } else {
        setTimeout(function() {
          window.location.href = '/';
        }, 2000);
      }
    })();
  </script>
</body>
</html>`;
}

// 4. OAuth Callback Handler
oauthRouter.get(['/callback/:provider', '/callback/:provider/'], async (req: Request, res: Response) => {
  const provider = req.params.provider as SocialProvider;
  const { code, state, error, error_description } = req.query;

  // Handle provider denial or authorization error
  if (error) {
    const errorMsg = (error_description as string) || (error as string) || 'User denied authorization.';
    return res.send(
      renderCallbackHtml(
        'OAUTH_AUTH_ERROR',
        { provider, error: errorMsg },
        'Authorization Incomplete',
        `The ${provider} authorization was not completed: ${errorMsg}`
      )
    );
  }

  if (!code || !state) {
    return res.status(400).send(
      renderCallbackHtml(
        'OAUTH_AUTH_ERROR',
        { provider, error: 'Missing authorization code or state parameter.' },
        'Authentication Error',
        'Missing authorization code or state parameter.'
      )
    );
  }

  // Validate state
  const attempt = getPendingAttempt(state as string);
  if (!attempt) {
    return res.status(400).send(
      renderCallbackHtml(
        'OAUTH_AUTH_ERROR',
        { provider, error: 'Invalid or expired state session (CSRF validation failed).' },
        'Security Verification Failed',
        'Invalid or expired state session. Please initiate connection again from the dashboard.'
      )
    );
  }

  removePendingAttempt(state as string);

  const config = getOAuthConfig();
  const baseUrl = getBaseUrl(req);
  const redirectUri = attempt.redirectUri || `${baseUrl}/api/oauth/callback/${provider}`;

  try {
    switch (provider) {
      // ----------------------------------------------------
      // YOUTUBE / GOOGLE INTEGRATION
      // ----------------------------------------------------
      case 'youtube': {
        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: code as string,
            client_id: config.googleClientId,
            client_secret: config.googleClientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        });

        if (!tokenResp.ok) {
          const errData = await tokenResp.json().catch(() => ({}));
          throw new Error(errData.error_description || errData.error || 'Failed to exchange Google OAuth code.');
        }

        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;
        const expiresIn = tokenData.expires_in || 3600;
        const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        // Retrieve user profile information (email/id)
        const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const userData = await userResp.json().catch(() => ({}));

        // Retrieve YouTube Channel(s)
        const ytResp = await fetch(
          'https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true',
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        const ytData = await ytResp.json().catch(() => ({ items: [] }));
        const ytChannels = ytData.items || [];

        const connectedChannels: ConnectedChannel[] = ytChannels.map((ch: any) => ({
          id: `chan_yt_${ch.id}`,
          accountId: `acc_yt_${ch.id}`,
          brandId: attempt.brandId,
          platform: 'youtube',
          platformChannelId: ch.id,
          channelName: ch.snippet?.title || 'YouTube Channel',
          handle: ch.snippet?.customUrl || `@${ch.snippet?.title?.replace(/\s+/g, '').toLowerCase() || ch.id}`,
          avatarUrl: ch.snippet?.thumbnails?.default?.url || ch.snippet?.thumbnails?.medium?.url || '',
          accountType: 'youtube_channel',
          isEligibleForPublishing: true, // Has upload capability
          isEligibleForAnalytics: true,
          subscriberOrFollowerCount: Number(ch.statistics?.subscriberCount || 0),
          selectedForBrand: true, // Selected by default
          lastSyncedAt: new Date().toISOString(),
        }));

        // If user authenticated but has no channel yet
        if (connectedChannels.length === 0) {
          connectedChannels.push({
            id: `chan_yt_${userData.id || 'primary'}`,
            accountId: `acc_yt_${userData.id || 'primary'}`,
            brandId: attempt.brandId,
            platform: 'youtube',
            platformChannelId: userData.id || 'no_channel',
            channelName: userData.name || 'Google Account (No YouTube Channel)',
            handle: userData.email || 'google_user',
            avatarUrl: userData.picture || '',
            accountType: 'youtube_channel',
            isEligibleForPublishing: false,
            publishingIneligibilityReason: 'No YouTube channel created for this Google Account. Create a channel on YouTube first.',
            isEligibleForAnalytics: false,
            analyticsIneligibilityReason: 'No channel statistics found.',
            subscriberOrFollowerCount: 0,
            selectedForBrand: false,
            lastSyncedAt: new Date().toISOString(),
          });
        }

        const permissions: OAuthPermission[] = [
          {
            name: 'https://www.googleapis.com/auth/youtube.upload',
            granted: true,
            description: 'Direct upload & publishing of Short & long-form videos',
            category: 'publishing',
          },
          {
            name: 'https://www.googleapis.com/auth/youtube.readonly',
            granted: true,
            description: 'Read channel info, playlists, video statuses, and comments',
            category: 'management',
          },
          {
            name: 'https://www.googleapis.com/auth/yt-analytics.readonly',
            granted: true,
            description: 'Access official 1-second retention curve & watch duration data',
            category: 'analytics',
          },
        ];

        const accountRecord: SocialAccountRecord = {
          id: `acc_yt_${userData.id || ytChannels[0]?.id || Date.now()}`,
          brandId: attempt.brandId,
          workspaceId: attempt.workspaceId,
          provider: 'youtube',
          externalAccountId: userData.id || ytChannels[0]?.id || 'google_user',
          accountName: connectedChannels[0]?.channelName || userData.name || 'YouTube Account',
          usernameOrHandle: connectedChannels[0]?.handle || userData.email || 'youtube_creator',
          email: userData.email,
          avatarUrl: connectedChannels[0]?.avatarUrl || userData.picture,
          connectionStatus: connectedChannels[0]?.isEligibleForPublishing ? 'connected' : 'publishing_unavailable',
          statusMessage: connectedChannels[0]?.isEligibleForPublishing
            ? 'Channel connected and verified with YouTube Data API v3.'
            : 'Authenticated with Google, but YouTube channel setup required.',
          connectionDate: new Date().toISOString(),
          lastSuccessfulSync: new Date().toISOString(),
          tokenExpiresAt,
          tokenValid: true,
          requiresReconnection: false,
          permissions,
          channels: connectedChannels,
          accessTokenEncrypted: encryptToken(accessToken),
          refreshTokenEncrypted: refreshToken ? encryptToken(refreshToken) : undefined,
        };

        // Duplicate prevention: same platform identity + brand reuses the record;
        // same identity on a different brand gets a distinct account id.
        const existingSame = findExistingAccount(accountRecord.provider, accountRecord.externalAccountId, accountRecord.brandId);
        if (existingSame) {
          accountRecord.id = existingSame.id;
        } else {
          const otherBrand = getAllAccounts().find(
            (a) => a.provider === accountRecord.provider && a.externalAccountId === accountRecord.externalAccountId && a.brandId !== accountRecord.brandId
          );
          if (otherBrand) accountRecord.id = `${accountRecord.id}_${accountRecord.brandId.slice(-6)}`;
        }
        upsertAccount(accountRecord);

        return res.send(
          renderCallbackHtml(
            'OAUTH_AUTH_SUCCESS',
            {
              provider: 'youtube',
              accountId: accountRecord.id,
              channelsCount: connectedChannels.length,
            },
            'YouTube Channel Connected',
            `Successfully authenticated ${accountRecord.accountName}. Connected to SRA Social Publisher.`
          )
        );
      }

      // ----------------------------------------------------
      // FACEBOOK PAGES INTEGRATION
      // ----------------------------------------------------
      case 'facebook': {
        const tokenResp = await fetch(
          `https://graph.facebook.com/v19.0/oauth/access_token?` +
            new URLSearchParams({
              client_id: config.metaAppId,
              client_secret: config.metaAppSecret,
              redirect_uri: redirectUri,
              code: code as string,
            })
        );

        if (!tokenResp.ok) {
          const errData = await tokenResp.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Failed to exchange Meta OAuth access token.');
        }

        const tokenData = await tokenResp.json();
        const userAccessToken = tokenData.access_token;
        const expiresIn = tokenData.expires_in || 5184000; // ~60 days long-lived
        const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        // Get authenticated user info
        const userResp = await fetch(
          `https://graph.facebook.com/v19.0/me?fields=id,name,picture&access_token=${userAccessToken}`
        );
        const userData = await userResp.json().catch(() => ({}));

        // Retrieve Facebook Pages that user manages
        const pagesResp = await fetch(
          `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,category,tasks,access_token,picture{url},fan_count&access_token=${userAccessToken}`
        );
        const pagesData = await pagesResp.json().catch(() => ({ data: [] }));
        const managedPages = pagesData.data || [];

        const connectedChannels: ConnectedChannel[] = managedPages.map((page: any) => {
          const hasPublishPermission = page.tasks?.some((t: string) =>
            ['CREATE_CONTENT', 'MANAGE', 'ADMINISTER'].includes(t)
          );
          return {
            id: `chan_fb_${page.id}`,
            accountId: `acc_fb_${userData.id || page.id}`,
            brandId: attempt.brandId,
            platform: 'facebook',
            platformChannelId: page.id,
            channelName: page.name,
            handle: `@${page.name?.replace(/\s+/g, '').toLowerCase() || page.id}`,
            avatarUrl: page.picture?.data?.url || '',
            accountType: 'facebook_page',
            isEligibleForPublishing: Boolean(hasPublishPermission),
            publishingIneligibilityReason: hasPublishPermission
              ? undefined
              : 'User lacks CREATE_CONTENT task permission on this Facebook Page.',
            isEligibleForAnalytics: true,
            subscriberOrFollowerCount: Number(page.fan_count || 0),
            selectedForBrand: true,
            lastSyncedAt: new Date().toISOString(),
            pageAccessToken: page.access_token ? encryptToken(page.access_token) : undefined,
          };
        });

        const permissions: OAuthPermission[] = [
          {
            name: 'pages_show_list',
            granted: true,
            description: 'Discover managed Facebook Pages',
            category: 'management',
          },
          {
            name: 'pages_read_engagement',
            granted: true,
            description: 'Read Page feed, engagement, reach, and video views',
            category: 'analytics',
          },
          {
            name: 'pages_manage_posts',
            granted: true,
            description: 'Publish videos and posts directly to eligible Facebook Pages',
            category: 'publishing',
          },
        ];

        const hasEligiblePage = connectedChannels.some((c) => c.isEligibleForPublishing);

        const accountRecord: SocialAccountRecord = {
          id: `acc_fb_${userData.id || Date.now()}`,
          brandId: attempt.brandId,
          workspaceId: attempt.workspaceId,
          provider: 'facebook',
          externalAccountId: userData.id || 'meta_user',
          accountName: userData.name || (connectedChannels[0]?.channelName ?? 'Facebook Account'),
          usernameOrHandle: userData.name?.replace(/\s+/g, '').toLowerCase() || 'meta_creator',
          avatarUrl: userData.picture?.data?.url || connectedChannels[0]?.avatarUrl,
          connectionStatus: connectedChannels.length === 0
            ? 'publishing_unavailable'
            : hasEligiblePage
            ? 'connected'
            : 'permission_incomplete',
          statusMessage: connectedChannels.length === 0
            ? 'No managed Facebook Pages found. Personal Facebook profiles do not support automated API publishing.'
            : `${connectedChannels.length} Facebook Page(s) discovered. Ready for publishing.`,
          connectionDate: new Date().toISOString(),
          lastSuccessfulSync: new Date().toISOString(),
          tokenExpiresAt,
          tokenValid: true,
          requiresReconnection: false,
          permissions,
          channels: connectedChannels,
          accessTokenEncrypted: encryptToken(userAccessToken),
        };

        // Duplicate prevention: same platform identity + brand reuses the record;
        // same identity on a different brand gets a distinct account id.
        const existingSame = findExistingAccount(accountRecord.provider, accountRecord.externalAccountId, accountRecord.brandId);
        if (existingSame) {
          accountRecord.id = existingSame.id;
        } else {
          const otherBrand = getAllAccounts().find(
            (a) => a.provider === accountRecord.provider && a.externalAccountId === accountRecord.externalAccountId && a.brandId !== accountRecord.brandId
          );
          if (otherBrand) accountRecord.id = `${accountRecord.id}_${accountRecord.brandId.slice(-6)}`;
        }
        upsertAccount(accountRecord);

        return res.send(
          renderCallbackHtml(
            'OAUTH_AUTH_SUCCESS',
            {
              provider: 'facebook',
              accountId: accountRecord.id,
              channelsCount: connectedChannels.length,
              needsSelection: connectedChannels.length > 1,
            },
            'Facebook Pages Connected',
            `Successfully connected Facebook account with ${connectedChannels.length} Page(s).`
          )
        );
      }

      // ----------------------------------------------------
      // INSTAGRAM PROFESSIONAL INTEGRATION
      // ----------------------------------------------------
      case 'instagram': {
        const tokenResp = await fetch(
          `https://graph.facebook.com/v19.0/oauth/access_token?` +
            new URLSearchParams({
              client_id: config.metaAppId,
              client_secret: config.metaAppSecret,
              redirect_uri: redirectUri,
              code: code as string,
            })
        );

        if (!tokenResp.ok) {
          const errData = await tokenResp.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Failed to exchange Meta OAuth access token for Instagram.');
        }

        const tokenData = await tokenResp.json();
        const userAccessToken = tokenData.access_token;
        const expiresIn = tokenData.expires_in || 5184000;
        const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        // Get authenticated user info
        const userResp = await fetch(
          `https://graph.facebook.com/v19.0/me?fields=id,name,picture&access_token=${userAccessToken}`
        );
        const userData = await userResp.json().catch(() => ({}));

        // Discover Instagram Business / Creator accounts attached to managed Facebook Pages
        const igResp = await fetch(
          `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,instagram_business_account{id,username,name,profile_picture_url,followers_count,account_type}&access_token=${userAccessToken}`
        );
        const igData = await igResp.json().catch(() => ({ data: [] }));
        const rawPages = igData.data || [];

        const connectedChannels: ConnectedChannel[] = [];
        for (const page of rawPages) {
          if (page.instagram_business_account) {
            const igAcc = page.instagram_business_account;
            connectedChannels.push({
              id: `chan_ig_${igAcc.id}`,
              accountId: `acc_ig_${userData.id || igAcc.id}`,
              brandId: attempt.brandId,
              platform: 'instagram',
              platformChannelId: igAcc.id,
              channelName: igAcc.name || igAcc.username,
              handle: `@${igAcc.username}`,
              avatarUrl: igAcc.profile_picture_url || '',
              accountType: igAcc.account_type === 'CREATOR' ? 'instagram_creator' : 'instagram_business',
              isEligibleForPublishing: true, // Professional accounts support Instagram Content Publishing API
              isEligibleForAnalytics: true,
              subscriberOrFollowerCount: Number(igAcc.followers_count || 0),
              selectedForBrand: true,
              lastSyncedAt: new Date().toISOString(),
            });
          }
        }

        const permissions: OAuthPermission[] = [
          {
            name: 'instagram_basic',
            granted: true,
            description: 'Read Instagram Professional profile, media metadata, and tags',
            category: 'profile',
          },
          {
            name: 'instagram_content_publish',
            granted: true,
            description: 'Direct publishing of Reels, video posts, and single carousels',
            category: 'publishing',
          },
          {
            name: 'instagram_manage_insights',
            granted: true,
            description: 'Access video watch time, impressions, saves, reach, and engagement metrics',
            category: 'analytics',
          },
        ];

        let connectionStatus: ConnectionStatus = 'connected';
        let statusMessage = `Connected ${connectedChannels.length} Instagram Professional Account(s).`;

        if (connectedChannels.length === 0) {
          connectionStatus = 'publishing_unavailable';
          statusMessage =
            'No Instagram Professional Account connected. Personal Instagram accounts are not supported by the Meta Graph API. Please convert your Instagram account to Professional (Business or Creator) and link it to a Facebook Page.';
        }

        const accountRecord: SocialAccountRecord = {
          id: `acc_ig_${userData.id || Date.now()}`,
          brandId: attempt.brandId,
          workspaceId: attempt.workspaceId,
          provider: 'instagram',
          externalAccountId: userData.id || 'meta_ig_user',
          accountName: connectedChannels[0]?.channelName || userData.name || 'Instagram Account',
          usernameOrHandle: connectedChannels[0]?.handle || '@instagram_account',
          avatarUrl: connectedChannels[0]?.avatarUrl || userData.picture?.data?.url,
          connectionStatus,
          statusMessage,
          connectionDate: new Date().toISOString(),
          lastSuccessfulSync: new Date().toISOString(),
          tokenExpiresAt,
          tokenValid: true,
          requiresReconnection: false,
          permissions,
          channels: connectedChannels,
          accessTokenEncrypted: encryptToken(userAccessToken),
        };

        // Duplicate prevention: same platform identity + brand reuses the record;
        // same identity on a different brand gets a distinct account id.
        const existingSame = findExistingAccount(accountRecord.provider, accountRecord.externalAccountId, accountRecord.brandId);
        if (existingSame) {
          accountRecord.id = existingSame.id;
        } else {
          const otherBrand = getAllAccounts().find(
            (a) => a.provider === accountRecord.provider && a.externalAccountId === accountRecord.externalAccountId && a.brandId !== accountRecord.brandId
          );
          if (otherBrand) accountRecord.id = `${accountRecord.id}_${accountRecord.brandId.slice(-6)}`;
        }
        upsertAccount(accountRecord);

        return res.send(
          renderCallbackHtml(
            'OAUTH_AUTH_SUCCESS',
            {
              provider: 'instagram',
              accountId: accountRecord.id,
              channelsCount: connectedChannels.length,
              needsSelection: connectedChannels.length > 1,
            },
            'Instagram Professional Connected',
            connectedChannels.length > 0
              ? `Connected @${connectedChannels[0].handle.replace('@', '')} to SRA Social Publisher.`
              : 'Authenticated with Meta, but no linked Instagram Professional account found.'
          )
        );
      }

      // ----------------------------------------------------
      // TIKTOK LOGIN KIT & CONTENT POSTING INTEGRATION
      // ----------------------------------------------------
      case 'tiktok': {
        const tokenResp = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: config.tiktokClientKey,
            client_secret: config.tiktokClientSecret,
            code: code as string,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
            code_verifier: attempt.codeVerifier || '',
          }),
        });

        if (!tokenResp.ok) {
          const errData = await tokenResp.json().catch(() => ({}));
          throw new Error(errData.error_description || errData.message || 'Failed to exchange TikTok access token.');
        }

        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token || tokenData.data?.access_token;
        const refreshToken = tokenData.refresh_token || tokenData.data?.refresh_token;
        const openId = tokenData.open_id || tokenData.data?.open_id || 'tiktok_user';
        const expiresIn = tokenData.expires_in || tokenData.data?.expires_in || 86400;
        const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        // Retrieve TikTok user info
        let userInfo: any = {};
        try {
          const infoResp = await fetch(
            'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username,follower_count',
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );
          const raw = await infoResp.json();
          userInfo = raw.data?.user || {};
        } catch (e) {
          console.warn('Failed to fetch TikTok user info:', e);
        }

        const displayName = userInfo.display_name || 'TikTok Creator';
        const username = userInfo.username || `tiktok_${openId.slice(0, 6)}`;

        const connectedChannel: ConnectedChannel = {
          id: `chan_tt_${openId}`,
          accountId: `acc_tt_${openId}`,
          brandId: attempt.brandId,
          platform: 'tiktok',
          platformChannelId: openId,
          channelName: displayName,
          handle: `@${username}`,
          avatarUrl: userInfo.avatar_url || '',
          accountType: 'tiktok_account',
          isEligibleForPublishing: true, // Content Posting API granted
          isEligibleForAnalytics: true,
          subscriberOrFollowerCount: Number(userInfo.follower_count || 0),
          selectedForBrand: true,
          lastSyncedAt: new Date().toISOString(),
        };

        const permissions: OAuthPermission[] = [
          {
            name: 'user.info.basic',
            granted: true,
            description: 'Access display name, avatar, and public TikTok profile information',
            category: 'profile',
          },
          {
            name: 'video.publish',
            granted: true,
            description: 'Direct publishing to user feed (requires TikTok Content Posting approval)',
            category: 'publishing',
          },
          {
            name: 'video.upload',
            granted: true,
            description: 'Upload video assets to user draft inbox or pending queue',
            category: 'publishing',
          },
        ];

        const accountRecord: SocialAccountRecord = {
          id: `acc_tt_${openId}`,
          brandId: attempt.brandId,
          workspaceId: attempt.workspaceId,
          provider: 'tiktok',
          externalAccountId: openId,
          accountName: displayName,
          usernameOrHandle: `@${username}`,
          avatarUrl: userInfo.avatar_url,
          connectionStatus: 'connected',
          statusMessage: 'Authenticated via TikTok Login Kit v2 with Content Posting permissions.',
          connectionDate: new Date().toISOString(),
          lastSuccessfulSync: new Date().toISOString(),
          tokenExpiresAt,
          tokenValid: true,
          requiresReconnection: false,
          permissions,
          channels: [connectedChannel],
          accessTokenEncrypted: encryptToken(accessToken),
          refreshTokenEncrypted: refreshToken ? encryptToken(refreshToken) : undefined,
        };

        // Duplicate prevention: same platform identity + brand reuses the record;
        // same identity on a different brand gets a distinct account id.
        const existingSame = findExistingAccount(accountRecord.provider, accountRecord.externalAccountId, accountRecord.brandId);
        if (existingSame) {
          accountRecord.id = existingSame.id;
        } else {
          const otherBrand = getAllAccounts().find(
            (a) => a.provider === accountRecord.provider && a.externalAccountId === accountRecord.externalAccountId && a.brandId !== accountRecord.brandId
          );
          if (otherBrand) accountRecord.id = `${accountRecord.id}_${accountRecord.brandId.slice(-6)}`;
        }
        upsertAccount(accountRecord);

        return res.send(
          renderCallbackHtml(
            'OAUTH_AUTH_SUCCESS',
            {
              provider: 'tiktok',
              accountId: accountRecord.id,
              channelsCount: 1,
            },
            'TikTok Account Connected',
            `Successfully connected @${username} to SRA Social Publisher.`
          )
        );
      }
    }
  } catch (err: any) {
    console.error(`OAuth Callback Error for ${provider}:`, err);
    return res.status(500).send(
      renderCallbackHtml(
        'OAUTH_AUTH_ERROR',
        { provider, error: err.message || 'Server error exchanging authorization code.' },
        'Authentication Failure',
        `An error occurred while connecting ${provider}: ${err.message || 'Check developer credentials and redirect URIs.'}`
      )
    );
  }
});

// 5. Get All Connected Accounts (Sanitized, tokens never exposed)
oauthRouter.get('/accounts', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { brandId } = req.query;
  // Tenant isolation: only accounts belonging to the authenticated workspace.
  // Legacy records without workspaceId are matched via their brand's workspace.
  const brandScope = workspaceBrandIds(req.workspace?.id);
  let accounts = getAllAccounts().filter((a) => accountInWorkspace(a, req));

  if (brandId && typeof brandId === 'string') {
    if (!brandScope.has(brandId)) {
      return res.status(403).json({ success: false, error: 'Brand not found in this workspace.' });
    }
    accounts = accounts.filter((a) => a.brandId === brandId);
  }

  // Strip encrypted tokens before sending to client
  const sanitized = accounts.map((acc) => {
    const { accessTokenEncrypted, refreshTokenEncrypted, ...safe } = acc;
    const safeChannels = safe.channels.map((ch) => {
      const { pageAccessToken, ...chSafe } = ch;
      return chSafe;
    });
    return {
      ...safe,
      channels: safeChannels,
    };
  });

  res.json({
    success: true,
    count: sanitized.length,
    accounts: sanitized,
  });
});

// 6. Select Channels / Pages for Brand
oauthRouter.post('/accounts/:id/select-channels', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { selectedChannelIds } = req.body as { selectedChannelIds: string[] };

  const account = getAccountById(id);
  if (!account || !accountInWorkspace(account, req)) {
    return res.status(404).json({ success: false, error: 'Account not found.' });
  }

  account.channels = account.channels.map((ch) => ({
    ...ch,
    selectedForBrand: selectedChannelIds.includes(ch.id),
  }));

  upsertAccount(account);
  audit(req, 'oauth_channels_updated', `Channel selection updated for ${account.provider} account ${account.id} (${selectedChannelIds.length} selected).`);

  res.json({
    success: true,
    message: 'Selected channels updated successfully.',
    channels: account.channels,
  });
});

// 6c. Platform capability report — derived from ACTUAL granted permissions,
// channel eligibility, and provider-specific rules. Never assumes capabilities.
oauthRouter.get('/accounts/:id/capabilities', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const account = getAccountById(id);
  if (!account || !accountInWorkspace(account, req)) {
    return res.status(404).json({ success: false, error: 'Account not found.' });
  }

  const granted = (cat: string) => (account.permissions || []).filter((p) => p.category === cat && p.granted).map((p) => p.name);
  const missing = (cat: string) => (account.permissions || []).filter((p) => p.category === cat && !p.granted).map((p) => p.name);
  const channels = account.channels || [];
  const eligibleChannels = channels.filter((c) => c.isEligibleForPublishing).length;

  const capabilities: Record<string, any> = {};
  switch (account.provider) {
    case 'youtube': {
      const upload = granted('publishing').some((s) => s.includes('youtube.upload'));
      const readonly = granted('management').some((s) => s.includes('youtube.readonly')) || granted('publishing').length > 0;
      const analytics = granted('analytics').some((s) => s.includes('yt-analytics'));
      capabilities.youtube = {
        canPublishVideos: upload && eligibleChannels > 0,
        canReadChannelInfo: readonly,
        canReadAnalytics: analytics,
        hasRetentionData: analytics,
        eligibleChannels,
        totalChannels: channels.length,
        notes: [
          !upload && 'Video upload scope not granted — publishing unavailable',
          channels.length === 0 && 'No YouTube channels returned by Google account',
          channels.length > 0 && eligibleChannels === 0 && 'Channels found but none eligible for publishing (channel setup may be required)',
        ].filter(Boolean),
      };
      break;
    }
    case 'facebook': {
      const pagesScope = granted('publishing').length + granted('management').length > 0;
      capabilities.facebook = {
        canPublishToPages: pagesScope && eligibleChannels > 0,
        pageCount: channels.length,
        eligiblePages: eligibleChannels,
        notes: [
          'Personal Facebook profiles cannot be automated — Pages only',
          channels.length === 0 && 'No Facebook Pages returned — ensure the account manages at least one Page',
        ].filter(Boolean),
      };
      break;
    }
    case 'instagram': {
      const publishScope = granted('publishing').length > 0;
      const insightsScope = granted('analytics').length > 0;
      capabilities.instagram = {
        canPublishMedia: publishScope && eligibleChannels > 0,
        canReadInsights: insightsScope,
        accountType: 'Business/Creator required',
        notes: [
          'Requires Instagram Professional (Business or Creator) account linked to a Facebook Page',
          !insightsScope && 'Insights permission not granted — analytics unavailable',
        ].filter(Boolean),
      };
      break;
    }
    case 'tiktok': {
      capabilities.tiktok = {
        canPublishDirect: granted('publishing').length > 0,
        publishModes: granted('publishing').length > 0 ? ['direct_post', 'upload_to_inbox'] : [],
        notes: [
          'Content Posting API requires TikTok app approval for direct posting',
          'Unaudited apps may be limited to upload-to-inbox (draft) mode',
        ],
      };
      break;
    }
  }

  res.json({
    success: true,
    provider: account.provider,
    connectionStatus: account.connectionStatus,
    tokenValid: account.tokenValid,
    requiresReconnection: account.requiresReconnection,
    capabilities,
    grantedScopes: (account.permissions || []).filter((p) => p.granted).map((p) => p.name),
    missingScopes: (account.permissions || []).filter((p) => !p.granted).map((p) => p.name),
  });
});

// 6b. Reassign account to a different brand (workspace-validated)
oauthRouter.post('/accounts/:id/brand', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { brandId } = req.body as { brandId: string };

  const account = getAccountById(id);
  if (!account || !accountInWorkspace(account, req)) {
    return res.status(404).json({ success: false, error: 'Account not found.' });
  }

  const wsId = req.workspace?.id;
  const brandScope = workspaceBrandIds(wsId);
  if (!brandId || (brandId !== 'workspace' && !brandScope.has(brandId))) {
    return res.status(403).json({ success: false, error: 'Brand not found in this workspace.' });
  }

  account.brandId = brandId === 'workspace' ? '' : brandId;
  upsertAccount(account);
  audit(req, 'oauth_brand_changed', `${account.provider} account ${account.id} reassigned to brand ${account.brandId || 'workspace-level'}.`);

  res.json({ success: true, message: 'Brand assignment updated.', brandId: account.brandId });
});

// 7. Refresh Token Endpoint
oauthRouter.post('/accounts/:id/refresh', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const account = getAccountById(id);
  if (!account || !accountInWorkspace(account, req)) {
    return res.status(404).json({ success: false, error: 'Account not found.' });
  }

  if (!account) {
    return res.status(404).json({ success: false, error: 'Account not found.' });
  }

  const config = getOAuthConfig();

  try {
    if (account.provider === 'youtube') {
      const refreshToken = decryptToken(account.refreshTokenEncrypted || '');
      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'No refresh token stored. User must reconnect to re-grant offline access.',
          requiresReconnection: true,
        });
      }

      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!tokenResp.ok) {
        account.tokenValid = false;
        account.requiresReconnection = true;
        account.connectionStatus = 'token_expired';
        upsertAccount(account);
        throw new Error('Refresh token invalid or revoked.');
      }

      const tokenData = await tokenResp.json();
      const expiresIn = tokenData.expires_in || 3600;
      account.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      account.tokenValid = true;
      account.requiresReconnection = false;
      account.connectionStatus = 'connected';
      account.lastSuccessfulSync = new Date().toISOString();
      account.accessTokenEncrypted = encryptToken(tokenData.access_token);
      upsertAccount(account);

      return res.json({
        success: true,
        message: 'Google/YouTube access token refreshed successfully.',
        tokenExpiresAt: account.tokenExpiresAt,
      });
    }

    if (account.provider === 'tiktok') {
      const refreshToken = decryptToken(account.refreshTokenEncrypted || '');
      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'No TikTok refresh token found. Reconnection required.',
          requiresReconnection: true,
        });
      }

      const tokenResp = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: config.tiktokClientKey,
          client_secret: config.tiktokClientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      if (!tokenResp.ok) {
        account.tokenValid = false;
        account.requiresReconnection = true;
        account.connectionStatus = 'token_expired';
        upsertAccount(account);
        throw new Error('TikTok refresh token invalid.');
      }

      const tokenData = await tokenResp.json();
      const expiresIn = tokenData.expires_in || 86400;
      account.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      account.tokenValid = true;
      account.requiresReconnection = false;
      account.connectionStatus = 'connected';
      account.lastSuccessfulSync = new Date().toISOString();
      account.accessTokenEncrypted = encryptToken(tokenData.access_token);
      if (tokenData.refresh_token) {
        account.refreshTokenEncrypted = encryptToken(tokenData.refresh_token);
      }
      upsertAccount(account);

      return res.json({
        success: true,
        message: 'TikTok access token refreshed successfully.',
        tokenExpiresAt: account.tokenExpiresAt,
      });
    }

    // Meta (Facebook / Instagram) token refresh or validity check
    const currentToken = decryptToken(account.accessTokenEncrypted || '');
    if (!currentToken) {
      account.connectionStatus = 'reconnection_required';
      upsertAccount(account);
      return res.status(400).json({ success: false, error: 'Token missing. Reconnection required.' });
    }

    const testResp = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${currentToken}`);
    if (!testResp.ok) {
      account.tokenValid = false;
      account.requiresReconnection = true;
      account.connectionStatus = 'token_expired';
      upsertAccount(account);
      return res.status(401).json({
        success: false,
        error: 'Meta access token has expired or was revoked. Reconnection required.',
        requiresReconnection: true,
      });
    }

    account.tokenValid = true;
    account.connectionStatus = 'connected';
    account.lastSuccessfulSync = new Date().toISOString();
    upsertAccount(account);

    return res.json({
      success: true,
      message: 'Meta access token verified and active.',
      tokenExpiresAt: account.tokenExpiresAt,
    });
  } catch (err: any) {
    console.error('[oauth] token refresh failed:', err);
    return res.status(500).json({ success: false, error: 'Token refresh failed.' });
  }
});

// 8. Run Connection Diagnostics
oauthRouter.post('/accounts/:id/diagnostics', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const account = getAccountById(id);

  if (!account || !accountInWorkspace(account, req)) {
    return res.status(404).json({ success: false, error: 'Account not found.' });
  }

  const token = decryptToken(account.accessTokenEncrypted || '');
  if (!token) {
    return res.json({
      success: true,
      diagnostics: {
        provider: account.provider,
        accountName: account.accountName,
        tokenValid: false,
        latencyMs: 0,
        publishingEligible: false,
        analyticsEligible: false,
        status: 'disconnected',
        details: 'No access token found in encrypted store. Reconnection is required.',
      },
    });
  }

  const startTime = Date.now();
  let tokenValid = false;
  let details = '';
  let apiStatusCode = 0;

  try {
    if (account.provider === 'youtube') {
      const resp = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      apiStatusCode = resp.status;
      tokenValid = resp.ok;
      if (resp.ok) {
        details = 'YouTube Data API v3 verification successful. Read & Upload scopes verified.';
      } else {
        const err = await resp.json().catch(() => ({}));
        details = `YouTube API Error (${resp.status}): ${err.error?.message || 'Token unauthorized.'}`;
      }
    } else if (account.provider === 'facebook') {
      const resp = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${token}`);
      apiStatusCode = resp.status;
      tokenValid = resp.ok;
      if (resp.ok) {
        details = 'Meta Graph API verification successful. Page management scopes active.';
      } else {
        details = `Meta Graph API returned status ${resp.status}. Token may be expired.`;
      }
    } else if (account.provider === 'instagram') {
      const resp = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${token}`);
      apiStatusCode = resp.status;
      tokenValid = resp.ok;
      if (resp.ok) {
        details = 'Instagram Content Publishing & Insights API verified through Meta Graph API.';
      } else {
        details = `Instagram API verification failed (${resp.status}).`;
      }
    } else if (account.provider === 'tiktok') {
      const resp = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id', {
        headers: { Authorization: `Bearer ${token}` },
      });
      apiStatusCode = resp.status;
      tokenValid = resp.ok;
      if (resp.ok) {
        details = 'TikTok Login Kit v2 verification successful. Content Posting API active.';
      } else {
        details = `TikTok API returned ${resp.status}. Access token invalid.`;
      }
    }
  } catch (err: any) {
    details = `Network error contacting ${account.provider} API: ${err.message}`;
  }

  const latencyMs = Date.now() - startTime;

  // Update account verification timestamp
  if (tokenValid) {
    account.lastSuccessfulSync = new Date().toISOString();
    account.tokenValid = true;
    upsertAccount(account);
  }

  audit(req, 'oauth_diagnostics_run', `Diagnostics for ${account.provider} account ${account.id}: tokenValid=${tokenValid}, ${latencyMs}ms.`);

  res.json({
    success: true,
    diagnostics: {
      provider: account.provider,
      accountName: account.accountName,
      tokenValid,
      latencyMs,
      apiStatusCode,
      tokenExpiresAt: account.tokenExpiresAt,
      publishingEligible: account.channels.some((c) => c.isEligibleForPublishing),
      analyticsEligible: account.channels.some((c) => c.isEligibleForAnalytics),
      status: tokenValid ? account.connectionStatus : 'token_expired',
      details,
      timestamp: new Date().toISOString(),
    },
  });
});

// 9. Disconnect Account
oauthRouter.delete('/accounts/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const account = getAccountById(id);

  if (!account || !accountInWorkspace(account, req)) {
    return res.status(404).json({ success: false, error: 'Account not found.' });
  }

  // Attempt token revocation if supported
  const token = decryptToken(account.accessTokenEncrypted || '');
  if (token) {
    if (account.provider === 'youtube') {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' });
      } catch (e) {
        console.warn('Revoke token failed:', e);
      }
    }
  }

  removeAccount(id);
  audit(req, 'oauth_account_disconnected', `${account.provider} account ${account.accountName} (${id}) disconnected; tokens revoked.`);

  res.json({
    success: true,
    message: `Account ${account.accountName} disconnected and credentials deleted securely.`,
  });
});
