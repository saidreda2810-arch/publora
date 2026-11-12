import { SchedulingMode } from './platform';

export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type PlanTier = 'free' | 'starter' | 'professional' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'alert' | 'success';
  active: boolean;
  createdAt: string;
  createdBy?: string;
}

export interface SystemSettings {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  announcements: Announcement[];
  featureFlags: {
    userRegistration: boolean;
    socialOAuth: boolean;
    aiRetentionEngine: boolean;
    scheduledPublishing: boolean;
    workspaceSharing: boolean;
  };
  security: {
    requireEmailVerification: boolean;
    sessionExpiryDays: number;
    maxLoginAttemptsPerMinute: number;
  };
}

export interface WorkspaceSettings {
  defaultTimezone: string;
  defaultSchedulingMode: SchedulingMode;
  contentNiche?: string;
  maxDailyPosts: number;
  autoOptimizeTitles: boolean;
  onboardingCompleted: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: PlanTier;
  billingCycle: BillingCycle;
  createdAt: string;
  settings: WorkspaceSettings;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole | 'manager' | 'editor' | 'publisher' | 'analyst' | 'viewer';
  joinedAt: string;
  invitedEmail?: string;
  user?: {
    fullName: string;
    email: string;
    avatarUrl?: string;
  };
}
