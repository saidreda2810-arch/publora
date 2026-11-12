import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AccountOverview, User } from '../../types';
import { Avatar, StatusPill, btnPrimary, formatDate, cardCls } from './ui';
import { PersonalSection } from './PersonalSection';
import { ConnectionsSection } from './ConnectionsSection';
import { SecuritySection } from './SecuritySection';
import { NotificationsSection, AppearanceSection } from './PreferencesSections';
import { WorkspaceSection, SubscriptionSection, DangerZoneSection } from './AccountSections';
import {
  User as UserIcon, Link2, ShieldCheck, Bell, Palette, Building2, CreditCard,
  AlertOctagon, LayoutDashboard, Pencil, Camera, ArrowLeft, CheckCircle2,
} from 'lucide-react';

interface Props {
  initialSection?: string;
  onOpenTab: (tab: string) => void;
  onOpenNewBrand: () => void;
  onBack?: () => void;
}

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'personal', label: 'Personal Information', icon: UserIcon },
  { id: 'connections', label: 'Connected Accounts', icon: Link2 },
  { id: 'security', label: 'Security & Privacy', icon: ShieldCheck },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'workspace', label: 'Workspace', icon: Building2 },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
  { id: 'danger', label: 'Danger Zone', icon: AlertOctagon },
];

const roleBadge = (role?: string | null) => {
  if (!role) return null;
  const tone = ['god', 'super_admin', 'platform_admin'].includes(role)
    ? 'warning'
    : role === 'admin'
    ? 'success'
    : 'muted';
  return <StatusPill tone={tone as any}>{role.replace(/_/g, ' ')}</StatusPill>;
};

const OverviewSection: React.FC<{ overview: AccountOverview | null; onNavigate: (s: string) => void; onOpenTab: (t: string) => void }> = ({
  overview,
  onNavigate,
  onOpenTab,
}) => {
  const { user } = useAuth();
  if (!overview || !user) return <p className="text-xs text-[var(--text-muted)]">Loading…</p>;
  const { usage } = overview;

  const cards = [
    { label: 'Videos stored', value: usage.videosStored, section: 'personal' },
    { label: 'Scheduled posts', value: usage.scheduledPosts, section: 'subscription' },
    { label: 'Connected accounts', value: usage.connectedSocialAccounts, section: 'connections' },
    { label: 'Active sessions', value: usage.activeSessions, section: 'security' },
  ];

  return (
    <div className="space-y-5">
      <div className={`${cardCls} grid grid-cols-2 lg:grid-cols-4 gap-3`}>
        {cards.map((c) => (
          <button
            key={c.label}
            onClick={() => onNavigate(c.section)}
            className="p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-left hover:border-[var(--accent-border)] transition"
          >
            <div className="text-2xl font-bold text-[var(--text-primary)]">{c.value}</div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mt-1">{c.label}</div>
          </button>
        ))}
      </div>

      <div className={`${cardCls} grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-xs`}>
        {[
          ['Account status', <StatusPill key="s" tone={user.status === 'active' ? 'success' : 'error'}>{user.status}</StatusPill>],
          ['Email verification', user.isEmailVerified ? <StatusPill key="e" tone="success"><CheckCircle2 size={10} className="mr-1" />Verified</StatusPill> : <StatusPill key="e" tone="warning">Unverified</StatusPill>],
          ['Registration date', formatDate(user.createdAt)],
          ['Last login', formatDate(user.lastLoginAt)],
          ['Profile last updated', formatDate(user.profileUpdatedAt)],
          ['Current workspace', overview.workspace?.name || '”'],
          ['Workspace role', roleBadge(overview.memberRole)],
          ['Subscription', <StatusPill key="p" tone="muted">{(overview.usage.plan || 'free').toUpperCase()}</StatusPill>],
        ].map(([label, value]) => (
          <div key={label as string} className="flex items-center justify-between gap-3 py-1.5 border-b border-[var(--border-subtle)] last:border-0">
            <span className="text-[var(--text-muted)]">{label}</span>
            <span className="text-[var(--text-primary)] font-medium">{value}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} onClick={() => onNavigate('personal')}>
          <Pencil size={13} /> Edit Profile
        </button>
        <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]" onClick={() => onOpenTab('dashboard')}>
          <ArrowLeft size={13} /> Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export const ProfilePage: React.FC<Props> = ({ initialSection, onOpenTab, onOpenNewBrand, onBack }) => {
  const { user, apiFetch, refreshAuth } = useAuth();
  const [section, setSection] = useState(initialSection && SECTIONS.some((s) => s.id === initialSection) ? initialSection : 'overview');
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    try {
      const res = await apiFetch('/api/saas/account-overview');
      const data = await res.json();
      if (data.success) setOverview(data as AccountOverview);
    } catch (e) {
      console.warn('Failed to load account overview:', e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);

  if (!user) {
    return (
      <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <p className="text-sm text-[var(--text-muted)]">Please sign in to view your profile.</p>
      </div>
    );
  }

  const displayName = user.fullName || user.email;

  return (
    <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 sm:mb-8">
        <Avatar name={displayName} src={user.avatarUrl} size={72} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] truncate">{displayName}</h1>
            {user.username && <span className="text-sm font-mono text-[var(--text-muted)]">@{user.username}</span>}
            {roleBadge(overview?.memberRole || user.role)}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-muted)] flex-wrap">
            <span className="font-mono">{user.email}</span>
            {user.isEmailVerified ? (
              <StatusPill tone="success"><CheckCircle2 size={10} className="mr-1" />Verified</StatusPill>
            ) : (
              <StatusPill tone="warning">Unverified</StatusPill>
            )}
            <span>Â·</span>
            <span>Member since {formatDate(user.createdAt)}</span>
            {overview?.workspace && <><span>Â·</span><span>{overview.workspace.name}</span></>}
          </div>
          {user.pendingEmail && (
            <p className="text-[11px] text-[var(--status-warning)] mt-1">Email change pending verification → {user.pendingEmail}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]" onClick={() => setSection('personal')}>
            <Camera size={13} /> Change Photo
          </button>
          <button className={btnPrimary} onClick={() => setSection('personal')}>
            <Pencil size={13} /> Edit Profile
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Section nav */}
        <nav className="lg:w-56 flex-shrink-0">
          <div className="flex lg:flex-col gap-1 overflow-x-auto touch-scroll lg:overflow-visible pb-2 lg:pb-0 -mx-1 px-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition flex-shrink-0 lg:flex-shrink ${
                    active
                      ? 'bg-[var(--accent-subtle)] text-[var(--accent-ink)] border border-[var(--accent-border)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] border border-transparent'
                  }`}
                >
                  <Icon size={15} />
                  {s.label}
                  {s.id === 'danger' && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-rose-500" />}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-5">
          {loading && !overview && section === 'overview' && (
            <div className="text-xs text-[var(--text-muted)] font-mono">Loading account data…</div>
          )}
          {section === 'overview' && (
            <OverviewSection overview={overview} onNavigate={setSection} onOpenTab={onOpenTab} />
          )}
          {section === 'personal' && <PersonalSection />}
          {section === 'connections' && (
            <ConnectionsSection overview={overview} reload={loadOverview} onNeedBrand={onOpenNewBrand} />
          )}
          {section === 'security' && <SecuritySection />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'appearance' && <AppearanceSection />}
          {section === 'workspace' && <WorkspaceSection overview={overview} onOpenTab={onOpenTab} />}
          {section === 'subscription' && <SubscriptionSection overview={overview} onOpenTab={onOpenTab} />}
          {section === 'danger' && <DangerZoneSection />}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
