import React, { useState } from 'react';
import { Zap, Check, Shield, Sparkles, BadgePercent, RefreshCcw } from 'lucide-react';
import api from '../api';

export default function CreditsPricingDashboard({ currentCredits = 10029, onTopUp = () => {}, userId = 'RoniDev' }) {
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'annual'

  const monthlyTiers = [
    {
      name: "Basic",
      price: "$10",
      annualPrice: "$100",
      credits: "300 credits",
      tokens: "3M DeepSeek Tokens",
      popular: false,
      features: ["V4 Flash Parsing", "Basic Evasion", "Canvas Sync"],
      plan: "basic"
    },
    {
      name: "Pro",
      price: "$20",
      annualPrice: "$200",
      credits: "600 credits",
      tokens: "6M DeepSeek Tokens",
      popular: true,
      features: ["V4 Pro Multi-agent", "AST Style Cloner", "Priority Execution", "Audio Transcription"],
      plan: "pro"
    },
    {
      name: "Elite",
      price: "$40",
      annualPrice: "$400",
      credits: "1,500 credits",
      tokens: "15M DeepSeek Tokens",
      popular: false,
      features: ["Unlimited Pro Inferences", "Zero Detection Guarantee", "Custom AST Harness", "24/7 Bot Webhooks"],
      plan: "elite"
    }
  ];

  // Price anchoring comparison vs competitors
  const anchorNote = "Chegg charges $15/mo and Course Hero $24/mo — Helpotron gives you AI study tools + assignment automation for less, with 2 months free on annual plans.";

  const handleSubscribe = async (plan, isAnnual) => {
    try {
      const res = await api.post('/api/checkout', {
        public_id: userId || 'RoniDev',
        plan,
        is_annual: isAnnual,
      });
      if (res?.checkout_url) {
        window.location.href = res.checkout_url;
      } else if (res?.status === 'stripe_not_configured') {
        alert('Stripe is not configured yet. Contact support to subscribe.');
      }
    } catch (e) {
      alert('Failed to start checkout: ' + e.message);
    }
  };

  return (
    <div className="space-y-8">
      {/* Current Balance Bar */}
      <div className="glass-panel rounded-2xl p-5 border border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-mono text-slate-400">Active Compute Allocation</div>
            <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400">
              {Number(currentCredits).toLocaleString()} Credits
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>All features unlocked on every tier — plans only differ by credits</span>
        </div>
      </div>

      {/* Billing Cycle Toggle */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => setBillingCycle('monthly')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-semibold transition cursor-pointer ${
            billingCycle === 'monthly' ? 'bg-cyan-500 text-black' : 'bg-white/5 text-slate-400 hover:bg-white/10'
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setBillingCycle('annual')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1.5 ${
            billingCycle === 'annual' ? 'bg-cyan-500 text-black' : 'bg-white/5 text-slate-400 hover:bg-white/10'
          }`}
        >
          Annual <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Save 17%</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {monthlyTiers.map((tier, idx) => (
          <div 
            key={idx}
            className={`glass-panel rounded-2xl p-6 flex flex-col justify-between relative transition-all duration-300 ${
              tier.popular ? 'border-cyan-500/50 shadow-lg shadow-cyan-500/10' : 'border-white/10'
            }`}
          >
            {tier.popular && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 px-3 py-0.5 rounded-full bg-cyan-500 text-black font-mono text-[10px] font-bold tracking-wider uppercase">
                Most Popular
              </div>
            )}
            <div>
              <h3 className="text-sm font-mono text-slate-300 uppercase">{tier.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-white">
                  {billingCycle === 'annual' ? tier.annualPrice : tier.price}
                </span>
                <span className="text-xs text-slate-400 font-mono">/year</span>
              </div>
              {billingCycle === 'annual' && (
                <div className="text-[10px] font-mono text-emerald-400 mt-0.5">
                  2 months free ({tier.price}/mo equivalent)
                </div>
              )}
              <div className="mt-3 p-3 rounded-lg bg-black/40 border border-white/5 text-xs font-mono">
                <div className="text-cyan-300 font-bold">{tier.credits}</div>
                <div className="text-slate-400 text-[11px]">{tier.tokens}</div>
              </div>
              <ul className="mt-4 space-y-2 text-xs text-slate-300 font-mono">
                {tier.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0"/>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button 
              onClick={() => handleSubscribe(tier.plan, billingCycle === 'annual')}
              className={`mt-6 w-full py-2.5 rounded-xl text-xs font-semibold font-mono transition-all cursor-pointer ${
                tier.popular 
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-md shadow-cyan-500/20' 
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {tier.name === 'Pro' ? 'Start Free Trial' : `Upgrade to ${tier.name}`}
            </button>
          </div>
        ))}
      </div>

      {/* Price Anchoring + Money-Back Guarantee */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-panel rounded-2xl p-5 border border-white/10 text-xs font-mono text-slate-300">
          <div className="flex items-center gap-2 mb-2 font-bold text-white">
            <BadgePercent className="w-4 h-4 text-cyan-400" />
            Why Helpotron?
          </div>
          <p>{anchorNote}</p>
          <p className="mt-2 text-[11px] text-slate-400">
            🎓 Students save 20% with a verified .edu email — ask in support.
          </p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-emerald-500/20 text-xs font-mono text-slate-300">
          <div className="flex items-center gap-2 mb-2 font-bold text-emerald-300">
            <RefreshCcw className="w-4 h-4" />
            30-Day Money-Back Guarantee
          </div>
          <p>
            Not satisfied? Email support within 30 days of your first payment for a full refund. No questions asked.
          </p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6 border border-white/10">
        <h4 className="text-xs font-mono uppercase text-slate-300 mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400"/> Instant Token Top-Up
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button 
            onClick={() => onTopUp(500)}
            className="p-4 rounded-xl bg-black/40 hover:bg-black/60 border border-white/10 hover:border-cyan-500/40 text-left transition-all cursor-pointer"
          >
            <div className="text-lg font-bold text-white">$5</div>
            <div className="text-xs font-mono text-cyan-300">+75 Credits</div>
            <div className="text-[10px] text-slate-500 font-mono mt-1">750k DeepSeek tokens</div>
          </button>
          <button 
            onClick={() => onTopUp(1000)}
            className="p-4 rounded-xl bg-black/40 hover:bg-black/60 border border-white/10 hover:border-cyan-500/40 text-left transition-all cursor-pointer"
          >
            <div className="text-lg font-bold text-white">$10</div>
            <div className="text-xs font-mono text-cyan-300">+160 Credits</div>
            <div className="text-[10px] text-slate-500 font-mono mt-1">1.6M DeepSeek tokens</div>
          </button>
          <button 
            onClick={() => onTopUp(2000)}
            className="p-4 rounded-xl bg-black/40 hover:bg-black/60 border border-white/10 hover:border-cyan-500/40 text-left transition-all cursor-pointer"
          >
            <div className="text-lg font-bold text-white">$20</div>
            <div className="text-xs font-mono text-cyan-300">+350 Credits</div>
            <div className="text-[10px] text-slate-500 font-mono mt-1">3.5M DeepSeek tokens</div>
          </button>
        </div>
      </div>
    </div>
  );
}