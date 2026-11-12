import React, { useState, useEffect } from 'react';
import { usePublisher } from '../context/PublisherContext';
import {
  Shield,
  Key,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Activity,
  Layers,
  Sparkles,
  Info,
  Clock,
  Check,
  HelpCircle,
  X,
  Play,
  Lock,
  ChevronRight,
  Database,
  ArrowRight,
  PlusCircle,
} from 'lucide-react';
import { Platform, SocialAccount, ConnectedChannel, OAuthPermission, ConnectionStatus } from '../types';
import { apiFetch } from '../lib/api';
import { ConnectionWizard } from './ConnectionWizard';
import { AccountDetailsModal } from './AccountDetailsModal';

interface OAuthConfigResponse {
  success: boolean;
  environment: 'development' | 'production';
  baseUrl: string;
  sharedUrl: string;
  callbacks: {
    youtube: { dev: string; shared: string };
    facebook: { dev: string; shared: string };
    instagram: { dev: string; shared: string };
    tiktok: { dev: string; shared: string };
  };
  providers: {
    youtube: { configured: boolean; clientIdMasked: string | null };
    facebook: { configured: boolean; appIdMasked: string | null };
    instagram: { configured: boolean; appIdMasked: string | null };
    tiktok: { configured: boolean; clientKeyMasked: string | null };
  };
}

interface DiagnosticResult {
  provider: Platform;
  accountName: string;
  tokenValid: boolean;
  latencyMs: number;
  apiStatusCode: number;
  tokenExpiresAt: string;
  publishingEligible: boolean;
  analyticsEligible: boolean;
  status: ConnectionStatus;
  details: string;
  timestamp: string;
}

