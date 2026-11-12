import React, { useMemo, useState, useEffect } from 'react';
import { usePublisher } from '../context/PublisherContext';
import { useAuth } from '../context/AuthContext';
import { ScheduledPost, Platform, PostStatus, CalendarSettings } from '../types';
import { apiFetch } from '../lib/api';
import {
  ChevronLeft, ChevronRight, PlusCircle, Film, Clock, CheckCircle2,
  XCircle, AlertTriangle, CalendarDays, List, Rows3, CalendarRange,
  Search, Filter, Settings2, X, Play, Trash2, Edit3, Copy,
  Megaphone, Flag, Lightbulb, Users, CalendarClock, Bell,
} from 'lucide-react';

const STATUS_STYLE: Record<string, { label: string; cls: string; dot: string }> = {
  draft: { label: 'Draft', cls: 'text-[var(--text-secondary)] border-slate-500/40 bg-slate-500/10', dot: '#94a3b8' },
  scheduled: { label: 'Scheduled', cls: 'text-sky-400 border-sky-500/40 bg-sky-500/10', dot: '#38bdf8' },
  optimizing: { label: 'Optimizing', cls: 'text-violet-400 border-violet-500/40 bg-violet-500/10', dot: '#a78bfa' },
  publishing: { label: 'Publishing', cls: 'text-amber-400 border-amber-500/40 bg-amber-500/10', dot: '#fbbf24' },
  published: { label: 'Published', cls: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10', dot: '#34d399' },
  failed: { label: 'Failed', cls: 'text-rose-400 border-rose-500/40 bg-rose-500/10', dot: '#fb7185' },
  paused: { label: 'Paused', cls: 'text-[var(--text-muted)] border-[var(--border-color)] bg-[var(--bg-main)]/40', dot: '#84969f' },
};

const PLATFORM_COLOR: Record<string, string> = { youtube: '#FF0000', instagram: '#E1306C', tiktok: '#00f2ea', facebook: '#1877F2' };
const PLATFORM_ICON: Record<string, string> = { youtube: 'YT', instagram: 'IG', tiktok: 'TT', facebook: 'FB' };

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function fmtTime(iso: string | undefined, tz?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(tz ? { timeZone: tz } : {}) });
  } catch { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
}
function fmtDay(iso: string | undefined, tz?: string) {
  if (!iso) return 'Unscheduled';
  try {
    return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', ...(tz ? { timeZone: tz } : {}) });
  } catch { return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); }
}
function dayKey(iso: string | undefined, tz?: string) {
  if (!iso) return 'unscheduled';
  try {
    return new Date(iso).toLocaleDateString('en-CA', { ...(tz ? { timeZone: tz } : {}) }); // YYYY-MM-DD
  } catch { return new Date(iso).toISOString().split('T')[0]; }
}

