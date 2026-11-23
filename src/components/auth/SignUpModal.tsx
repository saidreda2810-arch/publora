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

        {/* Social sign-in — full-page OAuth redirect flow */}
        <div className="mt-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-[var(--border-color)]" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">Or continue with</span>
            <div className="h-px flex-1 bg-[var(--border-color)]" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { p: 'google', label: 'Google', icon: (
                <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
              )},
              { p: 'facebook', label: 'Facebook', icon: (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#1877F2" aria-hidden="true"><path d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.95.93-1.95 1.87V12h3.32l-.53 3.47h-2.79v8.38A12 12 0 0 0 24 12z"/></svg>
              )},
              { p: 'tiktok', label: 'TikTok', icon: (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>
              )},
            ] as const).map(({ p, label, icon }) => (
              <a
                key={p}
                href={`/api/auth/oauth/${p}/start`}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[#161c26] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-primary)] hover:border-[#00D6B2]/50 hover:bg-[var(--bg-surface-hover)] transition-all"
              >
                {icon}
                <span>{label}</span>
              </a>
            ))}
          </div>
        </div>

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
