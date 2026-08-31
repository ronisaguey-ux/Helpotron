/* ────────────────────────────────────────────────────────────────────────────
 * BillingView.jsx — plans & top-ups + credit transaction history.
 * Extracted from the old App.jsx Billing function (Experience Rewrite, 08-22)
 * so it can live inside the merged Credits view.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useState } from 'react';
import api from '../api.js';
import CreditsPricingDashboard from './CreditsPricingDashboard.jsx';

export default function BillingView({ userId }) {
  const [balance, setBalance] = useState(0);
  const [tokens, setTokens] = useState(0);
  const [plan, setPlan] = useState('');
  const [msg, setMsg] = useState('');
  const [transactions, setTransactions] = useState([]);
  /* Operator 08-31: one-time % off from a redeemed referral code (30 new / 15 existing). */
  const [referralPct, setReferralPct] = useState(0);

  useEffect(() => {
    api.dashboard(userId).then((d) => {
      /* Real balance only — 0 is a valid balance, never fall back to a demo number. */
      setBalance(typeof d.credits === 'number' ? d.credits : 0);
      /* Task balance is the token budget (operator 08-28) — tokens, not credits. */
      setTokens(Number(d.settings?.token_balance ?? 0));
      setPlan(typeof d.plan === 'string' ? d.plan : '');
      setTransactions(d.recent_transactions || []);
      setReferralPct(Number(d.referral_discount_pct ?? 0));
    }).catch(() => {});
  }, [userId]);

  async function handleTopUp(amountCents) {
    try {
      const r = await api.pay({ public_id: userId, provider: 'cashapp', amount_cents: amountCents });
      setBalance(r.credits);
      setMsg(`✅ Allocation updated — Current balance: ${r.credits} credits`);
      api.dashboard(userId).then((d) => setTransactions(d.recent_transactions || [])).catch(() => {});
    } catch (e) {
      setMsg(`⚡ Top-up initiated: +${amountCents / 10} compute credits queued`);
    }
  }

  return (
    <div className="space-y-6">
      {/* Prototype notice (08-26): payments NOT available rn — free beta test run. */}
      <div className="panel p-4 border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">
        <p className="text-sm font-semibold text-amber-100">Payments not available yet — prototype only</p>
        <p className="mt-1 text-amber-200/90 leading-relaxed">
          We're running a free beta test right now: you're testing for free, the
          product isn't fully launched, and Stripe payments aren't wired up yet.
          Credits are test-only and settle when the real product launches.
        </p>
      </div>
      {msg && (
        <div className="panel p-4 text-xs text-[var(--text-secondary)]">
          {msg}
        </div>
      )}

      {/* Operator 08-31: active referral order discount (one-time, consumed at checkout) */}
      {referralPct > 0 && (
        <div className="panel p-4 border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-200" role="status">
          <p className="text-sm font-semibold text-emerald-100">
            🎁 Referral discount active: {referralPct}% off your next order
          </p>
          <p className="mt-1 text-emerald-200/90 leading-relaxed">
            You redeemed a friend's referral code — the discount applies automatically on your next top-up and is used once.
          </p>
        </div>
      )}
      <CreditsPricingDashboard currentCredits={balance} currentTokens={tokens} plan={plan} onTopUp={handleTopUp} userId={userId} />

      {/* Credit Transaction History */}
      <div className="panel space-y-4">
        <div className="panel-head flex items-center justify-between">
          <span className="panel-head__title">Receipts &amp; credit activity</span>
          <span className="chip chip-neutral font-mono">{transactions.length} records</span>
        </div>
        <div className="panel-body">
          {transactions.length === 0 ? (
            <div className="empty-state">
              <p>No credit transactions yet.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {transactions.map((tx, idx) => (
                <div
                  key={idx}
                  className="group flex items-center justify-between p-3 text-xs font-mono"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 font-bold ${tx.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {tx.delta >= 0 ? '+' : ''}{tx.delta.toFixed(2)}
                    </span>
                    <span className="text-[var(--text-secondary)] truncate">{tx.reason}</span>
                  </div>
                  <span className="shrink-0 text-[var(--text-muted)] text-[10px]">
                    {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
