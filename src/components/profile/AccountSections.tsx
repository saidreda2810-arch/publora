import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AccountOverview, PlanTier, BillingCycle } from '../../types';
import { SectionCard, StatusPill, Avatar, btnPrimary, btnGhost, btnDanger, Field, inputCls, formatDate, formatDateTime } from './ui';
import { Building2, CreditCard, AlertOctagon, Trash2, LogOut, Crown, Users, ArrowUpRight } from 'lucide-react';

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

const roleLabel = (r?: string | null) =>
  r ? r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Member';

export const WorkspaceSection: React.FC<{ overview: AccountOverview | null; onOpenTab: (tab: string) => void }> = ({
  overview,
  onOpenTab,
}) => {
  const { user } = useAuth();
  if (!overview?.workspace) return null;
  const ws = overview.workspace;
  const canManage = overview.memberRole === 'owner' || overview.memberRole === 'admin' || ['god', 'super_admin', 'platform_admin', 'admin'].includes(user?.role || '');

  return (
    <SectionCard title="Workspace" description="Your current tenant workspace and your role inside it." icon={<Building2 size={16} />}>
      <div className="flex items-start gap-4">
        <Avatar name={ws.name} size={56} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-[var(--text-primary)] truncate">{ws.name}</h3>
            <StatusPill tone={ws.plan === 'free' ? 'muted' : 'success'}>{PLAN_LABELS[ws.plan] || ws.plan}</StatusPill>
          </div>
          <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1 truncate">ID: {ws.id}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
            <div>
              <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Your role</div>
              <div className="text-[var(--text-primary)] font-medium">{roleLabel(overview.memberRole)}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Created</div>
              <div className="text-[var(--text-secondary)]">{formatDate(ws.createdAt)}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Joined</div>
              <div className="text-[var(--text-secondary)]">{formatDate(overview.joinedAt)}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Owner</div>
              <div className="text-[var(--text-secondary)] truncate" title={overview.workspaceOwner?.email}>
                {overview.workspaceOwner?.fullName || '”'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {canManage && (
        <div className="mt-4 pt-4 border-t border-[var(--border-color)] flex flex-wrap gap-2">
          <button className={btnGhost} onClick={() => onOpenTab('team')}>
            <Users size={13} /> Team Members
          </button>
          <button className={btnGhost} onClick={() => onOpenTab('brands')}>
            <ArrowUpRight size={13} /> Workspace Settings
          </button>
        </div>
      )}
      {!canManage && (
        <p className="mt-4 pt-4 border-t border-[var(--border-color)] text-[11px] text-[var(--text-muted)]">
          Workspace management requires owner or admin role.
        </p>
      )}
    </SectionCard>
  );
};

export const SubscriptionSection: React.FC<{ overview: AccountOverview | null; onOpenTab: (tab: string) => void }> = ({
  overview,
}) => {
  const { activeWorkspace, upgradePlan } = useAuth();
  const [upgrading, setUpgrading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!overview || !activeWorkspace) return null;
  const { usage } = overview;
  const ws = activeWorkspace;

  const doUpgrade = async (plan: PlanTier) => {
    setUpgrading(true);
    setMsg(null);
    const res = await upgradePlan(plan, ws.billingCycle || 'monthly');
    setUpgrading(false);
    setMsg(res.success ? `Plan changed to ${PLAN_LABELS[plan]}.` : res.error || 'Upgrade failed.');
  };

  const plans: { id: PlanTier; note: string }[] = [
    { id: 'free', note: 'Basic publishing limits' },
    { id: 'starter', note: 'More channels & scheduling' },
    { id: 'professional', note: 'Autopilot & AI features' },
    { id: 'enterprise', note: 'Full platform capacity' },
  ];

  const rows = [
    { label: 'Videos stored', value: usage.videosStored },
    { label: 'Scheduled posts', value: usage.scheduledPosts },
    { label: 'Connected accounts', value: usage.connectedSocialAccounts },
    { label: 'Active sessions', value: usage.activeSessions },
    { label: 'Storage used', value: `${usage.storageUsedMb} MB` },
    { label: 'Max posts / day', value: usage.maxDailyPosts ?? '”' },
  ];

  return (
    <SectionCard title="Subscription & Usage" description="Current plan and real workspace consumption." icon={<CreditCard size={16} />}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-[var(--text-primary)]">{PLAN_LABELS[ws.plan] || ws.plan}</span>
            {ws.plan !== 'free' && <Crown size={14} className="text-[var(--status-warning)]" />}
          </div>
          <div className="text-[11px] font-mono text-[var(--text-muted)] capitalize">
            {ws.billingCycle} billing Â· plan active
          </div>
        </div>
        {msg && <p className="text-xs text-[var(--text-secondary)]">{msg}</p>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
        {rows.map((r) => (
          <div key={r.label} className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)]">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">{r.label}</div>
            <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{r.value}</div>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-[var(--border-color)]">
        <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2">Change plan</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {plans.map((p) => (
            <button
              key={p.id}
              disabled={upgrading || ws.plan === p.id}
              onClick={() => doUpgrade(p.id)}
              className={`p-3 rounded-xl border text-left transition disabled:opacity-60 ${
                ws.plan === p.id
                  ? 'border-[var(--accent-border)] bg-[var(--accent-subtle)]'
                  : 'border-[var(--border-color)] bg-[var(--bg-main)] hover:border-[var(--text-muted)]'
              }`}
            >
              <div className="text-xs font-bold text-[var(--text-primary)]">{PLAN_LABELS[p.id]}</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{p.note}</div>
              {ws.plan === p.id && <div className="text-[10px] font-mono text-[var(--accent-ink)] mt-1">CURRENT</div>}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-3">
          Plan changes apply instantly to workspace quotas. Billing & invoices are not yet enabled on this deployment.
        </p>
      </div>
    </SectionCard>
  );
};

export const DangerZoneSection: React.FC<{ onSignedOut?: () => void }> = () => {
  const { user, logout, deleteAccount, apiFetch } = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [delPassword, setDelPassword] = useState('');
  const [delConfirm, setDelConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isGod = user?.email?.toLowerCase() === 'saidreda2810@gmail.com' || user?.role === 'god';

  const handleDelete = async () => {
    setMsg(null);
    if (!delPassword) {
      setMsg({ type: 'error', text: 'Enter your password to confirm deletion.' });
      return;
    }
    if (delConfirm !== 'DELETE') {
      setMsg({ type: 'error', text: 'Type DELETE to confirm.' });
      return;
    }
    setBusy(true);
    const res = await deleteAccount(delPassword);
    setBusy(false);
    if (res.success) {
      // deleteAccount already logs out
    } else {
      setMsg({ type: 'error', text: res.error || 'Deletion failed.' });
    }
  };

  return (
    <SectionCard title="Danger Zone" description="Irreversible account actions. Proceed with caution." icon={<AlertOctagon size={16} />} danger>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)]">
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">Sign out of all devices</div>
            <div className="text-[11px] text-[var(--text-muted)]">Terminates every active session including this one.</div>
          </div>
          <button className={btnGhost} onClick={async () => {
            try { await apiFetch('/api/auth/sessions/revoke-others', { method: 'POST' }); } catch {}
            await logout();
          }}>
            <LogOut size={13} /> Sign out everywhere
          </button>
        </div>

        {isGod ? (
          <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-[var(--status-warning)] text-xs">
            The Primary Owner account is permanently protected and cannot be deleted.
          </div>
        ) : !deleteOpen ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-rose-500/30 bg-rose-500/5">
            <div>
              <div className="text-sm font-semibold text-[var(--status-error)]">Delete account</div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Permanently removes your account, owned workspaces, and disconnects all social integrations.
              </div>
            </div>
            <button className={btnDanger} onClick={() => setDeleteOpen(true)}>
              <Trash2 size={13} /> Delete Account
            </button>
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-500/5 space-y-3">
            <p className="text-xs text-rose-200">
              This will <strong>permanently delete</strong> your account, all owned workspaces, videos, posts, and connected
              platform credentials. This action cannot be undone.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Confirm with your password">
                <input className={inputCls} type="password" value={delPassword} onChange={(e) => setDelPassword(e.target.value)} autoComplete="current-password" />
              </Field>
              <Field label='Type "DELETE" to confirm'>
                <input className={inputCls} value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} placeholder="DELETE" />
              </Field>
            </div>
            {msg && <p className="text-xs text-[var(--status-error)]">{msg.text}</p>}
            <div className="flex gap-2">
              <button className={btnDanger} onClick={handleDelete} disabled={busy}>
                {busy ? 'Deleting…' : 'Permanently Delete My Account'}
              </button>
              <button className={btnGhost} onClick={() => { setDeleteOpen(false); setDelPassword(''); setDelConfirm(''); setMsg(null); }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
};
