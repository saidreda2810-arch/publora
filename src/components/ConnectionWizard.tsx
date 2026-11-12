import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../lib/api';
import { X, CheckCircle2, AlertTriangle, ChevronRight, Key, Shield, Video, Facebook, Instagram, Music2 } from 'lucide-react';
import { Platform, SocialAccount, Brand } from '../types';

const PLATFORMS: { id: Platform; name: string; desc: string; publish: string; analytics: string; req: string; icon: any; color: string }[] = [
  { id: 'youtube', name: 'YouTube', desc: 'Connect channels to publish videos and read retention analytics.', publish: 'Video upload & publish', analytics: 'Views, retention, watch time', req: 'Google account with a YouTube channel', icon: PlayIcon, color: 'text-red-400' },
  { id: 'facebook', name: 'Facebook Pages', desc: 'Connect business Pages to publish posts and read Page insights.', publish: 'Page posts & scheduling', analytics: 'Reach, impressions, engagement', req: 'Facebook account with a Page you manage', icon: Facebook, color: 'text-blue-400' },
  { id: 'instagram', name: 'Instagram Professional', desc: 'Connect Business or Creator accounts for publishing and insights.', publish: 'Photo/video publishing', analytics: 'Reach, engagement, audience', req: 'Instagram Business or Creator account linked to a Page', icon: Instagram, color: 'text-pink-400' },
  { id: 'tiktok', name: 'TikTok', desc: 'Connect accounts via Login Kit for content posting.', publish: 'Direct post or upload-to-inbox', analytics: 'Video performance metrics', req: 'TikTok account; Content Posting API access', icon: Music2, color: 'text-cyan-400' },
];

function PlayIcon(props: any) { return <Video {...props} />; }

interface Props {
  open: boolean;
  onClose: () => void;
  accounts: SocialAccount[];
  brands: Brand[];
  activeBrandId?: string;
  onAuthorize: (provider: Platform) => void;
  connectingProvider: Platform | null;
  connectionSuccess: string | null;
  onComplete: () => void;
}

