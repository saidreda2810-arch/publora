import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePublisher } from '../../context/PublisherContext';
import { SectionCard, StatusPill, Avatar, btnPrimary, btnGhost, formatDate, formatDateTime } from './ui';
import { Platform as PlatformType, SocialConnectionAccount, AccountOverview } from '../../types';
import { Youtube, Facebook, Instagram, Music2, RefreshCw, Unplug, Link2, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
const PLATFORM_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  youtube: { label: 'YouTube', icon: <Youtube size={16} />, color: 'text-red-400' },
  facebook: { label: 'Facebook Pages', icon: <Facebook size={16} />, color: 'text-blue-400' },
  instagram: { label: 'Instagram Professional', icon: <Instagram size={16} />, color: 'text-pink-400' },
  tiktok: { label: 'TikTok', icon: <Music2 size={16} />, color: 'text-[var(--text-primary)]' },
};

const STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'muted'> = {
  connected: 'success',
  permission_incomplete: 'warning',
  publishing_unavailable: 'warning',
  analytics_unavailable: 'warning',
  token_expired: 'error',
  reconnection_required: 'error',
  disconnected: 'muted',
  error: 'error',
};

interface Props {
  overview: AccountOverview | null;
  reload: () => Promise<void>;
  onNeedBrand: () => void;
}

