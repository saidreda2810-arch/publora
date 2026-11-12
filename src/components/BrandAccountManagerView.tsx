import React, { useState } from 'react';
import { usePublisher } from '../context/PublisherContext';
import {
  Settings,
  PlusCircle,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Shield,
  Layers,
  Sparkles,
  RefreshCw,
  X,
  Key,
} from 'lucide-react';
import { getPlatformColor } from '../utils/platformSpecs';
import { NewBrandModal } from './Modals';
import { apiFetch } from '../lib/api';

export const BrandAccountManagerView: React.FC<{
  onOpenNewBrand: () => void;
  setActiveTab?: (tab: string) => void;
}> = ({ onOpenNewBrand, setActiveTab }) => {
  const {
    brands,
    activeBrandId,
    setActiveBrandId,
    deleteBrand,
    updateBrand,
    projects,
    createProject,
    updateProject,
    deleteProject,
    accounts,
    updateAccount,
    deleteAccount,
    videos,
    posts,
    campaigns,
    contentIdeas,
  } = usePublisher();

  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [projStatus, setProjStatus] = useState('planning');
  const [projStart, setProjStart] = useState('');
  const [projEnd, setProjEnd] = useState('');
  const [pSearch, setPSearch] = useState('');
  const [pStatusFilter, setPStatusFilter] = useState('all');
  const [editProject, setEditProject] = useState<any>(null);
  const [bSearch, setBSearch] = useState('');
  const [bSort, setBSort] = useState<'name' | 'created' | 'activity'>('name');
  const [bStatus, setBStatus] = useState<'all' | 'active' | 'archived'>('all');
  const [archiveConfirm, setArchiveConfirm] = useState<string | null>(null);
  const [editBrand, setEditBrand] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteDeps, setDeleteDeps] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [ovTab, setOvTab] = useState<'summary' | 'projects' | 'channels' | 'content' | 'campaigns' | 'activity'>('summary');

  const brandStats = (brandId: string) => ({
    projects: projects.filter((p) => p.brandId === brandId).length,
    channels: accounts.filter((a) => a.brandId === brandId).length,
  });

  const filteredBrands = brands
    .filter((b) => bStatus === 'all' || (b.status || 'active') === bStatus)
    .filter((b) => !bSearch || b.name.toLowerCase().includes(bSearch.toLowerCase()) || (b.industry || '').toLowerCase().includes(bSearch.toLowerCase()))
    .sort((a, b) => {
      if (bSort === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (bSort === 'activity') return brandStats(b.id).projects + brandStats(b.id).channels - (brandStats(a.id).projects + brandStats(a.id).channels);
      return a.name.localeCompare(b.name);
    });

  const toggleArchive = (b: any) => {
    const next = (b.status || 'active') === 'archived' ? 'active' : 'archived';
    updateBrand(b.id, { status: next });
    setArchiveConfirm(null);
  };

  // Safe delete: server checks dependencies first; archive suggested when deps exist
  const checkDelete = async (b: any) => {
    setDeleteTarget(b); setDeleteDeps(null); setDeleteLoading(true);
    try {
      const res = await apiFetch(`/api/saas/brands/${b.id}`, { method: 'DELETE' });
      const d = await res.json();
      if (res.status === 409 && d.dependencies) {
        setDeleteDeps(d.dependencies);
      } else if (d.success) {
        deleteBrand(b.id); setDeleteTarget(null);
      } else {
        setDeleteDeps({ error: d.error || 'Delete failed' });
      }
    } catch { setDeleteDeps({ error: 'Request failed' }); }
    finally { setDeleteLoading(false); }
  };

  const forceDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await apiFetch(`/api/saas/brands/${deleteTarget.id}?force=true`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) { deleteBrand(deleteTarget.id); setDeleteTarget(null); setDeleteDeps(null); }
      else setDeleteDeps({ error: d.error || 'Delete failed' });
    } catch { setDeleteDeps({ error: 'Request failed' }); }
    finally { setDeleteLoading(false); }
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName || !activeBrandId) return;
    createProject({
      brandId: activeBrandId,
      name: newProjectName,
      description: newProjectDesc || undefined,
      status: projStatus as any,
      startDate: projStart || undefined,
      endDate: projEnd || undefined,
    });
    setNewProjectName('');
    setNewProjectDesc('');
    setProjStatus('planning');
    setProjStart('');
    setProjEnd('');
  };

  const brandProjects = projects.filter((p) => p.brandId === activeBrandId);
  const brandAccounts = accounts.filter((a) => a.brandId === activeBrandId);
  const activeBrand = brands.find((b) => b.id === activeBrandId);
  const brandVideos = videos.filter((v) => v.brandId === activeBrandId);
  const brandPosts = posts.filter((p) => p.brandId === activeBrandId);
  const brandCampaigns = campaigns.filter((c) => c.brandId === activeBrandId);
  const brandContentIdeas = (contentIdeas || []).filter((c: any) => c.brandId === activeBrandId);

  return (
    <div className="w-full max-w-[1800px] mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-5 sm:pb-6">
        <div>
          <div className="flex items-center space-x-2 text-[11px] font-mono text-[#00D6B2] mb-1">
            <Settings className="w-3.5 h-3.5" />
            <span className="truncate">GENERIC WORKSPACE • BRAND, PROJECT & CHANNEL MANAGEMENT</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
            Brands, Projects & Social Accounts
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
            Manage brands, projects, and connected channels for this workspace.
          </p>
        </div>

        <button
          onClick={onOpenNewBrand}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black font-bold text-xs hover:opacity-90 transition shadow-lg shadow-[#00D6B2]/20 flex items-center justify-center space-x-1.5 self-start min-h-[40px] whitespace-nowrap"
        >
          <PlusCircle className="w-3.5 h-3.5 text-black" />
          <span>Create New Brand</span>
        </button>
      </div>

      {/* Brands Dashboard */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
            <span>Brands</span>
            <span className="text-xs font-mono text-[var(--text-secondary)]">({filteredBrands.length}{filteredBrands.length !== brands.length ? `/${brands.length}` : ''})</span>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <input value={bSearch} onChange={(e) => setBSearch(e.target.value)} placeholder="Search brands…" className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] placeholder-slate-500 w-36 focus:outline-none focus:border-[#00D6B2]" />
            <select value={bSort} onChange={(e) => setBSort(e.target.value as any)} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-secondary)] focus:outline-none focus:border-[#00D6B2]">
              <option value="name">Sort: Name</option>
              <option value="created">Sort: Date created</option>
              <option value="activity">Sort: Activity</option>
            </select>
            <select value={bStatus} onChange={(e) => setBStatus(e.target.value as any)} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-secondary)] focus:outline-none focus:border-[#00D6B2]">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        {filteredBrands.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#00D6B2]/10 border border-[#00D6B2]/30 flex items-center justify-center mx-auto"><PlusCircle className="w-6 h-6 text-[#00D6B2]" /></div>
            <p className="text-sm font-bold text-[var(--text-primary)]">{brands.length === 0 ? 'No brands yet' : 'No brands match your filters'}</p>
            <p className="text-[11px] text-[var(--text-secondary)] max-w-sm mx-auto">{brands.length === 0 ? 'Brands organize your projects, channels, and content. Create your first brand to get started.' : 'Try adjusting your search or filters.'}</p>
            {brands.length === 0 && (
              <button onClick={onOpenNewBrand} className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black font-bold text-xs">Create Your First Brand</button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4">
            {filteredBrands.map((b) => {
              const isActive = b.id === activeBrandId;
              const stats = brandStats(b.id);
              const isArchived = (b.status || 'active') === 'archived';
              return (
                <div
                  key={b.id}
                  onClick={() => { if (!isArchived) { setActiveBrandId(b.id); window.history.pushState({}, '', `/brands/${b.id}`); window.dispatchEvent(new PopStateEvent('popstate')); } }}
                  className={`p-3.5 sm:p-4 rounded-xl border transition flex flex-col justify-between ${isArchived ? 'opacity-60' : 'cursor-pointer'} ${
                    isActive
                      ? 'bg-[var(--bg-surface)] border-[#00D6B2] ring-1 ring-[#00D6B2]'
                      : 'bg-[var(--bg-surface)]/50 border-[var(--border-color)] hover:border-[var(--border-color)]'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2 min-w-0">
                        {b.logoUrl || b.avatarUrl ? <img src={b.logoUrl || b.avatarUrl} alt="" className="w-6 h-6 rounded-lg object-cover flex-shrink-0" /> : <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />}
                        <span className="font-bold text-[var(--text-primary)] text-xs sm:text-sm truncate">{b.name}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isArchived && <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-color)]">Archived</span>}
                        {isActive && !isArchived && <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-mono bg-[#00D6B2]/15 text-[#00D6B2] border border-[#00D6B2]/30">Active</span>}
                      </div>
                    </div>
                    {b.description && <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">{b.description}</p>}
                    <div className="text-[10px] sm:text-[11px] text-[var(--text-muted)] truncate">
                      {b.industry || 'General'} · {stats.projects} project{stats.projects === 1 ? '' : 's'} · {stats.channels} channel{stats.channels === 1 ? '' : 's'}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-[var(--border-color)] text-xs">
                    <span className="text-[10px] sm:text-[11px] text-[var(--text-secondary)] font-mono">{new Date(b.createdAt).toLocaleDateString()}</span>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditBrand(b); }}
                        className="text-[var(--text-muted)] hover:text-[#00D6B2] transition px-1.5 py-1 text-[10px] font-mono"
                        title="Edit brand"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleArchive(b); }}
                        className="text-[var(--text-muted)] hover:text-amber-400 transition px-1.5 py-1 text-[10px] font-mono"
                        title={isArchived ? 'Restore brand' : 'Archive brand'}
                      >
                        {isArchived ? 'Restore' : 'Archive'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); checkDelete(b); }}
                        className="text-[var(--text-muted)] hover:text-red-400 transition p-1 min-h-[30px] min-w-[30px] flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)]"
                        title="Delete brand"
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

      {/* Brand Overview — active brand detail */}
      {activeBrand && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl overflow-hidden">
          {/* Brand header */}
          <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-color)]">
            <div className="flex items-center gap-3 min-w-0">
              {activeBrand.logoUrl || activeBrand.avatarUrl ? (
                <img src={activeBrand.logoUrl || activeBrand.avatarUrl} alt="" className="w-12 h-12 rounded-xl object-cover border border-[var(--border-color)]" />
              ) : (
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black text-black" style={{ backgroundColor: activeBrand.color }}>{activeBrand.name[0]}</div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] truncate">{activeBrand.name}</h2>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${(activeBrand.status || 'active') === 'archived' ? 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-color)]' : 'bg-[#00D6B2]/15 text-[#00D6B2] border border-[#00D6B2]/30'}`}>{(activeBrand.status || 'active') === 'archived' ? 'Archived' : 'Active'}</span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] truncate">{activeBrand.industry || 'General'}{activeBrand.website ? ` · ${activeBrand.website}` : ''}</p>
                {activeBrand.description && <p className="text-[11px] text-[var(--text-muted)] line-clamp-1 mt-0.5">{activeBrand.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditBrand(activeBrand)} className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]">Brand Settings</button>
              <select value={activeBrandId || ''} onChange={(e) => setActiveBrandId(e.target.value)} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-secondary)]">
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          {/* Stat tiles — real counts */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-[var(--bg-surface-hover)]">
            {[
              ['Projects', brandProjects.length], ['Channels', brandAccounts.length],
              ['Videos', brandVideos.length], ['Posts', brandPosts.length], ['Campaigns', brandCampaigns.length],
            ].map(([label, val]) => (
              <div key={label as string} className="bg-[var(--bg-surface)] px-4 py-3">
                <div className="text-lg font-black text-[var(--text-primary)]">{val}</div>
                <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-4 pt-3 border-b border-[var(--border-color)] overflow-x-auto">
            {([['summary', 'Summary'], ['projects', 'Projects'], ['channels', 'Channels'], ['content', 'Content'], ['campaigns', 'Campaigns'], ['activity', 'Activity']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setOvTab(k)} className={`px-3 py-2 text-[11px] font-semibold whitespace-nowrap border-b-2 -mb-px transition ${ovTab === k ? 'border-[#00D6B2] text-[#00D6B2]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>{l}</button>
            ))}
          </div>

          <div className="p-4 sm:p-5">
            {ovTab === 'summary' && (
              <div className="grid sm:grid-cols-2 gap-3 text-[11px]">
                <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-1">
                  <p className="font-bold text-[var(--text-primary)] text-xs">Brand details</p>
                  {activeBrand.website && <p className="text-[var(--text-secondary)]">Website: <span className="text-[var(--text-primary)] font-mono">{activeBrand.website}</span></p>}
                  {activeBrand.timezone && <p className="text-[var(--text-secondary)]">Timezone: <span className="text-[var(--text-primary)] font-mono">{activeBrand.timezone}</span></p>}
                  {activeBrand.defaultLanguage && <p className="text-[var(--text-secondary)]">Language: <span className="text-[var(--text-primary)] font-mono uppercase">{activeBrand.defaultLanguage}</span></p>}
                  {activeBrand.brandGuidelines && <p className="text-[var(--text-secondary)]">Guidelines: <span className="text-[var(--text-primary)]">{activeBrand.brandGuidelines}</span></p>}
                  {!activeBrand.website && !activeBrand.timezone && !activeBrand.defaultLanguage && !activeBrand.brandGuidelines && <p className="text-[var(--text-muted)]">No extended details set — use Edit Brand.</p>}
                </div>
                <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-1">
                  <p className="font-bold text-[var(--text-primary)] text-xs">Activity snapshot</p>
                  <p className="text-[var(--text-secondary)]">Created: <span className="text-[var(--text-primary)] font-mono">{new Date(activeBrand.createdAt).toLocaleDateString()}</span></p>
                  {activeBrand.updatedAt && <p className="text-[var(--text-secondary)]">Updated: <span className="text-[var(--text-primary)] font-mono">{new Date(activeBrand.updatedAt).toLocaleDateString()}</span></p>}
                  <p className="text-[var(--text-secondary)]">{brandPosts.filter((p) => p.status === 'published').length} published posts · {brandPosts.filter((p) => p.status !== 'published').length} pending/scheduled</p>
                </div>
              </div>
            )}
            {ovTab === 'projects' && (
              <div className="space-y-1.5">
                {brandProjects.length === 0 ? <p className="text-[11px] text-[var(--text-muted)] py-4 text-center">No projects yet — create one below.</p> :
                  brandProjects.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[11px]">
                      <div><span className="text-[var(--text-primary)] font-semibold">{p.name}</span>{p.description && <span className="text-[var(--text-muted)] ms-2">{p.description}</span>}</div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-color)] uppercase">{p.status || 'planning'}</span>
                    </div>
                  ))}
              </div>
            )}
            {ovTab === 'channels' && (
              <div className="space-y-1.5">
                {brandAccounts.length === 0 ? <p className="text-[11px] text-[var(--text-muted)] py-4 text-center">No channels connected — use Connect Channel above.</p> :
                  brandAccounts.map((a) => (
                    <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[11px]">
                      <div className="flex items-center gap-2"><span className="text-[9px] font-mono uppercase text-[#00D6B2]">{a.platform}</span><span className="text-[var(--text-primary)] font-semibold">{a.accountName}</span><span className="text-[var(--text-muted)] font-mono">{a.handle}</span></div>
                      <span className={`text-[9px] font-mono ${a.tokenValid === false || a.requiresReconnection ? 'text-amber-400' : 'text-[#00D6B2]'}`}>{a.tokenValid === false || a.requiresReconnection ? 'attention' : 'connected'}</span>
                    </div>
                  ))}
              </div>
            )}
            {ovTab === 'content' && (
              <div className="space-y-1.5">
                {brandVideos.length === 0 ? <p className="text-[11px] text-[var(--text-muted)] py-4 text-center">No videos in this brand yet.</p> :
                  brandVideos.slice(0, 10).map((v) => (
                    <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[11px]">
                      <span className="text-[var(--text-primary)] font-semibold truncate">{v.title}</span>
                      <span className="text-[9px] font-mono text-[var(--text-muted)]">{Math.round(v.durationSeconds)}s</span>
                    </div>
                  ))}
                {brandVideos.length > 10 && <p className="text-[10px] text-[var(--text-muted)] text-center">+{brandVideos.length - 10} more in Video Library</p>}
              </div>
            )}
            {ovTab === 'campaigns' && (
              <div className="space-y-1.5">
                {brandCampaigns.length === 0 ? <p className="text-[11px] text-[var(--text-muted)] py-4 text-center">No campaigns for this brand.</p> :
                  brandCampaigns.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[11px]">
                      <span className="text-[var(--text-primary)] font-semibold">{c.name}</span>
                      <span className="text-[9px] font-mono text-[var(--text-secondary)]">{c.status || 'draft'}</span>
                    </div>
                  ))}
              </div>
            )}
            {ovTab === 'activity' && (
              <div className="space-y-1.5">
                {brandPosts.length === 0 ? <p className="text-[11px] text-[var(--text-muted)] py-4 text-center">No publishing activity for this brand yet.</p> :
                  [...brandPosts].sort((a, b) => (b.scheduledTime || '').localeCompare(a.scheduledTime || '')).slice(0, 10).map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[11px]">
                      <span className="text-[var(--text-primary)] font-semibold truncate">{p.title || p.videoId}</span>
                      <span className="text-[9px] font-mono text-[var(--text-secondary)]">{p.status} · {p.scheduledTime ? new Date(p.scheduledTime).toLocaleDateString() : '—'}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connected Accounts for Active Brand */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3 sm:pb-4">
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
              <Shield className="w-4 h-4 text-[#00D6B2]" />
              <span>Connected Social Media Channels</span>
            </h3>
            <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] mt-0.5">
              Authorized API connections with realistic status, rate limit monitoring, and retention permissions.
            </p>
          </div>

          <div className="flex items-center space-x-2 self-start">
            {setActiveTab && (
              <button
                onClick={() => setActiveTab('connections')}
                className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-[#00D6B2]/20 to-[#087F78]/20 hover:from-[#00D6B2]/30 hover:to-[#087F78]/30 text-[#ADF5E8] border border-[#00D6B2]/40 text-xs font-semibold transition flex items-center justify-center space-x-1.5 min-h-[36px]"
              >
                <Key className="w-3.5 h-3.5 text-[#00D6B2]" />
                <span>OAuth Connection Center</span>
              </button>
            )}
            <button
              onClick={() => setActiveTab?.('connections')}
              className="px-3.5 py-2 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-color)] text-xs font-semibold transition flex items-center justify-center space-x-1.5 min-h-[36px]"
            >
              <PlusCircle className="w-3.5 h-3.5 text-[#00D6B2]" />
              <span>Connect Channel</span>
            </button>
          </div>
        </div>

        {brandAccounts.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--text-secondary)]">
            No connected channels for this brand. Click "Connect Channel" to add YouTube, Instagram, TikTok, or Facebook.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 sm:gap-4">
            {brandAccounts.map((acc) => {
              const color = getPlatformColor(acc.platform);

              return (
                <div
                  key={acc.id}
                  className="p-4 sm:p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-3 sm:space-y-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span
                        className={`text-[10px] sm:text-xs font-mono font-bold px-2 py-0.5 rounded uppercase border flex-shrink-0 ${color.bg} ${color.text} ${color.border}`}
                      >
                        {acc.platform}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-[var(--text-primary)] text-xs sm:text-sm truncate">{acc.accountName}</div>
                        <div className="text-[11px] text-[var(--text-secondary)] font-mono truncate">{acc.handle}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <span className={`w-2 h-2 rounded-full ${acc.tokenValid === false || acc.requiresReconnection ? 'bg-amber-400' : 'bg-[#00D6B2]'}`} />
                      <span className={`text-[10px] sm:text-[11px] font-mono ${acc.tokenValid === false || acc.requiresReconnection ? 'text-amber-400' : 'text-[#00D6B2]'}`}>
                        {acc.tokenValid === false || acc.requiresReconnection ? 'Needs attention' : 'Connected'}
                      </span>
                    </div>
                  </div>

                  {/* API Permissions Matrix */}
                  <div className="p-3 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] space-y-2 text-xs">
                    <div className="text-[9px] sm:text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                      Authorized Permissions & Limits
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] sm:text-[11px]">
                      <div className="flex items-center space-x-1.5 text-[var(--text-secondary)]">
                        <CheckCircle2 className="w-3 h-3 text-[#00D6B2] flex-shrink-0" />
                        <span className="truncate">Publish Video</span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-[var(--text-secondary)]">
                        <CheckCircle2 className="w-3 h-3 text-[#00D6B2] flex-shrink-0" />
                        <span className="truncate">Read Analytics</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        {acc.apiPermissions.hasDetailedRetention ? (
                          <span className="text-[#00D6B2] flex items-center space-x-1 truncate">
                            <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">Detailed Retention</span>
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)] flex items-center space-x-1 truncate">
                            <span>✕ No 1s Curve</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-1.5">
                        {acc.apiPermissions.hasMilestoneData ? (
                          <span className="text-[#ADF5E8] flex items-center space-x-1 truncate">
                            <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">Milestones</span>
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)] flex items-center space-x-1 truncate">
                            <span>✕ No Milestones</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pt-1 flex flex-wrap items-center justify-between text-[10px] font-mono text-[var(--text-secondary)] gap-1 border-t border-[var(--border-color)]">
                      {acc.rateLimitRemaining != null && <span>Rate limit: {acc.rateLimitRemaining} remaining</span>}
                      <span>Token expires: {acc.tokenExpiresAt ? new Date(acc.tokenExpiresAt).toLocaleDateString() : 'unknown'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-[10px] sm:text-[11px] text-[var(--text-secondary)] italic truncate max-w-[200px]">{acc.statusMessage}</span>
                    <button
                      onClick={() => deleteAccount(acc.id)}
                      className="text-[var(--text-muted)] hover:text-red-400 p-1 min-h-[30px] min-w-[30px] flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)]"
                      title="Disconnect channel"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Projects within Brand */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 space-y-4">
        <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
          <Layers className="w-4 h-4 text-purple-400" />
          <span>Projects within Active Brand</span>
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          <input value={pSearch} onChange={(e) => setPSearch(e.target.value)} placeholder="Search projects…" className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] placeholder-slate-500 w-36 focus:outline-none focus:border-[#00D6B2]" />
          <select value={pStatusFilter} onChange={(e) => setPStatusFilter(e.target.value)} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-secondary)] focus:outline-none focus:border-[#00D6B2]">
            <option value="all">All statuses</option>
            {['planning', 'active', 'on_hold', 'completed', 'archived'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>

        <form onSubmit={handleCreateProject} className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Project Name (e.g. Q4 Sprint)"
            className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs sm:text-sm text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2]"
          />
          <input
            type="text"
            value={newProjectDesc}
            onChange={(e) => setNewProjectDesc(e.target.value)}
            placeholder="Objective or Description"
            className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs sm:text-sm text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2]"
          />
          <select value={projStatus} onChange={(e) => setProjStatus(e.target.value)} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2 py-2 text-[11px] text-[var(--text-secondary)] focus:outline-none focus:border-[#00D6B2]">
            {['planning', 'active', 'on_hold', 'completed', 'archived'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <input type="date" value={projStart} onChange={(e) => setProjStart(e.target.value)} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2 py-2 text-[11px] text-[var(--text-secondary)] focus:outline-none focus:border-[#00D6B2]" title="Start date" />
          <input type="date" value={projEnd} onChange={(e) => setProjEnd(e.target.value)} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2 py-2 text-[11px] text-[var(--text-secondary)] focus:outline-none focus:border-[#00D6B2]" title="End date" />
          <button
            type="submit"
            disabled={!newProjectName}
            className="px-4 py-2 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-color)] text-xs font-semibold transition disabled:opacity-40 whitespace-nowrap min-h-[38px]"
          >
            Create Project
          </button>
        </form>

        <div className="space-y-2 pt-1">
          {brandProjects.filter((p) => (pStatusFilter === 'all' || (p.status || 'planning') === pStatusFilter) && (!pSearch || p.name.toLowerCase().includes(pSearch.toLowerCase()) || (p.description || '').toLowerCase().includes(pSearch.toLowerCase()))).length === 0 ? (
            <div className="text-xs text-[var(--text-secondary)] py-3">{brandProjects.length === 0 ? 'No projects created for this brand yet.' : 'No projects match your filters.'}</div>
          ) : (
            brandProjects
              .filter((p) => (pStatusFilter === 'all' || (p.status || 'planning') === pStatusFilter) && (!pSearch || p.name.toLowerCase().includes(pSearch.toLowerCase()) || (p.description || '').toLowerCase().includes(pSearch.toLowerCase())))
              .map((proj) => (
              <div
                key={proj.id}
                className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center justify-between text-xs gap-2"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--text-primary)] truncate flex items-center gap-2">
                    {proj.name}
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-color)] uppercase">{proj.status || 'planning'}</span>
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] truncate">
                    {proj.description}
                    {(proj.startDate || proj.endDate) && <span className="font-mono text-[var(--text-muted)]"> · {proj.startDate || '…'} → {proj.endDate || '…'}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setEditProject(proj)} className="text-[var(--text-muted)] hover:text-[#00D6B2] px-1.5 py-1 text-[10px] font-mono">Edit</button>
                  <button
                    onClick={() => { updateProject(proj.id, { status: (proj.status === 'archived' ? 'planning' : 'archived') as any }); }}
                    className="text-[var(--text-muted)] hover:text-amber-400 px-1.5 py-1 text-[10px] font-mono"
                  >
                    {proj.status === 'archived' ? 'Restore' : 'Archive'}
                  </button>
                  <button
                    onClick={() => { if (confirm(`Delete project "${proj.name}"?`)) deleteProject(proj.id); }}
                    className="text-[var(--text-muted)] hover:text-red-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Edit Project Modal */}
      {editProject && (
        <div className="fixed inset-0 z-[115] bg-[var(--bg-overlay)] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-5 max-w-sm w-full space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Edit Project</h3>
              <button onClick={() => setEditProject(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X className="w-4 h-4" /></button>
            </div>
            <input type="text" defaultValue={editProject.name} id="ep-name" className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]" placeholder="Name" />
            <input type="text" defaultValue={editProject.description || ''} id="ep-desc" className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]" placeholder="Description" />
            <div className="grid grid-cols-3 gap-2">
              <select defaultValue={editProject.status || 'planning'} id="ep-status" className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2 py-2 text-[11px] text-[var(--text-secondary)]">
                {['planning', 'active', 'on_hold', 'completed', 'archived'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
              <input type="date" defaultValue={editProject.startDate || ''} id="ep-start" className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2 py-2 text-[11px] text-[var(--text-secondary)]" />
              <input type="date" defaultValue={editProject.endDate || ''} id="ep-end" className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2 py-2 text-[11px] text-[var(--text-secondary)]" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditProject(null)} className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface-hover)] text-[11px] text-[var(--text-secondary)]">Cancel</button>
              <button onClick={() => {
                const g = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement)?.value;
                updateProject(editProject.id, { name: g('ep-name'), description: g('ep-desc') || undefined, status: g('ep-status') as any, startDate: g('ep-start') || undefined, endDate: g('ep-end') || undefined });
                setEditProject(null);
              }} className="px-4 py-1.5 rounded-lg bg-[#00D6B2] text-black text-[11px] font-bold">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Safe Delete Brand Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[120] bg-[var(--bg-overlay)] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-5 max-w-sm w-full space-y-3">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Delete "{deleteTarget.name}"?</h3>
            {deleteLoading ? (
              <p className="text-[11px] text-[var(--text-secondary)]">Checking dependencies…</p>
            ) : deleteDeps?.error ? (
              <p className="text-[11px] text-red-300">{deleteDeps.error}</p>
            ) : deleteDeps ? (
              <div className="space-y-2">
                <p className="text-[11px] text-amber-300">This brand has dependent records:</p>
                <div className="space-y-1 text-[11px] font-mono">
                  {Object.entries(deleteDeps).map(([k, v]) => (
                    <div key={k} className="flex justify-between px-2.5 py-1.5 rounded bg-[var(--bg-input)] border border-[var(--border-color)]">
                      <span className="text-[var(--text-secondary)] capitalize">{k}</span><span className="text-amber-300">{String(v)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--text-muted)]">Recommended: archive the brand to preserve history. Force delete removes the brand record only — dependent content keeps its data but loses the brand link.</p>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => { setDeleteTarget(null); setDeleteDeps(null); }} className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface-hover)] text-[11px] text-[var(--text-secondary)]">Cancel</button>
                  <button onClick={() => { updateBrand(deleteTarget.id, { status: 'archived' }); setDeleteTarget(null); setDeleteDeps(null); }} className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-semibold">Archive instead</button>
                  <button onClick={forceDelete} disabled={deleteLoading} className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-[11px] font-semibold disabled:opacity-40">Delete anyway</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-[var(--text-secondary)]">No dependent records found. This action cannot be undone.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setDeleteTarget(null)} className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface-hover)] text-[11px] text-[var(--text-secondary)]">Cancel</button>
                  <button onClick={forceDelete} disabled={deleteLoading} className="px-3 py-1.5 rounded-lg bg-red-500 text-[var(--text-primary)] text-[11px] font-bold disabled:opacity-40">Delete Brand</button>
                </div>
              </div>
            )}
            {deleteDeps && !deleteDeps.error && deleteLoading === false && Object.keys(deleteDeps).length > 0 && !('suggestion' in deleteDeps) && null}
          </div>
        </div>
      )}

      {/* Edit Brand Modal */}
      <NewBrandModal isOpen={Boolean(editBrand)} onClose={() => setEditBrand(null)} brand={editBrand || undefined} />
    </div>
  );
};
