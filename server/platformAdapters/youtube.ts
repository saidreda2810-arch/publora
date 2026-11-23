import fs from 'fs';
import type { PlatformAdapter, PublishVideoInput, PublishOutcome } from './types.ts';
import { ensureAccessToken } from './tokens.ts';

/**
 * YouTube Data API v3 — videos.insert with resumable upload.
 * ok:true only after YouTube returns the created video resource (id confirmed).
 */
export const youtubeAdapter: PlatformAdapter = {
  platform: 'youtube',

  async publishVideo(input: PublishVideoInput): Promise<PublishOutcome> {
    const token = await ensureAccessToken(input.oauthAccount);
    const { post } = input;

    const snippet: any = {
      title: (post.title || 'Untitled').slice(0, 100),
      description: (post.description || post.caption || '').slice(0, 5000),
      tags: Array.isArray(post.tags) ? post.tags.slice(0, 30) : undefined,
      categoryId: post.youtubeCategoryId || '22', // People & Blogs default
    };
    if (post.privacyStatus) {
      // allow caller-supplied privacy; default private for safety
      snippet.privacyStatus = undefined;
    }
    const status: any = {
      privacyStatus: post.privacyStatus || 'private',
      selfDeclaredMadeForKids: false,
    };
    if (post.scheduledTime && post.privacyStatus === 'private') {
      // publishAt only valid with private; keep it honest
      status.publishAt = new Date(post.scheduledTime).toISOString();
    }

    const metadata = JSON.stringify({ snippet, status });
    const videoSize = input.fileSizeBytes;

    // 1) Initiate resumable session
    const initResp = await fetch(
      'https://upload.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(videoSize),
          'X-Upload-Content-Type': input.mimeType || 'video/mp4',
        },
        body: metadata,
      }
    );

    if (!initResp.ok) {
      const errBody = await initResp.text().catch(() => '');
      return mapHttpError(initResp.status, errBody);
    }

    const uploadUrl = initResp.headers.get('location');
    if (!uploadUrl) {
      return { ok: false, error: 'youtube_no_upload_url', message: 'YouTube did not return a resumable upload URL.' };
    }

    // 2) Upload the bytes
    const buf = fs.readFileSync(input.videoPath);
    let uploadResp: Response;
    try {
      uploadResp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': input.mimeType || 'video/mp4',
          'Content-Length': String(buf.length),
        },
        body: new Uint8Array(buf),
      });
    } catch (e: any) {
      // Connection lost mid-upload — outcome uncertain, must reconcile via videos.list
      return { ok: false, uncertain: true, error: 'network_error', message: `Upload connection lost: ${e?.message || e}` };
    }

    if (!uploadResp.ok) {
      const errBody = await uploadResp.text().catch(() => '');
      return mapHttpError(uploadResp.status, errBody);
    }

    const video: any = await uploadResp.json().catch(() => ({}));
    if (!video?.id) {
      return { ok: false, uncertain: true, error: 'youtube_no_id', message: 'YouTube accepted upload but returned no video id — reconcile manually.' };
    }

    return {
      ok: true,
      platformPostId: video.id,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      providerStatus: video.status?.uploadStatus || 'processed',
      message: 'Video uploaded to YouTube.',
    };
  },
};

function mapHttpError(status: number, body: string): PublishOutcome {
  const lower = body.toLowerCase();
  if (status === 401 || lower.includes('invalid credentials') || lower.includes('unauthorized')) {
    return { ok: false, error: 'auth_expired', message: `YouTube auth failed (${status}) — reconnect the account.` };
  }
  if (status === 403) {
    if (lower.includes('quota') || lower.includes('rate')) {
      return { ok: false, error: 'rate_limit', message: `YouTube quota/rate limit (${status}) — retry later.` };
    }
    return { ok: false, error: 'permission', message: `YouTube permission denied (${status}) — check youtube.upload scope.` };
  }
  if (status === 429) {
    return { ok: false, error: 'rate_limit', message: 'YouTube rate limit (429) — retry scheduled.' };
  }
  if (status === 400 || status === 422) {
    if (lower.includes('media') || lower.includes('codec') || lower.includes('format') || lower.includes('duration') || lower.includes('size')) {
      return { ok: false, error: 'invalid_media', message: `YouTube rejected media (${status}).` };
    }
    return { ok: false, error: 'permanent_rejection', message: `YouTube rejected the request (${status}): ${body.slice(0, 200)}` };
  }
  if (status >= 500) {
    return { ok: false, uncertain: true, error: 'platform_temporary', message: `YouTube server error (${status}) — outcome uncertain.` };
  }
  return { ok: false, error: `http_${status}`, message: `YouTube API error ${status}: ${body.slice(0, 200)}` };
}
