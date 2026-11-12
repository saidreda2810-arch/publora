import { PlatformAvailabilitySpec } from '../types';

export const PLATFORM_SPECS: PlatformAvailabilitySpec[] = [
  {
    platform: 'youtube',
    name: 'YouTube & Shorts',
    metrics: {
      views: true,
      reach: true,
      impressions: true,
      watchDuration: true,
      watchPercentage: true,
      fullRetentionCurve: true,
      milestoneViews: true,
      rewatchScore: true,
    },
    limitationsNote: 'Official YouTube Analytics API supports average view duration, percentage watched, and second-by-second audience retention curves for video IDs.',
    officialDocUrl: 'https://developers.google.com/youtube/analytics/channel_reports',
  },
  {
    platform: 'instagram',
    name: 'Instagram Reels',
    metrics: {
      views: true,
      reach: true,
      impressions: true,
      watchDuration: true,
      watchPercentage: true,
      fullRetentionCurve: false, // Explicitly FALSE: IG API does not provide 1s retention curve
      milestoneViews: false,
      rewatchScore: true,
    },
    limitationsNote: 'Instagram Graph API provides average and total Reels watch time, reach, and plays, but does NOT export granular second-by-second retention curves.',
    officialDocUrl: 'https://about.fb.com/news/2023/04/instagram-reels-trending-audio-and-gifts-updates/',
  },
  {
    platform: 'tiktok',
    name: 'TikTok Business API',
    metrics: {
      views: true,
      reach: true,
      impressions: true,
      watchDuration: true,
      watchPercentage: true,
      fullRetentionCurve: false, // Only milestones 25%, 50%, 75%, 100%
      milestoneViews: true,
      rewatchScore: false,
    },
    limitationsNote: 'TikTok Business Analytics provides average play time and view milestones (25%, 50%, 75%, 100%), not continuous curves.',
    officialDocUrl: 'https://business-api.tiktok.com/portal/docs/supported-metrics-for-a-dimension-in-basic-reports/v1.3',
  },
  {
    platform: 'facebook',
    name: 'Facebook Video',
    metrics: {
      views: true,
      reach: true,
      impressions: true,
      watchDuration: true,
      watchPercentage: true,
      fullRetentionCurve: false,
      milestoneViews: true,
      rewatchScore: false,
    },
    limitationsNote: 'Facebook Graph API exposes 3-second views, 10-second views, and aggregate watch time where permitted by page roles.',
    officialDocUrl: 'https://developers.facebook.com/docs/graph-api/reference/video/video_insights/',
  },
];

export function getPlatformColor(platform: string): { bg: string; text: string; border: string; accent: string } {
  switch (platform) {
    case 'youtube':
      return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', accent: '#ef4444' };
    case 'instagram':
      return { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/30', accent: '#ec4899' };
    case 'tiktok':
      return { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/30', accent: '#14b8a6' };
    case 'facebook':
      return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', accent: '#3b82f6' };
    default:
      return { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30', accent: '#64748b' };
  }
}
