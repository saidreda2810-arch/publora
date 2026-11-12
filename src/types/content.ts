import { Platform, SchedulingMode, PostStatus, MetricSource } from './platform';

// Brands, projects, video assets, analytics & publishing entities
export interface Brand {
  id: string;
  name: string;
  description?: string;
  color: string;
  avatarUrl?: string;
  industry?: string;
  targetAudience?: string;
  // Extended fields (all optional — backward compatible)
  logoUrl?: string;
  coverImageUrl?: string;
  customIndustry?: string;
  website?: string;
  secondaryColor?: string;
  brandGuidelines?: string;
  voiceProfile?: {
    personality?: string;
    communicationStyle?: string;
    formality?: string;
    vocabulary?: string;
    audienceRelationship?: string;
    avoidPhrases?: string;
  };
  timezone?: string;
  defaultLanguage?: string;
  status?: 'active' | 'archived';
  updatedAt?: string;
  createdAt: string;
}

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';

export interface Project {
  id: string;
  brandId: string;
  name: string;
  description?: string;
  status?: ProjectStatus;
  startDate?: string;
  endDate?: string;
  memberIds?: string[];
  updatedAt?: string;
  createdAt: string;
}

export interface ContentCategory {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

export interface VideoAsset {
  id: string;
  brandId: string;
  projectId?: string;
  categoryId?: string;
  title: string;
  description: string;
  durationSeconds: number; // e.g., 30s, 60s
  videoUrl?: string;
  thumbnailUrl?: string;
  aspectRatio: '9:16' | '16:9' | '1:1';
  hookType: 'question' | 'shock_stat' | 'story' | 'visual_reveal' | 'bold_claim' | 'problem_solution';
  editingPace: 'fast' | 'medium' | 'slow';
  sceneChangesCount: number;
  tags: string[];
  createdAt: string;
  // Real upload metadata (populated by the Add Video wizard)
  fileUrl?: string;
  fileName?: string;
  fileSizeBytes?: number;
  format?: string;
  resolution?: string;
  fps?: number | null;
  codec?: string | null;
  hasAudio?: boolean | null;
  orientation?: 'landscape' | 'portrait' | 'square';
  accountIds?: string[];
  processingStatus?: 'uploaded' | 'analyzed' | 'ready';
  // Library organization
  folderId?: string | null;
  isFavorite?: boolean;
  isArchived?: boolean;
  updatedAt?: string;
}

export interface VideoFolder {
  id: string;
  name: string;
  parentId?: string | null;
  createdAt: string;
}

export interface RetentionPoint {
  second: number;
  percent: number; // 0 to 100%
  dropOffRate?: number; // % drop from previous second
  eventNote?: string; // e.g. "Hook ends", "Scene switch", "CTA starts"
}

export interface VideoAnalytics {
  id: string;
  videoId: string;
  postId: string;
  platform: Platform;
  snapshotAge: '15m' | '1h' | '3h' | '6h' | '12h' | '24h' | '48h' | '7d' | '30d' | 'live';
  source: MetricSource;
  syncedAt: string;
  
  // Layer A: Views & Reach
  views: number;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  followersGained: number;
  profileVisits: number;

  // Layer B: Watch Behavior
  avgWatchDurationSeconds: number;
  avgPercentageWatched: number;
  totalWatchTimeSeconds: number;
  completionRate: number;
  rewatchScore: number;
  earlyAbandonmentRate: number; // 0-3s drop
  retentionPoints: RetentionPoint[];

