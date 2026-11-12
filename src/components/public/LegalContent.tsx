import React from 'react';

// Shared legal article bodies — used by both the full legal pages
// (#terms / #privacy) and the legacy modal.

export const TermsArticle: React.FC = () => (
  <>
    <h2 className="text-white font-bold text-lg sm:text-xl">1. Acceptance of Terms</h2>
    <p>
      By accessing or using Publora, you agree to be bound by these Terms of Service. If you are entering into these terms on behalf of an entity, you represent and warrant that you possess the requisite authority to bind that entity.
    </p>

    <h2 className="text-white font-bold text-lg sm:text-xl">2. Multi-Tenant Account & Workspace Security</h2>
    <p>
      Users are responsible for safeguarding access credentials. Each workspace operates in strict tenant isolation. You agree not to attempt to access, probe, or breach data belonging to other workspaces or tenants.
    </p>

    <h2 className="text-white font-bold text-lg sm:text-xl">3. Social Platform API Compliance</h2>
    <p>
      Publora uses official APIs provided by Google/YouTube, Meta (Facebook and Instagram), and TikTok. You agree to adhere strictly to the respective platform community guidelines, terms of service, and developer policies when publishing content via our platform.
    </p>

    <h2 className="text-white font-bold text-lg sm:text-xl">4. Autonomous Scheduling & Guardrails</h2>
    <p>
      The Autopilot publishing system provides autonomous scheduling suggestions and execution based on historical metrics. Publora provides emergency pause and safeguard controls, and users maintain final editorial responsibility for published media.
    </p>

    <h2 className="text-white font-bold text-lg sm:text-xl">5. Termination & Data Portability</h2>
    <p>
      You may cancel your subscription or delete your account at any time. Upon account deletion, your private workspaces, credentials, and published logs are permanently wiped.
    </p>
  </>
);

export const PrivacyArticle: React.FC = () => (
  <>
    <h2 className="text-white font-bold text-lg sm:text-xl">1. Information We Collect</h2>
    <p>
      We collect your name, email address, password hash, workspace configuration, and social account identifiers granted during OAuth 2.0 authorization. We do not store plaintext account passwords.
    </p>

    <h2 className="text-white font-bold text-lg sm:text-xl">2. Tenant Isolation & Data Encryption</h2>
    <p>
      All access tokens, refresh tokens, and channel keys are encrypted at rest using industry-standard cryptography (AES-256-GCM / secure scrypt hashes). Each tenant&apos;s data is strictly partitioned and is never pooled or shared with other tenants.
    </p>

    <h2 className="text-white font-bold text-lg sm:text-xl">3. Use of Official Social Media APIs</h2>
    <p>
      When you connect your YouTube, Facebook, Instagram, or TikTok accounts, we request only the scopes necessary for video publishing, metadata management, and audience retention analytics. We never sell your personal data or viewer analytics to third-party data brokers.
    </p>

    <h2 className="text-white font-bold text-lg sm:text-xl">4. Your Rights (GDPR & CCPA)</h2>
    <p>
      You have the right to inspect, export, and permanently erase your account data at any time via your Workspace Settings.
    </p>
  </>
);
