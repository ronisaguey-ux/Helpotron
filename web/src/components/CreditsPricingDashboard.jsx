import React, { useState } from 'react';
import { Zap, Check, Shield, Sparkles, Clock, Layers, BookOpen, GraduationCap, FileAudio, ShieldCheck } from 'lucide-react';
import api from '../api';

export default function CreditsPricingDashboard({ currentCredits = 10029, onTopUp = () => {}, userId = 'RoniDev' }) {
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'annual'

  // Task-based work pricing plans
  // Basic: 70% profit margin -> 30 credits ($3 work value)
  // Pro: 50% profit margin -> 100 credits ($10 work value)
  // Elite: 30% profit margin -> 280 credits ($28 work value)
  const tiers = [
    {
      name: "Basic",
      price: "$10",
      annualPrice: "$100",
      credits: "30 Credits / mo",
      capacity: "Up to 15 Assignment Workflows",
      popular: false,
      features: [
        "Assignment Rubric Analysis",
        "Active Recall Flashcard Generator",
        "Interactive Practice Quizzes",
        "Canvas & LMS Course Sync",
        "Standard Sub-Agent Execution",
      ],
      plan: "basic"
    },
    {
      name: "Pro",
      price: "$20",
      annualPrice: "$200",
      credits: "100 Credits / mo",
      capacity: "Up to 50 Assignment Workflows + Audio",
      popular: true,
      features: [
        "Everything in Basic",
        "Lecture Audio Transcriber & Summarizer",
        "AI Plagiarism & Humanized Style Passes",
        "Virtual Sub-Agent Sandboxes",
        "Priority Autonomous Scheduling",
      ],
      plan: "pro"
    },
    {
      name: "Elite",
      price: "$40",
      annualPrice: "$400",
      credits: "280 Credits / mo",
      capacity: "Up to 140 Heavy Workflows & Deep Tasks",
      popular: false,
      features: [
        "Everything in Pro",
        "Full Multi-Agent Overlord Orchestration",
        "Unlimited Sandbox Runtime Instances",
        "Dedicated Compute Node Allocation",
        "24/7 Webhooks & Instant Auto-Approvals",
      ],
      plan: "elite"
    }
  ];

  const taskCosts = [
    { name: "Full Assignment Synthesis & Rubric Breakdown", cost: "2.0 Credits", icon: Layers },
    { name: "Active Recall Flashcard Deck (15–25 cards)", cost: "0.5 Credits", icon: Sparkles },
    { name: "Interactive Practice Quiz with Explanations", cost: "0.5 Credits", icon: GraduationCap },
    { name: "Structured Course Study Guide Outline", cost: "0.5 Credits", icon: BookOpen },
    { name: "Lecture Audio Transcription & Synthesis", cost: "1.0 Credit / hr", icon: FileAudio },
    { name: "Originality & Writing Style Humanization Pass", cost: "1.0 Credit", icon: ShieldCheck },
    { name: "Virtual Sub-Agent Sandbox Run", cost: "0.2 Credits", icon: Zap },
  ];

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
        onTopUp(plan === 'elite' ? 4000 : plan === 'pro' ? 2000 : 1000);
      }
    } catch (e) {
      onTopUp(plan === 'elite' ? 4000 : plan === 'pro' ? 2000 : 1000);
    }
  };

  return (
    <div className="space-y-8">
      {/* Current Balance Bar */}
      <div className="glass-panel rounded-2xl p-6 border border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-950/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-mono text-slate-400">Available Compute Balance</div>
            <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 font-mono">
              {Number(currentCredits).toLocaleString()} Credits
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>Credits are consumed on-demand based on the tasks you run</span>
        </div>
      </div>

      {/* Billing Cycle Toggle */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setBillingCycle('monthly')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-semibold transition cursor-pointer ${
            billingCycle === 'monthly' ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/20 font-bold' : 'bg-white/5 text-slate-400 hover:bg-white/10'
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setBillingCycle('annual')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1.5 ${
            billingCycle === 'annual' ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/20 font-bold' : 'bg-white/5 text-slate-400 hover:bg-white/10'
          }`}
        >
          Annual <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">2 Months Free</span>
        </button>
      </div>

      {/* Subscription Tier Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier, idx) => (
          <div 
            key={idx}
            className={`glass-panel rounded-2xl p-6 flex flex-col justify-between relative transition-all duration-300 bg-slate-950/40 ${
              tier.popular ? 'border-cyan-500/50 shadow-xl shadow-cyan-500/10' : 'border-white/10'
            }`}
          >
            {tier.popular && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 px-3 py-0.5 rounded-full bg-cyan-500 text-black font-mono text-[10px] font-bold tracking-wider uppercase shadow-md shadow-cyan-500/30">
                Most Popular
              </div>
            )}
            <div>
              <h3 className="text-sm font-mono text-slate-300 uppercase font-bold">{tier.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-white font-mono">
                  {billingCycle === 'annual' ? tier.annualPrice : tier.price}
                </span>
                <span className="text-xs text-slate-400 font-mono">/{billingCycle === 'annual' ? 'year' : 'month'}</span>
              </div>
              {billingCycle === 'annual' && (
                <div className="text-[10px] font-mono text-emerald-400 mt-0.5">
                  Includes 2 months free
                </div>
              )}
              <div className="mt-3 p-3 rounded-xl bg-black/50 border border-white/5 text-xs font-mono space-y-1">
                <div className="text-cyan-300 font-bold text-sm">{tier.credits}</div>
                <div className="text-slate-400 text-[11px]">{tier.capacity}</div>
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
              type="button"
              onClick={() => handleSubscribe(tier.plan, billingCycle === 'annual')}
              className={`mt-6 w-full py-2.5 rounded-xl text-xs font-semibold font-mono transition-all cursor-pointer ${
                tier.popular 
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-md shadow-cyan-500/20 font-bold' 
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {tier.name === 'Pro' ? 'Start Free Trial' : `Select ${tier.name}`}
            </button>
          </div>
        ))}
      </div>

      {/* Task Credit Consumption Schedule */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10 bg-slate-950/40 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div>
            <h3 className="font-mono text-sm font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Transparent Task Credit Schedule
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Credits are deducted only when actions are executed. Unused credits rollover every month.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {taskCosts.map((task, i) => {
            const Icon = task.icon;
            return (
              <div key={i} className="flex items-center justify-between p-3.5 rounded-xl bg-black/40 border border-white/5 text-xs font-mono">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-slate-300 truncate">{task.name}</span>
                </div>
                <span className="text-amber-300 font-bold shrink-0 ml-2">{task.cost}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}