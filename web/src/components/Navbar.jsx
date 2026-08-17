import React from 'react';
import { Activity, ShieldCheck, Cpu, Terminal, Sparkles, SlidersHorizontal, User, LogOut } from 'lucide-react';

export default function Navbar({
  activeAgent = "Overlord Agent",
  systemHealth = "Nominal",
  isLoggedIn = false,
  isGuest = false,
  user = null,
  isAdmin = false,
  onOpenSettings = () => {},
  onOpenAuth = () => {},
  onLogout = () => {},
  allTabs = [],
  visibleSections = {},
  onToggleSection = () => {},
  activeTabs = [],
}) {
  const [showVisibilityMenu, setShowVisibilityMenu] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-white/5 px-6 py-3 mb-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        
        {/* Brand & HUD Node */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Cpu className="w-5 h-5 animate-pulse" />
            <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400 ring-4 ring-cyan-500/20" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-wider text-base bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
                HELPOTRON
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                v2.4 Core
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-400">Autonomous Canvas Agent</p>
          </div>
        </div>

        {/* Real-time Telemetry Counters */}
        <div className="hidden lg:flex items-center gap-6 text-xs font-mono">
          <div className="flex items-center gap-2 text-slate-400">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Telemetry:</span>
            <span className="text-emerald-400 font-semibold">{systemHealth}</span>
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Active Worker:</span>
            <span className="text-slate-200">{activeAgent}</span>
          </div>

          {user && (
            <div className="flex items-center gap-2 text-slate-400">
              <span className="text-cyan-400">Credits:</span>
              <span className="text-amber-300 font-bold">{user.credits?.toFixed(1) ?? '250.0'}</span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* Section Visibility Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowVisibilityMenu(!showVisibilityMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-white/10 transition cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Visibility ({activeTabs.length}/{allTabs.length})</span>
            </button>

            {showVisibilityMenu && (
              <div className="absolute right-0 mt-2 w-56 glass-panel rounded-xl p-2.5 shadow-2xl border border-cyan-500/20 z-50 text-xs">
                <div className="text-[10px] font-mono uppercase text-slate-400 px-2 py-1 border-b border-white/5 mb-1.5">
                  Toggle HUD Modules
                </div>
                <div className="space-y-1">
                  {allTabs.map((t) => (
                    <label
                      key={t.key}
                      className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-slate-200"
                    >
                      <span className="font-mono text-xs">{t.label}</span>
                      <input
                        type="checkbox"
                        checked={visibleSections[t.key] !== false}
                        onChange={() => onToggleSection(t.key)}
                        className="rounded accent-cyan-500 cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Preferences Button */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 transition cursor-pointer"
          >
            ⚙️ Preferences
          </button>

          {/* Auth Button */}
          {isLoggedIn ? (
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-lg shadow-cyan-500/20 transition cursor-pointer"
            >
              <User className="w-3.5 h-3.5" />
              Sign In
            </button>
          )}
        </div>

      </div>
    </header>
  );
}
