import React, { useState, useEffect } from 'react';
import api from '../api';
import {
  Gift,
  Copy,
  Check,
  Users,
  Sparkles,
  Award,
  RefreshCw,
  Tag,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  KeyRound,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import Button from './ui/Button.jsx';

export default function ReferralSection({ userId = 'RoniDev' }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [redeemCodeInput, setRedeemCodeInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState('');
  const [actionError, setActionError] = useState('');

  const fetchStats = async () => {
    setLoading(true);
    setActionError('');
    try {
      const res = await api.getReferralStats();
      if (res && res.status === 'success') {
        setStats(res);
      }
    } catch (e) {
      console.warn('Failed to load referral stats:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [userId]);

  const handleGenerateCode = async () => {
    setGenerating(true);
    setActionError('');
    try {
      const res = await api.generateReferralCode();
      if (res && res.code) {
        await fetchStats();
      }
    } catch (err) {
      setActionError(err.message || 'Failed to generate code. Active subscription is required.');
    } finally {
      setGenerating(false);
    }
  };

  const handleRedeem = async (e) => {
    e.preventDefault();
    if (!redeemCodeInput.trim()) return;

    setRedeeming(true);
    setRedeemMsg('');
    setActionError('');
    try {
      const res = await api.redeemReferralCode(redeemCodeInput.trim());
      setRedeemMsg(res.message || '✅ Referral code redeemed! +10 credits awarded.');
      setRedeemCodeInput('');
      await fetchStats();
      setTimeout(() => setRedeemMsg(''), 6000);
    } catch (err) {
      setActionError(err.message || 'Failed to redeem referral code.');
    } finally {
      setRedeeming(false);
    }
  };

  const copyCode = (code) => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const activeCode = stats?.active_code;
  const isSubscribed = stats?.is_subscribed !== false;

  return (
    <div className="space-y-6 text-slate-100 animate-fadeIn max-w-5xl mx-auto">
      {/* Referral Header Banner */}
      <div className="clean-card rounded-3xl p-6 relative overflow-hidden bg-slate-950/60 border border-white/10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold mb-3">
              <Gift className="w-3.5 h-3.5" /> 40-Digit Single-Use Referral System
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Invite Classmates & Earn Compute Credits</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
              Generate <strong>40-digit cryptographic single-use invite codes</strong> attached to your account. When a classmate redeems your code, you earn <strong>+40 Compute Credits</strong> and they receive <strong>+10 bonus credits</strong>. Codes are strictly single-use and non-reusable.
            </p>
          </div>

          {/* Active Code Box & Action */}
          <div className="flex flex-col items-stretch gap-2 shrink-0 max-w-md w-full sm:w-auto">
            {activeCode ? (
              <div className="p-3 rounded-2xl bg-slate-900 border border-blue-500/30 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase font-mono text-blue-400 font-bold">Active 40-Digit Code (Single-Use)</span>
                  <button
                    type="button"
                    onClick={() => copyCode(activeCode)}
                    className="hover:text-white text-slate-400 transition-colors cursor-pointer p-1 rounded hover:bg-white/10 text-xs flex items-center gap-1 font-mono"
                    title="Copy 40-Digit Code"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="font-mono text-xs text-white bg-slate-950 p-2 rounded-xl border border-white/5 break-all select-all">
                  {activeCode}
                </div>
              </div>
            ) : null}

            <Button
              variant="primary"
              onClick={handleGenerateCode}
              disabled={!isSubscribed}
              isLoading={generating}
              loadingText="Generating 40-Digit Code…"
              className="w-full sm:w-auto"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Issue Fresh 40-Digit Code
            </Button>
          </div>
        </div>

        {/* Subscription Gating Notice */}
        {!isSubscribed && (
          <div className="mt-4 p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Active Subscription Required:</strong> Only users actively subscribed to Basic, Pro, or Elite plans can issue referral codes. Please subscribe to start generating 40-digit single-use codes.
            </div>
          </div>
        )}

        {actionError && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="clean-card rounded-2xl p-5 space-y-1 bg-slate-950/60 border border-white/10">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Codes Issued</span>
            <KeyRound className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{stats?.total_issued || 0}</div>
          <p className="text-[11px] text-slate-500">40-digit cryptographic tokens</p>
        </div>

        <div className="clean-card rounded-2xl p-5 space-y-1 bg-slate-950/60 border border-white/10">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Successful Redemptions</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">{stats?.total_completed || 0}</div>
          <p className="text-[11px] text-emerald-400/80">+{ (stats?.total_completed || 0) * 40 } credits earned</p>
        </div>

        <div className="clean-card rounded-2xl p-5 space-y-1 bg-slate-950/60 border border-white/10">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Reward Rule</span>
            <Award className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-sm font-bold text-white mt-1">40 Credits / Invite</div>
          <p className="text-[11px] text-slate-400">Single-use, attributed to your account</p>
        </div>
      </div>

      {/* Redeem a Referral Code Form */}
      <div className="clean-card rounded-3xl p-6 bg-slate-950/60 border border-white/10 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Gift className="w-4 h-4 text-emerald-400" />
          Have a 40-Digit Referral Code from a Friend?
        </h3>
        <form onSubmit={handleRedeem} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Paste 40-digit code (e.g. e4f9a12c8b03f7d19a2e5c8b4f019d3e8a7b6c5d)"
            value={redeemCodeInput}
            onChange={(e) => setRedeemCodeInput(e.target.value)}
            className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-xs placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
          />
          <Button
            type="submit"
            variant="emerald"
            disabled={!redeemCodeInput.trim()}
            isLoading={redeeming}
            loadingText="Verifying…"
            className="shrink-0"
          >
            Redeem +10 Credits
          </Button>
        </form>

        {redeemMsg && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-mono">
            {redeemMsg}
          </div>
        )}
      </div>

      {/* Issued Referral Codes History Table */}
      <div className="clean-card rounded-3xl p-6 bg-slate-950/60 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-400" />
            Your Issued 40-Digit Single-Use Codes
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">
            {stats?.codes?.length || 0} Total Codes
          </span>
        </div>

        {!stats?.codes || stats.codes.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No referral codes generated yet. Click "Issue Fresh 40-Digit Code" above to invite friends.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 text-[11px]">
                  <th className="pb-3 font-semibold">40-Digit Token</th>
                  <th className="pb-3 font-semibold">Format</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Reward</th>
                  <th className="pb-3 font-semibold">Created</th>
                  <th className="pb-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {stats.codes.map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 text-slate-200 break-all select-all font-semibold">
                      {c.code.slice(0, 16)}...{c.code.slice(-8)}
                    </td>
                    <td className="py-3 text-[11px] text-slate-400">40-char Single-Use</td>
                    <td className="py-3">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${
                          c.is_redeemed
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            : 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                        }`}
                      >
                        {c.is_redeemed ? '✅ Redeemed' : '⏳ Pending / Unused'}
                      </span>
                    </td>
                    <td className="py-3 text-emerald-400 font-bold">
                      {c.is_redeemed ? '+40 Credits' : '40 Credits on use'}
                    </td>
                    <td className="py-3 text-[11px] text-slate-500">{c.created_at.slice(0, 10)}</td>
                    <td className="py-3 text-right">
                      {!c.is_redeemed && (
                        <button
                          type="button"
                          onClick={() => copyCode(c.code)}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-[11px] transition cursor-pointer"
                        >
                          Copy Code
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
