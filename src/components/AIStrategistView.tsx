import React, { useState } from 'react';
import { usePublisher } from '../context/PublisherContext';
import { ContentStrategyPlan, Platform } from '../types';
import {
  Compass,
  Sparkles,
  Calendar,
  CheckCircle2,
  Send,
  Lightbulb,
  Target,
  BarChart3,
  Copy,
  Check,
  RotateCw,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface AIStrategistViewProps {
  setActiveTab?: (tab: string) => void;
}

export const AIStrategistView: React.FC<AIStrategistViewProps> = ({ setActiveTab }) => {
  const { savedStrategy, saveStrategyPlan, createVideo } = usePublisher();

  const [industry, setIndustry] = useState(savedStrategy?.industry || 'B2B Software & AI Automation');
  const [targetAudience, setTargetAudience] = useState(savedStrategy?.targetAudience || 'Modern Founders, Operators & Creators');
  const [frequency, setFrequency] = useState<number>(savedStrategy?.frequencyPerWeek || 7);
  const [tone, setTone] = useState<string>(savedStrategy?.tone || 'Authoritative, direct, high-value');
  const [selectedGoals, setSelectedGoals] = useState<string[]>(
    savedStrategy?.goals || ['Audience Growth', 'Thought Leadership', 'Lead Generation']
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const availableGoals = [
    'Audience Growth',
    'Thought Leadership',
    'Lead Generation',
    'Community Engagement',
    'Brand Trust',
    'Product Education',
  ];

  const toggleGoal = (goal: string) => {
    setSelectedGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleGenerateStrategy = async () => {
    setIsGenerating(true);
    setStatusMsg(null);

    try {
      const res = await apiFetch('/api/ai/generate-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry,
          goals: selectedGoals,
          targetAudience,
          frequencyPerWeek: frequency,
          tone,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const plan: ContentStrategyPlan = {
          id: data.id || `strategy_${Date.now()}`,
          industry: data.industry,
          goals: data.goals || selectedGoals,
          targetAudience: data.targetAudience,
          frequencyPerWeek: data.frequencyPerWeek || frequency,
          tone: data.tone || tone,
          recommendedTopics: data.recommendedTopics || [],
          monthlyCalendarPlan: data.monthlyCalendarPlan || [],
          generatedAt: data.generatedAt || new Date().toISOString(),
        };

        saveStrategyPlan(plan);
        setStatusMsg('30-Day Strategy & Content Plan compiled successfully.');
      } else {
        setStatusMsg(`Failed to generate strategy: ${data.error || 'Server error'}`);
      }
    } catch (e: any) {
      setStatusMsg(`Connection error: ${e.message}`);
    } finally {
      setIsGenerating(false);
      setTimeout(() => setStatusMsg(null), 4000);
    }
  };

  const handleSendTopicToLibrary = (topicTitle: string, suggestedHook: string) => {
    createVideo({
      brandId: 'default',
      title: topicTitle,
      description: `Drafted from AI Strategist: ${suggestedHook}`,
      durationSeconds: 45,
      aspectRatio: '9:16',
      hookType: 'visual_reveal',
      editingPace: 'fast',
      sceneChangesCount: 6,
      tags: ['ai_strategy', 'short_form'],
    });

    setStatusMsg(`Created video asset "${topicTitle}" in Video Library.`);
    setTimeout(() => setStatusMsg(null), 3000);
    if (setActiveTab) {
      setTimeout(() => setActiveTab('aistudio'), 1200);
    }
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 hero-banner-gradient border border-purple-500/20 rounded-2xl p-6 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30 text-xs font-mono font-semibold uppercase">
              Module 10 • AI Content Strategy Assistant
            </span>
            <span className="text-xs text-[var(--text-secondary)] font-mono">Custom 30-Day Topic & Calendar Engine</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight flex items-center gap-3">
            <Compass className="text-purple-400" size={28} />
            AI Content Strategy & Topic Planner
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)] max-w-2xl">
            Build tailored publishing calendars, generate psychological hooks, and plan multi-platform themes aligned with your target audience and retention objectives.
          </p>
        </div>

        <button
          onClick={handleGenerateStrategy}
          disabled={isGenerating}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-[var(--text-primary)] font-bold text-sm transition flex items-center gap-2 shadow-lg shadow-purple-500/20 cursor-pointer disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <RotateCw className="animate-spin" size={16} /> Compiling 30-Day Strategy...
            </>
          ) : (
            <>
              <Sparkles size={16} /> Generate 30-Day Strategy
            </>
          )}
        </button>
      </div>

      {statusMsg && (
        <div className="p-4 rounded-xl bg-purple-950/80 border border-purple-500/40 text-purple-200 text-xs flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 size={16} className="text-[#00D6B2]" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Main Grid: Left Config & Right Plan */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Strategy Input Parameters (4 Cols) */}
        <div className="lg:col-span-4 space-y-5">
          <div className="bg-[var(--bg-surface)]/80 border border-[var(--border-color)] rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
              <Target size={16} className="text-purple-400" />
              Workspace Strategy Context
            </h2>

            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Industry / Niche</label>
              <input
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)]"
                placeholder="e.g. Real Estate, Creator Tech, SaaS"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Target Audience Persona</label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)]"
                placeholder="e.g. First-time home buyers, Junior software engineers"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
                Posting Frequency ({frequency} videos / week)
              </label>
              <input
                type="range"
                min="3"
                max="21"
                step="1"
                value={frequency}
                onChange={(e) => setFrequency(Number(e.target.value))}
                className="w-full accent-purple-400"
              />
              <div className="flex justify-between text-[10px] font-mono text-[var(--text-secondary)] mt-1">
                <span>3/wk (Light)</span>
                <span>7/wk (1 Daily)</span>
                <span>21/wk (High Volume)</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Tone & Brand Voice</label>
              <input
                type="text"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)]"
                placeholder="e.g. Authoritative, direct, inspiring"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1.5">Primary Goals</label>
              <div className="flex flex-wrap gap-1.5">
                {availableGoals.map((g) => {
                  const isSelected = selectedGoals.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleGoal(g)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                        isSelected
                          ? 'bg-purple-950 border border-purple-500/50 text-purple-200'
                          : 'bg-[var(--bg-input)]/60 border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Generated Plan & Recommended Topics (8 Cols) */}
        <div className="lg:col-span-8 space-y-5">
          {!savedStrategy ? (
            <div className="bg-[var(--bg-surface)]/60 border border-[var(--border-color)] rounded-2xl p-12 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center mx-auto">
                <Compass size={28} />
              </div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">No Strategy Generated Yet</h3>
              <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
                Set your industry and audience persona on the left, then click <strong className="text-[var(--text-primary)]">Generate 30-Day Strategy</strong> to formulate a complete blueprint.
              </p>
            </div>
          ) : (
            <>
              {/* Recommended High-Impact Topics */}
              <div className="bg-[var(--bg-surface)]/80 border border-[var(--border-color)] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="text-purple-400" size={18} />
                    <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                      Recommended High-Retention Topics
                    </h3>
                  </div>
                  <span className="text-xs font-mono text-[var(--text-secondary)]">
                    {savedStrategy.recommendedTopics.length} ideas
                  </span>
                </div>

                <div className="space-y-3">
                  {savedStrategy.recommendedTopics.map((topic, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-[var(--bg-input)]/40 border border-[var(--border-color)] hover:border-purple-500/30 transition space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-[var(--bg-surface-hover)] text-[10px] font-mono uppercase text-purple-300">
                              {topic.platform}
                            </span>
                            <span className="text-xs font-mono text-[var(--text-secondary)]">{topic.format}</span>
                          </div>
                          <h4 className="text-sm font-bold text-[var(--text-primary)] mt-1">{topic.title}</h4>
                        </div>

                        <button
                          onClick={() => handleSendTopicToLibrary(topic.title, topic.suggestedHook)}
                          className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-[var(--text-primary)] font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shadow"
                        >
                          Send to Studio <ArrowRight size={12} />
                        </button>
                      </div>

                      <div className="p-2.5 rounded-lg bg-[var(--bg-surface)]/60 border border-[var(--border-color)] text-xs text-[var(--text-secondary)] italic flex items-center justify-between">
                        <span>Hook: "{topic.suggestedHook}"</span>
                        <button
                          onClick={() => handleCopy(topic.suggestedHook, `hook_${idx}`)}
                          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] ml-2 flex-shrink-0"
                        >
                          {copiedKey === `hook_${idx}` ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>

                      <p className="text-[11px] text-[var(--text-secondary)]">{topic.rationale}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Monthly 4-Week Blueprint Grid */}
              <div className="bg-[var(--bg-surface)]/80 border border-[var(--border-color)] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="text-purple-400" size={18} />
                    <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                      4-Week Monthly Calendar Blueprint
                    </h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedStrategy.monthlyCalendarPlan.map((weekPlan) => (
                    <div
                      key={weekPlan.week}
                      className="p-4 rounded-xl bg-[var(--bg-input)]/30 border border-[var(--border-color)] space-y-2.5"
                    >
                      <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                        <span className="text-xs font-mono font-bold text-purple-300 uppercase">
                          Week {weekPlan.week}
                        </span>
                        <span className="text-xs font-semibold text-[var(--text-primary)]">{weekPlan.theme}</span>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        {weekPlan.posts.map((p, i) => (
                          <div
                            key={i}
                            className="p-2 rounded-lg bg-[var(--bg-surface)]/40 flex items-center justify-between text-[11px]"
                          >
                            <span className="font-mono text-[var(--text-secondary)]">{p.day}</span>
                            <span className="text-[var(--text-primary)] truncate max-w-[180px] font-medium">
                              {p.topic}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-[var(--bg-surface-hover)] font-mono text-[10px] uppercase text-cyan-300">
                              {p.platform}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};