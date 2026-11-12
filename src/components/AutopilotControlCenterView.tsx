import React, { useState } from 'react';
import { usePublisher } from '../context/PublisherContext';
import {
  Bot,
  Shield,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Lock,
  History,
  Play,
  ArrowRight,
  Clock,
  Eye,
  Check,
} from 'lucide-react';
import { SchedulingMode } from '../types';

export const AutopilotControlCenterView: React.FC = () => {
  const {
    autopilotConfig,
    updateAutopilotConfig,
    toggleEmergencyPause,
    runAutopilotOptimizer,
    auditLogs,
    rollbackAuditLog,
    posts,
  } = usePublisher();

  const [notification, setNotification] = useState<string | null>(null);

  const handleModeChange = (mode: SchedulingMode) => {
    updateAutopilotConfig({ mode });
    setNotification(`Autopilot mode updated to: ${mode.toUpperCase()}`);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleTogglePermission = (key: keyof typeof autopilotConfig.permissions) => {
    updateAutopilotConfig({
      permissions: {
        ...autopilotConfig.permissions,
        [key]: !autopilotConfig.permissions[key],
      },
    });
  };

  const handleTriggerRun = () => {
    const res = runAutopilotOptimizer();
    setNotification(res.message);
    setTimeout(() => setNotification(null), 4000);
  };

  const activePermissionsCount = Object.values(autopilotConfig.permissions).filter(Boolean).length;

  return (
    <div className="w-full max-w-[1800px] mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-5 sm:pb-6">
        <div>
          <div className="flex items-center space-x-2 text-[11px] font-mono text-[#00D6B2] mb-1">
            <Bot className="w-3.5 h-3.5" />
            <span className="truncate">AUTONOMOUS CONTROLLER • CONTROL CENTER</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
            AI Autopilot Control Center
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
            Configure system autonomy, enforce guardrails, and audit every automated optimization decision.
          </p>
        </div>

        {/* Master Kill-Switch & Run Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
          <button
            onClick={toggleEmergencyPause}
            className={`flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs transition shadow-lg min-h-[40px] ${
              autopilotConfig.emergencyPaused
                ? 'bg-red-500 text-[var(--text-primary)] animate-pulse shadow-red-500/30'
                : 'bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-red-400 hover:border-red-500/40'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-current flex-shrink-0" />
            <span className="truncate">
              {autopilotConfig.emergencyPaused
                ? 'EMERGENCY PAUSE ACTIVE (RESUME)'
                : 'ENGAGE EMERGENCY PAUSE'}
            </span>
          </button>

          <button
            onClick={handleTriggerRun}
            disabled={autopilotConfig.emergencyPaused || autopilotConfig.mode === 'manual'}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black font-bold text-xs hover:opacity-90 transition disabled:opacity-40 min-h-[40px] whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Evaluate & Run Now</span>
          </button>
        </div>
      </div>

      {notification && (
        <div className="p-3 rounded-xl bg-[#00D6B2]/15 border border-[#00D6B2]/30 text-xs text-[#00D6B2] font-medium flex items-center justify-between">
          <span>{notification}</span>
          <button onClick={() => setNotification(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">✕</button>
        </div>
      )}

      {/* Configuration Preview & Active Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
        {/* Card 1: Operating Mode */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="text-[10px] sm:text-xs font-mono text-[var(--text-secondary)] uppercase tracking-wider mb-2">
              Selected Configuration
            </div>
            <div className="flex items-center justify-between">
              <span className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] capitalize">
                {autopilotConfig.mode} Mode
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold font-mono ${
                  autopilotConfig.emergencyPaused
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                    : autopilotConfig.mode === 'autopilot'
                    ? 'bg-[#00D6B2]/20 text-[#00D6B2] border border-[#00D6B2]/40'
                    : 'bg-amber-400/20 text-amber-400 border border-amber-400/40'
                }`}
              >
                {autopilotConfig.emergencyPaused ? 'PAUSED' : 'ACTIVE'}
              </span>
            </div>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-2 sm:mt-3 leading-relaxed">
            {autopilotConfig.mode === 'manual' && 'Manual: AI generates recommendations only; no autonomous scheduling changes are executed.'}
            {autopilotConfig.mode === 'assisted' && 'Assisted: AI calculates optimal slots and requires human approval before applying changes.'}
            {autopilotConfig.mode === 'autopilot' && 'Autopilot: System automatically adjusts future eligible slots within configured guardrails.'}
          </p>
        </div>

        {/* Card 2: Enabled Rules */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="text-[10px] sm:text-xs font-mono text-[var(--text-secondary)] uppercase tracking-wider mb-2">
              Enabled Optimization Rules
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-[#00D6B2] font-mono">
                {activePermissionsCount}
              </span>
              <span className="text-xs sm:text-sm text-[var(--text-secondary)] font-mono">of 4 permissions active</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-[var(--text-secondary)]">
            Total autonomous actions recorded: <strong className="text-[var(--text-primary)]">{autopilotConfig.totalAutonomousActions}</strong>
          </div>
        </div>

        {/* Card 3: Safeguards Status */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 sm:col-span-2 lg:col-span-1 flex flex-col justify-between">
          <div>
            <div className="text-[10px] sm:text-xs font-mono text-[var(--text-secondary)] uppercase tracking-wider mb-2 flex items-center space-x-1">
              <Lock className="w-3.5 h-3.5 text-[#ADF5E8]" />
              <span>Strict Safety Guarantees</span>
            </div>
            <div className="space-y-1.5 text-xs text-[var(--text-secondary)]">
              <div className="flex items-center space-x-1.5 text-[#00D6B2]">
                <Check className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">In-flight uploads never rescheduled</span>
              </div>
              <div className="flex items-center space-x-1.5 text-[var(--text-secondary)]">
                <span className="text-[var(--text-muted)]">•</span>
                <span>Min spacing: {autopilotConfig.safeguards.minSpacingHours} hours</span>
              </div>
              <div className="flex items-center space-x-1.5 text-[var(--text-secondary)]">
                <span className="text-[var(--text-muted)]">•</span>
                <span>Blackout: {autopilotConfig.safeguards.blackoutHoursStart}:00 “ {autopilotConfig.safeguards.blackoutHoursEnd}:00</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {/* Section 1: Operating Mode */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex items-center space-x-2 border-b border-[var(--border-color)] pb-3">
            <Sliders className="w-4 h-4 text-[#00D6B2]" />
            <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">1. Select Operating Mode</h3>
          </div>

          <div className="space-y-2.5 sm:space-y-3">
            {/* Mode 1 */}
            <div
              onClick={() => handleModeChange('manual')}
              className={`p-3 sm:p-4 rounded-xl border cursor-pointer transition ${
                autopilotConfig.mode === 'manual'
                  ? 'bg-[var(--bg-surface)] border-[#00D6B2] ring-1 ring-[#00D6B2]'
                  : 'bg-[var(--bg-surface)]/50 border-[var(--border-color)] hover:border-[var(--border-color)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--text-primary)] text-xs sm:text-sm">Mode 1: Manual ” Insights Only</span>
                <input
                  type="radio"
                  name="autopilot_mode"
                  checked={autopilotConfig.mode === 'manual'}
                  onChange={() => handleModeChange('manual')}
                  className="accent-[#00D6B2]"
                />
              </div>
              <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                You choose all publishing dates, times, and content edits. The engine only surfaces diagnostic insights and data reports.
              </p>
            </div>

            {/* Mode 2 */}
            <div
              onClick={() => handleModeChange('assisted')}
              className={`p-3 sm:p-4 rounded-xl border cursor-pointer transition ${
                autopilotConfig.mode === 'assisted'
                  ? 'bg-[var(--bg-surface)] border-[#00D6B2] ring-1 ring-[#00D6B2]'
                  : 'bg-[var(--bg-surface)]/50 border-[var(--border-color)] hover:border-[var(--border-color)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--text-primary)] text-xs sm:text-sm">Mode 2: Assisted ” Approve Recommendations</span>
                <input
                  type="radio"
                  name="autopilot_mode"
                  checked={autopilotConfig.mode === 'assisted'}
                  onChange={() => handleModeChange('assisted')}
                  className="accent-[#00D6B2]"
                />
              </div>
              <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                The engine suggests the highest-confidence time slot and content improvements with clear evidence. You click approve before changes take effect.
              </p>
            </div>

            {/* Mode 3 */}
            <div
              onClick={() => handleModeChange('autopilot')}
              className={`p-3 sm:p-4 rounded-xl border cursor-pointer transition ${
                autopilotConfig.mode === 'autopilot'
                  ? 'bg-[var(--bg-surface)] border-[#00D6B2] ring-1 ring-[#00D6B2]'
                  : 'bg-[var(--bg-surface)]/50 border-[var(--border-color)] hover:border-[var(--border-color)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--text-primary)] text-xs sm:text-sm">Mode 3: Autopilot ” Automatic Safe Execution</span>
                <input
                  type="radio"
                  name="autopilot_mode"
                  checked={autopilotConfig.mode === 'autopilot'}
                  onChange={() => handleModeChange('autopilot')}
                  className="accent-[#00D6B2]"
                />
              </div>
              <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                The system automatically reschedules eligible future posts into discovered peak windows, respecting all safety guardrails.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Optimization Permissions */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex items-center space-x-2 border-b border-[var(--border-color)] pb-3">
            <Shield className="w-4 h-4 text-[#ADF5E8]" />
            <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">2. Optimization Permissions</h3>
          </div>

          <div className="space-y-2.5 sm:space-y-3">
            {/* Permission 1 */}
            <div className="flex items-start justify-between p-3 sm:p-3.5 rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-color)] gap-3">
              <div className="pr-2">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Use retention analysis to improve future content
                </div>
                <div className="text-[10px] sm:text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  Feeds 0-3s hook retention metrics and drop-off points into the creative generator.
                </div>
              </div>
              <input
                type="checkbox"
                checked={autopilotConfig.permissions.useRetentionAnalysis}
                onChange={() => handleTogglePermission('useRetentionAnalysis')}
                className="w-4 h-4 accent-[#00D6B2] rounded cursor-pointer mt-0.5 flex-shrink-0"
              />
            </div>

            {/* Permission 2 */}
            <div className="flex items-start justify-between p-3 sm:p-3.5 rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-color)] gap-3">
              <div className="pr-2">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Automatically optimize future publishing times
                </div>
                <div className="text-[10px] sm:text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  Allows shifting scheduled queue dates into higher-scoring responsiveness windows.
                </div>
              </div>
              <input
                type="checkbox"
                checked={autopilotConfig.permissions.autoOptimizePublishingTimes}
                onChange={() => handleTogglePermission('autoOptimizePublishingTimes')}
                className="w-4 h-4 accent-[#00D6B2] rounded cursor-pointer mt-0.5 flex-shrink-0"
              />
            </div>

            {/* Permission 3 */}
            <div className="flex items-start justify-between p-3 sm:p-3.5 rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-color)] gap-3">
              <div className="pr-2">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Optimize future captions, titles and hashtags
                </div>
                <div className="text-[10px] sm:text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  Suggests and tests high-performing keywords based on historical reach.
                </div>
              </div>
              <input
                type="checkbox"
                checked={autopilotConfig.permissions.optimizeCaptionsTitlesTags}
                onChange={() => handleTogglePermission('optimizeCaptionsTitlesTags')}
                className="w-4 h-4 accent-[#00D6B2] rounded cursor-pointer mt-0.5 flex-shrink-0"
              />
            </div>

            {/* Permission 4 */}
            <div className="flex items-start justify-between p-3 sm:p-3.5 rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-color)] gap-3">
              <div className="pr-2">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Adjust publishing frequency based on performance
                </div>
                <div className="text-[10px] sm:text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  Throttles or increases posts per day to prevent audience fatigue.
                </div>
              </div>
              <input
                type="checkbox"
                checked={autopilotConfig.permissions.adjustPublishingFrequency}
                onChange={() => handleTogglePermission('adjustPublishingFrequency')}
                className="w-4 h-4 accent-[#00D6B2] rounded cursor-pointer mt-0.5 flex-shrink-0"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Autonomous Guardrails Configuration */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 space-y-4">
        <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
          <Lock className="w-4 h-4 text-[#00D6B2]" />
          <span>Configured Autonomous Guardrails & Limits</span>
        </h3>

        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 pt-1">
          {/* Spacing */}
          <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-1">
            <span className="text-[var(--text-secondary)] text-[11px] sm:text-xs">Minimum Spacing</span>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                min="1"
                max="24"
                value={autopilotConfig.safeguards.minSpacingHours}
                onChange={(e) =>
                  updateAutopilotConfig({
                    safeguards: {
                      ...autopilotConfig.safeguards,
                      minSpacingHours: parseInt(e.target.value, 10) || 4,
                    },
                  })
                }
                className="w-16 bg-[var(--bg-input)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-primary)] font-mono"
              />
              <span className="text-xs text-[var(--text-secondary)]">hours</span>
            </div>
          </div>

          {/* Max Daily Posts */}
          <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-1">
            <span className="text-[var(--text-secondary)] text-[11px] sm:text-xs">Max Daily Posts</span>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                min="1"
                max="10"
                value={autopilotConfig.safeguards.maxDailyPostsPerChannel}
                onChange={(e) =>
                  updateAutopilotConfig({
                    safeguards: {
                      ...autopilotConfig.safeguards,
                      maxDailyPostsPerChannel: parseInt(e.target.value, 10) || 3,
                    },
                  })
                }
                className="w-16 bg-[var(--bg-input)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-primary)] font-mono"
              />
              <span className="text-xs text-[var(--text-secondary)]">per channel</span>
            </div>
          </div>

          {/* Blackout Hours */}
          <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-1">
            <span className="text-[var(--text-secondary)] text-[11px] sm:text-xs">Blackout Hours</span>
            <div className="flex items-center space-x-1.5 text-xs">
              <input
                type="number"
                min="0"
                max="23"
                value={autopilotConfig.safeguards.blackoutHoursStart}
                onChange={(e) =>
                  updateAutopilotConfig({
                    safeguards: {
                      ...autopilotConfig.safeguards,
                      blackoutHoursStart: parseInt(e.target.value, 10) || 0,
                    },
                  })
                }
                className="w-12 bg-[var(--bg-input)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-primary)] font-mono"
              />
              <span className="text-[var(--text-secondary)]">to</span>
              <input
                type="number"
                min="0"
                max="23"
                value={autopilotConfig.safeguards.blackoutHoursEnd}
                onChange={(e) =>
                  updateAutopilotConfig({
                    safeguards: {
                      ...autopilotConfig.safeguards,
                      blackoutHoursEnd: parseInt(e.target.value, 10) || 7,
                    },
                  })
                }
                className="w-12 bg-[var(--bg-input)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-primary)] font-mono"
              />
              <span className="text-[var(--text-secondary)] font-mono">:00</span>
            </div>
          </div>

          {/* Confidence Threshold */}
          <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-1">
            <span className="text-[var(--text-secondary)] text-[11px] sm:text-xs">Min Confidence</span>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                min="50"
                max="95"
                step="5"
                value={autopilotConfig.safeguards.requireApprovalBelowConfidence}
                onChange={(e) =>
                  updateAutopilotConfig({
                    safeguards: {
                      ...autopilotConfig.safeguards,
                      requireApprovalBelowConfidence: parseInt(e.target.value, 10) || 70,
                    },
                  })
                }
                className="w-16 bg-[var(--bg-input)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-primary)] font-mono"
              />
              <span className="text-xs text-[var(--text-secondary)]">% required</span>
            </div>
          </div>
        </div>
      </div>

      {/* Autonomous Decisions Audit Log & Rollback */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-[#00D6B2]" />
            <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">Autonomous Decision Audit Log & Rollback</h3>
          </div>
          <span className="text-xs font-mono text-[var(--text-secondary)]">
            {auditLogs.length} Decision(s)
          </span>
        </div>

        {auditLogs.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--text-secondary)]">
            No autonomous decisions have been recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">{log.action}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface-hover)] text-[#ADF5E8] border border-[var(--border-color)]">
                      Rule: {log.ruleTriggered}
                    </span>
                    <span className="text-[10px] font-mono text-[#00D6B2]">
                      {log.confidenceScore}% Conf
                    </span>
                    {log.reverted && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                        REVERTED
                      </span>
                    )}
                  </div>
                  <p className="text-[var(--text-secondary)] leading-relaxed text-[11px] sm:text-xs">{log.details}</p>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono block">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>

                {log.previousValue && !log.reverted && (
                  <button
                    onClick={() => rollbackAuditLog(log.id)}
                    className="flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-amber-400/40 text-xs font-medium transition flex-shrink-0 self-start sm:self-auto min-h-[34px]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Rollback</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
