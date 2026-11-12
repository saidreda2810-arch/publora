import React, { useState } from 'react';
import { X, Mail, KeyRound, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSignIn: () => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  onOpenSignIn,
}) => {
  const { requestPasswordReset, resetPassword } = useAuth();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [testTokenHint, setTestTokenHint] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const res = await requestPasswordReset(email);
    setIsLoading(false);

    if (res.success) {
      if (res.testTokenHint) {
        setTestTokenHint(res.testTokenHint);
        setToken(res.testTokenHint);
      }
      setMessage('Reset instructions and verification code generated.');
      setStep('reset');
    } else {
      setError(res.error || 'Failed to request reset code.');
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setError(null);
    setIsLoading(true);

    const res = await resetPassword(token, newPassword);
    setIsLoading(false);

    if (res.success) {
      alert('Password reset successful! You can now log in with your new password.');
      onClose();
      onOpenSignIn();
    } else {
      setError(res.error || 'Invalid or expired reset code.');
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
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-3">
            <KeyRound size={14} /> Account Recovery
          </div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Reset Password</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {step === 'request'
              ? 'Enter your registered email to receive a recovery code.'
              : 'Enter your verification code and select a new secure password.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 rounded-xl bg-[#00D6B2]/10 border border-[#00D6B2]/30 flex items-start gap-2.5 text-xs text-[#00D6B2]">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-[#00D6B2]" />
            <div>
              <p>{message}</p>
              {testTokenHint && (
                <p className="mt-1 font-mono font-semibold text-[var(--text-primary)]">
                  Recovery Code: <span className="bg-[var(--bg-input)] px-1.5 py-0.5 rounded text-[#00D6B2]">{testTokenHint}</span>
                </p>
              )}
            </div>
          </div>
        )}

        {step === 'request' ? (
          <form onSubmit={handleRequestSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Registered Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full bg-[#161c26] border border-[var(--border-color)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2] focus:ring-1 focus:ring-[#00D6B2]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#00D6B2] to-emerald-400 text-black hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? 'Generating code...' : <>Send Recovery Code <ArrowRight size={16} /></>}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Verification Code</label>
              <input
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="rst_123456"
                className="w-full font-mono bg-[#161c26] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2] focus:ring-1 focus:ring-[#00D6B2]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">New Password (8+ characters)</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#161c26] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2] focus:ring-1 focus:ring-[#00D6B2]"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#00D6B2] to-emerald-400 text-black hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? 'Updating...' : <>Set New Password <ArrowRight size={16} /></>}
            </button>
          </form>
        )}

        <div className="mt-5 text-center text-xs text-[var(--text-secondary)]">
          Remember your credentials?{' '}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSignIn();
            }}
            className="text-[#00D6B2] font-semibold hover:underline"
          >
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
};
