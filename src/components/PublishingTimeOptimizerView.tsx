import React, { useState, useMemo } from 'react';
import { usePublisher } from '../context/PublisherContext';
import {
  Calendar,
  Clock,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Zap,
  Info,
  ShieldCheck,
  RotateCcw,
  ArrowRight,
} from 'lucide-react';
import {
  computeTimeSlotMatrix,
  findOptimalSlot,
  DEFAULT_WEIGHTS,
  DAYS_OF_WEEK,
  AlgorithmWeights,
} from '../utils/timingAlgorithm';

export const PublishingTimeOptimizerView: React.FC = () => {
  const { analytics, posts, autopilotConfig, updateAutopilotConfig, reschedulePost } = usePublisher();

  const [weights, setWeights] = useState<AlgorithmWeights>(DEFAULT_WEIGHTS);
  const [selectedSlot, setSelectedSlot] = useState<{ day: number; hour: number } | null>({
    day: 3, // Wednesday
    hour: 18, // 18:00
  });

  const matrix = useMemo(() => {
    return computeTimeSlotMatrix(analytics, posts, weights);
  }, [analytics, posts, weights]);

  const optimalSlot = useMemo(() => {
    return findOptimalSlot(
      matrix,
      posts,
      autopilotConfig.safeguards.blackoutHoursStart,
      autopilotConfig.safeguards.blackoutHoursEnd,
      autopilotConfig.safeguards.minSpacingHours
    );
  }, [matrix, posts, autopilotConfig]);

  const activeSlotDetails = useMemo(() => {
    if (!selectedSlot) return null;
    return matrix.find(
      (s) => s.dayOfWeek === selectedSlot.day && s.hour === selectedSlot.hour
    );
  }, [selectedSlot, matrix]);

  const handleApplyOptimalToNext = () => {
    const unoptimized = posts.find(
      (p) => p.status === 'scheduled' && !p.lockedForPublishing
    );
    if (!unoptimized) {
      alert('No eligible scheduled posts found in the queue.');
      return;
    }

    const d = new Date(unoptimized.scheduledTime);
    d.setHours(optimalSlot.hour, 0, 0, 0);
    reschedulePost(
      unoptimized.id,
      d.toISOString(),
      `Optimal slot algorithm applied: ${DAYS_OF_WEEK[optimalSlot.dayOfWeek]} at ${optimalSlot.hour}:00 (Score ${optimalSlot.score}/100)`
    );
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-5 sm:pb-6">
        <div>
          <div className="flex items-center space-x-2 text-[11px] font-mono text-[#00D6B2] mb-1">
            <Calendar className="w-3.5 h-3.5" />
            <span className="truncate">OPTIMIZATION MODULE • PUBLISHING TIME ENGINE</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
            Self-Improving Publishing-Time Optimizer
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
            Learns audience responsiveness by combining historical views, watch duration, retention curves, and engagement.
          </p>
        </div>

        {/* 3 Scheduling Modes Bar */}
        <div className="flex items-center space-x-1 p-1 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-x-auto touch-scroll">
          {(['manual', 'assisted', 'autopilot'] as const).map((m) => (
            <button
              key={m}
              onClick={() => updateAutopilotConfig({ mode: m })}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition whitespace-nowrap min-h-[32px] ${
                autopilotConfig.mode === m
                  ? 'bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black shadow-md'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Top Banner: Best Window Prediction */}
      <div className="p-4 sm:p-6 rounded-2xl bg-gradient-to-r from-[var(--bg-surface)] via-[#131b29] to-[var(--bg-surface)] border border-[#00D6B2]/30 glow-teal flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6">
        <div className="flex items-start space-x-3 sm:space-x-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[#00D6B2]/15 border border-[#00D6B2]/30 flex items-center justify-center text-[#00D6B2] flex-shrink-0">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="text-[10px] sm:text-xs font-mono text-[#00D6B2] uppercase tracking-wider font-bold">
              Algorithm Recommendation
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] mt-0.5">
              {DAYS_OF_WEEK[optimalSlot.dayOfWeek]} at {String(optimalSlot.hour).padStart(2, '0')}:00
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-xl leading-relaxed">
              {optimalSlot.reason}. Respects your {autopilotConfig.safeguards.minSpacingHours}h minimum spacing and blackout window ({autopilotConfig.safeguards.blackoutHoursStart}:00“{autopilotConfig.safeguards.blackoutHoursEnd}:00).
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end space-x-3 sm:space-x-4 pt-2 md:pt-0 border-t md:border-t-0 border-[var(--border-color)]">
          <div className="text-left md:text-right">
            <div className="text-xl sm:text-2xl font-black text-[#00D6B2] font-mono">
              {optimalSlot.score}/100
            </div>
            <div className="text-[9px] sm:text-[10px] text-[var(--text-secondary)] uppercase font-mono">Composite Score</div>
          </div>

          <button
            onClick={handleApplyOptimalToNext}
            className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black font-bold text-xs hover:opacity-90 transition shadow-lg shadow-[#00D6B2]/20 whitespace-nowrap min-h-[38px]"
          >
            Apply to Next Post
          </button>
        </div>
      </div>

      {/* 24x7 Heatmap Section */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3 sm:pb-4">
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
              <Clock className="w-4 h-4 text-[#00D6B2]" />
              <span>Audience Responsiveness Matrix (24h × 7 Days)</span>
            </h3>
            <p className="text-[11px] sm:text-xs text-[var(--text-secondary)]">
              Click any slot to inspect composite score, watch time, and sample size confidence.
            </p>
          </div>

          {/* Color Legend */}
          <div className="flex items-center space-x-2 text-[10px] sm:text-[11px] font-mono text-[var(--text-secondary)]">
            <span>Low (10)</span>
            <div className="w-12 sm:w-16 h-2 sm:h-2.5 rounded bg-gradient-to-r from-[var(--bg-input)] via-[#087F78] to-[#00D6B2]" />
            <span>Peak (100)</span>
            <span className="ml-1 text-red-400 flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-red-500/40 inline-block" />
              <span>Blackout</span>
            </span>
          </div>
        </div>

        {/* Mobile Swipe Hint */}
        <div className="block lg:hidden text-[10px] font-mono text-[#ADF5E8] flex items-center space-x-1">
          <span>â† Swipe horizontally to explore all 24 hours →</span>
        </div>

        {/* Heatmap Grid */}
        <div className="overflow-x-auto touch-scroll pb-2">
          <div className="min-w-[680px]">
            {/* Hours Header */}
            <div className="grid grid-cols-[65px_repeat(24,_1fr)] gap-1 text-[9px] sm:text-[10px] font-mono text-[var(--text-secondary)] mb-1.5 sm:mb-2">
              <div />
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h} className="text-center">
                  {h % 3 === 0 ? `${h}h` : ''}
                </div>
              ))}
            </div>

            {/* Days rows */}
            {DAYS_OF_WEEK.map((dayName, dayIndex) => (
              <div
                key={dayIndex}
                className="grid grid-cols-[65px_repeat(24,_1fr)] gap-1 items-center mb-1 sm:mb-1.5"
              >
                <div className="text-[11px] sm:text-xs font-semibold text-[var(--text-secondary)] font-mono truncate">
                  {dayName.substring(0, 3)}
                </div>

                {Array.from({ length: 24 }).map((_, hour) => {
                  const slot = matrix.find(
                    (s) => s.dayOfWeek === dayIndex && s.hour === hour
                  );
                  const score = slot?.compositeScore ?? 30;
                  const isSelected =
                    selectedSlot?.day === dayIndex && selectedSlot?.hour === hour;
                  const isBlackout =
                    hour >= autopilotConfig.safeguards.blackoutHoursStart &&
                    hour < autopilotConfig.safeguards.blackoutHoursEnd;

                  let bgColor = 'bg-[var(--bg-surface)]/60';
                  if (isBlackout) {
                    bgColor = 'bg-red-950/20 border-red-500/20';
                  } else if (score >= 85) {
                    bgColor = 'bg-[#00D6B2] text-black font-bold';
                  } else if (score >= 70) {
                    bgColor = 'bg-[#00D6B2]/60 text-black';
                  } else if (score >= 50) {
                    bgColor = 'bg-[#087F78]/70 text-[var(--text-primary)]';
                  } else if (score >= 35) {
                    bgColor = 'bg-[#087F78]/35 text-[var(--text-secondary)]';
                  } else {
                    bgColor = 'bg-[var(--bg-surface)]/80 text-[var(--text-muted)]';
                  }

                  return (
                    <button
                      key={hour}
                      onClick={() => setSelectedSlot({ day: dayIndex, hour })}
                      title={`${dayName} at ${hour}:00 ” Score: ${score}/100`}
                      className={`h-6 sm:h-7 rounded flex items-center justify-center text-[9px] sm:text-[10px] font-mono transition transform hover:scale-110 cursor-pointer ${bgColor} ${
                        isSelected
                          ? 'ring-2 ring-white shadow-lg shadow-[#00D6B2]/40'
                          : ''
                      }`}
                    >
                      {score >= 65 ? score : ''}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Selected Slot Inspector */}
        {activeSlotDetails && selectedSlot && (
          <div className="p-3 sm:p-4 rounded-xl bg-[var(--bg-surface)]/90 border border-[var(--border-color)] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 text-xs">
            <div className="p-2 rounded bg-black/20">
              <div className="text-[var(--text-secondary)] text-[10px]">Selected Window</div>
              <div className="text-[var(--text-primary)] font-bold font-mono truncate">
                {DAYS_OF_WEEK[selectedSlot.day]} {String(selectedSlot.hour).padStart(2, '0')}:00
              </div>
            </div>
            <div className="p-2 rounded bg-black/20">
              <div className="text-[var(--text-secondary)] text-[10px]">Composite Score</div>
              <div className="text-[#00D6B2] font-bold font-mono text-sm">
                {activeSlotDetails.compositeScore}/100
              </div>
            </div>
            <div className="p-2 rounded bg-black/20">
              <div className="text-[var(--text-secondary)] text-[10px]">Watch Duration</div>
              <div className="text-[var(--text-primary)] font-mono font-semibold">
                {activeSlotDetails.watchDurationScore}%
              </div>
            </div>
            <div className="p-2 rounded bg-black/20">
              <div className="text-[var(--text-secondary)] text-[10px]">Retention Score</div>
              <div className="text-[#ADF5E8] font-mono font-semibold">
                {activeSlotDetails.retentionScore}%
              </div>
            </div>
            <div className="p-2 rounded bg-black/20">
              <div className="text-[var(--text-secondary)] text-[10px]">Engagement Velocity</div>
              <div className="text-purple-400 font-mono font-semibold">
                {activeSlotDetails.engagementScore}%
              </div>
            </div>
            <div className="p-2 rounded bg-black/20">
              <div className="text-[var(--text-secondary)] text-[10px]">Sample & Conf</div>
              <div className="text-[var(--text-secondary)] font-mono truncate">
                {activeSlotDetails.sampleCount} post ({activeSlotDetails.confidence})
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Configurable Weight Tuning Sliders */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3 sm:pb-4">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-[#00D6B2]" />
            <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">Algorithm Weight Configuration</h3>
          </div>
          <button
            onClick={() => setWeights(DEFAULT_WEIGHTS)}
            className="flex items-center space-x-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Weights</span>
          </button>
        </div>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          The intelligence engine calculates optimal publishing windows using these initial weights. As historical volume grows, autonomous regression models refine the correlation factors.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          {/* Factor 1: Historical Views (20%) */}
          <div className="space-y-1.5 p-3 rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-color)]">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-[var(--text-primary)]">Historical Views</span>
              <span className="font-mono text-[#00D6B2]">{Math.round(weights.historicalViews * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.5"
              step="0.05"
              value={weights.historicalViews}
              onChange={(e) => setWeights({ ...weights, historicalViews: parseFloat(e.target.value) })}
              className="w-full accent-[#00D6B2] cursor-pointer"
            />
            <span className="text-[10px] text-[var(--text-secondary)] block">Weight on raw view volume</span>
          </div>

          {/* Factor 2: Watch Duration (20%) */}
          <div className="space-y-1.5 p-3 rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-color)]">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-[var(--text-primary)]">Avg Watch Duration</span>
              <span className="font-mono text-[#00D6B2]">{Math.round(weights.avgWatchDuration * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.5"
              step="0.05"
              value={weights.avgWatchDuration}
              onChange={(e) => setWeights({ ...weights, avgWatchDuration: parseFloat(e.target.value) })}
              className="w-full accent-[#00D6B2] cursor-pointer"
            />
            <span className="text-[10px] text-[var(--text-secondary)] block">Weight on seconds watched</span>
          </div>

          {/* Factor 3: Retention (20%) */}
          <div className="space-y-1.5 p-3 rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-color)]">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-[var(--text-primary)]">Audience Retention</span>
              <span className="font-mono text-[#00D6B2]">{Math.round(weights.audienceRetention * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.5"
              step="0.05"
              value={weights.audienceRetention}
              onChange={(e) => setWeights({ ...weights, audienceRetention: parseFloat(e.target.value) })}
              className="w-full accent-[#00D6B2] cursor-pointer"
            />
            <span className="text-[10px] text-[var(--text-secondary)] block">Weight on completion curve</span>
          </div>

          {/* Factor 4: Engagement (15%) */}
          <div className="space-y-1.5 p-3 rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-color)]">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-[var(--text-primary)]">Audience Engagement</span>
              <span className="font-mono text-[#ADF5E8]">{Math.round(weights.engagement * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.4"
              step="0.05"
              value={weights.engagement}
              onChange={(e) => setWeights({ ...weights, engagement: parseFloat(e.target.value) })}
              className="w-full accent-[#ADF5E8] cursor-pointer"
            />
            <span className="text-[10px] text-[var(--text-secondary)] block">Likes, comments, shares, saves</span>
          </div>

          {/* Factor 5: Follower Activity (15%) */}
          <div className="space-y-1.5 p-3 rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-color)]">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-[var(--text-primary)]">Follower Activity Base</span>
              <span className="font-mono text-[#ADF5E8]">{Math.round(weights.followerActivity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.4"
              step="0.05"
              value={weights.followerActivity}
              onChange={(e) => setWeights({ ...weights, followerActivity: parseFloat(e.target.value) })}
              className="w-full accent-[#ADF5E8] cursor-pointer"
            />
            <span className="text-[10px] text-[var(--text-secondary)] block">Online audience distribution</span>
          </div>

          {/* Factor 6: Recent Trend (10%) */}
          <div className="space-y-1.5 p-3 rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-color)]">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-[var(--text-primary)]">Recent Performance Trend</span>
              <span className="font-mono text-purple-400">{Math.round(weights.recentTrend * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.3"
              step="0.05"
              value={weights.recentTrend}
              onChange={(e) => setWeights({ ...weights, recentTrend: parseFloat(e.target.value) })}
              className="w-full accent-purple-400 cursor-pointer"
            />
            <span className="text-[10px] text-[var(--text-secondary)] block">Momentum over last 7 days</span>
          </div>
        </div>
      </div>
    </div>
  );
};
