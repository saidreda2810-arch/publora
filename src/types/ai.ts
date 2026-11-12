import { Platform, SchedulingMode, PlatformContentVariant } from './platform';

// Autopilot, AI analysis, automations & content strategy
export interface AutopilotConfig {
  mode: SchedulingMode;
  emergencyPaused: boolean;
  permissions: {
    useRetentionAnalysis: boolean;
    autoOptimizePublishingTimes: boolean;
    optimizeCaptionsTitlesTags: boolean;
    adjustPublishingFrequency: boolean;
  };
  safeguards: {
    maxDailyPostsPerChannel: number;
    minSpacingHours: number;
    blackoutHoursStart: number; // e.g. 0 (midnight)
    blackoutHoursEnd: number; // e.g. 7 (7 AM)
    neverRescheduleInFlight: boolean;
    requireApprovalBelowConfidence: number; // e.g. 70%
  };
  lastDecisionAt?: string;
  totalAutonomousActions: number;
}

export interface AutopilotAuditLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  confidenceScore: number;
  ruleTriggered: string;
  reverted: boolean;
  previousValue?: string;
  newValue?: string;
}

export interface AIVideoAnalysisResult {
  videoId: string;
  summary: string;
  hookAnalysis: {
    text: string;
    hookType: string;
    retentionScore: number;
    feedback: string;
  };
  visualScenes: { timestamp: string; description: string; pace: 'fast' | 'medium' | 'slow' }[];
  scenes?: {
    index: number; startSeconds: number; endSeconds: number;
    description: string; onScreenText?: string | null; speech?: string | null;
    importance?: 'key' | 'supporting' | 'transition'; isHook?: boolean;
  }[];
  transcript?: {
    language?: string | null; hasSpeech: boolean;
    segments: { startSeconds: number; endSeconds: number; text: string; speaker?: string | null }[];
    note?: string | null;
  } | null;
  evidenceBasis?: 'video_file' | 'metadata_only';
  contentCategory: string;
  suggestedAudience: string;
  variants: Partial<Record<Platform, PlatformContentVariant>>;
  analyzedAt: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  triggerType: 'drive_new_file' | 'batch_upload' | 'failed_post' | 'daily_stagger';
  triggerConfig: {
    driveFolderId?: string;
    driveFolderName?: string;
    targetPlatforms?: Platform[];
    autoApprove?: boolean;
    maxDailyPosts?: number;
    retryAttempts?: number;
    backoffMinutes?: number;
  };
  filterPlatforms: Platform[];
  actions: {
    type: 'ai_analyze' | 'auto_schedule' | 'retry_publish' | 'notify_user';
    config?: Record<string, any>;
  }[];
  lastTriggeredAt?: string;
  executionCount: number;
  status: 'active' | 'paused' | 'error';
}

export interface AutomationExecutionLog {
  id: string;
  ruleId: string;
  ruleName: string;
  timestamp: string;
  status: 'success' | 'failed' | 'skipped';
  details: string;
}

export interface StrategyTopic {
  title: string;
  platform: Platform;
  format: string;
  rationale: string;
  suggestedHook: string;
}

export interface ContentStrategyPlan {
  id: string;
  industry: string;
  goals: string[];
  targetAudience: string;
  frequencyPerWeek: number;
  tone: string;
  recommendedTopics: StrategyTopic[];
  monthlyCalendarPlan: {
    week: number;
    theme: string;
    posts: { day: string; topic: string; platform: Platform }[];
  }[];
  generatedAt: string;
}
