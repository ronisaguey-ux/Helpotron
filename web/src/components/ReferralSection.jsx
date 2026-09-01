import React, { useState, useEffect } from 'react';
import api from '../api';
import SectionCard from './SectionCard.jsx';
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
  Trash2,
} from 'lucide-react';
import Button from './ui/Button.jsx';

// Referrer credits per plan the referee BUYS (operator 08-31): Basic 2, Pro 5, Elite 10.
const PLAN_REWARDS = { basic: 2, pro: 5, elite: 10 };

export default function ReferralSection({ userId = '' }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [redeemCodeInput, setRedeemCodeInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState('');
  const [actionError, setActionError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  /* Delete one of your UNREDEEMED codes (operator 08-28). Redeemed codes are
   * locked — the referral already paid out. */
  const handleDeleteCode = async (c) => {
    if (!window.confirm(`Delete referral code ${c.code.slice(0, 16)}…? This can't be undone.`)) return;
    setDeletingId(c.id);
    setActionError('');
    try {
      await api.deleteReferralCode(c.id);
      await fetchStats();
    } catch (err) {
      setActionError(err.message || 'Failed to delete referral code.');
    } finally {
      setDeletingId(null);
    }
  };

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
      <SectionCard id="referral-banner" padding="p-6" className="relative overflow-hidden" header={
        <div className="flex flex-col md:flex-row md:items-center justify-between w-full gap-6">
          <div>
            <div className="aurora-chip mb-3 text-xs">
              <Gift className="w-3.5 h-3.5" /> 40-Digit Single-Use Referral System
            </div>
            <h2 className="text-xl font-bold text-aurora tracking-tight">Invite Classmates & Earn Compute Credits</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
              Generate <strong>40-digit cryptographic single-use invite codes</strong> attached to your account. When a classmate redeems your code, their order gets a one-time discount (30% new / 15% existing) — and when they buy a plan with your code, <strong>YOU earn credits: 2 for a Basic subscription, 5 for Pro, 10 for Elite</strong>. Codes are strictly single-use and non-reusable.
            </p>
          </div>

          {/* Active Code Box & Action */}
          <div className="flex flex-col items-stretch gap-2 shrink-0 max-w-md w-full sm:w-auto">
            {activeCode ? (
              <div className="p-3 rounded-2xl bg-white/4 border border-white/8 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase font-mono text-[var(--accent)] font-bold">Active 40-Digit Code (Single-Use)</span>
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
                <div className="font-mono text-xs text-white bg-white/4 p-2.5 rounded-xl border border-white/8 break-all select-all">
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
              Issue Code
            </Button>
          </div>
        </div>
      }>

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
      </SectionCard>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SectionCard id="referral-codes-issued" padding="p-5" className="space-y-1" header={
          <div className="flex items-center justify-between w-full text-slate-400 text-xs">
            <span>Codes Issued</span>
            <KeyRound className="w-4 h-4 text-[var(--accent)]" />
          </div>
        }>
          <div className="text-2xl font-black text-white font-mono">{stats?.total_issued || 0}</div>
          <p className="text-[11px] text-slate-500">40-digit cryptographic tokens</p>
        </SectionCard>

        <SectionCard id="referral-redemptions" padding="p-5" className="space-y-1" header={
          <div className="flex items-center justify-between w-full text-slate-400 text-xs">
            <span>Successful Redemptions</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
        }>
          <div className="text-2xl font-black text-emerald-400 font-mono">{stats?.total_completed || 0}</div>
          <p className="text-[11px] text-emerald-400/80">Payout on plan purchase — Basic 2 · Pro 5 · Elite 10</p>
        </SectionCard>

        <SectionCard id="referral-reward-rule" padding="p-5" className="space-y-1" header={
          <div className="flex items-center justify-between w-full text-slate-400 text-xs">
            <span>Reward Rule</span>
            <Award className="w-4 h-4 text-purple-400" />
          </div>
        }>
          <div className="text-sm font-bold text-white mt-1">2 / 5 / 10 Credits</div>
          <p className="text-[11px] text-slate-400">Basic / Pro / Elite — credited when they buy</p>
        </SectionCard>
      </div>

      {/* Redeem a Referral Code Form */}
      <SectionCard id="referral-redeem" padding="p-6" className="space-y-4" title="Have a 40-Digit Referral Code from a Friend?">
        <form onSubmit={handleRedeem} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Paste 40-digit code (e.g. e4f9a12c8b03f7d19a2e5c8b4f019d3e8a7b6c5d)"
            value={redeemCodeInput}
            onChange={(e) => setRedeemCodeInput(e.target.value)}
            className="clean-input flex-1 rounded-[var(--radius-md)] px-4 py-2.5 font-mono text-xs"
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
      </SectionCard>

      {/* Issued Referral Codes History Table */}
      <SectionCard id="referral-history" padding="p-6" className="space-y-4" header={
        <div className="flex items-center justify-between w-full">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[var(--accent)]" />
            Your Issued 40-Digit Single-Use Codes
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">
            {stats?.codes?.length || 0} Total Codes
          </span>
        </div>
      }>

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
                  <tr key={c.id} className="hover:bg-white/4">
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
                      {c.is_redeemed
                        ? (c.plan && PLAN_REWARDS[c.plan]
                            ? `+${PLAN_REWARDS[c.plan]} Credits · ${c.plan[0].toUpperCase() + c.plan.slice(1)}`
                            : '+2–10 Credits')
                        : 'Basic 2 · Pro 5 · Elite 10'}
                    </td>
                    <td className="py-3 text-[11px] text-slate-500">{c.created_at.slice(0, 10)}</td>
                    <td className="py-3 text-right whitespace-nowrap">
                      {!c.is_redeemed && (
                        <>
                          <button
                            type="button"
                            onClick={() => copyCode(c.code)}
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-[11px] transition cursor-pointer"
                          >
                            Copy Code
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCode(c)}
                            disabled={deletingId === c.id}
                            title="Delete this unredeemed code"
                            aria-label={`Delete code ${c.code.slice(0, 16)}…`}
                            className="inline-flex items-center gap-1 ml-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border border-rose-500/20 text-[11px] transition cursor-pointer disabled:opacity-40"
                          >
                            <Trash2 className="w-3 h-3" />
                            {deletingId === c.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}


