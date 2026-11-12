import React, { useState } from 'react';
import { Check, Sparkles, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { PlanTier, BillingCycle } from '../../types';

interface PublicPricingProps {
  onSelectPlan: (plan: PlanTier, cycle: BillingCycle) => void;
  currentPlan?: PlanTier;
}

export const PublicPricing: React.FC<PublicPricingProps> = ({ onSelectPlan, currentPlan }) => {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  const plans = [
    {
      id: 'free' as PlanTier,
      name: 'Free Forever',
      badge: 'Getting Started',
      monthlyPrice: 0,
      yearlyPrice: 0,
      desc: 'Essential video publishing for solo creators exploring multi-platform distribution.',
      features: [
        'Up to 2 Connected Social Accounts',
        '1 Workspace & 1 Brand profile',
        'Manual & Assisted scheduling',
        'Basic 3-day retention analytics',
        'Standard publishing queue',
        'Community support',
      ],
      cta: 'Start Free',
      popular: false,
    },
    {
      id: 'starter' as PlanTier,
      name: 'Starter Creator',
      badge: 'Individual Creators',
      monthlyPrice: 29,
      yearlyPrice: 23,
      desc: 'Autonomous publishing optimization and retention curves for active content creators.',
      features: [
        'Up to 5 Connected Social Accounts',
        '2 Brands & Workspaces',
        'Second-by-second Drop-off curves',
        'Autopilot Time Discovery Engine',
        'AI Hook & Title Optimizer',
        '1-Click Emergency Guardrails',
        'Standard Email Support',
      ],
      cta: 'Start 14-Day Free Trial',
      popular: false,
    },
    {
      id: 'professional' as PlanTier,
      name: 'Professional Pro',
      badge: 'Most Popular',
      monthlyPrice: 79,
      yearlyPrice: 63,
      desc: 'Full-power autonomous social media engine with deep retention diagnostics and team seats.',
      features: [
        'Up to 15 Connected Social Accounts',
        'Unlimited Brands & Workspaces',
        'Full Autopilot Engine with Guardrails',
        'Automated A/B Thumbnail & Hook Testing',
        'Custom Blackout Hours & Spacing Rules',
        '5 Team Members with RBAC',
        'Priority 24/7 API Sync & Support',
      ],
      cta: 'Upgrade to Professional',
      popular: true,
    },
    {
      id: 'enterprise' as PlanTier,
      name: 'Enterprise Command',
      badge: 'Agencies & Studios',
      monthlyPrice: 199,
      yearlyPrice: 159,
      desc: 'High-throughput publishing infrastructure for agencies, media companies, and brands.',
      features: [
        'Unlimited Connected Accounts & Brands',
        'Dedicated Background Publishing Workers',
        'Custom Algorithmic Models & Weighting',
        'Unlimited Team Seats & Audit Logs',
        'Audit Log CSV & Webhook Exports',
        'Dedicated SLA & High-Priority Queue',
        'Dedicated Technical Account Manager',
      ],
      cta: 'Scale with Enterprise',
      popular: false,
    },
  ];

  return (
    <section id="pricing" className="py-20 sm:py-28 bg-[#0a0d12] border-b border-white/5 relative">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00D6B2]/10 border border-[#00D6B2]/30 text-[#00D6B2] text-xs font-semibold mb-4">
            <Zap size={14} /> Transparent SaaS Pricing
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Predictable Plans That Scale With Your Views
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-400">
            No surprise surcharges. No hidden per-post fees. Switch or cancel anytime.
          </p>

          {/* Billing Toggle */}
          <div className="mt-8 inline-flex items-center p-1 rounded-2xl bg-[#141a24] border border-white/10">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`py-2 px-5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                billingCycle === 'monthly' ? 'bg-[#00D6B2] text-black shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`py-2 px-5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
                billingCycle === 'yearly' ? 'bg-[#00D6B2] text-black shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Yearly Billing
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 sm:gap-8">
          {plans.map((p) => {
            const isCurrent = currentPlan === p.id;
            const price = billingCycle === 'yearly' ? p.yearlyPrice : p.monthlyPrice;

            return (
              <div
                key={p.id}
                className={`relative rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 ${
                  p.popular
                    ? 'bg-gradient-to-b from-[#141d29] to-[#0f141c] border-2 border-[#00D6B2] shadow-2xl shadow-[#00D6B2]/10 scale-[1.02]'
                    : 'bg-[#0f141c] border border-white/10 hover:border-white/20'
                }`}
              >
                {p.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-[#00D6B2] text-black text-xs font-bold uppercase tracking-wider shadow-lg">
                    {p.badge}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold text-white">{p.name}</h3>
                    {!p.popular && (
                      <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                        {p.badge}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 mb-6 leading-relaxed">{p.desc}</p>

                  <div className="mb-6 pb-6 border-b border-white/10">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl sm:text-5xl font-black text-white">${price}</span>
                      <span className="text-xs text-slate-400 font-medium">/ month</span>
                    </div>
                    {billingCycle === 'yearly' && price > 0 && (
                      <div className="text-[11px] text-[#00D6B2] mt-1 font-medium">
                        Billed annually (${price * 12}/yr)
                      </div>
                    )}
                  </div>

                  {/* Feature list */}
                  <div className="space-y-3 mb-8">
                    <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Included with plan:
                    </div>
                    {p.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-2.5 text-xs text-slate-300">
                        <Check size={16} className="text-[#00D6B2] shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectPlan(p.id, billingCycle)}
                  className={`w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                    isCurrent
                      ? 'bg-white/10 text-slate-300 cursor-default'
                      : p.popular
                      ? 'bg-gradient-to-r from-[#00D6B2] to-emerald-400 text-black hover:opacity-95 shadow-lg shadow-[#00D6B2]/20'
                      : 'bg-[#18212e] hover:bg-[#202b3c] text-white border border-white/10'
                  }`}
                >
                  {isCurrent ? 'Current Active Plan' : p.cta} {!isCurrent && <ArrowRight size={14} />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
