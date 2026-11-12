import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { WorkspaceMember, WorkspaceRole } from '../types';
import {
  Users,
  Shield,
  Plus,
  Mail,
  UserCheck,
  Building,
  CheckCircle2,
  Trash2,
  Lock,
  Layers,
  Crown,
  Clock,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

export const TeamWorkspaceView: React.FC = () => {
  const { user, activeWorkspace, workspaces, switchWorkspace, createWorkspace, sessionToken } = useAuth();

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('editor');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreatingWs, setIsCreatingWs] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // Fetch workspace members
  useEffect(() => {
    if (!activeWorkspace || !sessionToken) return;

    setIsLoadingMembers(true);
    apiFetch('/api/saas/members', {
      headers: {
        'x-workspace-id': activeWorkspace.id,
      },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.members) {
          setMembers(data.members);
        }
      })
      .catch((e) => console.warn('Failed to load members:', e))
      .finally(() => setIsLoadingMembers(false));
    apiFetch('/api/saas/members/invitations', {
      headers: { 'x-workspace-id': activeWorkspace.id },
    }).then((r) => r.json()).then((d) => { if (d.success) setInvitations(d.invitations || []); }).catch(() => {});
  }, [activeWorkspace?.id, sessionToken]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !sessionToken || !activeWorkspace) return;

    try {
      const res = await apiFetch('/api/saas/members/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': activeWorkspace.id,
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setNotice(`Invitation sent to ${inviteEmail}.`);
        setInviteEmail('');
        // Refresh members
        const refreshed = await apiFetch('/api/saas/members', {
          headers: {
            'x-workspace-id': activeWorkspace.id,
          },
        }).then((r) => r.json());
        if (refreshed.members) setMembers(refreshed.members);
      } else {
        setNotice(`Invite error: ${data.error || 'Server error'}`);
      }
    } catch (e: any) {
      setNotice(`Connection error: ${e.message}`);
    } finally {
      setTimeout(() => setNotice(null), 3500);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    await createWorkspace(newWorkspaceName.trim());
    setNewWorkspaceName('');
    setIsCreatingWs(false);
    setNotice(`Created workspace "${newWorkspaceName}".`);
    setTimeout(() => setNotice(null), 3000);
  };

  const roleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono uppercase font-bold">Owner</span>;
      case 'manager':
        return <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono uppercase">Manager</span>;
      case 'editor':
        return <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono uppercase">Editor</span>;
      case 'publisher':
        return <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono uppercase">Publisher</span>;
      case 'analyst':
        return <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-mono uppercase">Analyst</span>;
      default:
        return <span className="px-2 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-secondary)] text-[10px] font-mono uppercase">{role}</span>;
    }
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 hero-banner-gradient border border-blue-500/20 rounded-2xl p-6 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30 text-xs font-mono font-semibold uppercase">
              Module 12 â€¢ Team & Multi-Tenancy
            </span>
            <span className="text-xs text-[var(--text-secondary)] font-mono">Row-Level Workspace Isolation</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight flex items-center gap-3">
            <Users className="text-blue-400" size={28} />
            Workspaces & Team Collaboration
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)] max-w-2xl">
            Manage isolated client workspaces, invite team members with strict role-based access control (Owner, Manager, Editor, Publisher, Analyst, Viewer), and ensure complete privacy.
          </p>
        </div>

        <button
          onClick={() => setIsCreatingWs(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 text-[var(--text-primary)] font-bold text-xs flex items-center gap-2 shadow"
        >
          <Plus size={15} /> Create Isolated Workspace
        </button>
      </div>

      {notice && (
        <div className="p-4 rounded-xl bg-blue-950/80 border border-blue-500/40 text-blue-200 text-xs flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 size={16} className="text-[#00D6B2]" />
          <span>{notice}</span>
        </div>
      )}

      {/* Grid: Left Workspaces & Right Members */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Workspaces Switcher (4 Cols) */}
        <div className="lg:col-span-4 space-y-5">
          <div className="bg-[var(--bg-surface)]/80 border border-[var(--border-color)] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                <Building size={16} className="text-blue-400" />
                Your Workspaces
              </h2>
              <span className="text-xs font-mono text-[var(--text-secondary)]">{workspaces.length} total</span>
            </div>

            <div className="space-y-2">
              {workspaces.map((ws) => {
                const isActive = ws.id === activeWorkspace?.id;
                return (
                  <button
                    key={ws.id}
                    onClick={() => switchWorkspace(ws.id)}
                    className={`w-full text-left p-3.5 rounded-xl border text-xs transition flex items-center justify-between ${
                      isActive
                        ? 'bg-blue-950/50 border-blue-500/60 text-[var(--text-primary)] shadow-sm'
                        : 'bg-[var(--bg-input)]/40 border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--border-color)]'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-[var(--text-primary)]">{ws.name}</div>
                      <div className="text-[10px] font-mono text-[var(--text-secondary)] mt-0.5">
                        Plan: {ws.plan?.toUpperCase()} â€¢ Created: {new Date(ws.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {isActive && <CheckCircle2 size={16} className="text-[#00D6B2]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Active Workspace Members & Invites (8 Cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Member Invitation Card */}
          <div className="bg-[var(--bg-surface)]/80 border border-[var(--border-color)] rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
              <Mail size={16} className="text-blue-400" />
              Invite Team Member to "{activeWorkspace?.name}"
            </h2>

            <form onSubmit={handleInvite} className="flex flex-col sm:flex-row items-center gap-3">
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full sm:flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-400"
              />

              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full sm:w-auto bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)]"
              >
                <option value="manager">Manager (Manage Publishing & Team)</option>
                <option value="editor">Editor (Upload & Edit)</option>
                <option value="publisher">Publisher (Schedule & Publish)</option>
                <option value="analyst">Analyst (View Analytics)</option>
                <option value="viewer">Viewer (Read-Only)</option>
              </select>

              <button
                type="submit"
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-[var(--text-primary)] font-bold text-xs whitespace-nowrap shadow"
              >
                Send Invite
              </button>
            </form>
          </div>

          {/* Pending Invitations */}
          {invitations.filter((i) => i.status === 'pending').length > 0 && (
            <div className="bg-[var(--bg-surface)]/80 border border-amber-500/30 rounded-2xl p-5 space-y-3">
              <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <Clock size={16} /> Pending Invitations ({invitations.filter((i) => i.status === 'pending').length})
              </h2>
              {invitations.filter((i) => i.status === 'pending').map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-xs">
                  <div className="min-w-0">
                    <p className="text-[var(--text-primary)] font-semibold truncate">{inv.email}</p>
                    <p className="text-[10px] font-mono text-[var(--text-muted)]">{inv.role} Â· expires {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : 'â€”'}</p>
                  </div>
                  <button
                    onClick={async () => {
                      await apiFetch(`/api/saas/members/invitations/${inv.id}/revoke`, {
                        method: 'POST',
                        headers: { 'x-workspace-id': activeWorkspace?.id || '' },
                      });
                      setInvitations((prev) => prev.map((x) => x.id === inv.id ? { ...x, status: 'revoked' } : x));
                    }}
                    className="px-2.5 py-1 rounded bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[10px] font-semibold flex-shrink-0"
                  >Revoke</button>
                </div>
              ))}
            </div>
          )}

          {/* Members List */}
          <div className="bg-[var(--bg-surface)]/80 border border-[var(--border-color)] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                <UserCheck size={16} className="text-blue-400" />
                Active Workspace Members
              </h2>
              <span className="text-xs font-mono text-[var(--text-secondary)]">
                {members.length} member{members.length !== 1 ? 's' : ''}
              </span>
            </div>

            {isLoadingMembers ? (
              <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading members...</div>
            ) : members.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                You are currently the sole member of this workspace.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {members.map((m) => (
                  <div key={m.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">
                        {m.user?.fullName || m.invitedEmail || 'Team Member'}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] font-mono">
                        {m.user?.email || m.invitedEmail}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {roleBadge(m.role)}
                      <span className="text-[10px] font-mono text-[var(--text-muted)]">
                        Joined: {new Date(m.joinedAt).toLocaleDateString()}
                      </span>
                      {m.role !== 'owner' && (
                        <div className="flex items-center gap-1">
                          <select
                            value={m.role}
                            onChange={async (e) => {
                              await apiFetch(`/api/saas/members/${m.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json', 'x-workspace-id': activeWorkspace?.id || '' },
                                body: JSON.stringify({ role: e.target.value }),
                              });
                              setMembers((prev) => prev.map((x) => x.id === m.id ? { ...x, role: e.target.value as any } : x));
                            }}
                            className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded px-1 py-0.5 text-[10px] text-[var(--text-secondary)]"
                          >
                            {['manager','editor','publisher','analyst','viewer'].map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <button
                            onClick={async () => {
                              if (!confirm(`Remove ${m.user?.email || m.invitedEmail}?`)) return;
                              await apiFetch(`/api/saas/members/${m.id}`, { method: 'DELETE', headers: { 'x-workspace-id': activeWorkspace?.id || '' } });
                              setMembers((prev) => prev.filter((x) => x.id !== m.id));
                            }}
                            className="p-1 text-rose-400 hover:text-rose-300" title="Remove member"
                          ><Trash2 size={12} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Workspace Modal */}
      {isCreatingWs && (
        <div className="fixed inset-0 z-[100] bg-[var(--bg-overlay)] backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateWorkspace}
            className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-6 max-w-md w-full space-y-4 animate-scaleUp"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-base font-bold text-[var(--text-primary)]">Create New Workspace</h3>
              <button
                type="button"
                onClick={() => setIsCreatingWs(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold"
              >
                âœ•
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="text-[var(--text-secondary)] font-semibold block">Workspace Name</label>
              <input
                type="text"
                required
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="e.g. Acme Media Group"
                className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-primary)]"
              />
              <p className="text-[11px] text-[var(--text-muted)]">
                Each workspace has isolated videos, schedules, analytics, and social accounts.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => setIsCreatingWs(false)}
                className="px-4 py-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-[var(--text-primary)] font-bold text-xs"
              >
                Create Workspace
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};