/* ────────────────────────────────────────────────────────────────────────────
 * AppShell.jsx — Helpotron OS chrome (Experience Rewrite, 08-22)
 * Topbar: brand, global search trigger, credits chip, notification bell,
 * avatar quick-settings menu. Sidebar: grouped, collapsible navigation
 * (HOME / WORKSPACE / INTELLIGENCE / ACCOUNT / ADMIN).
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion';
import {
  Search, Settings, Bell, LogOut, GraduationCap, ChevronLeft, ChevronRight,
  ChevronDown, ShieldCheck,
} from 'lucide-react';
import { NOTIFICATIONS, loadSettings, saveSettings, EFFORT_SCORES } from '../demoData.js';
import DemoModeToggle from './DemoModeToggle.jsx';
import { Kbd, Badge, timeAgo } from './ui/os.jsx';
import Button from './Button.jsx';
import { AnimatedLogo } from './ui/AnimatedLogo.jsx';

const EFFORT_LABELS = { low: 'Low', balanced: 'Balanced', high: 'High' };

/* ── Navigation tree ─────────────────────────────────────────────────────── */
const NAV_TREE = (isAdmin) => [
  {
    group: 'HOME',
    items: [
      { key: 'overview', label: 'Dashboard', icon: '🏠' },
      { key: 'activity', label: 'Activity', icon: '⚡' },
    ],
  },
  {
    group: 'WORKSPACE',
    items: [
      { key: 'agent', label: 'My Agent', icon: '🧠' },
      { key: 'history', label: 'Assignments', icon: '📝' },
      { key: 'study', label: 'Study Tools', icon: '🎯' },
      { key: 'library', label: 'Library', icon: '🗂️' },
    ],
  },
  {
    group: 'INTELLIGENCE',
    items: [
      { key: 'insights', label: 'Insights', icon: '📊' },
    ],
  },
  {
    group: 'ACCOUNT',
    items: [
      { key: 'credits', label: 'Credits', icon: '💳' },
      { key: 'settings', label: 'Settings', icon: '⚙' },
    ],
  },
  ...(isAdmin
    ? [{
        group: 'ADMIN',
        items: [
          { key: 'admin', label: 'Control Center', icon: '🛡️' },
        ],
      }]
    : []),
];

