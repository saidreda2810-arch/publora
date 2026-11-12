import React, { useState } from 'react';
import { apiFetch } from '../lib/api';
import { X, RefreshCw, Unplug, Shield, Activity, CheckCircle2, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { SocialAccount, Brand } from '../types';

interface Props {
  account: SocialAccount | null;
  brands: Brand[];
  onClose: () => void;
  onReconnect: (platform: string) => void;
  onDisconnect: (id: string) => void;
  onBrandChanged: () => void;
}

const PLATFORM_META: Record<string, { name: string; color: string }> = {
  youtube: { name: 'YouTube', color: 'text-red-400' },
  facebook: { name: 'Facebook Pages', color: 'text-blue-400' },
  instagram: { name: 'Instagram Professional', color: 'text-pink-400' },
  tiktok: { name: 'TikTok', color: 'text-cyan-400' },
};

export const AccountDetailsModal: React.FC<Props> = ({ account, brands, onClose, onReconnect, onDisconnect, onBrandChanged }) => {
  const [brandId, setBrandId] = useState(account?.brandId || '');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!account) return null;
  const meta = PLATFORM_META[account.platform] || { name: account.platform, color: 'text-[var(--text-secondary)]' };
  const brand = brands.find((b) => b.id === account.brandId);
  const needsAttention = account.requiresReconnection || account.tokenValid === false;

  const [caps, setCaps] = useState<any>(null);
  React.useEffect(() => {
    if (!account) return;
    apiFetch(`/api/oauth/accounts/${account.id}/capabilities`).then((r) => r.json()).then((d) => { if (d.success) setCaps(d); }).catch(() => {});
  }, [account?.id]);

  const runDiagnostics = async () => {
    setSyncing(true); setNotice(null);
    try {
      const res = await apiFetch(`/api/oauth/accounts/${account.id}/diagnostics`, { method: 'POST' });
      const d = await res.json();
      setNotice(d.success ? `Diagnostics OK — token ${d.diagnostics?.tokenValid ? 'valid' : 'invalid'}` : (d.error || 'Diagnostics failed'));
    } catch { setNotice('Diagnostics request failed.'); } finally { setSyncing(false); }
  };

  const refreshToken = async () => {
    setSyncing(true); setNotice(null);
    try {
      const res = await apiFetch(`/api/oauth/accounts/${account.id}/refresh`, { method: 'POST' });
      const d = await res.json();
      setNotice(d.success ? 'Token refreshed successfully.' : (d.error || 'Refresh failed.'));
      if (d.success) onBrandChanged();
    } catch { setNotice('Refresh request failed.'); } finally { setSyncing(false); }
  };

  const saveBrand = async () => {
    setSaving(true); setNotice(null);
    try {
      const res = await apiFetch(`/api/oauth/accounts/${account.id}/brand`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: brandId || 'workspace' }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed');
      setNotice('Brand assignment updated.'); onBrandChanged();
    } catch (e: any) { setNotice(e.message); } finally { setSaving(false); }
  };

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1.5 border-b border-[var(--border-color)] last:border-0">
      <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
      <span className="text-[11px] font-mono text-[var(--text-primary)] text-end truncate max-w-[60%]">{value ?? '—'}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[var(--bg-input)] backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2.5 min-w-0">
            {account.avatarUrl ? <img src={account.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" /> : <div className="w-9 h-9 rounded-full bg-[var(--bg-surface-hover)] flex items-center justify-center text-xs font-bold text-[var(--text-secondary)]">{(account.accountName || '?')[0]}</div>}
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)] truncate">{account.accountName}</p>
              <p className={`text-[10px] font-mono uppercase ${meta.color}`}>{meta.name} · {account.handle || account.email || ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {needsAttention && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200">{account.tokenValid === false ? 'Authorization expired — reconnect to restore publishing.' : 'This account requires attention before it can publish reliably.'}</p>
            </div>
          )}
          {notice && <div className="p-2.5 rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-[11px] text-[var(--text-secondary)] flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-[#00D6B2]" />{notice}</div>}

          {/* General */}
          <section>
            <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1">General</h4>
            <div className="rounded-lg bg-black/30 border border-[var(--border-color)] px-3 py-1">
              {row('Platform', meta.name)}{row('Handle', account.handle)}{row('Email', account.email)}
              {row('Brand', brand?.name || 'Workspace-level')}{row('Status', account.connectionStatus?.replace(/_/g, ' '))}
              {row('Token', account.tokenValid === false ? 'Expired' : account.tokenValid ? 'Valid' : 'Unknown')}
              {row('Last sync', account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString() : 'Never')}
            </div>
          </section>

          {/* Permissions */}
          <section>
            <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1 flex items-center gap-1"><Shield className="w-3 h-3" /> Permissions</h4>
            <div className="rounded-lg bg-black/30 border border-[var(--border-color)] px-3 py-1">
              {row('Publishing', account.apiPermissions?.canPublish ? 'Granted' : 'Not granted')}
              {row('Analytics', account.apiPermissions?.canReadAnalytics ? 'Granted' : 'Unavailable')}
              {row('Retention data', account.apiPermissions?.hasDetailedRetention ? 'Granted' : 'Unavailable')}
              {(account.permissions || []).slice(0, 4).map((p: any, i: number) => row(p.description || p.name, p.granted ? '✓' : '—'))}
            </div>
          </section>

          {/* Channels */}
          {(account.channels?.length ?? 0) > 0 && (
            <section>
              <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1">Channels / Pages ({account.channels!.length})</h4>
              <div className="space-y-1">
                {account.channels!.slice(0, 6).map((ch: any) => (
                  <div key={ch.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-black/30 border border-[var(--border-color)] text-[10px]">
                    <span className="text-[var(--text-secondary)] truncate">{ch.channelName || ch.name || ch.id}</span>
                    <span className={ch.isEligibleForPublishing ? 'text-[#00D6B2]' : 'text-amber-400'}>{ch.isEligibleForPublishing ? 'eligible' : 'ineligible'}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Platform capabilities — verified from granted scopes */}
          {caps?.capabilities && (
            <section>
              <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1">Verified capabilities</h4>
              <div className="rounded-lg bg-black/30 border border-[var(--border-color)] px-3 py-1.5 space-y-1">
                {Object.values(caps.capabilities).flatMap((c: any) => Object.entries(c).filter(([k]) => k.startsWith('can') || k.startsWith('has')).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-[10px] font-mono"><span className="text-[var(--text-secondary)]">{k.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase())}</span><span className={v ? 'text-[#00D6B2]' : 'text-[var(--text-muted)]'}>{v ? 'yes' : 'no'}</span></div>
                )))}
                {(Object.values(caps.capabilities)[0] as any)?.notes?.map((n: string, i: number) => (
                  <p key={i} className="text-[9px] text-amber-300/80 pt-1">⚠ {n}</p>
                ))}
              </div>
            </section>
          )}

          {/* Brand reassignment */}
          <section>
            <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1 flex items-center gap-1"><ArrowRightLeft className="w-3 h-3" /> Brand assignment</h4>
            <div className="flex gap-2">
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]">
                <option value="">Workspace-level</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button onClick={saveBrand} disabled={saving || brandId === (account.brandId || '')} className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface-hover)] text-[11px] font-semibold text-[var(--text-primary)] disabled:opacity-40">Save</button>
            </div>
          </section>

          {/* Actions */}
          <section className="grid grid-cols-2 gap-2">
            <button onClick={() => onReconnect(account.platform)} className="py-2 rounded-lg bg-[#00D6B2]/15 border border-[#00D6B2]/40 text-[#00D6B2] text-[11px] font-bold hover:bg-[#00D6B2]/25 transition">Reconnect</button>
            <button onClick={refreshToken} disabled={syncing} className="py-2 rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-[var(--text-secondary)] text-[11px] font-semibold hover:bg-[var(--bg-surface-hover)] transition disabled:opacity-40 flex items-center justify-center gap-1"><RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} /> Refresh token</button>
            <button onClick={runDiagnostics} disabled={syncing} className="py-2 rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-[var(--text-secondary)] text-[11px] font-semibold hover:bg-[var(--bg-surface-hover)] transition disabled:opacity-40 flex items-center justify-center gap-1"><Activity className="w-3 h-3" /> Diagnostics</button>
            {!confirmDisconnect ? (
              <button onClick={() => setConfirmDisconnect(true)} className="py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] font-semibold hover:bg-red-500/20 transition flex items-center justify-center gap-1"><Unplug className="w-3 h-3" /> Disconnect</button>
            ) : (
              <button onClick={() => { onDisconnect(account.id); onClose(); }} className="py-2 rounded-lg bg-red-500 text-[var(--text-primary)] text-[11px] font-bold hover:bg-red-400 transition">Confirm disconnect</button>
            )}
          </section>
          {confirmDisconnect && <p className="text-[10px] text-red-300/80">Disconnecting revokes platform tokens. Historical publishing records are preserved.</p>}
        </div>
      </div>
    </div>
  );
};
