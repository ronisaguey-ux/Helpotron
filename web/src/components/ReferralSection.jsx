import React, { useState, useEffect } from 'react';
import api from '../api.js';
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

// Referrer rewards per plan purchased: Basic 2, Pro 5, Elite 10
const PLAN_REWARDS = [
  { plan: 'Basic ($10)', credits: 2, usd: '$2.00', tokens: '30,000 tokens' },
  { plan: 'Pro ($20)', credits: 5, usd: '$5.00', tokens: '100,000 tokens' },
  { plan: 'Elite ($40)', credits: 10, usd: '$10.00', tokens: '270,000 tokens' },
];

export default function ReferralSection({ userId = '' }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState('');
  const [generating, setGenerating] = useState(false);
  const [redeemCodeInput, setRedeemCodeInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState('');
  const [actionError, setActionError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

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

  const copyToClipboard = async (text, id) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setCopiedCode(id);
      setTimeout(() => setCopiedCode(''), 2000);
    } catch {
      /* clipboard write rejected */
    }
  };

  const handleGenerateCode = async () => {
    setGenerating(true);
    setActionError('');
    try {
      const res = await api.generateReferralCode();
      if (res && res.code) {
        await fetchStats();
      }
    } catch (err) {
      setActionError(err.message || 'Failed to generate referral code.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteCode = async (id) => {
    setDeletingId(id);
    setActionError('');
    try {
      await api.deleteReferralCode(id);
      setConfirmDeleteId(null);
      await fetchStats();
    } catch (err) {
      setActionError(err.message || 'Failed to delete referral code.');
    } finally {
      setDeletingId(null);
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
      setRedeemMsg(res.message || '✅ Referral code redeemed successfully!');
      setRedeemCodeInput('');
      await fetchStats();
      setTimeout(() => setRedeemMsg(''), 6000);
    } catch (err) {
      setActionError(err.message || 'Failed to redeem referral code.');
    } finally {
      setRedeeming(false);
    }
  };

  const totalReferred = stats?.total_referred || 0;
  const totalEarned = stats?.total_credits_earned || 0;
  const codes = stats?.issued_codes || [];
  const latestCode = codes.find((c) => !c.redeemed) || codes[0];

  return (
    <div className="space-y-6">
      {/* Header telemetry banner */}
      <div className="bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">Growth Network</span>
            <span className="text-outline-variant font-code-sm text-xs">/</span>
            <span className="font-chip-status text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase">
              Peer Rewards
            </span>
          </div>
          <h2 className="font-title-md text-xl text-on-surface font-semibold">
            Earn Compute Credits &amp; Refer Friends
          </h2>
          <p className="font-body-sm text-xs text-on-surface-variant max-w-xl">
            Give your colleagues 30% off their first order (or 15% if existing). Earn direct compute credits whenever they subscribe or purchase tokens.
          </p>
        </div>

        {/* Action button */}
        <button
          type="button"
          disabled={generating}
          onClick={handleGenerateCode}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider font-semibold shadow-[0_0_20px_rgba(120,245,229,0.25)] hover:brightness-105 active:scale-[0.98] transition flex items-center gap-2 shrink-0 self-start md:self-center disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4 text-on-primary" />
          <span>{generating ? 'Generating...' : 'Generate New Code'}</span>
        </button>
      </div>

      {/* Inline Feedback / Errors */}
      {actionError && (
        <div className="p-4 rounded-2xl bg-error-container/20 border border-error/30 text-error text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button type="button" onClick={() => setActionError('')} className="p-1 hover:text-on-surface">
            &times;
          </button>
        </div>
      )}

      {redeemMsg && (
        <div className="p-4 rounded-2xl bg-sem-green/15 border border-sem-green/30 text-sem-green text-xs flex items-center gap-2 shadow-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{redeemMsg}</span>
        </div>
      )}

      {/* 3 Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-surface-container-lowest/80 border border-outline-variant/20 shadow-sm flex flex-col justify-between">
          <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">Total Referred</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="font-tabular-stat text-3xl text-on-surface font-bold">{totalReferred}</span>
            <span className="font-code-sm text-xs text-on-surface-variant">STUDENTS</span>
          </div>
          <span className="font-code-sm text-[11px] text-on-surface-variant mt-2">
            {totalReferred === 0 ? 'No referrals yet' : `${totalReferred} activated accounts`}
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-surface-container-lowest/80 border border-outline-variant/20 shadow-sm flex flex-col justify-between">
          <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">Total Earned</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="font-tabular-stat text-3xl text-primary font-bold">{totalEarned}</span>
            <span className="font-code-sm text-xs text-on-surface-variant">CREDITS</span>
          </div>
          <span className="font-code-sm text-[11px] text-primary mt-2">
            ≈ ${(totalEarned).toFixed(2)} USD compute equivalent
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-surface-container-lowest/80 border border-outline-variant/20 shadow-sm flex flex-col justify-between">
          <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">Active Discount</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="font-tabular-stat text-3xl text-sem-green font-bold">30%</span>
            <span className="font-code-sm text-xs text-on-surface-variant">OFF</span>
          </div>
          <span className="font-code-sm text-[11px] text-sem-green mt-2">
            Instant referee purchase reward
          </span>
        </div>
      </div>

      {/* Primary Share Row (44px min-h touch target) */}
      {latestCode && (
        <div className="bg-surface-container-lowest/80 backdrop-blur-xl border border-primary/30 rounded-3xl p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-xs text-primary uppercase tracking-wider font-semibold">
              Your Primary Referral Link
            </span>
            <span className="font-chip-status text-[10px] text-sem-green bg-sem-green/10 px-2 py-0.5 rounded-full">
              ACTIVE
            </span>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            <div className="flex-1 h-11 px-4 rounded-xl bg-surface-container-low border border-outline-variant/20 flex items-center font-tabular-stat text-xs text-on-surface truncate select-all">
              {latestCode.code}
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(latestCode.code, 'primary')}
              className="min-h-[44px] px-6 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider font-semibold hover:brightness-105 active:scale-[0.98] transition flex items-center justify-center gap-2 shrink-0 shadow-sm"
            >
              {copiedCode === 'primary' ? (
                <>
                  <Check className="w-4 h-4 text-on-primary" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-on-primary" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Rewards Schedule Table */}
      <div className="bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 rounded-3xl p-6 shadow-sm space-y-4">
        <div>
          <h3 className="font-title-md text-title-md text-on-surface font-semibold">Per-Plan Referral Rewards</h3>
          <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
            Transparent payout schedule credited to your account upon verified subscription.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PLAN_REWARDS.map((r, idx) => (
            <div key={idx} className="p-4 rounded-2xl bg-surface-container-low/70 border border-outline-variant/10 space-y-1">
              <span className="font-body-sm text-xs text-on-surface-variant font-medium block">{r.plan}</span>
              <div className="flex items-baseline gap-1">
                <span className="font-tabular-stat text-xl text-primary font-bold">+{r.credits} Credits</span>
                <span className="font-code-sm text-[11px] text-on-surface-variant">({r.usd})</span>
              </div>
              <span className="font-code-sm text-[10px] text-sem-green block">{r.tokens} added to wallet</span>
            </div>
          ))}
        </div>
      </div>

      {/* Redeem Form & Issued Codes Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Redeem Code Panel */}
        <div className="bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 rounded-3xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="font-title-md text-title-md text-on-surface font-semibold">Redeem a Referral Code</h3>
            <p className="font-body-sm text-xs text-on-surface-variant">
              Have a code from a classmate? Enter it here to claim your 30% purchase discount.
            </p>
          </div>
          <form onSubmit={handleRedeem} className="space-y-3 pt-2">
            <input
              type="text"
              required
              value={redeemCodeInput}
              onChange={(e) => setRedeemCodeInput(e.target.value)}
              placeholder="Paste 40-character referral code"
              className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface font-tabular-stat text-xs focus:outline-none focus:border-primary transition"
            />
            <button
              type="submit"
              disabled={redeeming || !redeemCodeInput.trim()}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-xs uppercase tracking-wider font-semibold transition active:scale-[0.98] disabled:opacity-50"
            >
              {redeeming ? 'Redeeming...' : 'Apply Code'}
            </button>
          </form>
        </div>

        {/* Issued Codes Table */}
        <div className="bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-title-md text-title-md text-on-surface font-semibold">Issued Codes</h3>
            <span className="font-tabular-stat text-xs text-on-surface-variant bg-surface-container-high px-2.5 py-0.5 rounded-full">
              {codes.length} Codes
            </span>
          </div>

          {codes.length === 0 ? (
            <div className="p-6 text-center text-xs text-on-surface-variant font-body-sm rounded-xl bg-surface-container-low/40">
              No referral codes issued yet. Click "Generate New Code" above to create one.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {codes.map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-xl bg-surface-container-low/70 border border-outline-variant/10 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`font-chip-status text-[9px] px-1.5 py-0.5 rounded uppercase ${
                        c.redeemed
                          ? 'bg-surface-container-high text-on-surface-variant'
                          : 'bg-sem-green/15 text-sem-green font-semibold'
                      }`}
                    >
                      {c.redeemed ? 'Redeemed' : 'Active'}
                    </span>
                    <span className="font-tabular-stat text-on-surface truncate text-xs select-all">
                      {c.code.slice(0, 16)}…
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(c.code, c.id)}
                      className="p-2 min-h-[36px] min-w-[36px] rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition flex items-center justify-center"
                      title="Copy full code"
                    >
                      {copiedCode === c.id ? (
                        <Check className="w-3.5 h-3.5 text-sem-green" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {!c.redeemed && (
                      confirmDeleteId === c.id ? (
                        <div className="flex items-center gap-1 bg-surface-container-high p-1 rounded-lg">
                          <button
                            type="button"
                            disabled={deletingId === c.id}
                            onClick={() => handleDeleteCode(c.id)}
                            className="px-2 py-1 bg-error text-on-error rounded text-[10px] font-label-caps"
                          >
                            {deletingId === c.id ? '...' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1.5 py-1 text-on-surface-variant text-[10px]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(c.id)}
                          className="p-2 min-h-[36px] min-w-[36px] rounded-lg hover:bg-error-container/20 text-on-surface-variant hover:text-error transition flex items-center justify-center"
                          title="Delete unredeemed code"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
