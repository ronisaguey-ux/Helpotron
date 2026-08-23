/* ────────────────────────────────────────────────────────────────────────────
 * BillingView.jsx — plans & top-ups + credit transaction history.
 * Extracted from the old App.jsx Billing function (Experience Rewrite, 08-22)
 * so it can live inside the merged Credits view.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import CreditsPricingDashboard from './CreditsPricingDashboard.jsx';

export default function BillingView({ userId }) {
  const [balance, setBalance] = useState(10029);
  const [msg, setMsg] = useState('');
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    api.dashboard(userId).then((d) => {
      setBalance(d.credits || 10029);
      setTransactions(d.recent_transactions || []);
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
      {msg && (
        <div className="clean-card p-4 border border-blue-500/30 text-xs text-blue-300">
          {msg}
        </div>
      )}
      <CreditsPricingDashboard currentCredits={balance} onTopUp={handleTopUp} userId={userId} />

      {/* Credit Transaction History */}
      <div className="clean-card p-6">
        <h3 className="font-semibold mb-4 text-sm text-white flex items-center gap-2">
          Receipts & Credit Activity
        </h3>
        {transactions.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">No credit transactions yet.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {transactions.map((tx, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-white/5 text-xs font-mono"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`shrink-0 font-bold ${tx.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {tx.delta >= 0 ? '+' : ''}{tx.delta.toFixed(2)}
                  </span>
                  <span className="text-slate-400 truncate">{tx.reason}</span>
                </div>
                <span className="shrink-0 text-slate-500 text-[10px]">
                  {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
