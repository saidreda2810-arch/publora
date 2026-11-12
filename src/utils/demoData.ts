import {
  Brand,
  Project,
  SocialAccount,
  ContentCategory,
  VideoAsset,
  VideoAnalytics,
  ScheduledPost,
  Recommendation,
  Experiment,
  AutopilotConfig,
  AutopilotAuditLog,
} from '../types';

/**
 * Clean workspace initializer.
 * Adheres strictly to the Zero-Fabrication Policy:
 * Zero fake brands, zero imaginary metrics, zero dummy customer data.
 */
export function generateBenchmarkData(): {
  brands: Brand[];
  projects: Project[];
  accounts: SocialAccount[];
  categories: ContentCategory[];
  videos: VideoAsset[];
  analytics: VideoAnalytics[];
  posts: ScheduledPost[];
  recommendations: Recommendation[];
  experiments: Experiment[];
  autopilotConfig: AutopilotConfig;
  auditLogs: AutopilotAuditLog[];
} {
  return {
    brands: [],
    projects: [],
    accounts: [],
    categories: [],
    videos: [],
    analytics: [],
    posts: [],
    recommendations: [],
    experiments: [],
    autopilotConfig: {
      mode: 'assisted',
      emergencyPaused: false,
      permissions: {
        useRetentionAnalysis: true,
        autoOptimizePublishingTimes: true,
        optimizeCaptionsTitlesTags: true,
        adjustPublishingFrequency: false,
      },
      safeguards: {
        maxDailyPostsPerChannel: 3,
        minSpacingHours: 4,
        blackoutHoursStart: 0,
        blackoutHoursEnd: 7,
        neverRescheduleInFlight: true,
        requireApprovalBelowConfidence: 70,
      },
      totalAutonomousActions: 0,
    },
    auditLogs: [],
  };
}
