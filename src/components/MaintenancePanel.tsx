import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { Wrench, Play, Square, ShieldAlert, RefreshCw, Clock } from 'lucide-react';

const SERVICES = ['dashboard','workspace','brands','social_accounts','media_uploads','publishing_queue','automations','ai_studio','analytics','api','webhooks','background_workers','god_console'];
const MODES = [
  { id: 'normal', label: 'Normal Operation', desc: 'All services operational' },
  { id: 'readonly', label: 'Read-Only', desc: 'Block writes, allow reads' },
  { id: 'partial', label: 'Partial', desc: 'Restrict selected services' },
  { id: 'full', label: 'Full Maintenance', desc: 'Block all customer access' },
  { id: 'emergency', label: 'Emergency', desc: 'Immediate full restriction' },
];

export const MaintenancePanel: React.FC = () => {
  const [cfg, setCfg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmFull, setConfirmFull] = useState(false);
  const [form, setForm] = useState({ mode: 'normal', reason: '', publicTitle: '', publicMessage: '', affectedServices: [] as string[], scheduledEnd: '', autoExpire: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/saas/admin/maintenance');
      const d = await r.json();
      if (d.success) {
        setCfg(d.maintenance);
        setForm({
          mode: d.maintenance?.mode || 'normal',
          reason: d.maintenance?.reason || '',
          publicTitle: d.maintenance?.publicTitle || '',
          publicMessage: d.maintenance?.publicMessage || '',
          affectedServices: d.maintenance?.affectedServices || [],
          scheduledEnd: d.maintenance?.scheduledEnd || '',
          autoExpire: d.maintenance?.autoExpire || false,
        });
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (confirm = false) => {
    setSaving(true); setMsg(null);
    try {
      const r = await apiFetch('/api/saas/admin/maintenance', {
        method: 'PUT',
        body: JSON.stringify({ ...form, confirm }),
      });
      const d = await r.json();
      if (d.success) { setMsg(`Maintenance set to ${form.mode}`); setConfirmFull(false); load(); }
      else setMsg(d.error || 'Failed');
    } catch { setMsg('Network error'); }
    setSaving(false);
  };

  const toggleService = (s: string) => {
    setForm((f) => ({ ...f, affectedServices: f.affectedServices.includes(s) ? f.affectedServices.filter((x) => x !== s) : [...f.affectedServices, s] }));
  };

  const isCritical = form.mode === 'full' || form.mode === 'emergency';
  const currentMode = cfg?.mode || 'normal';

  return (
    <div className="space-y-5">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2"><Wrench size={18} className="text-[var(--accent-primary)]" /> Maintenance Center</h2>
          <p className="text-xs text-[var(--text-secondary)]">Monitor platform health, control service availability, manage maintenance operations.</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)]"><RefreshCw size={14} /></button>
      </div>

      {msg && <div className={`p-3 rounded-xl text-xs ${msg.includes('set to') ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'}`}>{msg}</div>}

      {/* Current status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { l: 'Current Mode', v: currentMode.toUpperCase() },
          { l: 'Activated', v: cfg?.activatedAt ? new Date(cfg.activatedAt).toLocaleString() : '—' },
          { l: 'Scheduled End', v: cfg?.scheduledEnd ? new Date(cfg.scheduledEnd).toLocaleString() : '—' },
          { l: 'Auto-Expire', v: cfg?.autoExpire ? 'Yes' : 'No' },
        ].map((m) => (
          <div key={m.l} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-3">
            <p className="text-sm font-bold text-[var(--text-primary)] truncate">{m.v}</p>
            <p className="text-[9px] font-mono uppercase text-[var(--text-muted)]">{m.l}</p>
          </div>
        ))}
      </div>

      {/* Mode selector */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-5 space-y-4">
        <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Maintenance Mode</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => setForm({ ...form, mode: m.id })}
              className={`p-3 rounded-xl border text-start transition ${form.mode === m.id ? 'border-[var(--accent-border)] bg-[var(--accent-subtle)]' : 'border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[var(--border-color)]'}`}>
              <p className="text-[11px] font-bold text-[var(--text-primary)]">{m.label}</p>
              <p className="text-[9px] text-[var(--text-muted)] mt-0.5">{m.desc}</p>
            </button>
          ))}
        </div>

        {/* Config fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Internal reason" className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)]" />
          <input value={form.publicTitle} onChange={(e) => setForm({ ...form, publicTitle: e.target.value })} placeholder="Public title (maintenance page)" className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)]" />
          <input value={form.publicMessage} onChange={(e) => setForm({ ...form, publicMessage: e.target.value })} placeholder="Public message" className="sm:col-span-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)]" />
          <input type="datetime-local" value={form.scheduledEnd} onChange={(e) => setForm({ ...form, scheduledEnd: e.target.value })} className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)]" />
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input type="checkbox" checked={form.autoExpire} onChange={(e) => setForm({ ...form, autoExpire: e.target.checked })} className="accent-[#00D6B2]" />
            Auto-expire at scheduled end
          </label>
        </div>

        {/* Service scope (partial mode) */}
        {form.mode === 'partial' && (
          <div>
            <p className="text-[10px] font-mono uppercase text-[var(--text-muted)] mb-2">Affected services</p>
            <div className="flex flex-wrap gap-1.5">
              {SERVICES.map((s) => (
                <button key={s} onClick={() => toggleService(s)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-mono border ${form.affectedServices.includes(s) ? 'bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-ink)]' : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-muted)]'}`}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
          {isCritical && !confirmFull ? (
            <button onClick={() => setConfirmFull(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"><ShieldAlert size={13} /> {form.mode === 'emergency' ? 'Confirm Emergency' : 'Confirm Full Maintenance'}</button>
          ) : isCritical && confirmFull ? (
            <>
              <button onClick={() => save(true)} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"><Play size={13} /> {saving ? 'Applying…' : `Activate ${form.mode.toUpperCase()}`}</button>
              <button onClick={() => setConfirmFull(false)} className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] text-xs">Cancel</button>
            </>
          ) : (
            <button onClick={() => save(false)} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black text-xs font-bold"><Play size={13} /> {saving ? 'Saving…' : 'Apply Configuration'}</button>
          )}
          {currentMode !== 'normal' && (
            <button onClick={async () => { setForm({ ...form, mode: 'normal' }); setTimeout(() => save(false), 100); }} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--bg-input)] border border-emerald-500/30 text-emerald-400 text-xs font-semibold"><Square size={13} /> Disable Maintenance</button>
          )}
        </div>
        {isCritical && <p className="text-[10px] text-amber-400 flex items-center gap-1"><Clock size={10} /> This will restrict customer access. GOD Console remains accessible to you.</p>}
      </div>

      {loading && <p className="text-xs text-[var(--text-muted)]">Loading…</p>}
    </div>
  );
};
