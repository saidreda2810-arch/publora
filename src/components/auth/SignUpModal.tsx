import React, { useState } from 'react';
import {
  X,
  User as UserIcon,
  Mail,
  Lock,
  ArrowRight,
  ShieldCheck,
  Check,
  AlertCircle,
  Fingerprint,
  Building2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { FaCheck } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';

interface SignUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSignIn: () => void;
  onSuccess: (verificationToken?: string) => void;
}

export const SignUpModal: React.FC<SignUpModalProps> = ({
  isOpen,
  onClose,
  onOpenSignIn,
  onSuccess,
}) => {
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  // Simple password strength calculation
  const hasMinLen = password.length >= 8;
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const strengthScore = [hasMinLen, hasNumber, hasSpecial].filter(Boolean).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreeTerms) {
      setError('You must agree to the Terms of Service and Privacy Policy.');
      return;
    }
    if (!hasMinLen) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setError(null);
    setIsLoading(true);

    const res = await register(email, password, fullName);
    setIsLoading(false);

    if (res.success) {
      onSuccess(res.verificationToken);
      onClose();
    } else {
      setError(res.error || 'Registration failed. Please check your information.');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto bg-[#0f141c] border border-[var(--border-color)] rounded-3xl shadow-2xl p-5 sm:p-7 text-[var(--text-primary)]">
        {/* Glow */}
        <div className="absolute -top-24 -left-24 w-52 h-52 bg-[#00D6B2]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-xl hover:bg-[var(--bg-surface-hover)] transition-colors"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="mb-5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#00D6B2]/10 border border-[#00D6B2]/30 text-[#00D6B2] text-[11px] font-semibold uppercase tracking-wider mb-2">
            <ShieldCheck size={13} /> Free 14-Day Pro Trial
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">Create SaaS Account</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Choose any sign-in option to provision your private workspace and AI publishing queue.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Full Name</label>
            <div className="relative">
              <UserIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Sarah Connor"
                className="w-full bg-[#161c26] border border-[var(--border-color)] rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Work or Personal Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sarah@creatorstudio.io"
                className="w-full bg-[#161c26] border border-[var(--border-color)] rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Create Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full bg-[#161c26] border border-[var(--border-color)] rounded-xl pl-10 pr-10 py-2 text-xs sm:text-sm text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Password strength indicators */}
            {password.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="grid grid-cols-3 gap-1.5 h-1">
                  <div className={`h-full rounded-full transition-all ${strengthScore >= 1 ? 'bg-amber-400' : 'bg-[var(--bg-surface-hover)]'}`} />
                  <div className={`h-full rounded-full transition-all ${strengthScore >= 2 ? 'bg-emerald-400' : 'bg-[var(--bg-surface-hover)]'}`} />
                  <div className={`h-full rounded-full transition-all ${strengthScore >= 3 ? 'bg-[#00D6B2]' : 'bg-[var(--bg-surface-hover)]'}`} />
                </div>
                <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)] pt-0.5">
                  <span className={`inline-flex items-center gap-1 ${hasMinLen ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}><FaCheck size={9} /> 8+ chars</span>
                  <span className={`inline-flex items-center gap-1 ${hasNumber ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}><FaCheck size={9} /> Number</span>
                  <span className={`inline-flex items-center gap-1 ${hasSpecial ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}><FaCheck size={9} /> Symbol</span>
                </div>
              </div>
            )}
          </div>

          {/* Agreement Checkbox */}
          <div className="pt-0.5">
            <label className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-0.5 rounded border-[var(--border-color)] text-[#00D6B2] focus:ring-0 bg-[#161c26]"
              />
              <span>
                I agree to the Terms of Service and Privacy Policy. All workspace data is strictly tenant-isolated.
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-[#00D6B2] to-emerald-400 text-black hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#00D6B2]/10 disabled:opacity-50"
          >
            {isLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                Create Account & Provision Workspace <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-[var(--text-secondary)]">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSignIn();
            }}
            className="text-[#00D6B2] font-semibold hover:underline"
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
};
