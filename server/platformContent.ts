import { ensureAccessToken } from './platformAdapters/tokens.ts';
import type { SocialAccountRecord } from './oauthStore.ts';

/**
 * Read-only listing of content that already exists ON the platform
 * (scheduled uploads + published posts) — distinct from internal queue posts.
 * Used to surface "what's live/scheduled on the connected account" in
 * Queue / History / Calendar.
 */

export interface PlatformVideoItem {
  platform: string;
  accountId: string;
  channelId?: string;
  platformVideoId: string;
  title: string;
  url?: string;
  thumbnailUrl?: string;
  /** ISO timestamps */
  publishedAt?: string;
  scheduledAt?: string;
  /** 'scheduled' | 'published' | 'processing' | 'unknown' */
  status: string;
  views?: number;
  likes?: number;
  comments?: number;
  durationSec?: number;
  privacyStatus?: string;
}

export interface PlatformContentResult {
  ok: boolean;
  items: PlatformVideoItem[];
  error?: string;
  /** true when the provider can't list content with granted scopes */
  unsupported?: boolean;
}

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

function ytDurationToSec(iso?: string): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  return (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0');
}

async function listYouTube(account: SocialAccountRecord, max = 50): Promise<PlatformContentResult> {
  const token = await ensureAccessToken(account);
  const headers = { Authorization: `Bearer ${token}` };

  // Resolve channel id — prefer stored channel, else ask YouTube for mine.
  let channelId = (account.channels || []).find((c) => c.platform === 'youtube' && c.platformChannelId)?.platformChannelId;
  if (!channelId) {
    const cr = await fetch(`${YT_BASE}/channels?part=id&mine=true`, { headers });
    const cj = await cr.json().catch(() => ({}));
    if (!cr.ok) return { ok: false, items: [], error: `YouTube channels.list failed (${cr.status}): ${cj?.error?.message || 'unknown'}` };
    channelId = cj.items?.[0]?.id;
    if (!channelId) return { ok: true, items: [] };
  }

  // videos.list doesn't accept channelId for user uploads; use search instead.
  const searchUrl = `${YT_BASE}/search?part=id,snippet&channelId=${channelId}&type=video&order=date&maxResults=${max}`;
  const sr = await fetch(searchUrl, { headers });
  const sj = await sr.json().catch(() => ({}));
  if (!sr.ok) return { ok: false, items: [], error: `YouTube search.list failed (${sr.status}): ${sj?.error?.message || 'unknown'}` };
  const ids = (sj.items || []).map((i: any) => i.id?.videoId).filter(Boolean);
  if (!ids.length) return { ok: true, items: [] };

  const vr = await fetch(`${YT_BASE}/videos?part=snippet,status,statistics,contentDetails&id=${ids.join(',')}`, { headers });
  const vj = await vr.json().catch(() => ({}));
  if (!vr.ok) return { ok: false, items: [], error: `YouTube videos.list failed (${vr.status}): ${vj?.error?.message || 'unknown'}` };

  const items: PlatformVideoItem[] = (vj.items || []).map((v: any) => {
    const publishAt = v.status?.publishAt ? new Date(v.status.publishAt) : null;
    const publishedAt = v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : null;
    const isScheduled = !!publishAt && publishAt.getTime() > Date.now();
    const privacy = v.status?.privacyStatus || 'private';
    // Skip plain private/unlisted uploads that were never scheduled or published publicly
    const isPublicish = privacy === 'public' || privacy === 'unlisted' || isScheduled;
    const status = isScheduled ? 'scheduled' : isPublicish ? 'published' : 'private';
    return {
      platform: 'youtube',
      accountId: account.id,
      channelId,
      platformVideoId: v.id,
      title: v.snippet?.title || 'Untitled',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnailUrl: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url,
      publishedAt: publishedAt?.toISOString(),
      scheduledAt: isScheduled ? publishAt!.toISOString() : undefined,
      status,
      views: v.statistics?.viewCount ? parseInt(v.statistics.viewCount, 10) : undefined,
      likes: v.statistics?.likeCount ? parseInt(v.statistics.likeCount, 10) : undefined,
      comments: v.statistics?.commentCount ? parseInt(v.statistics.commentCount, 10) : undefined,
      durationSec: ytDurationToSec(v.contentDetails?.duration),
      privacyStatus: privacy,
    };
  }).filter((i: PlatformVideoItem) => i.status !== 'private');

  return { ok: true, items };
}

