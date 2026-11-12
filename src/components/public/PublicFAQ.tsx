import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

export const PublicFAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: 'Will connecting my accounts put my social channels at risk of bans?',
      a: 'Absolutely not. Publora exclusively interacts with social networks through their official partner APIs (Google OAuth for YouTube, Meta Graph API for Instagram & Facebook, and TikTok Content Posting API). We never scrape, simulate human clicks, or violate platform terms of service.',
    },
    {
      q: 'How does the second-by-second retention curve diagnostic work?',
      a: 'We ingest raw watch-time telemetry directly from official platform analytics (or calculate rigorous statistical curves based on completion milestones). Our Gemini-powered AI engine identifies precisely where viewer attention drops, isolating hook fatigue (0-3s), narrative plateauing, or abrupt endings.',
    },
    {
      q: 'Can I connect multiple accounts from the same social platform?',
      a: 'Yes! You can connect multiple YouTube channels, Facebook Pages, Instagram business accounts, or TikTok handles. You can manage them together in one workspace or isolate them across dedicated client workspaces.',
    },
    {
      q: 'What is the Emergency Pause safeguard on the Autopilot engine?',
      a: 'Autopilot operates with human-in-the-loop safety principles. If you ever want to halt scheduled posts immediately (e.g. during a breaking news event or brand pivot), one click immediately freezes the entire queue across all linked channels.',
    },
    {
      q: 'Is my data isolated from other SaaS users?',
      a: '100% yes. Every workspace is cryptographically and logically isolated at the tenant level. Tokens are encrypted server-side, and no other workspace member or user can view your drafts, accounts, or analytics.',
    },
    {
      q: 'Can I invite my team or clients to collaborate?',
      a: 'Yes. Our Professional and Enterprise plans allow inviting team members with Role-Based Access Control (Owner, Admin, or Member). Members can compose drafts and view analytics without possessing raw API credentials.',
    },
  ];

  return (
    <section id="faq" className="py-20 sm:py-28 bg-[#080b0f] border-b border-white/5 relative">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold mb-4">
            <HelpCircle size={14} /> Frequently Asked Questions
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Everything You Need to Know
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-400">
            Clear, transparent answers about security, official APIs, and SaaS features.
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={faq.q}
                className="rounded-2xl bg-[#0f141c] border border-white/10 overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 font-semibold text-white text-base hover:text-[#00D6B2] transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    size={20}
                    className={`shrink-0 text-slate-400 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-[#00D6B2]' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 sm:px-6 pb-6 text-sm text-slate-300 leading-relaxed border-t border-white/5 pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
