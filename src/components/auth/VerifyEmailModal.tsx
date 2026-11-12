import React, { useState } from 'react';
import { X, MailCheck, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface VerifyEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialToken?: string;
}

export const VerifyEmailModal: React.FC<VerifyEmailModalProps> = ({
  isOpen,
  onClose,
  initialToken = '',
}) => {
  const { user, verifyEmail } = useAuth();
  const [token, setToken] = useState(initialToken);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError('Please enter or paste your verification code.');
      return;
    }
    setError(null);
    setIsLoading(true);

    const res = await verifyEmail(token.trim());
    setIsLoading(false);
    if (res.success) {
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      setError(res.error || 'Verification code invalid or expired.');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[var(--bg-overlay)] backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#0f141c] border border-[var(--border-color)] rounded-2xl shadow-2xl p-6 sm:p-8 overflow-hidden text-[var(--text-primary)]">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 rounded-lg hover:bg-[var(--bg-surface-hover)] transition-colors"
        >
          <X size={20} />
        </button>

        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3">
            <MailCheck size={14} /> Verification
          </div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Verify Your Email</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            We sent a verification code to <span className="text-[var(--text-primary)] font-medium">{user?.email || 'your address'}</span>.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-sm text-emerald-300">
            <CheckCircle2 size={24} className="text-emerald-400 shrink-0" />
            <div>
              <p className="font-semibold text-[var(--text-primary)]">Email Verified!</p>
              <p className="text-xs text-emerald-400/90 mt-0.5">Your account is fully activated.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Verification Code / Token</label>
              <input
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter or paste verification token"
                className="w-full font-mono bg-[#161c26] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2] focus:ring-1 focus:ring-[#00D6B2]"
              />
              {initialToken && (
                <p className="text-[11px] text-[#00D6B2] mt-1.5 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Token auto-filled from recent signup
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#00D6B2] to-emerald-400 text-black hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? 'Verifying...' : <>Confirm & Activate Account <ArrowRight size={16} /></>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
