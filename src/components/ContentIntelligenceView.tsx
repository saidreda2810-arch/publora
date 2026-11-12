import React, { useState } from 'react';
import { usePublisher } from '../context/PublisherContext';
import {
  Sparkles,
  Zap,
  Clock,
  Film,
  Scissors,
  CheckCircle2,
  TrendingUp,
  Loader2,
  Wand2,
  BarChart3,
  HelpCircle,
  Copy,
  Check,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

export const ContentIntelligenceView: React.FC = () => {
  const { videos, analytics, activeBrand } = usePublisher();

  const [inspectTitle, setInspectTitle] = useState('');
  const [inspectDuration, setInspectDuration] = useState('30');
  const [inspectPlatform, setInspectPlatform] = useState('YouTube Shorts');
  const [inspectOutline, setInspectOutline] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [inspectionResult, setInspectionResult] = useState<any | null>(null);

  const [hookTopic, setHookTopic] = useState('');
  const [hookStyle, setHookStyle] = useState('Curiosity & Pattern Interrupt');
  const [generatingHooks, setGeneratingHooks] = useState(false);
  const [generatedHooks, setGeneratedHooks] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectTitle) return;
    setInspecting(true);
    setInspectionResult(null);

    try {
      const res = await apiFetch('/api/ai/inspect-creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: inspectTitle,
          targetDuration: parseInt(inspectDuration, 10),
          targetPlatform: inspectPlatform,
          scriptOrOutline: inspectOutline,
        }),
      });
      const data = await res.json();
      setInspectionResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setInspecting(false);
    }
  };

  const handleGenerateHooks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hookTopic) return;
    setGeneratingHooks(true);

    try {
      const res = await apiFetch('/api/ai/generate-hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: hookTopic,
          hookStyle,
          targetAudience: activeBrand?.targetAudience || 'General digital audience',
        }),
      });
      const data = await res.json();
      setGeneratedHooks(data.hooks || []);
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingHooks(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const hookCorrelations = [
    { type: 'Visual Reveal', count: 4, avgRetention3s: 86.4, avgCompletion: 74.2, status: 'Top Performer' },
    { type: 'Question Hook', count: 6, avgRetention3s: 58.1, avgCompletion: 42.0, status: 'Below Average' },
    { type: 'Bold Claim / Shock', count: 5, avgRetention3s: 79.5, avgCompletion: 66.8, status: 'Strong Hold' },
    { type: 'Problem / Solution', count: 7, avgRetention3s: 71.0, avgCompletion: 54.5, status: 'Moderate' },
  ];

  const paceCorrelations = [
    { pace: 'Fast (< 2.0s per cut)', avgDurationWatched: '82%', avgViews: '28,400', lift: '+48%' },
    { pace: 'Medium (2.0 - 4.0s)', avgDurationWatched: '61%', avgViews: '12,200', lift: 'Baseline' },
    { pace: 'Slow (> 4.0s per cut)', avgDurationWatched: '34%', avgViews: '3,100', lift: '-65%' },
  ];

  return (
    <div className="w-full max-w-[1800px] mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="border-b border-[var(--border-color)] pb-5 sm:pb-6">
        <div className="flex items-center space-x-2 text-[11px] font-mono text-[#00D6B2] mb-1">
          <Sparkles className="w-3.5 h-3.5" />
          <span className="truncate">ANALYTICAL LAYER D • CONTENT PERFORMANCE INTELLIGENCE</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
          Creative Characteristics & Algorithmic Correlation
        </h1>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
          Discover how opening hook styles, editing pace, video length, and scene changes statistically impact your audience watch behavior.
        </p>
      </div>

      {/* Correlation Insights Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Hook Styles Correlation */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
                <Zap className="w-4 h-4 text-[#00D6B2]" />
                <span>Hook Architecture vs 3-Second Retention</span>
              </h3>
              <span className="text-[10px] sm:text-[11px] font-mono text-[var(--text-secondary)]">Sample: {videos.length} Videos</span>
            </div>

            <div className="space-y-2.5 sm:space-y-3">
              {hookCorrelations.map((item, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-[var(--bg-surface)]/60 border border-[var(--border-color)] space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--text-primary)]">{item.type}</span>
                    <span
                      className={`font-mono font-bold ${
                        item.avgRetention3s >= 75 ? 'text-[#00D6B2]' : item.avgRetention3s < 60 ? 'text-red-400' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {item.avgRetention3s}% @ 3s
                    </span>
                  </div>

                  <div className="w-full h-2 rounded-full bg-[var(--bg-input)] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        item.avgRetention3s >= 75
                          ? 'bg-gradient-to-r from-[#00D6B2] to-[#087F78]'
                          : item.avgRetention3s < 60
                          ? 'bg-red-500'
                          : 'bg-amber-400'
                      }`}
                      style={{ width: `${item.avgRetention3s}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[var(--text-secondary)]">
                    <span>Full Completion: {item.avgCompletion}%</span>
                    <span className="px-1.5 py-0.5 rounded bg-[var(--bg-surface-hover)] font-mono">{item.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 p-3 rounded-xl bg-[#00D6B2]/10 border border-[#00D6B2]/20 text-[11px] sm:text-xs text-[var(--text-secondary)] leading-relaxed">
            <span className="font-bold text-[#00D6B2]">Intelligence Rule:</span> Visual Reveal and Pattern Interrupt hooks retain <span className="font-semibold text-[var(--text-primary)]">+28.3%</span> more viewers at second 3 compared to rhetorical question greetings.
          </div>
        </div>

        {/* Editing Pace Correlation */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
                <Scissors className="w-4 h-4 text-[#ADF5E8]" />
                <span>Editing Pace vs Total Watch Time</span>
              </h3>
              <span className="text-[10px] sm:text-[11px] font-mono text-[var(--text-secondary)]">Scene Cut Frequency</span>
            </div>

            <div className="space-y-2.5 sm:space-y-4">
              {paceCorrelations.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 sm:p-3.5 rounded-xl bg-[var(--bg-surface)]/60 border border-[var(--border-color)]">
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">{p.pace}</div>
                    <div className="text-[10px] sm:text-[11px] text-[var(--text-secondary)]">Avg Watch: {p.avgDurationWatched}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold text-[var(--text-primary)]">{p.avgViews} views</div>
                    <div className={`text-[10px] sm:text-[11px] font-mono font-semibold ${p.lift.startsWith('+') ? 'text-[#00D6B2]' : p.lift.startsWith('-') ? 'text-red-400' : 'text-[var(--text-secondary)]'}`}>
                      {p.lift} vs Baseline
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 sm:mt-6 p-3.5 sm:p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-1 sm:space-y-2">
            <div className="text-xs font-bold text-[#ADF5E8] flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Duration Sweet-Spot Analysis</span>
            </div>
            <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] leading-relaxed">
              Videos under <span className="text-[var(--text-primary)] font-semibold">30 seconds</span> exhibit the highest algorithmic loop factor (1.4x - 1.8x rewatch score). Explanatory formats between 45“60s require a scene transition every 2.2 seconds to prevent mid-timeline drop-off.
            </p>
          </div>
        </div>
      </div>

      {/* AI Creative Video Inspector */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 glow-blue space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--border-color)] pb-3 sm:pb-4 gap-2">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#087F78]/20 border border-[#087F78]/40 flex items-center justify-center text-[#ADF5E8] flex-shrink-0">
              <Film className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">AI Video Script & Creative Structure Inspector</h3>
              <p className="text-[11px] sm:text-xs text-[var(--text-secondary)]">
                Inspect video outlines and scripts before recording to identify pacing bottlenecks and weak hooks.
              </p>
            </div>
          </div>
          <span className="text-[10px] sm:text-xs font-mono px-2 py-0.5 sm:py-1 rounded bg-[#087F78]/30 text-[#ADF5E8] border border-[#087F78]/40 self-start sm:self-auto">
            Gemini 3.8 Flash
          </span>
        </div>

        <form onSubmit={handleInspect} className="space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            <div className="sm:col-span-2 md:col-span-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Video Working Title</label>
              <input
                type="text"
                value={inspectTitle}
                onChange={(e) => setInspectTitle(e.target.value)}
                placeholder="e.g. 3 Coding Mistakes That Cost Millions"
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs sm:text-sm text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Target Duration</label>
              <select
                value={inspectDuration}
                onChange={(e) => setInspectDuration(e.target.value)}
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]"
              >
                <option value="15">15 seconds (Micro Tip)</option>
                <option value="30">30 seconds (Standard Reel)</option>
                <option value="45">45 seconds (Tutorial)</option>
                <option value="60">60 seconds (Case Study)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Target Platform</label>
              <select
                value={inspectPlatform}
                onChange={(e) => setInspectPlatform(e.target.value)}
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]"
              >
                <option value="YouTube Shorts">YouTube Shorts</option>
                <option value="Instagram Reels">Instagram Reels</option>
                <option value="TikTok">TikTok</option>
                <option value="Facebook Video">Facebook Video</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Script Outline or Scene-by-Scene Description
            </label>
            <textarea
              rows={3}
              value={inspectOutline}
              onChange={(e) => setInspectOutline(e.target.value)}
              placeholder="0-3s: Host says hello and asks if viewer knows about memory leaks. 3-15s: Shows terminal screen. 15-25s: Explains the fix. 25-30s: Asks to subscribe."
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg p-2.5 sm:p-3 text-xs sm:text-sm text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2]"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={inspecting || !inspectTitle}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black font-bold text-xs hover:opacity-90 transition disabled:opacity-50 min-h-[40px]"
            >
              {inspecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  <span>Inspecting Creative Structure...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-black" />
                  <span>Analyze Creative Outline</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Inspection Result Display */}
        {inspectionResult && (
          <div className="p-4 sm:p-5 rounded-xl bg-[var(--bg-surface)]/90 border border-[#00D6B2]/30 space-y-4 animate-in fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
              <span className="text-xs font-bold text-[#00D6B2] uppercase tracking-wider">
                Creative Inspection Diagnostic
              </span>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                <span>Hook: <strong className="text-[#00D6B2]">{inspectionResult.hookScore}/100</strong></span>
                <span>Pacing: <strong className="text-[#ADF5E8]">{inspectionResult.pacingScore}/100</strong></span>
                <span>Clarity: <strong className="text-purple-400">{inspectionResult.clarityScore}/100</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Hook Suggestions */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[var(--text-primary)] flex items-center space-x-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>AI Hook Replacements (0-3s Hold)</span>
                </span>
                <div className="space-y-1.5">
                  {(inspectionResult.hookSuggestions || []).map((h: string, idx: number) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] leading-relaxed">
                      {h}
                    </div>
                  ))}
                </div>
              </div>

              {/* Structural Improvements */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[var(--text-primary)] flex items-center space-x-1.5">
                  <Scissors className="w-3.5 h-3.5 text-[#00D6B2]" />
                  <span>Key Structural Edits</span>
                </span>
                <div className="space-y-1.5">
                  {(inspectionResult.keyImprovements || []).map((imp: string, idx: number) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] flex items-start space-x-2 leading-relaxed">
                      <span className="text-[#00D6B2] font-bold">•</span>
                      <span>{imp}</span>
                    </div>
                  ))}
                  {inspectionResult.suggestedPacing && (
                    <div className="p-2.5 rounded-lg bg-[#087F78]/15 border border-[#087F78]/30 text-xs text-[#ADF5E8]">
                      <strong>Pacing Target:</strong> {inspectionResult.suggestedPacing}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Viral Hook Generator Quick Tool */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 space-y-3 sm:space-y-4">
        <div className="flex items-center space-x-2 text-[var(--text-primary)] font-bold text-sm">
          <Wand2 className="w-4 h-4 text-[#00D6B2]" />
          <span>Quick 0“3s Opening Hook Generator</span>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          Generate psychological hooks tested against short-form video swipe-away algorithms.
        </p>

        <form onSubmit={handleGenerateHooks} className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
          <input
            type="text"
            value={hookTopic}
            onChange={(e) => setHookTopic(e.target.value)}
            placeholder="Enter topic (e.g. Next.js 15 Server Actions, Muscle Hypertrophy)"
            className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs sm:text-sm text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2]"
          />
          <select
            value={hookStyle}
            onChange={(e) => setHookStyle(e.target.value)}
            className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]"
          >
            <option value="Curiosity & Pattern Interrupt">Curiosity & Pattern</option>
            <option value="Direct Contradiction of Common Advice">Direct Contradiction</option>
            <option value="Before & After Shock">Before & After</option>
            <option value="Urgent Industry Secret">Urgent Secret</option>
          </select>
          <button
            type="submit"
            disabled={generatingHooks || !hookTopic}
            className="px-4 py-2 rounded-lg bg-[var(--bg-input)] hover:bg-slate-700 text-[var(--text-primary)] border border-[var(--border-color)] text-xs font-semibold transition disabled:opacity-50 whitespace-nowrap min-h-[38px]"
          >
            {generatingHooks ? 'Generating...' : 'Generate Hooks'}
          </button>
        </form>

        {generatedHooks.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3 pt-2">
            {generatedHooks.map((hook, i) => (
              <div
                key={i}
                className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] flex items-start justify-between gap-3 group hover:border-[#00D6B2]/40 transition"
              >
                <span className="leading-relaxed">"{hook}"</span>
                <button
                  onClick={() => copyToClipboard(hook, i)}
                  className="text-[var(--text-secondary)] hover:text-[#00D6B2] p-1 flex-shrink-0"
                  title="Copy Hook"
                >
                  {copiedIndex === i ? <Check className="w-3.5 h-3.5 text-[#00D6B2]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};