export const PublishingCalendarView: React.FC<{ onOpenNewPost: () => void; onScheduleAt?: (iso: string) => void; setActiveTab?: (t: string) => void }> = ({ onOpenNewPost, onScheduleAt, setActiveTab }) => {
  const { posts, videos, brands, accounts, campaigns, contentPillars, contentIdeas, postComments, calendarSavedViews, calendarSettings, updateCalendar, updatePost, createPost, reschedulePost, deletePost, publishPostNow, refreshRemoteState } = usePublisher();
  const { activeWorkspace, memberRole, user } = useAuth();

  const settings = calendarSettings;
  const tz = settings.timezone;

  const [view, setView] = useState<CalendarSettings['defaultView']>(() => {
    try { return (localStorage.getItem('cal_view') as any) || settings.defaultView || 'month'; } catch { return 'month'; }
  });
  const [density, setDensity] = useState(settings.density || 'comfortable');
  const [cursor, setCursor] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [fBrand, setFBrand] = useState('all');
  const [fAccount, setFAccount] = useState('all');
  const [fPlatform, setFPlatform] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [fCampaign, setFCampaign] = useState('all');
  const [fPillar, setFPillar] = useState('all');
  const [showOrganize, setShowOrganize] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [savedViewName, setSavedViewName] = useState('');
  const [dayPopover, setDayPopover] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [reschedFor, setReschedFor] = useState<string | null>(null);
  const [reschedTime, setReschedTime] = useState('');
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);

  useEffect(() => {
    apiFetch('/api/saas/members').then((r) => r.json()).then((d) => { if (d.success) setWorkspaceMembers(d.members || []); }).catch(() => {});
  }, []);

  // Auto-refresh workspace state per calendar settings (pauses when tab hidden)
  useEffect(() => {
    const sec = settings.autoRefreshSec || 0;
    if (!sec) return;
    const t = setInterval(() => { if (!document.hidden) refreshRemoteState(); }, sec * 1000);
    return () => clearInterval(t);
  }, [settings.autoRefreshSec, refreshRemoteState]);

  const changeView = (v: CalendarSettings['defaultView']) => { setView(v); try { localStorage.setItem('cal_view', v); } catch {} updateCalendar({ calendarSettings: { ...settings, defaultView: v } }); };
  const changeDensity = (d: CalendarSettings['density']) => { setDensity(d); updateCalendar({ calendarSettings: { ...settings, density: d } }); };

  /* ---------- filtering ---------- */
  const filteredPosts = useMemo(() => posts.filter((p) => {
    if (fStatus !== 'all' && p.status !== fStatus) return false;
    if (fBrand !== 'all' && p.brandId !== fBrand) return false;
    if (fPlatform !== 'all' && !p.channelPlatforms.includes(fPlatform as Platform)) return false;
    if (fCampaign !== 'all' && (p as any).campaignId !== fCampaign) return false;
    if (fPillar !== 'all' && (p as any).pillarId !== fPillar) return false;
    if (fAccount !== 'all' && !((p as any).accountIds || []).includes(fAccount)) return false;
    if (query) {
      const hay = [p.title, p.caption, brands.find((b) => b.id === p.brandId)?.name || '', ...(p.hashtags || [])].join(' ').toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  }), [posts, fStatus, fBrand, fPlatform, fCampaign, fPillar, fAccount, query, brands]);

  const postsByDay = useMemo(() => {
    const m = new Map<string, ScheduledPost[]>();
    filteredPosts.forEach((p) => {
      const k = dayKey(p.scheduledTime, tz);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    });
    Object.values(Object.fromEntries(m)).forEach((arr: any) => arr.sort((a: ScheduledPost, b: ScheduledPost) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()));
    return m;
  }, [filteredPosts, tz]);

  /* ---------- real metrics ---------- */
  const metrics = useMemo(() => {
    const now = Date.now();
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getTime();
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime();
    const inMonth = filteredPosts.filter((p) => { const t = new Date(p.scheduledTime).getTime(); return t >= monthStart && t < monthEnd; });
    return {
      planned: inMonth.filter((p) => ['scheduled', 'optimizing', 'publishing', 'draft'].includes(p.status)).length,
      published: inMonth.filter((p) => p.status === 'published').length,
      pendingApproval: posts.filter((p) => p.reviewStatus === 'pending').length,
      failed: inMonth.filter((p) => p.status === 'failed').length,
      drafts: posts.filter((p) => p.status === 'draft').length,
      upcoming: filteredPosts.filter((p) => p.status === 'scheduled' && new Date(p.scheduledTime).getTime() > now).length,
      unscheduledIdeas: contentIdeas.filter((i) => i.status === 'idea' || i.status === 'draft').length,
    };
  }, [filteredPosts, posts, cursor, contentIdeas]);

  /* ---------- navigation ---------- */
  const nav = (dir: -1 | 1) => {
    const d = new Date(cursor);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  };
  const goToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); setCursor(d); };

  const rangeLabel = useMemo(() => {
    if (view === 'month') return `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (view === 'week') {
      const start = weekStart(cursor, settings.weekStartsOn);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      return `${fmtDay(start.toISOString(), tz)} – ${fmtDay(end.toISOString(), tz)}`;
    }
    if (view === 'day') return fmtDay(cursor.toISOString(), tz);
    return '';
  }, [view, cursor, settings.weekStartsOn, tz]);

  /* ---------- detail / actions ---------- */
  const detailPost = posts.find((p) => p.id === detailId) || null;
  const detailVideo = detailPost ? videos.find((v) => v.id === detailPost.videoId) : null;
  const detailBrand = detailPost ? brands.find((b) => b.id === detailPost.brandId) : null;

  const doReschedule = (postId: string) => {
    const t = new Date(reschedTime);
    if (isNaN(t.getTime())) return;
    if (t.getTime() < Date.now() - 60000) { alert('Cannot schedule in the past.'); return; }
    const post = posts.find((p) => p.id === postId);
    if (post?.lockedForPublishing || post?.status === 'publishing') { alert('Post is locked while publishing.'); return; }
    reschedulePost(postId, t.toISOString(), 'Rescheduled from calendar');
    setReschedFor(null);
  };

  /* ---------- month grid ---------- */
  const monthCells = useMemo(() => {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const startOffset = (first.getDay() - settings.weekStartsOn + 7) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = startOffset - 1; i >= 0; i--) cells.push({ date: new Date(y, m, -i), inMonth: false });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(y, m, d), inMonth: true });
    let next = 1;
    while (cells.length % 7 !== 0) cells.push({ date: new Date(y, m + 1, next++), inMonth: false });
    return cells;
  }, [cursor, settings.weekStartsOn]);

  const weekDays = useMemo(() => {
    const s = weekStart(cursor, settings.weekStartsOn);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(s); d.setDate(d.getDate() + i); return d; });
  }, [cursor, settings.weekStartsOn]);

  const isToday = (d: Date) => dayKey(d.toISOString(), tz) === dayKey(new Date().toISOString(), tz);

  /* ---------- real notification feed (computed from actual records) ---------- */
  const notifications = useMemo(() => {
    const now = Date.now();
    const prefs = settings?.notifications || { upcoming: true, failures: true, approvals: true, conflicts: true };
    const items: { id: string; icon: 'warn' | 'error' | 'info' | 'success'; text: string; postId?: string }[] = [];
    posts.forEach((p) => {
      if (p.status === 'failed' && prefs.failures) items.push({ id: `f_${p.id}`, icon: 'error', text: `"${p.title || 'Post'}" failed — ${p.lastPublishError?.message || 'see details'}`, postId: p.id });
      if ((p.retryCount || 0) > 0 && p.nextRetryAt && prefs.failures) items.push({ id: `r_${p.id}`, icon: 'warn', text: `"${p.title || 'Post'}" retry ${p.retryCount} scheduled`, postId: p.id });
      if (p.reviewStatus === 'pending' && prefs.approvals) items.push({ id: `a_${p.id}`, icon: 'info', text: `"${p.title || 'Post'}" awaiting approval`, postId: p.id });
      if (p.approvalDeadline && new Date(p.approvalDeadline).getTime() < now && p.reviewStatus === 'pending' && prefs.approvals) items.push({ id: `d_${p.id}`, icon: 'warn', text: `"${p.title || 'Post'}" approval deadline passed`, postId: p.id });
      const t = new Date(p.scheduledTime).getTime();
      if (p.status === 'scheduled' && t > now && t - now < 24 * 3600e3 && prefs.upcoming) items.push({ id: `u_${p.id}`, icon: 'info', text: `"${p.title || 'Post'}" publishes within 24h`, postId: p.id });
      if (p.lockedForPublishing || p.status === 'publishing') items.push({ id: `p_${p.id}`, icon: 'success', text: `"${p.title || 'Post'}" currently publishing`, postId: p.id });
    });
    // disconnected accounts with scheduled posts on their platform
    accounts.filter((a) => a.brandId && !a.isConnected).forEach((a) => {
      const affected = posts.filter((p) => p.status === 'scheduled' && p.brandId === a.brandId && p.channelPlatforms.includes(a.platform));
      if (affected.length) items.push({ id: `dc_${a.id}`, icon: 'error', text: `${a.platform} account disconnected — ${affected.length} scheduled post(s) affected`, postId: affected[0]?.id });
    });
    // scheduling conflicts
    if (prefs.conflicts) posts.filter((p) => p.status === 'scheduled').forEach((p) => {
      const c = findConflicts(p, posts);
      if (c.length) items.push({ id: `cf_${p.id}`, icon: 'warn', text: `"${p.title || 'Post'}" has ${c.length} scheduling conflict(s)`, postId: p.id });
    });
    const rank = { error: 0, warn: 1, info: 2, success: 3 };
    return items.sort((a, b) => rank[a.icon] - rank[b.icon]).slice(0, 30);
  }, [posts, accounts]);

  /* ---------- real .ics export of upcoming scheduled posts ---------- */
  const exportICS = () => {
    const upcoming = posts.filter((p) => p.status === 'scheduled' && p.scheduledTime).sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
    if (!upcoming.length) { alert('No scheduled posts to export.'); return; }
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Publora//Calendar//EN', 'CALSCALE:GREGORIAN',
      ...upcoming.flatMap((p) => {
        const s = new Date(p.scheduledTime).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        const e = new Date(new Date(p.scheduledTime).getTime() + 3600e3).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        return ['BEGIN:VEVENT', `UID:${p.id}@publora`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`, `DTSTART:${s}`, `DTEND:${e}`, `SUMMARY:${esc(p.title || 'Publora post')} (${(p.channelPlatforms || []).join(',')})`, `DESCRIPTION:${esc((p.caption || '').slice(0, 500))}`, 'END:VEVENT'];
      }), 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'publora-calendar.ics';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const maxPerCell = density === 'comfortable' ? 3 : density === 'compact' ? 5 : 8;

  /* ================= RENDER ================= */
  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-8 py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-[var(--border-color)] pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)] tracking-tight flex items-center gap-2"><CalendarDays size={20} className="text-[var(--accent-primary)]" /> Calendar</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            {activeWorkspace?.name || 'Workspace'} · {brands.length} brand{brands.length === 1 ? '' : 's'} · {accounts.filter((a) => a.isConnected).length} connected account{accounts.filter((a) => a.isConnected).length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={goToday} className="px-3 py-2 rounded-lg border border-[var(--border-color)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Today</button>
          <div className="flex items-center border border-[var(--border-color)] rounded-lg overflow-hidden">
            <button type="button" onClick={() => nav(-1)} className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"><ChevronLeft size={14} /></button>
            <button type="button" onClick={() => nav(1)} className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"><ChevronRight size={14} /></button>
          </div>
          <div className="flex items-center border border-[var(--border-color)] rounded-lg overflow-hidden">
            {(['month', 'week', 'day', 'list', 'agenda'] as const).map((v) => (
              <button key={v} type="button" onClick={() => changeView(v)} className={`px-2.5 py-2 text-[10px] font-mono uppercase transition ${view === v ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)] font-bold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>{v}</button>
            ))}
          </div>
          <button type="button" onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-lg border transition ${showSettings ? 'border-[var(--accent-primary)]/50 text-[var(--accent-primary)]' : 'border-[var(--border-color)] text-[var(--text-secondary)]'}`} title="Calendar settings"><Settings2 size={14} /></button>
          <button type="button" onClick={exportICS} className="px-3 py-2 rounded-lg border border-[var(--border-color)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]" title="Export upcoming posts as .ics">.ics</button>
          <button type="button" onClick={() => setShowNotifs(!showNotifs)} className="relative p-2 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]" title="Notifications">
            <Bell size={14} />
            {notifications.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-[var(--text-primary)] text-[8px] font-bold flex items-center justify-center">{Math.min(9, notifications.length)}</span>}
          </button>
          <button type="button" onClick={onOpenNewPost} className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-xs font-bold flex items-center gap-1.5"><PlusCircle size={14} /> Schedule Post</button>
        </div>
      </div>

      {/* Notification center */}
      {showNotifs && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-3 max-h-80 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-[var(--text-primary)]">Notifications</p>
            <button type="button" onClick={() => setShowNotifs(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={13} /></button>
          </div>
          {notifications.length === 0 ? <p className="text-[11px] text-[var(--text-muted)]">All clear — no publishing issues or upcoming events.</p> : notifications.map((n) => (
            <button key={n.id} type="button" onClick={() => { if (n.postId) setDetailId(n.postId); setShowNotifs(false); }} className="w-full text-start flex items-start gap-2 p-2 rounded-lg hover:bg-[var(--bg-surface-hover)] transition">
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${n.icon === 'error' ? 'bg-rose-400' : n.icon === 'warn' ? 'bg-amber-400' : n.icon === 'success' ? 'bg-emerald-400' : 'bg-sky-400'}`} />
              <span className="text-[11px] text-[var(--text-secondary)]">{n.text}</span>
            </button>
          ))}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <Metric label="Planned" value={metrics.planned} />
        <Metric label="Published" value={metrics.published} tone="success" />
        <Metric label="Pending approval" value={metrics.pendingApproval} tone={metrics.pendingApproval > 0 ? 'warn' : undefined} />
        <Metric label="Failed" value={metrics.failed} tone={metrics.failed > 0 ? 'error' : undefined} />
        <Metric label="Drafts" value={metrics.drafts} />
        <Metric label="Upcoming" value={metrics.upcoming} tone="info" />
      </div>

      {/* Toolbar: range + filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{rangeLabel}</p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg ps-8 pe-3 py-1.5 text-[11px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] w-40" />
          </div>
          <button type="button" onClick={() => setShowFilters(!showFilters)} className={`px-3 py-1.5 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 ${showFilters ? 'border-[var(--accent-primary)]/50 text-[var(--accent-primary)]' : 'border-[var(--border-color)] text-[var(--text-secondary)]'}`}><Filter size={12} /> Filters</button>
          <button type="button" onClick={() => setShowOrganize(!showOrganize)} className={`px-3 py-1.5 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 ${showOrganize ? 'border-[var(--accent-primary)]/50 text-[var(--accent-primary)]' : 'border-[var(--border-color)] text-[var(--text-secondary)]'}`}><Rows3 size={12} /> Organize</button>
          <select value={density} onChange={(e) => changeDensity(e.target.value as any)} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-secondary)]">
            <option value="comfortable">Comfortable</option><option value="compact">Compact</option><option value="dense">Dense</option>
          </select>
        </div>
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)]/60">
          <CalSelect label="Brand" value={fBrand} onChange={setFBrand} options={[['all', 'All brands'], ...brands.map((b) => [b.id, b.name] as [string, string])]} />
          <CalSelect label="Platform" value={fPlatform} onChange={setFPlatform} options={[['all', 'All'], ['youtube', 'YouTube'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['facebook', 'Facebook']]} />
          <CalSelect label="Status" value={fStatus} onChange={setFStatus} options={[['all', 'All'], ...Object.entries(STATUS_STYLE).map(([k, v]) => [k, v.label] as [string, string])]} />
          <CalSelect label="Campaign" value={fCampaign} onChange={setFCampaign} options={[['all', 'All campaigns'], ...campaigns.map((c) => [c.id, c.name] as [string, string])]} />
          <CalSelect label="Pillar" value={fPillar} onChange={setFPillar} options={[['all', 'All pillars'], ...contentPillars.map((p) => [p.id, p.name] as [string, string])]} />
          <CalSelect label="Account" value={fAccount} onChange={setFAccount} options={[['all', 'All accounts'], ...accounts.map((a) => [a.id, a.accountName || a.handle || a.platform] as [string, string])]} />
          <button type="button" onClick={() => { setFBrand('all'); setFAccount('all'); setFPlatform('all'); setFStatus('all'); setFCampaign('all'); setFPillar('all'); setQuery(''); }} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent-primary)] self-end pb-1 text-start">Clear all</button>
        </div>
      )}

      {/* Settings popover */}
      {showSettings && (
        <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] grid grid-cols-2 sm:grid-cols-4 gap-3">
          <CalSelect label="Timezone" value={tz} onChange={(v) => updateCalendar({ calendarSettings: { ...settings, timezone: v } })} options={['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney'].map((t) => [t, t] as [string, string])} />
          <CalSelect label="Week starts" value={String(settings.weekStartsOn)} onChange={(v) => updateCalendar({ calendarSettings: { ...settings, weekStartsOn: Number(v) as any } })} options={[['0', 'Sunday'], ['1', 'Monday'], ['6', 'Saturday']]} />
          <CalSelect label="Working hours" value={`${settings.workingHoursStart}-${settings.workingHoursEnd}`} onChange={(v) => { const [s, e] = v.split('-').map(Number); updateCalendar({ calendarSettings: { ...settings, workingHoursStart: s, workingHoursEnd: e } }); }} options={[['9-18', '9:00–18:00'], ['8-17', '8:00–17:00'], ['10-19', '10:00–19:00'], ['0-23', 'All day']]} />
          <CalSelect label="Auto refresh" value={String(settings.autoRefreshSec)} onChange={(v) => updateCalendar({ calendarSettings: { ...settings, autoRefreshSec: Number(v) } })} options={[['0', 'Manual'], ['15', '15s'], ['30', '30s'], ['60', '60s']]} />
          {/* Notification preferences */}
          <div className="col-span-2 sm:col-span-4">
            <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Notification preferences</p>
            <div className="flex flex-wrap gap-3">
              {([['upcoming', 'Upcoming posts'], ['failures', 'Failures & retries'], ['approvals', 'Approvals'], ['conflicts', 'Scheduling conflicts']] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] cursor-pointer">
                  <input type="checkbox" checked={settings.notifications?.[k] !== false} onChange={(e) => updateCalendar({ calendarSettings: { ...settings, notifications: { upcoming: true, failures: true, approvals: true, conflicts: true, ...settings.notifications, [k]: e.target.checked } } })} className="accent-[var(--accent-primary)] w-3.5 h-3.5" />
                  {label}
                </label>
              ))}
            </div>
          </div>
          {/* Saved views */}
          <div className="col-span-2 sm:col-span-4">
            <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Saved views</p>
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              {(calendarSavedViews || []).map((v: any) => (
                <span key={v.id} className="group flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-color)] text-[10px] text-[var(--text-secondary)]">
                  <button type="button" onClick={() => { const f = v.filters || {}; setFBrand(f.brand || 'all'); setFAccount(f.account || 'all'); setFPlatform(f.platform || 'all'); setFStatus(f.status || 'all'); setFCampaign(f.campaign || 'all'); setFPillar(f.pillar || 'all'); setQuery(f.query || ''); setShowSettings(false); setShowFilters(true); }}>{v.name}</button>
                  <button type="button" onClick={() => updateCalendar({ calendarSavedViews: (calendarSavedViews || []).filter((x: any) => x.id !== v.id) })} className="text-[var(--text-muted)] hover:text-rose-400 opacity-0 group-hover:opacity-100"><X size={9} /></button>
                </span>
              ))}
              {(calendarSavedViews || []).length === 0 && <span className="text-[10px] text-[var(--text-muted)]">None saved</span>}
            </div>
            <div className="flex gap-1.5">
              <input value={savedViewName} onChange={(e) => setSavedViewName(e.target.value)} placeholder="View name…" className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-md px-2 py-1 text-[10px] text-[var(--text-primary)]" />
              <button type="button" disabled={!savedViewName.trim()} onClick={() => { updateCalendar({ calendarSavedViews: [...(calendarSavedViews || []), { id: `sv_${Date.now().toString(36)}`, name: savedViewName.trim(), filters: { brand: fBrand, account: fAccount, platform: fPlatform, status: fStatus, campaign: fCampaign, pillar: fPillar, query }, createdAt: new Date().toISOString() }] }); setSavedViewName(''); }} className="px-2 py-1 rounded-md bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] text-[10px] font-bold disabled:opacity-40">Save current filters</button>
            </div>
          </div>
        </div>
      )}

      {/* Organize panel — pillars, ideas, unscheduled */}
      {showOrganize && (
        <OrganizePanel
          pillars={contentPillars} ideas={contentIdeas} posts={posts} campaigns={campaigns}
          brands={brands} videos={videos} tz={tz}
          onPillars={(next: any[]) => updateCalendar({ contentPillars: next })}
          onIdeas={(next: any[]) => updateCalendar({ contentIdeas: next })}
          onCampaigns={(next: any[]) => updateCalendar({ campaigns: next })}
          onUpdatePost={(id: string, updates: any) => updatePost(id, updates)}
          settings={calendarSettings}
          onReschedulePost={reschedulePost}
          onScheduleIdea={(idea: any) => {
            const d = prompt(`Schedule "${idea.title}" — date & time (YYYY-MM-DD HH:MM):`);
            if (!d) return;
            const t = new Date(d.replace(' ', 'T'));
            if (isNaN(t.getTime())) { alert('Invalid date.'); return; }
            const post = createPost({
              brandId: idea.brandId || brands[0]?.id || '',
              videoId: videos[0]?.id || 'vid-generic',
              channelPlatforms: ['youtube'],
              title: idea.title,
              caption: idea.description || '',
              hashtags: [],
              scheduledTime: t.toISOString(),
              status: 'scheduled',
              mode: 'manual',
              optimizedByAutopilot: false,
              lockedForPublishing: false,
              pillarId: idea.pillarId,
              campaignId: idea.campaignId,
            } as any);
            updateCalendar({ contentIdeas: contentIdeas.map((i) => i.id === idea.id ? { ...i, status: 'used' as const, linkedPostId: post.id } : i) });
          }}
          onOpenPost={setDetailId}
        />
      )}

      {/* Views */}
      {filteredPosts.length === 0 && contentIdeas.length === 0 && campaigns.length === 0 ? (
        <div className="py-16 text-center bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl">
          <CalendarDays size={32} className="text-[var(--text-muted)] mx-auto opacity-60 mb-3" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">No scheduled posts yet</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">Compose a post and pick a date to see it here.</p>
          <button type="button" onClick={onOpenNewPost} className="mt-4 px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-xs font-bold">Schedule Post</button>
        </div>
      ) : view === 'month' ? (
        <MonthView cells={monthCells} postsByDay={postsByDay} videos={videos} brands={brands} campaigns={campaigns} density={density} maxPerCell={maxPerCell} isToday={isToday} tz={tz} onOpen={setDetailId} onMore={setDayPopover} onScheduleAt={onScheduleAt}
          onDropPost={(postId: string, dayKeyStr: string) => {
            const p = posts.find((x) => x.id === postId);
            if (!p) return;
            if (p.lockedForPublishing || p.status === 'publishing') { alert('This post is locked while publishing.'); return; }
            const target = new Date(dayKeyStr + 'T12:00:00');
            const origH = new Date(p.scheduledTime || Date.now()).getHours();
            const origM = new Date(p.scheduledTime || Date.now()).getMinutes();
            target.setHours(origH, origM, 0, 0);
            if (target.getTime() < Date.now() - 60000) { alert('Cannot schedule in the past.'); return; }
            const prev = p.scheduledTime;
            try {
              reschedulePost(postId, target.toISOString(), 'Drag & drop reschedule');
            } catch {
              alert('Reschedule failed — post restored.');
              reschedulePost(postId, prev, 'Rollback failed drag');
            }
          }} />
      ) : view === 'week' ? (
        <WeekView days={weekDays} postsByDay={postsByDay} videos={videos} brands={brands} density={density} isToday={isToday} tz={tz} workStart={settings.workingHoursStart} workEnd={settings.workingHoursEnd} onOpen={setDetailId} />
      ) : view === 'day' ? (
        <DayView date={cursor} posts={(postsByDay.get(dayKey(cursor.toISOString(), tz)) || [])} videos={videos} brands={brands} tz={tz} onOpen={setDetailId} onReschedule={(id: string) => { const p = posts.find((x) => x.id === id); if (p) { setReschedFor(id); setReschedTime(p.scheduledTime?.slice(0, 16) || ''); } }} />
      ) : view === 'list' ? (
        <ListView posts={filteredPosts} videos={videos} brands={brands} campaigns={campaigns} tz={tz} onOpen={setDetailId}
          onBulk={(action: string, ids: string[]) => {
            if (action === 'reschedule') {
              const t = prompt('New date & time (YYYY-MM-DD HH:MM):');
              if (!t) return;
              const d = new Date(t.replace(' ', 'T'));
              if (isNaN(d.getTime()) || d.getTime() < Date.now() - 60000) { alert('Invalid or past time.'); return; }
              let ok = 0, fail = 0;
              ids.forEach((id) => { const p = posts.find((x) => x.id === id); if (p && !p.lockedForPublishing && p.status !== 'publishing') { reschedulePost(id, d.toISOString(), 'Bulk reschedule'); ok++; } else fail++; });
              alert(`${ok} rescheduled, ${fail} skipped (locked/publishing).`);
            } else if (action === 'cancel') {
              if (!confirm(`Cancel ${ids.length} post(s) → move to drafts?`)) return;
              let ok = 0, fail = 0;
              ids.forEach((id) => { const p = posts.find((x) => x.id === id); if (p && !p.lockedForPublishing && p.status !== 'publishing') { updatePost(id, { status: 'draft' } as any); ok++; } else fail++; });
              alert(`${ok} cancelled, ${fail} skipped.`);
            } else if (action === 'delete') {
              if (!confirm(`Permanently delete ${ids.length} post(s)?`)) return;
              let ok = 0, fail = 0;
              ids.forEach((id) => { const p = posts.find((x) => x.id === id); if (p && !p.lockedForPublishing && p.status !== 'publishing') { deletePost(id); ok++; } else fail++; });
              alert(`${ok} deleted, ${fail} skipped.`);
            }
          }} />
      ) : (
        <AgendaView posts={filteredPosts} videos={videos} brands={brands} campaigns={campaigns} contentIdeas={contentIdeas} milestones={campaigns.flatMap((c) => (c.milestones || []).map((m) => ({ ...m, campaign: c })))} tz={tz} onOpen={setDetailId} />
      )}

      {/* Day popover */}
      {dayPopover && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={() => setDayPopover(null)}>
          <div className="absolute inset-0 bg-[var(--bg-input)] backdrop-blur-sm" />
          <div className="relative bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl max-w-sm w-full p-4 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">{fmtDay(dayPopover + 'T12:00:00', tz)}</h3>
              <button type="button" onClick={() => setDayPopover(null)} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={15} /></button>
            </div>
            {(postsByDay.get(dayPopover) || []).map((p) => <PostChip key={p.id} post={p} video={videos.find((v) => v.id === p.videoId)} brand={brands.find((b) => b.id === p.brandId)} compact={false} onClick={() => { setDetailId(p.id); setDayPopover(null); }} />)}
            {(postsByDay.get(dayPopover) || []).length === 0 && <p className="text-[11px] text-[var(--text-muted)]">No posts this day.</p>}
          </div>
        </div>
      )}

      {/* Reschedule */}
      {reschedFor && (
        <div className="fixed inset-0 z-[115] bg-[var(--bg-overlay)] backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setReschedFor(null)}>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl max-w-sm w-full p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3">Reschedule post</h3>
            <input type="datetime-local" value={reschedTime} onChange={(e) => setReschedTime(e.target.value)} className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]" />
            <p className="text-[10px] text-[var(--text-muted)] mt-1">Timezone: {tz}</p>
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" onClick={() => setReschedFor(null)} className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)]">Cancel</button>
              <button type="button" onClick={() => doReschedule(reschedFor)} className="px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-xs font-bold">Reschedule</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailPost && (
        <PostModal
          post={detailPost} video={detailVideo} brand={detailBrand}
          campaigns={campaigns} pillars={contentPillars}
          onClose={() => setDetailId(null)}
          onPublish={() => { if (!detailPost.lockedForPublishing) { setPublishingId(detailPost.id); publishPostNow(detailPost.id).finally(() => setPublishingId(null)); } }}
          onReschedule={() => { setReschedFor(detailPost.id); setReschedTime(detailPost.scheduledTime?.slice(0, 16) || ''); setDetailId(null); }}
          onEdit={() => setActiveTab?.('queue')}
          onDelete={() => { if (confirm('Delete this post?')) { deletePost(detailPost.id); setDetailId(null); } }}
          onDuplicate={() => {
            const { id, createdAt, publishedTime, publishOperationId, publishingEvents, ...rest } = detailPost as any;
            createPost({ ...rest, status: 'draft', scheduledTime: new Date().toISOString(), lockedForPublishing: false });
            setDetailId(null);
          }}
          onEditField={(updates: any) => updatePost(detailPost.id, updates)}
          publishing={publishingId === detailPost.id}
          conflicts={findConflicts(detailPost, posts)}
          members={workspaceMembers}
          memberRole={memberRole}
          currentUser={user}
          comments={postComments.filter((c) => c.postId === detailPost.id)}
          onAddComment={(body: string) => updateCalendar({ postComments: [...postComments, { id: `c_${Date.now().toString(36)}`, postId: detailPost.id, authorId: user?.id || 'me', authorName: user?.fullName || user?.email || 'You', body, createdAt: new Date().toISOString() }] })}
          onReviewAction={(action: string, note?: string) => {
            const entry = { ts: new Date().toISOString(), by: user?.fullName || user?.email || 'you', action, note };
            updatePost(detailPost.id, {
              reviewStatus: action === 'scheduled' ? 'none' : action,
              reviewNotes: [...(detailPost.reviewNotes || []), entry],
            } as any);
          }}
          onAssign={(updates: any) => updatePost(detailPost.id, updates)}
          tz={tz}
        />
      )}
    </div>
  );
};

/* ================= helpers & sub-components ================= */

function weekStart(d: Date, weekStartsOn: number) {
  const s = new Date(d); s.setHours(0, 0, 0, 0);
  const diff = (s.getDay() - weekStartsOn + 7) % 7;
  s.setDate(s.getDate() - diff);
  return s;
}

const Metric: React.FC<{ label: string; value: number; tone?: 'success' | 'warn' | 'error' | 'info' }> = ({ label, value, tone }) => {
  const colors = { success: 'text-emerald-400', warn: 'text-amber-400', error: 'text-rose-400', info: 'text-sky-400' };
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-3 py-2">
      <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className={`text-base font-bold mt-0.5 ${tone ? colors[tone] : 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  );
};

const CalSelect: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: [string, string][] }> = ({ label, value, onChange, options }) => (
  <label className="block">
    <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-0.5 w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-md px-2 py-1.5 text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]">
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  </label>
);

function PostChip({ post, video, brand, campaign, compact, onClick }: any) {
  const st = STATUS_STYLE[post.status] || STATUS_STYLE.draft;
  return (
    <button type="button" onClick={onClick} className={`w-full text-start flex items-center gap-2 rounded-md border px-1.5 py-1 transition hover:border-[var(--accent-primary)]/60 ${st.cls} ${compact ? 'text-[9px]' : 'text-[10px]'}`} style={campaign?.color ? { borderLeft: `3px solid ${campaign.color}` } : undefined}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: st.dot }} />
      <span className="truncate flex-1 font-medium">{post.title || video?.title || 'Untitled'}</span>
      {!compact && <span className="font-mono opacity-70 shrink-0">{fmtTime(post.scheduledTime)}</span>}
    </button>
  );
}

function MonthView({ cells, postsByDay, videos, brands, campaigns, density, maxPerCell, isToday, tz, onOpen, onMore, onScheduleAt, onDropPost }: any) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const chipH = density === 'comfortable' ? 'min-h-[140px]' : density === 'compact' ? 'min-h-[110px]' : 'min-h-[90px]';
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-[var(--border-color)]">
        {DAY_NAMES.map((d, i) => <div key={d} className="px-2 py-2 text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c: any, i: number) => {
          const key = dayKey(c.date.toISOString(), tz);
          const dayPosts = postsByDay.get(key) || [];
          const shown = dayPosts.slice(0, maxPerCell);
          const extra = dayPosts.length - shown.length;
          return (
            <div
              key={i}
              className={`border-b border-e border-[var(--border-color)] ${c.inMonth ? '' : 'opacity-40'} ${isToday(c.date) ? 'bg-[var(--accent-subtle)]' : ''} ${chipH} p-1 flex flex-col gap-0.5 transition ${dragOver === key ? 'ring-2 ring-[var(--accent-primary)]' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => { e.preventDefault(); setDragOver(null); const pid = e.dataTransfer.getData('text/post-id'); if (pid && onDropPost) onDropPost(pid, key); }}
              onClick={() => { if (onScheduleAt && dayPosts.length === 0) onScheduleAt(new Date(c.date.getFullYear(), c.date.getMonth(), c.date.getDate(), 18, 0).toISOString()); }}
              title={dayPosts.length === 0 && onScheduleAt ? 'Click to schedule a post' : undefined}
            >
              <div className="flex items-center justify-between px-1">
                <span className={`text-[10px] font-mono ${isToday(c.date) ? 'text-[var(--accent-primary)] font-bold' : 'text-[var(--text-muted)]'}`}>{c.date.getDate()}</span>
                {dayPosts.length > 0 && <span className="text-[9px] font-mono text-[var(--text-muted)]">{dayPosts.length}</span>}
              </div>
              {shown.map((p: ScheduledPost) => (
                <div key={p.id} draggable={!p.lockedForPublishing && p.status !== 'publishing'} onDragStart={(e) => e.dataTransfer.setData('text/post-id', p.id)} className={p.lockedForPublishing || p.status === 'publishing' ? 'cursor-not-allowed opacity-70' : 'cursor-grab active:cursor-grabbing'}>
                  <PostChip post={p} video={videos.find((v: any) => v.id === p.videoId)} brand={brands.find((b: any) => b.id === p.brandId)} campaign={campaigns.find((c: any) => c.id === (p as any).campaignId)} compact={density === 'dense'} onClick={() => onOpen(p.id)} />
                </div>
              ))}
              {extra > 0 && <button type="button" onClick={() => onMore(key)} className="text-[9px] font-mono text-[var(--accent-primary)] hover:underline text-start px-1">+{extra} more</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ days, postsByDay, videos, brands, density, isToday, tz, workStart, workEnd, onOpen }: any) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <div className="grid grid-cols-8 border-b border-[var(--border-color)]">
        <div className="px-2 py-2" />
        {days.map((d: Date) => (
          <div key={d.toISOString()} className={`px-2 py-2 text-center border-s border-[var(--border-color)] ${isToday(d) ? 'bg-[var(--accent-subtle)]' : ''}`}>
            <p className="text-[9px] font-mono uppercase text-[var(--text-muted)]">{DAY_NAMES[d.getDay()]}</p>
            <p className={`text-sm font-bold ${isToday(d) ? 'text-[var(--accent-primary)]' : 'text-[var(--text-primary)]'}`}>{d.getDate()}</p>
          </div>
        ))}
      </div>
      <div className="max-h-[65vh] overflow-y-auto">
        {hours.map((h) => (
          <div key={h} className="grid grid-cols-8 border-b border-[var(--border-color)]/50">
            <div className="px-2 py-1 text-[9px] font-mono text-[var(--text-muted)] text-right">{String(h).padStart(2, '0')}:00</div>
            {days.map((d: Date) => {
              const key = dayKey(d.toISOString(), tz);
              const inWork = h >= workStart && h < workEnd;
              const hourPosts = (postsByDay.get(key) || []).filter((p: ScheduledPost) => new Date(p.scheduledTime).getHours() === h);
              return (
                <div key={key + h} className={`border-s border-[var(--border-color)]/50 min-h-[28px] p-0.5 ${inWork ? '' : 'bg-[var(--bg-main)]/30'}`}>
                  {hourPosts.map((p: ScheduledPost) => (
                    <button key={p.id} type="button" onClick={() => onOpen(p.id)} className="w-full text-start text-[9px] font-mono px-1 py-0.5 rounded truncate mb-0.5 text-[var(--text-primary)]" style={{ backgroundColor: PLATFORM_COLOR[(p.channelPlatforms || [])[0]] || '#334155' }}>
                      {fmtTime(p.scheduledTime, tz)} {p.title || 'Post'}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayView({ date, posts, videos, brands, tz, onOpen, onReschedule }: any) {
  if (posts.length === 0) return <EmptyDay date={date} tz={tz} />;
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl divide-y divide-[var(--border-subtle)]">
      {posts.map((p: ScheduledPost) => {
        const st = STATUS_STYLE[p.status] || STATUS_STYLE.draft;
        return (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-surface-hover)] transition">
            <span className="font-mono text-xs text-[var(--text-muted)] w-14 shrink-0">{fmtTime(p.scheduledTime, tz)}</span>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: st.dot }} />
            <button type="button" onClick={() => onOpen(p.id)} className="flex-1 text-start text-xs font-medium text-[var(--text-primary)] truncate hover:text-[var(--accent-primary)]">
              {p.title || videos.find((v: any) => v.id === p.videoId)?.title || 'Untitled'}
            </button>
            <span className="text-[10px] text-[var(--text-muted)]">{brands.find((b: any) => b.id === p.brandId)?.name || '—'}</span>
            <div className="flex gap-1">{(p.channelPlatforms || []).map((pl: string) => <span key={pl} className="px-1 py-0.5 rounded text-[8px] font-bold text-[var(--text-primary)]" style={{ backgroundColor: PLATFORM_COLOR[pl] || '#555' }}>{PLATFORM_ICON[pl]}</span>)}</div>
            <button type="button" onClick={() => onReschedule(p.id)} className="p-1 text-[var(--text-muted)] hover:text-[var(--accent-primary)]" title="Reschedule"><CalendarClock size={13} /></button>
          </div>
        );
      })}
    </div>
  );
}

function EmptyDay({ date, tz }: any) {
  return (
    <div className="py-14 text-center bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl">
      <p className="text-sm font-semibold text-[var(--text-primary)]">No posts on {fmtDay(date.toISOString(), tz)}</p>
      <p className="text-[11px] text-[var(--text-muted)] mt-1">This is a genuinely empty day — nothing scheduled.</p>
    </div>
  );
}

function ListView({ posts, videos, brands, campaigns, tz, onOpen, onBulk }: any) {
  const [sort, setSort] = useState<'time' | 'title' | 'status'>('time');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const sorted = [...posts].sort((a, b) => {
    if (sort === 'title') return (a.title || '').localeCompare(b.title || '');
    if (sort === 'status') return a.status.localeCompare(b.status);
    return new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime();
  });
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allIds = sorted.map((p: ScheduledPost) => p.id);
  const allSel = allIds.length > 0 && allIds.every((id) => selected.has(id));
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--accent-primary)]/40 bg-[var(--accent-subtle)]">
          <span className="text-[11px] font-bold text-[var(--accent-primary)]">{selected.size} selected</span>
          <button type="button" onClick={() => onBulk?.('reschedule', Array.from(selected))} className="px-2 py-1 rounded text-[10px] font-semibold border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Reschedule</button>
          <button type="button" onClick={() => onBulk?.('cancel', Array.from(selected))} className="px-2 py-1 rounded text-[10px] font-semibold border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancel → Draft</button>
          <button type="button" onClick={() => onBulk?.('delete', Array.from(selected))} className="px-2 py-1 rounded text-[10px] font-semibold border border-rose-500/40 text-rose-400 hover:bg-rose-500/10">Delete</button>
          <button type="button" onClick={() => setSelected(new Set())} className="ms-auto text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Clear</button>
        </div>
      )}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border-color)]">
        <button type="button" onClick={() => setSelected(allSel ? new Set() : new Set(allIds))} className="text-[10px] font-mono text-[var(--accent-primary)] hover:underline">{allSel ? 'Deselect all' : 'Select all'}</button>
        <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] ml-3">Sort:</span>
        {(['time', 'title', 'status'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSort(s)} className={`px-2 py-1 rounded text-[10px] font-mono ${sort === s ? 'bg-[var(--accent-subtle)] text-[var(--accent-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>{s}</button>
        ))}
        <span className="ms-auto text-[10px] font-mono text-[var(--text-muted)]">{sorted.length} posts</span>
      </div>
      <div className="divide-y divide-[var(--border-subtle)]">
        {sorted.map((p: ScheduledPost) => {
          const st = STATUS_STYLE[p.status] || STATUS_STYLE.draft;
          const campaign = campaigns.find((c: any) => c.id === (p as any).campaignId);
          const sel = selected.has(p.id);
          return (
            <div key={p.id} className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-surface-hover)] transition text-start ${sel ? 'bg-[var(--accent-subtle)]' : ''}`}>
              <input type="checkbox" checked={sel} onChange={() => toggle(p.id)} className="accent-[var(--accent-primary)] w-3.5 h-3.5 shrink-0" />
              <button type="button" onClick={() => onOpen(p.id)} className="contents">
              <span className="font-mono text-[10px] text-[var(--text-muted)] w-20 shrink-0">{fmtDay(p.scheduledTime, tz)} {fmtTime(p.scheduledTime, tz)}</span>
              <span className="flex-1 text-xs font-medium text-[var(--text-primary)] truncate">{p.title || videos.find((v: any) => v.id === p.videoId)?.title || 'Untitled'}</span>
              {campaign && <span className="px-1.5 py-0.5 rounded text-[9px] font-mono" style={{ backgroundColor: campaign.color + '22', color: campaign.color }}><Megaphone size={9} className="inline me-0.5" />{campaign.name}</span>}
              <span className="text-[10px] text-[var(--text-muted)] hidden sm:block">{brands.find((b: any) => b.id === p.brandId)?.name || '—'}</span>
              <span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono ${st.cls}`}>{st.label}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgendaView({ posts, videos, brands, campaigns, contentIdeas, milestones, tz, onOpen }: any) {
  const upcoming = posts
    .filter((p: ScheduledPost) => ['scheduled', 'optimizing', 'publishing', 'draft'].includes(p.status))
    .sort((a: ScheduledPost, b: ScheduledPost) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime())
    .slice(0, 30);
  const ideaItems = contentIdeas.filter((i: any) => i.status === 'idea' || i.status === 'draft').slice(0, 10);
  const msItems = (milestones || []).filter((m: any) => !m.done).slice(0, 10);

  if (upcoming.length === 0 && ideaItems.length === 0 && msItems.length === 0) {
    return <EmptyDay date={new Date()} tz={tz} />;
  }
  return (
    <div className="space-y-4">
      {upcoming.length > 0 && (
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-1.5"><CalendarClock size={11} /> Upcoming posts</p>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl divide-y divide-[var(--border-subtle)]">
            {upcoming.map((p: ScheduledPost) => {
              const st = STATUS_STYLE[p.status] || STATUS_STYLE.draft;
              return (
                <button key={p.id} type="button" onClick={() => onOpen(p.id)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-surface-hover)] text-start">
                  <span className="font-mono text-[10px] text-[var(--text-muted)] w-24 shrink-0">{fmtDay(p.scheduledTime, tz)}<br />{fmtTime(p.scheduledTime, tz)}</span>
                  <span className="flex-1 text-xs font-medium text-[var(--text-primary)] truncate">{p.title || 'Untitled'}</span>
                  <span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono ${st.cls}`}>{st.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {msItems.length > 0 && (
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-1.5"><Flag size={11} /> Campaign milestones</p>
          <div className="space-y-1.5">
            {msItems.map((m: any) => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-[11px]">
                <Flag size={11} style={{ color: m.campaign?.color || '#00D6B2' }} />
                <span className="text-[var(--text-primary)] flex-1 truncate">{m.title}</span>
                <span className="font-mono text-[var(--text-muted)]">{m.campaign?.name} · due {fmtDay(m.dueDate, tz)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {ideaItems.length > 0 && (
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-1.5"><Lightbulb size={11} /> Content ideas ({ideaItems.length})</p>
          <div className="space-y-1.5">
            {ideaItems.map((i: any) => (
              <div key={i.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-[11px]">
                <Lightbulb size={11} className="text-amber-400" />
                <span className="text-[var(--text-primary)] flex-1 truncate">{i.title}{i.aiGenerated ? ' · AI suggestion' : ''}</span>
                <span className="font-mono text-[var(--text-muted)]">{i.goal || 'idea'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PostModal({ post, video, brand, campaigns, pillars, onClose, onPublish, onReschedule, onEdit, onDelete, onDuplicate, onEditField, publishing, conflicts, members, memberRole, currentUser, comments, onAddComment, onReviewAction, onAssign, tz }: any) {
  const st = STATUS_STYLE[post.status] || STATUS_STYLE.draft;
  const campaign = campaigns.find((c: any) => c.id === (post as any).campaignId);
  const pillar = pillars.find((p: any) => p.id === (post as any).pillarId);
  const locked = post.lockedForPublishing || post.status === 'publishing' || post.status === 'published';
  return (
    <div className="fixed inset-0 z-[105] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-[var(--bg-input)] backdrop-blur-sm" />
      <div className="relative w-full max-w-md h-full bg-[var(--bg-surface)] border-s border-[var(--border-color)] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[var(--bg-surface)] border-b border-[var(--border-color)] px-5 py-4 flex items-center justify-between z-10">
          <h3 className="text-sm font-bold text-[var(--text-primary)] truncate pe-3">{post.title || video?.title || 'Post'}</h3>
          <button type="button" onClick={onClose} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-5">
          {video?.thumbnailUrl || video?.fileUrl ? (
            <div className="rounded-xl overflow-hidden bg-black">
              {video.fileUrl ? <video src={video.fileUrl} controls preload="metadata" className="w-full max-h-52 object-contain" /> : <img src={video.thumbnailUrl} alt="" className="w-full max-h-52 object-cover" />}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            <span className={`px-2 py-1 rounded-lg border text-[10px] font-mono ${st.cls}`}>{st.label}</span>
            {post.reviewStatus && post.reviewStatus !== 'none' && <span className="px-2 py-1 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px] font-mono">{post.reviewStatus.replace('_', ' ')}</span>}
            {locked && <span className="px-2 py-1 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px] font-mono">?? Locked</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {!locked && post.reviewStatus !== 'pending' && post.reviewStatus !== 'changes_requested' && <PmBtn onClick={onPublish} primary>{publishing ? 'Publishing…' : 'Publish now'}</PmBtn>}
            {!locked && <PmBtn onClick={onReschedule}><CalendarClock size={11} className="inline me-1" />Reschedule</PmBtn>}
            {!locked && <PmBtn onClick={onDuplicate}><Copy size={11} className="inline me-1" />Duplicate</PmBtn>}
            {!locked && <PmBtn onClick={onEdit}><Edit3 size={11} className="inline me-1" />Edit in Queue</PmBtn>}
            <PmBtn onClick={onDelete} danger><Trash2 size={11} className="inline me-1" />Delete</PmBtn>
          </div>
          {/* Team collaboration & approvals */}
          {!locked && (
            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Team & approvals</h4>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[9px] font-mono uppercase text-[var(--text-muted)]">Assignee</span>
                    <select value={post.assignedTo || ''} onChange={(e) => onAssign({ assignedTo: e.target.value || undefined })} className="mt-0.5 w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-md px-2 py-1.5 text-[11px] text-[var(--text-primary)]">
                      <option value="">Unassigned</option>
                      {(members || []).map((m: any) => <option key={m.userId || m.id} value={m.userId || m.id}>{m.user?.fullName || m.user?.email || 'Member'}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[9px] font-mono uppercase text-[var(--text-muted)]">Reviewer</span>
                    <select value={post.reviewerId || ''} onChange={(e) => onAssign({ reviewerId: e.target.value || undefined })} className="mt-0.5 w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-md px-2 py-1.5 text-[11px] text-[var(--text-primary)]">
                      <option value="">None</option>
                      {(members || []).map((m: any) => <option key={m.userId || m.id} value={m.userId || m.id}>{m.user?.fullName || m.user?.email || 'Member'}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="text-[9px] font-mono uppercase text-[var(--text-muted)]">Approval deadline</span>
                  <input type="date" value={post.approvalDeadline?.slice(0, 10) || ''} onChange={(e) => onAssign({ approvalDeadline: e.target.value ? new Date(e.target.value + 'T23:59:59').toISOString() : undefined })} className="mt-0.5 w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-md px-2 py-1.5 text-[11px] text-[var(--text-primary)]" />
                </label>

                {/* Review actions — role-gated: owner/admin/member can review own workspace posts */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {post.reviewStatus !== 'pending' && <PmBtn onClick={() => onReviewAction('pending')}>Submit for review</PmBtn>}
                  {post.reviewStatus === 'pending' && (
                    <>
                      <PmBtn onClick={() => onReviewAction('approved')}><CheckCircle2 size={11} className="inline me-1" />Approve</PmBtn>
                      <PmBtn onClick={() => onReviewAction('changes_requested')}>Request changes</PmBtn>
                      <PmBtn onClick={() => onReviewAction('rejected')} danger>Reject</PmBtn>
                    </>
                  )}
                </div>
                {(post.reviewNotes || []).length > 0 && (
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {[...post.reviewNotes].reverse().slice(0, 5).map((n: any, i: number) => (
                      <p key={i} className="text-[10px] text-[var(--text-secondary)]"><span className="font-mono text-[var(--accent-primary)]">{n.action}</span> by {n.by} · {fmtDT2(n.ts)}{n.note ? ` — ${n.note}` : ''}</p>
                    ))}
                  </div>
                )}

                {/* Comments */}
                <div className="pt-1 border-t border-[var(--border-subtle)]">
                  <p className="text-[9px] font-mono uppercase text-[var(--text-muted)] mb-1.5">Comments ({comments?.length || 0})</p>
                  <div className="space-y-1 max-h-28 overflow-y-auto mb-1.5">
                    {(comments || []).map((c: any) => (
                      <p key={c.id} className="text-[10px] text-[var(--text-secondary)]"><span className="font-semibold text-[var(--text-primary)]">{c.authorName}:</span> {c.body} <span className="font-mono text-[9px] text-[var(--text-muted)]">{fmtDT2(c.createdAt)}</span></p>
                    ))}
                  </div>
                  <CommentInput onAdd={onAddComment} />
                </div>
              </div>
            </section>
          )}

          {/* Inline edit — title, caption, schedule time */}
          {!locked && (
            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Quick edit</h4>
              <div className="space-y-2">
                <input
                  defaultValue={post.title || ''}
                  key={`t-${post.id}-${post.updatedAt || ''}`}
                  onBlur={(e) => { if (e.target.value !== (post.title || '')) onEditField({ title: e.target.value }); }}
                  placeholder="Title"
                  className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
                <textarea
                  defaultValue={post.caption || ''}
                  key={`c-${post.id}-${post.updatedAt || ''}`}
                  onBlur={(e) => { if (e.target.value !== (post.caption || '')) onEditField({ caption: e.target.value }); }}
                  placeholder="Caption"
                  rows={2}
                  className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] resize-none"
                />
                <input
                  type="datetime-local"
                  defaultValue={post.scheduledTime?.slice(0, 16) || ''}
                  key={`s-${post.id}-${post.scheduledTime || ''}`}
                  onChange={(e) => { const t = new Date(e.target.value); if (!isNaN(t.getTime()) && t.getTime() > Date.now() - 60000) onEditField({ scheduledTime: t.toISOString() }); }}
                  className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            </section>
          )}

          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Details</h4>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/40 px-3 py-1">
              {meta('Brand', brand?.name)}
              {meta('Campaign', campaign?.name)}
              {meta('Pillar', pillar?.name)}
              {meta('Platforms', (post.channelPlatforms || []).join(', '))}
              {meta('Scheduled', `${fmtDay(post.scheduledTime, tz)} ${fmtTime(post.scheduledTime, tz)}`)}
              {meta('Timezone', tz)}
              {meta('Published', post.publishedTime ? `${fmtDay(post.publishedTime, tz)} ${fmtTime(post.publishedTime, tz)}` : null)}
              {meta('Priority', (post as any).priority || 'normal')}
              {meta('Retries', post.retryCount ? String(post.retryCount) : null)}
            </div>
          </section>
          {conflicts?.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
              <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-200">
                Scheduling conflict: {conflicts.length} other post{conflicts.length > 1 ? 's' : ''} for the same brand/platform within 30 minutes — {conflicts.map((c: any) => c.title || 'untitled').join(', ')}.
              </p>
            </div>
          )}
          {post.lastPublishError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
              <p className="text-[10px] font-mono uppercase tracking-wider text-rose-400 mb-1">Publish error · {post.lastPublishError.class}</p>
              <p className="text-xs text-rose-200">{post.lastPublishError.message}</p>
            </div>
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

/* ---------- Organize panel: pillars, ideas, unscheduled ---------- */
function OrganizePanel({ pillars, ideas, posts, campaigns, brands, videos, tz, settings, onPillars, onIdeas, onCampaigns, onUpdatePost, onReschedulePost, onScheduleIdea, onOpenPost }: any) {
  const [tab, setTab] = useState<'pillars' | 'ideas' | 'campaigns' | 'planner' | 'reports' | 'unscheduled'>('ideas');
  const [newPillar, setNewPillar] = useState('');
  const [newIdea, setNewIdea] = useState('');
  const [ideaBrand, setIdeaBrand] = useState('');
  const [ideaPillar, setIdeaPillar] = useState('');
  const [newCampaign, setNewCampaign] = useState({ name: '', brandId: '', startDate: '', endDate: '', color: '#00D6B2' });
  const [newMilestone, setNewMilestone] = useState<Record<string, string>>({});
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  const unscheduled = posts.filter((p: ScheduledPost) => p.status === 'draft' || !p.scheduledTime);

  const campaignStats = (c: any) => {
    const linked = posts.filter((p: ScheduledPost) => (p as any).campaignId === c.id);
    const published = linked.filter((p: ScheduledPost) => p.status === 'published').length;
    return { total: linked.length, published, pct: linked.length ? Math.round((published / linked.length) * 100) : 0 };
  };

  const addCampaign = () => {
    if (!newCampaign.name.trim() || !newCampaign.brandId || !newCampaign.startDate || !newCampaign.endDate) return;
    onCampaigns([...(campaigns || []), {
      id: uid(), name: newCampaign.name.trim(), brandId: newCampaign.brandId,
      startDate: newCampaign.startDate, endDate: newCampaign.endDate, color: newCampaign.color,
      status: 'active', milestones: [], postIds: [], createdAt: new Date().toISOString(),
    }]);
    setNewCampaign({ name: '', brandId: '', startDate: '', endDate: '', color: '#00D6B2' });
  };

  const patchCampaign = (id: string, patch: any) => onCampaigns((campaigns || []).map((c: any) => c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c));

  const addMilestone = (cid: string) => {
    const title = (newMilestone[cid] || '').trim();
    if (!title) return;
    const c = (campaigns || []).find((x: any) => x.id === cid);
    patchCampaign(cid, { milestones: [...(c?.milestones || []), { id: uid(), title, dueDate: c?.endDate || new Date().toISOString(), done: false }] });
    setNewMilestone({ ...newMilestone, [cid]: '' });
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-1.5">
        {(['ideas', 'pillars', 'campaigns', 'planner', 'reports', 'unscheduled'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition ${tab === t ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]'}`}>
            {t === 'unscheduled' ? `Unscheduled (${unscheduled.length})` : t === 'ideas' ? `Ideas (${ideas.filter((i: any) => i.status !== 'archived').length})` : t === 'campaigns' ? `Campaigns (${(campaigns || []).length})` : t === 'planner' ? 'Planner' : t === 'reports' ? 'Reports' : `Pillars (${pillars.length})`}
          </button>
        ))}
      </div>

      {tab === 'pillars' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input value={newPillar} onChange={(e) => setNewPillar(e.target.value)} placeholder="New content pillar (e.g. Educational, BTS, Promo)…" className="flex-1 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]" />
            <button type="button" disabled={!newPillar.trim()} onClick={() => { onPillars([...pillars, { id: uid(), name: newPillar.trim(), createdAt: new Date().toISOString() }]); setNewPillar(''); }} className="px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-[11px] font-bold disabled:opacity-40">Add</button>
          </div>
          {pillars.length === 0 ? <p className="text-[11px] text-[var(--text-muted)]">No content pillars yet — create categories to organize your content.</p> : (
            <div className="flex flex-wrap gap-1.5">
              {pillars.map((p: any) => (
                <span key={p.id} className="group flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] text-[11px] text-[var(--text-secondary)]">
                  {p.name}
                  <button type="button" onClick={() => onPillars(pillars.filter((x: any) => x.id !== p.id))} className="text-[var(--text-muted)] hover:text-rose-400 opacity-0 group-hover:opacity-100 transition"><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'ideas' && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px_auto] gap-2">
            <input value={newIdea} onChange={(e) => setNewIdea(e.target.value)} placeholder="New content idea…" className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]" />
            <select value={ideaBrand} onChange={(e) => setIdeaBrand(e.target.value)} className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-primary)]">
              <option value="">Brand…</option>{brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={ideaPillar} onChange={(e) => setIdeaPillar(e.target.value)} className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-primary)]">
              <option value="">Pillar…</option>{pillars.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" disabled={!newIdea.trim()} onClick={() => { onIdeas([...ideas, { id: uid(), title: newIdea.trim(), brandId: ideaBrand || undefined, pillarId: ideaPillar || undefined, status: 'idea', createdAt: new Date().toISOString() }]); setNewIdea(''); setIdeaBrand(''); setIdeaPillar(''); }} className="px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-[11px] font-bold disabled:opacity-40">Add</button>
          </div>
          {ideas.filter((i: any) => i.status !== 'archived').length === 0 ? <p className="text-[11px] text-[var(--text-muted)]">No content ideas yet.</p> : (
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {ideas.filter((i: any) => i.status !== 'archived').map((i: any) => (
                <div key={i.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-main)]/50 border border-[var(--border-color)] text-[11px]">
                  <Lightbulb size={11} className="text-amber-400 shrink-0" />
                  <span className="text-[var(--text-primary)] flex-1 truncate">{i.title}{i.aiGenerated ? <span className="text-[9px] text-[var(--accent-primary)] ml-1">AI</span> : null}</span>
                  {i.status === 'used' && <span className="text-[9px] font-mono text-emerald-400">scheduled</span>}
                  <button type="button" onClick={() => onScheduleIdea(i)} disabled={i.status === 'used'} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/25 disabled:opacity-40">Schedule</button>
                  <button type="button" onClick={() => onIdeas(ideas.map((x: any) => x.id === i.id ? { ...x, status: 'archived' } : x))} className="text-[var(--text-muted)] hover:text-rose-400" title="Archive"><X size={11} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'campaigns' && (
        <div className="space-y-3">
          {/* Create campaign */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <input value={newCampaign.name} onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })} placeholder="Campaign name" className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]" />
            <select value={newCampaign.brandId} onChange={(e) => setNewCampaign({ ...newCampaign, brandId: e.target.value })} className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-primary)]">
              <option value="">Brand…</option>{brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input type="date" value={newCampaign.startDate} onChange={(e) => setNewCampaign({ ...newCampaign, startDate: e.target.value })} className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-primary)]" />
            <input type="date" value={newCampaign.endDate} onChange={(e) => setNewCampaign({ ...newCampaign, endDate: e.target.value })} className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-primary)]" />
            <div className="flex gap-1.5">
              <input type="color" value={newCampaign.color} onChange={(e) => setNewCampaign({ ...newCampaign, color: e.target.value })} className="w-8 h-8 rounded border border-[var(--border-color)] bg-transparent cursor-pointer" />
              <button type="button" disabled={!newCampaign.name.trim() || !newCampaign.brandId || !newCampaign.startDate || !newCampaign.endDate} onClick={addCampaign} className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-[11px] font-bold disabled:opacity-40">Create</button>
            </div>
          </div>

          {(campaigns || []).length === 0 ? <p className="text-[11px] text-[var(--text-muted)]">No campaigns yet — group posts into campaigns to track progress.</p> : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {(campaigns || []).map((c: any) => {
                const s = campaignStats(c);
                const outOfRange = posts.filter((p: ScheduledPost) => (p as any).campaignId === c.id && p.scheduledTime && (new Date(p.scheduledTime) < new Date(c.startDate) || new Date(p.scheduledTime) > new Date(c.endDate + 'T23:59:59')));
                return (
                  <div key={c.id} className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/40">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: c.color || '#00D6B2' }} />
                      <span className="text-xs font-bold text-[var(--text-primary)] flex-1 truncate">{c.name}</span>
                      <select value={c.status} onChange={(e) => patchCampaign(c.id, { status: e.target.value })} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                        {['draft', 'active', 'paused', 'completed', 'archived'].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button type="button" onClick={() => onCampaigns(campaigns.filter((x: any) => x.id !== c.id))} className="text-[var(--text-muted)] hover:text-rose-400"><X size={12} /></button>
                    </div>
                    <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1">
                      {brands.find((b: any) => b.id === c.brandId)?.name || '—'} · {c.startDate} → {c.endDate}
                    </p>
                    {/* Progress — real published/total linked posts */}
                    <div className="mt-2">
                      <div className="flex justify-between text-[9px] font-mono text-[var(--text-muted)] mb-0.5"><span>{s.published}/{s.total} posts published</span><span>{s.pct}%</span></div>
                      <div className="h-1 rounded-full bg-[var(--bg-surface)] overflow-hidden"><div className="h-full transition-all" style={{ width: `${s.pct}%`, backgroundColor: c.color || '#00D6B2' }} /></div>
                    </div>
                    {outOfRange.length > 0 && (
                      <p className="text-[10px] text-amber-400 mt-1.5 flex items-center gap-1"><AlertTriangle size={10} /> {outOfRange.length} post(s) scheduled outside campaign dates</p>
                    )}
                    {/* Milestones */}
                    <div className="mt-2 space-y-1">
                      {(c.milestones || []).map((m: any) => (
                        <label key={m.id} className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] cursor-pointer">
                          <input type="checkbox" checked={m.done} onChange={(e) => patchCampaign(c.id, { milestones: c.milestones.map((x: any) => x.id === m.id ? { ...x, done: e.target.checked } : x) })} className="accent-[var(--accent-primary)] w-3 h-3" />
                          <span className={m.done ? 'line-through opacity-60' : ''}>{m.title}</span>
                          <span className="font-mono text-[9px] text-[var(--text-muted)] ms-auto">{fmtDay(m.dueDate, tz)}</span>
                        </label>
                      ))}
                      <div className="flex gap-1.5 pt-0.5">
                        <input value={newMilestone[c.id] || ''} onChange={(e) => setNewMilestone({ ...newMilestone, [c.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addMilestone(c.id)} placeholder="Add milestone…" className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded px-2 py-1 text-[10px] text-[var(--text-primary)] focus:outline-none" />
                        <button type="button" onClick={() => addMilestone(c.id)} className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-color)] text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Add</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'planner' && (
        <PlannerPanel posts={posts} ideas={ideas} brands={brands} settings={settings || {}} tz={tz}
          onIdeas={(next: any[]) => onIdeas(next)}
          onReschedulePost={onReschedulePost} />
      )}

      {tab === 'reports' && (
        <ReportsPanel posts={posts} brands={brands} pillars={pillars} videos={videos} tz={tz} />
      )}

      {tab === 'unscheduled' && (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {unscheduled.length === 0 ? <p className="text-[11px] text-[var(--text-muted)]">No unscheduled posts — drafts and undated posts appear here.</p> : unscheduled.map((p: ScheduledPost) => {
            const st = STATUS_STYLE[p.status] || STATUS_STYLE.draft;
            return (
              <div key={p.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-main)]/50 border border-[var(--border-color)] text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.dot }} />
                <button type="button" onClick={() => onOpenPost(p.id)} className="text-[var(--text-primary)] flex-1 truncate text-start hover:text-[var(--accent-primary)]">{p.title || videos.find((v: any) => v.id === p.videoId)?.title || 'Untitled'}</button>
                <span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono ${st.cls}`}>{st.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Planner: best times, gaps, AI ideas, batch scheduling ---------- */
function PlannerPanel({ posts, ideas, brands, settings, tz, onIdeas, onReschedulePost }: any) {
  const [bestTimes, setBestTimes] = useState<any>(null);
  const [btLoading, setBtLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [batchSel, setBatchSel] = useState<Set<string>>(new Set());
  const [batchPlan, setBatchPlan] = useState<{ postId: string; iso: string }[] | null>(null);

  const loadBestTimes = () => {
    setBtLoading(true);
    apiFetch('/api/saas/queue/best-times').then((r) => r.json()).then((d) => { if (d.success) setBestTimes(d); }).catch(() => {}).finally(() => setBtLoading(false));
  };
  useEffect(() => { loadBestTimes(); }, []);

  // Content gaps: next 14 days with zero scheduled posts (real data)
  const gaps = useMemo(() => {
    const booked = new Set(posts.filter((p: ScheduledPost) => p.status === 'scheduled' || p.status === 'publishing').map((p: ScheduledPost) => dayKey(p.scheduledTime, tz)));
    const out: string[] = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0);
      const k = dayKey(d.toISOString(), tz);
      const wd = d.getDay();
      if ((settings.workingDays || []).includes(wd) && !booked.has(k)) out.push(k);
    }
    return out;
  }, [posts, settings, tz]);

  const unscheduledDrafts = posts.filter((p: ScheduledPost) => p.status === 'draft' || !p.scheduledTime);

  // Batch proposal: assign drafts to next working slots at workingHoursStart
  const proposeBatch = () => {
    const slots: { postId: string; iso: string }[] = [];
    const cursor = new Date();
    const ids = Array.from(batchSel);
    let i = 0;
    while (slots.length < ids.length && i < 60) {
      cursor.setDate(cursor.getDate() + 1); i++;
      const wd = cursor.getDay();
      if (!(settings.workingDays || [1, 2, 3, 4, 5]).includes(wd)) continue;
      const t = new Date(cursor); t.setHours(settings.workingHoursStart || 9, 0, 0, 0);
      slots.push({ postId: ids[slots.length], iso: t.toISOString() });
    }
    setBatchPlan(slots);
  };

  const confirmBatch = () => {
    if (!batchPlan) return;
    let ok = 0;
    batchPlan.forEach(({ postId, iso }) => { onReschedulePost?.(postId, iso, 'Batch scheduled from planner'); ok++; });
    setBatchSel(new Set()); setBatchPlan(null);
    alert(`${ok} post(s) scheduled.`);
  };

  const suggestAiIdeas = async () => {
    if (!brands.length) return;
    setAiLoading(true);
    try {
      const brand = brands[0];
      const res = await apiFetch('/api/ai/generate-hooks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: `${brand.name} content ideas` }),
      });
      const d = await res.json();
      if (d.success && Array.isArray(d.hooks) && d.hooks.length) {
        const newIdeas = d.hooks.slice(0, 5).map((h: string, i: number) => ({
          id: `idea_${Date.now().toString(36)}${i}`, title: String(h).slice(0, 140),
          brandId: brand.id, status: 'idea', aiGenerated: true, createdAt: new Date().toISOString(),
        }));
        onIdeas([...(ideas || []), ...newIdeas]);
      }
    } catch {} finally { setAiLoading(false); }
  };

  return (
    <div className="space-y-4">
      {/* Best times — real history or honest insufficient-data */}
      <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/40">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold text-[var(--text-primary)]">Best times to post</p>
          <button type="button" onClick={loadBestTimes} className="text-[10px] font-mono text-[var(--accent-primary)] hover:underline">{btLoading ? 'Loading…' : 'Refresh'}</button>
        </div>
        {!bestTimes ? <p className="text-[11px] text-[var(--text-muted)]">Loading…</p> : !bestTimes.sufficient ? (
          <p className="text-[11px] text-[var(--text-muted)]">{bestTimes.message || 'Insufficient publishing history for account-specific recommendations.'}</p>
        ) : (
          <div className="space-y-1">
            {bestTimes.suggestions.map((s: any) => (
              <div key={s.label} className="flex items-center justify-between text-[11px] px-2 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-color)]">
                <span className="font-mono text-[var(--text-primary)]">{s.label}</span>
                <span className="text-[10px] text-[var(--text-muted)]">{s.basis} · <span className="text-[var(--accent-primary)]">{s.confidence}% confidence</span></span>
              </div>
            ))}
            <p className="text-[9px] text-[var(--text-muted)]">{bestTimes.message} Suggestions only — nothing auto-reschedules.</p>
          </div>
        )}
      </div>

      {/* Content gaps — real empty working days */}
      <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/40">
        <p className="text-[11px] font-bold text-[var(--text-primary)] mb-1.5">Content gaps — next 14 days</p>
        {gaps.length === 0 ? <p className="text-[11px] text-emerald-400">Every working day has scheduled content.</p> : (
          <div className="flex flex-wrap gap-1.5">
            {gaps.map((k) => <span key={k} className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] font-mono text-amber-300">{fmtDay(k + 'T12:00:00', tz)}</span>)}
          </div>
        )}
      </div>

      {/* AI ideas — labeled suggestions, never auto-scheduled */}
      <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/40">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold text-[var(--text-primary)]">AI content ideas</p>
          <button type="button" onClick={suggestAiIdeas} disabled={aiLoading || !brands.length} className="px-2.5 py-1 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-[10px] font-bold disabled:opacity-40">
            {aiLoading ? 'Generating…' : 'Suggest ideas'}
          </button>
        </div>
        <p className="text-[10px] text-[var(--text-muted)]">AI-generated suggestions are added to your Ideas list — review before scheduling. They are not posts.</p>
      </div>

      {/* Batch scheduling — explicit preview + confirm */}
      <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/40">
        <p className="text-[11px] font-bold text-[var(--text-primary)] mb-1.5">Batch schedule drafts</p>
        {unscheduledDrafts.length === 0 ? <p className="text-[11px] text-[var(--text-muted)]">No unscheduled drafts to batch.</p> : (
          <>
            <div className="max-h-32 overflow-y-auto space-y-1 mb-2">
              {unscheduledDrafts.map((p: ScheduledPost) => (
                <label key={p.id} className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] cursor-pointer">
                  <input type="checkbox" checked={batchSel.has(p.id)} onChange={() => setBatchSel((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} className="accent-[var(--accent-primary)] w-3 h-3" />
                  <span className="truncate">{p.title || 'Untitled'}</span>
                </label>
              ))}
            </div>
            <button type="button" disabled={batchSel.size === 0} onClick={proposeBatch} className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40">
              Propose slots for {batchSel.size} post(s)
            </button>
            {batchPlan && (
              <div className="mt-2 p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--accent-primary)]/40">
                <p className="text-[10px] font-mono text-[var(--text-muted)] mb-1.5">Review proposed schedule — nothing saved yet:</p>
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {batchPlan.map((b) => {
                    const p = posts.find((x: ScheduledPost) => x.id === b.postId);
                    return <p key={b.postId} className="text-[10px] font-mono text-[var(--text-secondary)]">{p?.title || 'post'} → {fmtDay(b.iso, tz)} {fmtTime(b.iso, tz)}</p>;
                  })}
                </div>
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={confirmBatch} className="px-3 py-1 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-[10px] font-bold">Confirm & schedule</button>
                  <button type="button" onClick={() => setBatchPlan(null)} className="px-3 py-1 rounded-lg text-[10px] text-[var(--text-muted)]">Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Reports: real computed analytics + CSV export ---------- */
function ReportsPanel({ posts, brands, pillars, videos, tz }: any) {
  const [days, setDays] = useState(30);
  const since = Date.now() - days * 86400e3;
  const inRange = posts.filter((p: ScheduledPost) => new Date(p.scheduledTime || p.createdAt).getTime() >= since);

  const byStatus = inRange.reduce((m: any, p: ScheduledPost) => { m[p.status] = (m[p.status] || 0) + 1; return m; }, {});
  const planned = inRange.filter((p: ScheduledPost) => ['scheduled', 'optimizing', 'publishing', 'draft'].includes(p.status)).length;
  const published = byStatus.published || 0;
  const failed = byStatus.failed || 0;

  const byBrand = brands.map((b: any) => {
    const ps = inRange.filter((p: ScheduledPost) => p.brandId === b.id);
    return { name: b.name, total: ps.length, published: ps.filter((p: ScheduledPost) => p.status === 'published').length, failed: ps.filter((p: ScheduledPost) => p.status === 'failed').length };
  }).filter((b: any) => b.total > 0);

  const byPlatform: Record<string, { total: number; published: number; failed: number }> = {};
  inRange.forEach((p: ScheduledPost) => (p.channelPlatforms || []).forEach((pl) => {
    if (!byPlatform[pl]) byPlatform[pl] = { total: 0, published: 0, failed: 0 };
    byPlatform[pl].total++;
    if (p.status === 'published') byPlatform[pl].published++;
    if (p.status === 'failed') byPlatform[pl].failed++;
  }));

  const byPillar: Record<string, number> = {};
  inRange.forEach((p: ScheduledPost) => { const pid = (p as any).pillarId; if (pid) byPillar[pid] = (byPillar[pid] || 0) + 1; });
  const byDow: Record<number, number> = {};
  inRange.forEach((p: ScheduledPost) => { if (p.scheduledTime) { const d = new Date(p.scheduledTime).getDay(); byDow[d] = (byDow[d] || 0) + 1; } });

  const exportCSV = () => {
    const rows = [['id', 'title', 'brand', 'platforms', 'status', 'priority', 'scheduled', 'published', 'pillar', 'campaign', 'retries']];
    inRange.forEach((p: ScheduledPost) => rows.push([
      p.id, p.title || '', brands.find((b: any) => b.id === p.brandId)?.name || '',
      (p.channelPlatforms || []).join('|'), p.status, (p as any).priority || 'normal',
      p.scheduledTime || '', p.publishedTime || '',
      pillars.find((x: any) => x.id === (p as any).pillarId)?.name || '',
      '', String(p.retryCount || 0),
    ]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `publora-calendar-report-${days}d.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const Row = ({ label, a, b }: any) => (
    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[var(--bg-main)]/40 text-[11px]">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-mono text-[var(--text-primary)]">{a}{b ? <span className="text-[var(--text-muted)]"> · {b}</span> : null}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-[var(--text-primary)]">Calendar analytics — last {days} days</p>
        <div className="flex items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-md px-2 py-1 text-[10px] text-[var(--text-secondary)]">
            <option value={7}>7d</option><option value={30}>30d</option><option value={90}>90d</option>
          </select>
          <button type="button" onClick={exportCSV} className="px-2.5 py-1 rounded-md border border-[var(--border-color)] text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <RPStat label="Posts in range" value={inRange.length} />
        <RPStat label="Planned" value={planned} />
        <RPStat label="Published" value={published} tone="success" />
        <RPStat label="Failed" value={failed} tone={failed > 0 ? 'error' : undefined} />
      </div>

      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">By brand</p>
        <div className="space-y-1">{byBrand.length ? byBrand.map((b: any) => <Row key={b.name} label={b.name} a={`${b.published}/${b.total} published`} b={b.failed ? `${b.failed} failed` : undefined} />) : <p className="text-[11px] text-[var(--text-muted)]">No posts in range.</p>}</div>
      </div>
      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">By platform</p>
        <div className="space-y-1">{Object.keys(byPlatform).length ? Object.entries(byPlatform).map(([pl, s]: any) => <Row key={pl} label={pl.toUpperCase()} a={`${s.published}/${s.total} published`} b={s.failed ? `${s.failed} failed` : undefined} />) : <p className="text-[11px] text-[var(--text-muted)]">No platform data.</p>}</div>
      </div>
      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">By content pillar</p>
        <div className="space-y-1">{Object.keys(byPillar).length ? Object.entries(byPillar).map(([pid, n]: any) => <Row key={pid} label={pillars.find((x: any) => x.id === pid)?.name || 'Uncategorized'} a={String(n)} />) : <p className="text-[11px] text-[var(--text-muted)]">No pillar-tagged posts.</p>}</div>
      </div>
      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">By day of week</p>
        <div className="flex gap-1">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <span key={d} className="flex-1 text-center px-1 py-1.5 rounded bg-[var(--bg-main)]/40 text-[10px] font-mono text-[var(--text-secondary)]">{d}<br /><span className="text-[var(--text-primary)] font-bold">{byDow[i] || 0}</span></span>)}</div>
      </div>
      <p className="text-[10px] text-[var(--text-muted)]">Engagement metrics: unavailable — no platform analytics connected. Counts are computed from actual post records only.</p>
    </div>
  );
}

const RPStat: React.FC<{ label: string; value: number; tone?: 'success' | 'error' }> = ({ label, value, tone }) => (
  <div className="bg-[var(--bg-main)]/40 border border-[var(--border-color)] rounded-lg px-3 py-2.5">
    <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
    <p className={`text-sm font-bold mt-0.5 ${tone === 'success' ? 'text-emerald-400' : tone === 'error' ? 'text-rose-400' : 'text-[var(--text-primary)]'}`}>{value}</p>
  </div>
);

/* ---------- conflict detection: same brand+platform within 30 min ---------- */
export function findConflicts(post: ScheduledPost, allPosts: ScheduledPost[]): ScheduledPost[] {
  const t = new Date(post.scheduledTime).getTime();
  if (isNaN(t)) return [];
  return allPosts.filter((p) => {
    if (p.id === post.id || p.status === 'published' || p.status === 'failed' || p.status === 'draft') return false;
    if (p.brandId !== post.brandId) return false;
    const shared = (p.channelPlatforms || []).some((pl) => (post.channelPlatforms || []).includes(pl));
    if (!shared) return false;
    return Math.abs(new Date(p.scheduledTime).getTime() - t) < 30 * 60 * 1000;
  });
}

const PmBtn: React.FC<{ onClick: () => void; children: React.ReactNode; danger?: boolean; primary?: boolean }> = ({ onClick, children, danger, primary }) => (
  <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition ${primary ? 'bg-[var(--accent-primary)] border-transparent text-[var(--accent-primary-text)] hover:opacity-90' : danger ? 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10' : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'}`}>{children}</button>
);

function fmtDT2(iso?: string) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

function CommentInput({ onAdd }: { onAdd: (body: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="flex gap-1.5">
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); } }} placeholder="Add a comment…" className="flex-1 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-md px-2 py-1 text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]" />
      <button type="button" disabled={!v.trim()} onClick={() => { onAdd(v.trim()); setV(''); }} className="px-2 py-1 rounded-md bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] text-[10px] font-bold disabled:opacity-40">Post</button>
    </div>
  );
}

function meta(label: string, value: React.ReactNode) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--border-subtle)] last:border-0">
      <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
      <span className="text-[10px] font-medium text-[var(--text-primary)] font-mono text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}
