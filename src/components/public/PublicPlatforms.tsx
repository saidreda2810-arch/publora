import React from 'react';
import { Youtube, Instagram, Facebook, Sparkles, Check, ExternalLink, ShieldCheck } from 'lucide-react';

export const PublicPlatforms: React.FC = () => {
  const platforms = [
    {
      id: 'youtube',
      name: 'YouTube & YouTube Shorts',
      icon: Youtube,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/30',
      authMethod: 'Official Google OAuth 2.0 PKCE',
      features: [
        'Direct upload for Long-form and Shorts',
        'Video Title, Description, Tags, Category, and Privacy setting',
        'Official YouTube Analytics API integration',
        'Audience watch-time and drop-off timeline sync',
      ],
      quota: '10,000 daily API quota credits with automatic backoff',
    },
    {
      id: 'instagram',
      name: 'Instagram Professional & Reels',
      icon: Instagram,
      color: 'text-pink-500',
      bgColor: 'bg-pink-500/10',
      borderColor: 'border-pink-500/30',
      authMethod: 'Meta Graph API with Facebook Page Linkage',
      features: [
        'Direct Instagram Reels publishing via Container API',
        'Custom captions, hashtags, and cover thumbnail offset',
        'Business and Creator profile analytics',
        'Follower demographic activity peaks by hour',
      ],
      quota: 'Standard 200 calls/hr Graph rate limit with live buffer counter',
    },
    {
      id: 'tiktok',
      name: 'TikTok Video API',
      icon: Sparkles,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      borderColor: 'border-cyan-500/30',
      authMethod: 'TikTok Login Kit & Direct Share API',
      features: [
        'Direct post initialization & video chunked upload',
        'Privacy level controls (Public, Friends, Private)',
        'Duet, Stitch, and Comment permissions toggle',
        'Video view milestones & engagement metrics',
      ],
      quota: 'TikTok Content Posting API compliant',
    },
    {
      id: 'facebook',
      name: 'Facebook Pages & Video',
      icon: Facebook,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
      authMethod: 'Facebook Login for Business & Page Access Tokens',
      features: [
        'Direct Page video feed publishing',
        'Multi-page selector per user account',
        'Long-lived Page Access Token auto-exchange',
        'Page video engagement, reach, and completion metrics',
      ],
      quota: 'Meta Business Partner API tier compliant',
    },
  ];

  return (
    <section id="platforms" className="py-20 sm:py-28 bg-[#080b0f] border-b border-white/5 relative">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00D6B2]/10 border border-[#00D6B2]/30 text-[#00D6B2] text-xs font-semibold mb-4">
            <ShieldCheck size={14} /> Official Platform Standards
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Universal Social Media Integration
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-400 leading-relaxed">
            Zero unofficial scrapers, zero brittle browser automation, zero account bans. We use 100% official platform OAuth 2.0 and publishing APIs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {platforms.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.id}
                className="p-6 sm:p-8 rounded-3xl bg-[#0f141c] border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-2xl ${p.bgColor} border ${p.borderColor}`}>
                        <Icon size={24} className={p.color} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">{p.name}</h3>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">{p.authMethod}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2.5">
                    {p.features.map((item) => (
                      <div key={item} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-300">
                        <Check size={16} className="text-[#00D6B2] shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-mono text-[11px] text-slate-400">{p.quota}</span>
                  <span className="inline-flex items-center gap-1 text-[#00D6B2] font-semibold">
                    Official API
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
