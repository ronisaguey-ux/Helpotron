// Dynamic Actionable Insights & Recommendations Engine
import React from 'react';
import { TrendingUp, AlertTriangle, Lightbulb, DollarSign, ArrowRight, HelpCircle } from 'lucide-react';

export const IntelligenceView = ({ user, onApplyRecommendation, onExplainTrend }) => {
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
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Academic Insights & Intelligence</h1>
          <p className="text-sm text-muted-foreground">Dynamic performance telemetry, actionable recommendations, and cost guardrails.</p>
        </div>
      </div>

      {/* Actionable Recommendations Stream */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Smart Recommendations</h2>
        {RECOMMENDATIONS.map((rec) => (
          <div key={rec.id} className="p-4 rounded-xl border bg-card/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{rec.title}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">{rec.confidence} Confidence</span>
              </div>
              <p className="text-xs text-muted-foreground">{rec.reason}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onExplainTrend(rec.id)}
                className="text-xs px-3 py-1.5 rounded-lg border hover:bg-accent flex items-center gap-1"
              >
                <HelpCircle className="h-3.5 w-3.5" /> Explain
              </button>
              <button
                onClick={() => onApplyRecommendation(rec.action_payload)}
                className="text-xs px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 flex items-center gap-1"
              >
                {rec.action_label} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
export default IntelligenceView;
