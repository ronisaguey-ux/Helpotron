/* ────────────────────────────────────────────────────────────────────────────
 * InsightsView.jsx — merged INTELLIGENCE destination (Experience Rewrite, 08-22).
 * Overview = AnalyticsDashboard; Academic Progress / Recommendations =
 * IntelligenceView panels, selected via `panel` (08-29: previous wiring passed
 * initialTab/embedded/onApplyRecommendation that IntelligenceView ignored — the
 * two tabs rendered identical content, i.e. zombie buttons).
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import AnalyticsDashboard from './AnalyticsDashboard.jsx';
import IntelligenceView from './IntelligenceView.jsx';
import { Tabs } from './ui/os.jsx';

export default function InsightsView({ userId, onGoTo, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'overview');

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto p-2 sm:p-4">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div>
          <h2 className="font-display-xl text-display-xl text-on-background mb-1">
            Cognitive Insights
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
            A serene overview of your learning momentum, task completion, and study analytics.
          </p>
        </div>
      </div>

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
        : <IntelligenceView userId={userId} onGoTo={onGoTo} panel={tab} />}
    </div>
  );
}
