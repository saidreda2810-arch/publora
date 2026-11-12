import React from 'react';
import { ArrowLeft, ShieldCheck, FileText } from 'lucide-react';
import { TermsArticle, PrivacyArticle } from './LegalContent';

interface PublicLegalPageProps {
  type: 'terms' | 'privacy';
  onBack: () => void;
}

export const PublicLegalPage: React.FC<PublicLegalPageProps> = ({ type, onBack }) => {
  const isTerms = type === 'terms';
  const title = isTerms ? 'Terms of Service' : 'Privacy Policy & Data Security';

  return (
    <div className="min-h-screen bg-[#0a0d12] text-slate-200 font-sans">
      {/* Top bar */}
      <header className="border-b border-white/5 bg-[#07090d]/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            aria-label="Publora — back to home"
            className="flex items-center gap-2.5 rounded-lg hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00D6B2] to-indigo-600 flex items-center justify-center font-mono font-black text-black text-xs">
              SRA
            </div>
            <span className="font-bold text-white text-base">Publora</span>
          </button>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/5"
          >
            <ArrowLeft size={15} /> Back to website
          </button>
        </div>
      </header>

      {/* Article */}
      <main className="max-w-[760px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-[#00D6B2]/10 text-[#00D6B2]">
            {isTerms ? <FileText size={20} /> : <ShieldCheck size={20} />}
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{title}</h1>
            <p className="text-xs text-slate-400">Effective Date: November 2026</p>
          </div>
        </div>

        <article className="mt-8 space-y-6 text-sm sm:text-[15px] leading-relaxed text-slate-300">
          {isTerms ? <TermsArticle /> : <PrivacyArticle />}
        </article>
      </main>
    </div>
  );
};
