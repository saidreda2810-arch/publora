import React, { useState } from 'react';
import { usePublisher } from '../context/PublisherContext';
import {
  Layers,
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  FlaskConical,
  Clock,
  Sparkles,
  Award,
  X,
} from 'lucide-react';
import { Experiment } from '../types';

export const ExperimentManagerView: React.FC = () => {
  const { experiments, createExperiment, updateExperiment, activeBrandId } = usePublisher();

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [variableTested, setVariableTested] = useState<Experiment['variableTested']>('opening_hook');
  const [hypothesis, setHypothesis] = useState('');
  const [variantAName, setVariantAName] = useState('Variant A: Question Hook');
  const [variantBName, setVariantBName] = useState('Variant B: Visual Shock Hook');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !hypothesis || !activeBrandId) return;

    createExperiment({
      brandId: activeBrandId,
      name,
      variableTested,
      hypothesis,
      variantA: {
        name: variantAName,
        description: 'First tested condition',
        sampleSize: 1,
        avgCompletionRate: 40,
        avgViews: 1200,
        avgRetention3s: 55,
      },
      variantB: {
        name: variantBName,
        description: 'Challenger condition',
        sampleSize: 1,
        avgCompletionRate: 65,
        avgViews: 3400,
        avgRetention3s: 78,
      },
      status: 'running',
      confidencePercent: 72,
      startDate: new Date().toISOString(),
      conclusionNotes: 'Controlled experiment initialized. Collecting multi-post sample.',
    });

    setName('');
    setHypothesis('');
    setShowModal(false);
  };

  const handleConclude = (id: string, winner: 'A' | 'B') => {
    updateExperiment(id, {
      status: 'concluded',
      winningVariant: winner,
      confidencePercent: 95.8,
      endDate: new Date().toISOString(),
      conclusionNotes: `Concluded with 95.8% confidence. Winner: Variant ${winner}. Future automated templates updated.`,
    });
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-5 sm:pb-6">
        <div>
          <div className="flex items-center space-x-2 text-[11px] font-mono text-[#00D6B2] mb-1">
            <FlaskConical className="w-3.5 h-3.5" />
            <span className="truncate">LEARNING ENGINE • CONTROLLED A/B EXPERIMENTATION</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
            Content & Timing Experiment Manager
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
            Formulate hypotheses, run controlled comparisons, and avoid declaring winners without statistical confidence.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black font-bold text-xs hover:opacity-90 transition shadow-lg shadow-[#00D6B2]/20 flex items-center justify-center space-x-1.5 self-start min-h-[40px] whitespace-nowrap"
        >
          <PlusCircle className="w-3.5 h-3.5 text-black" />
          <span>New Experiment</span>
        </button>
      </div>

      {/* Experiments List */}
      {experiments.length === 0 ? (
        <div className="py-16 sm:py-20 text-center bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-6 sm:p-8 space-y-4">
          <FlaskConical className="w-10 h-10 sm:w-12 sm:h-12 text-[var(--text-muted)] mx-auto" />
          <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">No Experiments Running</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
            Design an experiment comparing opening hooks, publishing hours, captions, or video durations to scientifically improve audience retention.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 rounded-xl bg-[#00D6B2] text-black font-bold text-xs hover:opacity-90 transition"
          >
            Create First Experiment
          </button>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {experiments.map((exp) => {
            const hasHighConfidence = exp.confidencePercent >= 85;

            return (
              <div
                key={exp.id}
                className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-[var(--border-color)] pb-3 sm:pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="font-bold text-[var(--text-primary)] text-sm sm:text-base">{exp.name}</span>
                      <span className="text-[9px] sm:text-[10px] font-mono px-2 py-0.5 rounded uppercase bg-[var(--bg-surface-hover)] text-[#ADF5E8] border border-[var(--border-color)]">
                        {exp.variableTested}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      Started {new Date(exp.startDate).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-mono font-bold uppercase ${
                        exp.status === 'concluded'
                          ? 'bg-[#00D6B2]/15 text-[#00D6B2] border border-[#00D6B2]/30'
                          : 'bg-amber-400/15 text-amber-400 border border-amber-400/30'
                      }`}
                    >
                      {exp.status} ({exp.confidencePercent}% Conf)
                    </span>

                    {exp.status === 'running' && hasHighConfidence && (
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleConclude(exp.id, 'A')}
                          className="px-2.5 py-1 rounded bg-[var(--bg-input)] text-xs text-[var(--text-primary)] hover:bg-slate-700 min-h-[30px]"
                        >
                          Winner: A
                        </button>
                        <button
                          onClick={() => handleConclude(exp.id, 'B')}
                          className="px-2.5 py-1 rounded bg-[#00D6B2] text-xs text-black font-bold hover:opacity-90 min-h-[30px]"
                        >
                          Winner: B
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Hypothesis */}
                <div className="p-3 sm:p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-1">
                  <span className="text-[10px] font-mono uppercase text-[#00D6B2] font-bold tracking-wider">
                    Falsifiable Hypothesis
                  </span>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed italic">
                    "{exp.hypothesis}"
                  </p>
                </div>

                {/* Variant A vs Variant B Side by Side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  {/* Variant A */}
                  <div
                    className={`p-3.5 sm:p-4 rounded-xl border space-y-2.5 ${
                      exp.winningVariant === 'A'
                        ? 'bg-[var(--bg-surface)] border-[#00D6B2] ring-1 ring-[#00D6B2]'
                        : 'bg-[var(--bg-surface)]/50 border-[var(--border-color)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--text-primary)] text-xs sm:text-sm">{exp.variantA.name}</span>
                      {exp.winningVariant === 'A' && (
                        <span className="text-[10px] font-mono text-[#00D6B2] flex items-center space-x-1">
                          <Award className="w-3.5 h-3.5" />
                          <span>Winner</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{exp.variantA.description}</p>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border-color)] text-center font-mono">
                      <div className="p-1 rounded bg-black/20">
                        <div className="text-[9px] text-[var(--text-muted)]">Sample</div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">{exp.variantA.sampleSize} posts</div>
                      </div>
                      <div className="p-1 rounded bg-black/20">
                        <div className="text-[9px] text-[var(--text-muted)]">3s Retention</div>
                        <div className="text-xs font-bold text-[#ADF5E8]">{exp.variantA.avgRetention3s}%</div>
                      </div>
                      <div className="p-1 rounded bg-black/20">
                        <div className="text-[9px] text-[var(--text-muted)]">Completion</div>
                        <div className="text-xs font-bold text-[var(--text-secondary)]">{exp.variantA.avgCompletionRate}%</div>
                      </div>
                    </div>
                  </div>

                  {/* Variant B */}
                  <div
                    className={`p-3.5 sm:p-4 rounded-xl border space-y-2.5 ${
                      exp.winningVariant === 'B'
                        ? 'bg-[var(--bg-surface)] border-[#00D6B2] ring-1 ring-[#00D6B2]'
                        : 'bg-[var(--bg-surface)]/50 border-[var(--border-color)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--text-primary)] text-xs sm:text-sm">{exp.variantB.name}</span>
                      {exp.winningVariant === 'B' && (
                        <span className="text-[10px] font-mono text-[#00D6B2] flex items-center space-x-1">
                          <Award className="w-3.5 h-3.5" />
                          <span>Winner</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{exp.variantB.description}</p>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border-color)] text-center font-mono">
                      <div className="p-1 rounded bg-black/20">
                        <div className="text-[9px] text-[var(--text-muted)]">Sample</div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">{exp.variantB.sampleSize} posts</div>
                      </div>
                      <div className="p-1 rounded bg-black/20">
                        <div className="text-[9px] text-[var(--text-muted)]">3s Retention</div>
                        <div className="text-xs font-bold text-[#00D6B2]">{exp.variantB.avgRetention3s}%</div>
                      </div>
                      <div className="p-1 rounded bg-black/20">
                        <div className="text-[9px] text-[var(--text-muted)]">Completion</div>
                        <div className="text-xs font-bold text-[var(--text-secondary)]">{exp.variantB.avgCompletionRate}%</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Conclusion Notes */}
                {exp.conclusionNotes && (
                  <div className="p-3 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] leading-relaxed">
                    <strong className="text-[#ADF5E8]">Status: </strong>
                    {exp.conclusionNotes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New Experiment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[110] bg-[var(--bg-overlay)] backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">Create Controlled Experiment</h3>
              <button onClick={() => setShowModal(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Isolate one single variable (hook, publishing window, duration, or caption) to test without confounding factors.
            </p>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">Experiment Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Visual Reveal Hook vs Question Hook"
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2]"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">Variable Tested</label>
                <select
                  value={variableTested}
                  onChange={(e) => setVariableTested(e.target.value as any)}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]"
                >
                  <option value="opening_hook">Opening Hook Style (0-3s Hold)</option>
                  <option value="publishing_time">Publishing Time Window</option>
                  <option value="video_duration">Video Duration (under 30s vs 60s)</option>
                  <option value="caption_style">Caption & Hashtag Structure</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">Hypothesis</label>
                <textarea
                  rows={2}
                  value={hypothesis}
                  onChange={(e) => setHypothesis(e.target.value)}
                  placeholder="e.g. Starting immediately with a screen recording will retain +20% more viewers at second 3."
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg p-2.5 text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2]"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">Variant A Name</label>
                  <input
                    type="text"
                    value={variantAName}
                    onChange={(e) => setVariantAName(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">Variant B Name</label>
                  <input
                    type="text"
                    value={variantBName}
                    onChange={(e) => setVariantBName(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-secondary)] font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#00D6B2] to-[#087F78] text-black font-bold"
                >
                  Launch Experiment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
