import React, { useState, useRef } from 'react';
import { usePublisher } from '../context/PublisherContext';
import { Platform, VideoAsset, PlatformContentVariant, AIVideoAnalysisResult } from '../types';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Send,
  Layers,
  Sliders,
  Play,
  RotateCw,
  Film,
  Video,
  ThumbsUp,
  Clock,
  Eye,
  Hash,
  Share2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

export const AIVideoStudioView: React.FC<{ setActiveTab?: (tab: string) => void }> = ({ setActiveTab }) => {
  const { videos, aiVideoResults, saveAIVideoResult, deleteAIVideoResult, approvePlatformVariant, createPost, accounts, brands, posts, updateBrand } = usePublisher();

  const [selectedVideoId, setSelectedVideoId] = useState<string>(videos[0]?.id || '');
  const [tone, setTone] = useState<string>('Engaging & High-Converting');
  const [brandVoice, setBrandVoice] = useState<string>('Direct, authoritative, zero-fluff');
  const [wordsToAvoid, setWordsToAvoid] = useState<string>('cringe, subscribe right now, smash that like button');
  const [wordsToPrioritize, setWordsToPrioritize] = useState<string>('workflow, retention, real-time, 10x');
  const [targetPlatforms, setTargetPlatforms] = useState<Platform[]>(['youtube', 'tiktok', 'instagram', 'facebook']);
  const [activePlatformTab, setActivePlatformTab] = useState<Platform>('youtube');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [vidSearch, setVidSearch] = useState('');
  const [vidBrandFilter, setVidBrandFilter] = useState('all');
  const [vidSort, setVidSort] = useState<'newest' | 'oldest' | 'duration'>('newest');
  const [showPreview, setShowPreview] = useState(false);
  const [audienceDesc, setAudienceDesc] = useState('');
  const [objective, setObjective] = useState('awareness');
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const currentVideo = videos.find((v) => v.id === selectedVideoId) || videos[0] || null;
  const analysisResult: AIVideoAnalysisResult | undefined = selectedVideoId ? aiVideoResults[selectedVideoId] : undefined;
  const selectedVideo = videos.find((v) => v.id === selectedVideoId);
  const selectedBrand = selectedVideo ? brands.find((b: any) => b.id === selectedVideo.brandId) : null;

  const applyBrandVoice = () => {
    if (!selectedBrand?.voiceProfile) { setFeedbackMsg('This brand has no saved voice profile.'); setTimeout(() => setFeedbackMsg(null), 3000); return; }
    const vp = selectedBrand.voiceProfile;
    setBrandVoice([vp.personality, vp.communicationStyle, vp.formality, vp.vocabulary, vp.audienceRelationship].filter(Boolean).join(', ') || brandVoice);
    if (vp.avoidPhrases) setWordsToAvoid((prev) => prev ? `${prev}, ${vp.avoidPhrases}` : vp.avoidPhrases!);
    setFeedbackMsg('Brand voice applied to this analysis.');
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const saveBrandVoice = () => {
    if (!selectedBrand) return;
    updateBrand(selectedBrand.id, {
      voiceProfile: {
        personality: tone,
        communicationStyle: brandVoice,
        avoidPhrases: wordsToAvoid,
      },
    });
    setFeedbackMsg('Saved as brand voice default.');
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRunAnalysis = async () => {
    if (!currentVideo) {
      setFeedbackMsg('Please select or upload a video asset first.');
      setTimeout(() => setFeedbackMsg(null), 3000);
      return;
    }

    setIsAnalyzing(true);
    setFeedbackMsg(null);

    try {
      const res = await apiFetch('/api/ai/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: currentVideo.id,
          videoTitle: currentVideo.title,
          description: currentVideo.description,
          durationSeconds: currentVideo.durationSeconds,
          aspectRatio: currentVideo.aspectRatio,
          hookType: currentVideo.hookType,
          targetPlatforms,
          tone,
          brandVoice,
          wordsToAvoid,
          wordsToPrioritize,
          audienceDescription: audienceDesc,
          contentObjective: objective,
        }),
      });

      const data = await res.json();
      if (data.success) {
        saveAIVideoResult(currentVideo.id, {
          videoId: currentVideo.id,
          summary: data.summary,
          hookAnalysis: data.hookAnalysis,
          visualScenes: data.visualScenes || [],
          scenes: data.scenes || [],
          transcript: data.transcript || null,
          evidenceBasis: data.evidenceBasis || 'metadata_only',
          contentCategory: data.contentCategory || 'General',
          suggestedAudience: data.suggestedAudience || 'Creators & General Audience',
          variants: data.variants || {},
          analyzedAt: data.analyzedAt,
        });
        setFeedbackMsg('Video Intelligence breakdown generated across selected platforms.');
      } else {
        setFeedbackMsg(`Analysis failed: ${data.error || 'Server error'}`);
      }
    } catch (e: any) {
      setFeedbackMsg(`Connection error: ${e.message}`);
    } finally {
      setIsAnalyzing(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  const handleApproveAllAndQueue = () => {
    if (!currentVideo || !analysisResult) return;

    let queuedCount = 0;
    let skippedCount = 0;
    const now = Date.now();
    const existingForVideo = (posts || []).filter((p: any) => p.videoId === currentVideo.id);

    targetPlatforms.forEach((plat, idx) => {
      const variant = analysisResult.variants[plat];
      if (!variant) return;

      // Only queue explicitly approved variants
      if (!variant.approved) { skippedCount++; return; }

      // Validate a connected channel exists for this platform + brand
      const hasChannel = (accounts || []).some((a: any) =>
        a.brandId === currentVideo.brandId &&
        (a.platform === plat || a.platforms?.includes?.(plat)) &&
        (a.isConnected !== false)
      );
      if (!hasChannel) { skippedCount++; setFeedbackMsg(`No connected ${plat} channel for this brand — variant not queued.`); return; }

      // Duplicate prevention: same video+platform already queued/published
      const dup = existingForVideo.some((p: any) =>
        p.channelPlatforms?.includes(plat) && ['scheduled', 'publishing', 'published'].includes(p.status)
      );
      if (dup) { skippedCount++; return; }

      approvePlatformVariant(currentVideo.id, plat, true);

      createPost({
        brandId: currentVideo.brandId,
        projectId: currentVideo.projectId,
        videoId: currentVideo.id,
        channelPlatforms: [plat],
        title: variant.title || currentVideo.title,
        caption: variant.caption,
        hashtags: variant.hashtags,
        scheduledTime: new Date(now + (idx + 1) * 90 * 60 * 1000).toISOString(),
        status: 'scheduled',
        mode: 'assisted',
        optimizedByAutopilot: true,
        lockedForPublishing: false,
        reviewStatus: 'approved',
      });
      queuedCount++;
    });

    setFeedbackMsg(queuedCount > 0
      ? `${queuedCount} approved variant(s) queued${skippedCount ? `, ${skippedCount} skipped` : ''}.`
      : 'No approved variants to queue — approve platforms first.');

    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const togglePlatform = (p: Platform) => {
    setTargetPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 hero-banner-gradient border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-[#00D6B2] border border-cyan-500/30 text-xs font-mono font-semibold uppercase tracking-wider">
              Module 04 • Content Intelligence Engine
            </span>
            <span className="text-xs text-[var(--text-secondary)] font-mono">Real-Time Scene & Speech Breakdown</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight flex items-center gap-3">
            <Sparkles className="text-[#00D6B2]" size={28} />
            AI Video Intelligence & Platform Studio
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)] max-w-2xl">
            Generates distinct, native formats tailored for YouTube SEO, TikTok engagement loops, Instagram Reels saves, and Facebook discussions. Review, edit, and approve before queueing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleRunAnalysis}
            disabled={isAnalyzing || !currentVideo}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00D6B2] to-teal-500 text-black font-bold text-sm hover:opacity-90 disabled:opacity-50 transition flex items-center gap-2 shadow-lg shadow-teal-500/20 cursor-pointer"
          >
            {isAnalyzing ? (
              <>
                <RotateCw className="animate-spin" size={16} />
                Analyzing Video Scenes...
              </>
            ) : (
              <>
                <Play size={16} fill="currentColor" />
                Run AI Video Intelligence
              </>
            )}
          </button>

          {analysisResult && (
            <button
              onClick={handleApproveAllAndQueue}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[var(--text-primary)] font-semibold text-sm transition flex items-center gap-2 shadow cursor-pointer"
            >
              <Send size={15} />
              Approve All & Schedule
            </button>
          )}
        </div>
      </div>

      {feedbackMsg && (
        <div className="p-4 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-200 text-sm flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-[#00D6B2]" />
            <span>{feedbackMsg}</span>
          </div>
        </div>
      )}

      {/* Main Grid: Left Controls & Right Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Asset Selection & AI Customization (4 Cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Video Asset Picker */}
          <div className="bg-[var(--bg-surface)]/80 border border-[var(--border-color)] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                <Video size={16} className="text-[#00D6B2]" />
                Select Video Asset
              </h2>
              <span className="text-xs font-mono text-[var(--text-secondary)]">{videos.length} in library</span>
            </div>

            {videos.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-[var(--border-color)] text-center text-xs text-[var(--text-secondary)] space-y-3">
                <Film className="mx-auto text-[var(--text-muted)]" size={24} />
                <p className="font-semibold text-[var(--text-secondary)]">No videos in your library yet</p>
                <p className="text-[11px] text-[var(--text-muted)]">Upload a video, import from Google Drive, or create one in Add Video.</p>
                <div className="flex justify-center gap-2 pt-1">
                  {setActiveTab && <button onClick={() => setActiveTab('videos')} className="px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-[#00D6B2] text-[11px] font-semibold">Video Library</button>}
                  {setActiveTab && <button onClick={() => setActiveTab('drive')} className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-[var(--text-secondary)] text-[11px] font-semibold">Google Drive</button>}
                </div>
              </div>
            ) : (
              <>
                {/* Search + filters */}
                <div className="space-y-2">
                  <input value={vidSearch} onChange={(e) => setVidSearch(e.target.value)} placeholder="Search videos…" className="w-full bg-[var(--bg-input)]/60 border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] placeholder-slate-500" />
                  <div className="flex gap-2">
                    <select value={vidBrandFilter} onChange={(e) => setVidBrandFilter(e.target.value)} className="flex-1 bg-[var(--bg-input)]/60 border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-secondary)]">
                      <option value="all">All brands</option>
                      {(brands || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <select value={vidSort} onChange={(e) => setVidSort(e.target.value as any)} className="flex-1 bg-[var(--bg-input)]/60 border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-secondary)]">
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="duration">Longest</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pe-1">
                  {videos
                    .filter((v) => {
                      if (vidBrandFilter !== 'all' && v.brandId !== vidBrandFilter) return false;
                      if (vidSearch && !v.title.toLowerCase().includes(vidSearch.toLowerCase()) && !(v.fileName || '').toLowerCase().includes(vidSearch.toLowerCase())) return false;
                      return true;
                    })
                    .sort((a, b) => vidSort === 'duration' ? (b.durationSeconds || 0) - (a.durationSeconds || 0) : vidSort === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt))
                    .map((vid) => {
                  const isSelected = vid.id === selectedVideoId;
                  const hasResult = Boolean(aiVideoResults[vid.id]);
                  return (
                    <button
                      key={vid.id}
                      onClick={() => setSelectedVideoId(vid.id)}
                      className={`w-full text-start p-3 rounded-xl border text-xs transition flex items-start justify-between gap-2 ${
                        isSelected
                          ? 'bg-cyan-950/40 border-[#00D6B2]/60 text-[var(--text-primary)] shadow-sm'
                          : 'bg-[var(--bg-input)]/40 border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--border-color)]'
                      }`}
                    >
                      <div className="truncate flex-1">
                        <div className="font-semibold truncate text-[var(--text-primary)]">{vid.title}</div>
                        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 flex items-center gap-2">
                          <span>{vid.durationSeconds}s</span>
                          <span>•</span>
                          <span>{vid.aspectRatio}</span>
                          <span>•</span>
                          <span className="capitalize">{vid.hookType.replace('_', ' ')}</span>
                        </div>
                      </div>
                      {hasResult && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-500/30">
                          Analyzed
                        </span>
                      )}
                    </button>
                  );
                })}
                </div>
                {selectedVideo?.fileUrl && (
                  <button onClick={() => setShowPreview(!showPreview)} className="text-[10px] text-[#00D6B2] hover:underline">
                    {showPreview ? 'Hide preview' : 'Preview selected video'}
                  </button>
                )}
                {showPreview && selectedVideo?.fileUrl && (
                  <video ref={previewRef} src={selectedVideo.fileUrl} controls className="w-full rounded-lg max-h-40 bg-black" />
                )}
              </>
            )}
          </div>

          {/* Analysis Library */}
          {Object.keys(aiVideoResults).length > 0 && (
            <div className="bg-[var(--bg-surface)]/80 border border-[var(--border-color)] rounded-2xl p-5 space-y-3">
              <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">Saved Analyses</h2>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {Object.entries(aiVideoResults).map(([vidId, r]: [string, any]) => {
                  const v = videos.find((x) => x.id === vidId);
                  const approvedCount = Object.values(r.variants || {}).filter((x: any) => x?.approved).length;
                  return (
                    <div key={vidId} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[var(--bg-input)]/40 border border-[var(--border-color)] text-xs">
                      <button onClick={() => setSelectedVideoId(vidId)} className="flex-1 text-start min-w-0">
                        <p className="text-[var(--text-primary)] font-medium truncate">{v?.title || vidId}</p>
                        <p className="text-[10px] font-mono text-[var(--text-muted)]">{new Date(r.analyzedAt).toLocaleDateString()} · {approvedCount} approved · {Object.keys(r.variants || {}).length} platforms</p>
                      </button>
                      <button onClick={() => { if (confirm('Delete this saved analysis? The video is preserved.')) deleteAIVideoResult(vidId); }} className="text-[10px] text-rose-400 hover:underline flex-shrink-0">Delete</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Customization Controls */}
          <div className="bg-[var(--bg-surface)]/80 border border-[var(--border-color)] rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
              <Sliders size={16} className="text-[#00D6B2]" />
              AI Studio Tuning
            </h2>

            {/* Audience & Objective */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-secondary)]">Target Audience</label>
                <input value={audienceDesc} onChange={(e) => setAudienceDesc(e.target.value)} placeholder="e.g. small business owners" className="w-full mt-1 bg-[var(--bg-input)]/60 border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)]" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-secondary)]">Content Objective</label>
                <select value={objective} onChange={(e) => setObjective(e.target.value)} className="w-full mt-1 bg-[var(--bg-input)]/60 border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)]">
                  {['awareness','education','engagement','community','traffic','leads','promotion','sales','entertainment'].map((o) => <option key={o} value={o} className="capitalize">{o}</option>)}
                </select>
              </div>
            </div>

            {/* Target Platforms Toggle */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Generate For Platforms:</label>
              <div className="grid grid-cols-2 gap-2">
                {(['youtube', 'tiktok', 'instagram', 'facebook'] as Platform[]).map((p) => {
                  const isChecked = targetPlatforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={`py-2 px-3 rounded-xl border text-xs font-medium capitalize flex items-center justify-between transition ${
                        isChecked
                          ? 'bg-indigo-950/50 border-indigo-500/60 text-[var(--text-primary)] font-semibold'
                          : 'bg-[var(--bg-input)]/20 border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--border-color)]'
                      }`}
                    >
                      <span>{p}</span>
                      {isChecked ? <CheckCircle2 size={13} className="text-[#00D6B2]" /> : <span className="w-3 h-3 rounded-full border border-[var(--border-color)]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tone & Brand Voice */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Content Tone</label>
                <input
                  type="text"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="mt-1 w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]"
                  placeholder="e.g. Energetic, authoritative, educational"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--text-secondary)]">Brand Voice</label>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={applyBrandVoice} disabled={!selectedBrand?.voiceProfile} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-[#00D6B2] disabled:opacity-40">Apply brand</button>
                    <button type="button" onClick={saveBrandVoice} disabled={!selectedBrand} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-[var(--text-secondary)] disabled:opacity-40">Save as default</button>
                  </div>
                </div>
                <input
                  type="text"
                  value={brandVoice}
                  onChange={(e) => setBrandVoice(e.target.value)}
                  className="mt-1 w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]"
                  placeholder="e.g. Value-driven, conversational, direct"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Keywords to Prioritize</label>
                <input
                  type="text"
                  value={wordsToPrioritize}
                  onChange={(e) => setWordsToPrioritize(e.target.value)}
                  className="mt-1 w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Words / Clichés to Avoid</label>
                <input
                  type="text"
                  value={wordsToAvoid}
                  onChange={(e) => setWordsToAvoid(e.target.value)}
                  className="mt-1 w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: AI Analysis & Multi-Platform Outputs (8 Cols) */}
        <div className="lg:col-span-8 space-y-5">
          {!analysisResult ? (
            <div className="bg-[var(--bg-surface)]/60 border border-[var(--border-color)] rounded-2xl p-12 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-[#00D6B2] flex items-center justify-center mx-auto">
                <Sparkles size={28} />
              </div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">No Analysis Generated Yet</h3>
              <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
                Select a video asset and click <strong className="text-[var(--text-primary)]">Run AI Video Intelligence</strong> to generate native platform copy, scene breakdowns, and hook scores.
              </p>
            </div>
          ) : (
            <>
              {/* Executive Breakdown Card */}
              <div className="bg-[var(--bg-surface)]/80 border border-[var(--border-color)] rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">Video Intelligence Breakdown</h3>
                  </div>
                  <span className="text-xs font-mono text-[var(--text-secondary)]">
                    Analyzed at {new Date(analysisResult.analyzedAt).toLocaleTimeString()}
                  </span>
                </div>

                <p className="text-sm text-[var(--text-primary)] leading-relaxed bg-[var(--bg-input)]/40 p-3.5 rounded-xl border border-[var(--border-color)]">
                  {analysisResult.summary}
                </p>

                {/* Hook & Retention Score */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[var(--bg-input)]/30 border border-[var(--border-color)] rounded-xl p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--text-secondary)]">0-3s Opening Hook</span>
                      <span className="text-[11px] font-mono text-[#00D6B2] font-bold">
                        Score: {analysisResult.hookAnalysis.retentionScore}/100
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-primary)] font-medium italic">
                      "{analysisResult.hookAnalysis.text}"
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)]">{analysisResult.hookAnalysis.feedback}</p>
                  </div>

                  <div className="bg-[var(--bg-input)]/30 border border-[var(--border-color)] rounded-xl p-3.5 space-y-1.5">
                    <span className="text-xs font-semibold text-[var(--text-secondary)]">Visual Scenes & Pacing</span>
                    <div className="space-y-1 text-xs">
                      {analysisResult.visualScenes.slice(0, 3).map((scene, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px]">
                          <span className="font-mono text-cyan-400">{scene.timestamp}</span>
                          <span className="text-[var(--text-secondary)] truncate max-w-[200px]">{scene.description}</span>
                          <span className="text-[10px] uppercase font-mono px-1 py-0.5 rounded bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]">
                            {scene.pace}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Scene Timeline + Transcript */}
                {((analysisResult as any).scenes?.length > 0 || (analysisResult as any).transcript?.segments?.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Scene timeline */}
                    <div className="bg-[var(--bg-input)]/30 border border-[var(--border-color)] rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">Scene Timeline</span>
                        <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase">{(analysisResult as any).evidenceBasis === 'video_file' ? 'video file' : 'metadata only'}</span>
                      </div>
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {((analysisResult as any).scenes || []).map((s: any, i: number) => (
                          <button key={i} type="button" onClick={() => { if (previewRef.current && s.startSeconds != null) { previewRef.current.currentTime = s.startSeconds; previewRef.current.play().catch(() => {}); } }}
                            className="w-full text-start p-2 rounded-lg bg-[var(--bg-surface)]/50 border border-[var(--border-color)] hover:border-[#00D6B2]/40 transition">
                            <div className="flex items-center justify-between text-[10px] font-mono">
                              <span className="text-[#00D6B2]">#{s.index ?? i + 1} · {Math.floor((s.startSeconds || 0) / 60)}:{String(Math.floor((s.startSeconds || 0) % 60)).padStart(2, '0')}–{Math.floor((s.endSeconds || 0) / 60)}:{String(Math.floor((s.endSeconds || 0) % 60)).padStart(2, '0')}</span>
                              {s.isHook && <span className="text-amber-300">HOOK</span>}
                              {s.importance === 'key' && <span className="text-cyan-300">KEY</span>}
                            </div>
                            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 line-clamp-2">{s.description}</p>
                            {s.onScreenText && <p className="text-[9px] text-[var(--text-muted)] mt-0.5">"{s.onScreenText}"</p>}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Transcript */}
                    <div className="bg-[var(--bg-input)]/30 border border-[var(--border-color)] rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">Transcript</span>
                        {((analysisResult as any).transcript?.language) && <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase">{(analysisResult as any).transcript.language}</span>}
                      </div>
                      {!(analysisResult as any).transcript?.hasSpeech ? (
                        <p className="text-[11px] text-[var(--text-muted)]">No usable speech detected in this video.</p>
                      ) : (
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                          {((analysisResult as any).transcript?.segments || []).map((seg: any, i: number) => (
                            <button key={i} type="button" onClick={() => { if (previewRef.current && seg.startSeconds != null) { previewRef.current.currentTime = seg.startSeconds; previewRef.current.play().catch(() => {}); } }}
                              className="w-full text-start p-1.5 rounded hover:bg-[var(--bg-surface-hover)] transition">
                              <span className="text-[9px] font-mono text-[#00D6B2]">{Math.floor((seg.startSeconds || 0) / 60)}:{String(Math.floor((seg.startSeconds || 0) % 60)).padStart(2, '0')}</span>
                              <span className="text-[10px] text-[var(--text-secondary)] ms-1.5">{seg.speaker ? `[${seg.speaker}] ` : ''}</span>
                              <span className="text-[11px] text-[var(--text-secondary)]">{seg.text}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>

              {/* Platform-Specific Tabbed Editor & Approval */}
              <div className="bg-[var(--bg-surface)]/80 border border-[var(--border-color)] rounded-2xl p-5 space-y-5">
                {/* Platform Tabs */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] pb-4">
                  <div className="flex items-center gap-2">
                    {(['youtube', 'tiktok', 'instagram', 'facebook'] as Platform[]).map((p) => {
                      const v = analysisResult.variants[p];
                      const isActive = activePlatformTab === p;
                      return (
                        <button
                          key={p}
                          onClick={() => setActivePlatformTab(p)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize transition flex items-center gap-1.5 ${
                            isActive
                              ? 'bg-[#00D6B2] text-black font-bold shadow'
                              : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
                          }`}
                        >
                          <span>{p}</span>
                          {v?.approved && <CheckCircle2 size={12} className={isActive ? 'text-black' : 'text-emerald-400'} />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Single Platform Approval Toggle */}
                  {analysisResult.variants[activePlatformTab] && (
                    <button
                      onClick={() => {
                        const currentApproved = Boolean(analysisResult.variants[activePlatformTab]?.approved);
                        approvePlatformVariant(selectedVideoId, activePlatformTab, !currentApproved);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                        analysisResult.variants[activePlatformTab]?.approved
                          ? 'bg-emerald-950 border border-emerald-500/50 text-emerald-300'
                          : 'bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <CheckCircle2 size={13} />
                      {analysisResult.variants[activePlatformTab]?.approved ? 'Approved for Queue' : 'Mark as Approved'}
                    </button>
                  )}
                </div>

                {/* Tab Content */}
                {(() => {
                  const variant = analysisResult.variants[activePlatformTab];
                  if (!variant) {
                    return (
                      <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
                        No content generated for {activePlatformTab}. Enable this platform in the left settings panel and re-run.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      {/* Title if YouTube */}
                      {variant.title && (
                        <div>
                          <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)] mb-1">
                            <span>Platform Title (SEO)</span>
                            <button
                              onClick={() => handleCopy(variant.title!, 'title')}
                              className="text-cyan-400 hover:text-[var(--text-primary)] flex items-center gap-1 text-[11px]"
                            >
                              {copiedKey === 'title' ? <Check size={12} /> : <Copy size={12} />}
                              Copy Title
                            </button>
                          </div>
                          <input
                            type="text"
                            value={variant.title}
                            onChange={(e) => {
                              const nv = { ...analysisResult.variants, [activePlatformTab]: { ...variant, title: e.target.value, edited: true } };
                              saveAIVideoResult(selectedVideoId, { ...analysisResult, variants: nv });
                            }}
                            className="w-full bg-[var(--bg-input)]/80 border border-[var(--border-color)] rounded-xl px-3.5 py-2 text-xs text-[var(--text-primary)] font-medium focus:border-[#00D6B2]/50 outline-none"
                          />
                        </div>
                      )}

                      {/* Main Caption */}
                      <div>
                        <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)] mb-1">
                          <span>Tailored Caption</span>
                          <button
                            onClick={() => handleCopy(variant.caption, 'caption')}
                            className="text-cyan-400 hover:text-[var(--text-primary)] flex items-center gap-1 text-[11px]"
                          >
                            {copiedKey === 'caption' ? <Check size={12} /> : <Copy size={12} />}
                            Copy Caption
                          </button>
                        </div>
                        <textarea
                          rows={6}
                          value={variant.caption}
                          onChange={(e) => {
                            const nv = { ...analysisResult.variants, [activePlatformTab]: { ...variant, caption: e.target.value, edited: true } };
                            saveAIVideoResult(selectedVideoId, { ...analysisResult, variants: nv });
                          }}
                          className="w-full bg-[var(--bg-input)]/80 border border-[var(--border-color)] rounded-xl p-3.5 text-xs text-[var(--text-primary)] leading-relaxed font-mono focus:border-[#00D6B2]/50 outline-none"
                        />
                      </div>

                      {/* Hashtags & CTA */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1">
                            <Hash size={13} /> Recommended Hashtags
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {variant.hashtags.map((h, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-[11px] font-mono"
                              >
                                {h}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold text-[var(--text-secondary)]">Call to Action (CTA)</span>
                          <input
                            type="text"
                            value={variant.callToAction || ''}
                            onChange={(e) => {
                              const nv = { ...analysisResult.variants, [activePlatformTab]: { ...variant, callToAction: e.target.value, edited: true } };
                              saveAIVideoResult(selectedVideoId, { ...analysisResult, variants: nv });
                            }}
                            className="w-full bg-[var(--bg-input)]/50 border border-[var(--border-color)] rounded-xl px-2.5 py-2 text-xs text-[var(--text-primary)] focus:border-[#00D6B2]/50 outline-none"
                          />
                        </div>
                      </div>

                      {/* Char counts + edited indicator */}
                      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] pt-1 border-t border-[var(--border-color)]">
                        <span>{variant.caption?.length || 0} chars · {variant.hashtags?.length || 0} hashtags</span>
                        {variant.edited && <span className="text-amber-300">Edited draft — not yet approved</span>}
                      </div>

                      {/* Sound Cue if TikTok */}
                      {variant.soundOrAudioCue && (
                        <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
                          <Sparkles size={14} className="text-amber-400 flex-shrink-0" />
                          <span>Sound Cue: {variant.soundOrAudioCue}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};