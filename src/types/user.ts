import { Platform } from './platform';
import { Workspace, WorkspaceRole, PlanTier, BillingCycle } from './workspace';
import { SocialConnectionAccount } from './social';

export type UserRole =
  | 'god'
  | 'super_admin'
  | 'admin'
  | 'moderator'
  | 'support'
  | 'user'
  | 'platform_admin';

export type UserStatus = 'active' | 'suspended';

export interface UserNotificationPreferences {
  publishingSuccess: boolean;
  publishingFailure: boolean;
  scheduledPostReminders: boolean;
  disconnectionAlerts: boolean;
  analyticsReports: boolean;
  aiRecommendations: boolean;
  productAnnouncements: boolean;
  emailNotifications: boolean;
  inAppNotifications: boolean;
}

export interface UserPreferences {
  theme?: 'dark' | 'light' | 'system';
  language?: 'en' | 'ar';
  density?: 'compact' | 'comfortable';
  defaultLanding?: string;
  sidebarCollapsed?: boolean;
  notifications?: Partial<UserNotificationPreferences>;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  role: UserRole;
  isEmailVerified: boolean;
  status: UserStatus;
  mfaEnabled?: boolean;
  createdAt: string;
  lastLoginAt: string;
  username?: string;
  phone?: string;
  bio?: string;
  country?: string;
  city?: string;
  timezone?: string;
  language?: 'en' | 'ar';
  dateFormat?: string;
  timeFormat?: '12h' | '24h';
  profileUpdatedAt?: string;
  pendingEmail?: string;
  preferences?: UserPreferences;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  isCurrent: boolean;
}

export interface SecurityActivityItem {
  id: string;
  action: string;
  details: string;
  timestamp: string;
  ip: string | null;
}

export interface AccountOverview {
  user: User;
  workspace: Workspace | null;
  workspaces: Workspace[];
  memberRole: WorkspaceRole | null;
  joinedAt: string | null;
  workspaceOwner: { fullName: string; email: string } | null;
  usage: {
    videosStored: number;
    scheduledPosts: number;
    connectedSocialAccounts: number;
    activeSessions: number;
    maxDailyPosts: number | null;
    storageUsedMb: number;
    plan: PlanTier;
    billingCycle: BillingCycle;
  };
  socialAccounts: SocialConnectionAccount[];
  oauthProviders: Record<Platform, boolean>;
}
