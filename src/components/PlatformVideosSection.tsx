import React, { useEffect, useState } from 'react';
import { ExternalLink, Video, Clock, Eye, Heart, MessageCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface PlatformVideoItem {
  platform: string;
  accountId: string;
  channelId?: string;
  platformVideoId: string;
  title: string;
  url?: string;
  thumbnailUrl?: string;
  publishedAt?: string;
  scheduledAt?: string;
  status: string;
  views?: number;
  likes?: number;
  comments?: number;
  durationSec?: number;
  privacyStatus?: string;
}

interface OAuthAccountLite {
  id: string;
  provider: string;
  accountName?: string;
  tokenValid?: boolean;
  requiresReconnection?: boolean;
}

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  youtube: { label: 'YouTube', color: 'text-red-400' },
  tiktok: { label: 'TikTok', color: 'text-cyan-300' },
  facebook: { label: 'Facebook', color: 'text-blue-400' },
  instagram: { label: 'Instagram', color: 'text-pink-400' },
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtNum(n?: number) {
  if (n == null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function fmtDur(sec?: number) {
  if (sec == null) return '';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  /** which slice of platform content to show */
  mode: 'scheduled' | 'published' | 'all';
  /** optional client-side date filter for calendar (items overlapping this day) */
  dayStart?: number;
  dayEnd?: number;
  title?: string;
  emptyText?: string;
}

/**
 * Read-only mirror of content that exists on connected platforms
 * (scheduled uploads + published posts fetched live from provider APIs).
 */
export const PlatformVideosSection: React.FC<Props> = ({
  mode, dayStart, dayEnd, title, emptyText,
}) => {
  const [items, setItems] = useState<PlatformVideoItem[]>([]);
  const [accounts, setAccounts] = useState<OAuthAccountLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [unsupported, setUnsupported] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    setErrors([]); setUnsupported([]);
    try {
      const accRes = await apiFetch('/api/oauth/accounts');
      const accData = await accRes.json().catch(() => ({}));
      const accs: OAuthAccountLite[] = (accData.accounts || []).filter((a: any) => a.tokenValid !== false && !a.requiresReconnection);
      setAccounts(accs);

      const all: PlatformVideoItem[] = [];
      await Promise.all(accs.map(async (a) => {
        try {
          const r = await apiFetch(`/api/oauth/accounts/${a.id}/platform-videos?status=${mode === 'all' ? 'all' : mode}`);
          const d = await r.json().catch(() => ({}));
          if (d.unsupported) { setUnsupported((u) => [...u, `${a.provider}: ${d.error || 'not supported'}`]); return; }
          if (!d.ok && d.error) { setErrors((e) => [...e, `${a.accountName || a.provider}: ${d.error}`]); return; }
          for (const it of d.items || []) all.push({ ...it, accountName: (a as any).accountName });
        } catch { /* skip account */ }
      }));

      let filtered = all;
      if (dayStart != null && dayEnd != null) {
        filtered = all.filter((i) => {
          const t = new Date(i.scheduledAt || i.publishedAt || 0).getTime();
          return t >= dayStart && t < dayEnd;
        });
      }
      filtered.sort((a, b) => new Date(b.scheduledAt || b.publishedAt || 0).getTime() - new Date(a.scheduledAt || a.publishedAt || 0).getTime());
      setItems(filtered);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mode]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] py-3">
        <Loader2 size={14} className="animate-spin" /> Loading platform content…
      </div>
    );
  }
  if (!accounts.length) return null;

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
          <Video size={13} className="text-[#00D6B2]" />
          {title || (mode === 'scheduled' ? 'Scheduled on platforms' : mode === 'published' ? 'Published on platforms' : 'Platform content')}
          <span className="text-[10px] font-mono text-[var(--text-muted)]">({items.length})</span>
        </h3>
        <button onClick={load} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" title="Refresh">
          <RefreshCw size={12} />
        </button>
      </div>

      {errors.map((e, i) => (
        <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-400 mb-1">
          <AlertCircle size={12} className="mt-0.5 shrink-0" /> {e}
        </div>
      ))}
      {unsupported.map((u, i) => (
        <div key={i} className="text-[11px] text-[var(--text-muted)] mb-1">{u}</div>
      ))}

      {items.length === 0 ? (
        <p className="text-[11px] text-[var(--text-muted)] py-2">{emptyText || 'No platform content found.'}</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {items.map((v) => {
            const meta = PLATFORM_META[v.platform] || { label: v.platform, color: 'text-[var(--text-secondary)]' };
            const when = v.status === 'scheduled' ? v.scheduledAt : v.publishedAt;
            return (
              <a
                key={`${v.accountId}-${v.platformVideoId}`}
                href={v.url || '#'}
                target="_blank"
                rel="noreferrer"
                className="flex gap-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/60 p-2 hover:border-[#00D6B2]/40 transition group"
              >
                <div className="relative w-20 h-12 rounded-md overflow-hidden bg-[var(--bg-surface-hover)] shrink-0">
                  {v.thumbnailUrl ? (
                    <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Video size={16} className="text-[var(--text-muted)]" /></div>
                  )}
                  {v.durationSec != null && (
                    <span className="absolute bottom-0.5 right-0.5 text-[9px] font-mono bg-black/70 text-white px-1 rounded">{fmtDur(v.durationSec)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold uppercase ${meta.color}`}>{meta.label}</span>
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                      v.status === 'scheduled' ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                      : v.status === 'published' ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                      : 'text-[var(--text-muted)] border-[var(--border-color)]'
                    }`}>{v.status}</span>
                  </div>
                  <p className="text-xs font-medium text-[var(--text-primary)] truncate group-hover:text-[#00D6B2] transition">{v.title}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-[var(--text-muted)]">
                    <span className="flex items-center gap-1"><Clock size={10} />{fmtDate(when)}</span>
                    {v.views != null && <span className="flex items-center gap-1"><Eye size={10} />{fmtNum(v.views)}</span>}
                    {v.likes != null && <span className="flex items-center gap-1"><Heart size={10} />{fmtNum(v.likes)}</span>}
                    {v.comments != null && <span className="flex items-center gap-1"><MessageCircle size={10} />{fmtNum(v.comments)}</span>}
                  </div>
                </div>
                <ExternalLink size={12} className="text-[var(--text-muted)] group-hover:text-[#00D6B2] shrink-0 self-center" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
};
