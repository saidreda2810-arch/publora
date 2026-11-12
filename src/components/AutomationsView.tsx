import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { usePublisher } from '../context/PublisherContext';
import {
  Cpu, Play, Pause, Plus, Trash2, CheckCircle2, AlertTriangle,
  Clock, Layers, Zap, Activity, RefreshCw, Copy, Square, History,
} from 'lucide-react';

interface Workflow {
  id: string; name: string; description?: string; status: string;
  trigger?: { type?: string; config?: any } | null;
  steps?: { id?: string; type: string; config?: any }[];
  brandId?: string | null; projectId?: string | null;
  version?: number; createdAt?: string; updatedAt?: string;
  lastExecutionAt?: string | null; lastExecutionStatus?: string | null;
}
interface Execution {
  id: string; workflowId: string; status: string;
  triggerEvent?: string; startedAt?: string; completedAt?: string;
  durationMs?: number | null; error?: string | null;
  steps?: { stepId: string; type: string; status: string; error?: string | null }[];
}

const TRIGGER_TYPES = [
  { id: 'interval', label: 'On interval', hint: 'every N minutes' },
  { id: 'daily', label: 'Daily', hint: 'once per day' },
  { id: 'weekly', label: 'Weekly', hint: 'once per week' },
  { id: 'drive_new_file', label: 'Drive new video', hint: 'polls connected Drive folder' },
  { id: 'video_uploaded', label: 'Video uploaded', hint: 'new library video' },
  { id: 'post_scheduled', label: 'Post scheduled', hint: 'new queue entry' },
  { id: 'post_failed', label: 'Post failed', hint: 'publishing failure' },
  { id: 'manual', label: 'Manual only', hint: 'run on demand' },
];
const STEP_TYPES = ['notify_user', 'assign_brand', 'assign_project', 'add_to_queue', 'condition', 'wait'];

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  paused: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  draft: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  disabled: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  archived: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

