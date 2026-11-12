import React, { useState } from 'react';
import { usePublisher } from '../context/PublisherContext';
import {
  Flame,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Sparkles,
  HelpCircle,
  Repeat,
  ArrowRight,
  Loader2,
  Clock,
  Layers,
  BarChart2,
} from 'lucide-react';
import { getPlatformColor } from '../utils/platformSpecs';
import { apiFetch } from '../lib/api';

export const RetentionIntelligenceView: React.FC = () => {
  const { videos, analytics, activeBrand } = usePublisher();

  const [selectedVideoId, setSelectedVideoId] = useState<string>(() => {
    return videos[0]?.id || '';
  });

  const [analyzingWithAi, setAnalyzingWithAi] = useState(false);
  const [aiReport, setAiReport] = useState<any | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);

  const currentVideo = videos.find((v) => v.id === selectedVideoId) || videos[0];
  const videoAnalyticsList = currentVideo
    ? analytics.filter((a) => a.videoId === currentVideo.id)
    : [];
  const primaryAnalytics = videoAnalyticsList[0];

  const handleRunAiDiagnosis = async () => {
    if (!currentVideo || !primaryAnalytics) return;
    setAnalyzingWithAi(true);
    setAiReport(null);

    try {
      const res = await apiFetch('/api/ai/analyze-retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoTitle: currentVideo.title,
          durationSeconds: currentVideo.durationSeconds,
          avgPercentageWatched: primaryAnalytics.avgPercentageWatched,
          completionRate: primaryAnalytics.completionRate,
          retentionPoints: primaryAnalytics.retentionPoints,
          hookType: currentVideo.hookType,
          editingPace: currentVideo.editingPace,
        }),
      });
      const data = await res.json();
      setAiReport(data);
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzingWithAi(false);
    }
  };

  if (videos.length === 0) {
    return (
      <div className="w-full max-w-4xl mx-auto py-12 sm:py-20 px-4 text-center">
        <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center justify-center">
          <Flame className="w-7 h-7 sm:w-8 sm:h-8 text-[#00D6B2]" />
        </div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] mb-2">No Video Analytics Available Yet</h2>
        <p className="text-[var(--text-secondary)] text-xs sm:text-sm max-w-md mx-auto mb-6">
          The workspace has no video records yet. Upload a video and link your social channel to inspect authentic second-by-second audience retention curves, 0“3s hook scores, and AI diagnostic reports.
        </p>
      </div>
    );
  }

  const retentionPoints = primaryAnalytics?.retentionPoints || [];
  const hasRetentionCurve = retentionPoints.length > 0;
  const duration = currentVideo?.durationSeconds || 30;

  // SVG Chart Dimensions
  const svgWidth = 800;
  const svgHeight = 240;
  const padding = { top: 25, right: 25, bottom: 35, left: 40 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  const getCoordinates = (point: { second: number; percent: number }) => {
    const x = padding.left + (point.second / duration) * graphWidth;
    const y = padding.top + (1 - point.percent / 100) * graphHeight;
    return { x, y };
  };

  const pathD = retentionPoints.reduce((acc, point, index) => {
    const { x, y } = getCoordinates(point);
    return index === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const areaD = hasRetentionCurve
    ? `${pathD} L ${padding.left + graphWidth} ${padding.top + graphHeight} L ${padding.left} ${padding.top + graphHeight} Z`
    : '';

  return (
    <div className="w-full max-w-[1800px] mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
      {/* Header & Video Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-5 sm:pb-6">
        <div>
          <div className="flex items-center space-x-2 text-[11px] font-mono text-[#00D6B2] mb-1">
            <Flame className="w-3.5 h-3.5" />
            <span className="truncate">LAYER B & C • AUDIENCE RETENTION INTELLIGENCE</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
            Watch Behavior & Drop-Off Analytics
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
            See where viewers stop watching your videos ” higher percentages mean stronger hooks and pacing.
          </p>
          <p className="text-[10px] sm:text-[11px] text-[var(--text-muted)] mt-1">
👑 Pick a video above. "Avg % Watched" = average portion viewers saw; "Completion" = reached the end. Low early numbers usually mean the first 3 seconds need work.
          </p>
        </div>

        {/* Video Selector Dropdown & Action */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center space-x-2 min-w-0">
            <label className="text-xs text-[var(--text-secondary)] font-medium whitespace-nowrap">Video:</label>
            <select
              value={selectedVideoId}
              onChange={(e) => {
                setSelectedVideoId(e.target.value);
                setAiReport(null);
              }}
              className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2] w-full sm:max-w-xs truncate"
            >
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title} ({v.durationSeconds}s)
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleRunAiDiagnosis}
            disabled={analyzingWithAi || !primaryAnalytics}
            className="flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black font-semibold text-xs hover:opacity-90 transition disabled:opacity-50 shadow-md shadow-[#00D6B2]/15 whitespace-nowrap"
          >
            {analyzingWithAi ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Diagnosing with Gemini...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Retention Diagnosis</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* KPI Cards: Fluid grid for all screen sizes */}
      {primaryAnalytics ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4">
          {/* Average Watch % */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-3 sm:p-4 relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="text-[11px] sm:text-xs text-[var(--text-secondary)] font-medium mb-1">Avg % Watched</div>
              <div className="text-lg sm:text-2xl font-extrabold text-[#00D6B2] font-mono">
                {primaryAnalytics.avgPercentageWatched}%
              </div>
            </div>
            <div className="text-[10px] sm:text-[11px] text-[var(--text-secondary)] mt-2 truncate">
              {primaryAnalytics.avgPercentageWatched >= 70 ? 'â˜… Top Tier Retention' : 'Hook Fix Needed'}
            </div>
          </div>

          {/* Average Duration */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-3 sm:p-4 flex flex-col justify-between">
            <div>
              <div className="text-[11px] sm:text-xs text-[var(--text-secondary)] font-medium mb-1">Avg Watch Duration</div>
              <div className="text-lg sm:text-2xl font-extrabold text-[var(--text-primary)] font-mono">
                {primaryAnalytics.avgWatchDurationSeconds}s
              </div>
            </div>
            <div className="text-[10px] sm:text-[11px] text-[var(--text-secondary)] mt-2 truncate">
              of {currentVideo.durationSeconds}s total
            </div>
          </div>

          {/* Completion Rate */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-3 sm:p-4 flex flex-col justify-between">
            <div>
              <div className="text-[11px] sm:text-xs text-[var(--text-secondary)] font-medium mb-1">Completion Rate</div>
              <div className="text-lg sm:text-2xl font-extrabold text-[#ADF5E8] font-mono">
                {primaryAnalytics.completionRate}%
              </div>
            </div>
            <div className="text-[10px] sm:text-[11px] text-[var(--text-secondary)] mt-2 truncate">
              reached final frame
            </div>
          </div>

          {/* Early Abandonment (0-3s) */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-3 sm:p-4 flex flex-col justify-between">
            <div>
              <div className="text-[11px] sm:text-xs text-[var(--text-secondary)] font-medium mb-1">0“3s Abandonment</div>
              <div
                className={`text-lg sm:text-2xl font-extrabold font-mono ${
                  primaryAnalytics.earlyAbandonmentRate > 30 ? 'text-red-400' : 'text-[#00D6B2]'
                }`}
              >
                {primaryAnalytics.earlyAbandonmentRate}%
              </div>
            </div>
            <div className="text-[10px] sm:text-[11px] text-[var(--text-secondary)] mt-2 truncate">
              {primaryAnalytics.earlyAbandonmentRate > 30 ? 'Weak Hook Warning' : 'Strong Hook Hold'}
            </div>
          </div>

          {/* Rewatch Score */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-3 sm:p-4 flex flex-col justify-between">
            <div>
              <div className="text-[11px] sm:text-xs text-[var(--text-secondary)] font-medium mb-1">Rewatch Multiplier</div>
              <div className="text-lg sm:text-2xl font-extrabold text-purple-400 font-mono">
                {primaryAnalytics.rewatchScore}x
              </div>
            </div>
            <div className="text-[10px] sm:text-[11px] text-[var(--text-secondary)] mt-2 truncate">
              {primaryAnalytics.rewatchScore > 1.2 ? 'Looping Replays' : 'Standard 1x'}
            </div>
          </div>

          {/* Platform & Source */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-3 sm:p-4 flex flex-col justify-between">
            <div>
              <div className="text-[11px] sm:text-xs text-[var(--text-secondary)] font-medium mb-1">Source & Sync</div>
              <div className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider truncate">
                {primaryAnalytics.platform}
              </div>
            </div>
            <div className="text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-color)] w-fit mt-2 truncate">
              {primaryAnalytics.source === 'official_api' ? 'Official API' : 'CSV Import'}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-[var(--bg-surface)]/60 rounded-xl border border-[var(--border-color)] text-xs text-[var(--text-secondary)]">
          No synchronized analytics snapshots found for this video yet.
        </div>
      )}

      {/* Main Interactive Retention Graph */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[var(--border-color)] gap-2">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center space-x-2">
              <span>Audience Retention Over Timeline</span>
              <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded bg-[#00D6B2]/10 text-[#00D6B2] border border-[#00D6B2]/20 font-mono">
                {currentVideo.durationSeconds}s Total
              </span>
            </h3>
            <p className="text-[11px] sm:text-xs text-[var(--text-secondary)]">
              Interactive timeline showing retention curve and critical drop-off points.
            </p>
          </div>

          {/* Pattern Flags */}
          {primaryAnalytics && (
            <div className="flex flex-wrap items-center gap-1.5">
              {primaryAnalytics.patternFlags.weakOpeningHook && (
                <span className="px-2 py-0.5 sm:py-1 rounded bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] sm:text-xs font-medium flex items-center space-x-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Weak Hook</span>
                </span>
              )}
              {primaryAnalytics.patternFlags.strongMiddleSection && (
                <span className="px-2 py-0.5 sm:py-1 rounded bg-[#00D6B2]/15 border border-[#00D6B2]/30 text-[#00D6B2] text-[10px] sm:text-xs font-medium flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Strong Middle</span>
                </span>
              )}
              {primaryAnalytics.patternFlags.suddenDropScene && (
                <span className="px-2 py-0.5 sm:py-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] sm:text-xs font-medium flex items-center space-x-1">
                  <TrendingDown className="w-3 h-3" />
                  <span>Drop-Off Spike ({primaryAnalytics.patternFlags.suddenDropSecond}s)</span>
                </span>
              )}
              {primaryAnalytics.patternFlags.repeatViewPattern && (
                <span className="px-2 py-0.5 sm:py-1 rounded bg-purple-500/15 border border-purple-500/30 text-purple-400 text-[10px] sm:text-xs font-medium flex items-center space-x-1">
                  <Repeat className="w-3 h-3" />
                  <span>Viral Replay</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* SVG Curve Container */}
        {hasRetentionCurve ? (
          <div className="mt-4 sm:mt-6 relative overflow-x-auto touch-scroll">
            <div className="min-w-[500px] sm:min-w-0">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-auto select-none max-h-[300px]"
              >
                <defs>
                  <linearGradient id="retentionGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00D6B2" stopOpacity="0.45" />
                    <stop offset="60%" stopColor="#087F78" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#087F78" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid Lines Y-axis */}
                {[100, 75, 50, 25, 0].map((pct) => {
                  const y = padding.top + (1 - pct / 100) * graphHeight;
                  return (
                    <g key={pct}>
                      <line
                        x1={padding.left}
                        y1={y}
                        x2={padding.left + graphWidth}
                        y2={y}
                        stroke="rgba(255, 255, 255, 0.08)"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={padding.left - 6}
                        y={y + 4}
                        fill="#64748b"
                        fontSize="9"
                        textAnchor="end"
                        fontFamily="JetBrains Mono"
                      >
                        {pct}%
                      </text>
                    </g>
                  );
                })}

                {/* Grid Lines X-axis */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                  const sec = Math.round(duration * ratio);
                  const x = padding.left + ratio * graphWidth;
                  return (
                    <g key={ratio}>
                      <line
                        x1={x}
                        y1={padding.top}
                        x2={x}
                        y2={padding.top + graphHeight}
                        stroke="rgba(255, 255, 255, 0.05)"
                      />
                      <text
                        x={x}
                        y={padding.top + graphHeight + 16}
                        fill="#64748b"
                        fontSize="9"
                        textAnchor="middle"
                        fontFamily="JetBrains Mono"
                      >
                        {sec}s
                      </text>
                    </g>
                  );
                })}

                {/* Area fill */}
                <path d={areaD} fill="url(#retentionGradient)" />

                {/* Line path */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="#00D6B2"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Data points & Event markers */}
                {retentionPoints.map((pt, i) => {
                  const { x, y } = getCoordinates(pt);
                  const isDropSpike = (pt.dropOffRate || 0) >= 12;

                  return (
                    <g key={i}>
                      <circle
                        cx={x}
                        cy={y}
                        r={isDropSpike ? 6 : 4}
                        fill={isDropSpike ? '#ef4444' : '#00D6B2'}
                        stroke="var(--bg-input)"
                        strokeWidth="2"
                        className="cursor-pointer transition-transform hover:scale-150"
                        onMouseEnter={() => setHoveredPoint(pt)}
                        onClick={() => setHoveredPoint(pt)}
                      />

                      {pt.eventNote && (
                        <g>
                          <line
                            x1={x}
                            y1={y - 6}
                            x2={x}
                            y2={y - 18}
                            stroke={isDropSpike ? '#ef4444' : '#ADF5E8'}
                            strokeWidth="1"
                          />
                          <text
                            x={x}
                            y={y - 22}
                            fill={isDropSpike ? '#ef4444' : '#ADF5E8'}
                            fontSize="8.5"
                            fontWeight="600"
                            textAnchor="middle"
                            fontFamily="Plus Jakarta Sans"
                          >
                            {pt.eventNote}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Hover details tooltip */}
            {hoveredPoint && (
              <div className="mt-3 p-3 rounded-lg bg-[var(--bg-surface)] border border-[#00D6B2]/30 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="font-mono text-[#00D6B2] font-bold">
                    Second {hoveredPoint.second}s:
                  </span>
                  <span className="text-[var(--text-primary)] font-semibold">
                    {hoveredPoint.percent}% Viewers Retained
                  </span>
                  {hoveredPoint.dropOffRate !== undefined && (
                    <span className="text-[var(--text-secondary)]">
                      (Drop: -{hoveredPoint.dropOffRate}%)
                    </span>
                  )}
                  {hoveredPoint.eventNote && (
                    <span className="text-[#ADF5E8] bg-[var(--bg-surface-hover)] px-2 py-0.5 rounded text-[11px]">
                      {hoveredPoint.eventNote}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setHoveredPoint(null)}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs px-2 py-0.5 rounded bg-[var(--bg-surface-hover)]"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 sm:py-12 text-center text-[var(--text-secondary)] text-xs sm:text-sm">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
            <p className="font-semibold text-[var(--text-primary)]">Continuous Retention Curve Unavailable for {primaryAnalytics?.platform}</p>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto mt-1">
              As documented in our API Metric Availability Layer, the official API for {primaryAnalytics?.platform} provides aggregate watch time and milestone percentages rather than a second-by-second curve. In compliance with strict standards, we do not fabricate non-existent graph points.
            </p>
          </div>
        )}
      </div>

      {/* AI Retention Diagnosis Report Modal / Box */}
      {aiReport && (
        <div className="bg-gradient-to-br from-[var(--bg-surface)] via-[#131b29] to-[var(--bg-input)] border border-[#00D6B2]/40 rounded-2xl p-4 sm:p-6 glow-teal space-y-4 sm:space-y-5 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#00D6B2]/20 flex items-center justify-center text-[#00D6B2] flex-shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                  AI Retention Performance Diagnosis
                </h3>
                <span className="text-[10px] sm:text-xs text-[var(--text-secondary)] font-mono">
                  Engine: {aiReport.provider || 'gemini-3.8-flash'} • Confidence: {aiReport.confidenceScore || 92}%
                </span>
              </div>
            </div>
            <button
              onClick={() => setAiReport(null)}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded bg-[var(--bg-surface-hover)]"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-3 sm:space-y-4">
              <div className="p-3.5 sm:p-4 rounded-xl bg-[var(--bg-surface)]/80 border border-[var(--border-color)]">
                <div className="text-[11px] sm:text-xs font-bold text-[#ADF5E8] uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                  <BarChart2 className="w-3.5 h-3.5" />
                  <span>1. Empirical Analysis</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {aiReport.analysis}
                </p>
              </div>

              <div className="p-3.5 sm:p-4 rounded-xl bg-[var(--bg-surface)]/80 border border-amber-500/20">
                <div className="text-[11px] sm:text-xs font-bold text-amber-400 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>2. Root-Cause Diagnosis</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {aiReport.diagnosis}
                </p>
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <div className="p-3.5 sm:p-4 rounded-xl bg-[var(--bg-surface)]/80 border border-[#00D6B2]/20">
                <div className="text-[11px] sm:text-xs font-bold text-[#00D6B2] uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>3. Content Improvements</span>
                </div>
                <ul className="space-y-1.5 mt-2">
                  {(aiReport.recommendations || []).map((rec: string, i: number) => (
                    <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start space-x-2">
                      <span className="text-[#00D6B2] font-bold">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-3.5 sm:p-4 rounded-xl bg-[var(--bg-surface)]/80 border border-purple-500/20">
                <div className="text-[11px] sm:text-xs font-bold text-purple-400 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>4. Falsifiable Hypothesis</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {aiReport.experimentHypothesis}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Second-by-Second Breakdown Table */}
      {hasRetentionCurve && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6">
          <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] mb-3 sm:mb-4 flex items-center space-x-2">
            <Clock className="w-4 h-4 text-[#00D6B2]" />
            <span>Timeline Milestone Log</span>
          </h3>
          <div className="overflow-x-auto touch-scroll">
            <table className="w-full text-left text-xs min-w-[500px]">
              <thead className="bg-[var(--bg-surface)] text-[var(--text-secondary)] font-mono uppercase tracking-wider text-[10px] sm:text-[11px]">
                <tr>
                  <th className="py-2.5 px-3 sm:px-4">Second</th>
                  <th className="py-2.5 px-3 sm:px-4">Audience</th>
                  <th className="py-2.5 px-3 sm:px-4">Drop</th>
                  <th className="py-2.5 px-3 sm:px-4">Event</th>
                  <th className="py-2.5 px-3 sm:px-4">Opportunity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {retentionPoints.map((pt, i) => {
                  const isSevere = (pt.dropOffRate || 0) >= 12;
                  return (
                    <tr
                      key={i}
                      className={`hover:bg-[var(--bg-surface-hover)] transition ${
                        isSevere ? 'bg-red-500/5' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 sm:px-4 font-mono font-bold text-[var(--text-primary)] whitespace-nowrap">
                        {pt.second}s
                      </td>
                      <td className="py-2.5 px-3 sm:px-4 font-mono font-semibold text-[#00D6B2] whitespace-nowrap">
                        {pt.percent}%
                      </td>
                      <td className="py-2.5 px-3 sm:px-4 font-mono whitespace-nowrap">
                        {pt.dropOffRate ? (
                          <span className={isSevere ? 'text-red-400 font-bold' : 'text-[var(--text-secondary)]'}>
                            -{pt.dropOffRate}%
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">”</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 sm:px-4 text-[var(--text-secondary)]">
                        {pt.eventNote || 'Continuous Playback'}
                      </td>
                      <td className="py-2.5 px-3 sm:px-4 text-[var(--text-secondary)] text-[11px]">
                        {isSevere
                          ? 'Severe audience leak. Consider trimming scene or tightening transition.'
                          : pt.second === 3
                          ? 'Critical 0-3s hook window. Check audio clarity & visual intrigue.'
                          : 'Normal progression'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
