import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X, UploadCloud, FileVideo, Loader2, CheckCircle2, ArrowRight,
  ArrowLeft, AlertTriangle, Youtube, Instagram, Facebook, Music2,
  Globe, Image as ImageIcon, RefreshCw, Film,
} from 'lucide-react';
import { usePublisher } from '../context/PublisherContext';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { Platform, SocialAccount, Brand } from '../types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ProbeResult {
  durationSeconds: number;
  width: number;
  height: number;
  aspectRatio: '9:16' | '16:9' | '1:1';
  orientation: 'landscape' | 'portrait' | 'square';
  fps: number | null;
  codec: string | null;
  hasAudio: boolean | null;
  resolution: string;
}

interface UploadState {
  file: File;
  progress: number; // 0-100
  error: string | null;
  assetUrl: string | null;
  assetId: string | null;
}

interface UploadPolicyInfo {
  uploadsEnabled: boolean;
  plan: string;
  maxFileBytes: number;
  quotaBytes: number | null;
  usedBytes: number;
  remainingBytes: number | null;
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  chunkSizeBytes: number;
  resumableEnabled: boolean;
}

interface ChunkedState {
  sessionId: string;
  totalChunks: number;
  sentChunks: number;
  bytesSent: number;
  speedBps: number;
  paused: boolean;
}

type Step = 'upload' | 'analyzing' | 'ready' | 'brand' | 'accounts' | 'review';

const VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime'];
const MAX_BYTES = 100 * 1024 * 1024;

const fmtBytes = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
const fmtDuration = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};
const aspectFrom = (w: number, h: number): '9:16' | '16:9' | '1:1' => {
  const r = w / h;
  if (r > 1.2) return '16:9';
  if (r < 0.85) return '9:16';
  return '1:1';
};
const orientationFrom = (w: number, h: number) =>
  Math.abs(w - h) < Math.min(w, h) * 0.08 ? 'square' : w > h ? 'landscape' : 'portrait';

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  youtube: <Youtube size={15} />,
  instagram: <Instagram size={15} />,
  facebook: <Facebook size={15} />,
  tiktok: <Music2 size={15} />,
};

/* ------------------------------------------------------------------ */
/* Real client-side probe via <video> + canvas (no mocks)              */
/* ------------------------------------------------------------------ */

function probeVideo(file: File): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error('Timed out reading video metadata'));
    }, 20000);

    video.onloadedmetadata = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      const base: ProbeResult = {
        durationSeconds: video.duration,
        width: w,
        height: h,
        aspectRatio: aspectFrom(w, h),
        orientation: orientationFrom(w, h),
        fps: null,
        codec: null,
        hasAudio: null,
        resolution: `${w} × ${h}`,
      };

      // Audio detection
      try {
        const v = video as any;
        if (typeof v.mozHasAudio === 'boolean') base.hasAudio = v.mozHasAudio;
        else if (typeof v.webkitAudioDecodedByteCount === 'number')
          base.hasAudio = v.webkitAudioDecodedByteCount > 0;
        else if ('audioTracks' in video) base.hasAudio = (video as any).audioTracks.length > 0;
      } catch { /* leave null */ }

      // FPS via requestVideoFrameCallback (best effort)
      const done = () => {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
        resolve(base);
      };

      let fpsFrames = 0;
      let fpsTimes: number[] = [];
      const raf = (video as any).requestVideoFrameCallback;
      if (typeof raf === 'function') {
        const cb = (_now: number, meta: any) => {
          fpsFrames++;
          if (meta?.mediaTime != null) fpsTimes.push(meta.mediaTime);
          if (fpsFrames < 30 && video.readyState >= 2) {
            raf.call(video, cb);
          } else {
            if (fpsTimes.length >= 2) {
              const span = fpsTimes[fpsTimes.length - 1] - fpsTimes[0];
              const count = fpsTimes.length - 1;
              if (span > 0) base.fps = Math.round((count / span) * 10) / 10;
            }
            done();
          }
        };
        // nudge decode
        video.currentTime = Math.min(0.5, video.duration / 10);
        raf.call(video, cb);
        setTimeout(() => { if (!base.fps) { /* keep null */ } done(); }, 4000);
      } else {
        done();
      }
    };
    video.onerror = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode this video file'));
    };
  });
}

