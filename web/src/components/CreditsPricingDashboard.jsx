import React from 'react';
import { Zap, Check, Shield, Sparkles } from 'lucide-react';

export default function CreditsPricingDashboard({ currentCredits = 10029, onTopUp = () => {} }) {
  const tiers = [
    {
      name: "Basic Node",
      price: "$10",
      credits: "300 credits",
      tokens: "3M DeepSeek Tokens",
      popular: false,
      features: ["V4 Flash Parsing", "Basic Evasion", "Canvas Sync"]
    },
    {
      name: "Pro Orchestrator",
      price: "$20",
      credits: "600 credits",
      tokens: "6M DeepSeek Tokens",
      popular: true,
      features: ["V4 Pro Multi-agent", "AST Style Cloner", "Priority Execution", "Audio Transcription"]
    },
    {
      name: "Elite Cluster",
      price: "$40",
      credits: "1,500 credits",
      tokens: "15M DeepSeek Tokens",
      popular: false,
      features: ["Unlimited Pro Inferences", "Zero Detection Guarantee", "Custom AST Harness", "24/7 Bot Webhooks"]
    }
  ];

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
          <span>Tier: <strong className="text-emerald-300 font-bold">Elite Cluster Active</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier, idx) => (
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
                <span className="text-3xl font-extrabold text-white">{tier.price}</span>
                <span className="text-xs text-slate-400 font-mono">/month</span>
              </div>
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
            <button className={`mt-6 w-full py-2.5 rounded-xl text-xs font-semibold font-mono transition-all cursor-pointer ${
              tier.popular 
                ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-md shadow-cyan-500/20' 
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}>
              Upgrade Node
            </button>
          </div>
        ))}
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
