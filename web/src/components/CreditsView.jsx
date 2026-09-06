import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Gift,
  Trophy,
  BarChart3,
  Zap,
  TrendingUp,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import api from '../api.js';
import BillingView from './BillingView.jsx';
import ReferralSection from './ReferralSection.jsx';
import CreditLeaderboard from './CreditLeaderboard.jsx';
import CreditsCostTab from './CreditsCostTab.jsx';
import TrialActivationCard from './TrialActivationCard.jsx';

export default function CreditsView({ userId = '', initialTab = 'plans', userCredits = 0 }) {
  const [activeTab, setActiveTab] = useState(
    ['plans', 'earn', 'leaderboard', 'cost'].includes(initialTab) ? initialTab : 'plans'
  );
  const [tokens, setTokens] = useState(null);
  const [credits, setCredits] = useState(null);
  const [plan, setPlan] = useState('basic');
  const [loading, setLoading] = useState(true);

  const fetchBalance = () => {
    setLoading(true);
    api.dashboard(userId)
      .then((d) => {
        setCredits(typeof d.credits === 'number' ? d.credits : 0);
        setTokens(Number(d.settings?.token_balance ?? 0));
        setPlan(typeof d.plan === 'string' ? d.plan : 'basic');
      })
      .catch(() => {
        setCredits(0);
        setTokens(0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBalance();
  }, [userId]);

  const tokenVal = tokens !== null ? tokens : 0;
  const creditVal = credits !== null ? credits : 0;

  return (
    <div className="space-y-6 max-w-[1240px] mx-auto p-2 sm:p-4">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2 font-code-sm text-xs text-on-surface-variant uppercase tracking-wider mb-1">
          <span>Platform System</span>
          <span>/</span>
          <span className="text-primary font-medium">Credits &amp; Billing</span>
          <span>/</span>
          <span className="text-sem-green flex items-center gap-1 font-chip-status text-[10px] px-2 py-0.5 rounded-full bg-sem-green/10">
            <span className="w-1.5 h-1.5 rounded-full bg-sem-green animate-pulse"></span>
            LEDGER SYNCED
          </span>
        </div>
        <h1 className="font-headline-lg-mobile md:font-headline-lg text-title-md md:text-headline-lg text-on-surface font-semibold tracking-tight">
          Compute Reservoir &amp; Billing
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-1">
          Deterministic token allocation, compute runway forecasting, and subscription management.
        </p>
      </div>

      {/* Free Trial activation (owner 09-06): 2FA + 1-cent payment verification */}
      <TrialActivationCard userId={userId} />

      {/* SECTION 3.11.1: ALWAYS-VISIBLE PROMINENT BALANCE STRIP */}
      <section className="relative rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 p-6 sm:p-8 shadow-xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Balance Metrics */}
          <div className="lg:col-span-7 flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex flex-col gap-1 pr-6 sm:border-r border-outline-variant/15">
              <div className="flex items-center gap-2">
                <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">
                  Available Reservoir
                </span>
                <span className="font-chip-status text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded uppercase">
                  {plan} TIER
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                {loading && tokens === null ? (
                  <div className="h-10 w-44 rounded-xl bg-surface-container-high/60 animate-pulse my-1" />
                ) : (
                  <>
                    <span className="font-tabular-stat text-3xl sm:text-4xl md:text-5xl text-primary font-bold tracking-tight">
                      {tokenVal.toLocaleString()}
                    </span>
                    <span className="font-code-sm text-xs text-on-surface-variant font-medium">TOKENS</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 font-code-sm text-xs text-on-surface-variant">
                <span>Compute metering:</span>
                <span className="font-tabular-stat text-on-surface font-semibold text-sm">
                  task tokens
                </span>
              </div>
            </div>

            {/* Runway Forecast */}
            <div className="flex flex-col gap-2 flex-1">
              <div className="flex items-center justify-between">
                <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">
                  Projected Compute Runway
                </span>
                <span className="font-code-sm text-xs text-sem-green font-medium">
                  {tokenVal > 500 ? '~30+ Days Active' : tokenVal > 0 ? '~7 Days Active' : 'Depleted'}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-container-high overflow-hidden flex">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(8, (tokenVal / 3000) * 100))}%` }}
                />
              </div>
              <div className="flex items-center justify-between font-code-sm text-[11px] text-on-surface-variant">
                <span>Metered by task content</span>
                <span>Auto-rollback active</span>
              </div>
            </div>
          </div>

          {/* Quick Action Operations */}
          <div className="lg:col-span-5 flex flex-wrap sm:flex-nowrap items-center justify-start lg:justify-end gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('cost')}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-label-caps text-xs tracking-wider transition duration-150 flex items-center gap-2 active:scale-[0.98] shadow-sm border border-outline-variant/15"
            >
              <BarChart3 className="w-4 h-4 text-on-surface-variant" />
              <span>Spend Analytics</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('plans')}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider font-semibold transition-all duration-150 flex items-center gap-2 active:scale-[0.98] shadow-[0_0_24px_rgba(120,245,229,0.25)] hover:shadow-[0_0_32px_rgba(120,245,229,0.4)]"
            >
              <Zap className="w-4 h-4 text-on-primary" />
              <span>Refill Reservoir</span>
            </button>
          </div>
        </div>
      </section>

      {/* M3 Tab Navigation Bar */}
      <nav
        className="flex items-center gap-1 p-1 bg-surface-container-lowest/80 backdrop-blur-xl rounded-2xl border border-outline-variant/20 w-full sm:w-fit overflow-x-auto shadow-sm"
        role="tablist"
        aria-label="Billing navigation tabs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'plans'}
          onClick={() => setActiveTab('plans')}
          className={`min-h-[44px] px-4 py-2 rounded-xl font-label-caps text-xs tracking-wider transition flex items-center gap-2 shrink-0 ${
            activeTab === 'plans'
              ? 'bg-surface-container text-primary font-semibold shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low/50'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Plans &amp; Top-ups</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'earn'}
          onClick={() => setActiveTab('earn')}
          className={`min-h-[44px] px-4 py-2 rounded-xl font-label-caps text-xs tracking-wider transition flex items-center gap-2 shrink-0 ${
            activeTab === 'earn'
              ? 'bg-surface-container text-primary font-semibold shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low/50'
          }`}
        >
          <Gift className="w-4 h-4" />
          <span>Earn &amp; Referrals</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'leaderboard'}
          onClick={() => setActiveTab('leaderboard')}
          className={`min-h-[44px] px-4 py-2 rounded-xl font-label-caps text-xs tracking-wider transition flex items-center gap-2 shrink-0 ${
            activeTab === 'leaderboard'
              ? 'bg-surface-container text-primary font-semibold shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low/50'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>Leaderboard</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'cost'}
          onClick={() => setActiveTab('cost')}
          className={`min-h-[44px] px-4 py-2 rounded-xl font-label-caps text-xs tracking-wider transition flex items-center gap-2 shrink-0 ${
            activeTab === 'cost'
              ? 'bg-surface-container text-primary font-semibold shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low/50'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Cost Ledger</span>
        </button>
      </nav>

      {/* Tab Panels */}
      <div>
        {activeTab === 'plans' && <BillingView userId={userId} />}
        {activeTab === 'earn' && <ReferralSection userId={userId} />}
        {activeTab === 'leaderboard' && <CreditLeaderboard userId={userId} userCredits={creditVal} />}
        {activeTab === 'cost' && (
          <CreditsCostTab
            userId={userId}
            currentTokens={tokenVal}
            currentCredits={creditVal}
            onBack={() => setActiveTab('plans')}
          />
        )}
      </div>
    </div>
  );
}
