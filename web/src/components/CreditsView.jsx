/* ────────────────────────────────────────────────────────────────────────────
 * CreditsView.jsx — merged ACCOUNT destination (Experience Rewrite, 08-22).
 * The balance is always visible in the top bar, so the dedicated Balance tab
 * was removed (operator 08-28): Plans & Top-ups = BillingView · Earn Credits =
 * Referrals + Leaderboard.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import ReferralSection from './ReferralSection.jsx';
import CreditLeaderboard from './CreditLeaderboard.jsx';
import BillingView from './BillingView.jsx';
import { Tabs } from './ui/os.jsx';

export default function CreditsView({ userId, initialTab, userCredits }) {
  const [tab, setTab] = useState(initialTab && initialTab !== 'balance' ? initialTab : 'plans');

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto p-2 sm:p-4">
      {/* Page Header */}
      <div>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-background mb-1">
          Wallet &amp; Top-up
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Manage your study credits, review transaction history, and securely top up your balance.
        </p>
      </div>

      <div className="bg-surface-container-low p-1 rounded-2xl border border-outline-variant/30 flex max-w-fit gap-1" role="tablist" aria-label="Credits navigation">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'plans'}
          onClick={() => setTab('plans')}
          className={`px-4 py-2 rounded-xl font-label-caps text-xs uppercase tracking-wider transition ${
            tab === 'plans'
              ? 'bg-surface-container-lowest text-primary shadow-sm font-semibold'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Plans &amp; Top-ups
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'earn'}
          onClick={() => setTab('earn')}
          className={`px-4 py-2 rounded-xl font-label-caps text-xs uppercase tracking-wider transition ${
            tab === 'earn'
              ? 'bg-surface-container-lowest text-primary shadow-sm font-semibold'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Earn Credits
        </button>
      </div>
      {tab === 'plans' && <BillingView userId={userId} />}
      {tab === 'earn' && (
        <div className="space-y-6">
          <ReferralSection userId={userId} />
          <CreditLeaderboard userId={userId} userCredits={userCredits} />
        </div>
      )}
    </div>
  );
}
