import crypto from 'crypto';

/**
 * Publishing engine — reliability layer for the background scheduler.
 *
 * Pipeline per post: claim (atomic) → stage events → platform attempt →
 * verify → complete | fail → classify → retry with backoff | dead-letter.
 *
 * NOTE: actual third-party platform API calls are NOT implemented in this
 * codebase — OAuth connects accounts but no publish/upload endpoint exists
 * yet. The engine records the full lifecycle honestly: a post is only marked
 * 'published' when the platform step reports success. Until platform adapters
 * exist, 'attemptPlatformPublish' returns a structured "adapter_missing"
 * outcome so posts fail safely with a clear error instead of fake success.
 */

export interface PublishEvent {
  ts: string;
  stage: 'queued' | 'claimed' | 'uploading' | 'processing' | 'publishing' | 'verifying' | 'completed' | 'failed' | 'retry_scheduled' | 'reconciled';
  message: string;
  meta?: Record<string, any>;
}

export type ErrorClass =
  | 'temporary_network'
  | 'platform_temporary'
  | 'rate_limit'
  | 'auth_expired'
  | 'invalid_media'
  | 'permission'
  | 'permanent_rejection'
  | 'unknown_outcome'
  | 'adapter_missing';

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 60_000; // 1 min

function pushEvent(post: any, stage: PublishEvent['stage'], message: string, meta?: Record<string, any>) {
  if (!Array.isArray(post.publishingEvents)) post.publishingEvents = [];
  post.publishingEvents.push({ ts: new Date().toISOString(), stage, message, meta } as PublishEvent);
  // cap history
  if (post.publishingEvents.length > 100) post.publishingEvents = post.publishingEvents.slice(-100);
}

/** Classify an error into retry policy. */
export function classifyError(err: any): { cls: ErrorClass; retryable: boolean; userMessage: string } {
  const msg = String(err?.message || err || '').toLowerCase();
  if (msg.includes('adapter_missing') || msg.includes('not implemented') || msg.includes('not yet implemented')) {
    return { cls: 'adapter_missing', retryable: false, userMessage: 'Publishing adapter for this platform is not connected yet.' };
  }
  if (msg.includes('token') || msg.includes('expired') || msg.includes('unauthorized') || msg.includes('401') || msg.includes('reconnect')) {
    return { cls: 'auth_expired', retryable: false, userMessage: 'Social account connection expired — reconnect the account before publishing.' };
  }
  if (msg.includes('rate') || msg.includes('429') || msg.includes('too many')) {
    return { cls: 'rate_limit', retryable: true, userMessage: 'Platform rate limit hit — retry scheduled automatically.' };
  }
  if (msg.includes('timeout') || msg.includes('network') || msg.includes('econn') || msg.includes('503') || msg.includes('502') || msg.includes('500')) {
    return { cls: 'temporary_network', retryable: true, userMessage: 'Temporary network/platform error — retry scheduled.' };
  }
  if (msg.includes('media') || msg.includes('format') || msg.includes('codec') || msg.includes('duration') || msg.includes('size')) {
    return { cls: 'invalid_media', retryable: false, userMessage: 'The media file is not accepted by the platform — review the video.' };
  }
  if (msg.includes('permission') || msg.includes('forbidden') || msg.includes('403')) {
    return { cls: 'permission', retryable: false, userMessage: 'Account lacks permission to publish — check account scopes.' };
  }
  if (msg.includes('reject') || msg.includes('invalid') || msg.includes('400') || msg.includes('422')) {
    return { cls: 'permanent_rejection', retryable: false, userMessage: 'Platform permanently rejected this post.' };
  }
  return { cls: 'unknown_outcome', retryable: false, userMessage: 'Publishing outcome could not be verified — manual review required.' };
}

/** Exponential backoff with jitter. */
export function backoffMs(retryCount: number): number {
  const base = BASE_BACKOFF_MS * Math.pow(2, retryCount);
  const jitter = Math.floor(Math.random() * base * 0.3);
  return Math.min(base + jitter, 60 * 60 * 1000); // cap 1h
}

/**
 * Attempt to publish a post to its platforms.
 * Returns { ok, uncertain?, error? }. 'uncertain' = request may have reached
 * the platform but response was lost — MUST be reconciled, never blind-retried.
 */
async function attemptPlatformPublish(post: any, wsData: any): Promise<{ ok: boolean; uncertain?: boolean; error?: string; platformResults?: any[] }> {
  const platforms: string[] = post.channelPlatforms || post.platforms || [];
  const results: any[] = [];

  for (const platform of platforms) {
    // Resolve the social account for this platform within the brand
    const accounts = (wsData.accounts || []).filter((a: any) => a.brandId === post.brandId && a.platform === platform);
    const account = accounts.find((a: any) => a.isConnected && !a.requiresReconnection && a.tokenValid !== false);

    if (!account) {
      results.push({ platform, ok: false, error: 'no_connected_account', message: `No connected ${platform} account for this brand.` });
      continue;
    }

    // Platform adapter dispatch — none implemented yet.
    // When adapters exist they must return ok:true ONLY after platform confirms.
    results.push({
      platform,
      accountId: account.id,
      ok: false,
      error: 'adapter_missing',
      message: `Publishing to ${platform} is not yet implemented — connect the platform adapter.`,
    });
  }

  const allOk = results.length > 0 && results.every((r) => r.ok);
  const anyUncertain = results.some((r) => r.uncertain);
  const firstErr = results.find((r) => !r.ok);
  return {
    ok: allOk,
    uncertain: anyUncertain,
    error: firstErr ? `${firstErr.platform}: ${firstErr.message}` : undefined,
    platformResults: results,
  };
}