async function listTikTok(account: SocialAccountRecord): Promise<PlatformContentResult> {
  // TikTok video list requires the `video.list` scope which the app does not
  // request (only video.publish/video.upload + user.info.basic). Report honestly.
  const hasScope = (account.permissions || []).some((p) => p.name.includes('video.list') && p.granted);
  if (!hasScope) {
    return { ok: false, items: [], unsupported: true, error: 'TikTok video listing requires the video.list scope — reconnect with expanded permissions to enable.' };
  }
  return { ok: false, items: [], unsupported: true, error: 'TikTok content listing not implemented for granted scopes.' };
}

async function listMeta(account: SocialAccountRecord): Promise<PlatformContentResult> {
  const token = await ensureAccessToken(account);
  const items: PlatformVideoItem[] = [];
  const errors: string[] = [];

  for (const ch of account.channels || []) {
    try {
      if (ch.platform === 'facebook' && ch.platformChannelId) {
        // Page videos — published only (Meta has no scheduled-video API)
        const r = await fetch(`https://graph.facebook.com/v19.0/${ch.platformChannelId}/videos?fields=id,title,description,created_time,permalink_url,thumbnails,length&limit=50&access_token=${token}`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { errors.push(`fb/${ch.channelName}: ${j?.error?.message || r.status}`); continue; }
        for (const v of j.data || []) {
          items.push({
            platform: 'facebook', accountId: account.id, channelId: ch.platformChannelId,
            platformVideoId: v.id, title: v.title || v.description?.slice(0, 80) || 'Untitled',
            url: v.permalink_url, thumbnailUrl: v.thumbnails?.data?.[0]?.uri,
            publishedAt: v.created_time, status: 'published', durationSec: v.length,
          });
        }
      } else if (ch.platform === 'instagram' && ch.platformChannelId) {
        const r = await fetch(`https://graph.facebook.com/v19.0/${ch.platformChannelId}/media?fields=id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count&limit=50&access_token=${token}`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { errors.push(`ig/${ch.channelName}: ${j?.error?.message || r.status}`); continue; }
        for (const m of j.data || []) {
          items.push({
            platform: 'instagram', accountId: account.id, channelId: ch.platformChannelId,
            platformVideoId: m.id, title: m.caption?.slice(0, 100) || 'Untitled',
            url: m.permalink, thumbnailUrl: m.media_url,
            publishedAt: m.timestamp, status: 'published',
            likes: m.like_count, comments: m.comments_count,
          });
        }
      }
    } catch (e: any) {
      errors.push(`${ch.platform}: ${e?.message || e}`);
    }
  }
  if (!items.length && errors.length) return { ok: false, items, error: errors.join('; ') };
  return { ok: true, items, ...(errors.length ? { error: errors.join('; ') } : {}) };
}

export async function listPlatformVideos(
  account: SocialAccountRecord,
  opts: { status?: 'all' | 'scheduled' | 'published'; max?: number } = {},
): Promise<PlatformContentResult> {
  try {
    let result: PlatformContentResult;
    if (account.provider === 'youtube') result = await listYouTube(account, opts.max);
    else if (account.provider === 'tiktok') result = await listTikTok(account);
    else result = await listMeta(account);

    if (opts.status && opts.status !== 'all') {
      result.items = result.items.filter((i) => i.status === opts.status);
    }
    return result;
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/401|unauthorized|token|reconnect/i.test(msg)) {
      return { ok: false, items: [], error: msg };
    }
    return { ok: false, items: [], error: msg };
  }
}
