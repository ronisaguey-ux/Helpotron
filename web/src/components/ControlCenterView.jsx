import React, { useState, useEffect, useMemo } from "react";
import {
  Users,
  CircleDollarSign,
  Cpu,
  Search,
  MoreVertical,
  ShieldAlert,
  AlertTriangle,
  UserCheck,
  UserX,
  Clock,
  KeyRound,
  Coins,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Terminal,
  Filter,
  Check,
  X,
  Send,
  Sparkles,
} from "lucide-react";
import api from "../api.js";
import AdminCostView from "./AdminCostView.jsx";
import AdminToolsView from "./AdminToolsView.jsx";

const TABS = [
  { key: "users", label: "Users & Operations", icon: Users },
  { key: "cost", label: "Cost & Usage", icon: CircleDollarSign },
  { key: "tools", label: "Engines & Tools", icon: Cpu },
];

export default function ControlCenterView({ userId = "" }) {
  const [activeTab, setActiveTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [attentionFilter, setAttentionFilter] = useState("all"); // "all" | "near-cap" | "banned" | "admin"
  const [statusFeedback, setStatusFeedback] = useState("");

  // Single Action Ellipsis Menu Modal / Dialog State
  const [activeUserMenu, setActiveUserMenu] = useState(null); // user obj
  const [actionType, setActionType] = useState(null); // "plan" | "credits" | "password" | "ban" | "delete" | null
  const [actionValue, setActionValue] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  // Developer accordion open state
  const [devAccordionOpen, setDevAccordionOpen] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.adminUsers();
      const list = Array.isArray(res?.users) ? res.users : (Array.isArray(res) ? res : []);
      setUsers(list);
    } catch (err) {
      console.warn("Failed fetching users:", err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const triggerFeedback = (msg) => {
    setStatusFeedback(msg);
    setTimeout(() => setStatusFeedback(""), 4000);
  };

  // Execute single actions
  const handleExecuteAction = async () => {
    if (!activeUserMenu) return;
    const targetId = activeUserMenu.public_id || activeUserMenu.id;
    setActionBusy(true);

    try {
      if (actionType === "plan") {
        await api.adminSetPlan(targetId, actionValue);
        triggerFeedback(`Plan updated to ${actionValue} for ${activeUserMenu.alias || targetId}`);
      } else if (actionType === "credits") {
        const amt = parseInt(actionValue, 10) || 50000;
        await api.adminAdjustCredits(targetId, amt, "Admin Control Center adjustment");
        triggerFeedback(`Added ${amt.toLocaleString()} tokens to ${activeUserMenu.alias || targetId}`);
      } else if (actionType === "password") {
        if (!actionValue || actionValue.length < 8) {
          triggerFeedback("Password must be at least 8 characters");
          setActionBusy(false);
          return;
        }
        await api.adminResetPassword(targetId, actionValue);
        triggerFeedback(`Password reset for ${activeUserMenu.alias || targetId}`);
      } else if (actionType === "tempban") {
        await api.adminTempBanUser(targetId, 24);
        triggerFeedback(`Applied 24h Ban to ${activeUserMenu.alias || targetId}`);
      } else if (actionType === "ban") {
        if (activeUserMenu.is_banned) {
          await api.adminUnbanUser(targetId);
          triggerFeedback(`Unbanned user ${activeUserMenu.alias || targetId}`);
        } else {
          await api.adminBanUser(targetId);
          triggerFeedback(`Permanently banned user ${activeUserMenu.alias || targetId}`);
        }
      } else if (actionType === "delete") {
        await api.adminDeleteUser(targetId);
        triggerFeedback(`User ${activeUserMenu.alias || targetId} deleted from database`);
      }

      await fetchUsers();
      setActiveUserMenu(null);
      setActionType(null);
      setActionValue("");
    } catch (err) {
      triggerFeedback(`Operation failed: ${err?.message || "Internal error"}`);
    } finally {
      setActionBusy(false);
    }
  };

  // Developer act-as-user
  const handleActAsUser = async (targetUser) => {
    const targetId = targetUser.public_id || targetUser.id;
    try {
      await api.adminActAsUser(targetId);
      triggerFeedback(`Switched session to act as ${targetUser.alias || targetId}. Refreshing page…`);
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err) {
      triggerFeedback("Could not assume identity: " + (err?.message || "error"));
    }
  };

  // Derived Needs Attention metrics
  const nearCapUsers = useMemo(() => {
    return users.filter((u) => {
      const bal = u.tokens ?? u.token_balance ?? 0;
      const maxPool = u.plan === "elite" ? 5000000 : u.plan === "pro" ? 2000000 : u.plan === "basic" ? 500000 : 100000;
      return bal < maxPool * 0.1; // less than 10% remaining
    });
  }, [users]);

  const bannedUsers = useMemo(() => {
    return users.filter((u) => u.is_banned || !!u.temp_ban_until);
  }, [users]);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    let list = users;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (u) =>
          (u.alias && u.alias.toLowerCase().includes(q)) ||
          (u.public_id && u.public_id.toLowerCase().includes(q)) ||
          (u.plan && u.plan.toLowerCase().includes(q))
      );
    }
    if (attentionFilter === "near-cap") {
      list = list.filter((u) => nearCapUsers.includes(u));
    } else if (attentionFilter === "banned") {
      list = list.filter((u) => bannedUsers.includes(u));
    } else if (attentionFilter === "admin") {
      list = list.filter((u) => u.is_admin);
    }
    return list;
  }, [users, searchQuery, attentionFilter, nearCapUsers, bannedUsers]);

  return (
    <div className="space-y-6">
      {/* Signature Ops Console Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-label-caps text-[10px] text-primary uppercase tracking-widest">
              Operations Console
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-outline-variant" />
            <span className="font-code-sm text-xs text-on-surface-variant">
              Real-time Fleet Control
            </span>
          </div>
          <h1 className="font-headline-lg text-2xl md:text-3xl text-on-surface font-semibold tracking-tight">
            Control Center
          </h1>
          <p className="font-body-sm text-xs text-on-surface-variant mt-1 max-w-2xl">
            Who needs help? What’s broken? What am I spending? Live tenant management and instrumentation.
          </p>
        </div>

        {/* Status Pill & Live Indicator */}
        <div className="flex items-center gap-3">
          <div className="h-10 px-4 rounded-xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 flex items-center gap-2 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sem-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-sem-green" />
            </span>
            <span className="font-code-sm text-xs text-sem-green font-medium uppercase">
              SYSTEM HEALTHY · {users.length} IDENTITIES
            </span>
          </div>
          <button
            type="button"
            onClick={fetchUsers}
            disabled={loading}
            className="h-10 px-3.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/30 transition cursor-pointer"
            title="Refresh all data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-primary" : "text-on-surface-variant"}`} />
          </button>
        </div>
      </div>

      {statusFeedback && (
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs font-code-sm text-primary flex items-center justify-between">
          <span>{statusFeedback}</span>
          <button type="button" onClick={() => setStatusFeedback("")} className="text-outline hover:text-on-surface">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Primary Ops Tabs Bar */}
      <div className="flex items-center gap-2 p-1 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30">
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`h-10 px-5 rounded-xl font-label-caps text-xs flex items-center gap-2 transition cursor-pointer ${
                isActive
                  ? "bg-surface-container text-on-surface shadow-sm font-semibold"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container/40"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-outline"}`} />
              <span>{label}</span>
              {key === "users" && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-code-sm">
                  {users.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: USERS & OPERATIONS */}
      {activeTab === "users" && (
        <div className="space-y-6">
          {/* "Needs Attention" Strip */}
          <div className="p-4 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-sem-amber animate-pulse" />
                <h3 className="font-title-md text-xs font-semibold uppercase tracking-wider text-on-surface">
                  Active Incident &amp; Attention Strip
                </h3>
              </div>
              <span className="font-code-sm text-[11px] text-on-surface-variant">
                Triage Filters
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAttentionFilter("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-code-sm transition cursor-pointer ${
                  attentionFilter === "all"
                    ? "bg-primary text-on-primary font-medium"
                    : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"
                }`}
              >
                All Users ({users.length})
              </button>
              <button
                type="button"
                onClick={() => setAttentionFilter("near-cap")}
                className={`px-3 py-1.5 rounded-xl text-xs font-code-sm transition cursor-pointer flex items-center gap-1.5 ${
                  attentionFilter === "near-cap"
                    ? "bg-sem-amber text-on-surface font-medium"
                    : "bg-surface-container-low text-sem-amber hover:bg-surface-container"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-sem-amber" />
                Near Token Cap ({nearCapUsers.length})
              </button>
              <button
                type="button"
                onClick={() => setAttentionFilter("banned")}
                className={`px-3 py-1.5 rounded-xl text-xs font-code-sm transition cursor-pointer flex items-center gap-1.5 ${
                  attentionFilter === "banned"
                    ? "bg-error text-on-primary font-medium"
                    : "bg-surface-container-low text-error hover:bg-surface-container"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-error" />
                Banned / Suspended ({bannedUsers.length})
              </button>
              <button
                type="button"
                onClick={() => setAttentionFilter("admin")}
                className={`px-3 py-1.5 rounded-xl text-xs font-code-sm transition cursor-pointer flex items-center gap-1.5 ${
                  attentionFilter === "admin"
                    ? "bg-secondary text-on-secondary font-medium"
                    : "bg-surface-container-low text-secondary hover:bg-surface-container"
                }`}
              >
                Operators ({users.filter((u) => u.is_admin).length})
              </button>
            </div>
          </div>

          {/* User Directory Table Area */}
          <div className="rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm overflow-hidden">
            {/* Table Header Controls */}
            <div className="p-4 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/20 bg-surface-container-lowest/40">
              <div>
                <h3 className="font-title-md text-sm font-semibold text-on-surface">
                  Active User Directory &amp; Consumption Quotas
                </h3>
                <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
                  Identity tracking, real-time token pool consumption, and credential orchestration.
                </p>
              </div>

              {/* Search input */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-outline absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search alias, ID, or plan…"
                  className="w-full h-10 pl-9 pr-4 rounded-xl bg-surface-container-low text-on-surface placeholder:text-outline border border-outline-variant/30 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Matrix View */}
            {loading ? (
              <div className="p-12 text-center text-xs font-code-sm text-on-surface-variant">
                Loading user directory…
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-xs font-code-sm text-on-surface-variant">
                No matching identities found.
              </div>
            ) : (
              <>
                {/* Desktop Table (Hidden on small screens) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low/60 text-on-surface-variant font-label-caps text-[10px] uppercase tracking-wider border-b border-outline-variant/20">
                        <th className="py-3 px-6">User / Identifier</th>
                        <th className="py-3 px-4">Plan Tier</th>
                        <th className="py-3 px-4">Token Pool Utilization</th>
                        <th className="py-3 px-4">Last Activity</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/15 font-code-sm">
                      {filteredUsers.map((u) => {
                        const targetId = u.public_id || u.id;
                        const plan = (u.plan || "trial").toLowerCase();
                        const maxPool = plan === "elite" ? 5000000 : plan === "pro" ? 2000000 : plan === "basic" ? 500000 : 100000;
                        const tokens = Number(u.tokens ?? u.token_balance ?? 0);
                        const pctUsed = Math.min(100, Math.max(0, Math.round(((maxPool - tokens) / maxPool) * 100)));
                        const isBanned = u.is_banned || !!u.temp_ban_until;

                        return (
                          <tr key={targetId} className="hover:bg-surface-container-low/40 transition">
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-surface-container-high flex items-center justify-center font-semibold text-primary text-xs">
                                  {(u.alias || targetId).slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <span className="font-title-md text-xs font-semibold text-on-surface block">
                                    {u.alias || "Anonymous Student"}
                                  </span>
                                  <span className="font-code-sm text-[11px] text-outline mt-0.5 block">
                                    {targetId} {u.is_admin ? "(Admin)" : ""}
                                  </span>
                                </div>
                              </div>
                            </td>

                            <td className="py-4 px-4">
                              <span
                                className={`font-chip-status text-[10px] uppercase font-semibold px-2.5 py-0.5 rounded-full ${
                                  plan === "elite"
                                    ? "bg-sem-amber/15 text-sem-amber"
                                    : plan === "pro"
                                    ? "bg-secondary/15 text-secondary"
                                    : plan === "basic"
                                    ? "bg-primary/15 text-primary"
                                    : "bg-surface-container text-on-surface-variant"
                                }`}
                              >
                                {plan}
                              </span>
                            </td>

                            <td className="py-4 px-4 w-64">
                              <div className="space-y-1">
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-on-surface">{tokens.toLocaleString()} rem</span>
                                  <span className={pctUsed > 85 ? "text-sem-amber" : "text-outline"}>{pctUsed}% used</span>
                                </div>
                                <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      pctUsed > 85 ? "bg-sem-amber" : "bg-primary"
                                    }`}
                                    style={{ width: `${pctUsed}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            <td className="py-4 px-4 text-on-surface-variant text-[11px]">
                              {u.last_active ? new Date(u.last_active).toLocaleString() : "Active session"}
                            </td>

                            <td className="py-4 px-4">
                              {isBanned ? (
                                <span className="font-chip-status text-[10px] uppercase px-2 py-0.5 rounded-full bg-error/15 text-error inline-flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-error" />
                                  Banned
                                </span>
                              ) : (
                                <span className="font-chip-status text-[10px] uppercase px-2 py-0.5 rounded-full bg-sem-green/15 text-sem-green inline-flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-sem-green" />
                                  Active
                                </span>
                              )}
                            </td>

                            <td className="py-4 px-6 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveUserMenu(u);
                                  setActionType(null);
                                }}
                                className="h-9 w-9 rounded-xl hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition cursor-pointer ml-auto"
                                title="Manage identity"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Single-Column User Cards (88px surface per spec) */}
                <div className="block md:hidden divide-y divide-outline-variant/15">
                  {filteredUsers.map((u) => {
                    const targetId = u.public_id || u.id;
                    const plan = (u.plan || "trial").toLowerCase();
                    const isBanned = u.is_banned || !!u.temp_ban_until;

                    return (
                      <div key={targetId} className="p-4 min-h-[88px] flex items-center justify-between gap-3 hover:bg-surface-container-low/40">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-title-md text-xs font-semibold text-on-surface truncate">
                              {u.alias || targetId}
                            </span>
                            <span className="font-chip-status text-[9px] uppercase px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-code-sm">
                              {plan}
                            </span>
                          </div>
                          <div className="font-code-sm text-[11px] text-outline mt-1 truncate">
                            ID: {targetId} · {(u.tokens ?? u.token_balance ?? 0).toLocaleString()} tok
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isBanned && (
                            <span className="font-chip-status text-[9px] uppercase px-1.5 py-0.5 rounded bg-error/15 text-error">
                              Banned
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setActiveUserMenu(u);
                              setActionType(null);
                            }}
                            className="h-9 w-9 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant cursor-pointer"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Developer Accordion: Impersonation & Testing Tools (Jargon dies per spec) */}
          <div className="rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setDevAccordionOpen(!devAccordionOpen)}
              className="w-full p-4 md:p-5 flex items-center justify-between hover:bg-surface-container-low/40 transition cursor-pointer text-left"
            >
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-outline" />
                <div>
                  <span className="font-title-md text-xs font-semibold text-on-surface block">
                    Developer &amp; Testing Diagnostics
                  </span>
                  <span className="font-body-sm text-[11px] text-on-surface-variant block">
                    Advanced diagnostics, testing tools, and tenant view verification.
                  </span>
                </div>
              </div>
              {devAccordionOpen ? <ChevronUp className="w-4 h-4 text-outline" /> : <ChevronDown className="w-4 h-4 text-outline" />}
            </button>

            {devAccordionOpen && (
              <div className="p-5 pt-0 border-t border-outline-variant/15 space-y-4 font-code-sm text-xs">
                <p className="text-on-surface-variant text-xs">
                  Select an identity to verify their view of assignments, token quotas, and personalized features:
                </p>
                <div className="flex flex-wrap gap-2">
                  {users.slice(0, 8).map((u) => (
                    <button
                      key={u.public_id || u.id}
                      type="button"
                      onClick={() => handleActAsUser(u)}
                      className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary border border-outline-variant/20 transition cursor-pointer"
                    >
                      Verify as {u.alias || u.public_id}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: COST & USAGE */}
      {activeTab === "cost" && <AdminCostView />}

      {/* TAB 3: TOOLS & ENGINES */}
      {activeTab === "tools" && <AdminToolsView />}

      {/* Single Ellipsis Action Modal */}
      {activeUserMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl bg-surface-container border border-outline-variant/40 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
              <div>
                <h3 className="font-title-md text-sm font-semibold text-on-surface">
                  Manage {activeUserMenu.alias || activeUserMenu.public_id}
                </h3>
                <span className="font-code-sm text-[11px] text-outline">
                  Public ID: {activeUserMenu.public_id || activeUserMenu.id}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveUserMenu(null);
                  setActionType(null);
                }}
                className="h-8 w-8 rounded-lg hover:bg-surface-container-high flex items-center justify-center text-outline hover:text-on-surface cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Action Selection Buttons */}
            {!actionType && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <span className="font-label-caps text-[10px] uppercase text-on-surface-variant font-semibold">
                    Standard Operations
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActionType("plan");
                      setActionValue(activeUserMenu.plan || "trial");
                    }}
                    className="w-full p-3 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface text-left text-xs font-code-sm flex items-center justify-between transition cursor-pointer"
                  >
                    <span>Change Plan Tier (0/5/15/30)</span>
                    <span className="text-outline">→</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionType("credits");
                      setActionValue("50000");
                    }}
                    className="w-full p-3 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface text-left text-xs font-code-sm flex items-center justify-between transition cursor-pointer"
                  >
                    <span>Adjust Token Balance (+Top-up)</span>
                    <span className="text-outline">→</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionType("password");
                      setActionValue("");
                    }}
                    className="w-full p-3 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface text-left text-xs font-code-sm flex items-center justify-between transition cursor-pointer"
                  >
                    <span>Reset Account Password</span>
                    <span className="text-outline">→</span>
                  </button>
                </div>

                {/* Destructive Actions Grouped in Error-Container (Spec requirement) */}
                <div className="p-3.5 rounded-xl bg-error/10 border border-error/20 space-y-2">
                  <span className="font-label-caps text-[10px] uppercase text-error font-semibold flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Destructive &amp; Moderation Operations
                  </span>
                  <div className="space-y-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActionType("tempban");
                      }}
                      className="w-full p-2.5 rounded-lg bg-surface-container hover:bg-error/20 text-error text-left text-xs font-code-sm flex items-center justify-between transition cursor-pointer"
                    >
                      <span>Ban (24h)</span>
                      <Clock className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActionType("ban");
                      }}
                      className="w-full p-2.5 rounded-lg bg-surface-container hover:bg-error/20 text-error text-left text-xs font-code-sm flex items-center justify-between transition cursor-pointer"
                    >
                      <span>{activeUserMenu.is_banned ? "Unban Account" : "Permanent Ban"}</span>
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActionType("delete");
                      }}
                      className="w-full p-2.5 rounded-lg bg-surface-container hover:bg-error/20 text-error text-left text-xs font-code-sm flex items-center justify-between transition cursor-pointer"
                    >
                      <span>Delete User Permanently</span>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Action Confirmation & Input Sub-form */}
            {actionType && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-surface-container-low text-xs font-code-sm text-on-surface">
                  Action: <strong className="text-primary uppercase">{actionType}</strong>
                </div>

                {actionType === "plan" && (
                  <div className="space-y-2">
                    <label className="font-label-caps text-[10px] uppercase text-on-surface-variant">
                      Select Pricing Plan Tier
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: "trial", label: "$0 Trial (7d)" },
                        { id: "basic", label: "$5 Basic" },
                        { id: "pro", label: "$15 Pro" },
                        { id: "elite", label: "$30 Elite" },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setActionValue(p.id)}
                          className={`p-2.5 rounded-xl border text-xs font-code-sm transition cursor-pointer ${
                            actionValue === p.id
                              ? "border-primary bg-primary/10 text-primary font-semibold"
                              : "border-outline-variant/30 bg-surface-container-low text-on-surface"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {actionType === "credits" && (
                  <div className="space-y-2">
                    <label className="font-label-caps text-[10px] uppercase text-on-surface-variant">
                      Token Credit Adjustment (e.g. +50,000)
                    </label>
                    <input
                      type="number"
                      step="1000"
                      value={actionValue}
                      onChange={(e) => setActionValue(e.target.value)}
                      placeholder="50000"
                      className="w-full h-10 px-3.5 rounded-xl bg-surface-container-low text-on-surface border border-outline-variant/30 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}

                {actionType === "password" && (
                  <div className="space-y-2">
                    <label className="font-label-caps text-[10px] uppercase text-on-surface-variant">
                      New Temporary Password (min 8 chars)
                    </label>
                    <input
                      type="text"
                      value={actionValue}
                      onChange={(e) => setActionValue(e.target.value)}
                      placeholder="Enter new password…"
                      className="w-full h-10 px-3.5 rounded-xl bg-surface-container-low text-on-surface border border-outline-variant/30 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}

                {(actionType === "tempban" || actionType === "ban" || actionType === "delete") && (
                  <div className="p-3.5 rounded-xl bg-error/15 border border-error/30 text-xs font-code-sm text-error">
                    {actionType === "tempban" && "Apply a 24-hour suspension to this identity. They will be logged out immediately."}
                    {actionType === "ban" && "Toggle permanent ban status for this account."}
                    {actionType === "delete" && "WARNING: This will permanently delete the identity and cannot be undone."}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => setActionType(null)}
                    className="h-9 px-4 rounded-xl bg-surface-container-high text-on-surface-variant font-label-caps text-xs cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={handleExecuteAction}
                    className={`h-9 px-5 rounded-xl font-label-caps text-xs uppercase flex items-center gap-1.5 cursor-pointer ${
                      actionType === "delete" || actionType === "ban" || actionType === "tempban"
                        ? "bg-error text-on-primary font-semibold"
                        : "bg-primary text-on-primary font-semibold"
                    }`}
                  >
                    {actionBusy ? "Applying…" : "Confirm & Execute"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
