import React, { useMemo, useState, useEffect } from 'react';
import { usePublisher } from '../context/PublisherContext';
import {
  PlusCircle, Search, RefreshCw, LayoutGrid, CalendarDays, List,
  Play, Pause, CheckCircle2, XCircle, Clock, Film, Trash2,
  MoreHorizontal, ChevronDown, AlertTriangle, Send, CalendarClock,
  Star, Copy, Eye, ArrowUpDown, Filter, X, Bell, BarChart3, Download,
} from 'lucide-react';
import { ScheduledPost, Platform } from '../types';
import { apiFetch } from '../lib/api';

type Priority = 'urgent' | 'high' | 'normal' | 'low';
const PRIORITIES: Priority[] = ['urgent', 'high', 'normal', 'low'];
const PRIORITY_STYLE: Record<Priority, string> = {
  urgent: 'text-rose-400 border-rose-500/40 bg-rose-500/10',
  high: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  normal: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
  low: 'text-[var(--text-muted)] border-[var(--border-color)] bg-[var(--bg-main)]/40',
};

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'text-[var(--text-secondary)] border-slate-500/40 bg-slate-500/10' },
  scheduled: { label: 'Scheduled', cls: 'text-sky-400 border-sky-500/40 bg-sky-500/10' },
  optimizing: { label: 'Optimizing', cls: 'text-violet-400 border-violet-500/40 bg-violet-500/10' },
  publishing: { label: 'Publishing', cls: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
  published: { label: 'Published', cls: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' },
  failed: { label: 'Failed', cls: 'text-rose-400 border-rose-500/40 bg-rose-500/10' },
  paused: { label: 'Paused', cls: 'text-[var(--text-muted)] border-[var(--border-color)] bg-[var(--bg-main)]/40' },
};

const PLATFORM_ICON: Record<string, string> = { youtube: 'YT', instagram: 'IG', tiktok: 'TT', facebook: 'FB' };
const PLATFORM_COLOR: Record<string, string> = {
  youtube: '#FF0000', instagram: '#E1306C', tiktok: '#00f2ea', facebook: '#1877F2',
};

const fmtDT = (iso?: string) => iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const prioOf = (p: ScheduledPost): Priority => (p as any).priority || 'normal';

export const PublishingQueueView: React.FC<{ onOpenNewPost: () => void }> = ({ onOpenNewPost }) => {
  const { posts, videos, brands, accounts, projects, publishPostNow, deletePost, updatePost, reschedulePost } = usePublisher();

  /* ---------- view / filters ---------- */
  const [view, setView] = useState<'cards' | 'timeline'>(() => {
    try { return (localStorage.getItem('pq_view') as any) || 'cards'; } catch { return 'cards'; }
  });
  const [query, setQuery] = useState('');
  const [fBrand, setFBrand] = useState('all');
  const [fProject, setFProject] = useState('all');
  const [fPlatform, setFPlatform] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [fPriority, setFPriority] = useState('all');
  const [fRange, setFRange] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState<0 | 15 | 30>(15);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [refreshTick, setRefreshTick] = useState(0);

  /* ---------- selection / bulk ---------- */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /* ---------- detail / actions ---------- */
  const [detailId, setDetailId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [reschedFor, setReschedFor] = useState<string | null>(null);
  const [reschedTime, setReschedTime] = useState('');
  const [publishingId, setPublishingId] = useState<string | null>(null);

  /* ---------- server-side queue state ---------- */
  const [queueStatus, setQueueStatus] = useState<any>(null);
  const [queueBusy, setQueueBusy] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [analyticsDays, setAnalyticsDays] = useState(30);

  const fetchExtras = () => {
    apiFetch(`/api/saas/queue/analytics?days=${analyticsDays}`).then((r) => r.json()).then((d) => { if (d.success) setAnalytics(d); }).catch(() => {});
    apiFetch('/api/saas/queue/notifications').then((r) => r.json()).then((d) => { if (d.success) setNotifications(d.notifications || []); }).catch(() => {});
  };
  useEffect(() => { if (showAnalytics) fetchExtras(); }, [showAnalytics, analyticsDays, refreshTick]);

  const fetchQueueStatus = () => {
    apiFetch('/api/saas/queue/status').then((r) => r.json()).then((d) => {
      if (d.success) setQueueStatus(d);
    }).catch(() => {});
  };

  useEffect(() => { fetchQueueStatus(); }, [refreshTick]);

  const toggleQueue = async () => {
    if (queueBusy || !queueStatus) return;
    setQueueBusy(true);
    try {
      if (queueStatus.paused) {
        const res = await apiFetch('/api/saas/queue/resume', { method: 'POST' });
        const d = await res.json();
        if (d.success) { setQueueStatus(d); alert('Queue resumed — eligible scheduled posts will publish normally.'); }
        else alert(d.error || 'Failed to resume queue');
      } else {
        // confirm when active jobs exist — pause won't interrupt them
        const res = await apiFetch('/api/saas/queue/pause', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmActive: queueStatus.activeJobs > 0 ? confirm(`Pause the queue?\n\n${queueStatus.activeJobs} job(s) are currently publishing — pausing will NOT interrupt them, it only prevents new jobs from starting.`) : true }),
        });
        const d = await res.json();
        if (d.needsConfirm) {
          // server asked for explicit confirmation
          const ok = confirm(`Pause the queue?\n\n${d.activeJobs} job(s) are currently publishing — paasing will NOT interrupt running jobs, only prevent new ones from starting.`);
          if (ok) {
            const res2 = await apiFetch('/api/saas/queue/pause', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmActive: true }) });
            const d2 = await res2.json();
            if (d2.success) setQueueStatus(d2); else alert(d2.error);
          }
        } else if (d.success) {
          setQueueStatus(d);
          alert('Queue paused — no new jobs will start. Running jobs continue to completion.');
        } else alert(d.error || 'Failed to pause queue');
      }
      fetchQueueStatus();
    } finally { setQueueBusy(false); }
  };

  /* auto-refresh (paused when tab hidden) */
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      if (!document.hidden) { setRefreshTick((n) => n + 1); setLastSync(new Date()); }
    }, autoRefresh * 1000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  const detailPost = posts.find((p) => p.id === detailId) || null;
  const detailVideo = detailPost ? videos.find((v) => v.id === detailPost.videoId) : null;
  const detailBrand = detailPost ? brands.find((b) => b.id === detailPost.brandId) : null;

  /* ---------- derived ---------- */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
    const monthEnd = new Date(now); monthEnd.setMonth(now.getMonth() + 1);

    return posts.filter((p) => {
      if (fStatus !== 'all' && p.status !== fStatus) return false;
      if (fBrand !== 'all' && p.brandId !== fBrand) return false;
      if (fProject !== 'all') {
        const projId = p.projectId || videos.find((v) => v.id === p.videoId)?.projectId;
        if (projId !== fProject) return false;
      }
      if (fPlatform !== 'all' && !p.channelPlatforms.includes(fPlatform as Platform)) return false;
      if (fPriority !== 'all' && prioOf(p) !== fPriority) return false;
      if (fRange !== 'all' && p.scheduledTime) {
        const t = new Date(p.scheduledTime);
        if (fRange === 'today' && t < dayStart) return false;
        if (fRange === 'week' && (t < now || t > weekEnd)) return false;
        if (fRange === 'month' && (t < now || t > monthEnd)) return false;
      }
      if (q) {
        const brand = brands.find((b) => b.id === p.brandId)?.name || '';
        const hay = [p.title, p.caption, brand, ...(p.hashtags || []), ...(p.channelPlatforms || [])].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => new Date(a.scheduledTime || a.createdAt).getTime() - new Date(b.scheduledTime || b.createdAt).getTime());
  }, [posts, videos, query, fBrand, fProject, fPlatform, fStatus, fPriority, fRange, refreshTick]);

  const stats = useMemo(() => ({
    scheduled: posts.filter((p) => p.status === 'scheduled').length,
    publishing: posts.filter((p) => p.status === 'publishing' || p.status === 'optimizing').length,
    published: posts.filter((p) => p.status === 'published').length,
    failed: posts.filter((p) => p.status === 'failed').length,
    draft: posts.filter((p) => p.status === 'draft').length,
    paused: posts.filter((p) => p.status === 'paused').length,
  }), [posts]);

  const activeFilters = [query, fBrand !== 'all', fPlatform !== 'all', fStatus !== 'all', fPriority !== 'all', fRange !== 'all'].filter(Boolean).length;
  const clearFilters = () => { setQuery(''); setFBrand('all'); setFProject('all'); setFPlatform('all'); setFStatus('all'); setFPriority('all'); setFRange('all'); };

  /* ---------- actions ---------- */
  const statClick = (s: string) => {
    setFStatus(fStatus === s ? 'all' : s);
    setView('cards');
  };

  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const visibleIds = filtered.map((p) => p.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggleAllVisible = () => setSelected(allVisibleSelected ? new Set() : new Set(visibleIds));

  const doReschedule = (postId: string) => {
    const t = new Date(reschedTime);
    if (isNaN(t.getTime())) return;
    if (t.getTime() < Date.now() - 60000) { alert('Cannot schedule in the past.'); return; }
    const post = posts.find((p) => p.id === postId);
    if (post?.lockedForPublishing || post?.status === 'publishing') { alert('This post is currently publishing and cannot be rescheduled.'); return; }
    reschedulePost(postId, t.toISOString(), 'Manual reschedule from queue');
    setReschedFor(null); setReschedTime('');
  };

  const setPriority = (postId: string, prio: Priority) => {
    const post = posts.find((p) => p.id === postId);
    if (post?.lockedForPublishing || post?.status === 'publishing') return;
    updatePost(postId, { priority: prio } as any);
  };

  const bulkAction = (action: 'cancel' | 'delete' | 'priority', arg?: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const verb = action === 'delete' ? 'delete' : action === 'cancel' ? 'cancel' : 'update';
    if (!confirm(`${verb === 'delete' ? 'Delete' : verb === 'cancel' ? 'Cancel' : 'Update'} ${ids.length} post(s)?`)) return;
    let ok = 0, fail = 0;
    ids.forEach((id) => {
      const p = posts.find((x) => x.id === id);
      if (!p) { fail++; return; }
      if (p.lockedForPublishing || p.status === 'publishing') { fail++; return; }
      try {
        if (action === 'delete') deletePost(id);
        else if (action === 'cancel') updatePost(id, { status: 'draft' } as any);
        else if (action === 'priority') updatePost(id, { priority: arg as Priority } as any);
        ok++;
      } catch { fail++; }
    });
    alert(`${ok} succeeded, ${fail} failed/skipped (locked or publishing posts cannot be modified).`);
    setSelected(new Set());
  };

  const exportCSV = () => {
    const rows = [['id', 'title', 'brand', 'platforms', 'status', 'priority', 'scheduled', 'published', 'retries', 'error']];
    filtered.forEach((p) => {
      rows.push([
        p.id, p.title || '', brands.find((b) => b.id === p.brandId)?.name || '',
        (p.channelPlatforms || []).join('|'), p.status, prioOf(p),
        p.scheduledTime || '', p.publishedTime || '', String(p.retryCount || 0),
        p.lastPublishError?.message || '',
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `publora-queue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cardAction = (action: string, post: ScheduledPost) => {
    setMenuFor(null);
    switch (action) {
      case 'preview': setDetailId(post.id); break;
      case 'publish': if (!post.lockedForPublishing && post.status !== 'publishing') { setPublishingId(post.id); publishPostNow(post.id).finally(() => setPublishingId(null)); } break;
      case 'reschedule': setReschedFor(post.id); setReschedTime(post.scheduledTime ? post.scheduledTime.slice(0, 16) : ''); break;
      case 'priority': {
        const order: Priority[] = ['low', 'normal', 'high', 'urgent'];
        const next = order[(order.indexOf(prioOf(post)) + 1) % order.length];
        setPriority(post.id, next); break;
      }
      case 'cancel': if (!post.lockedForPublishing) updatePost(post.id, { status: 'draft' } as any); break;
      case 'delete': if (confirm(`Delete "${post.title || 'post'}"?`)) deletePost(post.id); break;
    }
  };

  /* ---------- render ---------- */
  const rangeOptions: [string, string][] = [['all', 'All time'], ['today', 'Today'], ['week', 'Next 7 days'], ['month', 'Next 30 days']];

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-8 py-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-[var(--border-color)] pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)] tracking-tight">Publishing Queue</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Monitor, schedule, and control every post across your brands and accounts.</p>
          <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1">
            Last sync {lastSync.toLocaleTimeString()}
            {autoRefresh > 0 && ` · auto-refresh ${autoRefresh}s`}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <select value={autoRefresh} onChange={(e) => setAutoRefresh(Number(e.target.value) as any)} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2.5 py-2 text-[11px] text-[var(--text-secondary)] focus:outline-none">
            <option value={0}>Manual</option><option value={15}>15s</option><option value={30}>30s</option>
          </select>
          <button type="button" onClick={() => setShowNotifs(!showNotifs)} className="relative p-2 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]" title="Publishing notifications">
            <Bell size={14} />
            {notifications.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-[var(--text-primary)] text-[8px] font-bold flex items-center justify-center">{Math.min(9, notifications.length)}</span>}
          </button>
          <button type="button" onClick={() => setShowAnalytics(!showAnalytics)} className={`px-3 py-2 rounded-lg border text-xs font-medium transition ${showAnalytics ? 'border-[var(--accent-primary)]/50 text-[var(--accent-primary)] bg-[var(--accent-subtle)]' : 'border-[var(--border-color)] text-[var(--text-secondary)]'}`}>Analytics</button>
          <button type="button" onClick={() => { setRefreshTick((n) => n + 1); setLastSync(new Date()); }} className="p-2 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]" title="Refresh"><RefreshCw size={14} /></button>
          <button type="button" onClick={onOpenNewPost} className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-xs font-bold flex items-center gap-1.5"><PlusCircle size={14} /> Compose New Post</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <StatCard label="Scheduled" value={stats.scheduled} icon={<Clock size={13} />} active={fStatus === 'scheduled'} onClick={() => statClick('scheduled')} />
        <StatCard label="Publishing" value={stats.publishing} icon={<Play size={13} />} active={fStatus === 'publishing' || fStatus === 'optimizing'} onClick={() => statClick('publishing')} />
        <StatCard label="Published" value={stats.published} icon={<CheckCircle2 size={13} />} active={fStatus === 'published'} onClick={() => statClick('published')} />
        <StatCard label="Failed" value={stats.failed} icon={<XCircle size={13} />} active={fStatus === 'failed'} warn={stats.failed > 0} onClick={() => statClick('failed')} />
        <StatCard label="Drafts" value={stats.draft} icon={<FileTextIcon />} active={fStatus === 'draft'} onClick={() => statClick('draft')} />
        <StatCard label="Paused" value={stats.paused} icon={<Pause size={13} />} active={fStatus === 'paused'} onClick={() => statClick('paused')} />
      </div>

      {/* Queue Control Center */}
      {queueStatus && (
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border ${queueStatus.paused ? 'border-amber-500/40 bg-amber-500/5' : 'border-[var(--border-color)] bg-[var(--bg-surface)]'}`}>
          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${queueStatus.paused ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            <div>
              <p className="text-xs font-bold text-[var(--text-primary)]">{queueStatus.paused ? 'Queue Paused' : 'Queue Active'}</p>
              <p className="text-[10px] text-[var(--text-muted)] font-mono">
                {queueStatus.activeJobs} publishing now · {queueStatus.pendingJobs} due · {queueStatus.totalScheduled} scheduled total
                {queueStatus.nextScheduled && ` · next: ${queueStatus.nextScheduled.title || 'post'} @ ${fmtDT(queueStatus.nextScheduled.scheduledTime)}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleQueue}
            disabled={queueBusy}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition disabled:opacity-50 flex items-center gap-1.5 ${queueStatus.paused ? 'bg-emerald-500 text-[var(--text-primary)] hover:bg-emerald-600' : 'bg-amber-500/90 text-black hover:bg-amber-400'}`}
          >
            {queueStatus.paused ? <Play size={13} /> : <Pause size={13} />}
            {queueBusy ? 'Working…' : queueStatus.paused ? 'Resume Queue' : 'Pause Queue'}
          </button>
        </div>
      )}

      {/* Notifications dropdown */}
      {showNotifs && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-3 max-h-72 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-[var(--text-primary)]">Publishing notifications</p>
            <button type="button" onClick={() => setShowNotifs(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={13} /></button>
          </div>
          {notifications.length === 0 ? <p className="text-[11px] text-[var(--text-muted)]">No publishing events yet.</p> : notifications.map((n) => (
            <button key={n.id} type="button" onClick={() => { setDetailId(n.postId); setShowNotifs(false); }} className="w-full text-start flex items-start gap-2 p-2 rounded-lg hover:bg-[var(--bg-surface-hover)] transition">
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${n.stage === 'completed' ? 'bg-emerald-400' : n.stage === 'failed' ? 'bg-rose-400' : 'bg-amber-400'}`} />
              <span className="min-w-0"><span className="block text-[11px] font-medium text-[var(--text-primary)] truncate">{n.postTitle}</span><span className="block text-[10px] text-[var(--text-muted)]">{n.message} · {fmtDT(n.ts)}</span></span>
            </button>
          ))}
        </div>
      )}

      {/* Analytics panel */}
      {showAnalytics && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5"><BarChart3 size={14} className="text-[var(--accent-primary)]" /> Queue analytics</p>
            <div className="flex items-center gap-2">
              <select value={analyticsDays} onChange={(e) => setAnalyticsDays(Number(e.target.value))} className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-md px-2 py-1 text-[10px] text-[var(--text-secondary)]">
                <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
              </select>
              <button type="button" onClick={exportCSV} className="px-2.5 py-1 rounded-md border border-[var(--border-color)] text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"><Download size={11} /> CSV</button>
            </div>
          </div>
          {analytics ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <MiniStat label="Posts" value={analytics.totals.posts} />
                <MiniStat label="Published" value={analytics.totals.published} />
                <MiniStat label="Failed" value={analytics.totals.failed} warn={analytics.totals.failed > 0} />
                <MiniStat label="Success rate" value={analytics.totals.successRate != null ? `${analytics.totals.successRate}%` : '—'} />
                <MiniStat label="Retries" value={analytics.totals.retrying} />
                <MiniStat label="Avg publish time" value={analytics.totals.avgPublishMs != null ? `${Math.round(analytics.totals.avgPublishMs / 60000)}m` : '—'} />
                <MiniStat label="Scheduled now" value={analytics.totals.scheduled} />
                <MiniStat label="Range" value={`${analytics.days}d`} />
              </div>
              {Object.keys(analytics.byPlatform || {}).length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">By platform</p>
                  <div className="space-y-1">
                    {Object.entries(analytics.byPlatform).map(([pl, s]: any) => (
                      <div key={pl} className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[var(--bg-main)]/40 text-[11px]">
                        <span className="text-[var(--text-secondary)] font-mono uppercase">{pl}</span>
                        <span className="font-mono text-[var(--text-primary)]">{s.published}/{s.total} ok · {s.failed} failed</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {analytics.topErrors?.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Top error classes</p>
                  <div className="flex flex-wrap gap-1.5">{analytics.topErrors.map(([cls, n]: any) => <span key={cls} className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-[10px] font-mono text-rose-300">{cls} ×{n}</span>)}</div>
                </div>
              )}
            </>
          ) : <p className="text-[11px] text-[var(--text-muted)]">Loading…</p>}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search posts, brands, hashtags…" className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg pl-9 pr-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]" />
        </div>
        <div className="flex items-center gap-1.5">
          <ViewBtn active={view === 'cards'} onClick={() => { setView('cards'); try { localStorage.setItem('pq_view', 'cards'); } catch {} }} icon={<LayoutGrid size={14} />} label="Cards" />
          <ViewBtn active={view === 'timeline'} onClick={() => { setView('timeline'); try { localStorage.setItem('pq_view', 'timeline'); } catch {} }} icon={<CalendarDays size={14} />} label="Timeline" />
          <button type="button" onClick={() => setShowFilters(!showFilters)} className={`px-3 py-2 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${showFilters || activeFilters ? 'border-[var(--accent-primary)]/50 text-[var(--accent-primary)] bg-[var(--accent-subtle)]' : 'border-[var(--border-color)] text-[var(--text-secondary)]'}`}>
            <Filter size={13} /> Filters{activeFilters > 0 && <span className="px-1.5 rounded-full bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-[9px] font-bold">{activeFilters}</span>}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)]/60">
          <FilterSelect label="Brand" value={fBrand} onChange={setFBrand} options={[['all', 'All brands'], ...brands.map((b) => [b.id, b.name] as [string, string])]} />
          <FilterSelect label="Project" value={fProject} onChange={setFProject} options={[['all', 'All projects'], ...(projects || []).filter((p: any) => fBrand === 'all' || p.brandId === fBrand).map((p: any) => [p.id, p.name] as [string, string])]} />
          <FilterSelect label="Platform" value={fPlatform} onChange={setFPlatform} options={[['all', 'All platforms'], ['youtube', 'YouTube'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['facebook', 'Facebook']]} />
          <FilterSelect label="Status" value={fStatus} onChange={setFStatus} options={[['all', 'All statuses'], ...Object.entries(STATUS_STYLE).map(([k, v]) => [k, v.label] as [string, string])]} />
          <FilterSelect label="Priority" value={fPriority} onChange={setFPriority} options={[['all', 'Any priority'], ...PRIORITIES.map((p) => [p, p[0].toUpperCase() + p.slice(1)] as [string, string])]} />
          <FilterSelect label="Date" value={fRange} onChange={(v) => setFRange(v as any)} options={rangeOptions} />
          <button type="button" onClick={clearFilters} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent-primary)] self-end pb-1.5 text-start">Clear all</button>
        </div>
      )}

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl border border-[var(--accent-primary)]/40 bg-[var(--accent-subtle)]">
          <span className="text-[11px] font-bold text-[var(--accent-primary)] px-1">{selected.size} selected</span>
          <BulkBtn onClick={() => bulkAction('priority', 'high')}>Priority: High</BulkBtn>
          <BulkBtn onClick={() => bulkAction('priority', 'urgent')}>Priority: Urgent</BulkBtn>
          <BulkBtn onClick={() => bulkAction('priority', 'normal')}>Priority: Normal</BulkBtn>
          <BulkBtn onClick={() => bulkAction('cancel')}>Cancel → Draft</BulkBtn>
          <BulkBtn onClick={() => bulkAction('delete')} danger>Delete</BulkBtn>
          <button type="button" onClick={() => setSelected(new Set())} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] ml-auto">Clear</button>
        </div>
      )}

      {/* Results meta */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-mono text-[var(--text-muted)]">{filtered.length} post{filtered.length === 1 ? '' : 's'}{activeFilters > 0 ? ` · ${activeFilters} filter${activeFilters > 1 ? 's' : ''}` : ''}</p>
        {filtered.length > 0 && (
          <button type="button" onClick={toggleAllVisible} className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent-primary)]">{allVisibleSelected ? 'Deselect all' : 'Select all visible'}</button>
        )}
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl">
          <Send size={32} className="text-[var(--text-muted)] mx-auto opacity-60 mb-3" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">{posts.length === 0 ? 'Queue is empty' : 'No matching posts'}</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">{posts.length === 0 ? 'Compose your first post to get started.' : 'Try adjusting filters.'}</p>
          {posts.length === 0 && <button type="button" onClick={onOpenNewPost} className="mt-4 px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-xs font-bold">Compose New Post</button>}
        </div>
      ) : view === 'cards' ? (
        <PostGrid posts={filtered} videos={videos} brands={brands} accounts={accounts} selected={selected} onToggle={toggleSelect} onOpen={setDetailId} menuFor={menuFor} setMenuFor={setMenuFor} onAction={cardAction} publishingId={publishingId} />
      ) : (
        <TimelineView posts={filtered} videos={videos} brands={brands} onOpen={setDetailId} />
      )}

      {/* Reschedule dialog */}
      {reschedFor && (
        <Modal onClose={() => setReschedFor(null)} title="Reschedule post">
          <div className="space-y-3">
            <input type="datetime-local" value={reschedTime} onChange={(e) => setReschedTime(e.target.value)} className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]" />
            <p className="text-[10px] text-[var(--text-muted)]">Times shown in your local timezone.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReschedFor(null)} className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)]">Cancel</button>
              <button type="button" onClick={() => doReschedule(reschedFor)} className="px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-xs font-bold">Reschedule</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Detail panel */}
      {detailPost && (
        <PostDetail
          post={detailPost} video={detailVideo} brand={detailBrand}
          onClose={() => setDetailId(null)}
          onPublish={() => { if (!detailPost.lockedForPublishing) { setPublishingId(detailPost.id); publishPostNow(detailPost.id).finally(() => setPublishingId(null)); } }}
          onReschedule={() => { setReschedFor(detailPost.id); setReschedTime(detailPost.scheduledTime?.slice(0, 16) || ''); setDetailId(null); }}
          onPriority={(p: Priority) => setPriority(detailPost.id, p)}
          onCancel={() => { if (!detailPost.lockedForPublishing) { updatePost(detailPost.id, { status: 'draft' } as any); setDetailId(null); } }}
          onDelete={() => { if (confirm('Delete this post?')) { deletePost(detailPost.id); setDetailId(null); } }}
          onRetry={() => { updatePost(detailPost.id, { status: 'scheduled', retryCount: 0, nextRetryAt: null, lastPublishError: null, lockedForPublishing: false } as any); }}
          onReview={(action: string) => {
            const entry = { ts: new Date().toISOString(), by: 'you', action };
            updatePost(detailPost.id, {
              reviewStatus: action === 'scheduled' ? 'none' : action,
              reviewNotes: [...(detailPost.reviewNotes || []), entry],
            } as any);
          }}
          publishing={publishingId === detailPost.id}
        />
      )}
    </div>
  );
};

/* ================= sub-components ================= */

const FileTextIcon = () => <Film size={13} />;

const StatCard: React.FC<{ label: string; value: number; icon: React.ReactNode; active?: boolean; warn?: boolean; onClick: () => void }> = ({ label, value, icon, active, warn, onClick }) => (
  <button type="button" onClick={onClick} className={`text-start bg-[var(--bg-surface)] border rounded-xl px-3.5 py-3 transition ${active ? 'border-[var(--accent-primary)]' : 'border-[var(--border-color)] hover:border-[var(--text-muted)]'}`}>
    <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">{icon}{label}</div>
    <div className={`text-lg font-bold mt-1 ${warn ? 'text-rose-400' : 'text-[var(--text-primary)]'}`}>{value}</div>
  </button>
);

const ViewBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button type="button" onClick={onClick} className={`px-3 py-2 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${active ? 'border-[var(--accent-primary)]/50 text-[var(--accent-primary)] bg-[var(--accent-subtle)]' : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>{icon}{label}</button>
);

const FilterSelect: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: [string, string][] }> = ({ label, value, onChange, options }) => (
  <label className="block">
    <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-0.5 w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-md px-2 py-1.5 text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]">
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  </label>
);

const BulkBtn: React.FC<{ onClick: () => void; children: React.ReactNode; danger?: boolean }> = ({ onClick, children, danger }) => (
  <button type="button" onClick={onClick} className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition ${danger ? 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10' : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'}`}>{children}</button>
);

const MiniStat: React.FC<{ label: string; value: React.ReactNode; warn?: boolean }> = ({ label, value, warn }) => (
  <div className="bg-[var(--bg-main)]/40 border border-[var(--border-color)] rounded-lg px-3 py-2.5">
    <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
    <p className={`text-sm font-bold mt-0.5 ${warn ? 'text-rose-400' : 'text-[var(--text-primary)]'}`}>{value}</p>
  </div>
);

const Modal: React.FC<{ onClose: () => void; title: string; children: React.ReactNode }> = ({ onClose, title, children }) => (
  <div className="fixed inset-0 z-[115] bg-[var(--bg-overlay)] backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl max-w-sm w-full p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3><button type="button" onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={15} /></button></div>
      {children}
    </div>
  </div>
);

function PostMenu({ post, onAction, open, setOpen }: { post: ScheduledPost; onAction: (a: string, p: ScheduledPost) => void; open: boolean; setOpen: (v: string | null) => void }) {
  const locked = post.lockedForPublishing || post.status === 'publishing';
  const items: [string, string][] = [
    ['preview', 'Preview'],
    ...(locked ? [] : ([['publish', post.status === 'published' ? 'Publish again' : 'Publish now'], ['reschedule', 'Reschedule'], ['priority', `Cycle priority (${prioOf(post)})`]] as [string, string][])),
    ...(post.status !== 'published' && post.status !== 'draft' ? [['cancel', 'Cancel → Draft']] as [string, string][] : []),
    ['delete', 'Delete'],
  ];
  return (
    <div className="relative">
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(open ? null : post.id); }} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition" aria-label="Post actions"><MoreHorizontal size={14} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(null)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-xl py-1 text-[11px]">
            {items.map(([a, l]) => <button key={a} type="button" onClick={(e) => { e.stopPropagation(); onAction(a, post); }} className={`w-full text-start px-3 py-1.5 hover:bg-[var(--bg-surface-hover)] ${a === 'delete' ? 'text-rose-400' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>{l}</button>)}
          </div>
        </>
      )}
    </div>
  );
}

function PostCard({ post, video, brand, selected, onToggle, onOpen, menuFor, setMenuFor, onAction, publishing }: any) {
  const st = STATUS_STYLE[post.status] || STATUS_STYLE.draft;
  const prio = prioOf(post);
  return (
    <div className={`bg-[var(--bg-surface)] border rounded-xl overflow-hidden group transition cursor-pointer ${selected ? 'border-[var(--accent-primary)]' : 'border-[var(--border-color)] hover:border-[var(--text-muted)]'}`} onClick={() => onOpen(post.id)}>
      <div className="relative">
        <div className="h-36 bg-[var(--bg-main)] flex items-center justify-center overflow-hidden">
          {video?.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" /> : <Film size={26} className="text-[var(--text-muted)]" />}
        </div>
        <div className="absolute top-2 left-2" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={onToggle} className={`p-1 rounded transition ${selected ? 'text-[var(--accent-primary)]' : 'text-[var(--text-primary)]/70 hover:text-[var(--text-primary)]'}`}>
            {selected ? <CheckCircle2 size={15} /> : <div className="w-4 h-4 rounded border border-[var(--border-color)]0" />}
          </button>
        </div>
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition" onClick={(e) => e.stopPropagation()}>
          <PostMenu post={post} open={menuFor === post.id} setOpen={setMenuFor} onAction={onAction} />
        </div>
        <div className="absolute bottom-2 left-2 flex gap-1">
          {(post.channelPlatforms || []).map((p: string) => (
            <span key={p} className="px-1.5 py-0.5 rounded text-[9px] font-bold text-[var(--text-primary)]" style={{ backgroundColor: PLATFORM_COLOR[p] || '#555' }}>{PLATFORM_ICON[p] || p.slice(0, 2).toUpperCase()}</span>
          ))}
        </div>
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-[var(--bg-input)] font-mono text-[10px] text-[var(--text-primary)]">{fmtDT(post.scheduledTime)}</div>
      </div>
      <div className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1 flex-1">{post.title || video?.title || 'Untitled post'}</h3>
          <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[9px] font-mono uppercase ${st.cls}`}>{post.status === 'publishing' || post.status === 'optimizing' ? 'Processing' : st.label}</span>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] line-clamp-1">{brand?.name || 'No brand'} · {post.hashtags?.slice(0, 2).join(' ') || ''}</p>
        <div className="flex items-center justify-between pt-0.5">
          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono uppercase ${PRIORITY_STYLE[prio]}`}>{prio}</span>
          <span className="text-[9px] font-mono text-[var(--text-muted)]">{post.lockedForPublishing || post.status === 'publishing' ? '🔒 locked' : 'editable'}</span>
        </div>
      </div>
    </div>
  );
}

function PostGrid({ posts, videos, brands, accounts, selected, onToggle, onOpen, menuFor, setMenuFor, onAction, publishingId }: any) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {posts.map((p: ScheduledPost) => (
        <PostCard
          key={p.id} post={p}
          video={videos.find((v: any) => v.id === p.videoId)}
          brand={brands.find((b: any) => b.id === p.brandId)}
          selected={selected.has(p.id)}
          onToggle={() => onToggle(p.id)}
          onOpen={onOpen}
          menuFor={menuFor} setMenuFor={setMenuFor} onAction={onAction}
          publishing={publishingId === p.id}
        />
      ))}
    </div>
  );
}

function TimelineView({ posts, videos, brands, onOpen }: any) {
  const groups = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    posts.forEach((p: ScheduledPost) => {
      const key = p.scheduledTime ? new Date(p.scheduledTime).toDateString() : 'Unscheduled';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] === 'Unscheduled' ? 1 : b[0] === 'Unscheduled' ? -1 : new Date(a[0]).getTime() - new Date(b[0]).getTime());
  }, [posts]);

  if (groups.length === 0) return null;
  return (
    <div className="space-y-5">
      {groups.map(([day, items]) => (
        <div key={day}>
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-2"><CalendarClock size={11} />{day}</p>
          <div className="relative pl-5 space-y-2 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-[var(--border-color)]">
            {items.map((p: ScheduledPost) => {
              const video = videos.find((v: any) => v.id === p.videoId);
              const brand = brands.find((b: any) => b.id === p.brandId);
              const st = STATUS_STYLE[p.status] || STATUS_STYLE.draft;
              return (
                <button key={p.id} type="button" onClick={() => onOpen(p.id)} className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)]/50 transition text-start">
                  <span className="absolute -left-[13px] w-2.5 h-2.5 rounded-full border-2 border-[var(--bg-main)]" style={{ backgroundColor: p.status === 'published' ? '#34d399' : p.status === 'failed' ? '#fb7185' : p.status === 'publishing' ? '#fbbf24' : '#38bdf8' }} />
                  <div className="w-12 h-8 rounded-md overflow-hidden bg-[var(--bg-main)] shrink-0">
                    {video?.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Film size={10} className="text-[var(--text-muted)]" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--text-primary)] truncate">{p.title || video?.title || 'Untitled'}</p>
                    <p className="text-[10px] font-mono text-[var(--text-muted)]">{new Date(p.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {brand?.name || '—'} · {(p.channelPlatforms || []).join(', ')}</p>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono ${st.cls}`}>{st.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PostDetail({ post, video, brand, onClose, onPublish, onReschedule, onPriority, onCancel, onDelete, onRetry, onReview, publishing }: any) {
  const st = STATUS_STYLE[post.status] || STATUS_STYLE.draft;
  const prio = prioOf(post);
  const locked = post.lockedForPublishing || post.status === 'publishing' || post.status === 'published';
  return (
    <div className="fixed inset-0 z-[105] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-[var(--bg-input)] backdrop-blur-sm" />
      <div className="relative w-full max-w-md h-full bg-[var(--bg-surface)] border-l border-[var(--border-color)] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[var(--bg-surface)] border-b border-[var(--border-color)] px-5 py-4 flex items-center justify-between z-10">
          <h3 className="text-sm font-bold text-[var(--text-primary)] truncate pr-3">{post.title || video?.title || 'Post'}</h3>
          <button type="button" onClick={onClose} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-5">
          {video?.thumbnailUrl || video?.fileUrl ? (
            <div className="rounded-xl overflow-hidden bg-black">
              {video.fileUrl ? <video src={video.fileUrl} controls preload="metadata" className="w-full max-h-56 object-contain" /> : <img src={video.thumbnailUrl} alt="" className="w-full max-h-56 object-cover" />}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            <span className={`px-2 py-1 rounded-lg border text-[10px] font-mono ${st.cls}`}>{st.label}</span>
            <span className={`px-2 py-1 rounded-lg border text-[10px] font-mono ${PRIORITY_STYLE[prio]}`}>{prio} priority</span>
            {post.reviewStatus && post.reviewStatus !== 'none' && (
              <span className={`px-2 py-1 rounded-lg border text-[10px] font-mono ${post.reviewStatus === 'approved' ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' : post.reviewStatus === 'rejected' ? 'text-rose-400 border-rose-500/40 bg-rose-500/10' : post.reviewStatus === 'pending' ? 'text-amber-400 border-amber-500/40 bg-amber-500/10' : 'text-sky-400 border-sky-500/40 bg-sky-500/10'}`}>
                {post.reviewStatus.replace('_', ' ')}
              </span>
            )}
            {locked && <span className="px-2 py-1 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px] font-mono">🔒 Locked</span>}
          </div>

          {/* Approval workflow */}
          {!locked && post.status !== 'published' && (
            <div className="flex flex-wrap gap-1.5">
              {(!post.reviewStatus || post.reviewStatus === 'none' || post.reviewStatus === 'rejected' || post.reviewStatus === 'changes_requested') && (
                <PanelBtn onClick={() => onReview('pending')}>Submit for review</PanelBtn>
              )}
              {post.reviewStatus === 'pending' && (
                <>
                  <PanelBtn onClick={() => onReview('approved')}><CheckCircle2 size={11} className="inline mr-1" />Approve</PanelBtn>
                  <PanelBtn onClick={() => onReview('changes_requested')}>Request changes</PanelBtn>
                  <PanelBtn onClick={() => onReview('rejected')} danger>Reject</PanelBtn>
                </>
              )}
              {post.reviewStatus === 'approved' && (
                <PanelBtn onClick={() => onReview('scheduled' as any)}>Mark scheduled</PanelBtn>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {!locked && post.status !== 'published' && <PanelBtn onClick={onPublish} primary>{publishing ? 'Publishing…' : 'Publish now'}</PanelBtn>}
            {!locked && <PanelBtn onClick={onReschedule}><CalendarClock size={11} className="inline mr-1" />Reschedule</PanelBtn>}
            {!locked && post.status !== 'published' && post.status !== 'draft' && <PanelBtn onClick={onCancel}><Pause size={11} className="inline mr-1" />Cancel → Draft</PanelBtn>}
            <PanelBtn onClick={onDelete} danger><Trash2 size={11} className="inline mr-1" />Delete</PanelBtn>
          </div>

          {!locked && post.status !== 'published' && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Priority</p>
              <div className="flex gap-1.5">
                {PRIORITIES.map((p) => (
                  <button key={p} type="button" onClick={() => onPriority(p)} className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono uppercase transition ${prio === p ? PRIORITY_STYLE[p] + ' font-bold' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>{p}</button>
                ))}
              </div>
            </div>
          )}

          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Details</h4>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/40 px-3 py-1">
              {meta('Brand', brand?.name)}
              {meta('Platforms', (post.channelPlatforms || []).join(', '))}
              {meta('Scheduled', fmtDT(post.scheduledTime))}
              {meta('Published', fmtDT(post.publishedTime))}
              {meta('Mode', post.mode)}
              {meta('Created', fmtDT(post.createdAt))}
              {meta('Reschedule reason', post.rescheduleReason)}
            </div>
          </section>

          {post.lastPublishError && post.status === 'failed' && (
            <PanelBtn onClick={() => onRetry()}><RefreshCw size={11} className="inline mr-1" />Retry now</PanelBtn>
          )}
          {post.lastPublishError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
              <p className="text-[10px] font-mono uppercase tracking-wider text-rose-400 mb-1">Publish error · {post.lastPublishError.class}</p>
              <p className="text-xs text-rose-200">{post.lastPublishError.message}</p>
              {post.retryCount ? <p className="text-[10px] font-mono text-rose-300/70 mt-1">Retries: {post.retryCount}{post.nextRetryAt ? ` · next at ${fmtDT(post.nextRetryAt)}` : ''}</p> : null}
            </div>
          )}

          {(post.publishingEvents?.length ?? 0) > 0 && (
            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Publishing activity ({post.publishingEvents!.length})</h4>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {[...post.publishingEvents!].reverse().map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-[10px]">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${e.stage === 'completed' ? 'bg-emerald-400' : e.stage === 'failed' ? 'bg-rose-400' : e.stage === 'retry_scheduled' ? 'bg-amber-400' : 'bg-sky-400'}`} />
                    <div className="min-w-0">
                      <span className="font-mono text-[var(--text-muted)]">{new Date(e.ts).toLocaleTimeString()}</span>
                      <span className="text-[var(--text-secondary)] ml-1.5">{e.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {post.caption && (
            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Caption</h4>
              <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">{post.caption}</p>
              {(post.hashtags || []).length > 0 && <div className="flex flex-wrap gap-1 mt-2">{post.hashtags.map((h: string) => <span key={h} className="text-[10px] font-mono text-[var(--accent-primary)]">#{h}</span>)}</div>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const PanelBtn: React.FC<{ onClick: () => void; children: React.ReactNode; danger?: boolean; primary?: boolean }> = ({ onClick, children, danger, primary }) => (
  <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition ${primary ? 'bg-[var(--accent-primary)] border-transparent text-[var(--accent-primary-text)] hover:opacity-90' : danger ? 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10' : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'}`}>{children}</button>
);

function meta(label: string, value: React.ReactNode) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--border-subtle)] last:border-0">
      <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
      <span className="text-[10px] font-medium text-[var(--text-primary)] font-mono text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}