export const SocialConnectionCenterView: React.FC = () => {
  const { activeBrand, brands, accounts, refreshOAuthAccounts, deleteAccount } = usePublisher();
  const [fBrand, setFBrand] = useState('all');
  const [fPlatform, setFPlatform] = useState('all');
  const [fStatus, setFStatus] = useState('all');

  const [activeSubTab] = useState<'dashboard'>('dashboard');
  const [configData, setConfigData] = useState<OAuthConfigResponse | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  // Connection flow state
  const [connectingProvider, setConnectingProvider] = useState<Platform | null>(null);
  const [showBrandWarning, setShowBrandWarning] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [manageAccount, setManageAccount] = useState<SocialAccount | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionSuccess, setConnectionSuccess] = useState<string | null>(null);

  // Channel discovery modal
  const [channelModalAccount, setChannelModalAccount] = useState<SocialAccount | null>(null);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [savingChannels, setSavingChannels] = useState(false);

  // Diagnostics modal
  const [diagnosticAccount, setDiagnosticAccount] = useState<SocialAccount | null>(null);
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);

  // Permissions detail modal
  const [permissionsModalAccount, setPermissionsModalAccount] = useState<SocialAccount | null>(null);

  // Fetch developer configuration
  const fetchConfig = async () => {
    setIsLoadingConfig(true);
    try {
      const res = await apiFetch('/api/oauth/config');
      if (res.ok) {
        const data = await res.json();
        setConfigData(data);
      }
    } catch (err) {
      console.error('Error fetching OAuth config:', err);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  // Launch OAuth Popup
  const handleConnect = async (provider: Platform) => {
    // Brand gate: workspace must have at least one active (non-archived) brand
    const activeBrands = (brands || []).filter((b: any) => b.status !== 'archived' && b.status !== 'deleted');
    if (activeBrands.length === 0) {
      setShowBrandWarning(true);
      return;
    }
    const targetBrand = activeBrand && activeBrands.some((b: any) => b.id === activeBrand.id) ? activeBrand : activeBrands[0];
    if (!targetBrand) {
      setConnectionError('Please select or create an active brand first.');
      return;
    }

    setConnectingProvider(provider);
    setConnectionError(null);
    setConnectionSuccess(null);

    try {
      // 1. Fetch official authorization URL from server
      const res = await apiFetch('/api/oauth/authorize-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          brandId: targetBrand.id,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.requiresConfig) {
          setConnectionError(
            `${data.error} OAuth credentials are managed centrally by Publora — contact support if connections are unavailable.`
          );
        } else {
          setConnectionError(data.error || 'Failed to initialize OAuth authorization URL.');
        }
        setConnectingProvider(null);
        return;
      }

      // 2. Open official provider authorization URL directly in popup
      const popupWidth = 600;
      const popupHeight = 720;
      const left = window.screenX + (window.outerWidth - popupWidth) / 2;
      const top = window.screenY + (window.outerHeight - popupHeight) / 2;

      const popupWindow = window.open(
        data.url,
        `oauth_${provider}_popup`,
        `width=${popupWidth},height=${popupHeight},top=${top},left=${left},scrollbars=yes,status=no,resizable=yes`
      );

      if (!popupWindow) {
        // Popup blocked — offer same-window redirect fallback
        setConnectionError('Popup blocked by browser. Redirecting to authorization in this tab…');
        setTimeout(() => { window.location.href = data.url; }, 800);
        setConnectingProvider(null);
        return;
      }

      // 3. Listen for postMessage from popup callback — origin must be this app
      const expectedOrigin = window.location.origin;
      const messageListener = (event: MessageEvent) => {
        if (event.origin !== expectedOrigin) return; // reject cross-origin spoofing
        if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
          window.removeEventListener('message', messageListener);
          setConnectingProvider(null);
          setConnectionSuccess(
            `Successfully connected ${provider.toUpperCase()} account to ${targetBrand.name}!`
          );
          refreshOAuthAccounts();

          // Auto open channel selection if multiple channels were returned
          if (event.data?.needsSelection && event.data?.accountId) {
            setTimeout(async () => {
              const freshRes = await apiFetch(`/api/oauth/accounts?brandId=${targetBrand.id}`);
              const freshData = await freshRes.json();
              const acc = freshData.accounts?.find((a: any) => a.id === event.data.accountId);
              if (acc) {
                openChannelModal(acc);
              }
            }, 600);
          }
        } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
          window.removeEventListener('message', messageListener);
          setConnectingProvider(null);
          const errCode = event.data?.code || '';
          const friendlyErrors: Record<string, string> = {
            access_denied: 'Authorization was denied. You can retry anytime.',
            invalid_state: 'Security check failed (invalid OAuth state). Please retry.',
            expired_code: 'Authorization code expired. Please try connecting again.',
            token_exchange_failed: 'Platform token exchange failed. Please retry.',
            account_ineligible: 'This account is not eligible for API publishing (e.g. personal profiles are not supported).',
          };
          setConnectionError(friendlyErrors[errCode] || event.data.error || 'Authentication was denied or failed.');
        }
      };

      window.addEventListener('message', messageListener);

      // Periodic check if popup closed manually
      const checkTimer = setInterval(() => {
        if (popupWindow.closed) {
          clearInterval(checkTimer);
          window.removeEventListener('message', messageListener);
          setConnectingProvider(null);
        }
      }, 1000);
    } catch (err: any) {
      console.error('OAuth initialization error:', err);
      setConnectionError(err.message || 'Network error initiating OAuth.');
      setConnectingProvider(null);
    }
  };

  // Run Diagnostics Test
  const handleRunDiagnostics = async (account: SocialAccount) => {
    setDiagnosticAccount(account);
    setDiagnosticResult(null);
    setIsRunningDiagnostic(true);

    try {
      const res = await apiFetch(`/api/oauth/accounts/${account.id}/diagnostics`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.diagnostics) {
        setDiagnosticResult(data.diagnostics);
        refreshOAuthAccounts();
      } else {
        setDiagnosticResult({
          provider: account.platform,
          accountName: account.accountName,
          tokenValid: false,
          latencyMs: 0,
          apiStatusCode: 500,
          tokenExpiresAt: account.tokenExpiresAt || '',
          publishingEligible: false,
          analyticsEligible: false,
          status: 'error',
          details: data.error || 'Failed to complete diagnostics test.',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      setDiagnosticResult({
        provider: account.platform,
        accountName: account.accountName,
        tokenValid: false,
        latencyMs: 0,
        apiStatusCode: 0,
        tokenExpiresAt: account.tokenExpiresAt || '',
        publishingEligible: false,
        analyticsEligible: false,
        status: 'error',
        details: err.message || 'Network error running diagnostics.',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsRunningDiagnostic(false);
    }
  };

  // Refresh Token
  const handleRefreshToken = async (accountId: string) => {
    try {
      const res = await apiFetch(`/api/oauth/accounts/${accountId}/refresh`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setConnectionSuccess('Access token refreshed and validated successfully.');
        refreshOAuthAccounts();
      } else {
        setConnectionError(data.error || 'Failed to refresh access token.');
      }
    } catch (err: any) {
      setConnectionError(err.message || 'Network error during token refresh.');
    }
  };

  // Open Channel Discovery Modal
  const openChannelModal = (account: SocialAccount) => {
    setChannelModalAccount(account);
    const selected = (account.channels || [])
      .filter((c) => c.selectedForBrand)
      .map((c) => c.id);
    setSelectedChannelIds(selected.length > 0 ? selected : (account.channels || []).map((c) => c.id));
  };

  // Save Channel Discovery Selection
  const handleSaveChannelSelection = async () => {
    if (!channelModalAccount) return;
    setSavingChannels(true);

    try {
      const res = await apiFetch(`/api/oauth/accounts/${channelModalAccount.id}/select-channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedChannelIds }),
      });
      if (res.ok) {
        setConnectionSuccess('Brand channel assignments updated.');
        refreshOAuthAccounts();
        setChannelModalAccount(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingChannels(false);
    }
  };

  // Filter accounts for active brand
  const brandAccounts = accounts.filter((a) => !activeBrand || a.brandId === activeBrand.id);

  // ---- Dashboard stats & filters (real records only) ----
  const connectedAccounts = accounts.filter((a) => a.isConnected || a.connectionStatus === 'connected');
  const healthyAccounts = connectedAccounts.filter((a) => a.tokenValid !== false && !a.requiresReconnection);
  const attentionAccounts = accounts.filter((a) =>
    a.requiresReconnection || a.tokenValid === false ||
    ['expired', 'disconnected', 'error', 'failed'].includes(a.connectionStatus || '') ||
    a.apiPermissions?.canPublish === false
  );
  const publishingAccounts = accounts.filter((a) => a.apiPermissions?.canPublish === true);
  const lastSync = accounts.reduce<string | null>((latest, a) => {
    const t = a.lastSyncedAt || a.tokenExpiresAt;
    return t && (!latest || t > latest) ? t : latest;
  }, null);

  const filteredAccounts = brandAccounts.filter((a) => {
    if (fBrand !== 'all' && a.brandId !== fBrand) return false;
    if (fPlatform !== 'all' && a.platform !== fPlatform) return false;
    if (fStatus !== 'all') {
      const st = a.requiresReconnection || a.tokenValid === false ? 'attention' : (a.connectionStatus || 'not_connected');
      if (fStatus === 'healthy' && st !== 'connected') return false;
      if (fStatus === 'attention' && st !== 'attention' && !['expired', 'disconnected', 'error', 'failed'].includes(st)) return false;
      if (fStatus === 'connected' && st !== 'connected') return false;
    }
    return true;
  });

  // Status badge styling
  const renderStatusBadge = (status: ConnectionStatus = 'not_connected') => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#00D6B2]/15 text-[#00D6B2] border border-[#00D6B2]/30">
            <CheckCircle2 className="w-3 h-3" />
            <span>Connected & Verified</span>
          </span>
        );
      case 'token_expired':
      case 'reconnection_required':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
            <AlertTriangle className="w-3 h-3" />
            <span>Token Expired / Reconnect</span>
          </span>
        );
      case 'publishing_unavailable':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Info className="w-3 h-3" />
            <span>Publishing Unavailable</span>
          </span>
        );
      case 'permission_incomplete':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30">
            <AlertTriangle className="w-3 h-3" />
            <span>Permissions Incomplete</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-color)]">
            <span>{status.replace(/_/g, ' ')}</span>
          </span>
        );
    }
  };

  // Platform metadata
  const platformMeta: Record<
    Platform,
    {
      name: string;
      color: string;
      borderColor: string;
      tagline: string;
      scopesSummary: string;
      eligibilityNote: string;
      badge: string;
    }
  > = {
    youtube: {
      name: 'YouTube',
      color: '#FF0000',
      borderColor: 'border-red-500/30 hover:border-red-500/60',
      tagline: 'Google OAuth 2.0 • Data API v3 & YouTube Analytics API',
      scopesSummary: 'youtube.upload, youtube.readonly, yt-analytics.readonly',
      eligibilityNote: 'Supports direct Shorts & video upload, 1-second retention curve & watch duration data.',
      badge: '1s Retention API',
    },
    facebook: {
      name: 'Facebook Pages',
      color: '#1877F2',
      borderColor: 'border-blue-500/30 hover:border-blue-500/60',
      tagline: 'Meta Graph API v19.0 • Pages Management & Video Publishing',
      scopesSummary: 'pages_show_list, pages_read_engagement, pages_manage_posts',
      eligibilityNote: 'Personal profiles cannot be automated through the API. Requires managed Facebook Pages with CREATE_CONTENT permission.',
      badge: 'Page Insights',
    },
    instagram: {
      name: 'Instagram Professional',
      color: '#E1306C',
      borderColor: 'border-pink-500/30 hover:border-pink-500/60',
      tagline: 'Meta Graph API • Instagram Content Publishing & Insights',
      scopesSummary: 'instagram_basic, instagram_content_publish, instagram_manage_insights',
      eligibilityNote: 'Requires an eligible Instagram Professional (Business or Creator) account linked to a Facebook Page. Personal accounts do not support API publishing.',
      badge: 'Reels Publishing',
    },
    tiktok: {
      name: 'TikTok',
      color: '#00F2FE',
      borderColor: 'border-cyan-500/30 hover:border-cyan-500/60',
      tagline: 'TikTok Login Kit v2 • Content Posting API (Direct Publish & Inbox)',
      scopesSummary: 'user.info.basic, video.publish, video.upload',
      eligibilityNote: 'Direct publishing to feed requires TikTok Content Posting API authorization. Upload-to-inbox draft mode supported.',
      badge: 'Login Kit v2',
    },
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
      {/* Top Header & Brand Context */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-5">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00D6B2] via-[#087F78] to-[var(--bg-input)] flex items-center justify-center shadow-lg shadow-[#00D6B2]/20 ring-1 ring-white/20">
              <Key className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-2">
                Social Accounts
              </h1>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                Connect and manage your social accounts for this workspace — publishing and analytics permissions shown per account.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={refreshOAuthAccounts}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-color)] transition text-xs font-medium"
            title="Refresh account data from the platform"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => document.getElementById('connect-platforms')?.scrollIntoView({ behavior: 'smooth' })}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black font-bold text-xs shadow-lg shadow-[#00D6B2]/20 hover:opacity-90 transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Connect Social Account</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {connectionError && (
        <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{connectionError}</span>
          </div>
          <button onClick={() => setConnectionError(null)} className="text-red-400 hover:text-[var(--text-primary)] p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {connectionSuccess && (
        <div className="p-3.5 rounded-xl bg-[#00D6B2]/10 border border-[#00D6B2]/30 text-[#ADF5E8] text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-[#00D6B2] flex-shrink-0" />
            <span>{connectionSuccess}</span>
          </div>
          <button onClick={() => setConnectionSuccess(null)} className="text-[#00D6B2] hover:text-[var(--text-primary)] p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Overview Statistics — real account records only */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Connected Accounts', value: accounts.length, tone: 'text-[var(--text-primary)]' },
          { label: 'Healthy', value: healthyAccounts.length, tone: 'text-[#00D6B2]' },
          { label: 'Needs Attention', value: attentionAccounts.length, tone: attentionAccounts.length ? 'text-amber-400' : 'text-[var(--text-secondary)]' },
          { label: 'Expired / Disconnected', value: accounts.filter((a) => a.tokenValid === false || ['expired', 'disconnected'].includes(a.connectionStatus || '')).length, tone: 'text-red-400' },
          { label: 'Publishing Access', value: publishingAccounts.length, tone: 'text-sky-400' },
        ].map((s) => (
          <div key={s.label} className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
            <div className={`text-xl font-black ${s.tone}`}>{s.value}</div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
      {lastSync && <p className="text-[10px] font-mono text-[var(--text-muted)] -mt-4">Last sync: {new Date(lastSync).toLocaleString()}</p>}

      {/* Account Health Center — actionable alerts from real account state */}
      {attentionAccounts.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/25 space-y-2">
          <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Accounts Requiring Attention ({attentionAccounts.length})</h3>
          <div className="space-y-1.5">
            {attentionAccounts.slice(0, 5).map((a) => {
              const issue = a.tokenValid === false ? 'Authorization expired — reconnect required'
                : a.requiresReconnection ? 'Reconnection required'
                : a.apiPermissions?.canPublish === false ? 'Publishing permission missing'
                : `Status: ${a.connectionStatus || 'unknown'}`;
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <span className="text-[var(--text-primary)] font-medium truncate">{a.accountName}</span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase">{a.platform}</span>
                  </div>
                  <span className="text-[11px] text-amber-300/90 shrink-0">{issue}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={fBrand} onChange={(e) => setFBrand(e.target.value)} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] focus:outline-none focus:border-[#00D6B2]">
          <option value="all">All brands</option>
          {(brands || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={fPlatform} onChange={(e) => setFPlatform(e.target.value)} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] focus:outline-none focus:border-[#00D6B2]">
          <option value="all">All platforms</option>
          {['youtube', 'facebook', 'instagram', 'tiktok'].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] focus:outline-none focus:border-[#00D6B2]">
          <option value="all">All statuses</option>
          <option value="connected">Connected</option>
          <option value="healthy">Healthy</option>
          <option value="attention">Needs attention</option>
        </select>
        {(fBrand !== 'all' || fPlatform !== 'all' || fStatus !== 'all') && (
          <button onClick={() => { setFBrand('all'); setFPlatform('all'); setFStatus('all'); }} className="text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)]">Clear filters</button>
        )}
      </div>

      {/* TAB 1: ACCOUNTS DASHBOARD */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-8">
          {/* Active Brand Context Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div
                className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-white/20"
                style={{ backgroundColor: activeBrand?.color || '#00D6B2' }}
              />
              <div>
                <div className="text-xs text-[var(--text-secondary)]">Target Workspace Brand:</div>
                <div className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <span>{activeBrand ? activeBrand.name : 'No Brand Selected'}</span>
                  {activeBrand && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-[var(--text-secondary)]">
                      {brandAccounts.length} Connected Account(s)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                onClick={refreshOAuthAccounts}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-color)] transition"
                title="Synchronize all connected accounts from secure backend store"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync Accounts</span>
              </button>
            </div>
          </div>

          {/* Platform Connection Grid (4 Official Providers) */}
          <div id="connect-platforms" className="space-y-4 scroll-mt-24">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] flex items-center space-x-2">
                <span>Official OAuth 2.0 Connection Portals</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#00D6B2]/15 text-[#00D6B2] border border-[#00D6B2]/30">
                  4 Supported
                </span>
              </h2>
              <span className="text-xs text-[var(--text-secondary)] hidden sm:inline">
                Clicking Connect opens official platform login dialog in popup
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(['youtube', 'facebook', 'instagram', 'tiktok'] as Platform[]).map((platform) => {
                const meta = platformMeta[platform];
                const isConfigured = configData?.providers?.[platform]?.configured;
                const isConnecting = connectingProvider === platform;
                const platformAccounts = brandAccounts.filter((a) => a.platform === platform);
                const hasConnected = platformAccounts.length > 0;
                const needsReconnect = platformAccounts.some((a) => a.tokenValid === false || a.requiresReconnection);

                return (
                  <div
                    key={platform}
                    className={`rounded-2xl bg-[var(--bg-surface)] border transition flex flex-col justify-between p-4 sm:p-5 relative ${
                      hasConnected ? 'border-[#00D6B2]/40 shadow-lg shadow-[#00D6B2]/5' : meta.borderColor
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Top platform bar */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: meta.color }}
                          />
                          <span className="font-extrabold text-sm sm:text-base text-[var(--text-primary)]">
                            {meta.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-color)]">
                          {meta.badge}
                        </span>
                      </div>

                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">
                        {meta.eligibilityNote}
                      </p>

                      <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-1">
                        <div className="text-[10px] text-[var(--text-muted)] font-mono">SCOPES:</div>
                        <div className="text-[10px] text-[var(--text-secondary)] font-mono truncate" title={meta.scopesSummary}>
                          {meta.scopesSummary}
                        </div>
                      </div>

                      {/* Connection status tag */}
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[var(--text-secondary)]">Connected:</span>
                        {hasConnected ? (
                          <span className="text-[#00D6B2] font-bold">
                            {platformAccounts.length} account(s)
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)] font-medium">None linked</span>
                        )}
                      </div>
                    </div>

                    {/* Action button */}
                    <div className="pt-4 mt-3 border-t border-[var(--border-color)]">
                      {!isConfigured ? (
                        <div className="w-full py-2 px-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300/80 text-[11px] font-medium text-center">
                          OAuth not configured — managed centrally by Publora
                        </div>
                      ) : (
                        <button
                          onClick={() => handleConnect(platform)}
                          disabled={isConnecting}
                          className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition active:scale-95 shadow-md ${
                            hasConnected
                              ? 'bg-[var(--bg-input)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-color)]'
                              : 'bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black shadow-[#00D6B2]/20 hover:opacity-90'
                          }`}
                        >
                          {isConnecting ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Waiting for Authorization…</span>
                            </>
                          ) : (
                            <>
                              <span>{needsReconnect ? 'Reconnect Required' : hasConnected ? 'Manage Account' : 'Connect Account'}</span>
                              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Connected Accounts List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                  Active Connected Accounts ({filteredAccounts.length})
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Real social channels authenticated and verified with official API credentials.
                </p>
              </div>
            </div>

            {filteredAccounts.length === 0 ? (
              <div className="p-8 sm:p-12 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[var(--bg-surface-hover)] border border-[var(--border-color)] mx-auto flex items-center justify-center text-[var(--text-secondary)]">
                  <Key className="w-6 h-6 text-[#00D6B2]" />
                </div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">No Social Accounts Connected Yet</h3>
                <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                  Click any platform connect button above to authenticate via official OAuth 2.0. All tokens are encrypted and managed server-side.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredAccounts.map((account) => {
                  const meta = platformMeta[account.platform];
                  const channels = account.channels || [];
                  const activeChannels = channels.filter((c) => c.selectedForBrand);

                  return (
                    <div
                      key={account.id}
                      className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-4 sm:p-5 space-y-4 hover:border-[var(--border-color)] transition shadow-lg shadow-black/20"
                    >
                      {/* Account Card Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center space-x-3 min-w-0">
                          {account.avatarUrl ? (
                            <img
                              src={account.avatarUrl}
                              alt={account.accountName}
                              className="w-11 h-11 rounded-xl object-cover ring-1 ring-white/20 flex-shrink-0"
                            />
                          ) : (
                            <div
                              className="w-11 h-11 rounded-xl flex items-center justify-center text-black font-extrabold text-sm flex-shrink-0"
                              style={{ backgroundColor: meta.color }}
                            >
                              {account.accountName.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-sm sm:text-base text-[var(--text-primary)] truncate">
                                {account.accountName}
                              </span>
                              <span
                                className="text-[9px] font-mono px-1.5 py-0.5 rounded text-black font-bold uppercase flex-shrink-0"
                                style={{ backgroundColor: meta.color }}
                              >
                                {account.platform}
                              </span>
                            </div>
                            <div className="text-xs text-[var(--text-secondary)] font-mono truncate">
                              {account.handle}
                            </div>
                          </div>
                        </div>

                        {renderStatusBadge(account.connectionStatus)}
                      </div>

                      {/* Status explanation */}
                      {account.statusMessage && (
                        <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[11px] text-[var(--text-secondary)] leading-relaxed">
                          {account.statusMessage}
                        </div>
                      )}

                      {/* Channels / Pages Sub-list */}
                      {channels.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-[var(--border-color)]">
                          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                            <span>Associated Channels / Pages ({activeChannels.length}/{channels.length} linked):</span>
                            {channels.length > 1 && (
                              <button
                                onClick={() => openChannelModal(account)}
                                className="text-[#00D6B2] hover:underline text-[11px] font-medium"
                              >
                                Select Pages
                              </button>
                            )}
                          </div>
                          <div className="space-y-1">
                            {channels.map((ch) => (
                              <div
                                key={ch.id}
                                className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                                  ch.selectedForBrand
                                    ? 'bg-[#00D6B2]/10 border border-[#00D6B2]/25 text-[var(--text-primary)]'
                                    : 'bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-color)]'
                                }`}
                              >
                                <div className="flex items-center space-x-2 truncate">
                                  {ch.avatarUrl && (
                                    <img
                                      src={ch.avatarUrl}
                                      alt={ch.channelName}
                                      className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                                    />
                                  )}
                                  <span className="font-semibold truncate">{ch.channelName}</span>
                                  <span className="text-[10px] text-[var(--text-secondary)] font-mono truncate">
                                    {ch.handle}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-2 flex-shrink-0">
                                  {ch.subscriberOrFollowerCount > 0 && (
                                    <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                                      {ch.subscriberOrFollowerCount.toLocaleString()} fans
                                    </span>
                                  )}
                                  {ch.isEligibleForPublishing ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00D6B2]/20 text-[#00D6B2] font-bold">
                                      Publish OK
                                    </span>
                                  ) : (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                      Publish Ineligible
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Capabilities & Metadata Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[10px] pt-1">
                        <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)]">
                          <div className="text-[var(--text-secondary)]">Publishing</div>
                          <div
                            className={`font-bold mt-0.5 ${
                              account.apiPermissions.canPublish ? 'text-[#00D6B2]' : 'text-amber-400'
                            }`}
                          >
                            {account.apiPermissions.canPublish ? 'Eligible' : 'Ineligible'}
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)]">
                          <div className="text-[var(--text-secondary)]">Analytics</div>
                          <div
                            className={`font-bold mt-0.5 ${
                              account.apiPermissions.canReadAnalytics ? 'text-[#00D6B2]' : 'text-[var(--text-muted)]'
                            }`}
                          >
                            {account.apiPermissions.canReadAnalytics ? 'Active' : 'Unavailable'}
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)]">
                          <div className="text-[var(--text-secondary)]">Token Status</div>
                          <div
                            className={`font-bold mt-0.5 ${
                              account.tokenValid !== false ? 'text-[#00D6B2]' : 'text-red-400'
                            }`}
                          >
                            {account.tokenValid !== false ? 'Valid' : 'Expired'}
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)]">
                          <div className="text-[var(--text-secondary)]">Permissions</div>
                          <button
                            onClick={() => setPermissionsModalAccount(account)}
                            className="font-bold text-[#ADF5E8] hover:underline mt-0.5"
                          >
                            {account.permissions?.length || 3} Granted
                          </button>
                        </div>
                      </div>

                      {/* Action buttons bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-color)] text-xs">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleRunDiagnostics(account)}
                            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-color)] transition"
                            title="Run live API connection diagnostics"
                          >
                            <Activity className="w-3.5 h-3.5 text-[#00D6B2]" />
                            <span>Test Live API</span>
                          </button>
                          <button
                            onClick={() => handleRefreshToken(account.id)}
                            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-color)] transition"
                            title="Refresh token using stored refresh credentials"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-[#ADF5E8]" />
                            <span>Refresh</span>
                          </button>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setManageAccount(account)}
                            className="text-xs font-semibold text-[#00D6B2] hover:text-[#ADF5E8] transition px-2 py-1"
                          >
                            Manage
                          </button>
                          <button
                            onClick={() => handleConnect(account.platform)}
                            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition px-2 py-1"
                            title="Authenticate again to refresh permissions"
                          >
                            Reconnect
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Disconnect ${account.accountName}? Revokes tokens and removes from brand.`)) {
                                deleteAccount(account.id);
                              }
                            }}
                            className="p-1.5 rounded-lg bg-[var(--bg-input)]/80 hover:bg-red-500/20 text-[var(--text-secondary)] hover:text-red-400 transition"
                            title="Disconnect account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}


      {/* Connection Wizard */}
      <ConnectionWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        accounts={accounts}
        brands={brands || []}
        activeBrandId={activeBrand?.id}
        onAuthorize={handleConnect}
        connectingProvider={connectingProvider}
        connectionSuccess={connectionSuccess}
        onComplete={() => { refreshOAuthAccounts(); setConnectionSuccess(null); }}
      />

      {/* Account Details / Management Modal */}
      <AccountDetailsModal
        account={manageAccount}
        brands={brands || []}
        onClose={() => setManageAccount(null)}
        onReconnect={(platform) => { setManageAccount(null); handleConnect(platform as Platform); }}
        onDisconnect={(id) => { deleteAccount(id); setManageAccount(null); }}
        onBrandChanged={() => refreshOAuthAccounts()}
      />

      {/* MODAL 1: Channel / Page Selection Modal */}
      {channelModalAccount && (
        <div className="fixed inset-0 z-[110] bg-[var(--bg-overlay)] backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-[#00D6B2]" />
                <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                  Select Channels / Pages for {activeBrand?.name}
                </h3>
              </div>
              <button
                onClick={() => setChannelModalAccount(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              This authenticated account grants access to {channelModalAccount.channels?.length || 0} channel(s) or page(s). Choose which ones should be published to by this brand.
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto pe-1">
              {(channelModalAccount.channels || []).map((ch) => {
                const isSelected = selectedChannelIds.includes(ch.id);
                return (
                  <div
                    key={ch.id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedChannelIds(selectedChannelIds.filter((id) => id !== ch.id));
                      } else {
                        setSelectedChannelIds([...selectedChannelIds, ch.id]);
                      }
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'bg-[#00D6B2]/15 border-[#00D6B2] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    <div className="flex items-center space-x-3 truncate">
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border ${
                          isSelected ? 'bg-[#00D6B2] border-[#00D6B2]' : 'border-[var(--border-color)]'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-black font-bold" />}
                      </div>
                      {ch.avatarUrl && (
                        <img
                          src={ch.avatarUrl}
                          alt={ch.channelName}
                          className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                        />
                      )}
                      <div className="truncate">
                        <div className="font-semibold text-xs truncate">{ch.channelName}</div>
                        <div className="text-[10px] text-[var(--text-secondary)] font-mono">{ch.handle}</div>
                      </div>
                    </div>

                    <div className="text-[10px] text-end flex-shrink-0">
                      {ch.isEligibleForPublishing ? (
                        <span className="text-[#00D6B2] font-bold">Publish Ready</span>
                      ) : (
                        <span className="text-amber-400 font-medium">Ineligible</span>
                      )}
                      {ch.subscriberOrFollowerCount > 0 && (
                        <div className="text-[var(--text-muted)] font-mono">
                          {ch.subscriberOrFollowerCount.toLocaleString()} followers
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => setChannelModalAccount(null)}
                className="px-4 py-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-secondary)] text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveChannelSelection}
                disabled={savingChannels}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black text-xs font-bold shadow-md shadow-[#00D6B2]/20 hover:opacity-90"
              >
                {savingChannels ? 'Saving...' : 'Apply Channel Selection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Live Diagnostics Modal */}
      {diagnosticAccount && (
        <div className="fixed inset-0 z-[110] bg-[var(--bg-overlay)] backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-[#00D6B2]" />
                <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                  Live API Connection Diagnostics
                </h3>
              </div>
              <button
                onClick={() => setDiagnosticAccount(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-[var(--text-primary)]">{diagnosticAccount.accountName}</div>
                <div className="text-[11px] text-[var(--text-secondary)] font-mono">
                  {diagnosticAccount.platform.toUpperCase()} • {diagnosticAccount.handle}
                </div>
              </div>
              {renderStatusBadge(diagnosticAccount.connectionStatus)}
            </div>

            {isRunningDiagnostic ? (
              <div className="py-8 text-center space-y-2">
                <RefreshCw className="w-6 h-6 text-[#00D6B2] animate-spin mx-auto" />
                <p className="text-xs text-[var(--text-secondary)]">
                  Sending verification ping to official {diagnosticAccount.platform} API endpoint...
                </p>
              </div>
            ) : diagnosticResult ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-1">
                    <div className="text-[10px] text-[var(--text-secondary)]">API Response Latency</div>
                    <div className="text-sm font-bold font-mono text-[#00D6B2]">
                      {diagnosticResult.latencyMs} ms
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-1">
                    <div className="text-[10px] text-[var(--text-secondary)]">HTTP Status Code</div>
                    <div className="text-sm font-bold font-mono text-[var(--text-primary)]">
                      {diagnosticResult.apiStatusCode || 200}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-1.5">
                  <div className="text-[10px] uppercase font-semibold text-[var(--text-secondary)]">
                    Diagnostic Message
                  </div>
                  <div className="text-xs text-[var(--text-primary)] leading-relaxed font-mono">
                    {diagnosticResult.details}
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-[11px]">
                  <span className="text-[var(--text-secondary)]">Publishing Pipeline:</span>
                  <span
                    className={`font-bold ${
                      diagnosticResult.publishingEligible ? 'text-[#00D6B2]' : 'text-amber-400'
                    }`}
                  >
                    {diagnosticResult.publishingEligible ? 'Eligible & Verified' : 'Ineligible'}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-2 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => setDiagnosticAccount(null)}
                className="px-5 py-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] text-xs font-semibold"
              >
                Close Diagnostics
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Granted Permissions Modal */}
      {permissionsModalAccount && (
        <div className="fixed inset-0 z-[110] bg-[var(--bg-overlay)] backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4 text-[#00D6B2]" />
                <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                  Granted API Permissions
                </h3>
              </div>
              <button
                onClick={() => setPermissionsModalAccount(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-[var(--text-secondary)]">
              <span className="text-[var(--text-secondary)]">Account:</span>{' '}
              <span className="font-bold text-[var(--text-primary)]">{permissionsModalAccount.accountName}</span> (
              {permissionsModalAccount.platform.toUpperCase()})
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pe-1">
              {(permissionsModalAccount.permissions || []).map((perm, i) => (
                <div key={i} className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-[#00D6B2] font-bold break-all">
                      {perm.name}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00D6B2]/15 text-[#00D6B2] font-bold">
                      Active
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{perm.description}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => setPermissionsModalAccount(null)}
                className="px-4 py-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Brand required warning modal */}
      {showBrandWarning && (
        <div className="fixed inset-0 z-[100] bg-[var(--bg-overlay)] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)]">Create Your First Brand First!</h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Before connecting your social media accounts, you need to create a Brand in your workspace.
              Brands help you organize your social accounts, manage your content, and keep your publishing workflow structured.
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">You can connect YouTube, Facebook, Instagram, and TikTok after creating your Brand.</p>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                onClick={() => {
                  setShowBrandWarning(false);
                  window.history.pushState({}, '', '/brands');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black text-xs font-bold"
              >Create Your First Brand</button>
              <button
                onClick={() => setShowBrandWarning(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] text-xs font-semibold"
              >Maybe Later</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