  // Layer C: Watch-Pattern Flags
  patternFlags: {
    weakOpeningHook: boolean;
    strongMiddleSection: boolean;
    suddenDropScene: boolean;
    suddenDropSecond?: number;
    highCompletionRate: boolean;
    repeatViewPattern: boolean;
    highViewsLowInteraction: boolean;
    lowReachHighRetention: boolean;
  };
}

export interface ScheduledPost {
  id: string;
  brandId: string;
  projectId?: string;
  videoId: string;
  channelPlatforms: Platform[];
  title: string;
  caption: string;
  hashtags: string[];
  scheduledTime: string; // ISO string
  publishedTime?: string;
  status: PostStatus;
  mode: SchedulingMode;
  optimizedByAutopilot: boolean;
  originalScheduledTime?: string;
  rescheduleReason?: string;
  lockedForPublishing: boolean; // Protects in-flight posts
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  // Publishing engine reliability fields
  publishOperationId?: string;
  publishingEvents?: { ts: string; stage: string; message: string; meta?: any }[];
  retryCount?: number;
  nextRetryAt?: string | null;
  lastPublishError?: { class: string; message: string; raw?: string; at: string } | null;
  updatedAt?: string;
  // Approval workflow
  reviewStatus?: 'none' | 'pending' | 'approved' | 'rejected' | 'changes_requested';
  reviewNotes?: { ts: string; by: string; action: string; note?: string }[];
  assignedTo?: string;
  reviewerId?: string;
  approvalDeadline?: string;
  createdAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  brandId: string;
  startDate: string; // ISO date
  endDate: string;
  color: string;
  ownerId?: string;
  goals?: string[];
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  milestones?: { id: string; title: string; dueDate: string; done: boolean }[];
  postIds?: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface ContentPillar {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: string;
}

export interface ContentIdea {
  id: string;
  title: string;
  description?: string;
  brandId?: string;
  pillarId?: string;
  campaignId?: string;
  goal?: 'awareness' | 'engagement' | 'sales';
  status: 'idea' | 'draft' | 'scheduled' | 'used' | 'archived';
  suggestedDate?: string;
  linkedPostId?: string;
  aiGenerated?: boolean;
  createdAt: string;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName?: string;
  body: string;
  createdAt: string;
}

export interface CalendarSavedView {
  id: string;
  name: string;
  filters: Record<string, any>;
  createdAt: string;
}

export interface CalendarSettings {
  timezone: string;
  weekStartsOn: 0 | 1 | 6;
  workingDays: number[];
  workingHoursStart: number;
  workingHoursEnd: number;
  defaultView: 'month' | 'week' | 'day' | 'list' | 'agenda';
  density: 'comfortable' | 'compact' | 'dense';
  autoRefreshSec: number;
  notifications?: {
    upcoming: boolean;
    failures: boolean;
    approvals: boolean;
    conflicts: boolean;
  };
}

export interface Recommendation {
  id: string;
  brandId: string;
  videoId?: string;
  category: 'hook' | 'video_length' | 'editing' | 'pacing' | 'storytelling' | 'caption' | 'title' | 'hashtags' | 'publishing_time' | 'frequency';
  type: 'analysis' | 'diagnosis' | 'recommendation' | 'experiment' | 'learning';
  title: string;
  observation: string;
  reasoning: string;
  suggestedAction: string;
  confidenceScore: number; // 0 to 100
  evidenceLevel: 'strong' | 'moderate' | 'preliminary';
  status: 'pending' | 'approved' | 'applied' | 'dismissed' | 'validated';
  createdAt: string;
  appliedAt?: string;
  outcomeResult?: string;
}

export interface Experiment {
  id: string;
  brandId: string;
  name: string;
  variableTested: 'publishing_time' | 'opening_hook' | 'caption_style' | 'title_format' | 'video_duration';
  hypothesis: string;
  variantA: {
    name: string;
    description: string;
    sampleSize: number;
    avgCompletionRate: number;
    avgViews: number;
    avgRetention3s: number;
  };
  variantB: {
    name: string;
    description: string;
    sampleSize: number;
    avgCompletionRate: number;
    avgViews: number;
    avgRetention3s: number;
  };
  status: 'draft' | 'running' | 'concluded';
  winningVariant?: 'A' | 'B' | 'inconclusive';
  confidencePercent: number;
  startDate: string;
  endDate?: string;
  conclusionNotes?: string;
}

export interface TimeSlotScore {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  hour: number; // 0 - 23
  compositeScore: number; // 0 - 100
  historicalViews: number;
  watchDurationScore: number;
  retentionScore: number;
  engagementScore: number;
  followerActivityScore: number;
  sampleCount: number;
  confidence: 'high' | 'medium' | 'low';
}
