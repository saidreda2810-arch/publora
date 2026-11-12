import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePublisher } from '../context/PublisherContext';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import {
  FileText, Download, RefreshCw, Search, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, Clock, CalendarDays, Video, Layers, Filter,
  ArrowUpDown, Eye, Heart, MessageCircle, Share2, AlertTriangle, BarChart3, ShieldAlert, Sparkles, Bell,
} from 'lucide-react';
import { ScheduledPost, Platform } from '../types';

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'text-[var(--text-secondary)] border-slate-500/40 bg-slate-500/10' },
  scheduled: { label: 'Scheduled', cls: 'text-sky-400 border-sky-500/40 bg-sky-500/10' },
  optimizing: { label: 'Optimizing', cls: 'text-violet-400 border-violet-500/40 bg-violet-500/10' },
  publishing: { label: 'Publishing', cls: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
  published: { label: 'Published', cls: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' },
  failed: { label: 'Failed', cls: 'text-rose-400 border-rose-500/40 bg-rose-500/10' },
  paused: { label: 'Paused', cls: 'text-[var(--text-muted)] border-[var(--border-color)] bg-[var(--bg-main)]/40' },
};

const RANGE_DAYS: Record<string, number> = { today: 1, yesterday: 2, '7d': 7, '30d': 30, '90d': 90, all: 0 };

export const ReportsView: React.FC<{ setActiveTab?: (t: string) => void }> = ({ setActiveTab }) => {
  const { videos, brands, accounts } = usePublisher();
  const { activeWorkspace } = useAuth();

  const [range, setRange] = useState('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [fBrand, setFBrand] = useState('all');
  const [fPlatform, setFPlatform] = useState('all');
  const [fAccount, setFAccount] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [items, setItems] = useState<ScheduledPost[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const daysParam = useMemo(() => {
    if (range === 'custom') return 0;
    return RANGE_DAYS[range] ?? 30;
  }, [range]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        days: String(daysParam), sort, page: String(page), pageSize: String(pageSize),
        brandId: fBrand, platform: fPlatform, accountId: fAccount, status: fStatus, q: query,
      });
      if (range === 'custom' && customFrom && customTo) {
        params.set('from', customFrom); params.set('to', customTo);
      }
      const res = await apiFetch(`/api/saas/history?${params}`);
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to load history');
      setItems(d.items || []);
      setTotal(d.pagination?.total ?? 0);
      setTotalPages(d.pagination?.totalPages ?? 0);
      setLastSync(d.syncedAt || new Date().toISOString());
    } catch (e: any) {
      setError(e.message || 'Failed to load publishing history');
      setItems([]); setTotal(0); setTotalPages(0);
    } finally { setLoading(false); }
  }, [daysParam, range, customFrom, customTo, sort, page, pageSize, fBrand, fPlatform, fAccount, fStatus, query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [range, customFrom, customTo, fBrand, fPlatform, fAccount, fStatus, query, sort]);

  /* ---------- metrics from loaded page + totals ---------- */
  const metrics = useMemo(() => {
    const published = items.filter((p) => p.status === 'published');
    const failed = items.filter((p) => p.status === 'failed');
    const scheduled = items.filter((p) => p.status === 'scheduled');
    // Analytics honesty: only sum metrics that exist
    const withViews = items.flatMap((p: any) => (p.analytics || []).filter((a: any) => typeof a.views === 'number'));
    const totalViews = withViews.reduce((s: number, a: any) => s + a.views, 0);
    const engagement = items.flatMap((p: any) => (p.analytics || []).filter((a: any) => typeof a.likes === 'number'));
    const totalLikes = engagement.reduce((s: number, a: any) => s + (a.likes || 0), 0);
    const totalComments = engagement.reduce((s: number, a: any) => s + (a.comments || 0), 0);
    const totalShares = engagement.reduce((s: number, a: any) => s + (a.shares || 0), 0);
    return { published: published.length, failed: failed.length, scheduled: scheduled.length, totalViews, viewsAvailable: withViews.length > 0, totalLikes, totalComments, totalShares, engagementAvailable: engagement.length > 0 };
  }, [items]);

  /* ---------- CSV export of filtered results ---------- */
  const exportCSV = () => {
    const headers = ['Post ID', 'Title', 'Brand', 'Platforms', 'Status', 'Priority', 'Scheduled', 'Published', 'Views', 'Likes', 'Comments', 'Shares', 'Retries', 'Last Error'];
    const rows = items.map((p: any) => {
      const an = (p.analytics || [])[0] || {};
      return [
        p.id, `"${(p.title || '').replace(/"/g, '""')}"`, brands.find((b) => b.id === p.brandId)?.name || '',
        `"${(p.channelPlatforms || []).join('|')}"`, p.status, p.priority || 'normal',
        p.scheduledTime || '', p.publishedTime || '',
        an.views ?? '', an.likes ?? '', an.comments ?? '', an.shares ?? '',
        p.retryCount || 0, `"${(p.lastPublishError?.message || '').replace(/"/g, '""')}"`,
      ];
    });
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `publora-history-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const detail = items.find((p) => p.id === detailId) || null;

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-[var(--border-color)] pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)] tracking-tight flex items-center gap-2"><FileText size={20} className="text-[var(--accent-primary)]" /> Publishing History</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Verified publishing records and performance — {activeWorkspace?.name || 'Workspace'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={load} className="p-2 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]" title="Refresh"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          <button type="button" onClick={exportCSV} disabled={items.length === 0} className="px-3 py-2 rounded-lg border border-[var(--border-color)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 flex items-center gap-1.5"><Download size={13} /> Export CSV</button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col xl:flex-row xl:items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['today', 'yesterday', '7d', '30d', '90d', 'all'] as const).map((r) => (
            <button key={r} type="button" onClick={() => setRange(r)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono uppercase transition ${range === r ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)] font-bold' : 'border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>{r === 'all' ? 'All time' : r}</button>
          ))}
          <button type="button" onClick={() => setRange('custom')} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono uppercase transition ${range === 'custom' ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)] font-bold' : 'border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>Custom</button>
        </div>
        {range === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-primary)]" />
            <span className="text-[var(--text-muted)] text-[10px]">→</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-primary)]" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 xl:ms-auto">
          <Sel value={fBrand} onChange={setFBrand} options={[['all', 'All brands'], ...brands.map((b) => [b.id, b.name] as [string, string])]} />
          <Sel value={fPlatform} onChange={setFPlatform} options={[['all', 'All platforms'], ['youtube', 'YouTube'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['facebook', 'Facebook']]} />
          <Sel value={fAccount} onChange={setFAccount} options={[['all', 'All accounts'], ...accounts.map((a) => [a.id, a.accountName || a.handle || a.platform] as [string, string])]} />
          <Sel value={fStatus} onChange={setFStatus} options={[['all', 'All statuses'], ...Object.entries(STATUS_STYLE).map(([k, v]) => [k, v.label] as [string, string])]} />
          <div className="relative">
            <Search size={12} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title…" className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg ps-7 pe-2 py-1.5 text-[11px] text-[var(--text-primary)] w-36 focus:outline-none focus:border-[var(--accent-primary)]" />
          </div>
        </div>
      </div>

      {lastSync && <p className="text-[10px] font-mono text-[var(--text-muted)]">Last sync: {new Date(lastSync).toLocaleString()}</p>}

      {/* Metric cards — honest zero/unavailable */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <MCard icon={CheckCircle2} label="Published" value={metrics.published} tone="success" />
        <MCard icon={XCircle} label="Failed" value={metrics.failed} tone={metrics.failed ? 'error' : undefined} />
        <MCard icon={Clock} label="Scheduled" value={metrics.scheduled} tone="info" />
        <MCard icon={FileText} label="Total records" value={total} />
        <MCard icon={Eye} label="Views" value={metrics.viewsAvailable ? metrics.totalViews.toLocaleString() : '—'} sub={metrics.viewsAvailable ? 'synced analytics' : 'not synced'} />
        <MCard icon={Heart} label="Likes" value={metrics.engagementAvailable ? metrics.totalLikes.toLocaleString() : '—'} sub={metrics.engagementAvailable ? 'synced' : 'not synced'} />
        <MCard icon={MessageCircle} label="Comments" value={metrics.engagementAvailable ? metrics.totalComments.toLocaleString() : '—'} sub={metrics.engagementAvailable ? 'synced' : 'not synced'} />
        <MCard icon={Share2} label="Shares" value={metrics.engagementAvailable ? metrics.totalShares.toLocaleString() : '—'} sub={metrics.engagementAvailable ? 'synced' : 'not synced'} />
      </div>
      {!metrics.viewsAvailable && total > 0 && (
        <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1"><AlertTriangle size={11} className="text-amber-400" /> View/engagement metrics show — because no platform analytics have been synced yet. Counts reflect post records only.</p>
      )}

      {/* Table */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        {error ? (
          <div className="p-10 text-center"><p className="text-sm text-rose-400 font-semibold">{error}</p><button type="button" onClick={load} className="mt-3 text-xs text-[var(--accent-primary)] hover:underline">Retry</button></div>
        ) : loading ? (
          <div className="p-10 text-center text-xs text-[var(--text-muted)] font-mono">Loading history…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarDays size={30} className="text-[var(--text-muted)] mx-auto opacity-60 mb-3" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">No publishing records in this range</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">Verified publishing history appears here after your first scheduled post is processed.</p>
            {setActiveTab && <button type="button" onClick={() => setActiveTab('calendar')} className="mt-4 px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-xs font-bold">Open Calendar</button>}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[900px]">
                <thead>
                  <tr className="border-b border-[var(--border-color)] text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                    <Th label="Video" />
                    <Th label="Brand" />
                    <Th label="Platforms" />
                    <Th label="Status" />
                    <Th label="Scheduled" />
                    <Th label="Published" />
                    <Th label="Views" right />
                    <Th label="Engagement" right />
                    <Th label="Result" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {items.map((p: any) => {
                    const vid = videos.find((v) => v.id === p.videoId);
                    const st = STATUS_STYLE[p.status] || STATUS_STYLE.draft;
                    const an = (p.analytics || [])[0] || null;
                    const eng = an ? (an.likes || 0) + (an.comments || 0) + (an.shares || 0) : null;
                    return (
                      <tr key={p.id} onClick={() => setDetailId(p.id)} className="hover:bg-[var(--bg-surface-hover)] cursor-pointer transition">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            {vid?.thumbnailUrl ? <img src={vid.thumbnailUrl} alt="" className="w-9 h-9 rounded-md object-cover bg-[var(--bg-input)] shrink-0" loading="lazy" /> : <div className="w-9 h-9 rounded-md bg-[var(--bg-main)] border border-[var(--border-color)] flex items-center justify-center shrink-0"><Video size={13} className="text-[var(--text-muted)]" /></div>}
                            <div className="min-w-0"><p className="font-medium text-[var(--text-primary)] truncate max-w-[220px]">{p.title || vid?.title || 'Untitled'}</p><p className="text-[9px] font-mono text-[var(--text-muted)]">{p.id.slice(0, 12)}</p></div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[var(--text-secondary)]">{brands.find((b) => b.id === p.brandId)?.name || '—'}</td>
                        <td className="py-2.5 px-3"><div className="flex gap-1">{(p.channelPlatforms || []).map((pl: string) => <span key={pl} className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-secondary)]">{pl.slice(0, 2)}</span>)}</div></td>
                        <td className="py-2.5 px-3"><span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono ${st.cls}`}>{st.label}</span></td>
                        <td className="py-2.5 px-3 font-mono text-[var(--text-muted)] whitespace-nowrap">{fmtDT(p.scheduledTime)}</td>
                        <td className="py-2.5 px-3 font-mono text-[var(--text-muted)] whitespace-nowrap">{p.publishedTime ? fmtDT(p.publishedTime) : '—'}</td>
                        <td className="py-2.5 px-3 text-end font-mono text-[var(--text-secondary)]">{an?.views != null ? an.views.toLocaleString() : '—'}</td>
                        <td className="py-2.5 px-3 text-end font-mono text-[var(--text-secondary)]">{eng != null ? eng.toLocaleString() : '—'}</td>
                        <td className="py-2.5 px-3">
                          {p.status === 'failed' ? <span className="text-[9px] font-mono text-rose-400">{p.lastPublishError?.class || 'failed'}</span>
                            : p.status === 'published' ? <span className="text-[9px] font-mono text-emerald-400">confirmed</span>
                            : p.retryCount ? <span className="text-[9px] font-mono text-amber-400">retry {p.retryCount}</span>
                            : <span className="text-[9px] font-mono text-[var(--text-muted)]">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border-color)]">
              <span className="text-[10px] font-mono text-[var(--text-muted)]">{total} records · page {page}/{Math.max(totalPages, 1)}</span>
              <div className="flex items-center gap-1">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded border border-[var(--border-color)] text-[var(--text-secondary)] disabled:opacity-40"><ChevronLeft size={13} /></button>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded border border-[var(--border-color)] text-[var(--text-secondary)] disabled:opacity-40"><ChevronRight size={13} /></button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Publishing alerts — real event-derived notifications */}
      <AlertsStrip />

      {/* Smart insights — real-data pattern detection only */}
      <InsightsPanel days={daysParam || 30} />

      {/* Brand & campaign reporting */}
      <BrandCampaignPanel days={daysParam || 30} />

      {/* Publishing reliability — failure analysis & retry visibility */}
      <ReliabilityPanel days={daysParam || 30} brandId={fBrand} platform={fPlatform} />

      {/* Report generator — CSV + PDF of real filtered records */}
      <ReportGeneratorPanel days={daysParam || 30} customFrom={customFrom} customTo={customTo} range={range} fBrand={fBrand} fPlatform={fPlatform} fAccount={fAccount} fStatus={fStatus} query={query} />

      {/* Performance analytics — real synced VideoAnalytics only */}
      <AnalyticsPanel days={daysParam || 30} brandId={fBrand} platform={fPlatform} />

      {/* Detail modal — Phase 3 will expand with full audit timeline */}
      {detail && <HistoryDetail post={detail} video={videos.find((v) => v.id === detail.videoId)} brand={brands.find((b) => b.id === detail.brandId)} accounts={accounts} onClose={() => setDetailId(null)} />}
    </div>
  );
};