/* ── Quick settings (avatar menu) ─────────────────────────────────────────── */
function QuickSettings({ settings, onChange, onOpenFull, user }) {
  const set = (path, value) => {
    const next = JSON.parse(JSON.stringify(settings));
    const keys = path.split('.');
    let obj = next;
    while (keys.length > 1) {
      obj = obj[keys.shift()];
    }
    obj[keys[0]] = value;
    onChange(next);
  };

  return (
    <div className="w-64 p-4 space-y-3">
      <div className="flex items-center gap-3 pb-3 border-b border-white/8">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-sm font-bold text-white overflow-hidden">
          {settings.profile.avatarUrl
            ? <img src={settings.profile.avatarUrl} alt="" className="w-full h-full object-cover" />
            : (settings.profile.displayName?.[0] || 'R')}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-white truncate">{settings.profile.displayName || user.public_id}</div>
          <div className="text-[10px] text-slate-500">{user.public_id}</div>
        </div>
        <span className="ml-auto text-[10px] font-mono text-blue-300">{Number(user.credits).toLocaleString()} cr</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400">Theme</span>
        <div className="flex gap-1">
          {['dark', 'light', 'system'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set('appearance.theme', t)}
              className={`px-2 py-1 rounded-md text-[10px] capitalize transition cursor-pointer ${
                settings.appearance.theme === t ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:text-slate-200'
              }`}
            >
              {t === 'system' ? 'Auto' : t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400">AI Effort</span>
        <div className="flex gap-1">
          {Object.entries(EFFORT_LABELS).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => set('ai.effort', k)}
              className={`px-2 py-1 rounded-md text-[10px] transition cursor-pointer ${
                settings.ai.effort === k ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400">Academic level</span>
        <select
          value={settings.profile.educationLevel}
          onChange={(e) => set('profile.educationLevel', e.target.value)}
          className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-[10px] text-slate-200 outline-none cursor-pointer"
          aria-label="Academic level"
        >
          {['High School', 'Undergraduate', 'Graduate', 'Professional'].map((l) => (
            <option key={l} value={l} className="bg-slate-900">{l}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400">Notifications</span>
        <Badge color={settings.notifications?.channels?.inapp ? 'green' : 'slate'}>
          {settings.notifications?.channels?.inapp ? 'On' : 'Off'}
        </Badge>
      </div>

      <Button
        type="button"
        onClick={onOpenFull}
        variant="primary"
        size="md"
        className="w-full"
      >
        <Settings className="w-3.5 h-3.5" /> Full Settings
      </Button>
    </div>
  );
}

/* ── Notification bell dropdown ───────────────────────────────────────────── */
function NotificationBell({ onOpenAll }) {
  const [open, setOpen] = useState(false);
  const unread = NOTIFICATIONS.filter((n) => !n.read).length;
  const recent = NOTIFICATIONS.slice(0, 5);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications (${unread} unread)`}
        className="relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
      >
        <Bell className="w-4.5 h-4.5" width={18} height={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-2 w-80 clean-card p-0 overflow-hidden shadow-2xl shadow-black/50 z-50"
          >
            <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Notifications</span>
              <Badge color={unread > 0 ? 'red' : 'slate'}>{unread} unread</Badge>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {recent.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-slate-500">You’re all caught up ✦</div>
              )}
              {recent.map((n) => (
                <div key={n.id} className="flex gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/3 transition">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-slate-600' : 'bg-blue-400'}`} />
                  <div className="min-w-0">
                    <div className={`text-xs ${n.read ? 'text-slate-400' : 'text-slate-100 font-medium'}`}>{n.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{n.body}</div>
                    <div className="text-[10px] text-slate-600 mt-1">{timeAgo(n.timestamp)} · {n.channel}</div>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { setOpen(false); onOpenAll(); }}
              className="w-full py-2.5 text-center text-[11px] font-medium text-blue-300 hover:bg-white/3 transition cursor-pointer border-t border-white/8"
            >
              View all notifications →
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── AppShell ─────────────────────────────────────────────────────────────── */
export default function AppShell({
  activeView, onNavigate, isAdmin, isLoggedIn, user, onLogout,
  onOpenSearch, onOpenAuth, onOpenPrivacy, children,
  canGoBack = false, canGoForward = false, onGoBack, onGoForward,
}) {
  const [collapsed, setCollapsed] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [quickOpen, setQuickOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings);

  const persistSettings = (next) => {
    setSettings(next);
    saveSettings(next);
  };

  const tree = NAV_TREE(isAdmin);
  const flatItems = tree.flatMap((g) => g.items);
  const current = flatItems.find((i) => i.key === activeView);

  const toggleGroup = (group) => setCollapsed((c) => ({ ...c, [group]: !c[group] }));

  return (
    <>
      {/* ── TOPBAR ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#090d16]/85 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          {/* Brand */}
          <button
            type="button"
            onClick={() => onNavigate('overview')}
            className="flex items-center gap-2 cursor-pointer select-none group"
            aria-label="Helpotron home"
          >
            <AnimatedLogo
              size="md"
              className="[&>div:last-child]:hidden sm:[&>div:last-child]:block"
            />
          </button>

          <span className="w-px h-6 bg-white/8 mx-1 hidden sm:block" />

          {/* Back / forward navigation */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={onGoBack}
              disabled={!canGoBack}
              aria-label="Back"
              title="Back"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 enabled:hover:text-white enabled:hover:bg-white/6 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronLeft width={18} height={18} />
            </button>
            <button
              type="button"
              onClick={onGoForward}
              disabled={!canGoForward}
              aria-label="Forward"
              title="Forward"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 enabled:hover:text-white enabled:hover:bg-white/6 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronRight width={18} height={18} />
            </button>
          </div>

          {/* Global search trigger */}
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex-1 max-w-md flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/4 border border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15 transition cursor-pointer text-xs"
            aria-label="Global search"
          >
            <Search width={14} height={14} />
            <span className="flex-1 text-left">Search anything…</span>
            <Kbd>⌘K</Kbd>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Mock data toggle (explicit opt-in; absent key = live mode) */}
            <DemoModeToggle />

            {/* Credits chip */}
            <button
              type="button"
              onClick={() => onNavigate('credits')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-300 hover:bg-blue-500/20 transition cursor-pointer text-xs font-semibold font-mono"
              aria-label="Open credit wallet"
            >
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              {Number(user.credits ?? 10029).toLocaleString()} credits
            </button>

            {/* Notification bell */}
            <NotificationBell onOpenAll={() => onNavigate('activity')} />

            {/* Avatar / quick settings */}
            {isLoggedIn ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setQuickOpen((o) => !o)}
                  className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-sm font-bold text-white border-2 border-white/10 hover:border-blue-400/50 transition cursor-pointer"
                  aria-label="Quick settings"
                >
                  {user.public_id?.[0] || 'R'}
                </button>
                <AnimatePresence>
                  {quickOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setQuickOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 mt-2 clean-card p-0 shadow-2xl shadow-black/50 z-50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <QuickSettings
                          settings={settings}
                          onChange={persistSettings}
                          onOpenFull={() => { setQuickOpen(false); onNavigate('settings'); }}
                          user={user}
                        />
                        <div className="border-t border-white/8 p-2 space-y-0.5">
                          <button
                            type="button"
                            onClick={() => { setQuickOpen(false); onOpenPrivacy(); }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 hover:bg-white/5 transition cursor-pointer"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" /> Privacy Policy
                          </button>
                          <button
                            type="button"
                            onClick={() => { setQuickOpen(false); onLogout(); }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                          >
                            <LogOut className="w-3.5 h-3.5" /> Sign out
                          </button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── CONTENT ROW: sidebar + main ───────────────────────────────────── */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-6 flex gap-6 items-start">
        {/* Sidebar */}
        <aside className={`shrink-0 transition-all duration-300 sticky top-20 z-30 ${sidebarOpen ? 'w-60' : 'w-14'}`}>
          <div className="clean-card p-3 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex items-center justify-center gap-2 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer mb-1"
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <div className="flex flex-col gap-[3px] items-center w-4">
                <span className="w-4 h-0.5 bg-current rounded-full" />
                <span className="w-4 h-0.5 bg-current rounded-full" />
                <span className="w-4 h-0.5 bg-current rounded-full" />
              </div>
              {sidebarOpen && <span className="text-[10px] font-semibold uppercase tracking-wider">Navigation</span>}
            </button>

            {tree.map((group) => {
              const isCollapsed = collapsed[group.group];
              return (
                <div key={group.group}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.group)}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition cursor-pointer"
                    aria-expanded={!isCollapsed}
                  >
                    <span className={sidebarOpen ? '' : 'sr-only'}>{group.group}</span>
                    {sidebarOpen && <ChevronDown className={`w-3 h-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />}
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const selected = activeView === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => onNavigate(item.key)}
                            className={`relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition cursor-pointer ${
                              selected
                                ? 'text-blue-300 bg-blue-600/15 border border-blue-500/25 font-medium'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                            } ${!sidebarOpen ? 'justify-center px-1' : ''}`}
                            aria-label={item.label}
                            aria-current={selected ? 'page' : undefined}
                          >
                            <span className="text-sm leading-none shrink-0">{item.icon}</span>
                            {sidebarOpen && <span className="truncate">{item.label}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

          </div>
        </aside>

        {/* Main content */}
        <main id="main-content" className="flex-1 min-w-0 w-full">
          {/* View header */}
          <div className="clean-card px-6 py-4 mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-lg leading-none">
                {current?.icon ?? '✦'}
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-white truncate">{current?.label ?? 'Helpotron'}</h1>
                <p className="text-xs text-slate-500 truncate">
                  {activeView === 'overview' && 'Your personal academic command center'}
                  {activeView === 'activity' && 'Every event, in one timeline'}
                  {activeView === 'agent' && 'Your AI agent — chat, memory, files and effort'}
                  {activeView === 'history' && 'All your assignments, in one place'}
                  {activeView === 'study' && 'Guides, flashcards, practice tests and summaries'}
                  {activeView === 'library' && 'Files, saved materials and your calendar'}
                  {activeView === 'insights' && 'Analytics, progress and recommendations'}
                  {activeView === 'credits' && 'Balance, plans, top-ups and earnings'}
                  {activeView === 'settings' && 'Your complete configuration workspace'}
                  {activeView === 'admin' && 'Helpotron Control Center'}
                </p>
              </div>
            </div>
            {activeView === 'overview' && (
              <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/4 border border-white/8 text-[10px] text-slate-500">
                <GraduationCap className="w-3.5 h-3.5" /> Capture → Understand → Execute → Improve
              </span>
            )}
          </div>

          {/* Page body */}
          <div className="space-y-5">
            {React.Children.count(children) ? children : null}
          </div>
        </main>
      </div>
    </>
  );
}
