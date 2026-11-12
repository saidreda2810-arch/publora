import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { HardDrive, Save, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;
const fmtB = (b?: number | null) => b == null ? '—' : b >= GB ? `${(b / GB).toFixed(2)} GB` : b >= MB ? `${(b / MB).toFixed(0)} MB` : `${(b / 1024).toFixed(0)} KB`;

interface Policy {
  uploadsEnabled: boolean;
  globalMaxBytes: number;
  planLimitsBytes: { free: number; starter: number; professional: number; enterprise: number };
  workspaceQuotaBytes: number;
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  maxConcurrentUploads: number;
  chunkSizeBytes: number;
  sessionTtlMinutes: number;
  resumableEnabled: boolean;
}

export const UploadPolicyPanel: React.FC = () => {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [formats, setFormats] = useState('');
  const [exts, setExts] = useState('');

  const load = () => {
    apiFetch('/api/saas/admin/upload-policy').then((r: Response) => r.json()).then((d: any) => {
      if (d.success) {
        setPolicy(d.policy);
        setFormats((d.policy.allowedMimeTypes || []).join(', '));
        setExts((d.policy.allowedExtensions || []).join(', '));
      }
    }).catch(() => {});
    apiFetch('/api/saas/admin/storage-details').then((r: Response) => r.json()).then((d: any) => {
      if (d.success) setDetails(d);
    }).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  if (!policy) return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-5 flex items-center gap-2 text-xs text-[var(--text-muted)]">
      <RefreshCw size={13} className="animate-spin" /> Loading upload & storage settings…
    </div>
  );

  const set = (patch: Partial<Policy>) => setPolicy({ ...policy, ...patch });
  const setPlan = (tier: keyof Policy['planLimitsBytes'], mb: number) =>
    setPolicy({ ...policy, planLimitsBytes: { ...policy.planLimitsBytes, [tier]: mb * MB } });

  const save = async () => {
    setSaving(true); setMsg(null);
    const body = {
      ...policy,
      allowedMimeTypes: formats.split(',').map((s) => s.trim()).filter(Boolean),
      allowedExtensions: exts.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    };
    const res = await apiFetch('/api/saas/admin/upload-policy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setSaving(false);
    setMsg(d.success ? { ok: true, text: 'Upload policy saved.' } : { ok: false, text: d.error || 'Save failed' });
    if (d.success) load();
  };

  const NumField = ({ label, value, onChange, suffix, hint }: any) => (
    <label className="block">
      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
      <div className="flex items-center gap-1.5 mt-1">
        <input
          type="number" min={0} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-md px-2 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
        />
        {suffix && <span className="text-[10px] font-mono text-[var(--text-muted)]">{suffix}</span>}
      </div>
      {hint && <span className="text-[9px] text-[var(--text-muted)]">{hint}</span>}
    </label>
  );

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive size={15} className="text-[var(--accent-primary)]" />
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Video Upload & Storage Settings</h3>
            <p className="text-[10px] text-[var(--text-muted)]">Global upload policy enforced server-side for all workspaces.</p>
          </div>
        </div>
        <button type="button" onClick={load} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]" title="Refresh"><RefreshCw size={13} /></button>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Policy form */}
        <div className="space-y-4">
          <label className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/40">
            <div>
              <p className="text-xs font-semibold text-[var(--text-primary)]">Video uploads</p>
              <p className="text-[10px] text-[var(--text-muted)]">Master switch — blocks all new uploads when off</p>
            </div>
            <input type="checkbox" checked={policy.uploadsEnabled} onChange={(e) => set({ uploadsEnabled: e.target.checked })} className="accent-[var(--accent-primary)] w-4 h-4" />
          </label>
          <label className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/40">
            <div>
              <p className="text-xs font-semibold text-[var(--text-primary)]">Resumable (chunked) uploads</p>
              <p className="text-[10px] text-[var(--text-muted)]">Pause/resume large files; auto-expires abandoned sessions</p>
            </div>
            <input type="checkbox" checked={policy.resumableEnabled} onChange={(e) => set({ resumableEnabled: e.target.checked })} className="accent-[var(--accent-primary)] w-4 h-4" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <NumField label="Global max file (MB)" suffix="MB" value={Math.round(policy.globalMaxBytes / MB)} onChange={(v: number) => set({ globalMaxBytes: v * MB })} hint="1 GB = 1024" />
            <NumField label="Workspace quota (GB)" suffix="GB" value={+(policy.workspaceQuotaBytes / GB).toFixed(2)} onChange={(v: number) => set({ workspaceQuotaBytes: v * GB })} hint="0 = unlimited" />
            <NumField label="Chunk size (MB)" suffix="MB" value={Math.round(policy.chunkSizeBytes / MB)} onChange={(v: number) => set({ chunkSizeBytes: v * MB })} />
            <NumField label="Max concurrent uploads" value={policy.maxConcurrentUploads} onChange={(v: number) => set({ maxConcurrentUploads: v })} />
            <NumField label="Session TTL (minutes)" value={policy.sessionTtlMinutes} onChange={(v: number) => set({ sessionTtlMinutes: v })} hint="Abandoned uploads expire" />
          </div>

          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Plan file-size limits (MB)</p>
            <div className="grid grid-cols-2 gap-3">
              {(['free', 'starter', 'professional', 'enterprise'] as const).map((tier) => (
                <NumField
                  key={tier} label={tier[0].toUpperCase() + tier.slice(1)} suffix="MB"
                  value={policy.planLimitsBytes[tier] === 0 ? 0 : Math.round(policy.planLimitsBytes[tier] / MB)}
                  onChange={(v: number) => setPlan(tier, v)}
                  hint={tier === 'enterprise' ? '0 = global max' : undefined}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <label className="block">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">Allowed video MIME types</span>
              <input value={formats} onChange={(e) => setFormats(e.target.value)} className="mt-1 w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-md px-2 py-1.5 text-[11px] font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]" />
            </label>
            <label className="block">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">Allowed extensions</span>
              <input value={exts} onChange={(e) => setExts(e.target.value)} className="mt-1 w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-md px-2 py-1.5 text-[11px] font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]" />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-xs font-bold disabled:opacity-50 flex items-center gap-1.5">
              <Save size={13} /> {saving ? 'Saving…' : 'Save Policy'}
            </button>
            {msg && (
              <span className={`text-[11px] flex items-center gap-1 ${msg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                {msg.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {msg.text}
              </span>
            )}
          </div>
        </div>

        {/* Storage overview */}
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2.5">
            <MiniStat label="Total stored" value={fmtB(details?.totalBytes)} />
            <MiniStat label="Files" value={details?.totalFiles ?? '—'} />
            <MiniStat label="Active sessions" value={details?.activeUploadSessions?.length ?? '—'} />
          </div>
          {details?.workspaces?.length > 0 && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Storage by workspace</p>
              <div className="space-y-1 max-h-44 overflow-y-auto">
                {details.workspaces.map((w: any) => (
                  <div key={w.workspaceId} className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[var(--bg-main)]/40 text-[11px]">
                    <span className="text-[var(--text-secondary)] truncate">{w.name} <span className="font-mono text-[9px] text-[var(--text-muted)]">{w.plan}</span></span>
                    <span className="font-mono text-[var(--text-primary)]">{fmtB(w.usedBytes)}{w.quotaBytes ? ` / ${fmtB(w.quotaBytes)}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {details?.largestVideos?.length > 0 && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Largest videos</p>
              <div className="space-y-1">
                {details.largestVideos.slice(0, 5).map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[var(--bg-main)]/40 text-[11px]">
                    <span className="text-[var(--text-secondary)] truncate max-w-[60%]">{v.name}</span>
                    <span className="font-mono text-[var(--text-primary)]">{fmtB(v.sizeBytes)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {details?.activeUploadSessions?.length > 0 && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-amber-400 mb-1.5">Incomplete uploads ({details.activeUploadSessions.length})</p>
              <div className="space-y-1">
                {details.activeUploadSessions.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-amber-500/5 border border-amber-500/20 text-[11px]">
                    <span className="text-[var(--text-secondary)] truncate max-w-[60%]">{s.filename}</span>
                    <span className="font-mono text-amber-300">{s.receivedChunks}/{s.totalChunks} chunks · {s.ageMinutes}m old</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MiniStat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="bg-[var(--bg-main)]/40 border border-[var(--border-color)] rounded-lg px-3 py-2.5">
    <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
    <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{value}</p>
  </div>
);
