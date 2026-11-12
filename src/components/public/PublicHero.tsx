import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Youtube,
  Instagram,
  Facebook,
  Play,
  CheckCircle2,
  Zap,
} from 'lucide-react';

interface PublicHeroProps {
  onOpenSignUp: () => void;
  onTryDemo: (role?: 'creator' | 'admin') => void;
}

export const PublicHero: React.FC<PublicHeroProps> = ({ onOpenSignUp, onTryDemo }) => {
  const [activePlatformTab, setActivePlatformTab] = useState<'youtube' | 'instagram' | 'tiktok' | 'facebook'>('youtube');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [typed, setTyped] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const EYEBROW = 'THE FUTURE OF SOCIAL MEDIA MANAGEMENT';

  // Freeze on the exact final frame — pause without resetting currentTime
  const handleVideoEnded = () => {
    const v = videoRef.current;
    if (v) { v.pause(); }
  };

  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    // Graceful autoplay fallback: if autoplay is blocked, show first frame
    const v = videoRef.current;
    if (v) {
      v.play().catch(() => { try { v.currentTime = 0.001; } catch {} });
    }
    // Trigger entrance animations after mount
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Typewriter for the eyebrow (skipped for reduced-motion)
  useEffect(() => {
    if (reduceMotion) { setTyped(EYEBROW); return; }
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setTyped(EYEBROW.slice(0, i));
      if (i >= EYEBROW.length) clearInterval(iv);
    }, 45);
    return () => clearInterval(iv);
  }, [reduceMotion]);

  return (
    <section className="relative pt-12 sm:pt-20 pb-16 sm:pb-24 overflow-hidden border-b border-white/5">
      {/* Background video — fits (contain) inside hero, plays once, freezes on last frame */}
      {!reduceMotion && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={handleVideoEnded}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          aria-hidden="true"
        >
          <source src="/hero-bg-mobile.mp4" type="video/mp4" media="(max-width: 768px)" />
          <source src="/hero-bg.mp4" type="video/mp4" />
        </video>
      )}

      {/* Legibility scrim — keeps hero text crisp over the video */}
      <div className="absolute inset-0 bg-[#0B1115]/55 backdrop-blur-[2px] pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1115]/70 via-transparent to-[#0B1115]/80 pointer-events-none" />

      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[900px] h-[300px] sm:h-[450px] bg-gradient-to-tr from-[#00D6B2]/15 via-teal-500/10 to-indigo-600/15 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Eyebrow badge — typewriter */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#00D6B2]/10 border border-[#00D6B2]/30 text-[#00D6B2] text-xs font-semibold mb-6 shadow-sm shadow-[#00D6B2]/10">
            <Sparkles size={14} />
            <span className="min-h-[1em]">
              {typed}
              {!reduceMotion && typed.length < EYEBROW.length && <span className="inline-block w-[2px] h-[0.9em] bg-[#00D6B2] ml-0.5 align-middle animate-pulse" />}
            </span>
          </div>

          {/* Main Title — staggered line reveal */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.08] sm:leading-[1.12]">
            {[
              { text: 'Your Content. Your Audience.', accent: false },
              { text: 'Your Growth.', accent: true },
            ].map((line, i) => (
              <span
                key={i}
                className={`block transition-all duration-700 ease-out ${
                  mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                } ${line.accent ? 'text-[#00D6B2]' : ''}`}
                style={{ transitionDelay: `${200 + i * 180}ms` }}
              >
                {line.text}
              </span>
            ))}
          </h1>

          {/* Subtitle — fades in after headline */}
          <p className={`mt-6 text-base sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '800ms' }}>
            Bring all your social media channels, content, scheduling, and audience insights together in one powerful platform. Manage everything effortlessly, make smarter decisions, and build a stronger digital presence with Publora.
          </p>

          {/* CTA Group — fades in last */}
          <div className={`mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '1000ms' }}>
            <button
              type="button"
              onClick={onOpenSignUp}
              className="w-full sm:w-auto py-3.5 px-8 rounded-2xl bg-[#00D6B2] text-black text-sm sm:text-base font-bold shadow-xl shadow-[#00D6B2]/20 hover:bg-[#00e0bd] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2.5"
            >
              Create Free Account <ArrowRight size={18} />
            </button>

            <button
              type="button"
              onClick={() => onTryDemo('creator')}
              className="w-full sm:w-auto py-3.5 px-6 rounded-2xl bg-transparent hover:bg-white/5 border border-white/25 hover:border-[#00D6B2]/50 text-white text-sm sm:text-base font-semibold transition-all flex items-center justify-center gap-2.5"
            >
              <Play size={16} className="text-[#00D6B2] fill-[#00D6B2]" /> Explore Publora
            </button>
          </div>

          {/* Platform indicators */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><Youtube size={13} className="text-slate-400" /> YouTube</span>
            <span className="flex items-center gap-1.5"><Instagram size={13} className="text-slate-400" /> Instagram</span>
            <span className="flex items-center gap-1.5"><Sparkles size={13} className="text-slate-400" /> TikTok</span>
            <span className="flex items-center gap-1.5"><Facebook size={13} className="text-slate-400" /> Facebook Pages</span>
          </div>

          {/* Feature highlights */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[11px] font-mono text-slate-500">
            <span>Smart Scheduling</span><span className="text-[#00D6B2]/60">·</span>
            <span>Audience Insights</span><span className="text-[#00D6B2]/60">·</span>
            <span>Automated Publishing</span><span className="text-[#00D6B2]/60">·</span>
            <span>Complete Control</span>
          </div>

          {/* Brand signature */}
          <p className="mt-8 text-[11px] font-mono tracking-widest text-slate-600 uppercase">
            PUBLORA — Publish smarter. Grow further.
          </p>
        </div>

        {/* Hero Interactive Preview Card */}
        <div className="mt-14 sm:mt-18 max-w-5xl mx-auto rounded-3xl border border-white/15 bg-[#0e131b]/90 backdrop-blur-2xl shadow-2xl p-4 sm:p-7 overflow-hidden">
          {/* Card Topbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between pb-5 border-b border-white/10 gap-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500/80" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
              <span className="ml-2 font-mono text-xs text-slate-400">
                app.srapublisher.io/workspace
              </span>
            </div>

            {/* Platform Switcher */}
            <div className="flex items-center p-1 rounded-xl bg-[#141a24] border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setActivePlatformTab('youtube')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  activePlatformTab === 'youtube' ? 'bg-[#00D6B2] text-black font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Youtube size={14} /> YouTube
              </button>
              <button
                type="button"
                onClick={() => setActivePlatformTab('instagram')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  activePlatformTab === 'instagram' ? 'bg-[#00D6B2] text-black font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Instagram size={14} /> Instagram
              </button>
              <button
                type="button"
                onClick={() => setActivePlatformTab('tiktok')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  activePlatformTab === 'tiktok' ? 'bg-[#00D6B2] text-black font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles size={14} /> TikTok
              </button>
              <button
                type="button"
                onClick={() => setActivePlatformTab('facebook')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  activePlatformTab === 'facebook' ? 'bg-[#00D6B2] text-black font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Facebook size={14} /> Facebook
              </button>
            </div>
          </div>

          {/* Card Content Grid */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-[#141a24] border border-white/5">
              <div className="text-xs text-slate-400 font-medium">Hook Retention Diagnostics</div>
              <div className="text-lg font-bold text-white mt-1">0–3s Curve Analysis</div>
              <div className="text-xs text-slate-300 mt-2 leading-relaxed">
                Evaluates first-second drop-off rates and completion milestones from linked accounts.
              </div>
              <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-mono text-[#00D6B2]">
                <CheckCircle2 size={12} /> Official API Ingestion
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#141a24] border border-white/5">
              <div className="text-xs text-slate-400 font-medium">Publish Window Discovery</div>
              <div className="text-lg font-bold text-white mt-1">Concurrency Engine</div>
              <div className="text-xs text-slate-300 mt-2 leading-relaxed">
                Calculates audience concurrency peaks across timezones to identify active posting slots.
              </div>
              <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-mono text-[#00D6B2]">
                <TrendingUp size={12} /> Timezone-Aware
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#141a24] border border-white/5">
              <div className="text-xs text-slate-400 font-medium">Autopilot Safeguards</div>
              <div className="text-lg font-bold text-white mt-1">Safety Guardrails</div>
              <div className="text-xs text-slate-300 mt-2 leading-relaxed">
                Sets maximum daily post limits, blackout windows, and one-click emergency pausing.
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[11px] font-mono text-emerald-300">Operator Override Ready</span>
              </div>
            </div>
          </div>

          {/* Retention Curve Teaser */}
          <div className="mt-5 p-4 sm:p-5 rounded-2xl bg-[#121721] border border-white/5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="text-xs font-semibold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00D6B2]" /> Second-by-Second Viewer Retention Curve
              </div>
              <span className="text-[11px] font-mono text-slate-400">Authentic Telemetry Ingestion</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              When you link your YouTube, Instagram, Facebook, or TikTok accounts and publish content, this panel plots your viewers&apos; true retention curve second-by-second with zero simulated filler.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
