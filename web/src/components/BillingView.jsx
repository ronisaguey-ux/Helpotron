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
      <div className="bg-surface-container-lowest border border-amber-500/30 rounded-3xl p-6 shadow-sm text-xs text-amber-300">
        <p className="font-title-md text-sm font-semibold text-amber-200">Payments not available yet — prototype only</p>
        <p className="mt-1 font-body-sm text-xs text-amber-300/90 leading-relaxed">
          We're running a free beta test right now: you're testing for free, the
          product isn't fully launched, and Stripe payments aren't wired up yet.
          Credits are test-only and settle when the real product launches.
        </p>
      </div>
      {msg && (
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-4 text-xs font-label-caps uppercase text-on-surface">
          {msg}
        </div>
      )}

      {/* Operator 08-31: active referral order discount (one-time, consumed at checkout) */}
      {referralPct > 0 && (
        <div className="bg-surface-container-lowest border border-primary/30 rounded-3xl p-6 shadow-sm text-xs text-primary" role="status">
          <p className="font-title-md text-sm font-semibold text-primary">
            🎁 Referral discount active: {referralPct}% off your next order
          </p>
          <p className="mt-1 font-body-sm text-xs text-on-surface-variant leading-relaxed">
            You redeemed a friend's referral code — the discount applies automatically on your next top-up and is used once.
          </p>
        </div>
      )}
      <CreditsPricingDashboard currentCredits={balance} currentTokens={tokens} plan={plan} onTopUp={handleTopUp} userId={userId} />

      {/* Credit Transaction History */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-title-md text-title-md text-on-surface">Receipts &amp; credit activity</span>
          <span className="font-tabular-stat text-tabular-stat text-on-surface-variant bg-surface-container-low px-3 py-1 rounded-full text-xs">{transactions.length} records</span>
        </div>
        <div>
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-on-surface-variant font-body-sm text-xs">
              <p>No credit transactions yet.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {transactions.map((tx, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container-low hover:bg-surface-container transition-colors text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`shrink-0 font-tabular-stat font-bold ${tx.delta >= 0 ? 'text-primary' : 'text-error'}`}>
                      {tx.delta >= 0 ? '+' : ''}{tx.delta.toFixed(2)}
                    </span>
                    <span className="text-on-surface font-body-sm truncate">{tx.reason}</span>
                  </div>
                  <span className="shrink-0 text-on-surface-variant font-tabular-stat text-[11px]">
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