const Sel: React.FC<{ value: string; onChange: (v: string) => void; options: [string, string][] }> = ({ value, onChange, options }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-primary)]">
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
);

const Th: React.FC<{ label: string; right?: boolean }> = ({ label, right }) => <th className={`py-2.5 px-3 font-medium ${right ? 'text-end' : 'text-start'}`}>{label}</th>;

const MCard: React.FC<{ icon: any; label: string; value: React.ReactNode; sub?: string; tone?: 'success' | 'error' | 'info' }> = ({ icon: Icon, label, value, sub, tone }) => (
  <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-3 py-2.5">
    <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1"><Icon size={10} /> {label}</p>
    <p className={`text-base font-bold mt-0.5 ${tone === 'success' ? 'text-emerald-400' : tone === 'error' ? 'text-rose-400' : tone === 'info' ? 'text-sky-400' : 'text-[var(--text-primary)]'}`}>{value}</p>
    {sub && <p className="text-[9px] font-mono text-[var(--text-muted)]">{sub}</p>}
  </div>
);

function fmtDT(iso?: string) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; }
}

/* ---------- Publishing alerts: real notifications from queue events ---------- */
function AlertsStrip() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    apiFetch('/api/saas/queue/notifications').then((r) => r.json()).then((d) => {
      if (d.success) setItems((d.notifications || []).filter((n: any) => /fail|retry|publish|disconnect|error/i.test(n.type + ' ' + (n.message || ''))).slice(0, 10));
    }).catch(() => {});
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-2.5 text-start hover:bg-[var(--bg-surface-hover)] transition">
        <span className="text-[11px] font-bold text-[var(--text-primary)] flex items-center gap-2"><Bell size={13} className="text-amber-400" /> {items.length} publishing alert{items.length === 1 ? '' : 's'}</span>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="border-t border-[var(--border-color)] divide-y divide-[var(--border-subtle)]">
          {items.map((n: any, i: number) => (
            <div key={i} className="flex items-start gap-2.5 px-4 py-2">
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${n.severity === 'error' || /fail|error/i.test(n.type) ? 'bg-rose-400' : 'bg-amber-400'}`} />
              <div className="min-w-0"><p className="text-[11px] text-[var(--text-secondary)]">{n.message || n.type}</p><p className="text-[9px] font-mono text-[var(--text-muted)]">{n.ts ? new Date(n.ts).toLocaleString() : ''}</p></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Smart insights: rule-based patterns from real records only ---------- */
function InsightsPanel({ days }: { days: number }) {
  const [open, setOpen] = useState(false);
  const [insights, setInsights] = useState<{ text: string; basis: string; tone: 'info' | 'warn' | 'error' | 'success' }[] | null>(null);
  const [loading, setLoading] = useState(false);

  const compute = useCallback(async () => {
    setLoading(true);
    try {
      const span = days || 30;
      const fetchRange = async (d: number) => {
        const params = new URLSearchParams({ days: String(d), sort: 'date_desc', page: '1', pageSize: '100' });
        const r = await apiFetch(`/api/saas/history?${params}`);
        const j = await r.json();
        return j.success ? j.items || [] : [];
      };
      const [cur, prev] = await Promise.all([fetchRange(span), fetchRange(span * 2).then((items) => items.filter((p: any) => new Date(p.scheduledTime || 0).getTime() < Date.now() - span * 86400e3))]);
      const out: { text: string; basis: string; tone: 'info' | 'warn' | 'error' | 'success' }[] = [];

      // 1. Activity change vs previous equivalent period
      const pub = (arr: any[]) => arr.filter((p) => p.status === 'published').length;
      const curPub = pub(cur), prevPub = pub(prev);
      if (prevPub >= 3 && curPub < prevPub) out.push({ text: `Publishing activity decreased ${Math.round(((prevPub - curPub) / prevPub) * 100)}% vs the previous ${span} days`, basis: `${curPub} vs ${prevPub} published posts`, tone: 'warn' });
      else if (prevPub >= 3 && curPub > prevPub) out.push({ text: `Publishing activity increased ${Math.round(((curPub - prevPub) / prevPub) * 100)}% vs the previous ${span} days`, basis: `${curPub} vs ${prevPub} published posts`, tone: 'success' });

      // 2. Platform failure comparison (only platforms with >=3 posts)
      const platStats: Record<string, { total: number; failed: number }> = {};
      cur.forEach((p: any) => (p.channelPlatforms || []).forEach((pl: string) => {
        if (!platStats[pl]) platStats[pl] = { total: 0, failed: 0 };
        platStats[pl].total++; if (p.status === 'failed') platStats[pl].failed++;
      }));
      const plats = Object.entries(platStats).filter(([, s]) => s.total >= 3);
      if (plats.length >= 2) {
        const rates = plats.map(([pl, s]) => ({ pl, rate: s.failed / s.total })).sort((a, b) => b.rate - a.rate);
        if (rates[0].rate > rates[rates.length - 1].rate * 2 && rates[0].rate > 0.2)
          out.push({ text: `${rates[0].pl.toUpperCase()} has a notably higher failure rate than other platforms`, basis: `${Math.round(rates[0].rate * 100)}% vs ${Math.round(rates[rates.length - 1].rate * 100)}%`, tone: 'error' });
      }

      // 3. Brands with gaps (>=7 days, >=3 published posts historically, none in last 7d)
      const brandIds = [...new Set(cur.map((p: any) => p.brandId).filter(Boolean))];
      const last7 = cur.filter((p: any) => p.status === 'published' && new Date(p.publishedTime || p.scheduledTime).getTime() > Date.now() - 7 * 86400e3);
      const activeBrands = new Set(last7.map((p: any) => p.brandId));
      brandIds.forEach((bid: any) => { if (!activeBrands.has(bid) && cur.filter((p: any) => p.brandId === bid && p.status === 'published').length >= 1) out.push({ text: 'A brand has no published content in the last 7 days', basis: `brand ${String(bid).slice(0, 12)}`, tone: 'info' }); });

      // 4. Above-average videos (real analytics only)
      const withViews = cur.flatMap((p: any) => (p.analytics || []).filter((a: any) => typeof a.views === 'number').map((a: any) => ({ ...a, title: p.title })));
      if (withViews.length >= 5) {
        const avg = withViews.reduce((s: number, a: any) => s + a.views, 0) / withViews.length;
        const top = withViews.filter((a: any) => a.views > avg * 1.5).sort((a: any, b: any) => b.views - a.views)[0];
        if (top) out.push({ text: `"${top.title || 'A video'}" performed well above the workspace average`, basis: `${top.views.toLocaleString()} views vs ${Math.round(avg).toLocaleString()} avg (${withViews.length} records)`, tone: 'success' });
      }

      // 5. Unknown outcomes needing reconciliation
      const unknown = cur.filter((p: any) => p.lastPublishError?.class === 'unknown_outcome');
      if (unknown.length) out.push({ text: `${unknown.length} post(s) have uncertain publish outcomes requiring reconciliation`, basis: 'unknown_outcome error class', tone: 'warn' });

      setInsights(out.slice(0, 8));
    } finally { setLoading(false); }
  }, [days]);

  useEffect(() => { if (open && !insights) compute(); }, [open]);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-start hover:bg-[var(--bg-surface-hover)] transition">
        <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2"><Sparkles size={14} className="text-[var(--accent-primary)]" /> Smart Insights <span className="text-[10px] font-mono text-[var(--text-muted)] font-normal">patterns from your actual data</span></span>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="border-t border-[var(--border-color)] p-4">
          {loading ? <p className="text-[11px] text-[var(--text-muted)] font-mono">Analyzing…</p>
            : !insights || insights.length === 0 ? <p className="text-[11px] text-[var(--text-muted)]">Not enough data for insights yet — they appear when real patterns exist in your publishing history.</p>
            : (
              <div className="space-y-1.5">
                {insights.map((i, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-[var(--bg-main)]/40 border border-[var(--border-color)]">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${i.tone === 'error' ? 'bg-rose-400' : i.tone === 'warn' ? 'bg-amber-400' : i.tone === 'success' ? 'bg-emerald-400' : 'bg-sky-400'}`} />
                    <div><p className="text-[11px] text-[var(--text-primary)]">{i.text}</p><p className="text-[9px] font-mono text-[var(--text-muted)]">{i.basis} · last {days}d</p></div>
                  </div>
                ))}
                <p className="text-[9px] text-[var(--text-muted)]">Insights describe observed patterns in your records — they do not predict outcomes.</p>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

