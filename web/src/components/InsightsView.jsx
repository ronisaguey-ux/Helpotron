/* ────────────────────────────────────────────────────────────────────────────
 * InsightsView.jsx — merged INTELLIGENCE destination (Experience Rewrite, 08-22).
 * Overview = AnalyticsDashboard; Academic Progress / Recommendations /
 * Cost Intelligence = the IntelligenceView panels, embedded without their
 * own tab bar.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import AnalyticsDashboard from './AnalyticsDashboard.jsx';
import IntelligenceView from './IntelligenceView.jsx';
import { Tabs } from './ui/os.jsx';

export default function InsightsView({ userId, onGoTo, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'overview');

  return (
    <div className="space-y-5">
      <Tabs
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'progress', label: 'Academic Progress' },
          { key: 'recommendations', label: 'Recommendations' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'overview'
        ? <AnalyticsDashboard userId={userId} onExplainWithAgent={() => onGoTo('agent')} />
        : <IntelligenceView userId={userId} onGoTo={onGoTo} initialTab={tab} embedded onApplyRecommendation={(r) => onGoTo(r.target)} />}
    </div>
  );
}
