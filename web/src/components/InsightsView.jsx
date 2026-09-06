import React, { useState } from "react";
import AnalyticsDashboard from "./AnalyticsDashboard.jsx";
import IntelligenceView from "./IntelligenceView.jsx";
import { BarChart3, TrendingUp, Sparkles } from "lucide-react";

export default function InsightsView({ userId, onGoTo, initialTab }) {
  const [activeTab, setActiveTab] = useState(initialTab || "overview");

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-label-caps text-[10px] text-primary uppercase tracking-widest">
              Learning Analytics &amp; Empirical Telemetry // §3.8
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-outline-variant" />
            <span className="font-code-sm text-xs text-on-surface-variant">
              Academic Telemetry
            </span>
          </div>
          <h1 className="font-headline-lg text-2xl md:text-3xl text-on-surface font-semibold tracking-tight">
            Cognitive Insights
          </h1>
          <p className="font-body-sm text-xs text-on-surface-variant mt-1 max-w-2xl">
            Empirical telemetry tracking study momentum, assignment mastery, and personalized recommendations.
          </p>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 p-1 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 overflow-x-auto">
        {[
          { key: "overview", label: "Overview & Visx Analytics", icon: BarChart3 },
          { key: "progress", label: "Academic Progress", icon: TrendingUp },
          { key: "recommendations", label: "Smart Recommendations", icon: Sparkles },
        ].map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`h-10 px-5 rounded-xl font-label-caps text-xs flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
                isActive
                  ? "bg-surface-container text-on-surface shadow-sm font-semibold"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container/40"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-outline"}`} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Panels kept mounted per 3.8.1 to preserve visx state and avoid re-fetch thrashing */}
      <div className={activeTab === "overview" ? "block" : "hidden"}>
        <AnalyticsDashboard
          userId={userId}
          onExplainWithAgent={() => onGoTo?.("agent")}
        />
      </div>

      <div className={activeTab === "progress" ? "block" : "hidden"}>
        <IntelligenceView
          userId={userId}
          onGoTo={onGoTo}
          panel="progress"
        />
      </div>

      <div className={activeTab === "recommendations" ? "block" : "hidden"}>
        <IntelligenceView
          userId={userId}
          onGoTo={onGoTo}
          panel="recommendations"
        />
      </div>
    </div>
  );
}