/* ---------- Brand & campaign reports: real breakdowns ---------- */
function BrandCampaignPanel({ days }: { days: number }) {
  const { brands, campaigns, contentPillars } = usePublisher();
  const [tab, setTab] = useState<'brands' | 'campaigns'>('brands');
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ days: String(days || 0), sort: 'date_desc', page: '1', pageSize: '100' });
    apiFetch(`/api/saas/history?${params}`).then((r) => r.json()).then((d) => { if (d.success) setData(d.items || []); }).catch(() => {}).finally(() => setLoading(false));
  }, [days]);

  const brandStats = useMemo(() => {
    if (!data) return [];
    return brands.map((b) => {
      const ps = data.filter((p) => p.brandId === b.id);
      return {
        brand: b, total: ps.length,
        published: ps.filter((p) => p.status === 'published').length,
        failed: ps.filter((p) => p.status === 'failed').length,
        scheduled: ps.filter((p) => p.status === 'scheduled').length,
        platforms: [...new Set(ps.flatMap((p) => p.channelPlatforms || []))],
      };
    }).filter((s) => s.total > 0).sort((a, b) => b.total - a.total);
  }, [data, brands]);

  const campaignStats = useMemo(() => {
    if (!data) return [];
    return (campaigns || []).map((c: any) => {
      const linked = data.filter((p) => p.campaignId === c.id);
      const milestones = c.milestones || [];
      const doneMs = milestones.filter((m: any) => m.done).length;
      return {
        campaign: c, total: linked.length,
        published: linked.filter((p) => p.status === 'published').length,
        failed: linked.filter((p) => p.status === 'failed').length,
        scheduled: linked.filter((p) => p.status === 'scheduled').length,
        milestones: milestones.length, doneMs,
        outOfRange: linked.filter((p) => p.scheduledTime && (new Date(p.scheduledTime) < new Date(c.startDate) || new Date(p.scheduledTime) > new Date(c.endDate + 'T23:59:59'))).length,
      };
    }).sort((a, b) => b.total - a.total);
  }, [data, campaigns]);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
        <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2"><Layers size={14} className="text-[var(--accent-primary)]" /> Brand & Campaign Reports</span>
        <div className="flex gap-1">
          {(['brands', 'campaigns'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold capitalize ${tab === t ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>{t}</button>
          ))}
        </div>
      </div>
      <div className="p-4">
        {loading ? <p className="text-[11px] text-[var(--text-muted)] font-mono">Loading…</p>
          : tab === 'brands' ? (
            brandStats.length === 0 ? <p className="text-[11px] text-[var(--text-muted)]">No brand activity in range.</p> : (
              <div className="space-y-1.5">
                {brandStats.map((s) => (
                  <div key={s.brand.id} className="px-3 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/40">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.brand.color || '#00D6B2' }} />
                      <span className="text-xs font-bold text-[var(--text-primary)] flex-1 truncate">{s.brand.name}</span>
                      <span className="text-[10px] font-mono text-[var(--text-muted)]">{s.total} posts</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono">
                      <span className="text-emerald-400">{s.published} published</span>
                      <span className="text-rose-400">{s.failed} failed</span>
                      <span className="text-sky-400">{s.scheduled} scheduled</span>
                      <span className="text-[var(--text-muted)] ms-auto">{s.platforms.map((p) => p.toUpperCase()).join(' · ') || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            campaignStats.length === 0 ? <p className="text-[11px] text-[var(--text-muted)]">No campaigns yet — create them in Calendar → Organize → Campaigns.</p> : (
              <div className="space-y-1.5">
                {campaignStats.map((s) => {
                  const pct = s.total ? Math.round((s.published / s.total) * 100) : 0;
                  return (
                    <div key={s.campaign.id} className="px-3 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/40">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.campaign.color || '#00D6B2' }} />
                        <span className="text-xs font-bold text-[var(--text-primary)] flex-1 truncate">{s.campaign.name}</span>
                        <span className="text-[10px] font-mono text-[var(--text-muted)]">{s.campaign.status}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono">
                        <span className="text-emerald-400">{s.published}/{s.total} published</span>
                        <span className="text-rose-400">{s.failed} failed</span>
                        <span className="text-sky-400">{s.scheduled} scheduled</span>
                        <span className="text-[var(--text-muted)]">{s.doneMs}/{s.milestones} milestones</span>
                        {s.outOfRange > 0 && <span className="text-amber-400">⚠ {s.outOfRange} out-of-range</span>}
                      </div>
                      <div className="h-1 rounded-full bg-[var(--bg-surface)] mt-1.5 overflow-hidden"><div className="h-full" style={{ width: `${pct}%`, backgroundColor: s.campaign.color || '#00D6B2' }} /></div>
                    </div>
                  );
                })}
              </div>
            )
          )}
      </div>
    </div>
  );
}

