import React, { useState, useEffect, useRef } from 'react';
import { usePublisher } from '../context/PublisherContext';
import { apiFetch } from '../lib/api';
import {
  listDriveFiles,
  createDriveFolder,
  uploadFileToDrive,
  deleteDriveFile,
  DriveFileItem,
} from '../utils/googleDriveService';
import {
  HardDrive,
  Folder,
  Film,
  FileVideo,
  Upload,
  FolderPlus,
  Trash2,
  ExternalLink,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Home,
  Clock,
  Layers,
  ArrowRight,
  ShieldCheck,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';

interface BreadcrumbItem {
  id: string;
  name: string;
}

export const GoogleDriveView: React.FC<{
  setActiveTab?: (tab: string) => void;
  onOpenNewPost?: () => void;
}> = ({ setActiveTab }) => {
  const { createVideo, activeBrandId } = usePublisher();

  // Backend connection state (server-side OAuth — tokens never reach the browser)
  const [connections, setConnections] = useState<any[]>([]);
  const [conn, setConn] = useState<any>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const token = null; // legacy client token — no longer used; browsing moves server-side in Phase 3

  // File browser state
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: 'root', name: 'My Drive' },
  ]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVideosOnly, setFilterVideosOnly] = useState(true);

  // Watch folder designation
  const [watchFolderId, setWatchFolderId] = useState<string>('root');
  const [watchNotification, setWatchNotification] = useState<string | null>(null);

  // Import notifications
  const [importedFileId, setImportedFileId] = useState<string | null>(null);

  // Real import pipeline state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [importBrandId, setImportBrandId] = useState('');
  const [importProjectId, setImportProjectId] = useState('');
  const [jobs, setJobs] = useState<any[]>([]);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const { brands, projects } = usePublisher();

  // Destructive delete confirmation modal (MANDATORY per workspace integration rules)
  const [fileToDelete, setFileToDelete] = useState<DriveFileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // New folder modal
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Upload modal
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load backend Drive connections + OAuth callback result
  const loadConnections = async () => {
    try {
      const res = await apiFetch('/api/drive/connections');
      const d = await res.json();
      if (d.success) {
        setConnections(d.connections || []);
        setConn(d.connections?.[0] || null);
      }
    } catch { /* leave empty */ }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === '1') { setNotice('Google Drive connected successfully.'); loadConnections(); }
    if (params.get('error')) setAuthError(params.get('error'));
    loadConnections();
  }, []);

  // Fetch files via server-side proxy (token never leaves the server)
  const fetchFiles = async (folderId = currentFolderId, append = false) => {
    setIsLoadingFiles(true);
    try {
      const params = new URLSearchParams({ folderId, videosOnly: String(filterVideosOnly), pageSize: '50' });
      if (searchQuery) params.set('q', searchQuery);
      const res = await apiFetch(`/api/drive/files?${params}`);
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to list files');
      setFiles((prev) => (append ? [...prev, ...(d.files || [])] : (d.files || [])));
      setNextPageToken(d.nextPageToken || null);
    } catch (err: any) {
      setAuthError(err.message || 'Failed to load Drive files');
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (conn) {
      fetchFiles(currentFolderId);
    }
  }, [conn, currentFolderId, filterVideosOnly]);

  const handleConnect = async () => {
    setConnectLoading(true); setAuthError(null);
    try {
      const res = await apiFetch('/api/drive/authorize-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Could not start authorization');
      window.location.href = d.url;
    } catch (e: any) { setAuthError(e.message); setConnectLoading(false); }
  };

  const handleDisconnect = async () => {
    if (!conn) return;
    if (!confirm(`Disconnect ${conn.email}? Imported videos are preserved; Drive access is revoked.`)) return;
    try {
      const res = await apiFetch(`/api/drive/connections/${conn.id}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) { setConn(null); setConnections([]); setFiles([]); }
      else setAuthError(d.error || 'Disconnect failed');
    } catch { setAuthError('Disconnect request failed'); }
  };

  const handleNavigateFolder = (folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setBreadcrumbs((prev) => [...prev, { id: folderId, name: folderName }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    const target = breadcrumbs[index];
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    setCurrentFolderId(target.id);
  };

  // ---- Real import pipeline (server-side) ----
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const loadJobs = async () => {
    try {
      const res = await apiFetch('/api/drive/imports');
      const d = await res.json();
      if (d.success) setJobs(d.jobs || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadJobs();
    const t = setInterval(loadJobs, 4000);
    return () => clearInterval(t);
  }, []);

  const openImport = () => {
    if (selectedIds.size === 0) return;
    setImportBrandId(activeBrandId || brands[0]?.id || '');
    setImportProjectId('');
    setImportOpen(true);
  };

  const startImport = async () => {
    if (!importBrandId) { setImportNotice('Select a brand first.'); return; }
    const fileIds = Array.from(selectedIds);
    try {
      const res = await apiFetch('/api/drive/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds, brandId: importBrandId, projectId: importProjectId || undefined, destination: 'library' }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Import failed to start');
      setImportOpen(false);
      setSelectedIds(new Set());
      setImportNotice(`${d.jobs.length} import(s) started${d.rejected?.length ? `, ${d.rejected.length} rejected` : ''}`);
      loadJobs();
    } catch (e: any) { setImportNotice(e.message); }
  };

  const retryJob = async (id: string) => {
    try { await apiFetch(`/api/drive/imports/${id}/retry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); loadJobs(); } catch {}
  };

  const selectedFiles = files.filter((f) => selectedIds.has(f.id));
  const selectedBytes = selectedFiles.reduce((a, f) => a + Number(f.size || 0), 0);
  const activeJobs = jobs.filter((j) => ['queued', 'downloading', 'verifying', 'extracting'].includes(j.status));

  const executeDelete = async () => {
    if (!fileToDelete || !token) return;
    setIsDeleting(true);
    try {
      await deleteDriveFile(token, fileToDelete.id);
      setFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id));
      setFileToDelete(null);
    } catch (err: any) {
      alert(`Deletion failed: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !token) return;
    setIsCreatingFolder(true);
    try {
      const newFolder = await createDriveFolder(token, newFolderName.trim(), currentFolderId);
      setFiles((prev) => [newFolder, ...prev]);
      setIsNewFolderOpen(false);
      setNewFolderName('');
    } catch (err: any) {
      alert(`Failed to create folder: ${err.message}`);
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !token) return;
    setIsUploading(true);
    try {
      const uploaded = await uploadFileToDrive(token, uploadFile, currentFolderId);
      setFiles((prev) => [uploaded, ...prev]);
      setIsUploadOpen(false);
      setUploadFile(null);
    } catch (err: any) {
      alert(`Failed to upload to Google Drive: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDesignateWatchFolder = () => {
    setWatchFolderId(currentFolderId);
    const activeName = breadcrumbs[breadcrumbs.length - 1]?.name || 'My Drive';
    setWatchNotification(`Designated "${activeName}" as automated Watch Folder for autonomous ingestion.`);
    setTimeout(() => setWatchNotification(null), 4000);
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-6">
        <div>
          <div className="text-xs font-mono text-[var(--text-muted)] flex items-center gap-2 mb-1">
            <span>PUBLORA</span>
            <span aria-hidden="true">Â·</span>
            <span>Google Workspace Drive</span>
            <span aria-hidden="true">Â·</span>
            <span>{conn ? 'Connected' : 'Authorization Required'}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)] tracking-tight">
            Google Drive Video Ingestion
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 max-w-2xl">
            Browse and import raw video assets directly from Google Drive into your publishing library or AI Studio.
          </p>
        </div>

        {/* Account status */}
        <div className="flex items-center gap-2.5">
          {conn ? (
            <div className="flex items-center gap-2.5 bg-[var(--bg-surface)] border border-[var(--border-color)] p-1.5 px-3 rounded-lg text-xs">
              {conn.avatarUrl ? (
                <img src={conn.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-[var(--accent-subtle)] border border-[var(--border-color)] flex items-center justify-center font-mono font-bold text-[10px] text-[var(--accent-primary)]">
                  {(conn.email || '?')[0].toUpperCase()}
                </div>
              )}
              <span className="font-mono text-[var(--text-secondary)] truncate max-w-[160px]">
                {conn.email}
              </span>
              <button
                type="button"
                onClick={handleDisconnect}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] underline ms-1"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={connectLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-text)] font-semibold text-xs transition shadow-sm disabled:opacity-60"
            >
              <HardDrive size={14} />
              <span>{connectLoading ? 'Connecting...' : 'Connect Google Drive'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {notice && (
        <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-[var(--status-success)]" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={14} />
          </button>
        </div>
      )}

      {watchNotification && (
        <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-[var(--status-success)]" />
            <span>{watchNotification}</span>
          </div>
          <button onClick={() => setWatchNotification(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={14} />
          </button>
        </div>
      )}

      {authError && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle size={15} className="text-rose-400 flex-shrink-0" />
          <span>{authError}</span>
        </div>
      )}

      {/* When Not Connected */}
      {!conn ? (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-8 sm:p-12 text-center space-y-5 max-w-xl mx-auto my-6">
          <div className="w-12 h-12 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] flex items-center justify-center mx-auto text-[var(--accent-primary)]">
            <HardDrive size={22} />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Connect Google Drive</h2>
            <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
              Securely connect your Google account to browse and import video files into PUBLORA.
            </p>
          </div>
          <div className="text-start max-w-sm mx-auto space-y-1.5 text-[11px] text-[var(--text-secondary)] bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg p-3">
            <p className="font-semibold text-[var(--text-primary)]">Permissions requested:</p>
            <p>• <strong>View your Google Drive files</strong> (read-only) — to list and download videos you select for import.</p>
            <p>• Publora never edits or deletes files in your Drive.</p>
            <p>• Access tokens are encrypted and stored server-side; you can disconnect anytime.</p>
          </div>

          <button
            type="button"
            onClick={handleConnect}
            disabled={connectLoading}
            className="inline-flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-text)] font-semibold text-xs transition shadow-sm disabled:opacity-60"
          >
            <HardDrive size={14} />
            <span>{connectLoading ? 'Connecting...' : 'Connect Google Drive'}</span>
          </button>
        </div>
      ) : (
        /* Connection dashboard + file browser */
        <div className="space-y-4">
          {/* Connection card */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 min-w-0">
              {conn.avatarUrl ? <img src={conn.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" /> : <div className="w-9 h-9 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center font-bold text-[var(--accent-primary)]">{(conn.email || '?')[0].toUpperCase()}</div>}
              <div className="min-w-0">
                <p className="font-semibold text-[var(--text-primary)] truncate">{conn.displayName || conn.email}</p>
                <p className="text-[10px] font-mono text-[var(--text-muted)]">{conn.email} · {conn.status} · connected {new Date(conn.connectedAt).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleConnect} disabled={connectLoading} className="px-3 py-1.5 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Reconnect</button>
              <button onClick={handleDisconnect} className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20">Disconnect</button>
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Secure server-side connection active. Drive file browsing via the secure proxy is enabled in the next phase.</p>
        /* Authenticated File Browser */
          {/* Controls toolbar */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
            {/* Breadcrumb Path */}
            <div className="flex items-center space-x-1 overflow-x-auto py-1 scrollbar-none">
              <button
                type="button"
                onClick={() => handleBreadcrumbClick(0)}
                className="flex items-center space-x-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition px-1.5 py-0.5 rounded"
              >
                <Home size={13} />
                <span className="font-medium">My Drive</span>
              </button>

              {breadcrumbs.slice(1).map((b, idx) => (
                <React.Fragment key={b.id}>
                  <ChevronRight size={12} className="text-[var(--text-muted)] flex-shrink-0" />
                  <button
                    type="button"
                    onClick={() => handleBreadcrumbClick(idx + 1)}
                    className="text-[var(--text-primary)] hover:underline truncate max-w-[120px] px-1 py-0.5"
                  >
                    {b.name}
                  </button>
                </React.Fragment>
              ))}

              {currentFolderId === watchFolderId && (
                <span className="ms-2 px-1.5 py-0.2 rounded font-mono text-[10px] text-[var(--accent-primary)] bg-[var(--accent-subtle)] border border-[var(--accent-secondary)]">
                  Watch Folder
                </span>
              )}
            </div>

            {/* Actions: Search, Filter, Folder, Upload, Refresh */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:w-52">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchFiles()}
                  placeholder="Search files..."
                  className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <button
                type="button"
                onClick={() => setFilterVideosOnly(!filterVideosOnly)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                  filterVideosOnly
                    ? 'bg-[var(--accent-subtle)] border-[var(--accent-primary)] text-[var(--accent-primary)]'
                    : 'bg-[var(--bg-main)] border-[var(--border-color)] text-[var(--text-secondary)]'
                }`}
              >
                Videos Only
              </button>

              <button
                type="button"
                onClick={handleDesignateWatchFolder}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs transition"
                title="Designate this folder for autonomous background ingestion"
              >
                Set Watch Folder
              </button>

              <button
                type="button"
                onClick={() => setIsNewFolderOpen(true)}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs transition"
              >
                New Folder
              </button>

              <button
                type="button"
                onClick={() => setIsUploadOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] font-semibold text-xs transition"
              >
                Upload File
              </button>

              <button
                type="button"
                onClick={() => fetchFiles()}
                disabled={isLoadingFiles}
                className="p-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              >
                <RefreshCw size={13} className={isLoadingFiles ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Files Grid */}
          {isLoadingFiles ? (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-12 text-center space-y-2">
              <RefreshCw size={22} className="animate-spin text-[var(--accent-primary)] mx-auto" />
              <p className="text-xs text-[var(--text-muted)] font-mono">Fetching files...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-10 text-center space-y-2">
              <Folder size={32} className="text-[var(--text-muted)] mx-auto opacity-60" />
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">No Files Found</h3>
              <p className="text-[11px] text-[var(--text-muted)] max-w-sm mx-auto">
                {filterVideosOnly ? 'No video files found in this folder.' : 'This folder is currently empty.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {files.map((file) => {
                const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                const sizeMb = file.size ? (Number(file.size) / (1024 * 1024)).toFixed(1) : null;
                const isImported = importedFileId === file.id;

                if (isFolder) {
                  return (
                    <div
                      key={file.id}
                      onClick={() => handleNavigateFolder(file.id, file.name)}
                      className="bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[var(--text-muted)] rounded-xl p-3.5 cursor-pointer transition flex items-center justify-between group"
                    >
                      <div className="flex items-center space-x-2.5 truncate">
                        <Folder size={18} className="text-[var(--accent-secondary)] flex-shrink-0" />
                        <div className="truncate">
                          <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                            {file.name}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] font-mono">
                            Folder
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={13} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition" />
                    </div>
                  );
                }

                return (
                  <div
                    key={file.id}
                    className="bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[var(--text-muted)] rounded-xl overflow-hidden flex flex-col justify-between group transition"
                  >
                    <div>
                      {/* Media preview */}
                      <div className="h-32 bg-[var(--bg-main)] relative overflow-hidden flex items-center justify-center">
                        {file.thumbnailLink ? (
                          <img
                            src={file.thumbnailLink}
                            alt={file.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <FileVideo size={28} className="text-[var(--text-muted)]" />
                        )}

                        <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-[var(--bg-input)] font-mono text-[9px] text-[var(--accent-primary)] uppercase">
                          {file.mimeType.replace('video/', '').toUpperCase()}
                        </span>

                        {sizeMb && (
                          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-[var(--bg-input)] font-mono text-[9px] text-[var(--text-primary)]">
                            {sizeMb} MB
                          </span>
                        )}
                      </div>

                      {/* File Details */}
                      <div className="p-3.5 space-y-1">
                        <h4 className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1" title={file.name}>
                          {file.name}
                        </h4>
                        <div className="text-[10px] text-[var(--text-muted)] font-mono">
                          {new Date(file.modifiedTime).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="p-3 pt-0 border-t border-[var(--border-color)] mt-1 flex flex-col gap-1.5">
                      <div className="grid grid-cols-2 gap-1.5 pt-1.5">
                        <button
                          type="button"
                          onClick={() => toggleSelect(file.id)}
                          className={`py-1 px-2 rounded text-[11px] font-medium transition flex items-center justify-center gap-1 ${
                            selectedIds.has(file.id)
                              ? 'bg-[var(--accent-subtle)] text-[var(--accent-primary)] font-semibold border border-[var(--accent-primary)]/40'
                              : 'bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                          }`}
                        >
                          {selectedIds.has(file.id) ? 'Selected' : 'Select'}
                        </button>

                        <button
                          type="button"
                          onClick={() => { toggleSelect(file.id); setTimeout(openImport, 0); }}
                          className="py-1 px-2 rounded bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-[11px] font-semibold hover:bg-[var(--accent-primary-hover)] transition"
                        >
                          Import
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1"
                          >
                            <ExternalLink size={10} />
                            <span>Drive</span>
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => setFileToDelete(file)}
                          className="text-[10px] text-[var(--status-error)] hover:underline flex items-center gap-1"
                        >
                          <Trash2 size={10} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Selection summary bar */}
      {selectedIds.size > 0 && (
        <div className="bg-[var(--bg-surface)] border border-[var(--accent-primary)]/40 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="text-[var(--text-primary)]">
            <span className="font-semibold">{selectedIds.size}</span> video{selectedIds.size === 1 ? '' : 's'} selected · {(selectedBytes / (1024 * 1024)).toFixed(1)} MB
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] text-[11px] text-[var(--text-secondary)]">Clear</button>
            <button onClick={openImport} className="px-4 py-1.5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-[11px] font-bold">Import Selected</button>
          </div>
        </div>
      )}

      {/* Import jobs panel */}
      {(activeJobs.length > 0 || jobs.some((j) => j.status === 'ready' || j.status === 'failed')) && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-4 space-y-2">
          <h3 className="text-xs font-semibold text-[var(--text-primary)]">Import Jobs</h3>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {jobs.slice(0, 10).map((j) => (
              <div key={j.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] text-[11px]">
                <div className="min-w-0">
                  <p className="text-[var(--text-primary)] font-medium truncate">{j.fileName}</p>
                  <p className="text-[10px] font-mono text-[var(--text-muted)]">
                    {j.status}{j.status === 'downloading' && j.sizeBytes ? ` · ${Math.round((j.progressBytes / j.sizeBytes) * 100)}%` : ''}{j.error ? ` · ${j.error}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${j.status === 'ready' ? 'bg-[var(--accent-subtle)] text-[var(--accent-primary)]' : j.status === 'failed' ? 'bg-rose-500/15 text-rose-300' : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'}`}>{j.status}</span>
                  {j.status === 'failed' && <button onClick={() => retryJob(j.id)} className="text-[10px] text-[var(--accent-primary)] hover:underline">Retry</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import dialog */}
      {importOpen && (
        <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Import {selectedIds.size} video{selectedIds.size === 1 ? '' : 's'} to Video Library</h3>
            <div className="text-[11px] text-[var(--text-muted)]">Total size: {(selectedBytes / (1024 * 1024)).toFixed(1)} MB · Files are downloaded server-side and verified before appearing in your library.</div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[var(--text-secondary)] font-medium mb-1">Brand *</label>
                <select value={importBrandId} onChange={(e) => { setImportBrandId(e.target.value); setImportProjectId(''); }} className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)]">
                  <option value="">Select brand…</option>
                  {(brands || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] font-medium mb-1">Project (optional)</label>
                <select value={importProjectId} onChange={(e) => setImportProjectId(e.target.value)} className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)]" disabled={!importBrandId}>
                  <option value="">No project</option>
                  {(projects || []).filter((p: any) => p.brandId === importBrandId && (p.status || 'planning') !== 'archived').map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {importNotice && <p className="text-[11px] text-rose-300">{importNotice}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-color)]">
              <button onClick={() => { setImportOpen(false); setImportNotice(null); }} className="px-4 py-2 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-secondary)]">Cancel</button>
              <button onClick={startImport} disabled={!importBrandId} className="px-5 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] font-semibold disabled:opacity-50">Start Import</button>
            </div>
          </div>
        </div>
      )}

      {/* MANDATORY CONFIRMATION MODAL FOR DESTRUCTIVE GOOGLE DRIVE FILE DELETION */}
      {fileToDelete && (
        <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-[var(--status-error)]">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                <AlertTriangle size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Delete File from Google Drive?</h3>
                <p className="text-[11px] text-[var(--text-muted)]">Workspace Security Confirmation</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] space-y-1 text-xs">
              <div className="text-[var(--text-muted)]">Target File:</div>
              <div className="text-[var(--text-primary)] font-mono font-medium break-all">{fileToDelete.name}</div>
            </div>

            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Are you sure you want to delete this file from Google Drive? This action will permanently remove the asset with permission from your account.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-secondary)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-[var(--status-error)] text-[var(--text-primary)] text-xs font-semibold disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW FOLDER MODAL */}
      {isNewFolderOpen && (
        <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">New Google Drive Folder</h3>
              <button onClick={() => setIsNewFolderOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-4 text-xs">
              <div>
                <label className="block text-[var(--text-secondary)] font-medium mb-1">Folder Name</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. PUBLORA Ingestion"
                  className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  autoFocus
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setIsNewFolderOpen(false)}
                  className="px-4 py-2 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingFolder || !newFolderName.trim()}
                  className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] font-semibold disabled:opacity-50"
                >
                  {isCreatingFolder ? 'Creating...' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPLOAD FILE MODAL */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Upload Asset to Google Drive</h3>
              <button onClick={() => setIsUploadOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-[var(--border-color)] hover:border-[var(--accent-primary)] rounded-lg p-6 text-center cursor-pointer transition space-y-2 bg-[var(--bg-main)]"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,image/*"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setUploadFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
                <FileVideo size={28} className="text-[var(--text-muted)] mx-auto" />
                {uploadFile ? (
                  <div>
                    <div className="text-[var(--text-primary)] font-medium">{uploadFile.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono">
                      {(uploadFile.size / (1024 * 1024)).toFixed(2)} MB
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-[var(--text-primary)] font-medium">Click to select video or image file</div>
                    <div className="text-[10px] text-[var(--text-muted)]">Supports MP4, MOV, WEBM up to 500MB</div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className="px-4 py-2 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !uploadFile}
                  className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] font-semibold disabled:opacity-50"
                >
                  {isUploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
