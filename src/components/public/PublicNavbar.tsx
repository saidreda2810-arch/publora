import React, { useState } from 'react';
import { Sparkles, ArrowRight, Menu, X, Shield, Lock, ExternalLink } from 'lucide-react';

interface PublicNavbarProps {
  onOpenSignIn: () => void;
  onOpenSignUp: () => void;
  onTryDemo: (role?: 'creator' | 'admin') => void;
}

export const PublicNavbar: React.FC<PublicNavbarProps> = ({
  onOpenSignIn,
  onOpenSignUp,
  onTryDemo,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Features', href: '#features' },
    { label: 'Platforms', href: '#platforms' },
    { label: 'Retention AI', href: '#retention' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'FAQ', href: '#faq' },
  ];

  const handleScrollTo = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-[60] w-full bg-[#0a0d12]/90 backdrop-blur-xl border-b border-white/5 transition-all">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 h-18 sm:h-20 flex items-center justify-between">
        {/* Brand Logo — links back to the top of the landing page */}
        <button
          type="button"
          onClick={() => {
            setMobileMenuOpen(false);
            if (window.location.hash) {
              window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          aria-label="Publora — back to top"
          className="flex items-center gap-3 rounded-xl hover:opacity-80 transition-opacity text-left"
        >
          <img
            src="/Publora-logo.svg"
            alt="Publora"
            className="h-9 sm:h-10 w-auto object-contain"
          />
        </button>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-slate-300">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={(e) => handleScrollTo(e, link.href)}
              className="hover:text-[#00D6B2] transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Action CTAs */}
        <div className="hidden sm:flex items-center gap-3">
          <button
            type="button"
            onClick={() => onTryDemo('creator')}
            className="text-xs text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all flex items-center gap-1.5"
          >
            <Sparkles size={14} className="text-[#00D6B2]" /> Instant Demo
          </button>

          <button
            type="button"
            onClick={onOpenSignIn}
            className="text-xs font-semibold text-white hover:text-[#00D6B2] px-4 py-2 rounded-xl transition-colors"
          >
            Sign In
          </button>

          <button
            type="button"
            onClick={onOpenSignUp}
            className="py-2.5 px-4 sm:px-5 rounded-xl font-bold text-xs bg-gradient-to-r from-[#00D6B2] to-emerald-400 text-black shadow-lg shadow-[#00D6B2]/15 hover:opacity-95 active:scale-95 transition-all flex items-center gap-1.5"
          >
            Get Started Free <ArrowRight size={14} />
          </button>
        </div>

        {/* Mobile menu toggle */}
        <div className="flex sm:hidden items-center gap-2">
          <button
            type="button"
            onClick={onOpenSignIn}
            className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg border border-white/10"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-300 hover:text-white rounded-lg border border-white/10"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-b border-white/10 bg-[#0c1017] px-5 py-5 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col space-y-3">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => handleScrollTo(e, link.href)}
                className="text-sm font-medium text-slate-300 hover:text-[#00D6B2] py-1"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="pt-3 border-t border-white/10 space-y-2">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onTryDemo('creator');
              }}
              className="w-full py-2.5 px-4 rounded-xl border border-white/10 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2"
            >
              <Sparkles size={14} className="text-[#00D6B2]" /> Test Sandbox (No Login)
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenSignUp();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#00D6B2] to-emerald-400 text-black text-xs font-bold flex items-center justify-center gap-2 shadow-lg"
            >
              Start Free Trial <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
