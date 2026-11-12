import React from 'react';
import { X, ShieldCheck, FileText } from 'lucide-react';
import { TermsArticle, PrivacyArticle } from './LegalContent';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  type: 'terms' | 'privacy';
}

export const PublicLegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose, title, type }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-[#0f141c] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-200">
        <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#00D6B2]/10 text-[#00D6B2]">
              {type === 'terms' ? <FileText size={18} /> : <ShieldCheck size={18} />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{title}</h3>
              <p className="text-xs text-slate-400">Effective Date: November 2026</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-5 text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
          {type === 'terms' ? <TermsArticle /> : <PrivacyArticle />}
        </div>

        <div className="p-4 border-t border-white/10 bg-[#0c1017] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-white hover:bg-slate-200 text-black text-xs font-bold transition-all"
          >
            I Understand & Close
          </button>
        </div>
      </div>
    </div>
  );
};
