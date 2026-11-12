import React, { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Building,
  Youtube,
  Instagram,
  Facebook,
  Bot,
  Shield,
  Clock,
  Target,
  Link2,
  Database,
  Send,
  PartyPopper,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePublisher } from '../context/PublisherContext';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: string) => void;
  onNewVideo?: () => void;
  onNewPost?: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
  onNewVideo,
  onNewPost,
}) => {
  const { activeWorkspace, updateWorkspaceSettings } = useAuth();
  const { createBrand, videos, accounts, brands } = usePublisher();

  const [step, setStep] = useState(1);
  const [workspaceName, setWorkspaceName] = useState(activeWorkspace?.name || 'My Creator Studio');
  const [niche, setNiche] = useState('Tech & AI Innovations');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['youtube', 'instagram', 'tiktok', 'facebook']);
  const [goal, setGoal] = useState<'growth' | 'consistency' | 'agency'>('growth');
  const [mode, setMode] = useState<'assisted' | 'autopilot'>('assisted');
  const [maxPosts, setMaxPosts] = useState(3);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const togglePlatform = (p: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((item) => item !== p) : [...prev, p]
    );
  };

  // Ensure a brand exists before deep-linking into connect/upload flows
  const ensureBrand = () => {
    if (brands.length === 0) {
      try {
        createBrand({
          name: workspaceName.replace(/('s Workspace|'s Studio)/, ''),
          color: '#00D6B2',
          industry: niche,
          targetAudience: 'Global social media audience',
          description: `Primary content channel for ${workspaceName}`,
        });
      } catch {}
    }
  };

  const goConnect = () => { ensureBrand(); onNavigateTab?.('connections'); };
  const goUpload = () => { ensureBrand(); onNewVideo?.(); };
  const goCreate = () => { ensureBrand(); onNewPost?.(); };

  const handleFinish = async () => {
    setIsSubmitting(true);
    // 1. Update workspace settings
    await updateWorkspaceSettings({
      onboardingCompleted: true,
      contentNiche: niche,
      defaultTimezone: timezone,
      defaultSchedulingMode: mode,
      maxDailyPosts: maxPosts,
    });

    // 2. Create primary brand in the workspace if no brands exist
    try {
      createBrand({
        name: workspaceName.replace(/('s Workspace|'s Studio)/, ''),
        color: '#00D6B2',
        industry: niche,
        targetAudience: 'Global social media audience',
        description: `Primary content channel for ${workspaceName}`,
      });
    } catch {}

    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-xl bg-[#0f141c] border border-[var(--border-color)] rounded-3xl shadow-2xl overflow-hidden text-[var(--text-primary)] p-6 sm:p-8">
        {/* Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#00D6B2]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Progress Bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  s === step ? 'w-8 bg-[#00D6B2]' : s < step ? 'w-4 bg-emerald-500' : 'w-4 bg-[var(--bg-surface-hover)]'
                }`}
              />
            ))}
          </div>
          <span className="text-xs font-mono text-[var(--text-secondary)]">Step {step} of 5</span>
        </div>

        {/* Step 1: Workspace & Brand Setup */}
        {step === 1 && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#00D6B2]/10 text-[#00D6B2] text-xs font-semibold mb-2">
                <Building size={14} /> Workspace Setup
              </div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Name Your Workspace</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Customize your tenant workspace and primary niche.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Workspace / Brand Name</label>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  className="w-full bg-[#161c26] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Primary Content Category / Niche</label>
                <input
                  type="text"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="e.g. Finance, Gaming, SaaS, Lifestyle, Education"
                  className="w-full bg-[#161c26] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Timezone for Publishing Windows</label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full font-mono bg-[#161c26] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Content Strategy & Goal */}
        {step === 2 && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-semibold mb-2">
                <Target size={14} /> Strategy & Objective
              </div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">What is your primary goal?</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                This configures the AI recommendation and retention scoring models.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {[
                {
                  id: 'growth',
                  title: 'Algorithmic Audience Growth',
                  desc: 'Focus on 0-3s hook optimization and high completion rate loops to trigger platform viral feeds.',
                },
                {
                  id: 'consistency',
                  title: 'Autopilot Publishing Consistency',
                  desc: 'Maintain daily scheduled cadence with automated timing slot discovery and zero burnout.',
                },
                {
                  id: 'agency',
                  title: 'Multi-Brand / Client Repurposing',
                  desc: 'Cross-post tailored cuts seamlessly to YouTube Shorts, Instagram Reels, TikTok, and Facebook.',
                },
              ].map((item) => (
                <div
                  key={item.id}
                  onClick={() => setGoal(item.id as any)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    goal === item.id
                      ? 'bg-[#00D6B2]/10 border-[#00D6B2] shadow-lg shadow-[#00D6B2]/5'
                      : 'bg-[#161c26] border-[var(--border-color)] hover:border-[var(--border-color)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--text-primary)] text-sm">{item.title}</span>
                    {goal === item.id && <Check size={18} className="text-[#00D6B2]" />}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Target Platforms */}
        {step === 3 && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-semibold mb-2">
                <Sparkles size={14} /> Platform Ecosystem
              </div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Select Target Platforms</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Choose the social channels you plan to connect and publish to.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'youtube', label: 'YouTube / Shorts', icon: Youtube, color: 'text-red-400', desc: 'Google OAuth 2.0 API' },
                { id: 'instagram', label: 'Instagram Reels', icon: Instagram, color: 'text-pink-400', desc: 'Graph Content API' },
                { id: 'tiktok', label: 'TikTok Video', icon: Sparkles, color: 'text-cyan-400', desc: 'Direct Share API' },
                { id: 'facebook', label: 'Facebook Pages', icon: Facebook, color: 'text-blue-400', desc: 'Pages & Video API' },
              ].map((p) => {
                const Icon = p.icon;
                const isSelected = selectedPlatforms.includes(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#00D6B2]/10 border-[#00D6B2]'
                        : 'bg-[#161c26] border-[var(--border-color)] hover:border-[var(--border-color)] opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Icon size={20} className={p.color} />
                      {isSelected ? <Check size={16} className="text-[#00D6B2]" /> : <span className="w-4 h-4 rounded-full border border-[var(--border-color)]" />}
                    </div>
                    <div className="font-semibold text-[var(--text-primary)] text-sm">{p.label}</div>
                    <div className="text-[11px] text-[var(--text-secondary)]">{p.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: AI & Autopilot Guardrails */}
        {step === 4 && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold mb-2">
                <Shield size={14} /> Autonomous Guardrails
              </div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Configure Publishing Autopilot</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Select your preferred automation balance and daily safeguard limits.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div
                  onClick={() => setMode('assisted')}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    mode === 'assisted'
                      ? 'bg-[#00D6B2]/10 border-[#00D6B2]'
                      : 'bg-[#161c26] border-[var(--border-color)] hover:border-[var(--border-color)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-[var(--text-primary)] text-sm">Assisted Mode</span>
                    {mode === 'assisted' && <Check size={16} className="text-[#00D6B2]" />}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">AI suggests best times and titles; human confirms each post.</p>
                </div>

                <div
                  onClick={() => setMode('autopilot')}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    mode === 'autopilot'
                      ? 'bg-[#00D6B2]/10 border-[#00D6B2]'
                      : 'bg-[#161c26] border-[var(--border-color)] hover:border-[var(--border-color)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-[var(--text-primary)] text-sm">Autopilot Mode</span>
                    {mode === 'autopilot' && <Check size={16} className="text-[#00D6B2]" />}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">Autonomous timing optimization with automatic emergency safeguards.</p>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1.5">
                  <span>Maximum Daily Posts per Channel</span>
                  <span className="font-bold text-[#00D6B2]">{maxPosts} posts/day</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={8}
                  value={maxPosts}
                  onChange={(e) => setMaxPosts(Number(e.target.value))}
                  className="w-full accent-[#00D6B2]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Next Steps ” guided first actions */}
        {step === 5 && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#00D6B2]/10 text-[#00D6B2] text-xs font-semibold mb-2">
                <PartyPopper size={14} /> You're all set
              </div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Ready to publish?</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Three quick steps to your first post. You can do these now or anytime later.
              </p>
            </div>

            <div className="space-y-2.5">
              {[
                {
                  done: accounts.filter((a) => a.isConnected).length > 0,
                  icon: Link2,
                  title: 'Connect a social account',
                  desc: 'Link YouTube, TikTok, Instagram or Facebook so posts can publish.',
                  action: goConnect,
                  cta: 'Connect accounts',
                },
                {
                  done: videos.length > 0,
                  icon: Database,
                  title: 'Add your first video',
                  desc: 'Upload an MP4/MOV/WebM (up to 100MB) to your library.',
                  action: goUpload,
                  cta: 'Upload video',
                },
                {
                  done: false,
                  icon: Send,
                  title: 'Create your first post',
                  desc: 'Pick a video, choose platforms, write a caption, schedule.',
                  action: goCreate,
                  cta: 'Create content',
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.title}
                    type="button"
                    onClick={item.action}
                    className="w-full text-left p-3.5 rounded-2xl border border-[var(--border-color)] bg-[#161c26] hover:border-[#00D6B2]/50 transition-all flex items-center gap-3"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${item.done ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[#00D6B2]/10 text-[#00D6B2]'}`}>
                      {item.done ? <Check size={16} /> : <Icon size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                        {item.title}
                        {item.done && <span className="text-[10px] font-mono text-emerald-400">DONE</span>}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5">{item.desc}</div>
                    </div>
                    <ArrowRight size={16} className="text-[var(--text-muted)] flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="mt-8 pt-4 border-t border-[var(--border-color)] flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="py-2.5 px-4 rounded-xl border border-[var(--border-color)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] font-semibold flex items-center gap-1.5"
            >
              <ArrowLeft size={16} /> Back
            </button>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="py-2.5 px-6 rounded-xl bg-white hover:bg-slate-200 text-black text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              Next Step <ArrowRight size={16} />
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl border border-[var(--border-color)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] font-semibold"
              >
                Maybe later
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleFinish}
                className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-[#00D6B2] to-emerald-400 text-black text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-[#00D6B2]/20 hover:opacity-90 transition-all"
              >
                {isSubmitting ? 'Saving...' : <>Enter Dashboard <Check size={16} /></>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
