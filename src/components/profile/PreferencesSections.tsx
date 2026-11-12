import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { SectionCard, Toggle, btnPrimary } from './ui';
import { Bell, Palette, CheckCircle2, AlertTriangle } from 'lucide-react';
import { UserNotificationPreferences } from '../../types';

const NOTIF_ITEMS: { key: keyof UserNotificationPreferences; label: string; desc: string; channel: 'email' | 'inApp' | 'both' }[] = [
  { key: 'publishingSuccess', label: 'Publishing success', desc: 'When a scheduled post publishes successfully.', channel: 'both' },
  { key: 'publishingFailure', label: 'Publishing failure', desc: 'When a post fails to publish or needs attention.', channel: 'both' },
  { key: 'scheduledPostReminders', label: 'Scheduled post reminders', desc: 'Reminders before upcoming scheduled posts go live.', channel: 'inApp' },
  { key: 'disconnectionAlerts', label: 'Social account disconnection alerts', desc: 'When a connected platform token expires or is revoked.', channel: 'both' },
  { key: 'analyticsReports', label: 'Analytics reports', desc: 'Periodic performance and retention summaries.', channel: 'email' },
  { key: 'aiRecommendations', label: 'AI recommendations', desc: 'New AI-generated content and strategy suggestions.', channel: 'inApp' },
  { key: 'productAnnouncements', label: 'Product announcements', desc: 'Platform news and feature announcements.', channel: 'both' },
  { key: 'emailNotifications', label: 'Email notifications (master)', desc: 'Allow transactional and digest emails.', channel: 'email' },
  { key: 'inAppNotifications', label: 'In-app notifications (master)', desc: 'Show notification center items inside the app.', channel: 'inApp' },
];

const DEFAULT_NOTIFS: Required<UserNotificationPreferences> = {
  publishingSuccess: true,
  publishingFailure: true,
  scheduledPostReminders: true,
  disconnectionAlerts: true,
  analyticsReports: false,
  aiRecommendations: true,
  productAnnouncements: true,
  emailNotifications: true,
  inAppNotifications: true,
};

export const NotificationsSection: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const [notifs, setNotifs] = useState<Required<UserNotificationPreferences>>(DEFAULT_NOTIFS);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user?.preferences?.notifications) {
      setNotifs({ ...DEFAULT_NOTIFS, ...user.preferences.notifications } as Required<UserNotificationPreferences>);
    }
  }, [user?.preferences?.notifications]);

  const toggle = (key: keyof UserNotificationPreferences) => {
    setNotifs((n) => ({ ...n, [key]: !n[key] }));
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const res = await updateProfile({ preferences: { notifications: notifs } });
    setSaving(false);
    setMsg(res.success ? { type: 'success', text: 'Notification preferences saved.' } : { type: 'error', text: res.error || 'Save failed.' });
  };

  // Auto-save on toggle with debounce
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => {
      updateProfile({ preferences: { notifications: notifs } });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifs]);

  return (
    <SectionCard
      title="Notification Preferences"
      description="Each setting saves independently and persists across sessions."
      icon={<Bell size={16} />}
    >
      <div className="divide-y divide-[var(--border-subtle)]">
        {NOTIF_ITEMS.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--text-primary)]">{item.label}</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{item.desc}</div>
            </div>
            <Toggle checked={notifs[item.key]} onChange={() => toggle(item.key)} label={item.label} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        {msg && (
          <p className={`text-xs flex items-center gap-1.5 ${msg.type === 'success' ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'}`}>
            {msg.type === 'success' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {msg.text}
          </p>
        )}
        <button className={btnPrimary} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save Preferences'}
        </button>
      </div>
    </SectionCard>
  );
};

export const AppearanceSection: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const { themePreference, setTheme } = useTheme();
  const [density, setDensity] = useState<'compact' | 'comfortable'>('comfortable');
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setDensity(user?.preferences?.density || 'comfortable');
    setLanguage(user?.preferences?.language || user?.language || 'en');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Apply theme immediately (local + persisted via profile)
  const applyTheme = async (t: 'dark' | 'light' | 'system') => {
    setTheme(t);
    await updateProfile({ preferences: { theme: t } });
  };

  const applyDensity = async (d: 'compact' | 'comfortable') => {
    setDensity(d);
    document.documentElement.dataset.density = d;
    localStorage.setItem('saa_density_preference', d);
    await updateProfile({ preferences: { density: d } });
  };

  const applyLanguage = async (l: 'en' | 'ar') => {
    setLanguage(l);
    document.documentElement.lang = l;
    localStorage.setItem('saa_language_preference', l);
    await updateProfile({ language: l, preferences: { language: l } });
  };

  const themes: { id: 'dark' | 'light' | 'system'; label: string; desc: string }[] = [
    { id: 'dark', label: 'Dark', desc: 'Dark editorial-tech theme' },
    { id: 'light', label: 'Light', desc: 'Clean light theme' },
    { id: 'system', label: 'System', desc: 'Follow OS preference' },
  ];

  return (
    <SectionCard title="Appearance & Personalization" description="Interface preferences apply across the whole app." icon={<Palette size={16} />}>
      <div className="space-y-5">
        <div>
          <div className={labelClsSafe}>Theme</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTheme(t.id)}
                className={`p-3 rounded-xl border text-left transition ${
                  themePreference === t.id
                    ? 'border-[var(--accent-border)] bg-[var(--accent-subtle)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-main)] hover:border-[var(--text-muted)]'
                }`}
              >
                <div className="text-xs font-semibold text-[var(--text-primary)]">{t.label}</div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className={labelClsSafe}>Layout density</div>
            <div className="flex gap-2">
              {(['comfortable', 'compact'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => applyDensity(d)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-medium capitalize transition ${
                    density === d
                      ? 'border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-ink)]'
                      : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className={labelClsSafe}>Interface language</div>
            <div className="flex gap-2">
              {([{ id: 'en', label: 'English' }, { id: 'ar', label: 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©' }] as const).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => applyLanguage(l.id)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-medium transition ${
                    language === l.id
                      ? 'border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-ink)]'
                      : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5">Language preference is saved per account; full Arabic UI translations are rolling out.</p>
          </div>
        </div>

        <div className="pt-3 border-t border-[var(--border-color)]">
          <Toggle
            checked={user?.preferences?.sidebarCollapsed ?? false}
            onChange={async (v) => {
              await updateProfile({ preferences: { sidebarCollapsed: v } });
            }}
            label="Compact sidebar"
          />
          <span className="text-xs text-[var(--text-secondary)] ml-3">Compact sidebar mode (preference saved)</span>
        </div>

        {msg && (
          <p className={`text-xs flex items-center gap-1.5 ${msg.type === 'success' ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'}`}>
            {msg.type === 'success' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {msg.text}
          </p>
        )}
      </div>
    </SectionCard>
  );
};

const labelClsSafe = 'block text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5';
