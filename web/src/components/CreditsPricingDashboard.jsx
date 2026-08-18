import React, { useState } from 'react';
import {
  Zap,
  Check,
  Shield,
  Sparkles,
  Clock,
  Layers,
  BookOpen,
  GraduationCap,
  FileAudio,
  ShieldCheck,
  Tag,
  Gift,
  ArrowRight,
} from 'lucide-react';
import api from '../api';

export default function CreditsPricingDashboard({
  currentCredits = 10029,
  onTopUp = () => {},
  userId = 'RoniDev',
}) {
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoMsg, setPromoMsg] = useState('');
  const [userDiscountCredits, setUserDiscountCredits] = useState(21); // $21 in discount credits
  const [useDiscountCredits, setUseDiscountCredits] = useState(true);

  // Pricing Plans (with 50% Max Discount Cap enforcement):
  // Basic: $10/mo -> Max 50% ($5) -> uses max 5 credits -> final $5
  // Pro: $20/mo -> Max 50% ($10) -> uses max 10 credits -> final $10
  // Elite: $40/mo -> Max 50% ($20) -> uses max 20 credits -> final $20
  const tiers = [
    {
      name: 'Basic',
      basePrice: 10,
      annualBasePrice: 100,
      maxDiscount: 5, // 50% of $10
      credits: '30 Credits / mo',
      capacity: 'Up to 15 Assignment Workflows',
      popular: false,
      features: [
        'Assignment Rubric Analysis',
        'Active Recall Flashcard Generator',
        'Interactive Practice Quizzes',
        'Canvas & LMS Course Sync',
        'Standard Sub-Agent Execution',
      ],
      plan: 'basic',
    },
    {
      name: 'Pro',
      basePrice: 20,
      annualBasePrice: 200,
      maxDiscount: 10, // 50% of $20
      credits: '100 Credits / mo',
      capacity: 'Up to 50 Assignment Workflows + Audio',
      popular: true,
      features: [
        'Everything in Basic',
        'Lecture Audio Transcriber & Summarizer',
        'AI Plagiarism & Humanized Style Passes',
        'Virtual Sub-Agent Sandboxes',
        'Priority Autonomous Scheduling',
      ],
      plan: 'pro',
    },
    {
      name: 'Elite',
      basePrice: 40,
      annualBasePrice: 400,
      maxDiscount: 20, // 50% of $40
      credits: '280 Credits / mo',
      capacity: 'Up to 140 Heavy Workflows & Deep Tasks',
      popular: false,
      features: [
        'Everything in Pro',
        'Full Multi-Agent Overlord Orchestration',
        'Unlimited Sandbox Runtime Instances',
        'Dedicated Compute Node Allocation',
        '24/7 Webhooks & Instant Auto-Approvals',
      ],
      plan: 'elite',
    },
  ];

  const handleApplyPromo = (e) => {
    e.preventDefault();
    if (!promoCode.trim()) return;
    setPromoApplied(true);
    setPromoMsg(`✅ Referral code "${promoCode.trim()}" activated! Rewards will be credited upon checkout.`);
  };

  const handleSubscribe = async (tier) => {
    const isAnnual = billingCycle === 'annual';
    const base = isAnnual ? tier.annualBasePrice : tier.basePrice;
    const maxCred = isAnnual ? tier.maxDiscount * 10 : tier.maxDiscount;
    const credApplied = useDiscountCredits ? Math.min(userDiscountCredits, maxCred) : 0;
    const finalAmount = Math.max(base - credApplied, base * 0.5);

    try {
      const res = await api.post('/api/checkout', {
        public_id: userId || 'RoniDev',
        plan: tier.plan,
        is_annual: isAnnual,
        promo_code: promoCode,
        discount_credits_used: credApplied,
        final_price_usd: finalAmount,
      });

      if (res?.checkout_url) {
        window.location.href = res.checkout_url;
      } else {
        // Local simulation top up
        setUserDiscountCredits((prev) => Math.max(0, prev - credApplied));
        onTopUp(tier.plan === 'elite' ? 4000 : tier.plan === 'pro' ? 2000 : 1000);
      }
    } catch (e) {
      setUserDiscountCredits((prev) => Math.max(0, prev - credApplied));
      onTopUp(tier.plan === 'elite' ? 4000 : tier.plan === 'pro' ? 2000 : 1000);
    }
  };

  return (
    <div className="space-y-8 text-slate-100 animate-fadeIn">
      {/* Balance & Discount Credits Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Regular Compute Balance */}
        <div className="clean-card rounded-2xl p-6 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Available Task Balance</div>
              <div className="text-2xl font-black text-blue-400 font-mono">
                {Number(currentCredits).toLocaleString()} Credits
              </div>
            </div>
          </div>
          <div className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
            Active
          </div>
        </div>

        {/* Available Referral Discount Credits */}
        <div className="clean-card rounded-2xl p-6 flex items-center justify-between border border-emerald-500/20 bg-emerald-950/10">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-emerald-300 font-medium">Referral Discount Credits</div>
              <div className="text-2xl font-black text-emerald-400 font-mono">
                ${userDiscountCredits}.00 ({userDiscountCredits} Credits)
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={useDiscountCredits}
              onChange={(e) => setUseDiscountCredits(e.target.checked)}
              className="rounded accent-emerald-500 cursor-pointer"
            />
            <span className="text-[11px] text-emerald-300">Auto-Apply (Max 50%)</span>
          </label>
        </div>
      </div>

      {/* Referral / Promo Code Input Bar */}
      <div className="clean-card rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Gift className="w-4 h-4 text-blue-400 shrink-0" />
          <div>
            <div className="text-xs font-semibold text-white">Have a Referral or Promo Code?</div>
            <div className="text-[11px] text-slate-400">Apply a classmate's code to unlock mutual bonus credits at checkout.</div>
          </div>
        </div>
        <form onSubmit={handleApplyPromo} className="flex gap-2 w-full sm:w-auto">
          <input
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            placeholder="Enter promo code..."
            className="bg-slate-950 border border-white/10 rounded-xl px-3.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 w-full sm:w-48"
          />
          <button
            type="submit"
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer shrink-0"
          >
            Apply Code
          </button>
        </form>
      </div>

      {promoMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300">
          {promoMsg}
        </div>
      )}

      {/* Billing Cycle Toggle */}
      <div className="flex justify-center">
        <div className="bg-slate-950 p-1 rounded-xl border border-white/10 flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`px-4 py-1.5 rounded-lg transition font-medium cursor-pointer ${
              billingCycle === 'monthly'
                ? 'bg-blue-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('annual')}
            className={`px-4 py-1.5 rounded-lg transition font-medium flex items-center gap-1.5 cursor-pointer ${
              billingCycle === 'annual'
                ? 'bg-blue-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Annual</span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-mono font-bold">
              SAVE 17%
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier) => {
          const isAnnual = billingCycle === 'annual';
          const base = isAnnual ? tier.annualBasePrice : tier.basePrice;
          const maxCred = isAnnual ? tier.maxDiscount * 10 : tier.maxDiscount;
          const appliedCred = useDiscountCredits ? Math.min(userDiscountCredits, maxCred) : 0;
          const finalPrice = base - appliedCred;

          return (
            <div
              key={tier.name}
              className={`clean-card rounded-2xl p-6 flex flex-col justify-between relative transition-all duration-200 ${
                tier.popular
                  ? 'border-blue-500/40 ring-1 ring-blue-500/30 bg-gradient-to-b from-blue-950/10 to-slate-900/40'
                  : ''
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] uppercase font-bold tracking-wider px-3 py-0.5 rounded-full shadow-md">
                  Most Popular
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-bold text-white">{tier.name}</h3>
                  <span className="text-xs text-blue-400 font-mono font-semibold">{tier.credits}</span>
                </div>

                {/* Price Display with Discount Breakdown */}
                <div className="my-4 p-3.5 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-white font-mono">${finalPrice}</span>
                    <span className="text-xs text-slate-400">/{isAnnual ? 'yr' : 'mo'}</span>
                    {appliedCred > 0 && (
                      <span className="text-xs text-slate-500 line-through font-mono ml-auto">
                        ${base}
                      </span>
                    )}
                  </div>

                  {appliedCred > 0 ? (
                    <div className="text-[11px] text-emerald-400 font-medium flex items-center justify-between pt-1 border-t border-white/5">
                      <span>Applied {appliedCred} Discount Credits:</span>
                      <span>-${appliedCred}.00 (Max 50% Cap)</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500">
                      Standard pricing • Up to ${tier.maxDiscount} discount with credits
                    </div>
                  )}
                </div>

                <p className="text-xs text-slate-400 mb-4">{tier.capacity}</p>

                {/* Features List */}
                <ul className="space-y-2 text-xs text-slate-300">
                  {tier.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => handleSubscribe(tier)}
                  className={`w-full py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md ${
                    tier.popular
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/25'
                      : 'bg-white/10 hover:bg-white/15 text-white'
                  }`}
                >
                  <span>Select {tier.name} Plan</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}