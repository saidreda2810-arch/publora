import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { SessionInfo, SecurityActivityItem } from '../../types';
import { SectionCard, Field, inputCls, labelCls, btnPrimary, btnGhost, btnDanger, StatusPill, formatDateTime } from './ui';
import { KeyRound, ShieldCheck, MonitorSmartphone, ScrollText, Trash2, Eye, EyeOff, CheckCircle2, AlertTriangle, Copy } from 'lucide-react';

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: 'Weak', color: 'bg-rose-500' };
  if (score <= 2) return { score, label: 'Fair', color: 'bg-amber-500' };
  if (score <= 3) return { score, label: 'Good', color: 'bg-[var(--accent-primary)]' };
  return { score, label: 'Strong', color: 'bg-[var(--status-success)]' };
}

function parseDevice(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return `${browser} Â· ${os}`;
}

export const SecuritySection: React.FC = () => {
  const { user, changePassword, apiFetch, logout } = useAuth();

  // Password change
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPw, setShowPw] = useState(false);
  const strength = passwordStrength(pw.next);

  // MFA
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; code: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaMsg, setMfaMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [disablePw, setDisablePw] = useState('');

  // Sessions
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionMsg, setSessionMsg] = useState<string | null>(null);

  // Activity
  const [activity, setActivity] = useState<SecurityActivityItem[]>([]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await apiFetch('/api/auth/sessions');
      const data = await res.json();
      if (data.success) setSessions(data.sessions || []);
    } catch {} finally {
      setSessionsLoading(false);
    }
  }, [apiFetch]);

  const loadActivity = useCallback(async () => {
    try {
      const res = await apiFetch('/api/auth/security/activity');
      const data = await res.json();
      if (data.success) setActivity(data.activity || []);
    } catch {}
  }, [apiFetch]);

  useEffect(() => {
    loadSessions();
    loadActivity();
  }, [loadSessions, loadActivity]);

  const handlePassword = async () => {
    setPwMsg(null);
    if (pw.next !== pw.confirm) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (pw.next.length < 8) {
      setPwMsg({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    setPwBusy(true);
    const res = await changePassword(pw.current, pw.next);
    setPwBusy(false);
    if (res.success) {
      setPwMsg({ type: 'success', text: 'Password updated successfully.' });
      setPw({ current: '', next: '', confirm: '' });
    } else {
      setPwMsg({ type: 'error', text: res.error || 'Password change failed.' });
    }
  };

  const mfaSetupStart = async () => {
    setMfaBusy(true);
    setMfaMsg(null);
    try {
      const res = await apiFetch('/api/auth/mfa/setup', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMfaSetup({ secret: data.secret, code: data.testVerificationCode });
      } else {
        setMfaMsg({ type: 'error', text: data.error || 'MFA setup failed.' });
      }
    } catch (e: any) {
      setMfaMsg({ type: 'error', text: e.message });
    } finally {
      setMfaBusy(false);
    }
  };

  const mfaVerify = async () => {
    setMfaBusy(true);
    setMfaMsg(null);
    try {
      const res = await apiFetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: mfaCode }),
      });
      const data = await res.json();
      if (data.success) {
        setMfaSetup(null);
        setMfaCode('');
        setMfaMsg({ type: 'success', text: 'Two-factor authentication enabled.' });
      } else {
        setMfaMsg({ type: 'error', text: data.error || 'Invalid code.' });
      }
    } finally {
      setMfaBusy(false);
    }
  };

  const mfaDisable = async () => {
    if (!disablePw) return;
    setMfaBusy(true);
    setMfaMsg(null);
    try {
      const res = await apiFetch('/api/auth/mfa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: disablePw }),
      });
      const data = await res.json();
      if (data.success) {
        setDisablePw('');
        setMfaMsg({ type: 'success', text: 'Two-factor authentication disabled.' });
      } else {
        setMfaMsg({ type: 'error', text: data.error || 'Disable failed.' });
      }
    } finally {
      setMfaBusy(false);
    }
  };

  const revokeSession = async (id: string) => {
    const res = await apiFetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setSessions((s) => s.filter((x) => x.id !== id));
      setSessionMsg('Session revoked.');
    }
  };

  const revokeOthers = async () => {
    const res = await apiFetch('/api/auth/sessions/revoke-others', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      setSessionMsg(data.message);
      loadSessions();
    }
  };

  const signOutAll = async () => {
    if (!window.confirm('Sign out of ALL devices? Every active session will be terminated.')) return;
    try {
      await apiFetch('/api/auth/sessions/revoke-others', { method: 'POST' });
    } catch {}
    await logout();
  };

  if (!user) return null;

  return (
    <div className="space-y-5">
      {/* Password */}
      <SectionCard title="Password" description="Change your account password. Other sessions stay active." icon={<KeyRound size={16} />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Current password">
            <div className="relative">
              <input
                className={`${inputCls} pr-9`}
                type={showPw ? 'text' : 'password'}
                value={pw.current}
                onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                autoComplete="current-password"
              />
              <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" onClick={() => setShowPw(!showPw)}>
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          <Field label="New password">
            <input className={inputCls} type="password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password">
            <input className={inputCls} type="password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} autoComplete="new-password" />
          </Field>
        </div>
        {pw.next && (
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-main)] overflow-hidden">
                <div className={`h-full ${strength.color} transition-all`} style={{ width: `${Math.min(100, (strength.score / 5) * 100)}%` }} />
              </div>
              <span className="text-[10px] font-mono text-[var(--text-muted)]">{strength.label}</span>
            </div>
          </div>
        )}
        {pwMsg && (
          <p className={`mt-3 text-xs flex items-center gap-1.5 ${pwMsg.type === 'success' ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'}`}>
            {pwMsg.type === 'success' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {pwMsg.text}
          </p>
        )}
        <div className="mt-4">
          <button className={btnPrimary} onClick={handlePassword} disabled={pwBusy || !pw.current || !pw.next || !pw.confirm}>
            {pwBusy ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </SectionCard>

      {/* 2FA */}
      <SectionCard
        title="Two-Factor Authentication"
        description={user.mfaEnabled ? '2FA is currently enabled on your account.' : 'Add an extra verification step at sign-in.'}
        icon={<ShieldCheck size={16} />}
      >
        {user.mfaEnabled ? (
          <div className="space-y-3">
            <StatusPill tone="success">Enabled</StatusPill>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              <Field label="Confirm with password to disable" className="flex-1">
                <input className={inputCls} type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} placeholder="Your password" />
              </Field>
              <button className={btnDanger} onClick={mfaDisable} disabled={mfaBusy || !disablePw}>
                Disable 2FA
              </button>
            </div>
          </div>
        ) : mfaSetup ? (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)]">
              <div className={labelCls}>Setup secret</div>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-[var(--accent-ink)] break-all">{mfaSetup.secret}</code>
                <button
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  onClick={() => navigator.clipboard?.writeText(mfaSetup.secret)}
                  title="Copy secret"
                >
                  <Copy size={13} />
                </button>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-2">
                Store this secret in your authenticator app, then enter the generated code below.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              <Field label="6-digit verification code" className="flex-1">
                <input className={inputCls} value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" inputMode="numeric" />
              </Field>
              <button className={btnPrimary} onClick={mfaVerify} disabled={mfaBusy || mfaCode.length < 6}>
                Verify & Enable
              </button>
              <button className={btnGhost} onClick={() => { setMfaSetup(null); setMfaCode(''); }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            Two-factor authentication is not available yet. It will return with a real authenticator-app implementation.
          </p>
        )}
        {mfaMsg && (
          <p className={`mt-3 text-xs flex items-center gap-1.5 ${mfaMsg.type === 'success' ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'}`}>
            {mfaMsg.type === 'success' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {mfaMsg.text}
          </p>
        )}
      </SectionCard>

      {/* Sessions */}
      <SectionCard
        title="Active Sessions"
        description={`${sessions.length} active session${sessions.length === 1 ? '' : 's'} on your account.`}
        icon={<MonitorSmartphone size={16} />}
      >
        {sessionMsg && <p className="text-xs text-[var(--status-success)] mb-3">{sessionMsg}</p>}
        {sessionsLoading ? (
          <p className="text-xs text-[var(--text-muted)]">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">No active sessions found.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)]">
                <MonitorSmartphone size={16} className="text-[var(--text-muted)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                    {parseDevice(s.userAgent)}
                    {s.isCurrent && <span className="ml-2 text-[10px] font-mono text-[var(--accent-ink)]">THIS DEVICE</span>}
                  </div>
                  <div className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                    {s.ip || 'Unknown IP'} Â· active since {formatDateTime(s.createdAt)}
                  </div>
                </div>
                {!s.isCurrent && (
                  <button className={btnGhost} onClick={() => revokeSession(s.id)}>
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {sessions.filter((s) => !s.isCurrent).length > 0 && (
          <div className="mt-4">
            <button className={btnGhost} onClick={revokeOthers}>
              Sign out of all other sessions
            </button>
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
          <button className={btnDanger} onClick={signOutAll}>
            <Trash2 size={13} /> Sign out of all devices
          </button>
        </div>
      </SectionCard>

      {/* Security activity */}
      <SectionCard title="Recent Security Activity" description="Sign-ins, password and security changes on your account." icon={<ScrollText size={16} />}>
        {activity.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">No security events recorded yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto touch-scroll">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 py-2 border-b border-[var(--border-subtle)] last:border-0">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[var(--text-primary)]">{a.action.replace(/_/g, ' ')}</div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">{a.details}</div>
                </div>
                <div className="text-[10px] font-mono text-[var(--text-muted)] flex-shrink-0 text-right">
                  {formatDateTime(a.timestamp)}
                  {a.ip && <div>{a.ip}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
};