/* ---------- Publishing reliability: failure taxonomy from real records ---------- */
const ERROR_GUIDANCE: Record<string, { action: string }> = {
  adapter_missing: { action: 'Platform adapter not implemented — publishing cannot succeed until the adapter is built.' },
  auth_expired: { action: 'Reconnect the social account — authorization has expired.' },
  rate_limited: { action: 'Wait for the platform rate limit to reset, then retry.' },
  network_error: { action: 'Transient network failure — automatic retry is scheduled.' },
  invalid_media: { action: 'Check the video file format/size against platform requirements.' },
  permission_denied: { action: 'Grant the required publishing permission on the connected account.' },
  permanent_rejection: { action: 'Platform rejected the content — review and resubmit manually.' },
  unknown_outcome: { action: 'Outcome uncertain — reconcile with the platform before any retry to avoid duplicates.' },
};

function ReliabilityPanel({ days, brandId, platform }: { days: number; brandId: string; platform: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ days: String(days || 0), sort: 'date_desc', page: '1', pageSize: '100', brandId, platform, status: 'all' });
    apiFetch(`/api/saas/history?${params}`).then((r) => r.json()).then((d) => {
      if (d.success) setData(d.items || []); else setError(d.error || 'Failed');
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [days, brandId, platform]);

  useEffect(() => { if (open && !data) load(); }, [open]);

  const stats = useMemo(() => {
    if (!data) return null;
    const published = data.filter((p) => p.status === 'published');
    const failed = data.filter((p) => p.status === 'failed');
    const scheduled = data.filter((p) => p.status === 'scheduled');
    const retries = data.filter((p) => (p.retryCount || 0) > 0);
    const unknown = failed.filter((p) => p.lastPublishError?.class === 'unknown_outcome');
    const inFlight = data.filter((p) => p.status === 'publishing' || p.lockedForPublishing);
    const attempts = published.length + failed.length + retries.reduce((s, p) => s + (p.retryCount || 0), 0);
    const successRate = attempts > 0 ? Math.round((published.length / attempts) * 100) : null;
    // Failure breakdown by class
    const byClass: Record<string, number> = {};
    failed.forEach((p) => { const c = p.lastPublishError?.class || 'unclassified'; byClass[c] = (byClass[c] || 0) + 1; });
    // Per-platform failure rate
    const byPlatform: Record<string, { total: number; failed: number }> = {};
    data.forEach((p) => (p.channelPlatforms || []).forEach((pl: string) => {
      if (!byPlatform[pl]) byPlatform[pl] = { total: 0, failed: 0 };
      byPlatform[pl].total++;
      if (p.status === 'failed') byPlatform[pl].failed++;
    }));
    return { total: data.length, published: published.length, failed: failed.length, scheduled: scheduled.length, retries: retries.length, unknown: unknown.length, inFlight: inFlight.length, attempts, successRate, byClass, byPlatform };
  }, [data]);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-start hover:bg-[var(--bg-surface-hover)] transition">
        <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2"><ShieldAlert size={14} className="text-[var(--accent-primary)]" /> Publishing Reliability <span className="text-[10px] font-mono text-[var(--text-muted)] font-normal">failure analysis & retries</span></span>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="border-t border-[var(--border-color)] p-4 space-y-4">
          {loading ? <p className="text-[11px] text-[var(--text-muted)] font-mono">Loading…</p>
            : error ? <p className="text-[11px] text-rose-400">{error}</p>
            : !data || data.length === 0 ? <p className="text-[11px] text-[var(--text-muted)]">No publishing records in range — reliability metrics need real publish attempts.</p>
            : stats && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  <RCard label="Published" value={stats.published} tone="success" />
                  <RCard label="Failed" value={stats.failed} tone={stats.failed ? 'error' : undefined} />
                  <RCard label="Scheduled" value={stats.scheduled} />
                  <RCard label="Retries" value={stats.retries} tone={stats.retries ? 'warn' : undefined} />
                  <RCard label="In-flight" value={stats.inFlight} />
                  <RCard label="Unknown outcome" value={stats.unknown} tone={stats.unknown ? 'warn' : undefined} />
                  <RCard label="Success rate" value={stats.successRate != null ? `${stats.successRate}%` : '—'} sub={stats.successRate != null ? `${stats.attempts} attempts` : 'no attempts'} />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Failure classes */}
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Failure classes</p>
                    {Object.keys(stats.byClass).length === 0 ? <p className="text-[11px] text-emerald-400">No failures in range.</p> : (
                      <div className="space-y-1">
                        {Object.entries(stats.byClass).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([cls, n]) => (
                          <div key={cls} className="px-2.5 py-1.5 rounded-md bg-[var(--bg-main)]/40 border border-[var(--border-color)]">
                            <div className="flex justify-between text-[10px] font-mono"><span className="text-rose-400">{cls}</span><span className="text-[var(--text-primary)]">{n as number}</span></div>
                            <p className="text-[9px] text-[var(--text-muted)] mt-0.5">{ERROR_GUIDANCE[cls]?.action || 'Unclassified error — see post details.'}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Per-platform reliability */}
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">By platform</p>
                    <div className="space-y-1">
                      {Object.entries(stats.byPlatform).map(([pl, s]: any) => (
                        <div key={pl} className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[var(--bg-main)]/40 border border-[var(--border-color)] text-[10px] font-mono">
                          <span className="text-[var(--text-secondary)] uppercase font-bold">{pl}</span>
                          <span className="text-[var(--text-primary)]">{s.total} posts · {s.failed} failed ({s.total ? Math.round((s.failed / s.total) * 100) : 0}%)</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-[var(--text-muted)] mt-2">Unknown outcomes are never auto-retried — they require reconciliation to prevent duplicate posts.</p>
                  </div>
                </div>
              </>
            )}
        </div>
      )}
    </div>
  );
}

const RCard: React.FC<{ label: string; value: React.ReactNode; sub?: string; tone?: 'success' | 'error' | 'warn' }> = ({ label, value, sub, tone }) => (
  <div className="bg-[var(--bg-main)]/40 border border-[var(--border-color)] rounded-lg px-3 py-2">
    <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
    <p className={`text-sm font-bold mt-0.5 ${tone === 'success' ? 'text-emerald-400' : tone === 'error' ? 'text-rose-400' : tone === 'warn' ? 'text-amber-400' : 'text-[var(--text-primary)]'}`}>{value}</p>
    {sub && <p className="text-[9px] font-mono text-[var(--text-muted)]">{sub}</p>}
  </div>
);

/* ---------- Report generator: 7 types, CSV + PDF of real records ---------- */
const REPORT_TYPES = [
  { id: 'activity', label: 'Publishing Activity' },
  { id: 'performance', label: 'Video Performance' },
  { id: 'platform', label: 'Platform Comparison' },
  { id: 'brand', label: 'Brand Performance' },
  { id: 'failures', label: 'Publishing Failures' },
  { id: 'campaign', label: 'Campaign Publishing' },
  { id: 'monthly', label: 'Monthly Executive Summary' },
] as const;

function ReportGeneratorPanel({ days, customFrom, customTo, range, fBrand, fPlatform, fAccount, fStatus, query }: any) {
  const { activeWorkspace } = useAuth();
  const { brands, accounts } = usePublisher();
  const [open, setOpen] = useState(false);
  const [rtype, setRtype] = useState<string>('activity');
  const [busy, setBusy] = useState(false);

  const fetchAll = async () => {
    const params = new URLSearchParams({ days: String(days || 0), sort: 'date_desc', page: '1', pageSize: '100', brandId: fBrand, platform: fPlatform, accountId: fAccount, status: fStatus, q: query });
    if (range === 'custom' && customFrom && customTo) { params.set('from', customFrom); params.set('to', customTo); }
    const res = await apiFetch(`/api/saas/history?${params}`);
    const d = await res.json();
    if (!d.success) throw new Error(d.error || 'Fetch failed');
    return d.items as any[];
  };

  const filteredForType = (items: any[]) => {
    if (rtype === 'failures') return items.filter((p) => p.status === 'failed');
    if (rtype === 'performance') return items.filter((p) => p.status === 'published' && (p.analytics || []).length > 0);
    return items;
  };

  const buildRows = (items: any[]) => items.map((p: any) => {
    const an = (p.analytics || [])[0] || {};
    return [
      p.id, p.title || '', brands.find((b) => b.id === p.brandId)?.name || '',
      (p.channelPlatforms || []).join('|'), p.status, p.priority || 'normal',
      p.scheduledTime || '', p.publishedTime || '', an.views ?? '', an.likes ?? '', an.comments ?? '', an.shares ?? '',
      p.retryCount || 0, p.lastPublishError?.class || '',
    ];
  });

  const headers = ['Post ID', 'Title', 'Brand', 'Platforms', 'Status', 'Priority', 'Scheduled', 'Published', 'Views', 'Likes', 'Comments', 'Shares', 'Retries', 'Error Class'];
  const reportId = `rpt_${Date.now().toString(36)}`;
  const genAt = new Date().toISOString();

  const genCSV = async () => {
    setBusy(true);
    try {
      const items = filteredForType(await fetchAll());
      const csv = [headers.join(','), ...buildRows(items).map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      a.download = `publora-${rtype}-report-${reportId}.csv`; a.click(); URL.revokeObjectURL(a.href);
    } finally { setBusy(false); }
  };

  const genPDF = async () => {
    setBusy(true);
    try {
      const { jsPDF } = await import('jspdf');
      const items = filteredForType(await fetchAll());
      const doc = new jsPDF();
      const W = doc.internal.pageSize.getWidth();
      let y = 18;
      doc.setFontSize(16); doc.text('Publora — Publishing Report', 14, y); y += 8;
      doc.setFontSize(9); doc.setTextColor(100);
      doc.text(`Report: ${REPORT_TYPES.find((t) => t.id === rtype)?.label}`, 14, y); y += 5;
      doc.text(`Workspace: ${activeWorkspace?.name || '—'} · Range: ${range === 'custom' ? `${customFrom}→${customTo}` : days ? `last ${days}d` : 'all time'}`, 14, y); y += 5;
      doc.text(`Brand: ${brands.find((b) => b.id === fBrand)?.name || 'All'} · Platform: ${fPlatform === 'all' ? 'All' : fPlatform.toUpperCase()} · Status: ${fStatus === 'all' ? 'All' : fStatus}`, 14, y); y += 5;
      doc.text(`Generated: ${new Date(genAt).toLocaleString()} · ID: ${reportId} · Records: ${items.length}`, 14, y); y += 8;
      doc.setFontSize(8); doc.setTextColor(60);
      const cols = ['Title', 'Brand', 'Status', 'Scheduled', 'Published', 'Views', 'Error'];
      const xs = [14, 80, 120, 145, 170, 195, 215];
      cols.forEach((c, i) => doc.text(c, xs[i], y));
      y += 4; doc.setDrawColor(200); doc.line(14, y, W - 14, y); y += 4;
      items.slice(0, 40).forEach((p: any) => {
        if (y > 280) { doc.addPage(); y = 18; }
        const an = (p.analytics || [])[0] || {};
        doc.text(String(p.title || 'Untitled').slice(0, 30), xs[0], y);
        doc.text(String(brands.find((b) => b.id === p.brandId)?.name || '—').slice(0, 14), xs[1], y);
        doc.text(p.status, xs[2], y);
        doc.text(p.scheduledTime ? new Date(p.scheduledTime).toLocaleDateString() : '—', xs[3], y);
        doc.text(p.publishedTime ? new Date(p.publishedTime).toLocaleDateString() : '—', xs[4], y);
        doc.text(an.views != null ? String(an.views) : '—', xs[5], y);
        doc.text(String(p.lastPublishError?.class || '—').slice(0, 16), xs[6], y);
        y += 5;
      });
      if (items.length > 40) { doc.setFontSize(8); doc.text(`… ${items.length - 40} more records in CSV export`, 14, y + 3); }
      doc.save(`publora-${rtype}-report-${reportId}.pdf`);
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-start hover:bg-[var(--bg-surface-hover)] transition">
        <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2"><FileText size={14} className="text-[var(--accent-primary)]" /> Report Generator <span className="text-[10px] font-mono text-[var(--text-muted)] font-normal">uses current filters</span></span>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="border-t border-[var(--border-color)] p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {REPORT_TYPES.map((t) => (
              <button key={t.id} type="button" onClick={() => setRtype(t.id)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition ${rtype === t.id ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)]' : 'border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>{t.label}</button>
            ))}
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Exports the current filtered dataset (max 100 records/page fetch). Unavailable metrics appear as blank — never fabricated.</p>
          <div className="flex gap-2">
            <button type="button" onClick={genCSV} disabled={busy} className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40">CSV</button>
            <button type="button" onClick={genPDF} disabled={busy} className="px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-[11px] font-bold disabled:opacity-40">{busy ? 'Generating…' : 'PDF Report'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Performance analytics: synced VideoAnalytics only ---------- */
function AnalyticsPanel({ days, brandId, platform }: { days: number; brandId: string; platform: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ items: any[]; freshness: Record<string, any>; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ days: String(days || 30), brandId, platform });
    apiFetch(`/api/saas/history/analytics?${params}`).then((r) => r.json()).then((d) => {
      if (d.success) setData(d); else setError(d.error || 'Failed');
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [days, brandId, platform]);

  useEffect(() => { if (open && !data) load(); }, [open]);

  const stats = useMemo(() => {
    if (!data) return null;
    const items = data.items;
    const sum = (k: string) => items.reduce((s, a) => s + (typeof a[k] === 'number' ? a[k] : 0), 0);
    const hasMetric = (k: string) => items.some((a) => typeof a[k] === 'number');
    const byDay: Record<string, number> = {};
    items.forEach((a) => { const d = (a.syncedAt || a.snapshotAt || '').slice(0, 10); if (d && typeof a.views === 'number') byDay[d] = (byDay[d] || 0) + a.views; });
    const daysSorted = Object.keys(byDay).sort();
    const maxViews = Math.max(...daysSorted.map((d) => byDay[d]), 1);
    const byPlatform: Record<string, any> = {};
    items.forEach((a) => {
      if (!byPlatform[a.platform]) byPlatform[a.platform] = { records: 0, views: 0, likes: 0, comments: 0, shares: 0, hasViews: false, hasLikes: false };
      const p = byPlatform[a.platform];
      p.records++;
      if (typeof a.views === 'number') { p.views += a.views; p.hasViews = true; }
      if (typeof a.likes === 'number') { p.likes += a.likes; p.hasLikes = true; }
      if (typeof a.comments === 'number') p.comments += a.comments;
      if (typeof a.shares === 'number') p.shares += a.shares;
    });
    const top = [...items].filter((a) => typeof a.views === 'number').sort((a, b) => b.views - a.views).slice(0, 5);
    return { total: items.length, views: sum('views'), likes: sum('likes'), comments: sum('comments'), shares: sum('shares'), hasViews: hasMetric('views'), hasLikes: hasMetric('likes'), byDay: daysSorted.map((d) => ({ d, v: byDay[d] })), maxViews, byPlatform, top };
  }, [data]);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-start hover:bg-[var(--bg-surface-hover)] transition">
        <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2"><BarChart3 size={14} className="text-[var(--accent-primary)]" /> Performance Analytics <span className="text-[10px] font-mono text-[var(--text-muted)] font-normal">synced platform data only</span></span>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="border-t border-[var(--border-color)] p-4 space-y-4">
          {loading ? <p className="text-[11px] text-[var(--text-muted)] font-mono">Loading analytics…</p>
            : error ? <p className="text-[11px] text-rose-400">{error}</p>
            : !data || data.total === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)]">No synced analytics for this range. Platform metrics appear here after analytics synchronization runs — post counts above are unaffected.</p>
            ) : stats && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <ASCard label="Views" value={stats.hasViews ? stats.views.toLocaleString() : '—'} />
                  <ASCard label="Likes" value={stats.hasLikes ? stats.likes.toLocaleString() : '—'} />
                  <ASCard label="Comments" value={stats.comments ? stats.comments.toLocaleString() : '—'} />
                  <ASCard label="Shares" value={stats.shares ? stats.shares.toLocaleString() : '—'} />
                </div>
                {stats.byDay.length > 0 && (
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2">Views over time</p>
                    <div className="flex items-end gap-1 h-24">
                      {stats.byDay.map(({ d, v }) => (
                        <div key={d} className="flex-1 flex flex-col items-center gap-0.5 group" title={`${d}: ${v.toLocaleString()} views`}>
                          <div className="w-full rounded-t bg-[var(--accent-primary)]/70 group-hover:bg-[var(--accent-primary)] transition-all" style={{ height: `${Math.max(4, (v / stats.maxViews) * 100)}%` }} />
                          <span className="text-[8px] font-mono text-[var(--text-muted)]">{d.slice(5)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">By platform</p>
                    <div className="space-y-1">
                      {Object.entries(stats.byPlatform).map(([pl, p]: any) => (
                        <div key={pl} className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[var(--bg-main)]/40 border border-[var(--border-color)] text-[10px] font-mono">
                          <span className="text-[var(--text-secondary)] uppercase font-bold">{pl}</span>
                          <span className="text-[var(--text-primary)]">{p.records} rec · {p.hasViews ? `${p.views.toLocaleString()}v` : 'views n/a'} · {p.hasLikes ? `${p.likes} likes` : 'likes n/a'}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-[var(--text-muted)] mt-1">Metrics shown only where the platform reports them — definitions differ per platform.</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Top by views</p>
                    <div className="space-y-1">
                      {stats.top.map((a: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[var(--bg-main)]/40 border border-[var(--border-color)] text-[10px]">
                          <span className="font-mono text-[var(--accent-primary)] w-4">{i + 1}</span>
                          <span className="text-[var(--text-primary)] flex-1 truncate">{a.postTitle}</span>
                          <span className="font-mono text-[var(--text-secondary)]">{a.views.toLocaleString()}v</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Sync freshness</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(data.freshness).map(([pl, f]: any) => (
                      <span key={pl} className="px-2 py-1 rounded-md bg-[var(--bg-main)]/40 border border-[var(--border-color)] text-[9px] font-mono text-[var(--text-secondary)]">
                        {pl.toUpperCase()}: {f.records} rec · last sync {f.lastSync ? new Date(f.lastSync).toLocaleDateString() : 'never'}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
        </div>
      )}
    </div>
  );
}

const ASCard: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="bg-[var(--bg-main)]/40 border border-[var(--border-color)] rounded-lg px-3 py-2">
    <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
    <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{value}</p>
  </div>
);

/* Only http(s) URLs may become links — workspace data is user-controlled
   and a javascript:/data: URL would be an XSS vector. */
const safeHttpUrl = (u?: string | null): string | null => {
  if (!u) return null;
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
};

/* ---------- Detail modal: video info, publish info, audit timeline, safe logs ---------- */
function HistoryDetail({ post, video, brand, accounts, onClose }: any) {
  const events: any[] = post.publishingEvents || [];
  const safePostUrl = safeHttpUrl(post.postUrl);
  const account = accounts.find((a: any) => a.id === post.accountId) || accounts.find((a: any) => (post.channelPlatforms || []).includes(a.platform) && a.brandId === post.brandId);
  const analytics = post.analytics || [];
  return (
    <div className="fixed inset-0 z-[105] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-[var(--bg-input)] backdrop-blur-sm" />
      <div className="relative w-full max-w-md h-full bg-[var(--bg-surface)] border-s border-[var(--border-color)] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[var(--bg-surface)] border-b border-[var(--border-color)] px-5 py-4 flex items-center justify-between z-10">
          <h3 className="text-sm font-bold text-[var(--text-primary)] truncate pe-3">{post.title || video?.title || 'Post'}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
        </div>
        <div className="p-5 space-y-5">
          {/* Video info */}
          <section>
            <div className="flex gap-3">
              {video?.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" className="w-20 h-20 rounded-xl object-cover bg-[var(--bg-input)] shrink-0" /> : <div className="w-20 h-20 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] flex items-center justify-center shrink-0"><Video size={20} className="text-[var(--text-muted)]" /></div>}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{video?.title || post.title || 'Untitled'}</p>
                {video?.durationSec != null && <p className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">{Math.floor(video.durationSec / 60)}:{String(Math.floor(video.durationSec % 60)).padStart(2, '0')} · {video.width}×{video.height}</p>}
                {video?.fileSizeBytes != null && <p className="text-[10px] font-mono text-[var(--text-muted)]">{(video.fileSizeBytes / 1048576).toFixed(1)} MB</p>}
              </div>
            </div>
          </section>

          {/* Publishing info */}
          <section>
            <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2">Publishing</h4>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/40 px-3 py-1 text-[11px]">
              {row('Status', post.status)}{row('Platforms', (post.channelPlatforms || []).join(', '))}
              {row('Account', account ? `${account.accountName || account.handle} (${account.platform})` : null)}
              {row('Brand', brand?.name)}{row('Scheduled', fmtDT(post.scheduledTime))}
              {row('Published', post.publishedTime ? fmtDT(post.publishedTime) : null)}
              {row('Attempts', post.retryCount ? String(post.retryCount + 1) : '1')}
              {row('Operation ID', post.publishOperationId?.slice(0, 20))}
              {row('Platform post ID', post.platformPostId)}
              {row('Post URL', safePostUrl ? <a href={safePostUrl} target="_blank" rel="noreferrer" className="text-[var(--accent-primary)] hover:underline truncate inline-block max-w-full">View post ↗</a> : null)}
              {row('Next retry', post.nextRetryAt ? fmtDT(post.nextRetryAt) : null)}
            </div>
          </section>

          {/* Analytics snapshot (real synced data only) */}
          {analytics.length > 0 && (
            <section>
              <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2">Synced analytics</h4>
              <div className="space-y-1">
                {analytics.map((a: any, i: number) => (
                  <div key={i} className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[var(--bg-main)]/40 border border-[var(--border-color)] text-[10px] font-mono">
                    <span className="text-[var(--text-secondary)] uppercase">{a.platform} · {a.snapshotAge}</span>
                    <span className="text-[var(--text-primary)]">{a.views ?? '—'} views · {a.likes ?? '—'} likes · {a.comments ?? '—'} comments</span>
                    <span className="text-[var(--text-muted)]">{a.syncedAt ? new Date(a.syncedAt).toLocaleDateString() : ''}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {post.lastPublishError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
              <p className="text-[10px] font-mono uppercase tracking-wider text-rose-400 mb-1">Error · {post.lastPublishError.class}</p>
              <p className="text-xs text-rose-200">{post.lastPublishError.message}</p>
              {post.lastPublishError.retryable === false && <p className="text-[9px] text-rose-300/70 mt-1">Non-retryable — requires reconciliation or adapter fix.</p>}
            </div>
          )}

          {/* Audit timeline — real engine events */}
          <section>
            <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2">Audit timeline ({events.length} events)</h4>
            {events.length === 0 ? <p className="text-[11px] text-[var(--text-muted)]">No engine events recorded for this post.</p> : (
              <div className="space-y-0 relative before:absolute before:inset-y-1 before:start-[5px] before:w-px before:bg-[var(--border-color)]">
                {[...events].reverse().map((e: any, i: number) => (
                  <div key={i} className="flex items-start gap-2.5 py-1 relative">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 relative z-10 ${e.type === 'failed' ? 'bg-rose-400' : e.type === 'completed' ? 'bg-emerald-400' : e.type === 'retry_scheduled' ? 'bg-amber-400' : 'bg-[var(--accent-primary)]'}`} />
                    <div><p className="text-[11px] font-medium text-[var(--text-primary)]">{e.type?.replace(/_/g, ' ')}</p><p className="text-[10px] font-mono text-[var(--text-muted)]">{e.ts ? new Date(e.ts).toLocaleString() : ''}{e.message ? ` — ${e.message}` : ''}</p></div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Technical details — sanitized, no tokens */}
          <section>
            <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2">Technical</h4>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/40 px-3 py-1 text-[10px] font-mono">
              {row('Post ID', post.id)}{row('Video ID', post.videoId)}{row('Brand ID', post.brandId)}
              {row('Created', post.createdAt ? new Date(post.createdAt).toLocaleString() : null)}
              {row('Mode', post.mode)}{row('Autopilot', post.optimizedByAutopilot ? 'yes' : 'no')}
              {row('Locked', post.lockedForPublishing ? 'yes' : 'no')}
            </div>
            <p className="text-[9px] text-[var(--text-muted)] mt-1.5">Access tokens and credentials are never exposed in this view.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function row(label: string, value: any) {
  if (value == null || value === '') return null;
  return <div className="flex justify-between py-1 border-b border-[var(--border-subtle)] last:border-0"><span className="text-[10px] text-[var(--text-muted)]">{label}</span><span className="text-[10px] font-mono text-[var(--text-primary)] text-end max-w-[60%] truncate">{value}</span></div>;
}
