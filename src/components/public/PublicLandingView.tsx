import React, { useEffect, useState } from 'react';
import { PublicNavbar } from './PublicNavbar';
import { PublicHero } from './PublicHero';
import { PublicFeatures } from './PublicFeatures';
import { PublicPlatforms } from './PublicPlatforms';
import { PublicPricing } from './PublicPricing';
import { PublicFAQ } from './PublicFAQ';
import { PublicFooter } from './PublicFooter';
import { PublicLegalPage } from './PublicLegalPage';
import { SignInModal } from '../auth/SignInModal';
import { SignUpModal } from '../auth/SignUpModal';
import { ForgotPasswordModal } from '../auth/ForgotPasswordModal';
import { VerifyEmailModal } from '../auth/VerifyEmailModal';
import { PlanTier, BillingCycle } from '../../types';
// AuthContext no longer needed here — demo entry uses the real sandbox mode.

interface PublicLandingViewProps {
  onEnterSandbox: () => void;
}

export const PublicLandingView: React.FC<PublicLandingViewProps> = ({ onEnterSandbox }) => {
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [isSignUpOpen, setIsSignUpOpen] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [isVerifyEmailOpen, setIsVerifyEmailOpen] = useState(false);
  const [verificationToken, setVerificationToken] = useState<string>('');
  // Legal pages are real routes via URL hash: #terms / #privacy
  const parseLegalHash = (): 'terms' | 'privacy' | null => {
    if (typeof window === 'undefined') return null;
    if (window.location.hash === '#terms') return 'terms';
    if (window.location.hash === '#privacy') return 'privacy';
    return null;
  };
  const [legalPage, setLegalPage] = useState<'terms' | 'privacy' | null>(parseLegalHash);

  useEffect(() => {
    const onHashChange = () => {
      setLegalPage(parseLegalHash());
      if (parseLegalHash()) window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const closeLegalPage = () => {
    // Strip the hash without a navigation/history entry
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setLegalPage(null);
    window.scrollTo(0, 0);
  };

  // Demo entry now opens the real interactive sandbox (no fake login session).
  const handleDemoSignIn = () => {
    onEnterSandbox();
  };

  const handleSelectPlan = (plan: PlanTier, cycle: BillingCycle) => {
    setIsSignUpOpen(true);
  };

  const handleSignUpSuccess = (token?: string) => {
    if (token) {
      setVerificationToken(token);
      setIsVerifyEmailOpen(true);
    }
  };

  if (legalPage) {
    return <PublicLegalPage type={legalPage} onBack={closeLegalPage} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0d12] text-slate-100 flex flex-col font-sans selection:bg-[#00D6B2] selection:text-black">
      {/* Public Header */}
      <PublicNavbar
        onOpenSignIn={() => setIsSignInOpen(true)}
        onOpenSignUp={() => setIsSignUpOpen(true)}
        onTryDemo={handleDemoSignIn}
      />

      {/* Main Marketing Flow */}
      <main className="flex-1">
        <PublicHero
          onOpenSignUp={() => setIsSignUpOpen(true)}
          onTryDemo={handleDemoSignIn}
        />
        <PublicFeatures />
        <PublicPlatforms />
        <PublicPricing onSelectPlan={handleSelectPlan} />
        <PublicFAQ />
      </main>

      {/* Public Footer */}
      <PublicFooter
        onOpenSignIn={() => setIsSignInOpen(true)}
        onOpenSignUp={() => setIsSignUpOpen(true)}
      />

      {/* Auth Modals */}
      <SignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        onOpenSignUp={() => {
          setIsSignInOpen(false);
          setIsSignUpOpen(true);
        }}
        onOpenForgotPassword={() => {
          setIsSignInOpen(false);
          setIsForgotPasswordOpen(true);
        }}
      />

      <SignUpModal
        isOpen={isSignUpOpen}
        onClose={() => setIsSignUpOpen(false)}
        onOpenSignIn={() => {
          setIsSignUpOpen(false);
          setIsSignInOpen(true);
        }}
        onSuccess={handleSignUpSuccess}
      />

      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
        onOpenSignIn={() => {
          setIsForgotPasswordOpen(false);
          setIsSignInOpen(true);
        }}
      />

      <VerifyEmailModal
        isOpen={isVerifyEmailOpen}
        onClose={() => setIsVerifyEmailOpen(false)}
        initialToken={verificationToken}
      />

    </div>
  );
};
