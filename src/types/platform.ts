// Core platform & publishing primitives
export type Platform = 'youtube' | 'instagram' | 'tiktok' | 'facebook';

export type SchedulingMode = 'manual' | 'assisted' | 'autopilot';

export type PostStatus = 'draft' | 'scheduled' | 'optimizing' | 'publishing' | 'published' | 'failed' | 'paused';

export type MetricSource = 'official_api' | 'calculated_estimate' | 'csv_import';

export type ConnectionStatus =
  | 'not_connected'
  | 'connecting'
  | 'authorization_pending'
  | 'connected'
  | 'permission_incomplete'
  | 'token_expired'
  | 'reconnection_required'
  | 'publishing_unavailable'
  | 'analytics_unavailable'
  | 'disconnected'
  | 'error';

export interface PlatformAvailabilitySpec {
  platform: Platform;
  name: string;
  metrics: {
    views: boolean;
    reach: boolean;
    impressions: boolean;
    watchDuration: boolean;
    watchPercentage: boolean;
    fullRetentionCurve: boolean;
    milestoneViews: boolean;
    rewatchScore: boolean;
  };
  limitationsNote: string;
  officialDocUrl: string;
}

export interface PlatformContentVariant {
  platform: Platform;
  title?: string;
  caption: string;
  hashtags: string[];
  seoTags?: string[];
  soundOrAudioCue?: string;
  callToAction: string;
  approved: boolean;
  edited: boolean;
}