function captureThumbnail(file: File, atSeconds: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(atSeconds, Math.max(0, video.duration - 0.1));
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')!.drawImage(video, 0, 0);
        canvas.toBlob((b) => {
          URL.revokeObjectURL(url);
          resolve(b);
        }, 'image/jpeg', 0.82);
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    setTimeout(() => { URL.revokeObjectURL(url); resolve(null); }, 15000);
  });
}

/* ------------------------------------------------------------------ */
/* XHR upload with real progress + cancel                              */
/* ------------------------------------------------------------------ */

/* Auth headers — session is carried by the HttpOnly cookie; only the
   workspace hint header is needed. */
function authHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  const ws = localStorage.getItem('sra_active_workspace_id');
  if (ws) h['x-workspace-id'] = ws;
  return h;
}

const fmtPolicyBytes = (b: number | null | undefined) =>
  b == null ? 'Unlimited' : b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(0)} MB` : `${(b / 1024).toFixed(0)} KB`;

/**
 * Real chunked resumable upload:
 * init → fetch per-chunk status → PUT each missing slice → complete.
 * Pause = stop sending (confirmed chunks persist server-side).
 * Resume = re-read status and continue from missing indexes.
 */
async function chunkedUpload(
  file: File,
  onChunkProgress: (sentChunks: number, totalChunks: number, bytesSent: number, speedBps: number) => void,
  shouldPause: () => boolean,
  sessionRef: { current: ChunkedState | null }
): Promise<{ assetUrl: string; assetId: string }> {
  const initRes = await fetch('/api/media/chunked/init', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
  });
  const init = await initRes.json();
  if (!initRes.ok || !init.success) throw new Error(init.error || 'Failed to start upload session');

  const { sessionId, chunkSize, totalChunks } = init;
  sessionRef.current = { sessionId, totalChunks, sentChunks: 0, bytesSent: 0, speedBps: 0, paused: false };

  // resume: ask which chunks already exist
  const statusRes = await fetch(`/api/media/chunked/${sessionId}/status`, { headers: authHeaders(false) });
  const status = await statusRes.json();
  const have = new Set<number>(status.received || []);

  let bytesSent = 0;
  let lastTime = performance.now();
  let lastBytes = 0;

  for (let i = 0; i < totalChunks; i++) {
    if (have.has(i)) { bytesSent += Math.min(chunkSize, file.size - i * chunkSize); continue; }
    // wait while paused
    while (shouldPause() && sessionRef.current) {
      await new Promise((r) => setTimeout(r, 250));
    }
    const start = i * chunkSize;
    const blob = file.slice(start, Math.min(start + chunkSize, file.size));
    const res = await fetch(`/api/media/chunked/${sessionId}/chunk/${i}`, {
      method: 'PUT',
      headers: { ...authHeaders(false), 'Content-Type': 'application/octet-stream' },
      body: blob,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Chunk ${i + 1} failed (${res.status})`);
    }
    bytesSent += blob.size;

    // real speed + ETA from measured throughput
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    if (dt > 0.5) {
      sessionRef.current!.speedBps = (bytesSent - lastBytes) / dt;
      lastBytes = bytesSent;
      lastTime = now;
    }
    sessionRef.current!.sentChunks = i + 1;
    sessionRef.current!.bytesSent = bytesSent;
    onChunkProgress(i + 1, totalChunks, bytesSent, sessionRef.current!.speedBps);
  }

  const done = await fetch(`/api/media/chunked/${sessionId}/complete`, {
    method: 'POST',
    headers: authHeaders(),
  }).then((r) => r.json());
  if (!done.success) throw new Error(done.error || 'Failed to finalize upload');
  return { assetUrl: done.asset.url, assetId: done.asset.id };
}

