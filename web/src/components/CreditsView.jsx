/* ────────────────────────────────────────────────────────────────────────────
 * CreditsView.jsx — merged ACCOUNT destination (Experience Rewrite, 08-22).
 * Balance = CreditWallet · Plans & Top-ups = BillingView · Earn Credits =
 * Referrals + Leaderboard.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import CreditWallet from './CreditWallet.jsx';
import ReferralSection from './ReferralSection.jsx';
import CreditLeaderboard from './CreditLeaderboard.jsx';
import BillingView from './BillingView.jsx';
import { Tabs } from './ui/os.jsx';

export default function CreditsView({ userId, initialTab, userCredits }) {
  const [tab, setTab] = useState(initialTab || 'balance');

  return (
    <div className="space-y-5">
      <Tabs
        tabs={[
          { key: 'balance', label: 'Balance' },
          { key: 'plans', label: 'Plans & Top-ups' },
          { key: 'earn', label: 'Earn Credits' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'balance' && <CreditWallet onGoToBilling={() => setTab('plans')} />}
      {tab === 'plans' && <BillingView userId={userId} />}
      {tab === 'earn' && (
        <div className="space-y-5">
          <ReferralSection userId={userId} />
          <CreditLeaderboard userId={userId} userCredits={userCredits} />
        </div>
      )}
    </div>
  );
}
