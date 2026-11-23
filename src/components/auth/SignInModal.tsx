import React, { useState } from 'react';
import {
  X,
  Lock,
  Mail,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Send,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSignUp: () => void;
  onOpenForgotPassword: () => void;
}

type SignInMethod = 'password' | 'magic';

export const SignInModal: React.FC<SignInModalProps> = ({
  isOpen,
  onClose,
  onOpenSignUp,
  onOpenForgotPassword,
}) => {
  const { user, login, sendMagicLink, verifyMagicLink } = useAuth();

  const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const [activeMethod, setActiveMethod] = useState<SignInMethod>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Magic link states
  const [magicCode, setMagicCode] = useState('');
  const [magicSent, setMagicSent] = useState(false);
  const [magicOtpHint, setMagicOtpHint] = useState<string | null>(null);

  // Status
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // 'success' phase: auth confirmed — show welcome transition before closing
  const [authPhase, setAuthPhase] = useState<'form' | 'success'>('form');
  const [successName, setSuccessName] = useState('');

  if (!isOpen) return null;

  // Runs only after the backend confirms authentication — never before.
  const handleAuthSuccess = () => {
    setSuccessName(user?.fullName?.split(' ')[0] || 'there');
    setAuthPhase('success');
    const delay = prefersReducedMotion() ? 250 : 950;
    setTimeout(onClose, delay);
  };

  const guardLoading = () => {
    if (isLoading) return true;
    setIsLoading(true);
    return false;
  };

  // 1. Password submit
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardLoading()) return;
    setError(null);

    const res = await login(email, password);
    setIsLoading(false);
    if (res.success) {
      handleAuthSuccess();
    } else {
      setError(res.error || 'Failed to sign in. Please verify your credentials.');
    }
  };

  // 3. Magic link send
  const handleSendMagic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setError(null);
    if (guardLoading()) return;
    const res = await sendMagicLink(email);
    setIsLoading(false);
    if (res.success) {
      setMagicSent(true);
      if (res.testOtpHint) {
        setMagicOtpHint(res.testOtpHint);
        setMagicCode(res.testOtpHint);
      }
      setSuccessMsg(`Magic code generated for ${email}.`);
    } else {
      setError(res.error || 'Failed to send magic link code.');
    }
  };

  // 4. Magic link verify
  const handleVerifyMagic = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (guardLoading()) return;
    const res = await verifyMagicLink(email, magicCode);
    setIsLoading(false);
    if (res.success) {
      handleAuthSuccess();
    } else {
      setError(res.error || 'Invalid or expired magic code.');
    }
  };

  return (
    <>
    {/* Success transition overlay — shown only after backend confirms auth */}
    {authPhase === 'success' && (
      <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[var(--bg-main)]/90 backdrop-blur-sm auth-success-overlay">
        <div className="flex flex-col items-center gap-4 text-center px-6">
          <div className="auth-success-check w-16 h-16 rounded-2xl bg-[#00D6B2]/15 border border-[#00D6B2]/40 flex items-center justify-center">
            <CheckCircle2 size={34} className="text-[#00D6B2]" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
              Welcome back{successName !== 'there' ? `, ${successName}` : ''}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1.5 font-mono">Opening your workspace…</p>
          </div>
        </div>
      </div>
    )}

    <div className={`fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 ${authPhase === 'success' ? 'auth-modal-exit' : ''}`}>
      <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto bg-[#0f141c] border border-[var(--border-color)] rounded-3xl shadow-2xl p-5 sm:p-7 text-[var(--text-primary)]">
        {/* Ambient lighting */}
        <div className="absolute -top-24 -right-24 w-52 h-52 bg-[#00D6B2]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-52 h-52 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-xl hover:bg-[var(--bg-surface-hover)] transition-colors"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="mb-5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#00D6B2]/10 border border-[#00D6B2]/30 text-[#00D6B2] text-[11px] font-semibold uppercase tracking-wider mb-2">
            <ShieldCheck size={13} /> Multi-Tenant Authentication
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">Sign In to Workspace</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Choose your preferred authentication option to access your private publishing queue.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-[#00D6B2]/10 border border-[#00D6B2]/30 flex items-start gap-2.5 text-xs text-[#00D6B2]">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-[#00D6B2]" />
            <div>
              <span>{successMsg}</span>
              {magicOtpHint && (
                <div className="mt-1 font-mono text-[var(--text-primary)] text-[11px]">
                  Sign-In OTP Code: <span className="bg-[var(--bg-input)] px-1.5 py-0.5 rounded text-[#00D6B2] font-bold">{magicOtpHint}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Method Switcher Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#141a24] border border-[var(--border-color)] mb-4 text-xs">
          <button
            type="button"
            onClick={() => {
              setActiveMethod('password');
              setError(null);
            }}
            className={`py-1.5 px-1 rounded-lg font-medium text-center transition-all ${
              activeMethod === 'password' ? 'bg-[#00D6B2] text-black font-bold shadow' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMethod('magic');
              setError(null);
            }}
            className={`py-1.5 px-1 rounded-lg font-medium text-center transition-all ${
              activeMethod === 'magic' ? 'bg-[#00D6B2] text-black font-bold shadow' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Magic Code
          </button>
        </div>

        {/* METHOD 1: EMAIL & PASSWORD */}
        {activeMethod === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Work or Personal Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-[#161c26] border border-[var(--border-color)] rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2]"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-[var(--text-secondary)]">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenForgotPassword();
                  }}
                  className="text-xs text-[#00D6B2] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
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
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-[var(--border-color)] text-[#00D6B2] bg-[#161c26] focus:ring-0"
                />
                <span>Remember this device</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-1 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-[#00D6B2] to-emerald-400 text-black hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#00D6B2]/10 disabled:opacity-50"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Signing in...
                </span>
              ) : (
                <>Sign In with Password <ArrowRight size={15} /></>
              )}
            </button>
          </form>
        )}

        {/* METHOD 2: PASSWORDLESS MAGIC LINK / OTP */}
        {activeMethod === 'magic' && (
          <div className="space-y-3.5">
            {!magicSent ? (
              <form onSubmit={handleSendMagic} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Email Address</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@domain.com"
                      className="w-full bg-[#161c26] border border-[var(--border-color)] rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-[#00D6B2]"
                    />
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1.5">
                    We will send a 6-digit one-time sign-in code to this address. No password needed.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-[#00D6B2] to-emerald-400 text-black hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? 'Sending...' : <>Send Magic Sign-In Code <Send size={15} /></>}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyMagic} className="space-y-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-[var(--text-secondary)]">Enter 6-Digit Code</label>
                    <button
                      type="button"
                      onClick={() => setMagicSent(false)}
                      className="text-xs text-[#00D6B2] hover:underline"
                    >
                      Change email
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={magicCode}
                    onChange={(e) => setMagicCode(e.target.value)}
                    placeholder="123456"
                    className="w-full font-mono text-center tracking-widest text-lg bg-[#161c26] border border-[var(--border-color)] rounded-xl px-4 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[#00D6B2]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-[#00D6B2] to-emerald-400 text-black hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Verifying...</span>
                  ) : (
                    <>Confirm & Sign In <ArrowRight size={15} /></>
                  )}
                </button>
              </form>
            )}
          </div>
        )}

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

        {/* Footer link to sign up */}
        <div className="mt-4 text-center text-xs text-[var(--text-secondary)]">
          New to SRA Publisher?{' '}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSignUp();
            }}
            className="text-[#00D6B2] font-semibold hover:underline"
          >
            Create free account
          </button>
        </div>
      </div>
    </div>
    </>
  );
};
