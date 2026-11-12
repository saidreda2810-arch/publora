import React, { useState, useEffect } from 'react';
import { usePublisher } from '../context/PublisherContext';
import { useAuth } from '../context/AuthContext';
import {
  X,
  Calendar,
  Film,
  Tag,
  Clock,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Send,
  PlusCircle,
} from 'lucide-react';
import { GiSparkles } from 'react-icons/gi';
import { Platform } from '../types';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// 1. Compose Post Modal ” stepped wizard:
//    1 Video → 2 Platforms → 3 Content → 4 Timing → 5 Review & Publish
export const ComposePostModal: React.FC<ModalProps & { initialVideoId?: string; initialScheduledTime?: string }> = ({ isOpen, onClose, initialVideoId, initialScheduledTime }) => {
  const { videos, createPost, activeBrandId, accounts } = usePublisher();
  const { apiFetch } = useAuth();

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('#ops #distribution #publishing');
  const [selectedVideoId, setSelectedVideoId] = useState(initialVideoId || videos[0]?.id || '');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(['youtube']);
  const [scheduleType, setScheduleType] = useState<'smart' | 'manual'>('smart');
  const [publishAction, setPublishAction] = useState<'schedule' | 'now' | 'draft'>('schedule');
  const [manualTime, setManualTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 4);
    return d.toISOString().slice(0, 16);
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [aiError, setAiError] = useState('');

  // Pre-fill schedule when opened from the calendar with a chosen date/time
  useEffect(() => {
    if (isOpen && initialScheduledTime) {
      setManualTime(initialScheduledTime.slice(0, 16));
      setScheduleType('manual');
      setPublishAction('schedule');
    }
  }, [isOpen, initialScheduledTime]);

  if (!isOpen) return null;

  const connectedPlatforms = new Set(
    accounts.filter((a) => a.isConnected).map((a) => a.platform)
  );

  const selectedVideo = videos.find((v) => v.id === selectedVideoId) || videos[0];

  const togglePlatform = (p: Platform) => {
    // Only allow platforms with a connected account (if accounts data exists)
    if (accounts.length > 0 && !connectedPlatforms.has(p) && !selectedPlatforms.includes(p)) {
      return;
    }
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const canNext =
    step === 0 ? Boolean(selectedVideoId || videos[0]?.id) :
    step === 1 ? selectedPlatforms.length > 0 :
    step === 2 ? title.trim().length > 0 : true;

  const suggestHooks = async () => {
    setAiLoading(true);
    setAiError('');
    setAiSuggestion('');
    try {
      const res = await apiFetch('/api/ai/generate-hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: title || selectedVideo?.title || 'short video' }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.hooks) && data.hooks.length > 0) {
        setAiSuggestion(data.hooks.slice(0, 3).join('\n'));
      } else {
        setAiError(data.error || 'AI suggestions unavailable right now.');
      }
    } catch (e: any) {
      setAiError(e.message || 'AI service unreachable.');
    } finally {
      setAiLoading(false);
    }
  };

  const finish = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title || !activeBrandId || selectedPlatforms.length === 0) return;

    const now = new Date();
    let targetTimeIso: string;
    let autoOptimized = false;
    let status: 'scheduled' | 'published' | 'draft' = 'scheduled';

    if (publishAction === 'now') {
      targetTimeIso = now.toISOString();
      status = 'published';
    } else if (publishAction === 'draft') {
      targetTimeIso = now.toISOString();
      status = 'draft';
    } else if (scheduleType === 'smart') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(18, 0, 0, 0);
      targetTimeIso = tomorrow.toISOString();
      autoOptimized = true;
    } else {
      targetTimeIso = new Date(manualTime).toISOString();
    }

    createPost({
      brandId: activeBrandId,
      videoId: selectedVideoId || (videos[0]?.id ?? 'vid-generic'),
      channelPlatforms: selectedPlatforms,
      title,
      caption,
      hashtags: hashtags.split(' ').map((h) => h.trim()).filter(Boolean),
      scheduledTime: targetTimeIso,
      status,
      mode: autoOptimized ? 'autopilot' : 'manual',
      optimizedByAutopilot: autoOptimized,
      lockedForPublishing: false,
    });

    setStep(0);
    onClose();
  };

  const steps = ['Video', 'Platforms', 'Content', 'Timing', 'Review'];
  const inputCls =
    'w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]';
  const labelCls = 'block text-[var(--text-secondary)] font-medium mb-1';

  return (
    <div className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl max-w-lg w-full p-5 space-y-4 max-h-[92vh] overflow-y-auto touch-scroll shadow-2xl my-auto">
        {/* Header + step indicator */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Create Content</h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              Step {step + 1} of {steps.length} ” {steps[step]}
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-1">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-[var(--accent-primary)]' : 'bg-[var(--bg-main)] border border-[var(--border-color)]'}`}
            />
          ))}
        </div>

        <div className="text-xs space-y-3.5">
          {/* STEP 0 ” VIDEO */}
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-[var(--text-muted)]">Choose which video to publish.</p>
              {videos.length === 0 ? (
                <div className="p-4 rounded-lg border border-dashed border-[var(--border-color)] text-center space-y-2">
                  <Film size={22} className="text-[var(--text-muted)] mx-auto" />
                  <p className="text-[var(--text-secondary)]">No videos yet ” upload one from Video Library first.</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto touch-scroll">
                  {videos.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVideoId(v.id)}
                      className={`w-full text-start p-2.5 rounded-lg border transition flex items-center justify-between gap-2 ${
                        (selectedVideoId || videos[0]?.id) === v.id
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)]'
                          : 'border-[var(--border-color)] bg-[var(--bg-main)] hover:border-[var(--text-muted)]'
                      }`}
                    >
                      <span className="truncate text-[var(--text-primary)] font-medium">{v.title}</span>
                      <span className="text-[10px] font-mono text-[var(--text-muted)] flex-shrink-0">{v.durationSeconds}s</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 1 ” PLATFORMS */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-[var(--text-muted)]">Select the channels to publish to.</p>
              {accounts.length > 0 && (
                <p className="text-[10px] text-[var(--text-muted)]">
                  Only connected accounts can be selected.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {(['youtube', 'instagram', 'tiktok', 'facebook'] as Platform[]).map((p) => {
                  const isConnected = accounts.length === 0 || connectedPlatforms.has(p);
                  const isSelected = selectedPlatforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      disabled={!isConnected && !isSelected}
                      className={`py-2.5 px-2.5 rounded-lg border text-center font-mono text-[11px] font-semibold transition uppercase ${
                        isSelected
                          ? 'bg-[var(--accent-subtle)] border-[var(--accent-primary)] text-[var(--accent-primary)]'
                          : isConnected
                          ? 'bg-[var(--bg-main)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          : 'bg-[var(--bg-main)] border-[var(--border-color)] text-[var(--text-muted)] opacity-50 cursor-not-allowed'
                      }`}
                    >
                      {p}
                      {!isConnected && <span className="block text-[9px] normal-case font-sans">not connected</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2 ” CONTENT */}
          {step === 2 && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Title *</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Master The Infinite Loop Technique" className={inputCls} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={labelCls + ' mb-0'}>Caption</label>
                  <button type="button" onClick={suggestHooks} disabled={aiLoading} className="text-[10px] font-mono text-[var(--accent-primary)] hover:underline disabled:opacity-50">
                    {aiLoading ? 'Generating…' : (<span className="inline-flex items-center gap-1"><GiSparkles size={11} /> Suggest hooks</span>)}
                  </button>
                </div>
                <textarea rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write your post copy…" className={inputCls} />
                {aiError && <p className="text-[10px] text-[var(--status-error)] mt-1">{aiError}</p>}
                {aiSuggestion && (
                  <div className="mt-2 p-2.5 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)]">
                    <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1">AI suggestions ” tap to append</div>
                    <div className="space-y-1">
                      {aiSuggestion.split('\n').map((h, i) => (
                        <button key={i} type="button" onClick={() => setCaption((c) => (c ? c + '\n' + h : h))} className="block w-full text-start text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] truncate">
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className={labelCls}>Hashtags</label>
                <input type="text" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#ops #analytics" className={inputCls} />
              </div>
            </div>
          )}

          {/* STEP 3 ” TIMING & ACTION */}
          {step === 3 && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>When to publish</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button type="button" onClick={() => setScheduleType('smart')} className={`p-2.5 rounded-lg border text-start transition ${scheduleType === 'smart' ? 'bg-[var(--accent-subtle)] border-[var(--accent-primary)]' : 'bg-[var(--bg-main)] border-[var(--border-color)]'}`}>
                    <div className="font-semibold text-[var(--text-primary)]">Recommended time</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Tomorrow 6:00 PM peak window</div>
                  </button>
                  <button type="button" onClick={() => setScheduleType('manual')} className={`p-2.5 rounded-lg border text-start transition ${scheduleType === 'manual' ? 'bg-[var(--accent-subtle)] border-[var(--accent-primary)]' : 'bg-[var(--bg-main)] border-[var(--border-color)]'}`}>
                    <div className="font-semibold text-[var(--text-primary)]">Pick date & time</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Choose exact moment</div>
                  </button>
                </div>
                {scheduleType === 'manual' && (
                  <input type="datetime-local" value={manualTime} onChange={(e) => setManualTime(e.target.value)} className={`${inputCls} mt-2 font-mono`} />
                )}
              </div>
              <div>
                <label className={labelCls}>Action</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['schedule', 'Schedule', 'Add to queue'],
                    ['now', 'Publish now', 'Send immediately'],
                    ['draft', 'Save draft', 'Finish later'],
                  ] as const).map(([id, lbl, desc]) => (
                    <button key={id} type="button" onClick={() => setPublishAction(id)} className={`p-2 rounded-lg border text-center transition ${publishAction === id ? 'bg-[var(--accent-subtle)] border-[var(--accent-primary)]' : 'bg-[var(--bg-main)] border-[var(--border-color)]'}`}>
                      <div className="font-semibold text-[var(--text-primary)] text-[11px]">{lbl}</div>
                      <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 ” REVIEW */}
          {step === 4 && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] space-y-2">
                <div className="flex justify-between text-[11px]"><span className="text-[var(--text-muted)]">Video</span><span className="text-[var(--text-primary)] truncate max-w-[60%]">{selectedVideo?.title || '”'}</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-[var(--text-muted)]">Platforms</span><span className="text-[var(--text-primary)] uppercase font-mono">{selectedPlatforms.join(', ')}</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-[var(--text-muted)]">Title</span><span className="text-[var(--text-primary)] truncate max-w-[60%]">{title}</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-[var(--text-muted)]">Timing</span><span className="text-[var(--text-primary)] font-mono">
                  {publishAction === 'now' ? 'Publish immediately' : publishAction === 'draft' ? 'Save as draft' : scheduleType === 'smart' ? 'Tomorrow 18:00 (recommended)' : new Date(manualTime).toLocaleString()}
                </span></div>
                <div className="flex justify-between text-[11px]"><span className="text-[var(--text-muted)]">Action</span><span className="text-[var(--text-primary)] capitalize">{publishAction}</span></div>
              </div>
              {accounts.length > 0 && selectedPlatforms.some((p) => !connectedPlatforms.has(p)) && (
                <p className="text-[10px] text-[var(--status-warning)] flex items-center gap-1">
                  <AlertTriangle size={11} /> Some selected platforms have no connected account ” they may fail at publish time.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex justify-between gap-2 pt-2 border-t border-[var(--border-color)]">
          <button
            type="button"
            onClick={step === 0 ? onClose : () => setStep(step - 1)}
            className="px-4 py-2 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium text-xs"
          >
            {step === 0 ? 'Cancel' : 'â† Back'}
          </button>
          {step < 4 ? (
            <button
              type="button"
              onClick={() => canNext && setStep(step + 1)}
              disabled={!canNext}
              className="px-5 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-text)] font-semibold text-xs transition shadow-sm disabled:opacity-40"
            >
              Continue →
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              className="px-5 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-text)] font-semibold text-xs transition shadow-sm"
            >
              {publishAction === 'now' ? 'Publish Now' : publishAction === 'draft' ? 'Save Draft' : 'Schedule Publication'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// 2. New Video Asset Modal
export const NewVideoModal: React.FC<ModalProps> = ({ isOpen, onClose }) => {
  const { createVideo, activeBrandId } = usePublisher();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [hookType, setHookType] = useState<any>('visual_reveal');
  const [editingPace, setEditingPace] = useState<'fast' | 'medium' | 'slow'>('fast');
  const [sceneChangesCount, setSceneChangesCount] = useState(12);
  const [tags, setTags] = useState('ops, product, demo');
  const [thumbnailUrl, setThumbnailUrl] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !activeBrandId) return;

    createVideo({
      brandId: activeBrandId,
      title,
      description,
      durationSeconds: Number(durationSeconds),
      aspectRatio,
      hookType,
      editingPace,
      sceneChangesCount: Number(sceneChangesCount),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      thumbnailUrl:
        thumbnailUrl ||
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&q=80',
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl max-w-lg w-full p-5 space-y-4 max-h-[92vh] overflow-y-auto touch-scroll shadow-2xl my-auto">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Add Video Asset</h3>
            <p className="text-[11px] text-[var(--text-muted)]">Record metadata, duration and creative tags</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-[var(--text-secondary)] font-medium mb-1">Asset Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Master The Infinite Loop Technique"
              className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
              required
            />
          </div>

          <div>
            <label className="block text-[var(--text-secondary)] font-medium mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of asset..."
              className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg p-2.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">Duration (Seconds)</label>
              <input
                type="number"
                min="5"
                max="600"
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(parseInt(e.target.value, 10))}
                className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
            <div>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">Aspect Ratio</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as any)}
                className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="9:16">9:16 (Shorts / Reels / TikTok)</option>
                <option value="16:9">16:9 (Landscape YouTube)</option>
                <option value="1:1">1:1 (Square Feed)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">Hook Style</label>
              <select
                value={hookType}
                onChange={(e) => setHookType(e.target.value as any)}
                className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="visual_reveal">Visual Reveal</option>
                <option value="question">Question Greeting</option>
                <option value="bold_claim">Counter-Intuitive Claim</option>
                <option value="story">Personal Narrative</option>
                <option value="problem_solution">Problem & Fast Solution</option>
              </select>
            </div>
            <div>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">Editing Pace</label>
              <select
                value={editingPace}
                onChange={(e) => setEditingPace(e.target.value as any)}
                className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="fast">Fast (Cuts &lt; 2s)</option>
                <option value="medium">Medium (2-4s cuts)</option>
                <option value="slow">Slow (&gt; 4s cuts)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[var(--text-secondary)] font-medium mb-1">Tags (Comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="ops, tutorial, demo"
              className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-color)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-text)] font-semibold text-xs shadow-sm"
            >
              Save Asset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// 3. New Brand Modal
export const NewBrandModal: React.FC<ModalProps & { brand?: any }> = ({ isOpen, onClose, brand }) => {
  const { createBrand, updateBrand, brands } = usePublisher();
  const isEdit = Boolean(brand);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [industry, setIndustry] = useState('');
  const [website, setWebsite] = useState('');
  const [color, setColor] = useState('#00D6B2');
  const [secondaryColor, setSecondaryColor] = useState('');
  const [guidelines, setGuidelines] = useState('');
  const [timezone, setTimezone] = useState('');
  const [language, setLanguage] = useState('en');
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [customIndustry, setCustomIndustry] = useState('');
  const [tzSearch, setTzSearch] = useState('');
  const [tzOpen, setTzOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const INDUSTRIES = ['Technology & Software','E-commerce & Retail','Food & Beverage','Fashion & Apparel','Beauty & Cosmetics','Health & Wellness','Education','Finance & Banking','Real Estate','Travel & Hospitality','Media & Entertainment','Marketing & Advertising','Automotive','Sports & Fitness','Manufacturing','Professional Services','Non-Profit','Personal Brand','Other'];
  const TIMEZONES = typeof Intl !== 'undefined' ? Intl.supportedValuesOf('timeZone') : ['UTC','Africa/Cairo','Europe/London','America/New_York','Asia/Dubai'];

  useEffect(() => {
    if (!isOpen) return;
    setName(brand?.name || '');
    setDescription(brand?.description || '');
    setIndustry(brand?.industry || '');
    setWebsite(brand?.website || '');
    setColor(brand?.color || '#00D6B2');
    setSecondaryColor(brand?.secondaryColor || '');
    setGuidelines(brand?.brandGuidelines || '');
    setTimezone(brand?.timezone || '');
    setLanguage(brand?.defaultLanguage || 'en');
    setLogoUrl(brand?.logoUrl || brand?.avatarUrl || '');
    setCoverUrl(brand?.coverImageUrl || '');
    setCustomIndustry(brand?.customIndustry || '');
    // Auto-detect browser timezone on create only (never overwrite manual/brand tz)
    setTimezone(brand?.timezone || (isEdit ? '' : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'));
    setErrors({});
  }, [isOpen, brand]);

  if (!isOpen) return null;

  const handleLogo = (file?: File | null) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      setErrors((e) => ({ ...e, logo: 'PNG, JPG, WebP or SVG only' })); return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrors((e) => ({ ...e, logo: 'Max 2MB' })); return;
    }
    const reader = new FileReader();
    reader.onload = () => { setLogoUrl(String(reader.result)); setErrors((e) => ({ ...e, logo: '' })); };
    reader.readAsDataURL(file);
  };

  const handleCover = (file?: File | null) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setErrors((e) => ({ ...e, cover: 'PNG, JPG or WebP only' })); return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setErrors((e) => ({ ...e, cover: 'Max 4MB' })); return;
    }
    const reader = new FileReader();
    reader.onload = () => { setCoverUrl(String(reader.result)); setErrors((e) => ({ ...e, cover: '' })); };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Brand name is required';
    else if (brands.some((b) => b.id !== brand?.id && b.name.toLowerCase() === name.trim().toLowerCase())) errs.name = 'A brand with this name already exists';
    if (website && !/^https?:\/\/.+\..+/.test(website)) errs.website = 'Enter a valid URL (https://…)';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const payload = {
      name: name.trim(), description: description || undefined,
      industry: industry === 'Other' ? (customIndustry.trim() || 'Other') : (industry || undefined),
      website: website || undefined, color, secondaryColor: secondaryColor || undefined,
      brandGuidelines: guidelines || undefined, timezone: timezone || undefined,
      defaultLanguage: language || undefined, logoUrl: logoUrl || undefined, avatarUrl: logoUrl || undefined,
      coverImageUrl: coverUrl || undefined,
      customIndustry: industry === 'Other' ? customIndustry.trim() || undefined : undefined,
    };
    if (isEdit) updateBrand(brand.id, payload);
    else createBrand(payload as any);
    onClose();
  };

  const inp = 'w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]';
  const lbl = 'block text-[var(--text-secondary)] font-medium mb-1';
  const err = (k: string) => errors[k] ? <p className="text-[10px] text-red-400 mt-0.5">{errors[k]}</p> : null;

  return (
    <div className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl my-auto max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{isEdit ? 'Edit Brand' : 'New Brand'}</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className={lbl}>Brand Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Media Corp" className={inp} />
            {err('name')}
          </div>
          <div>
            <label className={lbl}>Logo</label>
            <div className="flex items-center gap-3">
              {logoUrl ? <img src={logoUrl} alt="" className="w-12 h-12 rounded-xl object-cover border border-[var(--border-color)]" /> : <div className="w-12 h-12 rounded-xl bg-[var(--bg-main)] border border-dashed border-[var(--border-color)] flex items-center justify-center text-[var(--text-muted)] text-lg">B</div>}
              <label className="px-3 py-1.5 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]">
                Upload
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => handleLogo(e.target.files?.[0])} />
              </label>
              {logoUrl && <button type="button" onClick={() => setLogoUrl('')} className="text-[10px] text-red-400">Remove</button>}
            </div>
            {err('logo')}
          </div>
          <div>
            <label className={lbl}>Cover image <span className="text-[var(--text-muted)] font-normal">(16:9 recommended, max 4MB)</span></label>
            {coverUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-[var(--border-color)]">
                <img src={coverUrl} alt="" className="w-full h-24 object-cover" />
                <div className="absolute top-1.5 end-1.5 flex gap-1.5">
                  <label className="px-2 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-primary)] text-[10px] cursor-pointer">Replace<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => handleCover(e.target.files?.[0])} /></label>
                  <button type="button" onClick={() => setCoverUrl('')} className="px-2 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-primary)] text-[10px]">Remove</button>
                </div>
              </div>
            ) : (
              <label className="flex items-center justify-center h-24 rounded-lg bg-[var(--bg-main)] border border-dashed border-[var(--border-color)] cursor-pointer hover:border-[var(--accent-primary)] text-[var(--text-muted)] text-[11px]">
                Upload cover (PNG, JPG, WebP)
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => handleCover(e.target.files?.[0])} />
              </label>
            )}
            {err('cover')}
          </div>
          <div>
            <label className={lbl}>Description <span className="text-[var(--text-muted)] font-normal">({description.length}/500)</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 500))} rows={2} className={inp} placeholder="What this brand represents…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Website</label>
              <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" className={inp} />
              {err('website')}
            </div>
            <div>
              <label className={lbl}>Industry</label>
              <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={inp}>
                <option value="">Select industry…</option>
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
              {industry === 'Other' && (
                <input type="text" value={customIndustry} onChange={(e) => setCustomIndustry(e.target.value)} placeholder="Specify industry…" className={`${inp} mt-1.5`} />
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Primary color</label>
              <div className="flex items-center gap-1.5"><input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 rounded border border-[var(--border-color)] cursor-pointer bg-transparent" /><span className="font-mono text-[10px]">{color}</span></div>
            </div>
            <div>
              <label className={lbl}>Secondary color</label>
              <input type="color" value={secondaryColor || 'var(--border-color)'} onChange={(e) => setSecondaryColor(e.target.value)} className="w-8 h-8 rounded border border-[var(--border-color)] cursor-pointer bg-transparent" />
            </div>
            <div className="relative">
              <label className={lbl}>Timezone</label>
              <input type="text" value={tzSearch || timezone} onChange={(e) => { setTzSearch(e.target.value); setTzOpen(true); setTimezone(''); }} onFocus={() => setTzOpen(true)} placeholder="Search timezone…" className={inp} />
              {tzOpen && (
                <div className="absolute z-20 mt-1 w-full max-h-44 overflow-y-auto bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg shadow-xl">
                  {(tzSearch ? TIMEZONES.filter((t) => t.toLowerCase().includes(tzSearch.toLowerCase())) : TIMEZONES.slice(0, 30)).slice(0, 50).map((t) => (
                    <button key={t} type="button" onClick={() => { setTimezone(t); setTzSearch(''); setTzOpen(false); }} className="w-full text-start px-3 py-1.5 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-main)] font-mono">{t}</button>
                  ))}
                </div>
              )}
              {timezone && <p className="text-[9px] font-mono text-[var(--accent-primary)] mt-0.5">{timezone}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Default language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inp}>
                <option value="en">English</option><option value="ar">العربية</option><option value="fr">Français</option><option value="es">Español</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Brand guidelines</label>
              <input type="text" value={guidelines} onChange={(e) => setGuidelines(e.target.value)} placeholder="Tone, rules…" className={inp} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-color)]">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-secondary)]">Cancel</button>
            <button type="submit" className="px-5 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] font-semibold">{isEdit ? 'Save Changes' : 'Create Brand'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