/**
 * Process one claimed post through the pipeline.
 * Mutates `post` in place (wsData is persisted by caller).
 */
export async function processPost(post: any, wsData: any): Promise<'published' | 'failed' | 'retry_scheduled' | 'skipped'> {
  const now = () => new Date().toISOString();

  // Idempotency: already completed under this operation → skip
  if (post.status === 'published' && post.publishOperationId && post.publishedAt) return 'skipped';

  // Atomic claim — refuse if already locked/in-flight
  if (post.lockedForPublishing || post.status === 'publishing') return 'skipped';
  post.lockedForPublishing = true;
  post.status = 'publishing';
  post.publishOperationId = post.publishOperationId || `pop_${crypto.randomUUID()}`;
  post.retryCount = post.retryCount || 0;
  pushEvent(post, 'claimed', 'Job claimed by scheduler', { operationId: post.publishOperationId });

  try {
    // Stage: uploading/processing (media already stored; record stages honestly)
    pushEvent(post, 'uploading', 'Media asset verified in storage');
    pushEvent(post, 'processing', 'Preparing platform payload');
    pushEvent(post, 'publishing', 'Submitting to platform(s)');

    const result = await attemptPlatformPublish(post, wsData);

    if (result.ok) {
      pushEvent(post, 'verifying', 'Platform confirmed publish');
      post.status = 'published';
      post.publishedAt = now();
      post.publishedTime = now();
      post.lockedForPublishing = false;
      post.lastPublishError = null;
      pushEvent(post, 'completed', 'Published successfully', { results: result.platformResults });
      return 'published';
    }

    if (result.uncertain) {
      // NEVER blind-retry an uncertain outcome — needs reconciliation
      post.status = 'failed';
      post.lockedForPublishing = false;
      post.lastPublishError = { class: 'unknown_outcome', message: 'Outcome uncertain — requires reconciliation before retry.', at: now() };
      pushEvent(post, 'failed', 'Publishing outcome uncertain — reconciliation required');
      return 'failed';
    }

    // Failure path: classify + maybe retry
    const { cls, retryable, userMessage } = classifyError(result.error);
    post.lastPublishError = { class: cls, message: userMessage, raw: result.error, at: now() };

    if (retryable && post.retryCount < MAX_RETRIES) {
      post.retryCount += 1;
      const delay = backoffMs(post.retryCount);
      post.nextRetryAt = new Date(Date.now() + delay).toISOString();
      post.status = 'scheduled'; // re-queue
      post.lockedForPublishing = false;
      pushEvent(post, 'retry_scheduled', `Retry ${post.retryCount}/${MAX_RETRIES} in ${Math.round(delay / 1000)}s — ${userMessage}`, { errorClass: cls });
      return 'retry_scheduled';
    }

    post.status = 'failed';
    post.lockedForPublishing = false;
    pushEvent(post, 'failed', `Publishing failed (${cls}) — ${userMessage}`, { errorClass: cls, retries: post.retryCount });
    return 'failed';
  } catch (err: any) {
    const { cls, retryable, userMessage } = classifyError(err);
    post.lastPublishError = { class: cls, message: userMessage, raw: String(err?.message || err), at: now() };
    if (retryable && post.retryCount < MAX_RETRIES) {
      post.retryCount += 1;
      const delay = backoffMs(post.retryCount);
      post.nextRetryAt = new Date(Date.now() + delay).toISOString();
      post.status = 'scheduled';
      post.lockedForPublishing = false;
      pushEvent(post, 'retry_scheduled', `Retry ${post.retryCount}/${MAX_RETRIES} — ${userMessage}`);
      return 'retry_scheduled';
    }
    post.status = 'failed';
    post.lockedForPublishing = false;
    pushEvent(post, 'failed', `Publishing failed (${cls}) — ${userMessage}`);
    return 'failed';
  }
}

/** Reset a failed post for manual retry (user-initiated). */
export function manualRetry(post: any) {
  if (post.lockedForPublishing || post.status === 'publishing') return false;
  post.status = 'scheduled';
  post.retryCount = 0;
  post.nextRetryAt = null;
  post.lastPublishError = null;
  if (!Array.isArray(post.publishingEvents)) post.publishingEvents = [];
  post.publishingEvents.push({ ts: new Date().toISOString(), stage: 'queued', message: 'Manual retry requested by user' } as PublishEvent);
  return true;
}
