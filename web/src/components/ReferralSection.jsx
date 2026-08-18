import React, { useState, useEffect } from 'react';
import api from '../api';
import { Gift, Copy, Check, Users, Sparkles, Award, RefreshCw, DollarSign, Tag, ArrowRight, ShieldCheck } from 'lucide-react';

export default function ReferralSection({ publicId }) {
  const [data, setData] = useState({
    code: 'RONI-2026-PROMO',
    referrals_count: 5,
    discount_credits: 21, // $21 in discount credits
    tier: 'Gold Ambassador',
    history: [
      { user: 'alex.k***', plan: 'Elite Plan ($40)', credits_earned: 12, date: '2 days ago' },
      { user: 'sarah.m***', plan: 'Pro Plan ($20)', credits_earned: 7, date: '4 days ago' },
      { user: 'david.b***', plan: 'Basic Plan ($10)', credits_earned: 2, date: '1 week ago' },
    ],
  });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  const generateNewCode = () => {
    setGenerating(true);
    setTimeout(() => {
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      setData((prev) => ({
        ...prev,
        code: `RONI-${randomSuffix}-AI`,
      }));
      setGenerating(false);
    }, 600);
  };

  const copyCode = () => {
    if (data?.code) {
      navigator.clipboard.writeText(`https://helpotron.ai/join?ref=${data.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6 text-slate-100 animate-fadeIn">
      {/* Referral Header Banner */}
      <div className="clean-card rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold mb-3">
              <Gift className="w-3.5 h-3.5" /> Rewards & Affiliate Program
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Invite Classmates & Earn Discount Credits</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-lg leading-relaxed">
              When friends purchase any plan using your promo code, you earn <strong>Discount Credits ($1 value per credit)</strong> that automatically apply up to <strong>50% off your next purchase</strong>!
            </p>
          </div>

          {/* Referral Code Box & Action */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
            <div className="px-4 py-2.5 rounded-xl bg-slate-950/80 border border-white/10 font-mono text-blue-300 text-sm flex items-center justify-between gap-3 shadow-inner">
              <span className="font-bold tracking-wider">{data?.code}</span>
              <button
                type="button"
                onClick={copyCode}
                className="hover:text-white transition-colors cursor-pointer p-1 rounded hover:bg-white/10"
                title="Copy Invite Link"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="button"
              onClick={generateNewCode}
              disabled={generating}
              className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md shadow-blue-600/20"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
              <span>Generate New Code</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Discount Credits Balance */}
        <div className="clean-card rounded-2xl p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Available Discount Credits</span>
            <Tag className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">${data.discount_credits}.00</div>
          <p className="text-[11px] text-slate-400">
            {data.discount_credits} credits ($1/credit) ready to apply
          </p>
        </div>

        {/* Total Referrals */}
        <div className="clean-card rounded-2xl p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Successful Referrals</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{data.referrals_count}</div>
          <p className="text-[11px] text-emerald-400">Active student accounts</p>
        </div>

        {/* Affiliate Tier */}
        <div className="clean-card rounded-2xl p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Affiliate Status</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-amber-300">{data.tier}</div>
          <p className="text-[11px] text-slate-400">Tier unlocked at 5+ invites</p>
        </div>
      </div>

      {/* Referral Reward Tiers Breakdown */}
      <div className="clean-card rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400" />
          Referral Reward Rates Per Plan
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">🥉 Basic Plan ($10)</span>
              <span className="text-emerald-400 font-mono font-bold">+2 Credits ($2)</span>
            </div>
            <p className="text-[11px] text-slate-400">
              When someone purchases Basic, you receive 2 discount credits directly.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/40 border border-blue-500/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-blue-300">🥈 Pro Plan ($20)</span>
              <span className="text-emerald-400 font-mono font-bold">+7 Credits ($7)</span>
            </div>
            <p className="text-[11px] text-slate-400">
              When someone purchases Pro, you receive 7 discount credits directly.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/40 border border-amber-500/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-amber-300">🥇 Elite Plan ($40)</span>
              <span className="text-emerald-400 font-mono font-bold">+12 Credits ($12)</span>
            </div>
            <p className="text-[11px] text-slate-400">
              When someone purchases Elite, you receive 12 discount credits directly.
            </p>
          </div>
        </div>

        {/* 50% Rule Notice */}
        <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200 flex items-start gap-2.5">
          <span className="text-base">💡</span>
          <div>
            <strong>How Discount Credits Apply at Checkout:</strong> Each credit equals <strong>$1.00 USD</strong>. Credits apply to your next purchase with a <strong>maximum discount of 50%</strong> of that purchase's value (e.g. up to $5 off Basic, $10 off Pro, and $20 off Elite).
          </div>
        </div>
      </div>

      {/* Recent Referral Activity */}
      <div className="clean-card rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-white">Recent Referral Earnings</h3>
        <div className="space-y-2">
          {data.history.map((h, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-white/5 text-xs">
              <div>
                <span className="font-semibold text-slate-200 font-mono">{h.user}</span>
                <span className="text-slate-400 ml-2">purchased {h.plan}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400 font-mono font-bold">+{h.credits_earned} Credits (${h.credits_earned})</span>
                <span className="text-slate-500 text-[11px]">{h.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
