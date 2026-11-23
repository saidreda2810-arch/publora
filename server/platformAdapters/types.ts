import type { SocialAccountRecord, ConnectedChannel } from '../oauthStore.ts';

export interface PublishVideoInput {
  post: any;
  wsData: any;
  /** OAuth account record (tokens) resolved for post.brandId + platform */
  oauthAccount: SocialAccountRecord;
  /** Selected channel for this brand, if the provider models sub-accounts */
  channel?: ConnectedChannel;
  /** Absolute path to the local video file */
  videoPath: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface PublishOutcome {
  ok: boolean;
  /** Set ONLY when the platform confirmed the publish/upload */
  platformPostId?: string;
  url?: string;
  /** True when the request may have reached the platform but the response was lost */
  uncertain?: boolean;
  /** Machine error code + human message */
  error?: string;
  message?: string;
  /** Provider-side processing state (e.g. TikTok 'processing') */
  providerStatus?: string;
}

export interface PlatformAdapter {
  readonly platform: string;
  publishVideo(input: PublishVideoInput): Promise<PublishOutcome>;
}