export const ConnectionWizard: React.FC<Props> = ({ open, onClose, accounts, brands, activeBrandId, onAuthorize, connectingProvider, connectionSuccess, onComplete }) => {
  const [step, setStep] = useState(1);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [brandId, setBrandId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plat = PLATFORMS.find((p) => p.id === platform);
  const providerAccounts = useMemo(
    () => accounts.filter((a) => a.platform === platform && (a.isConnected || a.connectionStatus === 'connected' || a.connectionStatus === 'publishing_unavailable')),
    [accounts, platform]
  );
  const account = providerAccounts.find((a) => a.id === accountId) || providerAccounts[0] || null;

  useEffect(() => {
    if (open) { setStep(1); setPlatform(null); setAccountId(null); setSelectedChannels([]); setBrandId(activeBrandId || ''); setError(null); }
  }, [open]);

  // Advance to account selection once OAuth succeeds
  useEffect(() => {
    if (connectionSuccess && step === 2 && providerAccounts.length > 0) setStep(3);
  }, [connectionSuccess, step, providerAccounts.length]);

  if (!open) return null;

  const toggleChannel = (id: string) =>
    setSelectedChannels((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const saveChannels = async () => {
    if (!account || selectedChannels.length === 0) return;
    setSaving(true); setError(null);
    try {
      const res = await apiFetch(`/api/oauth/accounts/${account.id}/select-channels`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedChannelIds: selectedChannels }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to save channel selection');
      setStep(4);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const saveBrand = async () => {
    if (!account) return;
    setSaving(true); setError(null);
    try {
      if (brandId && brandId !== account.brandId) {
        const res = await apiFetch(`/api/oauth/accounts/${account.id}/brand`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId }),
        });
        const d = await res.json();
        if (!res.ok || !d.success) throw new Error(d.error || 'Failed to assign brand');
      }
      setStep(5); onComplete();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const steps = ['Platform', 'Authorize', 'Select Account', 'Brand & Permissions', 'Done'];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[var(--bg-input)] backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Connect Social Account</h3>
            <div className="flex items-center gap-1 mt-1.5">
              {steps.map((s, i) => (
                <React.Fragment key={s}>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${step === i + 1 ? 'bg-[#00D6B2] text-black font-bold' : step > i + 1 ? 'bg-[#00D6B2]/20 text-[#00D6B2]' : 'bg-[var(--bg-surface-hover)] text-[var(--text-muted)]'}`}>{i + 1}. {s}</span>
                  {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />}
                </React.Fragment>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {error && <div className="mb-3 p-2.5 rounded-lg bg-red-950/60 border border-red-500/30 text-red-300 text-[11px] flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" />{error}</div>}

          {/* STEP 1 — Platform */}
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PLATFORMS.map((p) => {
                const Icon = p.icon;
                return (
                  <button key={p.id} onClick={() => { setPlatform(p.id); setStep(2); }} className="text-start p-4 rounded-xl bg-[var(--bg-surface)]/80 border border-[var(--border-color)] hover:border-[#00D6B2]/50 hover:bg-[var(--bg-input)]/60 transition group">
                    <Icon className={`w-6 h-6 mb-2 ${p.color}`} />
                    <p className="text-sm font-bold text-[var(--text-primary)]">{p.name}</p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed">{p.desc}</p>
                    <p className="text-[9px] font-mono text-[var(--text-muted)] mt-2">Publishes: {p.publish} · Analytics: {p.analytics}</p>
                    <p className="text-[9px] text-[var(--text-muted)] mt-1">Requires: {p.req}</p>
                  </button>
                );
              })}
            </div>
          )}

          {/* STEP 2 — Authorize */}
          {step === 2 && plat && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[var(--bg-surface)]/80 border border-[var(--border-color)]">
                <div className="flex items-center gap-2 mb-2"><plat.icon className={`w-5 h-5 ${plat.color}`} /><span className="text-sm font-bold text-[var(--text-primary)]">{plat.name}</span></div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">You'll be redirected to {plat.name}'s official sign-in page. Publora never sees your password — only the permissions you approve.</p>
                <p className="text-[10px] font-mono text-[var(--text-muted)] mt-2">Capabilities: {plat.publish} · {plat.analytics}</p>
              </div>
              <button onClick={() => onAuthorize(platform!)} disabled={connectingProvider === platform} className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black font-bold text-sm disabled:opacity-50">
                {connectingProvider === platform ? 'Waiting for authorization…' : `Continue to ${plat.name}`}
              </button>
              {connectionSuccess && <p className="text-[11px] text-[#00D6B2] flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Authorization received — continue below.</p>}
              <button onClick={() => setStep(1)} className="w-full text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">← Choose a different platform</button>
            </div>
          )}

          {/* STEP 3 — Select account/channels */}
          {step === 3 && (
            <div className="space-y-3">
              {providerAccounts.length === 0 ? (
                <div className="p-6 text-center text-[11px] text-[var(--text-muted)]">No accounts found for {plat?.name} yet. Complete the authorization, then reopen this wizard.</div>
              ) : (
                <>
                  <p className="text-[11px] text-[var(--text-secondary)]">Select which {plat?.name} channel{providerAccounts.length > 1 ? 's' : ''}/page{providerAccounts.length > 1 ? 's' : ''} this brand can publish to:</p>
                  {providerAccounts.map((a) => (
                    <div key={a.id} className="p-3 rounded-xl bg-[var(--bg-surface)]/80 border border-[var(--border-color)]">
                      <div className="flex items-center gap-2.5 mb-2">
                        {a.avatarUrl ? <img src={a.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-[var(--bg-surface-hover)] flex items-center justify-center text-[10px] font-bold text-[var(--text-secondary)]">{(a.accountName || '?')[0]}</div>}
                        <div className="min-w-0"><p className="text-xs font-bold text-[var(--text-primary)] truncate">{a.accountName}</p><p className="text-[9px] font-mono text-[var(--text-muted)]">{a.handle || a.email || ''}</p></div>
                      </div>
                      {(a.channels || []).length > 0 ? (
                        <div className="space-y-1">
                          {(a.channels || []).map((ch: any) => (
                            <label key={ch.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-black/30 border border-[var(--border-color)] cursor-pointer hover:bg-[var(--bg-surface-hover)]">
                              <input type="checkbox" checked={selectedChannels.includes(ch.id)} onChange={() => toggleChannel(ch.id)} className="accent-[#00D6B2]" />
                              <span className="text-[11px] text-[var(--text-secondary)] truncate">{ch.channelName || ch.name || ch.id}</span>
                              {ch.isEligibleForPublishing === false && <span className="text-[9px] text-amber-400">(not eligible)</span>}
                            </label>
                          ))}
                        </div>
                      ) : <p className="text-[10px] text-[var(--text-muted)]">No selectable channels returned.</p>}
                    </div>
                  ))}
                  <button onClick={saveChannels} disabled={saving || selectedChannels.length === 0} className="w-full py-2.5 rounded-xl bg-[#00D6B2] text-black font-bold text-xs disabled:opacity-40">
                    {saving ? 'Saving…' : 'Continue'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* STEP 4 — Brand + permissions review */}
          {step === 4 && account && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[var(--bg-surface)]/80 border border-[var(--border-color)] space-y-3">
                <p className="text-[11px] font-bold text-[var(--text-primary)]">Assign to Brand</p>
                <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]">
                  <option value="">Workspace-level (no brand)</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="p-4 rounded-xl bg-[var(--bg-surface)]/80 border border-[var(--border-color)]">
                <p className="text-[11px] font-bold text-[var(--text-primary)] mb-2 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-[#00D6B2]" /> Permissions granted</p>
                <div className="space-y-1">
                  {(account.permissions || []).map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[10px] font-mono px-2 py-1 rounded bg-black/30">
                      <span className="text-[var(--text-secondary)] truncate max-w-[70%]">{p.description || p.name}</span>
                      <span className={p.granted ? 'text-[#00D6B2]' : 'text-[var(--text-muted)]'}>{p.granted ? 'granted' : 'missing'}</span>
                    </div>
                  ))}
                  {(!account.permissions || account.permissions.length === 0) && <p className="text-[10px] text-[var(--text-muted)]">Permission details unavailable from platform.</p>}
                </div>
                <div className="flex gap-3 mt-2 text-[10px] font-mono">
                  <span className={account.apiPermissions?.canPublish ? 'text-[#00D6B2]' : 'text-amber-400'}>Publishing: {account.apiPermissions?.canPublish ? 'yes' : 'no'}</span>
                  <span className={account.apiPermissions?.canReadAnalytics ? 'text-[#00D6B2]' : 'text-[var(--text-muted)]'}>Analytics: {account.apiPermissions?.canReadAnalytics ? 'yes' : 'unavailable'}</span>
                </div>
              </div>
              <button onClick={saveBrand} disabled={saving} className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black font-bold text-sm disabled:opacity-50">
                {saving ? 'Saving…' : 'Confirm Connection'}
              </button>
            </div>
          )}

          {/* STEP 5 — Confirmed */}
          {step === 5 && (
            <div className="text-center py-6 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-[#00D6B2] mx-auto" />
              <p className="text-sm font-bold text-[var(--text-primary)]">{account?.accountName || plat?.name} connected</p>
              <p className="text-[11px] text-[var(--text-secondary)]">Your account is linked{brandId ? ' to the selected brand' : ' at workspace level'}. You can manage it from the accounts dashboard.</p>
              <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] text-xs font-bold">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
