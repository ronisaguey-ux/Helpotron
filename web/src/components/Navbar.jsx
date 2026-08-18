import React, { useState } from 'react';
import {
  Activity,
  ShieldCheck,
  Cpu,
  Sparkles,
  SlidersHorizontal,
  User,
  LogOut,
  Bell,
  Clock,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';

export default function Navbar({
  activeAgent = "Overlord Orchestrator",
  systemHealth = "Nominal",
  isLoggedIn = false,
  isGuest = false,
  user = null,
  isAdmin = false,
  onOpenSettings = () => {},
  onOpenAuth = () => {},
  onOpenPrivacy = () => {},
  onLogout = () => {},
  allTabs = [],
  visibleSections = {},
  onToggleSection = () => {},
  activeTabs = [],
}) {
  const [showVisibilityMenu, setShowVisibilityMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);

  const notifications = [
    {
      id: 1,
      title: 'Cognitive Biases Lab Report due in 2 days',
      body: 'PSYC-240 · 3 hrs estimated study time',
      time: '2h ago',
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
    {
      id: 2,
      title: 'Active recall flashcard set ready',
      body: 'Cell Respiration · 24 Q/A pairs synthesized',
      time: '4h ago',
      icon: Sparkles,
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
    },
    {
      id: 3,
      title: 'Weekly autonomous study summary',
      body: '10.5 hrs tracked this week (+18% vs last week)',
      time: '1d ago',
      icon: TrendingUp,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      id: 4,
      title: 'French Vocab Quiz marked complete',
      body: 'FREN 101 · Rubric criteria fully validated',
      time: '2d ago',
      icon: CheckCircle2,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10',
    },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#0d1527]/80 backdrop-blur-xl border-b border-white/5 px-6 py-3.5 mb-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        
        {/* Brand Node */}
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Cpu className="w-4 h-4 animate-pulse" aria-hidden="true" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400 ring-2 ring-cyan-500/20" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold tracking-wider text-white">HELPOTRON // CORE</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                v2.4 Node
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-500">Autonomous Canvas Agent</p>
          </div>
        </div>

        {/* Real-time Telemetry Counters (Desktop) */}
        <div className="hidden lg:flex items-center gap-6 text-xs font-mono">
          <div className="flex items-center gap-2 text-slate-400">
            <Activity className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            <span>Telemetry:</span>
            <span className="text-emerald-400 font-semibold">{systemHealth}</span>
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
            <span>Active Worker:</span>
            <span className="text-slate-200">{activeAgent}</span>
          </div>

          {user && (
            <div className="flex items-center gap-2 text-slate-400">
              <span className="text-cyan-400">Credits:</span>
              <span className="text-amber-300 font-bold">{Number(user.credits ?? 10029).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Navigation Elements */}
        <div className="flex items-center gap-2.5">
          
          {/* Explicit Privacy Access Route */}
          <button
            type="button"
            onClick={onOpenPrivacy}
            aria-label="View Privacy & Compliance Policy"
            className="text-xs font-mono font-medium px-3 py-1.5 min-h-[36px] rounded-lg border border-white/5 bg-slate-950/30 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/20 focus-visible:ring-2 focus-visible:ring-cyan-400 transition cursor-pointer"
          >
            Privacy Policy
          </button>

          {/* Clean Notification Center */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowNotifMenu(!showNotifMenu); setShowVisibilityMenu(false); }}
              className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer relative"
              aria-label="Toggle user notifications"
              aria-expanded={showNotifMenu}
            >
              <Bell className="w-4 h-4" aria-hidden="true" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-cyan-400 ring-2 ring-slate-900 animate-pulse" />
            </button>
            {showNotifMenu && (
              <div className="absolute right-0 mt-2 w-80 bg-[#0d1324] border border-white/10 rounded-xl p-2.5 shadow-2xl z-50 animate-fadeIn">
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 text-[11px] font-mono font-bold text-slate-400">
                  <span>NOTIFICATIONS</span>
                  <span className="text-[10px] text-cyan-300 font-bold">4 Active</span>
                </div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto mt-2">
                  {notifications.map((n) => {
                    const Icon = n.icon;
                    return (
                      <div
                        key={n.id}
                        className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-950/40 hover:bg-white/5 transition cursor-pointer"
                      >
                        <div className={`p-1.5 rounded-lg ${n.bg} ${n.color} shrink-0 mt-0.5`}>
                          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white font-mono text-[11px] truncate">
                            {n.title}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {n.body}
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono mt-1">{n.time}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Modular HUD Section Controller */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowVisibilityMenu(!showVisibilityMenu); setShowNotifMenu(false); }}
              aria-label={`Visibility settings, ${activeTabs.length} of ${allTabs.length} modules visible`}
              aria-expanded={showVisibilityMenu}
              aria-haspopup="true"
              className="flex items-center gap-2 px-3 py-1.5 min-h-[36px] text-xs font-mono bg-slate-900 border border-white/10 rounded-lg text-slate-300 hover:text-white hover:border-cyan-500/30 focus-visible:ring-2 focus-visible:ring-cyan-400 transition cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              <span>Modules ({activeTabs.length})</span>
            </button>
            {showVisibilityMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-[#0d1324] border border-white/10 rounded-xl p-2.5 shadow-2xl z-50 animate-fadeIn">
                <div className="text-[10px] font-mono uppercase text-slate-400 px-2 py-1 border-b border-white/5 mb-1.5">
                  Toggle Workspace Modules
                </div>
                <div className="space-y-1">
                  {allTabs.map(t => (
                    <label key={t.key} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer text-slate-300 text-xs font-mono transition">
                      <span className="truncate pr-2">{t.label}</span>
                      <input
                        type="checkbox"
                        checked={visibleSections[t.key] !== false}
                        onChange={() => onToggleSection(t.key)}
                        className="rounded accent-cyan-500 cursor-pointer"
                        aria-label={`Toggle module ${t.label}`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Preferences Button */}
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Account preferences and persona settings"
            className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-slate-900 border border-white/5 text-slate-300 text-xs font-mono hover:text-white hover:border-cyan-500/30 focus-visible:ring-2 focus-visible:ring-indigo-400 transition cursor-pointer"
          >
            <span aria-hidden="true">⚙️</span>
          </button>

          {/* Auth Button */}
          {isLoggedIn ? (
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sign out of account"
              className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 focus-visible:ring-2 focus-visible:ring-rose-400 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              aria-label="Sign in or create account"
              className="min-h-[36px] flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-lg shadow-cyan-500/20 focus-visible:ring-2 focus-visible:ring-cyan-300 transition cursor-pointer"
            >
              <User className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
