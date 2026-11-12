import React from 'react';
import {
  TrendingUp,
  Clock,
  ShieldAlert,
  Share2,
  Cpu,
  Layers,
  LineChart,
  CheckCircle2,
  Lock,
  Zap,
} from 'lucide-react';

export const PublicFeatures: React.FC = () => {
  const features = [
    {
      icon: TrendingUp,
      tag: 'Retention Intelligence',
      title: 'Second-by-Second Drop-off Diagnosis',
      desc: 'Pinpoint the exact millisecond viewers scroll away. Distinguish between 0-3s hook failures, mid-video pacing drop-offs, and outro dropouts with AI recommendations.',
      bullets: [
        '0-3s Hook Abandonment Rate Calculation',
        'Plateau and Drop-off Severity Classification',
        'Re-watch and Loop Velocity Indicators',
      ],
      color: 'from-emerald-500/20 to-[#00D6B2]/20',
      textColor: 'text-[#00D6B2]',
    },
    {
      icon: Clock,
      tag: 'Algorithmic Optimizer',
      title: 'High-Probability Publishing Windows',
      desc: 'Never guess when to post. Our algorithmic models calculate viewer concurrency peaks across timezones to maximize organic feed discovery in the crucial initial 2 hours.',
      bullets: [
        'Timezone-Adjusted Audience Activity Mapping',
        'Avoids Dead-Hour Low-Velocity Penalties',
        'Continuous Learning from Past Video Outcomes',
      ],
      color: 'from-cyan-500/20 to-blue-500/20',
      textColor: 'text-cyan-400',
    },
    {
      icon: ShieldAlert,
      tag: 'Autonomous Safeguards',
      title: 'Autopilot Engine with Human Guardrails',
      desc: 'Gain the speed of AI publishing without sacrificing brand safety. Set strict daily post limits, blackout windows, minimum interval spacing, and 1-click emergency stop.',
      bullets: [
        'Instant Global Emergency Pause Switch',
        'Channel Flood Prevention (Max posts/day)',
        'Full Audit Trail with 1-Click Rollback',
      ],
      color: 'from-amber-500/20 to-rose-500/20',
      textColor: 'text-amber-400',
    },
    {
      icon: Share2,
      tag: 'Unified Connection Hub',
      title: 'Universal Multi-Account OAuth Center',
      desc: 'Connect unlimited accounts across YouTube, Instagram, TikTok, and Facebook Pages. Secure PKCE authorization, channel picker, token auto-refresh, and live diagnostics.',
      bullets: [
        'Official Google, Meta Graph & TikTok APIs',
        'Scoped Workspace & Member Isolation',
        'Clear Permission Granularity & API Quota Tracking',
      ],
      color: 'from-indigo-500/20 to-purple-500/20',
      textColor: 'text-indigo-400',
    },
    {
      icon: Cpu,
      tag: 'AI Content Optimizer',
      title: 'Platform-Tuned Metadata & Experiments',
      desc: 'Generate viral hook variants, titles, descriptions, and hashtags customized for platform algorithms. Run A/B hypothesis tests to discover what drives completion.',
      bullets: [
        'Algorithmic Hook & Thumbnail Hypothesis Testing',
        'Platform-Specific Caption & Hashtag Tailoring',
        'Correlation Analysis between Metadata & Watch Time',
      ],
      color: 'from-purple-500/20 to-pink-500/20',
      textColor: 'text-purple-400',
    },
    {
      icon: Layers,
      tag: 'Multi-Tenant Workspaces',
      title: 'Team Collaboration & Workspace Isolation',
      desc: 'Switch between separate workspaces for your personal channels, agency clients, or enterprise brands. Strict data boundaries ensure zero account cross-contamination.',
      bullets: [
        'Independent Credentials & Token Vault',
        'Role-Based Team Access (Owner, Admin, Member)',
        'Tenant-Isolated Publishing Queues & Analytics',
      ],
      color: 'from-teal-500/20 to-emerald-500/20',
      textColor: 'text-teal-400',
    },
  ];

  return (
    <section id="features" className="py-20 sm:py-28 bg-[#0a0d12] border-b border-white/5 relative">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="max-w-3xl mx-auto text-center mb-16 sm:mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold mb-4">
            <Zap size={14} /> Core Capabilities
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Engineered for Serious Video Creators & Modern SaaS Teams
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-400 leading-relaxed">
            Every feature is designed around one core thesis: Video performance is a mathematical optimization problem of Hook Retention, Publishing Timing, and Consistency.
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group relative p-6 sm:p-8 rounded-3xl bg-[#0f141c] border border-white/10 hover:border-white/20 transition-all duration-300 flex flex-col justify-between overflow-hidden hover:-translate-y-1 shadow-lg"
              >
                {/* Subtle top glow */}
                <div
                  className={`absolute top-0 right-0 w-36 h-36 bg-gradient-to-br ${f.color} rounded-full blur-2xl opacity-40 group-hover:opacity-75 transition-opacity pointer-events-none`}
                />

                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className="p-3 rounded-2xl bg-[#161c26] border border-white/10 text-white group-hover:scale-110 transition-transform">
                      <Icon size={24} className={f.textColor} />
                    </div>
                    <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 bg-white/5 px-2.5 py-1 rounded-full">
                      {f.tag}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-white tracking-tight mb-2.5">
                    {f.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-6">
                    {f.desc}
                  </p>
                </div>

                <div className="pt-4 border-t border-white/5 space-y-2">
                  {f.bullets.map((bullet) => (
                    <div key={bullet} className="flex items-center gap-2 text-xs text-slate-300">
                      <CheckCircle2 size={14} className={f.textColor} />
                      <span>{bullet}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