export const AutomationsView: React.FC = () => {
  const { brands } = usePublisher();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showExecs, setShowExecs] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [editSteps, setEditSteps] = useState<{ type: string; config: any }[]>([]);
  const [editTrigger, setEditTrigger] = useState<{ type: string; config: any } | null>(null);
  const [videos, setVideos] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', description: '', triggerType: 'daily', brandId: '', stepTypes: ['notify_user'] as string[] });

  const flash = (m: string) => { setFeedback(m); setTimeout(() => setFeedback(null), 3500); };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [w, e, ap, an] = await Promise.all([
        apiFetch('/api/saas/automations/workflows'),
        apiFetch('/api/saas/automations/executions?limit=50'),
        apiFetch('/api/saas/automations/approvals').catch(() => null),
        apiFetch('/api/saas/automations/analytics').catch(() => null),
      ]);
      const wj = await w.json(); const ej = await e.json();
      if (wj.success) setWorkflows(wj.workflows || []);
      if (ej.success) setExecutions(ej.executions || []);
      if (ap) { const aj = await ap.json(); if (aj.success) setApprovals((aj.approvals || []).filter((a: any) => a.status === 'pending' || a.status === 'approved' || a.status === 'rejected')); }
      if (an) { const aj = await an.json(); if (aj.success) setAnalytics(aj.analytics); }
      const vd = await apiFetch('/api/saas/state');
      const vj = await vd.json();
      const ws = vj.data || vj;
      if (ws.videos) setVideos(ws.videos);
      if (ws.projects) setProjects(ws.projects);
    } catch { setError('Failed to load automations'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const steps = form.stepTypes.map((t) => ({ type: t, config: {} }));
    const res = await apiFetch('/api/saas/automations/workflows', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name.trim(), description: form.description,
        brandId: form.brandId || null,
        trigger: { type: form.triggerType, config: form.triggerType === 'interval' ? { minutes: 60 } : {} },
        steps, status: 'draft',
      }),
    });
    const j = await res.json();
    if (j.success) { flash('Workflow created as draft.'); setIsCreating(false); setForm({ name: '', description: '', triggerType: 'daily', brandId: '', stepTypes: ['notify_user'] }); load(); }
    else flash(j.error || 'Create failed');
  };

  const patch = async (id: string, body: any) => {
    await apiFetch(`/api/saas/automations/workflows/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    load();
  };

  const runNow = async (id: string) => {
    const res = await apiFetch(`/api/saas/automations/workflows/${id}/run`, { method: 'POST' });
    const j = await res.json();
    flash(j.success ? 'Execution completed — check history.' : (j.error || 'Run failed'));
    load();
  };

  const duplicate = async (id: string) => {
    await apiFetch(`/api/saas/automations/workflows/${id}/duplicate`, { method: 'POST' });
    flash('Workflow duplicated as draft.'); load();
  };

  const openEditor = (wf: Workflow) => {
    setEditingId(wf.id);
    setEditSteps((wf.steps || []).map((s: any) => ({ type: s.type, config: s.config || {} })));
    setEditTrigger(wf.trigger ? { type: wf.trigger.type || 'manual', config: wf.trigger.config || {} } : { type: 'manual', config: {} });
  };

  const saveEditor = async () => {
    if (!editingId) return;
    await patch(editingId, { steps: editSteps, trigger: editTrigger });
    flash('Workflow saved — version bumped.');
    setEditingId(null);
  };

  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= editSteps.length) return;
    const next = [...editSteps];
    [next[i], next[j]] = [next[j], next[i]];
    setEditSteps(next);
  };

  const TEMPLATES: { name: string; desc: string; trigger: any; steps: any[] }[] = [
    { name: 'Drive → AI Studio', desc: 'New Drive video → notify → assign brand', trigger: { type: 'drive_new_file', config: {} }, steps: [{ type: 'notify_user', config: { message: 'New Drive video detected' } }, { type: 'assign_brand', config: {} }] },
    { name: 'Drive → Publishing Queue', desc: 'Drive video → queue post', trigger: { type: 'drive_new_file', config: {} }, steps: [{ type: 'add_to_queue', config: { platforms: ['youtube'] } }] },
    { name: 'Brand Content Pipeline', desc: 'New video → assign project → notify', trigger: { type: 'video_uploaded', config: {} }, steps: [{ type: 'assign_project', config: {} }, { type: 'notify_user', config: { message: 'New brand video ready' } }] },
    { name: 'Failed Post Alert', desc: 'Publishing failure → notify', trigger: { type: 'post_failed', config: {} }, steps: [{ type: 'notify_user', config: { message: 'A post failed publishing — review queue' } }] },
    { name: 'Weekly Report', desc: 'Weekly trigger → summary notify', trigger: { type: 'weekly', config: {} }, steps: [{ type: 'notify_user', config: { message: 'Weekly automation report' } }] },
    { name: 'Daily Stagger', desc: 'Daily → queue housekeeping notify', trigger: { type: 'daily', config: {} }, steps: [{ type: 'notify_user', config: { message: 'Daily automation cycle complete' } }] },
  ];

  const useTemplate = async (tpl: typeof TEMPLATES[0]) => {
    const res = await apiFetch('/api/saas/automations/workflows', {
      method: 'POST',
      body: JSON.stringify({ name: tpl.name, description: tpl.desc, trigger: tpl.trigger, steps: tpl.steps, status: 'draft' }),
    });
    const j = await res.json();
    if (j.success) { flash(`Template "${tpl.name}" created as draft.`); load(); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this workflow? Executions history is preserved.')) return;
    await apiFetch(`/api/saas/automations/workflows/${id}`, { method: 'DELETE' });
    load();
  };

  const metrics = {
    total: workflows.length,
    active: workflows.filter((w) => w.status === 'active').length,
    paused: workflows.filter((w) => w.status === 'paused').length,
    running: executions.filter((x) => x.status === 'running' || x.status === 'queued').length,
    failed: executions.filter((x) => x.status === 'failed').length,
    today: executions.filter((x) => x.startedAt && new Date(x.startedAt).toDateString() === new Date().toDateString()).length,
  };

  const execsFor = (id: string) => executions.filter((x) => x.workflowId === id).slice(0, 5);

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="hero-banner-gradient border border-[var(--border-color)] rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <span className="px-2.5 py-0.5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent-ink)] border border-[var(--accent-border)] text-[10px] font-mono font-semibold uppercase">Automation Command Center</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight flex items-center gap-3 mt-2">
              <Cpu className="text-[var(--accent-primary)]" size={28} /> Automated Publishing Workflows
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">Connect Publora modules with triggers, actions and conditions — real executions, persistent history.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={load} className="p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]" title="Refresh"><RefreshCw size={15} /></button>
            <button onClick={() => setIsCreating(!isCreating)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black font-bold text-xs"><Plus size={14} /> New Workflow</button>
          </div>
        </div>
      </div>

      {feedback && <div className="p-3 rounded-xl bg-[var(--bg-badge-info)] border border-[var(--accent-border)] text-[var(--text-badge-info)] text-xs">{feedback}</div>}
      {error && <div className="p-3 rounded-xl bg-[var(--bg-badge-error)] border border-red-500/30 text-[var(--text-badge-error)] text-xs">{error}</div>}

      {/* Approvals inbox */}
      {approvals.filter((a) => a.status === 'pending').length > 0 && (
        <div className="bg-[var(--bg-surface)] border border-amber-500/30 rounded-2xl p-5 space-y-2">
          <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Pending Approvals</h3>
          {approvals.filter((a) => a.status === 'pending').map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-xs">
              <div className="min-w-0">
                <p className="text-[var(--text-primary)] font-semibold truncate">{a.message}</p>
                <p className="text-[10px] font-mono text-[var(--text-muted)]">{a.type} · {a.requestedAt ? new Date(a.requestedAt).toLocaleString() : ''}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={async () => { await apiFetch(`/api/saas/automations/approvals/${a.id}/resolve`, { method: 'POST', body: JSON.stringify({ decision: 'approved' }) }); load(); }} className="px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">Approve</button>
                <button onClick={async () => { await apiFetch(`/api/saas/automations/approvals/${a.id}/resolve`, { method: 'POST', body: JSON.stringify({ decision: 'rejected' }) }); load(); }} className="px-2.5 py-1 rounded bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[10px] font-bold">Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Analytics strip */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { l: 'Avg duration', v: analytics.avgDurationMs ? `${(analytics.avgDurationMs / 1000).toFixed(1)}s` : '—' },
            { l: 'Completed', v: analytics.completed },
            { l: 'Failed', v: analytics.failed },
            { l: 'Awaiting approval', v: analytics.waitingApproval },
          ].map((m) => (
            <div key={m.l} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-[var(--text-primary)]">{m.v}</p>
              <p className="text-[9px] font-mono uppercase text-[var(--text-muted)]">{m.l}</p>
            </div>
          ))}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: 'Workflows', value: metrics.total },
          { label: 'Active', value: metrics.active },
          { label: 'Paused', value: metrics.paused },
          { label: 'Running', value: metrics.running },
          { label: 'Executions today', value: metrics.today },
          { label: 'Failed', value: metrics.failed },
        ].map((m) => (
          <div key={m.label} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-[var(--text-primary)]">{loading ? '…' : m.value}</p>
            <p className="text-[9px] font-mono uppercase text-[var(--text-muted)] mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Create form */}
      {isCreating && (
        <form onSubmit={create} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">New Automation Workflow</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Workflow name *" className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)]" />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)]" />
            <select value={form.triggerType} onChange={(e) => setForm({ ...form, triggerType: e.target.value })} className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)]">
              {TRIGGER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label} — {t.hint}</option>)}
            </select>
            <select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })} className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)]">
              <option value="">All brands</option>
              {brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1.5">Steps</p>
            <div className="flex flex-wrap gap-1.5">
              {STEP_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => setForm({ ...form, stepTypes: form.stepTypes.includes(t) ? form.stepTypes.filter((x) => x !== t) : [...form.stepTypes, t] })}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono border ${form.stepTypes.includes(t) ? 'bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-ink)]' : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-secondary)]'}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black text-xs font-bold">Create Draft</button>
            <button type="button" onClick={() => setIsCreating(false)} className="px-4 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] text-xs">Cancel</button>
          </div>
        </form>
      )}

      {/* Templates */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-5">
        <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-3">Workflow Templates <span className="text-[var(--text-muted)] font-normal normal-case">— create as draft, never auto-activated</span></h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {TEMPLATES.map((t) => (
            <button key={t.name} onClick={() => useTemplate(t)} className="text-start p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent-border)] transition group">
              <p className="text-[11px] font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-ink)]">{t.name}</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Step editor */}
      {editingId && (
        <div className="bg-[var(--bg-surface)] border border-[var(--accent-border)] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Edit Workflow Steps</h3>
            <button onClick={() => setEditingId(null)} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Close</button>
          </div>
          {/* Trigger config */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Trigger:</span>
            <select value={editTrigger?.type} onChange={(e) => setEditTrigger({ type: e.target.value, config: editTrigger?.config || {} })} className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-2 py-1 text-[11px] text-[var(--text-primary)]">
              {TRIGGER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            {editTrigger?.type === 'interval' && (
              <input type="number" min={1} value={editTrigger.config?.minutes || 60} onChange={(e) => setEditTrigger({ ...editTrigger!, config: { ...editTrigger!.config, minutes: Number(e.target.value) } })} className="w-20 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-2 py-1 text-[11px] text-[var(--text-primary)]" placeholder="mins" />
            )}
            {editTrigger?.type === 'drive_new_file' && (
              <input value={editTrigger.config?.driveFolderId || ''} onChange={(e) => setEditTrigger({ ...editTrigger!, config: { ...editTrigger!.config, driveFolderId: e.target.value } })} className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-2 py-1 text-[11px] text-[var(--text-primary)]" placeholder="Drive folder ID (blank = root)" />
            )}
          </div>
          {/* Steps list */}
          <div className="space-y-2">
            {editSteps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)]">
                <span className="text-[10px] font-mono text-[var(--text-muted)] w-6">{i + 1}.</span>
                <span className="text-[11px] font-semibold text-[var(--text-primary)] flex-1">{s.type}</span>
                {/* per-type config */}
                {(s.type === 'assign_brand' || s.type === 'add_to_queue') && (
                  <select value={s.config?.brandId || ''} onChange={(e) => { const n = [...editSteps]; n[i] = { ...s, config: { ...s.config, brandId: e.target.value || undefined } }; setEditSteps(n); }} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded px-1.5 py-0.5 text-[10px] text-[var(--text-primary)]">
                    <option value="">brand…</option>
                    {brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
                {s.type === 'assign_project' && (
                  <select value={s.config?.projectId || ''} onChange={(e) => { const n = [...editSteps]; n[i] = { ...s, config: { ...s.config, projectId: e.target.value || undefined } }; setEditSteps(n); }} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded px-1.5 py-0.5 text-[10px] text-[var(--text-primary)]">
                    <option value="">project…</option>
                    {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
                {s.type === 'notify_user' && (
                  <input value={s.config?.message || ''} onChange={(e) => { const n = [...editSteps]; n[i] = { ...s, config: { ...s.config, message: e.target.value } }; setEditSteps(n); }} className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded px-1.5 py-0.5 text-[10px] text-[var(--text-primary)]" placeholder="Notification message" />
                )}
                {s.type === 'add_to_queue' && (
                  <input value={(s.config?.platforms || []).join(',')} onChange={(e) => { const n = [...editSteps]; n[i] = { ...s, config: { ...s.config, platforms: e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean) } }; setEditSteps(n); }} className="w-36 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded px-1.5 py-0.5 text-[10px] text-[var(--text-primary)]" placeholder="platforms: youtube,tiktok" />
                )}
                {s.type === 'wait' && (
                  <input type="number" min={1} value={s.config?.durationMinutes || ''} onChange={(e) => { const n = [...editSteps]; n[i] = { ...s, config: { ...s.config, durationMinutes: Number(e.target.value) } }; setEditSteps(n); }} className="w-20 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded px-1.5 py-0.5 text-[10px] text-[var(--text-primary)]" placeholder="mins" />
                )}
                <div className="flex gap-0.5">
                  <button onClick={() => moveStep(i, -1)} className="px-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">↑</button>
                  <button onClick={() => moveStep(i, 1)} className="px-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">↓</button>
                  <button onClick={() => setEditSteps(editSteps.filter((_, j) => j !== i))} className="px-1 text-rose-400 hover:text-rose-300">✕</button>
                </div>
              </div>
            ))}
            {editSteps.length === 0 && <p className="text-[11px] text-[var(--text-muted)] text-center py-3">No steps — add one below. A workflow with no steps does nothing.</p>}
          </div>
          <div className="flex items-center gap-2">
            <select id="add-step" className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-primary)]">
              {STEP_TYPES.map((t) => <option key={t} value={t}>+ {t}</option>)}
            </select>
            <button onClick={() => { const sel = document.getElementById('add-step') as HTMLSelectElement; setEditSteps([...editSteps, { type: sel.value, config: {} }]); }} className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] text-[11px] font-semibold hover:text-[var(--text-primary)]">Add Step</button>
            <button onClick={saveEditor} className="ms-auto px-4 py-1.5 rounded-lg bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black text-[11px] font-bold">Save (new version)</button>
          </div>
        </div>
      )}

      {/* Workflow cards */}
      {loading ? (
        <div className="text-center py-16 text-[var(--text-muted)] text-sm"><RefreshCw className="animate-spin mx-auto mb-2" size={20} /> Loading workflows…</div>
      ) : workflows.length === 0 ? (
        <div className="text-center py-16 bg-[var(--bg-surface)] border border-dashed border-[var(--border-color)] rounded-2xl">
          <Layers className="mx-auto text-[var(--text-muted)] mb-3" size={32} />
          <p className="text-sm font-semibold text-[var(--text-primary)]">No automation workflows yet</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Create a draft workflow to automate publishing operations.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {workflows.map((wf) => (
            <div key={wf.id} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{wf.name}</h3>
                    <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border ${STATUS_STYLE[wf.status] || STATUS_STYLE.draft}`}>{wf.status}</span>
                    {wf.version && wf.version > 1 && <span className="text-[9px] font-mono text-[var(--text-muted)]">v{wf.version}</span>}
                  </div>
                  {wf.description && <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 line-clamp-2">{wf.description}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                <span className="px-2 py-0.5 rounded bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)]">⚡ {TRIGGER_TYPES.find((t) => t.id === wf.trigger?.type)?.label || wf.trigger?.type || 'none'}</span>
                {(wf.steps || []).map((s, i) => <span key={i} className="px-2 py-0.5 rounded bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-muted)]">{s.type}</span>)}
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
                <span>{wf.lastExecutionAt ? `Last: ${new Date(wf.lastExecutionAt).toLocaleString()} (${wf.lastExecutionStatus})` : 'Never executed'}</span>
                <span>{wf.createdAt ? `Created ${new Date(wf.createdAt).toLocaleDateString()}` : ''}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[var(--border-color)]">
                {wf.status !== 'active' && wf.status !== 'archived' && <button onClick={() => patch(wf.id, { status: 'active' })} className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold flex items-center gap-1"><Play size={10} /> Activate</button>}
                {wf.status === 'active' && <button onClick={() => patch(wf.id, { status: 'paused' })} className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-semibold flex items-center gap-1"><Pause size={10} /> Pause</button>}
                <button onClick={() => openEditor(wf)} className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] text-[10px] font-semibold flex items-center gap-1 hover:text-[var(--text-primary)]"><Layers size={10} /> Edit</button>
                <button onClick={() => runNow(wf.id)} className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] text-[10px] font-semibold flex items-center gap-1 hover:text-[var(--text-primary)]"><Zap size={10} /> Run</button>
                <button onClick={() => duplicate(wf.id)} className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] text-[10px] font-semibold flex items-center gap-1 hover:text-[var(--text-primary)]"><Copy size={10} /> Duplicate</button>
                <button onClick={() => setShowExecs(showExecs === wf.id ? null : wf.id)} className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] text-[10px] font-semibold flex items-center gap-1 hover:text-[var(--text-primary)]"><History size={10} /> History</button>
                {wf.status !== 'archived' && <button onClick={() => patch(wf.id, { status: 'archived' })} className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-muted)] text-[10px] font-semibold flex items-center gap-1 hover:text-[var(--text-primary)]"><Square size={10} /> Archive</button>}
                <button onClick={() => remove(wf.id)} className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-semibold flex items-center gap-1 ms-auto"><Trash2 size={10} /></button>
              </div>
              {showExecs === wf.id && (
                <div className="pt-2 border-t border-[var(--border-color)] space-y-1.5">
                  {execsFor(wf.id).length === 0 ? <p className="text-[10px] text-[var(--text-muted)] font-mono">No executions yet</p> :
                    execsFor(wf.id).map((x) => (
                      <div key={x.id} className="flex items-center justify-between text-[10px] font-mono">
                        <span className={x.status === 'failed' ? 'text-rose-400' : x.status === 'completed' ? 'text-emerald-400' : 'text-[var(--text-secondary)]'}>{x.status}</span>
                        <span className="text-[var(--text-muted)]">{x.startedAt ? new Date(x.startedAt).toLocaleString() : ''} {x.durationMs ? `· ${(x.durationMs / 1000).toFixed(1)}s` : ''}</span>
                        {x.error && <span className="text-rose-400 truncate max-w-[120px]" title={x.error}>{x.error}</span>}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Global executions */}
      {executions.length > 0 && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-5">
          <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2 mb-3"><Activity size={14} className="text-[var(--accent-primary)]" /> Recent Executions</h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {executions.slice(0, 20).map((x) => {
              const wf = workflows.find((w) => w.id === x.workflowId);
              return (
                <div key={x.id} className="flex items-center justify-between gap-3 text-[11px] font-mono py-1.5 border-b border-[var(--border-color)]/50 last:border-0">
                  <span className="text-[var(--text-primary)] truncate">{wf?.name || x.workflowId}</span>
                  <span className="text-[var(--text-muted)]">{x.triggerEvent}</span>
                  <span className={x.status === 'failed' ? 'text-rose-400' : x.status === 'completed' ? 'text-emerald-400' : 'text-amber-400'}>{x.status}</span>
                  <span className="text-[var(--text-muted)]">{x.startedAt ? new Date(x.startedAt).toLocaleString() : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
