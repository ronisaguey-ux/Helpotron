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
    <div className="space-y-6">
      <div className="segmented max-w-fit" role="tablist" aria-label="Credits navigation">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'plans'}
          onClick={() => setTab('plans')}
          className="seg-item"
        >
          Plans &amp; Top-ups
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'earn'}
          onClick={() => setTab('earn')}
          className="seg-item"
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
