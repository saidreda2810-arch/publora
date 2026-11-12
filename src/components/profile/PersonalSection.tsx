import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { SectionCard, Field, inputCls, labelCls, btnPrimary, StatusPill, Avatar, formatDate } from './ui';
import { User as UserIcon, Camera, CheckCircle2, AlertTriangle } from 'lucide-react';

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Africa/Cairo',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
];

export const PersonalSection: React.FC = () => {
  const { user, updateProfile, verifyEmailChange, apiFetch } = useAuth();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [form, setForm] = useState({
    fullName: '',
    username: '',
    email: '',
    phone: '',
    bio: '',
    country: '',
    city: '',
    timezone: '',
    language: 'en' as 'en' | 'ar',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: '12h' as '12h' | '24h',
    avatarUrl: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [emailChangeToken, setEmailChangeToken] = useState('');
  const [pendingVerify, setPendingVerify] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      fullName: user.fullName || '',
      username: user.username || '',
      email: user.email || '',
      phone: user.phone || '',
      bio: user.bio || '',
      country: user.country || '',
      city: user.city || '',
      timezone: user.timezone || '',
      language: user.language || 'en',
      dateFormat: user.dateFormat || 'YYYY-MM-DD',
      timeFormat: user.timeFormat || '12h',
      avatarUrl: user.avatarUrl || '',
    });
  }, [user]);

  if (!user) return null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    const res = await updateProfile({
      fullName: form.fullName,
      username: form.username,
      email: form.email,
      phone: form.phone,
      bio: form.bio,
      country: form.country,
      city: form.city,
      timezone: form.timezone || undefined,
      language: form.language,
      dateFormat: form.dateFormat,
      timeFormat: form.timeFormat,
      avatarUrl: form.avatarUrl || undefined,
    });
    setSaving(false);
    if (res.success) {
      if (res.emailChangePending) {
        setPendingVerify(true);
        setMessage({
          type: 'success',
          text: `Verification required. A confirmation token was issued for ${form.email}. Enter it below to complete the email change.`,
        });
        if (res.emailChangeToken) setEmailChangeToken(res.emailChangeToken);
      } else {
        setMessage({ type: 'success', text: 'Profile saved successfully.' });
      }
    } else {
      setMessage({ type: 'error', text: res.error || 'Failed to save profile.' });
    }
  };

  const handleVerifyEmailChange = async () => {
    if (!emailChangeToken.trim()) return;
    const res = await verifyEmailChange(emailChangeToken.trim());
    if (res.success) {
      setPendingVerify(false);
      setMessage({ type: 'success', text: 'Email address updated and verified.' });
    } else {
      setMessage({ type: 'error', text: res.error || 'Verification failed.' });
    }
  };

  return (
    <div className="space-y-5">
      {/* Photo row */}
      <SectionCard title="Profile Photo" description="Shown across the app, navbar, and workspace." icon={<Camera size={16} />}>
        <div className="flex items-center gap-4">
          <Avatar name={user.fullName} src={avatarPreview || user.avatarUrl} size={64} />
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-border)] transition">
                {avatarUploading ? 'Uploading…' : 'Upload Photo'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) { setMessage({ type: 'error', text: 'Image must be under 2MB.' }); return; }
                    if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)) { setMessage({ type: 'error', text: 'PNG, JPEG, WebP or GIF only.' }); return; }
                    const reader = new FileReader();
                    reader.onload = async () => {
                      const dataUrl = reader.result as string;
                      setAvatarPreview(dataUrl);
                      setAvatarUploading(true);
                      try {
                        const res = await apiFetch('/api/saas/account/avatar', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ avatarUrl: dataUrl }),
                        });
                        const data = await res.json();
                        if (data.success) {
                          setForm((f) => ({ ...f, avatarUrl: data.avatarUrl }));
                          setMessage({ type: 'success', text: 'Profile photo updated.' });
                          setAvatarPreview(null);
                        } else {
                          setAvatarPreview(null);
                          setMessage({ type: 'error', text: data.error || 'Upload failed.' });
                        }
                      } catch { setAvatarPreview(null); setMessage({ type: 'error', text: 'Upload failed.' }); }
                      setAvatarUploading(false);
                    };
                    reader.readAsDataURL(file);
                  }} />
              </label>
              {avatarPreview && <button type="button" onClick={() => setAvatarPreview(null)} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Cancel preview</button>}
            </div>
            <Field label="Or paste image URL" hint="HTTPS image URL (leave empty for initials avatar)">
              <input className={inputCls} value={form.avatarUrl} onChange={set('avatarUrl')} placeholder="https://..." />
            </Field>
          </div>
        </div>
      </SectionCard>

      {/* Identity */}
      <SectionCard title="Identity" description="Your public-facing name and unique handle." icon={<UserIcon size={16} />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full name *">
            <input className={inputCls} value={form.fullName} onChange={set('fullName')} maxLength={80} />
          </Field>
          <Field label="Username" hint="3-30 chars: letters, numbers, underscore. Must be unique.">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] font-mono">@</span>
              <input className={`${inputCls} pl-7`} value={form.username} onChange={set('username')} maxLength={30} placeholder="your_handle" />
            </div>
          </Field>
          <Field label="Email address" hint="Changing email requires verification.">
            <input className={inputCls} type="email" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Phone (optional)">
            <input className={inputCls} value={form.phone} onChange={set('phone')} maxLength={32} placeholder="+1 555 000 0000" />
          </Field>
          <Field label="Bio / short description" className="sm:col-span-2">
            <textarea className={`${inputCls} min-h-[80px] resize-y`} value={form.bio} onChange={set('bio')} maxLength={280} placeholder="Tell people what you create..." />
            <p className="text-[10px] text-[var(--text-muted)] mt-1 text-right">{form.bio.length}/280</p>
          </Field>
        </div>
      </SectionCard>

      {/* Locale & format */}
      <SectionCard title="Locale & Format" description="Regional preferences stored on your account.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Country">
            <input className={inputCls} value={form.country} onChange={set('country')} maxLength={80} placeholder="United States" />
          </Field>
          <Field label="City">
            <input className={inputCls} value={form.city} onChange={set('city')} maxLength={80} placeholder="New York" />
          </Field>
          <Field label="Time zone">
            <select className={inputCls} value={form.timezone} onChange={set('timezone')}>
              <option value="">Select timezone…</option>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </Field>
          <Field label="Preferred language">
            <select className={inputCls} value={form.language} onChange={set('language')}>
              <option value="en">English</option>
              <option value="ar">Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©</option>
            </select>
          </Field>
          <Field label="Date format">
            <select className={inputCls} value={form.dateFormat} onChange={set('dateFormat')}>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            </select>
          </Field>
          <Field label="Time format">
            <select className={inputCls} value={form.timeFormat} onChange={set('timeFormat')}>
              <option value="12h">12-hour (AM/PM)</option>
              <option value="24h">24-hour</option>
            </select>
          </Field>
        </div>
      </SectionCard>

      {/* Account facts (read-only) */}
      <SectionCard title="Account Facts" description="Protected system fields ” managed by the platform.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)]">
            <div className={labelCls}>User ID</div>
            <div className="font-mono text-[var(--text-secondary)] truncate" title={user.id}>{user.id}</div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)]">
            <div className={labelCls}>Role</div>
            <StatusPill tone={user.role === 'god' || user.role === 'platform_admin' ? 'warning' : 'muted'}>{user.role.replace('_', ' ')}</StatusPill>
          </div>
          <div className="p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)]">
            <div className={labelCls}>Member since</div>
            <div className="text-[var(--text-secondary)]">{formatDate(user.createdAt)}</div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)]">
            <div className={labelCls}>Last login</div>
            <div className="text-[var(--text-secondary)]">{formatDate(user.lastLoginAt)}</div>
          </div>
        </div>
      </SectionCard>

      {/* Email change verification */}
      {pendingVerify && (
        <SectionCard title="Confirm Email Change" description="Enter the verification token sent to your new address." icon={<AlertTriangle size={16} />}>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              className={inputCls}
              placeholder="Verification token"
              value={emailChangeToken}
              onChange={(e) => setEmailChangeToken(e.target.value)}
            />
            <button className={btnPrimary} onClick={handleVerifyEmailChange} disabled={!emailChangeToken.trim()}>
              <CheckCircle2 size={14} /> Verify & Apply
            </button>
          </div>
        </SectionCard>
      )}

      {/* Feedback + save */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {message && (
          <p className={`text-xs flex items-center gap-1.5 ${message.type === 'success' ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'}`}>
            {message.type === 'success' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
            {message.text}
          </p>
        )}
        <button className={btnPrimary} onClick={handleSave} disabled={saving || !form.fullName.trim()}>
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
};
