import { ensureAccessToken } from './platformAdapters/tokens.ts';
import type { SocialAccountRecord } from './oauthStore.ts';
import { query } from './db/client.ts';

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

// ---------------------------------------------------------------- persistence
// platform_content_items (migration 0012) — durable mirror so Queue/History/
// Calendar can read synced content without a live provider call per view.

async function workspaceUuid(legacyId?: string): Promise<string | null> {
  if (!legacyId) return null;
  const r = await query('SELECT id FROM workspaces WHERE legacy_id=$1', [legacyId]);
  return r.rows[0]?.id ?? null;
}

/** Upsert fetched items into platform_content_items. Best-effort — never throws. */
export async function persistPlatformItems(account: SocialAccountRecord, items: PlatformVideoItem[]): Promise<void> {
  const wsId = await workspaceUuid(account.workspaceId);
  if (!wsId || !items.length) return;
  for (const it of items) {
    try {
      await query(
        `INSERT INTO platform_content_items
           (workspace_id, social_account_id, platform, channel_id, platform_video_id,
            title, url, thumbnail_url, status, privacy_status, scheduled_at, published_at,
            duration_sec, views, likes, comments, payload, last_synced_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,now(),now())
         ON CONFLICT (social_account_id, platform_video_id) DO UPDATE SET
           title=EXCLUDED.title, url=EXCLUDED.url, thumbnail_url=EXCLUDED.thumbnail_url,
           status=EXCLUDED.status, privacy_status=EXCLUDED.privacy_status,
           scheduled_at=EXCLUDED.scheduled_at, published_at=EXCLUDED.published_at,
           duration_sec=EXCLUDED.duration_sec, views=EXCLUDED.views, likes=EXCLUDED.likes,
           comments=EXCLUDED.comments, payload=EXCLUDED.payload,
           last_synced_at=now(), updated_at=now()`,
        [wsId, account.id, it.platform, it.channelId ?? null, it.platformVideoId,
         it.title, it.url ?? null, it.thumbnailUrl ?? null, it.status, it.privacyStatus ?? null,
         it.scheduledAt ?? null, it.publishedAt ?? null, it.durationSec ?? null,
         it.views ?? null, it.likes ?? null, it.comments ?? null,
         JSON.stringify(it)],
      );
    } catch (e: any) {
      console.warn('[platformContent] persist failed for', it.platformVideoId, e?.message || e);
    }
  }
}

/** Read stored items — used as fallback when live provider call fails. */
export async function listStoredPlatformItems(
  account: SocialAccountRecord,
  opts: { status?: 'all' | 'scheduled' | 'published' } = {},
): Promise<PlatformVideoItem[]> {
  const wsId = await workspaceUuid(account.workspaceId);
  if (!wsId) return [];
  const conds = ['workspace_id=$1', 'social_account_id=$2'];
  const vals: any[] = [wsId, account.id];
  if (opts.status === 'scheduled') conds.push(`status='scheduled'`);
  else if (opts.status === 'published') conds.push(`status='published'`);
  const r = await query(
    `SELECT platform, channel_id, platform_video_id, title, url, thumbnail_url, status,
            scheduled_at, published_at, duration_sec, views, likes, comments
     FROM platform_content_items WHERE ${conds.join(' AND ')}
     ORDER BY COALESCE(scheduled_at, published_at) DESC NULLS LAST LIMIT 200`,
    vals,
  );
  return r.rows.map((row: any) => ({
    platform: row.platform,
    accountId: account.id,
    channelId: row.channel_id ?? undefined,
    platformVideoId: row.platform_video_id,
    title: row.title,
    url: row.url ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    status: row.status,
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : undefined,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : undefined,
    durationSec: row.duration_sec ?? undefined,
    views: row.views != null ? Number(row.views) : undefined,
    likes: row.likes ?? undefined,
    comments: row.comments ?? undefined,
  }));
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

    // Persist the full fetched set (pre-filter) so stored rows cover all statuses.
    if (result.ok && result.items.length) {
      await persistPlatformItems(account, result.items).catch(() => {});
    }
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