export const ConnectionsSection: React.FC<Props> = ({ overview, reload, onNeedBrand }) => {
  const { apiFetch } = useAuth();
  const { activeBrand, brands, refreshOAuthAccounts } = usePublisher();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  const accounts = overview?.socialAccounts || [];
  const providers = overview?.oauthProviders || { youtube: false, facebook: false, instagram: false, tiktok: false };
  const platforms: PlatformType[] = ['youtube', 'facebook', 'instagram', 'tiktok'];

  // Listen for OAuth popup completion
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setConnectingProvider(null);
        setMessage({ type: 'success', text: 'Account connected successfully.' });
        reload();
        refreshOAuthAccounts?.();
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setConnectingProvider(null);
        setMessage({ type: 'error', text: event.data?.error || 'Connection failed.' });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [reload, refreshOAuthAccounts]);

  const connect = useCallback(
    async (provider: PlatformType) => {
      if (!activeBrand && brands.length === 0) {
        onNeedBrand();
        return;
      }
      const brandId = activeBrand?.id || brands[0]?.id;
      if (!brandId) {
        onNeedBrand();
        return;
      }
      setConnectingProvider(provider);
      setMessage(null);
      try {
        const res = await apiFetch('/api/oauth/authorize-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, brandId }),
        });
        const data = await res.json();
        if (data.success && data.url) {
          window.open(data.url, 'oauth_popup', 'width=600,height=700');
        } else {
          setConnectingProvider(null);
          setMessage({ type: 'error', text: data.error || 'Could not start connection.' });
        }
      } catch (e: any) {
        setConnectingProvider(null);
        setMessage({ type: 'error', text: e.message || 'Connection request failed.' });
      }
    },
    [activeBrand, brands, onNeedBrand]
  );

  const disconnect = async (acc: SocialConnectionAccount) => {
    if (!window.confirm(`Disconnect ${PLATFORM_META[acc.provider]?.label || acc.provider} account "${acc.accountName}"? This revokes stored credentials.`)) return;
    setBusyId(acc.id);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/saas/social-accounts/${acc.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message || 'Account disconnected.' });
        await reload();
        refreshOAuthAccounts?.();
      } else {
        setMessage({ type: 'error', text: data.error || 'Disconnect failed.' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setBusyId(null);
    }
  };

  const refresh = async (acc: SocialConnectionAccount) => {
    setBusyId(acc.id);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/oauth/accounts/${acc.id}/refresh`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message || 'Connection refreshed.' });
        await reload();
      } else {
        setMessage({ type: 'error', text: data.error || 'Refresh failed ” reconnect may be required.' });
        await reload();
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setBusyId(null);
    }
  };

  const accountsFor = (p: PlatformType) => accounts.filter((a) => a.provider === p);

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`flex items-center gap-2 text-xs px-4 py-3 rounded-xl border ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-[var(--status-success)]'
              : 'bg-rose-500/10 border-rose-500/30 text-[var(--status-error)]'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {message.text}
        </div>
      )}

      {!activeBrand && brands.length === 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-[var(--status-warning)] text-xs">
          <span>Create a brand/channel first ” social accounts connect through a brand workspace.</span>
          <button className={btnGhost} onClick={onNeedBrand}>Create Brand</button>
        </div>
      )}

      {platforms.map((p) => {
        const meta = PLATFORM_META[p];
        const providerConfigured = providers[p];
        const list = accountsFor(p);
        return (
          <SectionCard
            key={p}
            title={meta.label}
            description={
              providerConfigured
                ? 'Official OAuth integration. Tokens are encrypted server-side.'
                : 'OAuth credentials are not configured on this deployment.'
            }
            icon={<span className={meta.color}>{meta.icon}</span>}
          >
            <div className="space-y-3">
              {list.length === 0 && (
                <div className="flex items-center justify-between gap-3 py-2">
                  <span className="text-xs text-[var(--text-muted)]">No account connected.</span>
                  <button
                    className={btnPrimary}
                    disabled={!providerConfigured || connectingProvider === p}
                    onClick={() => connect(p)}
                  >
                    <Link2 size={13} />
                    {connectingProvider === p ? 'Waiting for authorization…' : 'Connect Account'}
                  </button>
                </div>
              )}

              {list.map((acc) => {
                const expanded = expandedId === acc.id;
                const needsReconnect = acc.requiresReconnection || acc.connectionStatus === 'token_expired' || acc.connectionStatus === 'reconnection_required';
                return (
                  <div key={acc.id} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] overflow-hidden">
                    <div className="flex items-center gap-3 p-3">
                      <Avatar name={acc.accountName} src={acc.avatarUrl} size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{acc.accountName}</span>
                          <StatusPill tone={STATUS_TONE[acc.connectionStatus] || 'muted'}>
                            {acc.connectionStatus.replace(/_/g, ' ')}
                          </StatusPill>
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] font-mono truncate">
                          {acc.usernameOrHandle}
                          {acc.channels?.length > 0 && ` Â· ${acc.channels.length} channel${acc.channels.length > 1 ? 's' : ''}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          className={btnGhost}
                          title="Refresh connection / verify token"
                          disabled={busyId === acc.id}
                          onClick={() => refresh(acc)}
                        >
                          <RefreshCw size={13} className={busyId === acc.id ? 'animate-spin' : ''} />
                        </button>
                        <button
                          className={btnGhost}
                          title={needsReconnect ? 'Reconnect account' : 'Reconnect'}
                          disabled={!providerConfigured || connectingProvider === p}
                          onClick={() => connect(p)}
                        >
                          <Link2 size={13} />
                        </button>
                        <button
                          className="p-2 rounded-lg border border-rose-500/30 bg-rose-500/10 text-[var(--status-error)] hover:bg-rose-500/20 transition disabled:opacity-50"
                          title="Disconnect account"
                          disabled={busyId === acc.id}
                          onClick={() => disconnect(acc)}
                        >
                          <Unplug size={13} />
                        </button>
                        <button
                          className="p-2 rounded-lg border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                          onClick={() => setExpandedId(expanded ? null : acc.id)}
                        >
                          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t border-[var(--border-color)] p-3 space-y-3 text-xs">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Connected</div>
                            <div className="text-[var(--text-secondary)]">{formatDate(acc.connectionDate)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Last sync</div>
                            <div className="text-[var(--text-secondary)]">{formatDateTime(acc.lastSuccessfulSync)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Token expires</div>
                            <div className="text-[var(--text-secondary)]">{formatDate(acc.tokenExpiresAt)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Token status</div>
                            <div className={acc.tokenValid ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'}>
                              {acc.tokenValid ? 'Valid' : 'Invalid / expired'}
                            </div>
                          </div>
                        </div>
                        {acc.statusMessage && (
                          <p className="text-[var(--text-muted)]">{acc.statusMessage}</p>
                        )}
                        {acc.permissions && acc.permissions.length > 0 && (
                          <div>
                            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1.5">Granted permissions</div>
                            <div className="flex flex-wrap gap-1.5">
                              {acc.permissions.map((perm) => (
                                <span
                                  key={perm.name}
                                  title={perm.description}
                                  className={`px-2 py-0.5 rounded-md border text-[10px] font-mono ${
                                    perm.granted
                                      ? 'border-emerald-500/30 bg-emerald-500/10 text-[var(--status-success)]'
                                      : 'border-[var(--border-color)] text-[var(--text-muted)]'
                                  }`}
                                >
                                  {perm.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {acc.channels && acc.channels.length > 0 && (
                          <div>
                            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1.5">Channels / Pages</div>
                            <div className="space-y-1">
                              {acc.channels.map((ch) => (
                                <div key={ch.id} className="flex items-center gap-2 text-[var(--text-secondary)]">
                                  <Avatar name={ch.channelName} src={ch.avatarUrl} size={20} />
                                  <span className="truncate">{ch.channelName}</span>
                                  <span className="font-mono text-[10px] text-[var(--text-muted)] truncate">{ch.handle}</span>
                                  <span className="ml-auto text-[10px] font-mono text-[var(--text-muted)]">
                                    {ch.subscriberOrFollowerCount.toLocaleString()} followers
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {list.length > 0 && (
                <div className="flex justify-end">
                  <button
                    className={btnGhost}
                    disabled={!providerConfigured || connectingProvider === p}
                    onClick={() => connect(p)}
                  >
                    <Link2 size={13} /> Connect another {meta.label} account
                  </button>
                </div>
              )}
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
};
