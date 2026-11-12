import React, { useState, useEffect } from 'react';
import {
  Crown,
  ShieldAlert,
  Users,
  Building,
  Activity,
  Play,
  RotateCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  UserX,
  FileText,
  Clock,
  Sparkles,
  Server,
  Lock,
  EyeOff,
  Bell,
  Trash2,
  HardDrive,
  Cpu,
  KeyRound,
  ShieldCheck,
  XCircle,
  PlusCircle,
  Radio,
  Sliders,
  Wrench,
} from 'lucide-react';
import { MaintenancePanel } from './MaintenancePanel';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { apiFetch } from '../lib/api';
import { UploadPolicyPanel } from './admin/UploadPolicyPanel';
import { DeveloperSettingsPanel } from './DeveloperSettingsPanel';

export const AdminDashboardView: React.FC = () => {
  const { sessionToken, user, refreshAuth } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'users' | 'system' | 'security' | 'audit' | 'developer' | 'maintenance'>('overview');
  
  // Data states
  const [overview, setOverview] = useState<any>(null);
  const [systemSettings, setSystemSettings] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  
  // UI states
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Maintenance mode form state
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [isUpdatingMaintenance, setIsUpdatingMaintenance] = useState(false);
  
  // New announcement form state
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annType, setAnnType] = useState<'info' | 'warning' | 'alert' | 'success'>('info');
  const [isCreatingAnn, setIsCreatingAnn] = useState(false);

  // MFA setup state
  const [mfaCode, setMfaCode] = useState('');
  const [mfaTestCode, setMfaTestCode] = useState<string | null>(null);
  const [isSettingUpMfa, setIsSettingUpMfa] = useState(false);

  const isGod = user?.role === 'god';
  const isSuperAdmin = user?.role === 'god' || user?.role === 'super_admin' || user?.role === 'platform_admin';

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const headers = {};
      const [resOverview, resUsers, resSched, resSessions, resLogs] = await Promise.all([
        apiFetch('/api/saas/admin/overview', { headers }).then((r) => r.json()),
        apiFetch('/api/saas/admin/users', { headers }).then((r) => r.json()),
        apiFetch('/api/scheduler/status').then((r) => r.json()),
        apiFetch('/api/saas/admin/sessions', { headers }).then((r) => r.json()),
        apiFetch('/api/saas/admin/audit-logs', { headers }).then((r) => r.json()),
      ]);

      if (resOverview.success) {
        setOverview(resOverview.overview);
        setSystemSettings(resOverview.systemSettings);
        if (resOverview.systemSettings?.maintenanceMessage) {
          setMaintenanceMessage(resOverview.systemSettings.maintenanceMessage);
        }
      }
      if (resUsers.success) {
        setUsersList(resUsers.users || []);
      }
      if (resSched.success) {
        setSchedulerStatus(resSched);
      }
      if (resSessions.success) {
        setSessionsList(resSessions.sessions || []);
      }
      if (resLogs.success) {
        setAuditLogs(resLogs.logs || []);
      }
    } catch (err) {
      console.error('Failed to load admin stats:', err);
      setActionMessage({ type: 'error', text: 'Failed to fetch administrative data.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [sessionToken]);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 5000);
  };

  // 1. User Status Toggle
  const handleToggleStatus = async (userId: string, currentStatus: string, targetEmail: string) => {
    if (targetEmail.toLowerCase() === 'saidreda2810@gmail.com') {
      showFeedback('Access Denied: The Primary GOD Owner account cannot be suspended.', 'error');
      return;
    }

    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const res = await apiFetch(`/api/saas/admin/users/${userId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(`User ${targetEmail} status changed to ${newStatus}.`);
        fetchData();
      } else {
        showFeedback(data.error || 'Failed to update user status.', 'error');
      }
    } catch (e: any) {
      showFeedback(e.message, 'error');
    }
  };

  // 2. User Role Assignment
  const handleRoleChange = async (userId: string, newRole: UserRole, targetEmail: string) => {
    if (targetEmail.toLowerCase() === 'saidreda2810@gmail.com') {
      showFeedback('Access Denied: The Primary GOD Owner role cannot be modified.', 'error');
      return;
    }

    if (newRole === 'god') {
      showFeedback('Access Denied: The GOD role is permanently reserved for saidreda2810@gmail.com.', 'error');
      return;
    }

    try {
      const res = await apiFetch(`/api/saas/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(`Role for ${targetEmail} updated to ${newRole.toUpperCase()}.`);
        fetchData();
      } else {
        showFeedback(data.error || 'Failed to update user role.', 'error');
      }
    } catch (e: any) {
      showFeedback(e.message, 'error');
    }
  };

  // 3. User Deletion
  const handleDeleteUser = async (userId: string, targetEmail: string) => {
    if (targetEmail.toLowerCase() === 'saidreda2810@gmail.com') {
      showFeedback('Access Denied: The Primary GOD Owner account cannot be deleted under any circumstances.', 'error');
      return;
    }

    if (!confirm(`Are you absolutely certain you want to permanently delete user ${targetEmail}? This will remove all their workspaces and data.`)) {
      return;
    }

    try {
      const res = await apiFetch(`/api/saas/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {  },
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(`Account ${targetEmail} permanently deleted.`);
        fetchData();
      } else {
        showFeedback(data.error || 'Failed to delete user.', 'error');
      }
    } catch (e: any) {
      showFeedback(e.message, 'error');
    }
  };

  // 4. Maintenance Mode Toggle
  const handleToggleMaintenance = async () => {
    if (!isSuperAdmin) {
      showFeedback('Access Denied: Only GOD Owner or Super Admin can toggle maintenance mode.', 'error');
      return;
    }

    setIsUpdatingMaintenance(true);
    const newMode = !systemSettings?.maintenanceMode;
    try {
      const res = await apiFetch('/api/saas/admin/system-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maintenanceMode: newMode,
          maintenanceMessage: maintenanceMessage.trim() || 'Platform is under scheduled maintenance. Please check back shortly.',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(`Maintenance mode is now ${newMode ? 'ENABLED (Platform Locked)' : 'DISABLED (Platform Live)'}.`);
        fetchData();
      } else {
        showFeedback(data.error || 'Failed to update maintenance mode.', 'error');
      }
    } catch (e: any) {
      showFeedback(e.message, 'error');
    } finally {
      setIsUpdatingMaintenance(false);
    }
  };

  // 5. Add Announcement
  const handleAddAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annMessage.trim()) return;

    try {
      const res = await apiFetch('/api/saas/admin/announcements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: annTitle.trim(),
          message: annMessage.trim(),
          type: annType,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback('System announcement published globally.');
        setAnnTitle('');
        setAnnMessage('');
        setIsCreatingAnn(false);
        fetchData();
      } else {
        showFeedback(data.error || 'Failed to publish announcement.', 'error');
      }
    } catch (e: any) {
      showFeedback(e.message, 'error');
    }
  };

  // 6. Delete Announcement
  const handleDeleteAnnouncement = async (annId: string) => {
    try {
      const res = await apiFetch(`/api/saas/admin/announcements/${annId}`, {
        method: 'DELETE',
        headers: {  },
      });
      const data = await res.json();
      if (data.success) {
        showFeedback('Announcement removed.');
        fetchData();
      } else {
        showFeedback(data.error || 'Failed to delete announcement.', 'error');
      }
    } catch (e: any) {
      showFeedback(e.message, 'error');
    }
  };

  // 7. Revoke Session
  const handleRevokeSession = async (sessionId: string) => {
    try {
      const res = await apiFetch(`/api/saas/admin/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {  },
      });
      const data = await res.json();
      if (data.success) {
        showFeedback('Session revoked successfully.');
        fetchData();
      } else {
        showFeedback(data.error || 'Failed to revoke session.', 'error');
      }
    } catch (e: any) {
      showFeedback(e.message, 'error');
    }
  };

  // 8. Trigger Scheduler Cycle
  const handleRunScheduler = async () => {
    try {
      const res = await apiFetch('/api/scheduler/run-now', { method: 'POST' }).then((r) => r.json());
      if (res.success) {
        showFeedback(`Background scheduler cycle completed. ${res.result?.publishedInThisCycle || 0} posts processed.`);
        fetchData();
      }
    } catch (e: any) {
      showFeedback(e.message, 'error');
    }
  };

  // 9. MFA Setup & Verify
  const handleStartMfaSetup = async () => {
    try {
      const res = await apiFetch('/api/auth/mfa/setup', {
        method: 'POST',
        headers: {  },
      }).then((r) => r.json());
      if (res.success) {
        setMfaTestCode(res.testVerificationCode);
        setIsSettingUpMfa(true);
      }
    } catch (e: any) {
      showFeedback(e.message, 'error');
    }
  };

  const handleVerifyMfa = async () => {
    if (!mfaCode.trim()) return;
    try {
      const res = await apiFetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: mfaCode.trim() }),
      }).then((r) => r.json());

      if (res.success) {
        showFeedback('Two-factor multi-factor authentication (MFA) successfully activated!');
        setIsSettingUpMfa(false);
        setMfaCode('');
        setMfaTestCode(null);
        refreshAuth();
        fetchData();
      } else {
        showFeedback(res.error || 'Invalid verification code.', 'error');
      }
    } catch (e: any) {
      showFeedback(e.message, 'error');
    }
  };

  const filteredUsers = usersList.filter((u) => {
    const q = searchTerm.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      u.fullName.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* 1. PRIMARY GOD OWNER IDENTITY BANNER */}
      <div className={`p-6 rounded-3xl border relative overflow-hidden backdrop-blur-xl ${
        isGod
          ? 'hero-banner-gradient border-amber-500/40 shadow-2xl shadow-amber-500/10'
          : 'hero-banner-gradient border-purple-500/30'
      }`}>
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-72 h-72 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start sm:items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border ${
              isGod
                ? 'bg-gradient-to-tr from-amber-500 to-yellow-300 text-black border-amber-300 shadow-lg shadow-amber-500/30'
                : 'bg-indigo-600 text-[var(--text-primary)] border-indigo-400'
            }`}>
              {isGod ? <Crown className="w-8 h-8" /> : <ShieldAlert className="w-7 h-7" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight">
                  {isGod ? 'GOD COMMAND CENTER â€ PRIMARY OWNER' : 'SUPER ADMIN MANAGEMENT CONSOLE'}
                </h1>
                <span className={`text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full font-bold border ${
                  isGod
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                }`}>
                  {isGod ? 'ðŸ‘‘ Supreme Authority (GOD)' : 'Super Administrator'}
                </span>
                {systemSettings?.maintenanceMode && (
                  <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/50 animate-pulse">
                    Maintenance Active
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
                Permanent Primary Owner: <span className="font-mono text-amber-300 font-bold">saidreda2810@gmail.com</span>
                <span className="hidden sm:inline text-[var(--text-muted)] mx-2">â€¢</span>
                <span className="text-[var(--text-secondary)]">Full platform governance, security control, and database sovereignty.</span>
              </p>
            </div>
          </div>

          {/* Privacy Shield Certification Badge */}
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[var(--bg-surface)]/90 border border-emerald-500/30 text-emerald-300 text-xs">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <div className="font-bold flex items-center gap-1.5">
                <span>Strict User Privacy Shield Active</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <p className="text-[10px] text-[var(--text-secondary)]">Passwords, salts & private files cryptographically shielded by design.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action feedback toast */}
      {actionMessage && (
        <div className={`p-4 rounded-2xl border text-sm flex items-center justify-between animate-in fade-in ${
          actionMessage.type === 'success'
            ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
            : 'bg-rose-950/80 border-rose-500/50 text-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-rose-400" />}
            <span className="font-medium">{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">âœ•</button>
        </div>
      )}

      {/* 2. SUB-NAVIGATION TABS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-color)] pb-3">
        {[
          { id: 'overview', label: 'Command Overview', icon: Activity },
          { id: 'users', label: 'User Governance & RBAC', icon: Users, count: overview?.totalUsers },
          { id: 'system', label: 'Website Control & Maintenance', icon: Sliders },
          { id: 'storage', label: 'Video Upload & Storage', icon: HardDrive },
          ...(isGod ? [{ id: 'developer', label: 'Developer Settings', icon: KeyRound }] : []),
          { id: 'maintenance', label: 'Maintenance Center', icon: Wrench },
      { id: 'security', label: 'Sessions & MFA Security', icon: Lock, count: overview?.activeSessions },
          { id: 'audit', label: 'Audit Trail Telemetry', icon: FileText, count: auditLogs.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition ${
                isActive
                  ? isGod
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold shadow-md shadow-amber-500/20'
                    : 'bg-purple-600 text-[var(--text-primary)] font-bold shadow-md shadow-purple-600/20'
                  : 'bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-color)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                  isActive ? 'bg-black/20 text-black' : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 3. TAB 1: OVERVIEW & SYSTEM HEALTH */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metric Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col justify-between">
              <div className="flex items-center justify-between text-[var(--text-secondary)] mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Registered</span>
                <Users className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-[var(--text-primary)]">{overview?.totalUsers || 0}</div>
              <div className="mt-2 text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
                <span>Active: <span className="text-emerald-400 font-bold">{overview?.activeUsers || 0}</span></span>
                <span>Suspended: <span className="text-rose-400 font-bold">{overview?.suspendedUsers || 0}</span></span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col justify-between">
              <div className="flex items-center justify-between text-[var(--text-secondary)] mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Tenant Workspaces</span>
                <Building className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-[var(--text-primary)]">{overview?.totalWorkspaces || 0}</div>
              <div className="mt-2 text-[11px] text-[var(--text-secondary)]">
                <span>Active Sessions: <span className="text-purple-300 font-bold">{overview?.activeSessions || 0}</span></span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col justify-between">
              <div className="flex items-center justify-between text-[var(--text-secondary)] mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Storage & Database</span>
                <HardDrive className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-[var(--text-primary)]">
                {overview?.storage?.uploadSizeMb || 0} <span className="text-sm font-normal text-[var(--text-secondary)]">MB</span>
              </div>
              <div className="mt-2 text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
                <span>Files: <span className="text-[var(--text-primary)] font-mono">{overview?.storage?.uploadFilesCount || 0}</span></span>
                <span>DB: <span className="text-[var(--text-primary)] font-mono">{overview?.storage?.dbSizeKb || 0} KB</span></span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col justify-between">
              <div className="flex items-center justify-between text-[var(--text-secondary)] mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">System Uptime</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-[var(--text-primary)] font-mono">
                {Math.floor((overview?.systemUptime || 0) / 60)}m {Math.floor((overview?.systemUptime || 0) % 60)}s
              </div>
              <div className="mt-2 text-[11px] text-[var(--text-secondary)]">
                Node {overview?.nodeVersion} â€¢ Express 4.21
              </div>
            </div>
          </div>

          {/* Autonomous Scheduler & Infrastructure Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Play className="w-5 h-5 text-[#00D6B2]" />
                  <h3 className="font-bold text-[var(--text-primary)] text-base">Autonomous Background Scheduler</h3>
                </div>
                <button
                  onClick={handleRunScheduler}
                  className="px-3 py-1.5 rounded-lg bg-[#00D6B2] hover:bg-emerald-400 text-black font-bold text-xs flex items-center space-x-1.5 shadow"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Run Cycle Now</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
                  <span className="text-[var(--text-secondary)] block mb-1">Heartbeat Status</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Active (Every 30s)
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
                  <span className="text-[var(--text-secondary)] block mb-1">Posts Auto-Published</span>
                  <span className="text-[var(--text-primary)] font-bold font-mono text-sm">
                    {schedulerStatus?.publishedPostsCounter || 0} posts
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Maintenance Switch */}
            <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className={`w-5 h-5 ${systemSettings?.maintenanceMode ? 'text-rose-400' : 'text-[var(--text-secondary)]'}`} />
                    <h3 className="font-bold text-[var(--text-primary)] text-base">Platform Maintenance Switch</h3>
                  </div>
                  <span className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                    systemSettings?.maintenanceMode
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                  }`}>
                    {systemSettings?.maintenanceMode ? 'MAINTENANCE ACTIVE' : 'PLATFORM LIVE'}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-2">
                  When enabled, non-admin visitors will see an HTTP 503 maintenance screen. Only the GOD Owner and Super Admins can access the system.
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[var(--border-color)]">
                <span className="text-xs text-[var(--text-secondary)] font-medium">Toggle Status Immediately:</span>
                <button
                  onClick={handleToggleMaintenance}
                  disabled={isUpdatingMaintenance}
                  className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-2 transition ${
                    systemSettings?.maintenanceMode
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'
                      : 'bg-rose-600 hover:bg-rose-500 text-[var(--text-primary)] shadow-lg shadow-rose-600/20'
                  }`}
                >
                  <span>{systemSettings?.maintenanceMode ? 'Deactivate Maintenance (Go Live)' : 'Activate Maintenance Mode'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. TAB 2: USER GOVERNANCE & RBAC */}
      {activeSubTab === 'users' && (
        <div className="space-y-4">
          {/* Privacy Notice Banner */}
          <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>
                <strong className="text-[var(--text-primary)]">Strict Privacy Boundary Active:</strong> User passwords, cryptographic hashes, private files, and personal project notes are permanently shielded and completely excluded from administrative APIs.
              </span>
            </div>
            <span className="font-mono text-[10px] bg-indigo-500/20 px-2 py-0.5 rounded text-indigo-300 border border-indigo-500/40">
              Zero-Knowledge Credential Security
            </span>
          </div>

          {/* Search bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-3 text-[var(--text-secondary)]" />
              <input
                type="text"
                placeholder="Search by email, name, role, or user ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl pl-9 pr-4 py-2 text-xs text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2]"
              />
            </div>
            <div className="text-xs text-[var(--text-secondary)] font-mono">
              Showing {filteredUsers.length} of {usersList.length} accounts
            </div>
          </div>

          {/* User Table */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                <thead className="bg-[var(--bg-surface)]/80 text-[11px] uppercase font-mono text-[var(--text-secondary)] border-b border-[var(--border-color)]">
                  <tr>
                    <th className="py-3 px-4">User Identity</th>
                    <th className="py-3 px-4">Account Status</th>
                    <th className="py-3 px-4">Assigned Role</th>
                    <th className="py-3 px-4">Workspaces</th>
                    <th className="py-3 px-4">Registration Date</th>
                    <th className="py-3 px-4 text-right">Administrative Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredUsers.map((u) => {
                    const isTargetGod = u.email.toLowerCase() === 'saidreda2810@gmail.com' || u.role === 'god';
                    return (
                      <tr key={u.id} className={`hover:bg-white/[0.02] transition ${isTargetGod ? 'bg-amber-500/[0.03]' : ''}`}>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                              isTargetGod
                                ? 'bg-gradient-to-tr from-amber-500 to-yellow-300 text-black border border-amber-300 shadow-md shadow-amber-500/20'
                                : 'bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)]'
                            }`}>
                              {isTargetGod ? 'ðŸ‘‘' : u.fullName ? u.fullName[0].toUpperCase() : 'U'}
                            </div>
                            <div className="truncate">
                              <div className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                <span>{u.fullName}</span>
                                {isTargetGod && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/50 font-black">
                                    PRIMARY OWNER
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-mono text-[var(--text-secondary)]">{u.email}</div>
                              <div className="text-[10px] font-mono text-[var(--text-muted)]">ID: {u.id}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold border ${
                              u.status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}>
                              {u.status.toUpperCase()}
                            </span>
                            {u.isEmailVerified ? (
                              <span title="Email Verified" className="text-emerald-400 flex items-center text-[10px]">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </span>
                            ) : (
                              <span title="Unverified Email" className="text-amber-400 flex items-center text-[10px]">
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {isTargetGod ? (
                            <span className="font-mono text-xs font-bold text-amber-300 flex items-center gap-1">
                              <Crown className="w-3.5 h-3.5 text-amber-400" /> GOD
                            </span>
                          ) : (
                            <select
                              value={u.role}
                              disabled={!isSuperAdmin}
                              onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole, u.email)}
                              className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2] font-mono"
                            >
                              {isGod && <option value="super_admin">super_admin</option>}
                              <option value="admin">admin</option>
                              <option value="moderator">moderator</option>
                              <option value="support">support</option>
                              <option value="user">user</option>
                            </select>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="text-xs text-[var(--text-secondary)] font-mono">
                            {u.workspaceCount || 1} workspace{u.workspaceCount !== 1 ? 's' : ''}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-[var(--text-secondary)] font-mono text-[11px]">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            {/* Suspend / Reactivate */}
                            {!isTargetGod ? (
                              <button
                                onClick={() => handleToggleStatus(u.id, u.status, u.email)}
                                title={u.status === 'active' ? 'Suspend account' : 'Reactivate account'}
                                className={`p-1.5 rounded-lg border transition ${
                                  u.status === 'active'
                                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                                }`}
                              >
                                {u.status === 'active' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                              </button>
                            ) : (
                              <span className="text-[10px] font-mono text-amber-500/50 italic px-2">Immune</span>
                            )}

                            {/* Delete Account */}
                            {!isTargetGod && isSuperAdmin && (
                              <button
                                onClick={() => handleDeleteUser(u.id, u.email)}
                                title="Permanently delete account"
                                className="p-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-red-400 hover:border-red-500/40 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB 3: WEBSITE CONTROL, MAINTENANCE & ANNOUNCEMENTS */}
      {activeSubTab === 'system' && (
        <div className="space-y-6">
          {/* Maintenance Mode Configuration */}
          <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-amber-400" />
                  Maintenance Mode & System Lockdown
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Locks non-admin access and displays customizable message across all public and tenant routes.
                </p>
              </div>
              <button
                onClick={handleToggleMaintenance}
                disabled={isUpdatingMaintenance}
                className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-2 transition ${
                  systemSettings?.maintenanceMode
                    ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                    : 'bg-rose-600 text-[var(--text-primary)] shadow-lg shadow-rose-600/20'
                }`}
              >
                <span>{systemSettings?.maintenanceMode ? 'Disable Maintenance (Go Live)' : 'Activate Maintenance Mode'}</span>
              </button>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Custom Maintenance Message Broadcasted to Users:</label>
              <textarea
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                rows={2}
                placeholder="The platform is undergoing scheduled maintenance..."
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-3 text-xs text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2]"
              />
            </div>
          </div>

          {/* Broadcast Announcements */}
          <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
                  <Bell className="w-5 h-5 text-cyan-400" />
                  Global Broadcast Announcements
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Active announcements appear as a top banner for all users in the application.
                </p>
              </div>
              <button
                onClick={() => setIsCreatingAnn(!isCreatingAnn)}
                className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-semibold text-xs flex items-center gap-1.5"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>{isCreatingAnn ? 'Cancel' : 'New Announcement'}</span>
              </button>
            </div>

            {/* Create Announcement Modal / Form */}
            {isCreatingAnn && (
              <form onSubmit={handleAddAnnouncement} className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] text-[var(--text-secondary)] font-medium">Title</label>
                    <input
                      type="text"
                      value={annTitle}
                      onChange={(e) => setAnnTitle(e.target.value)}
                      placeholder="e.g. Scheduled YouTube API maintenance at midnight..."
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2]"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[var(--text-secondary)] font-medium">Alert Type</label>
                    <select
                      value={annType}
                      onChange={(e) => setAnnType(e.target.value as any)}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]"
                    >
                      <option value="info">Info (Blue)</option>
                      <option value="warning">Warning (Amber)</option>
                      <option value="alert">Alert (Red)</option>
                      <option value="success">Success (Emerald)</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-[var(--text-secondary)] font-medium">Message Details</label>
                  <textarea
                    value={annMessage}
                    onChange={(e) => setAnnMessage(e.target.value)}
                    rows={2}
                    placeholder="Provide full announcement details..."
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg p-2.5 text-xs text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2]"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingAnn(false)}
                    className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-[#00D6B2] hover:bg-emerald-400 text-black font-bold text-xs shadow"
                  >
                    Publish Announcement
                  </button>
                </div>
              </form>
            )}

            {/* List of active announcements */}
            <div className="space-y-2">
              {systemSettings?.announcements?.length === 0 ? (
                <div className="p-4 rounded-xl bg-[var(--bg-surface)] text-center text-xs text-[var(--text-muted)]">
                  No active system announcements.
                </div>
              ) : (
                systemSettings?.announcements?.map((ann: any) => (
                  <div key={ann.id} className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono uppercase font-bold px-1.5 py-0.2 rounded border ${
                          ann.type === 'alert'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : ann.type === 'warning'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        }`}>
                          {ann.type}
                        </span>
                        <h4 className="font-bold text-[var(--text-primary)] text-xs">{ann.title}</h4>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">{ann.message}</p>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono mt-1">
                        Posted by {ann.createdBy || 'System'} â€¢ {new Date(ann.createdAt).toLocaleString()}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteAnnouncement(ann.id)}
                      className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-rose-400 hover:bg-rose-500/10 transition"
                      title="Remove announcement"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. TAB 4: SESSIONS & MFA SECURITY */}
      {/* TAB: VIDEO UPLOAD & STORAGE */}
      {activeSubTab === 'maintenance' && <MaintenancePanel />}
      {(activeSubTab as string) === 'storage' && <UploadPolicyPanel />}

      {/* GOD ONLY â€” Platform Developer Settings (OAuth credentials) */}
      {activeSubTab === 'developer' && isGod && <DeveloperSettingsPanel />}

      {activeSubTab === 'security' && (
        <div className="space-y-6">
          {/* Administrator Multi-Factor Authentication */}
          <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <KeyRound className="w-6 h-6 text-amber-400" />
                <div>
                  <h3 className="font-bold text-[var(--text-primary)] text-base">Two-Factor Authentication (MFA)</h3>
                  <p className="text-xs text-[var(--text-secondary)]">Protects your administrator account with a secondary verification code.</p>
                </div>
              </div>
              <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full border ${
                user?.mfaEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/50'
              }`}>
                {user?.mfaEnabled ? 'MFA ACTIVE' : 'MFA NOT CONFIGURED'}
              </span>
            </div>

            <p className="text-xs text-[var(--text-secondary)]">
              Two-factor authentication is not available yet — it will return with a real TOTP implementation.
            </p>
          </div>

          {/* Active User Sessions */}
          <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
                  <Lock className="w-5 h-5 text-purple-400" />
                  Active User Sessions & Revocation
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Monitor active cryptographic session tokens across all users and terminate suspicious connections.
                </p>
              </div>
              <span className="text-xs font-mono text-purple-300 font-bold bg-purple-500/10 px-2.5 py-1 rounded-full border border-purple-500/30">
                {sessionsList.length} Active Sessions
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                <thead className="bg-[var(--bg-surface)] text-[11px] uppercase font-mono text-[var(--text-secondary)] border-b border-[var(--border-color)]">
                  <tr>
                    <th className="py-2.5 px-3">Session User</th>
                    <th className="py-2.5 px-3">IP Address</th>
                    <th className="py-2.5 px-3">User Agent</th>
                    <th className="py-2.5 px-3">Issued</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sessionsList.map((ses) => (
                    <tr key={ses.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-3">
                        <div className="font-bold text-[var(--text-primary)]">{ses.user?.fullName || 'User'}</div>
                        <div className="text-[11px] font-mono text-[var(--text-secondary)]">{ses.user?.email || ses.userId}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-cyan-300">{ses.ip}</td>
                      <td className="py-3 px-3 text-[var(--text-secondary)] max-w-[200px] truncate" title={ses.userAgent}>
                        {ses.userAgent}
                      </td>
                      <td className="py-3 px-3 font-mono text-[var(--text-secondary)] text-[11px]">
                        {new Date(ses.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleRevokeSession(ses.id)}
                          className="px-2.5 py-1 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 7. TAB 5: AUDIT TRAIL TELEMETRY */}
      {activeSubTab === 'audit' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center justify-between">
            <div>
              <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                Immutable Administrative Audit Trail
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Real-time recording of privileged actions, status transitions, and security events.
              </p>
            </div>
            <button
              onClick={fetchData}
              className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-slate-700 text-[var(--text-primary)] text-xs flex items-center gap-1.5"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Refresh Log Stream</span>
            </button>
          </div>

          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                <thead className="bg-[var(--bg-surface)] text-[11px] uppercase font-mono text-[var(--text-secondary)] border-b border-[var(--border-color)]">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Action Type</th>
                    <th className="py-3 px-4">Details</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Client IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4 text-[var(--text-secondary)] whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-[var(--bg-surface-hover)] text-[#00D6B2] font-bold">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-sans text-xs text-[var(--text-primary)] max-w-md">
                        {log.details}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)] truncate max-w-[150px]">
                        {log.userEmail || log.userId || 'System'}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-muted)]">
                        {log.ip || '127.0.0.1'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
