import React from 'react';
import { usePublisher } from '../context/PublisherContext';
import { useAuth } from '../context/AuthContext';
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingUp,
  Share2,
  Eye,
  Key,
  Layers,
  Database,
  PlusCircle,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { Platform } from '../types';

interface DashboardViewProps {
  setActiveTab: (tab: string) => void;
  onOpenNewPost: () => void;
  onOpenNewVideo: () => void;
  animateEntrance?: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  setActiveTab,
  onOpenNewPost,
  onOpenNewVideo,
  animateEntrance = false,
}) => {
  const { user, activeWorkspace } = useAuth();
  const {
    videos,
    posts,
    analytics,
    accounts,
    activeBrand,
  } = usePublisher();

  const totalViews = analytics.reduce((sum, a) => sum + a.views, 0);
  const totalWatchHours = Math.round(
    analytics.reduce((sum, a) => sum + a.totalWatchTimeSeconds, 0) / 3600
  );
  const avgCompletion =
    analytics.length > 0
      ? Math.round(
          analytics.reduce((sum, a) => sum + a.completionRate, 0) / analytics.length
        )
      : null;

  const scheduledPosts = posts.filter((p) => p.status === 'scheduled');
  const publishedPosts = posts
    .filter((p) => p.status === 'published')
    .sort((a, b) => new Date(b.scheduledTime).getTime() - new Date(a.scheduledTime).getTime());

  const connectedAccounts = accounts.filter((a) => a.isConnected);

  return (
    <div className={`w-full max-w-[1440px] mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 ${animateEntrance ? 'dash-stagger' : ''}`}>
      {/* =========================================================================
          ZONE 1: WELCOME & OPERATIONAL HEADER
         ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[var(--border-color)]">
        <div>
          <div className="text-xs font-mono text-[var(--text-muted)] flex items-center gap-2 mb-1">
            <span>{activeWorkspace?.name || 'Workspace'}</span>
            <span aria-hidden="true">Â·</span>
            <span>{activeBrand?.name || 'All Channels'}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)] tracking-tight">
            Welcome back{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Here's your publishing activity at a glance.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenNewVideo}
            className="px-3.5 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] text-xs font-medium transition"
          >
            Add Video
          </button>
          <button
            type="button"
            onClick={onOpenNewPost}
            className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-text)] text-xs font-semibold transition flex items-center gap-1.5 shadow-sm"
          >
            <PlusCircle size={14} />
            <span>Create Content</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          GETTING STARTED ” contextual guidance for new/empty workspaces
         ========================================================================= */}
      {(connectedAccounts.length === 0 || videos.length === 0 || scheduledPosts.length === 0) && (
        <div className="p-4 sm:p-5 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent-border)]">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-ink)] font-mono mb-3">
            Get set up ” 3 quick steps
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('connections')}
              className={`text-left p-3 rounded-lg border transition ${
                connectedAccounts.length > 0
                  ? 'border-[var(--border-color)] bg-[var(--bg-surface)] opacity-70'
                  : 'border-[var(--accent-border)] bg-[var(--bg-surface)] hover:border-[var(--accent-ink)]'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${connectedAccounts.length > 0 ? 'bg-[var(--status-success)] text-[var(--text-primary)]' : 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)]'}`}>
                  {connectedAccounts.length > 0 ? '✜' : '1'}
                </span>
                Connect a social account
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                {connectedAccounts.length > 0 ? 'Done ” accounts linked.' : 'Link YouTube, TikTok, Instagram or Facebook to publish.'}
              </p>
            </button>
            <button
              type="button"
              onClick={onOpenNewVideo}
              className={`text-left p-3 rounded-lg border transition ${
                videos.length > 0
                  ? 'border-[var(--border-color)] bg-[var(--bg-surface)] opacity-70'
                  : 'border-[var(--accent-border)] bg-[var(--bg-surface)] hover:border-[var(--accent-ink)]'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${videos.length > 0 ? 'bg-[var(--status-success)] text-[var(--text-primary)]' : 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)]'}`}>
                  {videos.length > 0 ? '✜' : '2'}
                </span>
                Upload your first video
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                {videos.length > 0 ? `${videos.length} video${videos.length === 1 ? '' : 's'} in library.` : 'MP4, MOV or WebM up to 100MB.'}
              </p>
            </button>
            <button
              type="button"
              onClick={onOpenNewPost}
              className={`text-left p-3 rounded-lg border transition ${
                scheduledPosts.length > 0
                  ? 'border-[var(--border-color)] bg-[var(--bg-surface)] opacity-70'
                  : 'border-[var(--accent-border)] bg-[var(--bg-surface)] hover:border-[var(--accent-ink)]'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${scheduledPosts.length > 0 ? 'bg-[var(--status-success)] text-[var(--text-primary)]' : 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)]'}`}>
                  {scheduledPosts.length > 0 ? '✜' : '3'}
                </span>
                Schedule your first post
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                {scheduledPosts.length > 0 ? 'Queue is active.' : 'Pick a video, platforms, and a time.'}
              </p>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          ZONE 2: CONNECTED ACCOUNTS SUMMARY & KEY OPERATIONAL METRICS
         ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Metric 1: Scheduled Queue */}
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-2">
          <div className="text-xs text-[var(--text-secondary)] flex items-center justify-between">
            <span>Active Queue</span>
            <Clock size={14} className="text-[var(--text-muted)]" />
          </div>
          <div className="text-2xl font-semibold text-[var(--text-primary)] font-mono">
            {scheduledPosts.length}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
            <span>{scheduledPosts.length === 1 ? '1 video awaiting publish' : `${scheduledPosts.length} videos awaiting publish`}</span>
          </div>
        </div>

        {/* Metric 2: Published Publications */}
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-2">
          <div className="text-xs text-[var(--text-secondary)] flex items-center justify-between">
            <span>Published Posts</span>
            <CheckCircle2 size={14} className="text-[var(--text-muted)]" />
          </div>
          <div className="text-2xl font-semibold text-[var(--text-primary)] font-mono">
            {publishedPosts.length}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            Across YouTube, TikTok, Instagram & Facebook
          </div>
        </div>

        {/* Metric 3: Video Library Assets */}
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-2">
          <div className="text-xs text-[var(--text-secondary)] flex items-center justify-between">
            <span>Catalog Assets</span>
            <Database size={14} className="text-[var(--text-muted)]" />
          </div>
          <div className="text-2xl font-semibold text-[var(--text-primary)] font-mono">
            {videos.length}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            Raw videos, shorts & creative cuts
          </div>
        </div>

        {/* Metric 4: Connected Channels */}
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-2">
          <div className="text-xs text-[var(--text-secondary)] flex items-center justify-between">
            <span>Connected Channels</span>
            <Key size={14} className="text-[var(--text-muted)]" />
          </div>
          <div className="text-2xl font-semibold text-[var(--text-primary)] font-mono">
            {connectedAccounts.length} <span className="text-xs text-[var(--text-muted)] font-normal">/ {accounts.length}</span>
          </div>
          <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
            {connectedAccounts.length > 0 ? (
              <span className="text-[var(--status-success)] font-medium">OAuth channels active</span>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('connections')}
                className="text-[var(--accent-primary)] hover:underline"
              >
                Connect accounts →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          ZONE 3: CONNECTED ACCOUNTS STATUS BAR
         ========================================================================= */}
      <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] font-mono">
            Distribution Channels
          </h2>
          <button
            type="button"
            onClick={() => setActiveTab('connections')}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition flex items-center gap-1"
          >
            <span>Manage accounts</span>
            <ArrowRight size={12} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['youtube', 'tiktok', 'instagram', 'facebook'] as Platform[]).map((platform) => {
            const acc = accounts.find((a) => a.platform === platform);
            const isConnected = acc?.isConnected ?? false;

            return (
              <div
                key={platform}
                className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] flex items-center justify-between"
              >
                <div className="space-y-0.5 truncate">
                  <div className="text-xs font-medium text-[var(--text-primary)] capitalize">
                    {platform}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                    {isConnected ? (acc?.accountName || 'Active') : 'Disconnected'}
                  </div>
                </div>
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isConnected ? 'bg-[var(--status-success)]' : 'bg-[var(--text-muted)]'
                  }`}
                  title={isConnected ? 'Connected & authorized' : 'Not connected'}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          ZONE 4 & 5: TWO-COLUMN WORKFLOW: UPCOMING VIDEOS & RECENT PUBLISHING JOBS
         ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Scheduled Publications */}
        <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] font-mono">
                Upcoming Publications ({scheduledPosts.length})
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('calendar')}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition flex items-center gap-1"
              >
                <span>Editorial calendar</span>
                <ArrowRight size={12} />
              </button>
            </div>

            {scheduledPosts.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Calendar size={28} className="text-[var(--text-muted)] mx-auto opacity-60" />
                <div className="text-xs font-medium text-[var(--text-primary)]">Publishing queue is clear</div>
                <p className="text-[11px] text-[var(--text-muted)] max-w-xs mx-auto">
                  Schedule your next video release or configure an automation rule to auto-queue ingested assets.
                </p>
                <button
                  type="button"
                  onClick={onOpenNewPost}
                  className="mt-2 text-xs text-[var(--accent-primary)] hover:underline inline-block font-medium"
                >
                  Schedule first post →
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-color)] mt-1">
                {scheduledPosts.slice(0, 5).map((post) => (
                  <div key={post.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-1 truncate">
                      <div className="font-medium text-[var(--text-primary)] truncate">
                        {post.title}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                        <span className="font-mono text-[var(--accent-secondary)]">
                          {new Date(post.scheduledTime).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span aria-hidden="true">Â·</span>
                        <span className="capitalize">{post.channelPlatforms.join(', ')}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-main)] px-2 py-0.5 rounded border border-[var(--border-color)] flex-shrink-0">
                      Scheduled
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {scheduledPosts.length > 5 && (
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className="pt-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-center w-full"
            >
              View all {scheduledPosts.length} scheduled posts →
            </button>
          )}
        </div>

        {/* Recent Publishing Activity */}
        <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] font-mono">
                Recent Publishing Jobs ({publishedPosts.length})
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('queue')}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition flex items-center gap-1"
              >
                <span>Full queue</span>
                <ArrowRight size={12} />
              </button>
            </div>

            {publishedPosts.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <CheckCircle2 size={28} className="text-[var(--text-muted)] mx-auto opacity-60" />
                <div className="text-xs font-medium text-[var(--text-primary)]">No published jobs yet</div>
                <p className="text-[11px] text-[var(--text-muted)] max-w-xs mx-auto">
                  Once scheduled videos execute through the background scheduler, live dispatch records appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-color)] mt-1">
                {publishedPosts.slice(0, 5).map((post) => (
                  <div key={post.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-1 truncate">
                      <div className="font-medium text-[var(--text-primary)] truncate">
                        {post.title}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                        <span className="font-mono">
                          {new Date(post.scheduledTime).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        <span aria-hidden="true">Â·</span>
                        <span className="capitalize">{post.channelPlatforms.join(', ')}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--status-success)] bg-[var(--bg-main)] px-2 py-0.5 rounded border border-[var(--border-color)] flex-shrink-0">
                      Published
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {publishedPosts.length > 5 && (
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className="pt-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-center w-full"
            >
              View complete publishing log →
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          ZONE 6: PERFORMANCE & ANALYTICS OVERVIEW
         ========================================================================= */}
      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] font-mono">
              Audience Performance & Retention
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Verified playback metrics collected from connected publication channels.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('retention')}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition flex items-center gap-1"
          >
            <span>Detailed retention report</span>
            <ArrowRight size={12} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] space-y-1">
            <div className="text-xs text-[var(--text-secondary)]">Total Verified Views</div>
            <div className="text-xl font-semibold text-[var(--text-primary)] font-mono">
              {totalViews.toLocaleString()}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">Aggregated from active channels</div>
          </div>

          <div className="p-3.5 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] space-y-1">
            <div className="text-xs text-[var(--text-secondary)]">Watch Time (Hours)</div>
            <div className="text-xl font-semibold text-[var(--text-primary)] font-mono">
              {totalWatchHours.toLocaleString()}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">Cumulative playback duration</div>
          </div>

          <div className="p-3.5 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] space-y-1">
            <div className="text-xs text-[var(--text-secondary)]">Average Completion Rate</div>
            <div className="text-xl font-semibold text-[var(--text-primary)] font-mono">
              {avgCompletion !== null ? `${avgCompletion}%` : '”'}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">Full-duration retention average</div>
          </div>
        </div>
      </div>
    </div>
  );
};