function uploadWithProgress(
  file: File | Blob,
  filename: string,
  mimeType: string,
  onProgress: (pct: number) => void,
  signal: { cancelled: boolean }
): Promise<{ assetUrl: string; assetId: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media/upload');
    xhr.setRequestHeader('Content-Type', 'application/json');
    const ws = localStorage.getItem('sra_active_workspace_id');
    if (ws) xhr.setRequestHeader('x-workspace-id', ws);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
          resolve({ assetUrl: data.asset.url, assetId: data.asset.id });
        } else {
          reject(new Error(data.error || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error('Unexpected server response'));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('__cancelled__'));

    // expose abort
    (xhr as any).__signal = signal;
    signal && ((signal as any).xhr = xhr);

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1] || '';
      xhr.send(JSON.stringify({ filename, mimeType, dataBase64: base64 }));
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onContinueToPost?: (videoId: string) => void;
  onGoToConnections?: () => void;
  onCreateBrand?: () => void;
}

export const AddVideoWizard: React.FC<Props> = ({
  isOpen, onClose, onContinueToPost, onGoToConnections, onCreateBrand,
}) => {
  const { brands, accounts, videos, createVideo, activeBrandId, projects } = usePublisher();
  const { apiFetch: authFetch } = useAuth();

  const [step, setStep] = useState<Step>('upload');
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [analyzeStage, setAnalyzeStage] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [brandId, setBrandId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [policy, setPolicy] = useState<UploadPolicyInfo | null>(null);
  const [paused, setPaused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<{ cancelled: boolean; xhr?: XMLHttpRequest }>({ cancelled: false });
  const chunkSessionRef = useRef<ChunkedState | null>(null);
  const previewUrlRef = useRef<string>('');

  useEffect(() => {
    if (isOpen) {
      if (activeBrandId && !brandId) setBrandId(activeBrandId);
      apiFetch('/api/media/policy').then((r) => r.json()).then((d) => {
        if (d.success) setPolicy(d.policy);
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const reset = useCallback(() => {
    setStep('upload'); setUpload(null); setProbe(null); setTitle('');
    setDescription(''); setBrandId(activeBrandId || ''); setProjectId(''); setSelectedAccounts(new Set());
    setAnalyzeStage(''); setSaving(false); setDragOver(false);
    cancelRef.current.cancelled = true;
    cancelRef.current.xhr?.abort();
  }, [activeBrandId]);

  const handleClose = () => { reset(); onClose(); };

  /* ---------- Step 1: pick + upload + analyze ---------- */

  const startPipeline = async (file: File) => {
    // validation
    if (!VIDEO_MIME.includes(file.type)) {
      setUpload({ file, progress: 0, error: `Unsupported format "${file.type || file.name.split('.').pop()}". Use MP4, MOV or WebM.`, assetUrl: null, assetId: null });
      return;
    }
    if (file.size > MAX_BYTES) {
      setUpload({ file, progress: 0, error: `File is ${fmtBytes(file.size)} — maximum is 100 MB.`, assetUrl: null, assetId: null });
      return;
    }

    // client-side pre-check against policy (server re-validates anyway)
    if (policy) {
      if (!policy.uploadsEnabled) {
        setUpload({ file, progress: 0, error: 'Uploads are currently disabled by the administrator.', assetUrl: null, assetId: null });
        return;
      }
      if (file.size > policy.maxFileBytes) {
        setUpload({ file, progress: 0, error: `Your video is ${fmtPolicyBytes(file.size)}, but your ${policy.plan} plan allows a maximum of ${fmtPolicyBytes(policy.maxFileBytes)}.`, assetUrl: null, assetId: null });
        return;
      }
      if (policy.remainingBytes != null && file.size > policy.remainingBytes) {
        setUpload({ file, progress: 0, error: `Not enough workspace storage — ${fmtPolicyBytes(policy.remainingBytes)} remaining.`, assetUrl: null, assetId: null });
        return;
      }
      if (!policy.allowedMimeTypes.includes(file.type)) {
        setUpload({ file, progress: 0, error: `Format not allowed. Supported: ${policy.allowedMimeTypes.join(', ')}`, assetUrl: null, assetId: null });
        return;
      }
    }

    setUpload({ file, progress: 0, error: null, assetUrl: null, assetId: null });
    setStep('analyzing');
    setAnalyzeStage('Uploading your video…');
    setPaused(false);
    cancelRef.current = { cancelled: false };
    chunkSessionRef.current = null;

    const useChunked = !!policy?.resumableEnabled && file.size > 4 * 1024 * 1024;

    try {
      let assetUrl: string;
      if (useChunked) {
        setAnalyzeStage('Starting resumable upload…');
        const result = await chunkedUpload(
          file,
          (sent, total, bytes, speed) => {
            setUpload((u) => u && { ...u, progress: Math.round((bytes / file.size) * 100) });
            setAnalyzeStage(`Uploading… ${Math.round((bytes / file.size) * 100)}% · ${fmtPolicyBytes(speed)}/s`);
          },
          () => paused || cancelRef.current.cancelled,
          chunkSessionRef
        );
        assetUrl = result.assetUrl;
      } else {
        const result = await uploadWithProgress(
          file, file.name, file.type,
          (pct) => {
            setUpload((u) => u && { ...u, progress: pct });
            setAnalyzeStage(`Uploading… ${pct}%`);
          },
          cancelRef.current as any
        );
        assetUrl = result.assetUrl;
      }
      if (cancelRef.current.cancelled) return;

      setUpload((u) => u && { ...u, assetUrl, progress: 100 });
      setAnalyzeStage('Reading video metadata…');

      const meta = await probeVideo(file);
      setProbe(meta);
      setAnalyzeStage('Generating thumbnail…');

      // thumbnail → upload as image asset
      let thumbUrl: string | null = null;
      const blob = await captureThumbnail(file, Math.min(1, meta.durationSeconds / 2));
      if (blob) {
        try {
          const t = await uploadWithProgress(blob, `thumb_${Date.now()}.jpg`, 'image/jpeg', () => {}, cancelRef.current as any);
          thumbUrl = t.assetUrl;
        } catch { /* thumbnail optional */ }
      }
      if (cancelRef.current.cancelled) return;

      // stash on upload state for review/save
      setUpload((u) => u && { ...u, assetUrl });
      (meta as any).__thumbUrl = thumbUrl;
      setAnalyzeStage('');
      setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
      setStep('ready');
      setStep('brand');
    } catch (e: any) {
      if (e?.message === '__cancelled__' || cancelRef.current.cancelled) {
        setStep('upload');
        setUpload((u) => u && { ...u, error: null });
        return;
      }
      setStep('upload');
      setUpload((u) => u && { ...u, error: e?.message || 'Upload failed. Please try again.' });
    }
  };

  const handleFile = (f?: File | null) => { if (f) startPipeline(f); };

  /* ---------- Steps 2-4 ---------- */

  const selectedBrand = brands.find((b) => b.id === brandId);
  const brandAccounts = accounts.filter((a) => a.brandId === brandId);
  const readyAccounts = brandAccounts.filter((a) => a.isConnected && !a.requiresReconnection && a.tokenValid !== false);

  const toggleAccount = (id: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const saveVideo = async (): Promise<string | null> => {
    if (!upload?.assetUrl || !probe || !brandId) return null;
    setSaving(true);
    try {
      const vid = createVideo({
        brandId,
        projectId: projectId || undefined,
        title: title.trim() || 'Untitled video',
        description: description.trim(),
        durationSeconds: Math.round(probe.durationSeconds),
        aspectRatio: probe.aspectRatio,
        hookType: 'visual_reveal',
        editingPace: 'medium',
        sceneChangesCount: 0,
        tags: [],
        thumbnailUrl: (probe as any).__thumbUrl || undefined,
        fileUrl: upload.assetUrl,
        fileName: upload.file.name,
        fileSizeBytes: upload.file.size,
        format: upload.file.name.split('.').pop()?.toLowerCase() || upload.file.type.split('/')[1],
        resolution: probe.resolution,
        fps: probe.fps,
        codec: probe.codec,
        hasAudio: probe.hasAudio,
        orientation: probe.orientation,
        accountIds: Array.from(selectedAccounts),
        processingStatus: 'ready',
        videoUrl: upload.assetUrl,
      } as any);
      return vid.id;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const id = await saveVideo();
    if (id) handleClose();
  };

  const handleContinueToPost = async () => {
    const id = await saveVideo();
    if (id && onContinueToPost) {
      handleClose();
      onContinueToPost(id);
    }
  };

  if (!isOpen) return null;

  /* ---------- render helpers ---------- */

  const stepIndex = ['upload', 'analyzing', 'ready', 'brand', 'accounts', 'review'].indexOf(step === 'ready' ? 'brand' : step);
  const steps = ['Upload', 'Analyze', 'Brand', 'Accounts', 'Review'];

  const metaRow = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--border-subtle)] last:border-0">
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
      <span className="text-[11px] font-medium text-[var(--text-primary)] font-mono">{value ?? 'Unavailable'}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-4 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-surface)] z-10">
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">Add a New Video</h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Upload a video from your device and let Publora analyze it automatically.</p>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition" aria-label="Close">
            <X size={17} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-5 sm:px-6 pt-4 flex items-center gap-1.5">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${i <= stepIndex ? 'bg-[var(--accent-subtle)] text-[var(--accent-primary)]' : 'bg-[var(--bg-main)] text-[var(--text-muted)]'}`}>
                {s}
              </span>
              {i < steps.length - 1 && <span className="w-3 h-px bg-[var(--border-color)]" />}
            </React.Fragment>
          ))}
        </div>

        <div className="p-5 sm:p-6">
          {/* ============ STEP: UPLOAD ============ */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition ${dragOver ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)]' : 'border-[var(--border-color)] hover:border-[var(--accent-primary)]/50 hover:bg-[var(--bg-main)]/50'}`}
              >
                <UploadCloud size={36} className="mx-auto text-[var(--accent-primary)] mb-3" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">Drag and drop your video here, or browse files.</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-1.5">MP4, MOV or WebM · up to {policy ? fmtPolicyBytes(policy.maxFileBytes) : '1 GB'}{policy?.plan ? ` on ${policy.plan} plan` : ''}</p>
                {policy && (
                  <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1">
                    {policy.remainingBytes != null ? `${fmtPolicyBytes(policy.remainingBytes)} storage remaining` : 'Unlimited workspace storage'}
                    {policy.resumableEnabled ? ' · resumable uploads enabled' : ''}
                  </p>
                )}
                <button
                  type="button"
                  className="mt-4 px-4 py-2 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-xs font-bold hover:opacity-90 transition"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  Upload from My Device
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm"
                  className="hidden"
                  onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
                />
              </div>

              {upload?.error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{upload.error}</span>
                </div>
              )}
            </div>
          )}

          {/* ============ STEP: ANALYZING ============ */}
          {step === 'analyzing' && upload && (
            <div className="py-10 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center">
                <Loader2 size={26} className="text-[var(--accent-primary)] animate-spin" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Analyzing your video…</p>
                <p className="text-[11px] text-[var(--text-muted)] font-mono mt-1">{analyzeStage}</p>
              </div>
              {upload.progress > 0 && upload.progress < 100 && (
                <div className="max-w-xs mx-auto">
                  <div className="h-1.5 rounded-full bg-[var(--bg-main)] overflow-hidden">
                    <div className="h-full bg-[var(--accent-primary)] transition-all duration-300" style={{ width: `${upload.progress}%` }} />
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1 font-mono">
                    {upload.progress}%{chunkSessionRef.current?.speedBps ? ` · ${fmtPolicyBytes(chunkSessionRef.current.speedBps)}/s` : ''}
                    {chunkSessionRef.current?.speedBps && upload.progress > 0 && upload.progress < 100
                      ? ` · ETA ${Math.max(1, Math.round(((upload.file.size * (1 - upload.progress / 100)) / chunkSessionRef.current.speedBps) / 60))}m`
                      : ''}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-center gap-4">
                {chunkSessionRef.current && upload.progress < 100 && (
                  <button
                    type="button"
                    onClick={() => setPaused((p) => !p)}
                    className="text-[11px] text-[var(--accent-primary)] hover:underline font-medium"
                  >
                    {paused ? 'Resume upload' : 'Pause upload'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    cancelRef.current.cancelled = true;
                    cancelRef.current.xhr?.abort();
                    const sid = chunkSessionRef.current?.sessionId;
                    if (sid) fetch(`/api/media/chunked/${sid}`, { method: 'DELETE', headers: authHeaders(false) }).catch(() => {});
                    setStep('upload');
                  }}
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
                >
                  Cancel upload
                </button>
              </div>
            </div>
          )}

          {/* ============ STEP: BRAND ============ */}
          {step === 'brand' && probe && upload && (
            <div className="space-y-4">
              <SuccessBanner probe={probe} upload={upload} thumbUrl={(probe as any).__thumbUrl} />
              <h4 className="text-sm font-bold text-[var(--text-primary)] pt-2">Which brand is this video for?</h4>
              {brands.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-xs text-[var(--text-muted)]">You don't have any brands yet. Create one first, then come back.</p>
                  {onCreateBrand && (
                    <button type="button" onClick={() => { handleClose(); onCreateBrand(); }} className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-xs font-bold">
                      Create a Brand
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {brands.map((b: Brand) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => { setBrandId(b.id); setProjectId(''); setStep('accounts'); }}
                      className={`text-start p-3.5 rounded-xl border transition ${brandId === b.id ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)]' : 'border-[var(--border-color)] hover:border-[var(--accent-primary)]/40 bg-[var(--bg-main)]/40'}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-primary)] text-xs font-bold" style={{ backgroundColor: b.color || '#00D6B2' }}>
                          {(b.name || '?')[0].toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--text-primary)] truncate">{b.name}</p>
                          <p className="text-[10px] text-[var(--text-muted)] truncate">{b.description || 'No description'}</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] mt-2 font-mono">
                        {accounts.filter((a) => a.brandId === b.id && a.isConnected).length} connected account(s)
                      </p>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setStep('upload')} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1">
                <ArrowLeft size={12} /> Back
              </button>
            </div>
          )}

          {/* ============ STEP: ACCOUNTS ============ */}
          {step === 'accounts' && probe && upload && (
            <div className="space-y-4">
              <SuccessBanner probe={probe} upload={upload} thumbUrl={(probe as any).__thumbUrl} compact />
              <h4 className="text-sm font-bold text-[var(--text-primary)] pt-1">Where should this video publish?</h4>
              <p className="text-[11px] text-[var(--text-muted)]">Select one or more connected accounts for <span className="text-[var(--text-primary)] font-semibold">{selectedBrand?.name}</span>.</p>

              {(projects || []).filter((p: any) => p.brandId === brandId && (p.status || 'planning') !== 'archived').length > 0 && (
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1">Project (optional)</label>
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]">
                    <option value="">No project</option>
                    {(projects || []).filter((p: any) => p.brandId === brandId && (p.status || 'planning') !== 'archived').map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}{p.status && p.status !== 'planning' ? ` (${p.status.replace('_', ' ')})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {brandAccounts.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-xs text-[var(--text-muted)]">No social accounts connected to this brand yet.</p>
                  {onGoToConnections ? (
                    <button type="button" onClick={() => { handleClose(); onGoToConnections(); }} className="px-4 py-2 rounded-xl border border-[var(--border-color)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]">
                      Connect an Account
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-2">
                  {brandAccounts.map((a: SocialAccount) => {
                    const usable = a.isConnected && !a.requiresReconnection && a.tokenValid !== false;
                    const checked = selectedAccounts.has(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        disabled={!usable}
                        onClick={() => usable && toggleAccount(a.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-start transition ${checked ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)]' : usable ? 'border-[var(--border-color)] hover:border-[var(--accent-primary)]/40 bg-[var(--bg-main)]/40' : 'border-[var(--border-color)] opacity-50 cursor-not-allowed'}`}
                      >
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${checked ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)]' : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]'}`}>
                          {PLATFORM_ICON[a.platform] || <Globe size={15} />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-bold text-[var(--text-primary)] truncate">{a.accountName || a.handle}</span>
                          <span className="block text-[10px] text-[var(--text-muted)] font-mono truncate">{a.platform}{a.handle ? ` · ${a.handle}` : ''}</span>
                        </span>
                        {!usable ? (
                          <span className="text-[10px] font-mono text-amber-400 shrink-0">Needs reconnect</span>
                        ) : checked ? (
                          <CheckCircle2 size={16} className="text-[var(--accent-primary)] shrink-0" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <button type="button" onClick={() => setStep('brand')} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1">
                  <ArrowLeft size={12} /> Back
                </button>
                <button
                  type="button"
                  disabled={brandAccounts.length === 0}
                  onClick={() => setStep('review')}
                  className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-xs font-bold disabled:opacity-40 flex items-center gap-1.5"
                >
                  Continue <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )}

          {/* ============ STEP: REVIEW ============ */}
          {step === 'review' && probe && upload && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Video info */}
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)]/40 p-4 space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Video Information</p>
                  {upload.assetUrl && (
                    <video src={upload.assetUrl} controls preload="metadata" className="w-full rounded-lg bg-black max-h-40 object-contain" />
                  )}
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    placeholder="Video title"
                  />
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Description (optional)"
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg p-2 text-[11px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                  <div className="text-[11px]">
                    {metaRow('Duration', fmtDuration(probe.durationSeconds))}
                    {metaRow('Resolution', probe.resolution)}
                    {metaRow('Aspect ratio', probe.aspectRatio)}
                    {metaRow('File size', fmtBytes(upload.file.size))}
                    {metaRow('Format', upload.file.name.split('.').pop()?.toUpperCase())}
                    {metaRow('Frame rate', probe.fps ? `${probe.fps} fps` : null)}
                    {metaRow('Codec', probe.codec)}
                    {metaRow('Audio', probe.hasAudio === null ? null : probe.hasAudio ? 'Yes' : 'No')}
                    {metaRow('Orientation', probe.orientation)}
                  </div>
                </div>

                {/* Publishing setup */}
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)]/40 p-4 space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Publishing Setup</p>
                  <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)]">
                    <span className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--text-primary)] text-[10px] font-bold" style={{ backgroundColor: selectedBrand?.color || '#00D6B2' }}>
                      {(selectedBrand?.name || '?')[0].toUpperCase()}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">{selectedBrand?.name}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Brand</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {Array.from(selectedAccounts).map((id) => {
                      const a = brandAccounts.find((x) => x.id === id);
                      if (!a) return null;
                      return (
                        <div key={id} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)]">
                          <span className="text-[var(--accent-primary)]">{PLATFORM_ICON[a.platform] || <Globe size={13} />}</span>
                          <span className="text-[11px] font-medium text-[var(--text-primary)] truncate flex-1">{a.accountName || a.handle}</span>
                          <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase">{a.platform}</span>
                        </div>
                      );
                    })}
                    {selectedAccounts.size === 0 && (
                      <p className="text-[11px] text-[var(--text-muted)] italic">No accounts selected — video saves to library only.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                <button type="button" onClick={() => setStep('accounts')} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1">
                  <ArrowLeft size={12} /> Back
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSave}
                    className="px-4 py-2.5 rounded-xl border border-[var(--border-color)] text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save to Video Library'}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleContinueToPost}
                    className="px-4 py-2.5 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Film size={13} />}
                    Continue to Create Post
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* Success summary card shown after analysis */
const SuccessBanner: React.FC<{ probe: ProbeResult; upload: UploadState; thumbUrl?: string | null; compact?: boolean }> = ({ probe, upload, thumbUrl, compact }) => (
  <div className={`flex items-center gap-3 p-3 rounded-xl border border-[var(--accent-primary)]/30 bg-[var(--accent-subtle)] ${compact ? '' : ''}`}>
    {thumbUrl ? (
      <img src={thumbUrl} alt="" className="w-14 h-14 rounded-lg object-cover bg-black shrink-0" />
    ) : (
      <div className="w-14 h-14 rounded-lg bg-[var(--bg-main)] flex items-center justify-center shrink-0">
        <FileVideo size={20} className="text-[var(--accent-primary)]" />
      </div>
    )}
    <div className="min-w-0 flex-1">
      <p className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
        <CheckCircle2 size={13} className="text-[var(--accent-primary)]" /> Your video is ready!
      </p>
      <p className="text-[10px] text-[var(--text-muted)] font-mono truncate mt-0.5">
        {probe.resolution} · {probe.aspectRatio} · {fmtDuration(probe.durationSeconds)} · {fmtBytes(upload.file.size)}
      </p>
    </div>
    {!compact && <ImageIcon size={14} className="text-[var(--text-muted)] shrink-0" />}
  </div>
);
