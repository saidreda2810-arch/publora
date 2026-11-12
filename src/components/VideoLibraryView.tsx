import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { usePublisher } from '../context/PublisherContext';
import { apiFetch } from '../lib/api';
import {
  Film, PlusCircle, HardDrive, Play, Trash2, Search, X, Star,
  Archive, ArchiveRestore, FolderPlus, Folder, CheckSquare, Square,
  LayoutGrid, List, Rows3, Download, Pencil, Tag, MoreHorizontal,
  CheckCircle2, Clock, CalendarDays, ChevronDown, AlertTriangle, Eye,
} from 'lucide-react';
import { VideoAsset, VideoFolder } from '../types';

type ViewMode = 'grid' | 'list' | 'compact';

const fmtBytes = (b?: number) =>
  b == null ? '—' : b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
const fmtDur = (s?: number) => (s == null ? '—' : s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : '—');

const STATUS_META: Record<string, { label: string; cls: string }> = {
  ready: { label: 'Ready', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  analyzed: { label: 'Analyzed', cls: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
  uploaded: { label: 'Processing', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
};

export const VideoLibraryView: React.FC<{ onOpenNewVideo: () => void; setActiveTab: (tab: string) => void }> = ({
  onOpenNewVideo,
  setActiveTab,
}) => {
  const {
    videos, brands, posts, analytics, videoFolders,
    updateVideo, updateVideos, deleteVideo,
    createVideoFolder, renameVideoFolder, deleteVideoFolder,
  } = usePublisher();

  /* ---------- persisted UI prefs ---------- */
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem('vl_view') as ViewMode) || 'grid'; } catch { return 'grid'; }
  });
  const setMode = (m: ViewMode) => {
    setViewMode(m);
    try { localStorage.setItem('vl_view', m); } catch {}
  };

  /* ---------- filters / search ---------- */
  const [query, setQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState<string>('all'); // all | unassigned | brandId
  const [folderFilter, setFolderFilter] = useState<string>('all'); // all | unfiled | folderId | fav | archived
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ratioFilter, setRatioFilter] = useState<string>('all');
  const [usageFilter, setUsageFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  /* ---------- selection / bulk ---------- */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /* ---------- detail panel ---------- */
  const [detailId, setDetailId] = useState<string | null>(null);

  /* ---------- dialogs ---------- */
  const [folderDialog, setFolderDialog] = useState<{ mode: 'create' | 'rename' | 'delete'; id?: string } | null>(null);
  const [folderName, setFolderName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<VideoAsset | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState<Record<string, string>>({});
  const [moveTarget, setMoveTarget] = useState<{ videoId: string } | null>(null);

  const detailVideo = videos.find((v) => v.id === detailId) || null;
  const detailPosts = detailVideo ? posts.filter((p) => p.videoId === detailVideo.id) : [];

  // Workspace storage policy (server-authoritative)
  const [storagePolicy, setStoragePolicy] = useState<any>(null);
  useEffect(() => {
    apiFetch('/api/media/policy').then((r) => r.json()).then((d) => {
      if (d.success) setStoragePolicy(d.policy);
    }).catch(() => {});
  }, [videos.length]);

  /* ---------- derived ---------- */
  const usedVideoIds = useMemo(() => new Set(posts.map((p) => p.videoId).filter(Boolean)), [posts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return videos.filter((v) => {
      // folder/fav/archived pseudo-filters
      if (folderFilter === 'archived' && !v.isArchived) return false;
      if (folderFilter !== 'archived' && folderFilter !== 'all' && v.isArchived) return false;
      if (folderFilter === 'fav' && !v.isFavorite) return false;
      if (folderFilter === 'unfiled' && v.folderId) return false;
      if (folderFilter !== 'all' && folderFilter !== 'fav' && folderFilter !== 'unfiled' && folderFilter !== 'archived' && v.folderId !== folderFilter) return false;

      if (brandFilter === 'unassigned' && v.brandId) return false;
      if (brandFilter !== 'all' && brandFilter !== 'unassigned' && v.brandId !== brandFilter) return false;

      const st = v.processingStatus || 'ready';
      if (statusFilter !== 'all') {
        if (statusFilter === 'archived' && !v.isArchived) return false;
        else if (statusFilter !== 'archived' && st !== statusFilter) return false;
      }
      if (ratioFilter !== 'all' && v.aspectRatio !== ratioFilter) return false;

      if (usageFilter !== 'all') {
        const used = usedVideoIds.has(v.id);
        const hasDraft = detailPostsSafe(posts, v.id).some((p) => p.status === 'draft');
        const hasSched = detailPostsSafe(posts, v.id).some((p) => p.status === 'scheduled');
        const hasPub = detailPostsSafe(posts, v.id).some((p) => p.status === 'published');
        if (usageFilter === 'never' && used) return false;
        if (usageFilter === 'draft' && !hasDraft) return false;
        if (usageFilter === 'scheduled' && !hasSched) return false;
        if (usageFilter === 'published' && !hasPub) return false;
      }

      if (q) {
        const hay = [v.title, v.fileName, v.description, v.format, v.resolution, brands.find((b) => b.id === v.brandId)?.name, ...(v.tags || [])]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, query, brandFilter, folderFilter, statusFilter, ratioFilter, usageFilter, brands, posts]);

  const stats = useMemo(() => {
    const totalBytes = videos.reduce((s, v) => s + (v.fileSizeBytes || 0), 0);
    return {
      total: videos.length,
      storage: totalBytes,
      processing: videos.filter((v) => ['uploaded', 'analyzing'].includes(v.processingStatus || '')).length,
      ready: videos.filter((v) => (v.processingStatus || 'ready') === 'ready' && !v.isArchived).length,
      inPosts: videos.filter((v) => usedVideoIds.has(v.id)).length,
    };
  }, [videos, usedVideoIds]);

  const activeFilterCount = [brandFilter !== 'all', folderFilter !== 'all', statusFilter !== 'all', ratioFilter !== 'all', usageFilter !== 'all', query.trim() !== ''].filter(Boolean).length;
  const clearFilters = () => { setQuery(''); setBrandFilter('all'); setFolderFilter('all'); setStatusFilter('all'); setRatioFilter('all'); setUsageFilter('all'); };

  /* ---------- actions ---------- */
  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allVisibleSelected = filtered.length > 0 && filtered.every((v) => selected.has(v.id));
  const toggleSelectAll = () => setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((v) => v.id)));

  const bulk = (fn: (v: VideoAsset) => Partial<VideoAsset>) => {
    updateVideos(Array.from(selected).map((id) => ({ id, updates: fn(videos.find((v) => v.id === id)!) })));
    setSelected(new Set());
  };

  const handleDelete = (v: VideoAsset) => {
    const linked = posts.filter((p) => p.videoId === v.id);
    const msg = linked.length > 0
      ? `"${v.title}" is used in ${linked.length} post(s). Deleting removes it from your library and those post drafts — published content on social platforms is NOT affected. Continue?`
      : `Delete "${v.title}" from your library? This cannot be undone.`;
    if (confirm(msg)) { deleteVideo(v.id); setDetailId(null); setDeleteTarget(null); }
  };

  const folderVideos = (fid: string | null) => videos.filter((v) => (v.folderId || null) === fid);
  const childFolders = (pid: string | null) => videoFolders.filter((f) => (f.parentId || null) === pid);

  /* ---------- render ---------- */
  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-8 py-6 space-y-5">
      {/* ===== Header + stats ===== */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-[var(--border-color)] pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)] tracking-tight">Video Library</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Manage, organize, and prepare your video content.</p>
        </div>
        <button
          type="button" onClick={onOpenNewVideo}
          className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-text)] font-semibold text-xs transition shadow-sm flex items-center gap-1.5 self-start"
        >
          <PlusCircle size={14} /> Add Video
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <StatCard label="Total videos" value={stats.total} icon={<Film size={14} />} />
        <StatCard label="Storage used" value={fmtBytes(stats.storage)} icon={<HardDrive size={14} />} />
        <StatCard label="Processing" value={stats.processing} icon={<Clock size={14} />} warn={stats.processing > 0} />
        <StatCard label="Ready" value={stats.ready} icon={<CheckCircle2 size={14} />} />
        <StatCard label="In posts" value={stats.inPosts} icon={<CalendarDays size={14} />} />
        <StatCard label="Folders" value={videoFolders.length} icon={<Folder size={14} />} />
      </div>

      {/* Storage quota bar */}
      {storagePolicy?.quotaBytes != null && storagePolicy.usedBytes != null && (
        <StorageBar used={storagePolicy.usedBytes} quota={storagePolicy.quotaBytes} />
      )}

      {/* ===== Toolbar ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, file, brand, tags…"
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg pl-9 pr-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <ViewToggle mode={viewMode} setMode={setMode} />
          <button type="button" onClick={() => setShowFilters(!showFilters)} className={`px-3 py-2 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${showFilters || activeFilterCount ? 'border-[var(--accent-primary)]/50 text-[var(--accent-primary)] bg-[var(--accent-subtle)]' : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
            <ChevronDown size={13} className={showFilters ? 'rotate-180 transition-transform' : 'transition-transform'} /> Filters{activeFilterCount > 0 && <span className="ml-0.5 px-1.5 rounded-full bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-[9px] font-bold">{activeFilterCount}</span>}
          </button>
          <button type="button" onClick={() => { setFolderDialog({ mode: 'create' }); setFolderName(''); }} className="px-3 py-2 rounded-lg border border-[var(--border-color)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition flex items-center gap-1.5">
            <FolderPlus size={13} /> Folder
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)]/60">
          <FilterSelect label="Brand" value={brandFilter} onChange={setBrandFilter} options={[
            ['all', 'All brands'], ['unassigned', 'Unassigned'], ...brands.map((b) => [b.id, b.name] as [string, string]),
          ]} />
          <FilterSelect label="Folder" value={folderFilter} onChange={setFolderFilter} options={[
            ['all', 'All videos'], ['fav', '★ Favorites'], ['unfiled', 'Unfiled'], ['archived', 'Archived'],
            ...videoFolders.map((f) => [f.id, f.name] as [string, string]),
          ]} />
          <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[
            ['all', 'Any status'], ['ready', 'Ready'], ['uploaded', 'Processing'], ['analyzed', 'Analyzed'], ['archived', 'Archived'],
          ]} />
          <FilterSelect label="Aspect" value={ratioFilter} onChange={setRatioFilter} options={[
            ['all', 'Any ratio'], ['9:16', '9:16 Vertical'], ['16:9', '16:9 Landscape'], ['1:1', '1:1 Square'], ['4:5', '4:5 Portrait'],
          ]} />
          <FilterSelect label="Usage" value={usageFilter} onChange={setUsageFilter} options={[
            ['all', 'Any usage'], ['never', 'Never used'], ['draft', 'In drafts'], ['scheduled', 'Scheduled'], ['published', 'Published'],
          ]} />
          <button type="button" onClick={clearFilters} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent-primary)] self-end pb-1.5 text-left">Clear all filters</button>
        </div>
      )}

      {/* ===== Bulk toolbar ===== */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl border border-[var(--accent-primary)]/40 bg-[var(--accent-subtle)]">
          <span className="text-[11px] font-bold text-[var(--accent-primary)] px-1">{selected.size} selected</span>
          <BulkBtn onClick={() => setMoveTarget({ videoId: '' })}>Move to folder</BulkBtn>
          <BulkBtn onClick={() => bulk(() => ({ isFavorite: true }))}>★ Favorite</BulkBtn>
          <BulkBtn onClick={() => bulk(() => ({ isFavorite: false }))}>Unfavorite</BulkBtn>
          <BulkBtn onClick={() => bulk((v) => ({ isArchived: !v.isArchived }))}>Archive / Restore</BulkBtn>
          <BulkBtn onClick={() => bulk((v) => ({ folderId: null }))}>Unfile</BulkBtn>
          <BulkBtn onClick={() => { if (confirm(`Delete ${selected.size} video(s)? Posts referencing them lose the asset link.`)) { Array.from(selected).forEach(deleteVideo); setSelected(new Set()); } }} danger>Delete</BulkBtn>
          <button type="button" onClick={() => setSelected(new Set())} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] ml-auto">Clear selection</button>
        </div>
      )}

      {/* ===== Folders + results ===== */}
      <div className="flex gap-5 items-start">
        {/* Folder sidebar */}
        <aside className="hidden md:block w-48 shrink-0 space-y-1 sticky top-20">
          <FolderRow label="All videos" count={videos.filter((v) => !v.isArchived).length} active={folderFilter === 'all'} onClick={() => setFolderFilter('all')} />
          <FolderRow label="★ Favorites" count={videos.filter((v) => v.isFavorite).length} active={folderFilter === 'fav'} onClick={() => setFolderFilter('fav')} />
          <FolderRow label="Unfiled" count={videos.filter((v) => !v.folderId && !v.isArchived).length} active={folderFilter === 'unfiled'} onClick={() => setFolderFilter('unfiled')} />
          <FolderRow label="Archived" count={videos.filter((v) => v.isArchived).length} active={folderFilter === 'archived'} onClick={() => setFolderFilter('archived')} />
          {videoFolders.length > 0 && <div className="pt-2 mt-2 border-t border-[var(--border-color)]" />}
          {videoFolders.map((f) => (
            <div key={f.id} className="group/f flex items-center">
              <FolderRow
                label={f.name}
                count={folderVideos(f.id).filter((v) => !v.isArchived).length}
                active={folderFilter === f.id}
                onClick={() => setFolderFilter(f.id)}
              />
              <button
                type="button" title="Folder options"
                onClick={() => setFolderDialog({ mode: 'rename', id: f.id })}
                className="opacity-0 group-hover/f:opacity-100 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              >
                <Pencil size={11} />
              </button>
            </div>
          ))}
        </aside>

        {/* Results */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-mono text-[var(--text-muted)]">
              {filtered.length} result{filtered.length === 1 ? '' : 's'}
              {activeFilterCount > 0 && ` · ${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active`}
            </p>
            {filtered.length > 0 && (
              <button type="button" onClick={toggleSelectAll} className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] flex items-center gap-1">
                {allVisibleSelected ? <CheckSquare size={13} /> : <Square size={13} />} {allVisibleSelected ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl">
              <Film size={32} className="text-[var(--text-muted)] mx-auto opacity-60 mb-3" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">{videos.length === 0 ? 'No videos yet' : 'No results'}</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-xs mx-auto">
                {videos.length === 0 ? 'Upload your first video to start building your library.' : 'Try clearing filters or a different search term.'}
              </p>
              {videos.length === 0 && (
                <button type="button" onClick={onOpenNewVideo} className="mt-4 px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-xs font-bold">Add Video</button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <VideoGrid videos={filtered} brands={brands} posts={posts} selected={selected} onToggleSelect={toggleSelect} onOpen={setDetailId} onMenu={setMenuFor} menuFor={menuFor} />
          ) : viewMode === 'list' ? (
            <VideoList videos={filtered} brands={brands} posts={posts} selected={selected} onToggleSelect={toggleSelect} onOpen={setDetailId} onMenu={setMenuFor} menuFor={menuFor} />
          ) : (
            <VideoCompact videos={filtered} brands={brands} posts={posts} selected={selected} onToggleSelect={toggleSelect} onOpen={setDetailId} onMenu={setMenuFor} menuFor={menuFor} />
          )}
        </div>
      </div>

      {/* ===== Detail side panel ===== */}
      {detailVideo && (
        <VideoDetail
          video={detailVideo}
          posts={detailPosts}
          brand={brands.find((b) => b.id === detailVideo.brandId)}
          folders={videoFolders}
          analytics={analytics.filter((a) => a.videoId === detailVideo.id)}
          onClose={() => setDetailId(null)}
          onUpdate={updateVideo}
          onDelete={() => handleDelete(detailVideo)}
          onCreatePost={() => { setActiveTab('dashboard'); setDetailId(null); }}
        />
      )}

      {/* ===== Move-to-folder dialog ===== */}
      {moveTarget && (
        <Modal onClose={() => setMoveTarget(null)} title="Move videos to folder">
          <div className="space-y-1.5">
            <FolderPick label="No folder (root)" active={false} onClick={() => { bulk(() => ({ folderId: null })); setMoveTarget(null); }} />
            {videoFolders.map((f) => (
              <FolderPick key={f.id} label={f.name} active={false} onClick={() => { bulk(() => ({ folderId: f.id })); setMoveTarget(null); }} />
            ))}
            {videoFolders.length === 0 && <p className="text-[11px] text-[var(--text-muted)] py-2">No folders yet — create one from the toolbar.</p>}
          </div>
        </Modal>
      )}

      {/* ===== Folder create/rename dialog ===== */}
      {folderDialog && (
        <Modal onClose={() => setFolderDialog(null)} title={folderDialog.mode === 'create' ? 'New folder' : 'Rename folder'}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!folderName.trim()) return;
              if (folderDialog.mode === 'create') createVideoFolder(folderName);
              else if (folderDialog.id) renameVideoFolder(folderDialog.id, folderName);
              if (folderDialog.mode === 'delete' && folderDialog.id) deleteVideoFolder(folderDialog.id);
              setFolderDialog(null);
            }}
            className="space-y-3"
          >
            {folderDialog.mode !== 'delete' && (
              <input
                autoFocus value={folderName} onChange={(e) => setFolderName(e.target.value)}
                placeholder="Folder name"
                className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            )}
            {folderDialog.mode === 'delete' && (
              <p className="text-xs text-[var(--text-secondary)]">Delete this folder? Videos inside move back to the root library. Nested folders are also removed.</p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFolderDialog(null)} className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">Cancel</button>
              <button type="submit" className={`px-3 py-1.5 rounded-lg text-xs font-bold ${folderDialog.mode === 'delete' ? 'bg-rose-500 text-[var(--text-primary)]' : 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)]'}`}>
                {folderDialog.mode === 'create' ? 'Create' : folderDialog.mode === 'rename' ? 'Rename' : 'Delete'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

/* ================= helpers ================= */

function detailPostsSafe(posts: any[], videoId: string) { return posts.filter((p) => p.videoId === videoId); }

function StorageBar({ used, quota }: { used: number; quota: number }) {
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const level = pct >= 100 ? 'critical' : pct >= 95 ? 'critical' : pct >= 85 ? 'warn' : pct >= 70 ? 'notice' : 'ok';
  const colors = { ok: 'bg-[var(--accent-primary)]', notice: 'bg-amber-400', warn: 'bg-orange-500', critical: 'bg-rose-500' };
  const msgs = {
    notice: 'Storage usage notice — approaching workspace limit.',
    warn: 'Storage getting full — consider archiving or removing unused videos.',
    critical: 'Critical: storage quota reached — new uploads will be blocked.',
  };
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl px-4 py-3">
      <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
        <span className="text-[var(--text-secondary)]">Workspace storage</span>
        <span className={level === 'ok' ? 'text-[var(--text-muted)]' : level === 'notice' ? 'text-amber-400' : 'text-rose-400'}>
          {fmtBytes(used)} / {fmtBytes(quota)} · {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--bg-main)] overflow-hidden">
        <div className={`h-full ${colors[level]} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {level !== 'ok' && <p className="text-[10px] mt-1.5" style={{ color: level === 'notice' ? '#fbbf24' : '#fb7185' }}>{msgs[level as keyof typeof msgs]}</p>}
    </div>
  );
}

const StatCard: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; warn?: boolean }> = ({ label, value, icon, warn }) => (
  <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl px-3.5 py-3">
    <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">{icon}{label}</div>
    <div className={`text-lg font-bold mt-1 ${warn ? 'text-amber-400' : 'text-[var(--text-primary)]'}`}>{value}</div>
  </div>
);

const ViewToggle: React.FC<{ mode: ViewMode; setMode: (m: ViewMode) => void }> = ({ mode, setMode }) => (
  <div className="flex items-center border border-[var(--border-color)] rounded-lg overflow-hidden bg-[var(--bg-surface)]">
    {([['grid', LayoutGrid, 'Grid'], ['list', List, 'List'], ['compact', Rows3, 'Compact']] as const).map(([m, Icon, label]) => (
      <button key={m} type="button" title={label} onClick={() => setMode(m)} className={`p-2 transition ${mode === m ? 'bg-[var(--accent-subtle)] text-[var(--accent-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
        <Icon size={14} />
      </button>
    ))}
  </div>
);

const FilterSelect: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: [string, string][] }> = ({ label, value, onChange, options }) => (
  <label className="block">
    <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-0.5 w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-md px-2 py-1.5 text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]">
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  </label>
);

