/* ────────────────────────────────────────────────────────────────────────────
 * CreditWallet.jsx — credits as a currency. Balance, monthly flow,
 * usage ledger with per-item cost breakdown ("why did this cost X?").
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion';
import { TrendingUp, TrendingDown, ChevronDown, Info } from 'lucide-react';
import { WALLET, demoEnabled } from '../demoData.js';
import { Badge, EmptyState, timeAgo } from './ui/os.jsx';
import SectionCard from './SectionCard.jsx';

export default function CreditWallet({ onGoToBilling }) {
  const [expanded, setExpanded] = useState(null);
  const demo = demoEnabled();
  const wallet = demo ? WALLET : null;

  if (!wallet) {
    return (
      <EmptyState
        icon="🪙"
        title="Your wallet is empty"
        body="Credits are spent automatically when Helpotron does work for you — study guides, flashcards, transcription, drafts."
        actionLabel="View plans"
        onAction={onGoToBilling}
      />
    );
  }

  const projectedPct = Math.round((wallet.projected / wallet.addedThisMonth) * 100);

  return (
    <div className="space-y-5">
      {/* Balance hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <SectionCard id="creditwallet-balance" padding="p-6" className="overflow-hidden" header={<div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Credit wallet</div>}>
        <div className="absolute -top-20 -right-10 w-56 h-56 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="text-5xl font-black text-white mt-2 tabular-nums">
              {wallet.balance.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-2">
              <span className="text-emerald-400">+ {wallet.addedThisMonth.toLocaleString()}</span> this month
              {' '}· <span className="text-rose-400">− {wallet.usedThisMonth.toLocaleString()}</span> used
            </div>
          </div>
          <div className="clean-card p-4 bg-slate-950/40 min-w-[180px]">
            <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Projected month-end</div>
            <div className="text-xl font-bold text-blue-300 tabular-nums mt-1">{wallet.projected.toLocaleString()}</div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style={{ width: `${projectedPct}%` }} />
            </div>
          </div>
        </div>
        </SectionCard>
      </motion.div>

      {/* Monthly flow */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="clean-card p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
            <TrendingUp className="w-4.5 h-4.5 text-emerald-400" width={18} height={18} />
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Added this month</div>
            <div className="text-lg font-bold text-white tabular-nums">+{wallet.addedThisMonth.toLocaleString()}</div>
            <div className="text-[10px] text-slate-600">Elite plan renewal · referrals · promos</div>
          </div>
        </div>
        <div className="clean-card p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center">
            <TrendingDown className="w-4.5 h-4.5 text-rose-400" width={18} height={18} />
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Used this month</div>
            <div className="text-lg font-bold text-white tabular-nums">−{wallet.usedThisMonth.toLocaleString()}</div>
            <div className="text-[10px] text-slate-600">Across {wallet.usage.length} operations · full ledger below</div>
          </div>
        </div>
      </div>

      {/* Usage ledger with cost breakdown */}
      <SectionCard id="creditwallet-usage" header={
        <div className="flex items-center justify-between w-full">
          <div>
            <h3 className="text-sm font-semibold text-white">Recent usage</h3>
            <p className="text-xs text-slate-500 mt-0.5">Tap any row to see why it cost that much.</p>
          </div>
          <Badge color="blue">Fully transparent</Badge>
        </div>
      }>

        <div className="space-y-2">
          {wallet.usage.map((u) => (
            <div key={u.id} className="rounded-xl border border-white/6 bg-slate-950/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-white/3 cursor-pointer"
                aria-expanded={expanded === u.id}
              >
                <span className="text-[11px] font-mono text-rose-400 shrink-0 w-10">{u.amount}</span>
                <span className="text-xs text-slate-200 flex-1 min-w-0">
                  <span className="block truncate">{u.reason}</span>
                  <span className="block text-[10px] text-slate-500">{u.model} · {timeAgo(u.at)}</span>
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expanded === u.id ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {expanded === u.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-1">
                      <div className="rounded-lg bg-slate-950/60 border border-white/6 p-3 text-[11px] space-y-2">
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Info className="w-3 h-3 text-blue-400" />
                          Why did this cost {u.amount} credits?
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-slate-400">
                          <div><span className="text-slate-600">Operation</span><div className="text-slate-300 mt-0.5">{u.operation}</div></div>
                          <div><span className="text-slate-600">Engine</span><div className="text-slate-300 mt-0.5">{u.model}</div></div>
                          <div><span className="text-slate-600">Tokens</span><div className="text-slate-300 mt-0.5 font-mono">{u.tokens.toLocaleString()}</div></div>
                          <div><span className="text-slate-600">Rate</span><div className="text-slate-300 mt-0.5">~{u.tokens ? Math.max(1, Math.round(-u.amount / u.tokens * 10000) / 100) : '—'} cr / 1k tokens</div></div>
                        </div>
                        <div className="text-[10px] text-slate-600">
                          Effort-based routing: complex work (research, reasoning) uses the flagship engine; mechanical work (OCR, transcription) uses the fast engine. You control this with the <span className="text-blue-300">AI Effort</span> setting.
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
