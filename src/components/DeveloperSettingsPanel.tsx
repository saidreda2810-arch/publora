import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { Key, Shield, Copy, Check, ExternalLink, Info, CheckCircle2, AlertTriangle } from 'lucide-react';

interface OAuthProviderStatus {
  configured: boolean;
  clientIdMasked?: string | null;
  appIdMasked?: string | null;
  clientKeyMasked?: string | null;
}

interface OAuthConfigResponse {
  success: boolean;
  environment?: string;
  baseUrl?: string;
  sharedUrl?: string;
  callbacks: Record<'youtube' | 'facebook' | 'instagram' | 'tiktok', { dev: string; shared: string }>;
  providers: Record<'youtube' | 'facebook' | 'instagram' | 'tiktok', OAuthProviderStatus>;
}

/**
 * Platform Developer Settings — GOD Primary Owner only.
 * Rendered exclusively inside the GOD Console (AdminDashboardView).
 * Writes are additionally enforced server-side via requireGodOwner.
 */
export const DeveloperSettingsPanel: React.FC = () => {
  const [configData, setConfigData] = useState<OAuthConfigResponse | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [metaAppId, setMetaAppId] = useState('');
  const [metaAppSecret, setMetaAppSecret] = useState('');
  const [tiktokClientKey, setTiktokClientKey] = useState('');
  const [tiktokClientSecret, setTiktokClientSecret] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaveSuccess, setConfigSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [diag, setDiag] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const runDiagnostics = async () => {
    setDiagLoading(true);
    try {
      const res = await apiFetch('/api/oauth/diagnostics');
      const d = await res.json();
      if (d.success) setDiag(d); else setSaveError(d.error || 'Diagnostics failed');
    } catch { setSaveError('Diagnostics request failed.'); } finally { setDiagLoading(false); }
  };

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

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigSaveSuccess(false);
    setSaveError(null);

    try {
      const res = await apiFetch('/api/oauth/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleClientId: googleClientId || undefined,
          googleClientSecret: googleClientSecret || undefined,
          metaAppId: metaAppId || undefined,
          metaAppSecret: metaAppSecret || undefined,
          tiktokClientKey: tiktokClientKey || undefined,
          tiktokClientSecret: tiktokClientSecret || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setConfigSaveSuccess(true);
        fetchConfig();
        setTimeout(() => setConfigSaveSuccess(false), 3000);
      } else {
        setSaveError(data.error || `Save failed (${res.status})`);
      }
    } catch (err) {
      console.error('Error saving OAuth config:', err);
      setSaveError('Network error while saving credentials.');
    } finally {
      setSavingConfig(false);
    }
  };

  const callbackRow = (label: string, color: string, uri: string | undefined, copyKey: string) => (
    <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
      <div>
        <span className={`${color} font-bold uppercase me-2`}>{label} Callback:</span>
        <span className="text-[var(--text-primary)] select-all break-all">{uri || 'Loading...'}</span>
      </div>
      {uri && (
        <button
          onClick={() => handleCopy(uri, copyKey)}
          className="px-2 py-1 rounded bg-[var(--bg-surface-hover)] hover:bg-[#00D6B2]/20 hover:text-[#00D6B2] transition flex items-center space-x-1 text-[11px] whitespace-nowrap self-end sm:self-auto"
        >
          {copiedKey === copyKey ? <Check className="w-3.5 h-3.5 text-[#00D6B2]" /> : <Copy className="w-3.5 h-3.5" />}
          <span>Copy URI</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-4">
        <div className="flex items-center space-x-2.5">
          <Key className="w-5 h-5 text-[#00D6B2]" />
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">OAuth 2.0 Platform Developer Credentials</h2>
        </div>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed max-w-3xl">
          Publora's centrally managed official OAuth applications. Credentials are stored server-side only and never exposed to customer workspaces. Access restricted to the platform Primary Owner.
        </p>

        {/* Authorized Redirect URIs */}
        <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[#00D6B2]/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-[#00D6B2] uppercase tracking-wider flex items-center space-x-1.5">
              <Shield className="w-4 h-4" />
              <span>Authorized OAuth Redirect URIs (Required in Developer Consoles)</span>
            </div>
            <span className="text-[10px] text-[var(--text-secondary)]">Copy & paste into developer portals</span>
          </div>
          <div className="grid grid-cols-1 gap-2.5 text-xs font-mono">
            {callbackRow('YouTube', 'text-red-400', configData?.callbacks.youtube.dev, 'yt_dev')}
            {callbackRow('Facebook Pages', 'text-blue-400', configData?.callbacks.facebook.dev, 'fb_dev')}
            {callbackRow('Instagram', 'text-pink-400', configData?.callbacks.instagram.dev, 'ig_dev')}
            {callbackRow('TikTok', 'text-cyan-400', configData?.callbacks.tiktok.dev, 'tt_dev')}
          </div>
        </div>

        {isLoadingConfig && <p className="text-xs text-[var(--text-secondary)] font-mono">Loading configuration…</p>}

        {/* Credentials form */}
        <form onSubmit={handleSaveConfig} className="space-y-6 pt-2">
          {/* Google / YouTube */}
          <div className="space-y-3 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                <span className="font-bold text-sm text-[var(--text-primary)]">Google & YouTube OAuth 2.0</span>
              </div>
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-xs text-[#00D6B2] hover:underline flex items-center space-x-1">
                <span>Google Cloud Console</span><ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[var(--text-secondary)] font-medium mb-1">Google Client ID {configData?.providers.youtube.configured && '✓ (Active)'}</label>
                <input type="text" value={googleClientId} onChange={(e) => setGoogleClientId(e.target.value)} placeholder={configData?.providers.youtube.clientIdMasked || 'e.g. 123456789-abcdef.apps.googleusercontent.com'} className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono placeholder-slate-600 focus:outline-none focus:border-[#00D6B2]" />
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] font-medium mb-1">Google Client Secret</label>
                <input type="password" value={googleClientSecret} onChange={(e) => setGoogleClientSecret(e.target.value)} placeholder={configData?.providers.youtube.configured ? '••••••••••••••••••••' : 'GOCSPX-...'} className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono placeholder-slate-600 focus:outline-none focus:border-[#00D6B2]" />
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="space-y-3 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="font-bold text-sm text-[var(--text-primary)]">Meta (Facebook Pages & Instagram Professional)</span>
              </div>
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="text-xs text-[#00D6B2] hover:underline flex items-center space-x-1">
                <span>Meta for Developers</span><ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[var(--text-secondary)] font-medium mb-1">Meta App ID {configData?.providers.facebook.configured && '✓ (Active)'}</label>
                <input type="text" value={metaAppId} onChange={(e) => setMetaAppId(e.target.value)} placeholder={configData?.providers.facebook.appIdMasked || 'e.g. 159827364819203'} className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono placeholder-slate-600 focus:outline-none focus:border-[#00D6B2]" />
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] font-medium mb-1">Meta App Secret</label>
                <input type="password" value={metaAppSecret} onChange={(e) => setMetaAppSecret(e.target.value)} placeholder={configData?.providers.facebook.configured ? '••••••••••••••••••••' : 'Secret Key from App Basic Settings'} className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono placeholder-slate-600 focus:outline-none focus:border-[#00D6B2]" />
              </div>
            </div>
          </div>

          {/* TikTok */}
          <div className="space-y-3 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-cyan-400" />
                <span className="font-bold text-sm text-[var(--text-primary)]">TikTok Login Kit & Content Posting</span>
              </div>
              <a href="https://developers.tiktok.com/" target="_blank" rel="noreferrer" className="text-xs text-[#00D6B2] hover:underline flex items-center space-x-1">
                <span>TikTok for Developers</span><ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[var(--text-secondary)] font-medium mb-1">TikTok Client Key {configData?.providers.tiktok.configured && '✓ (Active)'}</label>
                <input type="text" value={tiktokClientKey} onChange={(e) => setTiktokClientKey(e.target.value)} placeholder={configData?.providers.tiktok.clientKeyMasked || 'e.g. aw1234567890'} className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono placeholder-slate-600 focus:outline-none focus:border-[#00D6B2]" />
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] font-medium mb-1">TikTok Client Secret</label>
                <input type="password" value={tiktokClientSecret} onChange={(e) => setTiktokClientSecret(e.target.value)} placeholder={configData?.providers.tiktok.configured ? '••••••••••••••••••••' : 'Client Secret'} className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono placeholder-slate-600 focus:outline-none focus:border-[#00D6B2]" />
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end space-x-3 pt-2">
            {configSaveSuccess && (
              <span className="text-xs text-[#00D6B2] font-semibold flex items-center space-x-1 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" /><span>Credentials saved securely!</span>
              </span>
            )}
            {saveError && <span className="text-xs text-red-400 font-semibold">{saveError}</span>}
            <button type="submit" disabled={savingConfig} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black font-bold text-xs shadow-lg shadow-[#00D6B2]/20 hover:opacity-90 transition disabled:opacity-50">
              {savingConfig ? 'Saving to Secure Store...' : 'Save Developer Credentials'}
            </button>
          </div>
        </form>
      </div>

      {/* Integration diagnostics — GOD only */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2"><Shield className="w-4 h-4 text-[#00D6B2]" /> Integration Diagnostics</h3>
          <button type="button" onClick={runDiagnostics} disabled={diagLoading} className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface-hover)] text-[11px] font-semibold text-[var(--text-primary)] disabled:opacity-40">
            {diagLoading ? 'Checking…' : 'Run Diagnostics'}
          </button>
        </div>
        {diag && (
          <div className="space-y-2 text-[11px]">
            <div className="flex flex-wrap gap-1.5">
              {diag.configuredProviders?.map((p: string) => (
                <span key={p} className="px-2 py-1 rounded-md bg-[#00D6B2]/15 border border-[#00D6B2]/40 text-[#00D6B2] font-mono uppercase text-[10px]">{p} configured</span>
              ))}
              {diag.store && <span className="px-2 py-1 rounded-md bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-[var(--text-secondary)] font-mono text-[10px]">{diag.store.accountsCount} stored accounts{diag.store.error ? ' · store error' : ''}</span>}
            </div>
            {diag.warnings?.length > 0 && (
              <div className="space-y-1">
                {diag.warnings.map((w: string, i: number) => (
                  <p key={i} className="text-amber-300/90 flex items-start gap-1.5"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{w}</p>
                ))}
              </div>
            )}
            {!diag.warnings?.length && <p className="text-[#00D6B2]">All integrations configured — no warnings.</p>}
          </div>
        )}
      </div>

      {/* Setup guide */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-4">
        <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center space-x-2">
          <Info className="w-4 h-4 text-[#00D6B2]" />
          <span>Step-by-Step Developer Platform Setup Instructions</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[var(--text-secondary)] leading-relaxed">
          <div className="p-4 rounded-xl bg-[var(--bg-surface)]/80 border border-[var(--border-color)] space-y-2">
            <div className="font-bold text-[var(--text-primary)] flex items-center space-x-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /><span>1. YouTube / Google Cloud Setup</span></div>
            <ol className="list-decimal list-inside space-y-1 text-[var(--text-secondary)]">
              <li>Go to Google Cloud Console → APIs & Services → Library.</li>
              <li>Enable <strong>YouTube Data API v3</strong> and <strong>YouTube Analytics API</strong>.</li>
              <li>Configure OAuth Consent Screen (add test users or publish app).</li>
              <li>Create Credentials → OAuth client ID → Web Application.</li>
              <li>Add the exact YouTube Redirect URI shown above.</li>
              <li>Copy Client ID & Client Secret into Developer Settings.</li>
            </ol>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-surface)]/80 border border-[var(--border-color)] space-y-2">
            <div className="font-bold text-[var(--text-primary)] flex items-center space-x-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /><span>2. Facebook Pages & Instagram Setup</span></div>
            <ol className="list-decimal list-inside space-y-1 text-[var(--text-secondary)]">
              <li>Go to Meta for Developers → Create App → Select "Business".</li>
              <li>Add the <strong>Facebook Login for Business</strong> product.</li>
              <li>In Settings → Valid OAuth Redirect URIs, paste both Facebook and Instagram URIs.</li>
              <li>Ensure your Instagram account is switched to Professional and linked to a Facebook Page.</li>
              <li>Copy App ID & App Secret from Basic Settings.</li>
            </ol>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-surface)]/80 border border-[var(--border-color)] space-y-2">
            <div className="font-bold text-[var(--text-primary)] flex items-center space-x-1.5"><span className="w-2 h-2 rounded-full bg-cyan-400" /><span>3. TikTok Login Kit Setup</span></div>
            <ol className="list-decimal list-inside space-y-1 text-[var(--text-secondary)]">
              <li>Go to TikTok for Developers → Manage Apps.</li>
              <li>Enable <strong>Login Kit</strong> and <strong>Content Posting API</strong>.</li>
              <li>Set Redirect Domain and add the exact TikTok Callback URI.</li>
              <li>Copy Client Key & Client Secret.</li>
            </ol>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-surface)]/80 border border-[var(--border-color)] space-y-2">
            <div className="font-bold text-[var(--text-primary)] flex items-center space-x-1.5"><span className="w-2 h-2 rounded-full bg-[#00D6B2]" /><span>4. Token Security & Storage Best Practices</span></div>
            <ul className="list-disc list-inside space-y-1 text-[var(--text-secondary)]">
              <li>All tokens are encrypted using AES-256-CBC before disk storage.</li>
              <li>Client browsers receive only sanitized metadata.</li>
              <li>Popup window sends messages via window.opener.postMessage.</li>
              <li>Cross-site request forgery is prevented with single-use cryptographic state nonces.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