const BulkBtn: React.FC<{ onClick: () => void; children: React.ReactNode; danger?: boolean }> = ({ onClick, children, danger }) => (
  <button type="button" onClick={onClick} className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition ${danger ? 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10' : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'}`}>{children}</button>
);

const FolderRow: React.FC<{ label: string; count: number; active: boolean; onClick: () => void }> = ({ label, count, active, onClick }) => (
  <button type="button" onClick={onClick} className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] transition ${active ? 'bg-[var(--accent-subtle)] text-[var(--accent-primary)] font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'}`}>
    <span className="truncate">{label}</span>
    <span className="text-[9px] font-mono text-[var(--text-muted)] ml-2">{count}</span>
  </button>
);

const FolderPick: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, onClick }) => (
  <button type="button" onClick={onClick} className="w-full text-left px-3 py-2 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition">{label}</button>
);

const Modal: React.FC<{ onClose: () => void; title: string; children: React.ReactNode }> = ({ onClose, title, children }) => (
  <div className="fixed inset-0 z-[115] bg-[var(--bg-overlay)] backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl max-w-sm w-full p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
        <button type="button" onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={15} /></button>
      </div>
      {children}
    </div>
  </div>
);

/* ---------- shared row bits ---------- */

function Thumb({ v, h = 'h-36' }: { v: VideoAsset; h?: string }) {
  return (
    <div className={`${h} bg-[var(--bg-main)] relative overflow-hidden flex items-center justify-center`}>
      {v.thumbnailUrl ? (
        <img src={v.thumbnailUrl} alt={v.title} loading="lazy" className="w-full h-full object-cover" />
      ) : v.fileUrl || v.videoUrl ? (
        <video src={v.fileUrl || v.videoUrl} muted preload="metadata" className="w-full h-full object-cover" />
      ) : (
        <Film size={24} className="text-[var(--text-muted)]" />
      )}
      {v.isArchived && <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[9px] font-mono text-[var(--text-secondary)] uppercase">Archived</span>}
      {v.isFavorite && <Star size={12} className="absolute top-2 right-2 text-amber-400 fill-amber-400" />}
      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-[var(--bg-input)] font-mono text-[10px] text-[var(--text-primary)]">{fmtDur(v.durationSeconds)} · {v.aspectRatio || '—'}</span>
    </div>
  );
}

function MetaLine({ v, brands }: { v: VideoAsset; brands: any[] }) {
  const brand = brands.find((b) => b.id === v.brandId);
  const st = STATUS_META[v.processingStatus || 'ready'] || STATUS_META.ready;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono text-[var(--text-muted)]">
      {brand && <span className="text-[var(--text-secondary)]">{brand.name}</span>}
      {v.resolution && <span>{v.resolution}</span>}
      {v.fileSizeBytes != null && <span>{fmtBytes(v.fileSizeBytes)}</span>}
      <span className={`px-1.5 py-0.5 rounded border ${st.cls}`}>{v.isArchived ? 'Archived' : st.label}</span>
      <span>{fmtDate(v.createdAt)}</span>
    </div>
  );
}

