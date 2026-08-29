// Dynamic Actionable Insights & Recommendations Engine
import React, { useState } from 'react';
import { TrendingUp, AlertTriangle, Lightbulb, DollarSign, ArrowRight, HelpCircle } from 'lucide-react';

export const IntelligenceView = ({ user, onApplyRecommendation, onExplainTrend }) => {
  const [explainedId, setExplainedId] = useState(null);
  const RECOMMENDATIONS = [
    {
      id: 'rec_1',
      title: 'Reschedule Biology Review Session',
      reason: 'You missed 2 consecutive Biology review sessions on Thursday mornings.',
      impact: '+12% expected quiz performance',
      urgency: 'HIGH',
      confidence: '94%',
      action_label: 'Move review to Tuesday 7:00 PM',
      action_payload: { type: 'reschedule_study', subject: 'Biology', new_time: 'Tuesday 19:00' }
    }
  ];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h2 className="text-2xl font-bold">Academic Insights & Intelligence</h2>
          <p className="text-sm text-[var(--text-muted)]">Dynamic performance telemetry, actionable recommendations, and cost guardrails.</p>
        </div>
      </div>

      {/* Actionable Recommendations Stream */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Smart Recommendations</h2>
        {RECOMMENDATIONS.map((rec) => (
          <div key={rec.id} className="clean-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{rec.title}</span>
                <span className="aurora-chip">{rec.confidence} Confidence</span>
              </div>
              <p className="text-xs text-[var(--text-muted)]">{rec.reason}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExplainedId(explainedId === rec.id ? null : rec.id)}
                className="text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] hover:bg-[var(--color-surface-raised)] flex items-center gap-1 transition cursor-pointer"
              >
                <HelpCircle className="h-3.5 w-3.5" /> Explain
              </button>
              <button
                onClick={() => onApplyRecommendation(rec.action_payload)}
                className="text-xs px-4 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold flex items-center gap-1 transition cursor-pointer"
              >
                {rec.action_label} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            {explainedId === rec.id && (
              <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] space-y-1">
                <p>{rec.reason}</p>
                <p className="text-[var(--text-muted)]">Expected impact: {rec.impact} · Confidence {rec.confidence}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
export default IntelligenceView;
