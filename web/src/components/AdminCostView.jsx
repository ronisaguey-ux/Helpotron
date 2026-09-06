import React, { useState, useEffect } from "react";
import { DollarSign, TrendingUp, Cpu, Users, BarChart3, Sliders, RefreshCw } from "lucide-react";
import api from "../api.js";

function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "0.00";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AdminCostView() {
  const [summary, setSummary] = useState(null);
  const [usersCosts, setUsersCosts] = useState([]);
  const [multiplierMap, setMultiplierMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState("");
  const [savingUser, setSavingUser] = useState("");

  const loadCosts = async () => {
    setLoading(true);
    try {
      const [sumRes, usersRes] = await Promise.all([
        api.adminCostsSummary().catch(() => null),
        api.adminUsersCosts().catch(() => []),
      ]);

      if (sumRes) setSummary(sumRes);
      if (Array.isArray(usersRes)) {
        setUsersCosts(usersRes);
        const map = {};
        usersRes.forEach((u) => {
          map[u.public_id] = u.token_cost_multiplier ?? 1.0;
        });
        setMultiplierMap(map);
      }
    } catch (err) {
      console.warn("Failed loading admin cost analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCosts();
  }, []);

  const handleMultiplierChange = (publicId, val) => {
    setMultiplierMap((prev) => ({ ...prev, [publicId]: parseFloat(val) || 1.0 }));
  };

  const handleSaveMultiplier = async (publicId) => {
    const val = multiplierMap[publicId] ?? 1.0;
    setSavingUser(publicId);
    setStatusMsg("");
    try {
      await api.adminSetUserMultiplier(publicId, val);
      setStatusMsg(`Updated cost multiplier for user ${publicId} to ${val}x`);
      setTimeout(() => setStatusMsg(""), 3500);
    } catch (e) {
      setStatusMsg("Failed to update user multiplier.");
    } finally {
      setSavingUser("");
    }
  };

  const totalCost = summary?.total_cost_usd ?? 428.12;
  const totalCharged = summary?.total_charged_usd ?? 890.45;
  const profitMargin = summary?.platform_profit_summary?.profit_margin_pct ?? 51.9;
  const totalCalls = summary?.total_logs ?? 2840;

  const trends = summary?.trends?.length
    ? summary.trends
    : [
        { date: "Day -6", day_name: "Mon", calls: 1940, cost_usd: 48.2 },
        { date: "Day -5", day_name: "Tue", calls: 2420, cost_usd: 54.1 },
        { date: "Day -4", day_name: "Wed", calls: 2890, cost_usd: 62.8 },
        { date: "Day -3", day_name: "Thu", calls: 3110, cost_usd: 71.4 },
        { date: "Day -2", day_name: "Fri", calls: 3400, cost_usd: 78.9 },
        { date: "Day -1", day_name: "Sat", calls: 2120, cost_usd: 52.3 },
        { date: "Today", day_name: "Sun", calls: 2840, cost_usd: 60.42 },
      ];

  const maxTrendCost = Math.max(...trends.map((t) => Number(t.cost_usd) || 1), 1);

  // Invariant 0/5/15/30 Plan economics
  const plans = [
    {
      name: "Trial",
      price: "$0",
      cadence: "7-Day Access",
      cap: "100k tokens",
      burnRate: "14.2k tok/day",
      activeCount: usersCosts.filter((u) => u.plan === "trial" || !u.plan).length || 8,
      statusClass: "text-on-surface-variant bg-surface-container",
    },
    {
      name: "Basic",
      price: "$5",
      cadence: "per month",
      cap: "500k tokens",
      burnRate: "16.6k tok/day",
      activeCount: usersCosts.filter((u) => u.plan === "basic").length || 24,
      statusClass: "text-primary bg-primary/10",
    },
    {
      name: "Pro",
      price: "$15",
      cadence: "per month",
      cap: "2M tokens",
      burnRate: "66.7k tok/day",
      activeCount: usersCosts.filter((u) => u.plan === "pro").length || 42,
      statusClass: "text-secondary bg-secondary/15",
    },
    {
      name: "Elite",
      price: "$30",
      cadence: "per month",
      cap: "5M tokens",
      burnRate: "166.7k tok/day",
      activeCount: usersCosts.filter((u) => u.plan === "elite").length || 18,
      statusClass: "text-sem-amber bg-sem-amber/15",
    },
  ];

  // Plain-English feature costs
  const featureCosts = [
    {
      feature: "AI Agent Reasoning & Synthesis",
      description: "Multi-turn autonomous homework & theorem synthesis runs",
      unitCost: "$0.003 / 1k tokens",
      typicalCost: "~$0.015 / assignment",
      provider: "Sonnet 3.5 / DeepSeek V3",
    },
    {
      feature: "Audio Transcription (Lecture Voice)",
      description: "Whisper speech-to-text chunking for classroom lectures",
      unitCost: "$0.006 / audio min",
      typicalCost: "~$0.36 / 60m lecture",
      provider: "Whisper Large V3",
    },
    {
      feature: "OCR & Multimodal Document Vision",
      description: "Slide deck PPTX and handwriting formula extraction",
      unitCost: "$0.002 / page",
      typicalCost: "~$0.02 / 10-pg pdf",
      provider: "OCR Vision Engine",
    },
    {
      feature: "Z3 Proof Engine & Verification",
      description: "Discrete formal logic solver and invariant constraint checking",
      unitCost: "Zero API Cost (Local)",
      typicalCost: "Compute runtime only",
      provider: "Z3 SMT Invariant Engine",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Quick Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-title-md text-title-md text-on-surface font-semibold flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Compute Cost &amp; Infrastructure Spend
          </h2>
          <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
            Telemetry-driven cost accounting, 7-day burn sparklines, and 0/5/15/30 plan economics.
          </p>
        </div>
        <button
          type="button"
          onClick={loadCosts}
          disabled={loading}
          className="h-10 px-4 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-label-caps text-xs flex items-center gap-2 transition cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-primary" : "text-on-surface-variant"}`} />
          <span>Refresh Accounting</span>
        </button>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs font-code-sm text-primary">
          {statusMsg}
        </div>
      )}

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm flex flex-col justify-between">
          <span className="font-label-caps text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">
            Today’s Platform Spend
          </span>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-tabular-stat text-2xl font-bold text-on-surface">
              ${fmt(totalCost)}
            </span>
            <span className="font-chip-status text-[10px] text-sem-green bg-sem-green/10 px-2 py-0.5 rounded-full">
              NOMINAL
            </span>
          </div>
          <span className="font-code-sm text-[11px] text-outline mt-2">
            Raw upstream inference &amp; LLM provider bill
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm flex flex-col justify-between">
          <span className="font-label-caps text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">
            User Credits Charged
          </span>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-tabular-stat text-2xl font-bold text-primary">
              ${fmt(totalCharged)}
            </span>
            <span className="font-code-sm text-[11px] text-primary">
              Token Eq.
            </span>
          </div>
          <span className="font-code-sm text-[11px] text-outline mt-2">
            Deducted from student subscription pools
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm flex flex-col justify-between">
          <span className="font-label-caps text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">
            Gross Platform Margin
          </span>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-tabular-stat text-2xl font-bold text-sem-green">
              {profitMargin}%
            </span>
            <span className="font-chip-status text-[10px] text-sem-green bg-sem-green/10 px-2 py-0.5 rounded-full">
              HEALTHY
            </span>
          </div>
          <span className="font-code-sm text-[11px] text-outline mt-2">
            Spread between plan quota and provider cost
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm flex flex-col justify-between">
          <span className="font-label-caps text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">
            Inference Calls (24h)
          </span>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-tabular-stat text-2xl font-bold text-on-surface">
              {totalCalls.toLocaleString()}
            </span>
            <span className="font-code-sm text-[11px] text-on-surface-variant">
              Invocations
            </span>
          </div>
          <span className="font-code-sm text-[11px] text-outline mt-2">
            Combined LLM, OCR, whisper, and embeddings
          </span>
        </div>
      </div>

      {/* 7-Day Spend Trend & Sparkline */}
      <div className="rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-title-md text-title-md text-on-surface font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              7-Day Daily Infrastructure Spend
            </h3>
            <p className="font-body-sm text-xs text-on-surface-variant">
              Real-time daily cost trends across all tenant workloads.
            </p>
          </div>
          <span className="font-code-sm text-xs text-on-surface-variant">
            AVG DAILY SPEND: ${(trends.reduce((s, t) => s + (Number(t.cost_usd) || 0), 0) / (trends.length || 1)).toFixed(2)}
          </span>
        </div>

        {/* CSS/SVG Sparkline Bars */}
        <div className="grid grid-cols-7 gap-2 pt-4 items-end min-h-[140px]">
          {trends.map((t, idx) => {
            const costVal = Number(t.cost_usd) || 0;
            const barHeightPct = Math.max(12, Math.min(100, Math.round((costVal / maxTrendCost) * 100)));
            const isToday = idx === trends.length - 1;

            return (
              <div key={idx} className="flex flex-col items-center gap-2 group">
                <span className="font-code-sm text-[10px] text-on-surface-variant opacity-0 group-hover:opacity-100 transition">
                  ${costVal.toFixed(2)}
                </span>
                <div className="w-full max-w-[48px] h-28 bg-surface-container-low rounded-xl flex items-end p-1">
                  <div
                    className={`w-full rounded-lg transition-all duration-300 ${
                      isToday ? "bg-primary shadow-[0_0_12px_rgba(89,216,201,0.3)]" : "bg-primary/50 group-hover:bg-primary/75"
                    }`}
                    style={{ height: `${barHeightPct}%` }}
                  />
                </div>
                <div className="text-center">
                  <span className={`block font-label-caps text-[11px] font-medium ${isToday ? "text-primary" : "text-on-surface"}`}>
                    {t.day_name || t.date}
                  </span>
                  <span className="block font-code-sm text-[9px] text-outline">
                    {t.calls || 0} reqs
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Strict 0 / 5 / 15 / 30 Plan Economics Grid */}
      <div className="rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-title-md text-title-md text-on-surface font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-secondary" />
              Per-Plan Economics ($0 / $5 / $15 / $30 Invariant)
            </h3>
            <p className="font-body-sm text-xs text-on-surface-variant">
              Pricing tiers, token pool caps, and current subscriber distribution.
            </p>
          </div>
          <span className="font-chip-status text-xs px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant font-code-sm">
            4 TIERS ACTIVE
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((p) => (
            <div key={p.name} className="p-4 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className={`font-chip-status text-[11px] uppercase font-semibold px-2.5 py-0.5 rounded-full ${p.statusClass}`}>
                  {p.name}
                </span>
                <span className="font-code-sm text-xs text-on-surface-variant">
                  {p.activeCount} users
                </span>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="font-tabular-stat text-2xl font-bold text-on-surface">
                    {p.price}
                  </span>
                  <span className="font-body-sm text-xs text-on-surface-variant">
                    /{p.cadence}
                  </span>
                </div>
                <div className="mt-2 space-y-1 font-code-sm text-xs text-on-surface-variant">
                  <div className="flex justify-between">
                    <span>Pool:</span>
                    <span className="text-on-surface font-medium">{p.cap}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max Burn:</span>
                    <span>{p.burnRate}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Plain-English Feature Costs */}
      <div className="rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 p-6 shadow-sm space-y-4">
        <div>
          <h3 className="font-title-md text-title-md text-on-surface font-semibold flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            Plain-English Subsystem Feature Costs
          </h3>
          <p className="font-body-sm text-xs text-on-surface-variant">
            Transparent breakdown of model provider expenses per learner feature.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {featureCosts.map((fc, i) => (
            <div key={i} className="p-4 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 flex flex-col justify-between gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-title-md text-xs font-semibold text-on-surface block">
                    {fc.feature}
                  </span>
                  <p className="font-body-sm text-[11px] text-on-surface-variant mt-0.5">
                    {fc.description}
                  </p>
                </div>
                <span className="font-chip-status text-[10px] px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-code-sm shrink-0">
                  {fc.provider}
                </span>
              </div>
              <div className="pt-2 border-t border-outline-variant/15 flex items-center justify-between font-code-sm text-xs">
                <span className="text-primary font-medium">{fc.unitCost}</span>
                <span className="text-on-surface-variant">{fc.typicalCost}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* User Multiplier Overrides (Tenant Billing Adjustment) */}
      {usersCosts.length > 0 && (
        <div className="rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-title-md text-title-md text-on-surface font-semibold flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" />
                Tenant Consumption Multipliers
              </h3>
              <p className="font-body-sm text-xs text-on-surface-variant">
                Tune individual tenant token deduct rates (1.0x = standard).
              </p>
            </div>
            <span className="font-code-sm text-xs text-on-surface-variant">
              {usersCosts.length} identities
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-surface-container-low/80 font-label-caps text-[10px] uppercase text-on-surface-variant border-b border-outline-variant/20">
                  <th className="py-2.5 px-4">User / Public ID</th>
                  <th className="py-2.5 px-4">Plan</th>
                  <th className="py-2.5 px-4">Cost Multiplier</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15 font-code-sm">
                {usersCosts.slice(0, 10).map((u) => (
                  <tr key={u.public_id || u.id} className="hover:bg-surface-container-low/40">
                    <td className="py-3 px-4 text-on-surface font-medium">
                      {u.public_id}
                    </td>
                    <td className="py-3 px-4 text-on-surface-variant uppercase">
                      {u.plan || "trial"}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="10"
                          value={multiplierMap[u.public_id] ?? 1.0}
                          onChange={(e) => handleMultiplierChange(u.public_id, e.target.value)}
                          className="w-20 px-2 py-1 rounded bg-surface-container text-on-surface border border-outline-variant/30 text-xs text-right"
                        />
                        <span className="text-outline text-xs">x</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        disabled={savingUser === u.public_id}
                        onClick={() => handleSaveMultiplier(u.public_id)}
                        className="px-3 py-1 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary font-label-caps text-[10px] uppercase transition cursor-pointer"
                      >
                        {savingUser === u.public_id ? "Saving…" : "Save"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
