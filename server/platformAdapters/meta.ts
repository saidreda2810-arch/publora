import fs from 'fs';
import path from 'path';
import type { PlatformAdapter, PublishVideoInput, PublishOutcome } from './types.ts';
import { ensureAccessToken } from './tokens.ts';
import { decryptToken } from '../oauthStore.ts';

const GRAPH = 'https://graph.facebook.com/v19.0';

/**
 * Meta publishing:
 *  - facebook: Page Reels 3-phase upload (start → transfer → finish) on /{page-id}/video_reels
 *  - instagram: IG User Reels — container creation (needs public video_url) → media_publish
 * ok:true only after Graph API confirms the video/container id.
 */
export const metaAdapter: PlatformAdapter = {
  platform: 'meta',

  async publishVideo(input: PublishVideoInput): Promise<PublishOutcome> {
    const channel = input.channel;
    if (!channel) {
      return { ok: false, error: 'no_channel', message: 'No eligible Meta channel selected for this brand.' };
    }
    if (channel.platform === 'instagram' || channel.accountType?.startsWith('instagram')) {
      return publishInstagramReel(input, channel);
    }
    return publishFacebookReel(input, channel);
  },
};

async function publishFacebookReel(input: PublishVideoInput, channel: any): Promise<PublishOutcome> {
  // Page access token is stored per-channel (encrypted); fall back to user token
  const token = channel.pageAccessToken
    ? decryptToken(channel.pageAccessToken)
    : await ensureAccessToken(input.oauthAccount);
  const pageId = channel.platformChannelId;
  if (!pageId) return { ok: false, error: 'no_channel_id', message: 'Facebook channel has no page id.' };

  const { post } = input;
  const caption = (post.description || post.caption || post.title || '').slice(0, 2200);

  // Phase 1: start — declare metadata, get video_id + upload_url
  const startResp = await fetch(`${GRAPH}/${pageId}/video_reels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      upload_phase: 'start',
      access_token: token,
      video_state: 'PUBLISHED',
      description: caption,
      title: (post.title || 'Untitled').slice(0, 255),
    }),
  });
  const startBody: any = await startResp.json().catch(() => ({}));
  if (!startResp.ok || !startBody.video_id || !startBody.upload_url) {
    return mapGraphError(startResp.status, startBody, 'facebook_reels_start');
  }
  const { video_id: videoId, upload_url: uploadUrl } = startBody;

  // Phase 2: transfer — upload the file bytes
  const buf = fs.readFileSync(input.videoPath);
  let transferResp: Response;
  try {
    transferResp = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: `OAuth ${token}`, 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(buf),
    });
  } catch (e: any) {
    return { ok: false, uncertain: true, error: 'network_error', message: `Facebook Reels upload interrupted: ${e?.message || e}` };
  }
  if (!transferResp.ok) {
    const errBody = await transferResp.text().catch(() => '');
    return mapGraphError(transferResp.status, errBody, 'facebook_reels_transfer');
  }

  // Phase 3: finish — trigger processing
  const finishResp = await fetch(`${GRAPH}/${pageId}/video_reels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      upload_phase: 'finish',
      access_token: token,
      video_id: videoId,
      video_state: 'PUBLISHED',
    }),
  });
  const finishBody: any = await finishResp.json().catch(() => ({}));
  if (!finishResp.ok) {
    return mapGraphError(finishResp.status, finishBody, 'facebook_reels_finish');
  }

  return {
    ok: true,
    platformPostId: videoId,
    url: `https://www.facebook.com/${pageId}/videos/${videoId}`,
    providerStatus: finishBody.status || 'processing',
    message: 'Facebook Reel submitted for publishing.',
  };
}

async function publishInstagramReel(input: PublishVideoInput, channel: any): Promise<PublishOutcome> {
  const token = await ensureAccessToken(input.oauthAccount);
  const igUserId = channel.platformChannelId;
  if (!igUserId) return { ok: false, error: 'no_channel_id', message: 'Instagram channel has no user id.' };

  // IG Content Publishing requires a PUBLIC video_url — serve from APP_URL/uploads
  const appUrl = (process.env.APP_URL || process.env.SHARED_APP_URL || '').replace(/\/$/, '');
  const fileName = path.basename(input.videoPath);
  if (!appUrl) {
    return { ok: false, error: 'no_public_url', message: 'APP_URL not configured — Instagram requires a public video URL.' };
  }
  const videoUrl = `${appUrl}/uploads/${encodeURIComponent(fileName)}`;

  const { post } = input;
  const caption = (post.description || post.caption || post.title || '').slice(0, 2200);

  // Step 1: create media container (REELS)
  const containerResp = await fetch(`${GRAPH}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: token,
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: true,
    }),
  });
  const containerBody: any = await containerResp.json().catch(() => ({}));
  if (!containerResp.ok || !containerBody.id) {
    return mapGraphError(containerResp.status, containerBody, 'instagram_container');
  }
  const containerId = containerBody.id;

  // Step 2: publish the container (poll status briefly — IG processes async)
  const deadline = Date.now() + 60_000;
  let status = 'IN_PROGRESS';
  while (Date.now() < deadline) {
    const statusResp = await fetch(`${GRAPH}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`);
    const statusBody: any = await statusResp.json().catch(() => ({}));
    status = statusBody?.status_code || 'IN_PROGRESS';
    if (status === 'FINISHED') break;
    if (status === 'ERROR' || status === 'EXPIRED') {
      return { ok: false, error: 'permanent_rejection', message: `Instagram rejected the media container (${status}).` };
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (status !== 'FINISHED') {
    return { ok: false, uncertain: true, error: 'platform_temporary', message: 'Instagram container still processing after 60s — reconcile manually.' };
  }

  const publishResp = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: token, creation_id: containerId }),
  });
  const publishBody: any = await publishResp.json().catch(() => ({}));
  if (!publishResp.ok || !publishBody.id) {
    return mapGraphError(publishResp.status, publishBody, 'instagram_publish');
  }

  return {
    ok: true,
    platformPostId: publishBody.id,
    url: `https://www.instagram.com/reel/${publishBody.id}/`,
    message: 'Instagram Reel published.',
  };
}

function mapGraphError(status: number, body: any, stage: string): PublishOutcome {
  const msg = String(body?.error?.message || JSON.stringify(body)).toLowerCase();
  const code = body?.error?.code;
  if (status === 401 || status === 190 || msg.includes('token') || msg.includes('session')) {
    return { ok: false, error: 'auth_expired', message: `Meta auth failed at ${stage} (${status}) — reconnect the account.` };
  }
  if (status === 403 || msg.includes('permission') || msg.includes('scope')) {
    return { ok: false, error: 'permission', message: `Meta permission denied at ${stage} (${status}) — check required permissions.` };
  }
  if (status === 429 || msg.includes('rate') || msg.includes('limit')) {
    return { ok: false, error: 'rate_limit', message: 'Meta rate limit — retry scheduled.' };
  }
  if (status >= 500) {
    return { ok: false, uncertain: true, error: 'platform_temporary', message: `Meta server error at ${stage} (${status}) — outcome uncertain.` };
  }
  if (msg.includes('media') || msg.includes('format') || msg.includes('codec') || msg.includes('duration') || msg.includes('size') || msg.includes('resolution')) {
    return { ok: false, error: 'invalid_media', message: `Meta rejected media at ${stage}: ${msg.slice(0, 200)}` };
  }
  return { ok: false, error: `meta_${stage}_${code || status}`, message: `Meta API error at ${stage} (${status}): ${msg.slice(0, 200)}` };
}