function CardMenu({ v, onAction }: { v: VideoAsset; onAction: (action: string, v: VideoAsset) => void }) {
  const [open, setOpen] = React.useState(false);
  const items: [string, string][] = [
    ['preview', 'Preview'], ['edit', 'Edit details'], ['rename', 'Rename'],
    ['brand', 'Change brand'], ['folder', 'Move to folder'], ['tags', 'Manage tags'],
    ['favorite', v.isFavorite ? 'Remove favorite' : 'Add to favorites'],
    ['post', 'Create post'], ['download', 'Download'],
    ['archive', v.isArchived ? 'Restore' : 'Archive'], ['delete', 'Delete'],
  ];
  return (
    <div className="relative">
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(!open); }} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition" aria-label="Actions">
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-xl py-1 text-[11px]">
            {items.map(([a, l]) => (
              <button key={a} type="button" onClick={(e) => { e.stopPropagation(); setOpen(false); onAction(a, v); }} className={`w-full text-left px-3 py-1.5 hover:bg-[var(--bg-surface-hover)] ${a === 'delete' ? 'text-rose-400' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                {l}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- view modes ---------- */

function VideoGrid({ videos, brands, posts, selected, onToggleSelect, onOpen, onMenu, menuFor }: any) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {videos.map((v: VideoAsset) => (
        <div key={v.id} className={`bg-[var(--bg-surface)] border rounded-xl overflow-hidden group transition cursor-pointer ${selected.has(v.id) ? 'border-[var(--accent-primary)]' : 'border-[var(--border-color)] hover:border-[var(--text-muted)]'}`} onClick={() => onOpen(v.id)}>
          <div className="relative">
            <Thumb v={v} />
            <div className="absolute top-2 left-2" onClick={(e) => e.stopPropagation()}>
              <SelectBox checked={selected.has(v.id)} onToggle={() => onToggleSelect(v.id)} />
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition" onClick={(e) => e.stopPropagation()}>
              <CardMenu v={v} onAction={(a, vid) => onMenu(a, vid)} />
            </div>
          </div>
          <div className="p-3 space-y-1.5">
            <h3 className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1">{v.title}</h3>
            <MetaLine v={v} brands={brands} />
          </div>
        </div>
      ))}
    </div>
  );
}

function VideoList({ videos, brands, posts, selected, onToggleSelect, onOpen, onMenu, menuFor }: any) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border-color)] text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
            <th className="w-8 px-3 py-2.5" />
            <th className="text-left px-2 py-2.5">Video</th>
            <th className="text-left px-2 py-2.5 hidden sm:table-cell">Brand</th>
            <th className="text-left px-2 py-2.5">Duration</th>
            <th className="text-left px-2 py-2.5 hidden md:table-cell">Resolution</th>
            <th className="text-left px-2 py-2.5 hidden lg:table-cell">Ratio</th>
            <th className="text-left px-2 py-2.5 hidden lg:table-cell">Size</th>
            <th className="text-left px-2 py-2.5">Status</th>
            <th className="text-left px-2 py-2.5 hidden md:table-cell">Uploaded</th>
            <th className="w-10 px-2 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {videos.map((v: VideoAsset) => {
            const brand = brands.find((b: any) => b.id === v.brandId);
            const st = STATUS_META[v.processingStatus || 'ready'] || STATUS_META.ready;
            return (
              <tr key={v.id} onClick={() => onOpen(v.id)} className={`border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-surface-hover)]/50 cursor-pointer ${selected.has(v.id) ? 'bg-[var(--accent-subtle)]/40' : ''}`}>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}><SelectBox checked={selected.has(v.id)} onToggle={() => onToggleSelect(v.id)} /></td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-14 h-9 rounded-md overflow-hidden bg-[var(--bg-main)] shrink-0 relative">
                      {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Film size={12} className="text-[var(--text-muted)]" /></div>}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--text-primary)] truncate max-w-[200px]">{v.title}</p>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">{v.fileName || v.format || ''}</p>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2 hidden sm:table-cell text-[var(--text-secondary)] truncate max-w-[110px]">{brand?.name || '—'}</td>
                <td className="px-2 py-2 font-mono text-[var(--text-secondary)]">{fmtDur(v.durationSeconds)}</td>
                <td className="px-2 py-2 font-mono text-[var(--text-secondary)] hidden md:table-cell">{v.resolution || '—'}</td>
                <td className="px-2 py-2 font-mono text-[var(--text-secondary)] hidden lg:table-cell">{v.aspectRatio || '—'}</td>
                <td className="px-2 py-2 font-mono text-[var(--text-secondary)] hidden lg:table-cell">{fmtBytes(v.fileSizeBytes)}</td>
                <td className="px-2 py-2"><span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono ${v.isArchived ? 'text-[var(--text-secondary)] bg-slate-500/10 border-slate-500/30' : st.cls}`}>{v.isArchived ? 'Archived' : st.label}</span></td>
                <td className="px-2 py-2 text-[var(--text-muted)] hidden md:table-cell">{fmtDate(v.createdAt)}</td>
                <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}><CardMenu v={v} onAction={(a, vid) => onMenu(a, vid)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VideoCompact({ videos, brands, posts, selected, onToggleSelect, onOpen, onMenu, menuFor }: any) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl divide-y divide-[var(--border-subtle)]">
      {videos.map((v: VideoAsset) => {
        const brand = brands.find((b: any) => b.id === v.brandId);
        return (
          <div key={v.id} onClick={() => onOpen(v.id)} className={`flex items-center gap-3 px-3 py-2 hover:bg-[var(--bg-surface-hover)]/50 cursor-pointer ${selected.has(v.id) ? 'bg-[var(--accent-subtle)]/40' : ''}`}>
            <div onClick={(e) => e.stopPropagation()}><SelectBox checked={selected.has(v.id)} onToggle={() => onToggleSelect(v.id)} /></div>
            <div className="w-16 h-9 rounded overflow-hidden bg-[var(--bg-main)] shrink-0">
              {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Film size={12} className="text-[var(--text-muted)]" /></div>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[var(--text-primary)] truncate">{v.title}{v.isFavorite && <Star size={10} className="inline ml-1 text-amber-400 fill-amber-400" />}</p>
              <p className="text-[10px] font-mono text-[var(--text-muted)] truncate">{brand?.name || 'No brand'} · {fmtDur(v.durationSeconds)} · {v.aspectRatio || '—'} · {fmtBytes(v.fileSizeBytes)}</p>
            </div>
            <span className="text-[9px] font-mono text-[var(--text-muted)] hidden sm:block">{fmtDate(v.createdAt)}</span>
            <div onClick={(e) => e.stopPropagation()}><CardMenu v={v} onAction={(a, vid) => onMenu(a, vid)} /></div>
          </div>
        );
      })}
    </div>
  );
}

