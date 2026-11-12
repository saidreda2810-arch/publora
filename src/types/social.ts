import { Platform, ConnectionStatus } from './platform';

// OAuth permissions, channels & social account shapes
export interface OAuthPermission {
  name: string;
  granted: boolean;
  description: string;
  category: 'publishing' | 'analytics' | 'profile' | 'management';
}

export interface ConnectedChannel {
  id: string;
  accountId: string;
  brandId: string;
  platform: Platform;
  platformChannelId: string;
  channelName: string;
  handle: string;
  avatarUrl: string;
  accountType: 'youtube_channel' | 'facebook_page' | 'instagram_business' | 'instagram_creator' | 'tiktok_account';
  isEligibleForPublishing: boolean;
  publishingIneligibilityReason?: string;
  isEligibleForAnalytics: boolean;
  analyticsIneligibilityReason?: string;
  subscriberOrFollowerCount: number;
  selectedForBrand: boolean;
  lastSyncedAt: string;
}

export interface SocialAccount {
  id: string;
  brandId: string;
  platform: Platform;
  accountName: string;
  handle: string;
  email?: string;
  avatarUrl?: string;
  isConnected: boolean;
  connectionStatus?: ConnectionStatus;
  tokenExpiresAt?: string;
  tokenValid?: boolean;
  requiresReconnection?: boolean;
  rateLimitRemaining?: number;
  permissions?: OAuthPermission[];
  channels?: ConnectedChannel[];
  apiPermissions: {
    canPublish: boolean;
    canReadAnalytics: boolean;
    hasDetailedRetention: boolean;
    hasMilestoneData: boolean;
  };
  lastSyncedAt?: string;
  statusMessage?: string;
}

export interface OAuthPermissionInfo {
  name: string;
  granted: boolean;
  description: string;
  category: 'publishing' | 'analytics' | 'profile' | 'management';
}

export interface SocialConnectionAccount {
  id: string;
  brandId: string;
  provider: Platform;
  externalAccountId: string;
  accountName: string;
  usernameOrHandle: string;
  email?: string;
  avatarUrl?: string;
  connectionStatus: ConnectionStatus;
  statusMessage: string;
  connectionDate: string;
  lastSuccessfulSync: string;
  tokenExpiresAt: string;
  tokenValid: boolean;
  requiresReconnection: boolean;
  permissions: OAuthPermissionInfo[];
  channels: {
    id: string;
    channelName: string;
    handle: string;
    avatarUrl: string;
    isEligibleForPublishing: boolean;
    isEligibleForAnalytics: boolean;
    subscriberOrFollowerCount: number;
    selectedForBrand: boolean;
    lastSyncedAt: string;
  }[];
  rateLimitRemaining?: number;
}
