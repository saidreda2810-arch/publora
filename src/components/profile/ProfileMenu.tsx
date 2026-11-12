import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Avatar, StatusPill } from './ui';
import {
  User as UserIcon, Pencil, Settings, ShieldCheck, Users, Building2, Crown,
  CreditCard, Palette, Bell, LifeBuoy, LogOut, Check, ChevronDown, BadgeCheck,
} from 'lucide-react';
import { FaLanguage } from 'react-icons/fa';
import { apiFetch } from '../../lib/api';

interface Props {
  onNavigateProfile: (section?: string) => void;
  onOpenTab: (tab: string) => void;
}

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  divider?: boolean;
}

export const ProfileMenu: React.FC<Props> = ({ onNavigateProfile, onOpenTab }) => {
  const { user, activeWorkspace, workspaces, memberRole, logout, updateProfile } = useAuth();
  const { themePreference, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; model?: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Simple keyboard navigation: ArrowUp/Down cycles menu buttons
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = menuRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
      if (!items || items.length === 0) return;
      e.preventDefault();
      const idx = Array.from(items).indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
      items[next]?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!user) return null;

  const canManageWorkspace =
    memberRole === 'owner' ||
    memberRole === 'admin' ||
    ['god', 'super_admin', 'platform_admin', 'admin'].includes(user.role);
  const isAdmin = ['god', 'super_admin', 'platform_admin', 'admin', 'moderator', 'support'].includes(user.role);

  const go = (section?: string, tab?: string) => {
    setOpen(false);
    if (section) onNavigateProfile(section);
    if (tab) onOpenTab(tab);
  };

  const setLanguage = async (lang: 'en' | 'ar') => {
    setLangOpen(false);
    setOpen(false);
    document.documentElement.lang = lang;
    localStorage.setItem('saa_language_preference', lang);
    await updateProfile({ language: lang, preferences: { language: lang } });
  };

  const openHelp = async () => {
    setHelpOpen(true);
    try {
      const res = await apiFetch('/api/system/status');
      const data = await res.json();
      setStatus({ ok: data.status === 'online', model: data.platformModel });
    } catch {
      setStatus({ ok: false });
    }
  };

  const roleLabel =
    user.role === 'god' ? 'Super Admin'
    : user.role === 'platform_admin' ? 'Platform Admin'
    : canManageWorkspace && memberRole ? memberRole.replace(/\b\w/g, (c) => c.toUpperCase())
    : 'User';

  const groups: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Account',
      items: [
        { label: 'My Profile', icon: <UserIcon size={14} />, action: () => go('overview') },
        { label: 'Edit Profile', icon: <Pencil size={14} />, action: () => go('personal') },
        { label: 'Account Settings', icon: <Settings size={14} />, action: () => go('personal') },
        { label: 'Security & Privacy', icon: <ShieldCheck size={14} />, action: () => go('security') },
      ],
    },
    {
      title: 'Workspace',
      items: [
        { label: 'My Workspace', icon: <Building2 size={14} />, action: () => go('workspace') },
        ...(canManageWorkspace
          ? [{ label: 'Team Members', icon: <Users size={14} />, action: () => go(undefined, 'team') } as MenuItem]
          : []),
        ...(canManageWorkspace
          ? [{ label: 'Workspace Settings', icon: <Crown size={14} />, action: () => go(undefined, 'brands') } as MenuItem]
          : []),
      ],
    },
    {
      title: 'Subscription',
      items: [
        { label: 'My Plan', icon: <CreditCard size={14} />, action: () => go('subscription') },
      ],
    },
    {
      title: 'Preferences',
      items: [
        {
          label: `Appearance: ${themePreference === 'system' ? 'System' : themePreference === 'dark' ? 'Dark' : 'Light'}`,
          icon: <Palette size={14} />,
          action: () => {
            const next = themePreference === 'dark' ? 'light' : themePreference === 'light' ? 'system' : 'dark';
            setTheme(next);
            updateProfile({ preferences: { theme: next } });
            setOpen(false);
          },
        },
        {
          label: `Language: ${user.preferences?.language === 'ar' ? 'العربية' : 'English'}`,
          icon: <FaLanguage size={14} />,
          action: () => {
            setLangOpen(!langOpen);
          },
        },
        { label: 'Notifications', icon: <Bell size={14} />, action: () => go('notifications') },
      ],
    },
  ];

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] transition"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <Avatar name={user.fullName} src={user.avatarUrl} size={26} />
        <span className="hidden md:block text-xs font-medium text-[var(--text-primary)] max-w-[110px] truncate">
          {user.fullName?.split(' ')[0] || 'Account'}
        </span>
        <ChevronDown size={12} className={`text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 sm:w-72 max-w-[calc(100vw-2rem)] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-2xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="p-3 border-b border-[var(--border-color)] flex items-center gap-3">
            <Avatar name={user.fullName} src={user.avatarUrl} size={40} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{user.fullName}</div>
              <div className="text-[11px] font-mono text-[var(--text-muted)] truncate">{user.email}</div>
              <div className="flex items-center gap-1.5 mt-1">
                <StatusPill tone={isAdmin ? 'warning' : 'muted'}>{roleLabel}</StatusPill>
                {user.isEmailVerified && (
                  <span title="Email verified"><BadgeCheck size={13} className="text-[var(--status-success)]" /></span>
                )}
              </div>
            </div>
          </div>
          <div className="px-3 py-1.5 border-b border-[var(--border-color)] text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] truncate">
            {activeWorkspace?.name || 'Personal Workspace'} Â· {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'}
          </div>

          {/* Language submenu */}
          {langOpen && (
            <div className="border-b border-[var(--border-color)] p-1.5">
              {(['en', 'ar'] as const).map((l) => (
                <button
                  key={l}
                  role="menuitem"
                  onClick={() => setLanguage(l)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
                >
                  <span>{l === 'en' ? 'English' : 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©'}</span>
                  {(user.preferences?.language || 'en') === l && <Check size={13} className="text-[var(--accent-ink)]" />}
                </button>
              ))}
            </div>
          )}

          {/* Groups */}
          <div className="max-h-[60vh] overflow-y-auto touch-scroll py-1">
            {groups.map((g) => (
              <div key={g.title} className="px-1.5 py-1">
                <div className="px-2 py-1 text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                  {g.title}
                </div>
                {g.items.map((item) => (
                  <button
                    key={item.label}
                    role="menuitem"
                    onClick={item.action}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition text-left"
                  >
                    <span className="text-[var(--text-muted)]">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Bottom actions */}
          <div className="border-t border-[var(--border-color)] p-1.5">
            <button
              role="menuitem"
              onClick={() => { setOpen(false); openHelp(); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
            >
              <LifeBuoy size={14} className="text-[var(--text-muted)]" /> Help & Support
            </button>
            <button
              role="menuitem"
              onClick={() => { setOpen(false); logout(); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs text-[var(--status-error)] hover:bg-rose-500/10 transition"
            >
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Help modal */}
      {helpOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setHelpOpen(false)}>
          <div className="absolute inset-0 bg-[var(--bg-input)] backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">Help & Support</h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              System status:{' '}
              {status === null ? 'checking…' : status.ok ? (
                <span className="text-[var(--status-success)]">online{status.model ? ` Â· ${status.model}` : ''}</span>
              ) : (
                <span className="text-[var(--status-error)]">unreachable</span>
              )}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              For account or billing issues, contact your workspace owner or the platform team at{' '}
              <span className="font-mono text-[var(--text-primary)]">{activeWorkspace?.ownerId ? 'workspace owner' : 'support'}</span>.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-3.5 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-xs font-bold"
                onClick={() => setHelpOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