const SelectBox: React.FC<{ checked: boolean; onToggle: () => void }> = ({ checked, onToggle }) => (
  <button type="button" onClick={onToggle} className={`p-0.5 rounded transition ${checked ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
    {checked ? <CheckSquare size={14} /> : <Square size={14} />}
  </button>
);

/* ---------- detail side panel ---------- */

function VideoDetail({ video: v, posts, brand, folders, analytics, onClose, onUpdate, onDelete, onCreatePost }: any) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: v.title, description: v.description || '', tags: (v.tags || []).join(', ') });
  React.useEffect(() => { setForm({ title: v.title, description: v.description || '', tags: (v.tags || []).join(', ') }); setEditing(false); }, [v.id]);

  const saveEdit = () => {
    onUpdate(v.id, {
      title: form.title.trim() || v.title,
      description: form.description,
      tags: form.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
    });
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-[105] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-[var(--bg-input)] backdrop-blur-sm" />
      <div className="relative w-full max-w-md h-full bg-[var(--bg-surface)] border-l border-[var(--border-color)] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[var(--bg-surface)] border-b border-[var(--border-color)] px-5 py-4 flex items-center justify-between z-10">
          <h3 className="text-sm font-bold text-[var(--text-primary)] truncate pr-3">{v.title}</h3>
          <button type="button" onClick={onClose} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* preview */}
          <div className="rounded-xl overflow-hidden bg-black">
            {v.fileUrl || v.videoUrl ? (
              <video src={v.fileUrl || v.videoUrl} controls preload="metadata" className="w-full max-h-64 object-contain" />
            ) : v.thumbnailUrl ? (
              <img src={v.thumbnailUrl} alt={v.title} className="w-full max-h-64 object-cover" />
            ) : (
              <div className="h-40 flex items-center justify-center"><Film size={32} className="text-[var(--text-muted)]" /></div>
            )}
          </div>

          {/* actions row */}
          <div className="flex flex-wrap gap-1.5">
            <PanelBtn onClick={() => onUpdate(v.id, { isFavorite: !v.isFavorite })}>{v.isFavorite ? '★ Favorited' : '☆ Favorite'}</PanelBtn>
            <PanelBtn onClick={() => onUpdate(v.id, { isArchived: !v.isArchived })}>{v.isArchived ? <><ArchiveRestore size={11} className="inline mr-1" />Restore</> : <><Archive size={11} className="inline mr-1" />Archive</>}</PanelBtn>
            <PanelBtn onClick={onCreatePost}><Play size={11} className="inline mr-1" />Create post</PanelBtn>
            {(v.fileUrl || v.videoUrl) && (
              <PanelBtn onClick={() => { const a = document.createElement('a'); a.href = v.fileUrl || v.videoUrl!; a.download = v.fileName || v.title; a.click(); }}><Download size={11} className="inline mr-1" />Download</PanelBtn>
            )}
            <PanelBtn onClick={onDelete} danger><Trash2 size={11} className="inline mr-1" />Delete</PanelBtn>
          </div>

          {/* editable info */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Details</h4>
              {!editing ? (
                <button type="button" onClick={() => setEditing(true)} className="text-[11px] text-[var(--accent-primary)] hover:underline flex items-center gap-1"><Pencil size={10} /> Edit</button>
              ) : (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing(false)} className="text-[11px] text-[var(--text-muted)]">Cancel</button>
                  <button type="button" onClick={saveEdit} className="text-[11px] font-bold text-[var(--accent-primary)]">Save</button>
                </div>
              )}
            </div>
            {editing ? (
              <div className="space-y-2">
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]" />
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg p-2 text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]" />
                <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Tags, comma separated" className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]" />
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-[var(--text-primary)]">{v.description || <span className="text-[var(--text-muted)] italic">No description</span>}</p>
                {(v.tags || []).length > 0 && <div className="flex flex-wrap gap-1">{(v.tags || []).map((t: string) => <span key={t} className="px-1.5 py-0.5 rounded bg-[var(--bg-main)] border border-[var(--border-color)] text-[9px] font-mono text-[var(--text-secondary)]">{t}</span>)}</div>}
              </div>
            )}
          </section>

          {/* metadata */}
          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Media info</h4>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/40 px-3 py-1">
              {meta('Duration', fmtDur(v.durationSeconds))}
              {meta('Resolution', v.resolution)}
              {meta('Aspect ratio', v.aspectRatio)}
              {meta('Frame rate', v.fps ? `${v.fps} fps` : null)}
              {meta('Codec', v.codec)}
              {meta('Audio', v.hasAudio == null ? null : v.hasAudio ? 'Yes' : 'No')}
              {meta('Orientation', v.orientation)}
              {meta('Format', v.format ? v.format.toUpperCase() : null)}
              {meta('File size', v.fileSizeBytes != null ? fmtBytes(v.fileSizeBytes) : null)}
              {meta('File name', v.fileName)}
              {meta('Brand', brand?.name)}
              {meta('Folder', folders.find((f: VideoFolder) => f.id === v.folderId)?.name)}
              {meta('Uploaded', fmtDate(v.createdAt))}
              {meta('Last modified', fmtDate(v.updatedAt || v.createdAt))}
              {meta('Status', v.isArchived ? 'Archived' : (STATUS_META[v.processingStatus || 'ready']?.label || 'Ready'))}
            </div>
          </section>

          {/* usage history */}
          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Usage ({posts.length})</h4>
            {posts.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)]">Not used in any posts yet.</p>
            ) : (
              <div className="space-y-1.5">
                {posts.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-main)]/40 border border-[var(--border-color)]">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-[var(--text-primary)] truncate">{p.title || 'Untitled post'}</p>
                      <p className="text-[9px] font-mono text-[var(--text-muted)] uppercase">{p.status} · {p.scheduledFor ? new Date(p.scheduledFor).toLocaleDateString() : '—'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

const PanelBtn: React.FC<{ onClick: () => void; children: React.ReactNode; danger?: boolean }> = ({ onClick, children, danger }) => (
  <button type="button" onClick={onClick} className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold transition ${danger ? 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10' : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'}`}>{children}</button>
);

function meta(label: string, value: React.ReactNode) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--border-subtle)] last:border-0">
      <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
      <span className="text-[10px] font-medium text-[var(--text-primary)] font-mono text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}
