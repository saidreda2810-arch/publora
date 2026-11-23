import fs from 'fs';
import path from 'path';
import {
  getAllAccounts,
  type SocialAccountRecord,
  type SocialProvider,
  type ConnectedChannel,
} from '../oauthStore.ts';
import type { PlatformAdapter, PublishOutcome, PublishVideoInput } from './types.ts';
import { youtubeAdapter } from './youtube.ts';
import { tiktokAdapter } from './tiktok.ts';
import { metaAdapter } from './meta.ts';

const ADAPTERS: Record<string, PlatformAdapter> = {
  youtube: youtubeAdapter,
  tiktok: tiktokAdapter,
  facebook: metaAdapter,
  instagram: metaAdapter,
  meta: metaAdapter,
};

const UPLOADS_DIR = path.resolve(process.cwd(), 'data', 'uploads');

/**
 * Resolve the local video file for a post.
 * post.videoId → wsData.videos[] → fileName/fileUrl → data/uploads/<name>
 */
export function resolveVideoFile(post: any, wsData: any): { videoPath: string; mimeType: string; size: number } | null {
  const video = (wsData.videos || []).find((v: any) => v.id === post.videoId);
  if (!video) return null;
  const candidates = [
    video.fileName ? path.join(UPLOADS_DIR, video.fileName) : null,
    video.fileUrl ? path.join(UPLOADS_DIR, path.basename(video.fileUrl)) : null,
  ].filter(Boolean) as string[];
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) return null;
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  return { videoPath: filePath, mimeType: mime, size: stat.size };
}

/** Pick the OAuth account + channel for a brand/platform. */
function resolveOAuthTarget(post: any, platform: string): { account: SocialAccountRecord; channel?: ConnectedChannel } | null {
  const provider = platform === 'meta' ? undefined : (platform as SocialProvider);
  const candidates = getAllAccounts().filter((a) => {
    if (a.brandId !== post.brandId) return false;
    if (provider && a.provider !== provider) return false;
    if (!provider && a.provider !== 'facebook' && a.provider !== 'instagram') return false;
    if (a.tokenValid === false || a.requiresReconnection) return false;
    return true;
  });
  if (!candidates.length) return null;

  // Prefer an account that has a selected+eligible channel for this platform
  for (const acc of candidates) {
    const channels = (acc.channels || []).filter(
      (c) => c.selectedForBrand && c.isEligibleForPublishing && (!provider || c.platform === provider || (provider === undefined && (c.platform === 'facebook' || c.platform === 'instagram')))
    );
    if (channels.length) return { account: acc, channel: channels[0] };
  }
  // Fall back to first account; let adapter report missing channel honestly
  return { account: candidates[0] };
}

/**
 * Publish a post to one platform via its real adapter.
 * Returns PublishOutcome — ok:true ONLY on platform-confirmed success.
 */
export async function publishToPlatform(post: any, wsData: any, platform: string): Promise<PublishOutcome> {
  const adapter = ADAPTERS[platform];
  if (!adapter) {
    return { ok: false, error: 'adapter_missing', message: `No publishing adapter for platform '${platform}'.` };
  }

  const target = resolveOAuthTarget(post, platform);
  if (!target) {
    return { ok: false, error: 'no_connected_account', message: `No connected ${platform} OAuth account with valid tokens for this brand.` };
  }

  const media = resolveVideoFile(post, wsData);
  if (!media) {
    return { ok: false, error: 'media_not_found', message: `Video file for post.videoId='${post.videoId}' not found in storage.` };
  }
  if (media.size === 0) {
    return { ok: false, error: 'invalid_media', message: 'Video file is empty.' };
  }

  const input: PublishVideoInput = {
    post,
    wsData,
    oauthAccount: target.account,
    channel: target.channel,
    videoPath: media.videoPath,
    mimeType: media.mimeType,
    fileSizeBytes: media.size,
  };

  try {
    return await adapter.publishVideo(input);
  } catch (e: any) {
    const msg = String(e?.message || e);
    // Token/auth errors → auth_expired classification via message keywords
    if (/token|401|unauthorized|reconnect/i.test(msg)) {
      return { ok: false, error: 'auth_expired', message: msg };
    }
    if (/timeout|network|econn|fetch failed/i.test(msg)) {
      return { ok: false, uncertain: true, error: 'network_error', message: msg };
    }
    return { ok: false, error: 'adapter_error', message: msg };
  }
}
