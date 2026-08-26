// export target: web/src/components/AppShell.jsx
/* ────────────────────────────────────────────────────────────────────────────
 * AppShell.jsx — Helpotron OS chrome (Experience Rewrite, 08-22)
 * Topbar: brand, global search trigger, credits chip, notification bell,
 * avatar quick-settings menu. Sidebar: grouped, collapsible navigation
 * (HOME / WORKSPACE / INTELLIGENCE / ACCOUNT / ADMIN).
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion';
import api from '../api.js';
import { applyFontScale } from './SettingsApp.jsx';
import {
  Search, Settings, Bell, LogOut, GraduationCap, ChevronLeft, ChevronRight,
  ChevronDown, ShieldCheck, LayoutDashboard, Activity, Brain, FileText, BookOpen,
  BarChart3, CreditCard, Shield, Puzzle,
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
      { key: 'overview', label: 'Dashboard', Icon: LayoutDashboard },
      { key: 'activity', label: 'Activity', Icon: Activity },
      { key: 'extension', label: 'Extension', Icon: Puzzle },
    ],
  },
  {
    group: 'WORKSPACE',
    items: [
      { key: 'agent', id: 'my_agent', label: 'My Agent', Icon: Brain },
      { key: 'history', label: 'Assignments', Icon: FileText },
      { key: 'library', label: 'Library', Icon: BookOpen },
    ],
  },
  {
    group: 'INTELLIGENCE',
    items: [
      { key: 'insights', label: 'Insights', Icon: BarChart3 },
    ],
  },
  {
    group: 'ACCOUNT',
    items: [
      { key: 'credits', label: 'Credits', Icon: CreditCard },
      { key: 'settings', label: 'Settings', Icon: Settings },
    ],
  },
  ...(isAdmin
    ? [{
        group: 'ADMIN',
        items: [
          { key: 'admin', label: 'Control Center', Icon: Shield },
        ],
      }]
    : []),
];

// Unified 6-Item Navigation Shell (August 23 Simplified IA)
export const NAV_ITEMS = [
  { id: 'today', label: 'Today', icon: LayoutDashboard },
  { id: 'assignments', label: 'Assignments', icon: FileText },
  { id: 'library', label: 'Library', icon: BookOpen },
  { id: 'my_agent', label: 'My Agent', icon: Brain, isPrimaryAgent: true },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'settings', label: 'Settings', icon: Settings }
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

  const fileRef = useRef(null);
  const [phoneDraft, setPhoneDraft] = useState(settings.profile.phone || '');

  const savePhone = () => {
    const v = phoneDraft.trim();
    set('profile.phone', v);
    api.updateSettings({ profile: { ...settings.profile, phone: v } }).catch(() => {});
  };

  const pickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const r = await api.uploadAvatar(file, 'user');
      set('profile.avatarUrl', r.url);
      api.updateSettings({ profile: { ...settings.profile, avatarUrl: r.url } }).catch(() => {});
    } catch (err) {
      console.error('avatar upload failed', err);
    }
  };

  const removeAvatar = () => {
    set('profile.avatarUrl', '');
    api.updateSettings({ profile: { ...settings.profile, avatarUrl: '' } }).catch(() => {});
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

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400 shrink-0">Phone number</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <input
            value={phoneDraft}
            onChange={(e) => setPhoneDraft(e.target.value)}
            placeholder={settings.profile.phone || 'Add phone…'}
            className="w-28 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-[10px] text-slate-200 outline-none placeholder:text-slate-600"
            aria-label="Phone number"
          />
          <button
            type="button"
            onClick={savePhone}
            disabled={!phoneDraft.trim() || phoneDraft.trim() === (settings.profile.phone || '')}
            className="px-2 py-1 rounded-md text-[10px] font-medium bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 disabled:opacity-30 transition cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400 shrink-0">Profile picture</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-2 py-1 rounded-md text-[10px] font-medium bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            {settings.profile.avatarUrl ? 'Change' : 'Add'}
          </button>
          {settings.profile.avatarUrl && (
            <button
              type="button"
              onClick={removeAvatar}
              className="px-2 py-1 rounded-md text-[10px] text-rose-300/80 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer"
            >
              Remove
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={pickAvatar}
            className="hidden"
            aria-hidden
            tabIndex={-1}
          />
        </div>
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings);

  /* Font size setting (1–100) applies app-wide: scale the html root. */
  useEffect(() => {
    applyFontScale(settings.appearance?.fontScale);
  }, [settings.appearance?.fontScale]);

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
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 h-14 flex items-center gap-2 sm:gap-3">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/6 transition cursor-pointer"
            aria-label="Open mobile navigation menu"
          >
            <div className="flex flex-col gap-1 w-4">
              <span className="w-4 h-0.5 bg-current rounded-full" />
              <span className="w-4 h-0.5 bg-current rounded-full" />
              <span className="w-4 h-0.5 bg-current rounded-full" />
            </div>
          </button>

          {/* Brand */}
          <button
            type="button"
            onClick={() => onNavigate('overview')}
            className="flex items-center gap-2 cursor-pointer select-none group"
            aria-label="helpotron ACADEMIC OS"
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
            aria-label="Search anything…"
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
              aria-label={`${Number(user.credits).toLocaleString()} credits, open credit wallet`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              {Number(user?.credits ?? 0).toLocaleString()} credits
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

      {/* ── MOBILE SLIDE-OVER NAVIGATION DRAWER ─────────────────────── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm md:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 left-0 z-50 w-72 bg-[#0d1322] border-r border-white/10 p-4 flex flex-col justify-between shadow-2xl md:hidden overflow-y-auto"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/8">
                  <div className="flex items-center gap-2">
                    <AnimatedLogo size="sm" />
                    <span className="text-xs font-bold text-white tracking-wider">HELPOTRON</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5"
                    aria-label="Close menu"
                  >
                    ✕
                  </button>
                </div>

                {/* Mobile Navigation Links */}
                <div className="space-y-3">
                  {tree.map((group) => (
                    <div key={group.group} className="space-y-1">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 pt-1">
                        {group.group}
                      </div>
                      {group.items.map((item) => {
                        const selected = activeView === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => {
                              onNavigate(item.key);
                              setMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                              selected
                                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                                : 'text-slate-300 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            {item.Icon && <item.Icon className={`w-4 h-4 ${selected ? 'text-blue-400' : 'text-slate-400'}`} />}
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Mobile Drawer Footer */}
              <div className="pt-4 border-t border-white/8 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenPrivacy();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200"
                >
                  <ShieldCheck className="w-4 h-4" /> Privacy Policy
                </button>
                {isLoggedIn && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10"
                  >
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── CONTENT ROW: sidebar + main ───────────────────────────────────── */}
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 pt-4 sm:pt-6 flex gap-6 items-start">
        {/* Desktop Sidebar */}
        <aside className={`hidden md:block shrink-0 transition-all duration-300 ${sidebarOpen ? 'w-60' : 'w-[64px]'}`}>
          <div className={`clean-card flex flex-col gap-1 ${sidebarOpen ? 'p-3' : 'p-2'}`}>
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex items-center justify-center gap-2 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer mb-1"
              aria-label={sidebarOpen ? 'Collapse Navigation sidebar' : 'Expand Navigation sidebar'}
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
                  <div className="flex items-center gap-2 px-2 pt-2 pb-1">
                    <span className="flex-1 h-px bg-white/6" />
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.group)}
                      aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${group.group} section`}
                      aria-expanded={!isCollapsed}
                      className={`w-5 h-5 flex items-center justify-center rounded-md text-slate-600 hover:text-slate-300 hover:bg-white/5 transition cursor-pointer ${
                        isCollapsed ? '' : 'opacity-0 hover:opacity-100'
                      }`}
                    >
                      <ChevronDown className={`w-3 h-3 transition-transform ${isCollapsed ? 'rotate-90' : ''}`} />
                    </button>
                  </div>
                  {!isCollapsed && (
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const selected = activeView === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => onNavigate(item.key)}
                            className={`relative w-full flex items-center gap-2.5 py-2 rounded-lg text-xs transition cursor-pointer ${
                              sidebarOpen ? 'px-2.5' : 'justify-center px-0'
                            } ${
                              selected
                                ? 'text-blue-300 bg-blue-600/15 border border-blue-500/25 font-medium'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                            }`}
                            aria-label={item.label}
                            aria-current={selected ? 'page' : undefined}
                          >
                            {item.Icon && <item.Icon className={`w-5 h-5 shrink-0 ${selected ? 'text-blue-400' : 'text-slate-400'}`} aria-hidden="true" />}
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
        <main id="main-content" className="flex-1 min-w-0 w-full pb-24 md:pb-12">
          {/* View header */}
          <div className="clean-card px-4 sm:px-6 py-3 sm:py-4 mb-4 sm:mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              {activeView !== 'agent' && (
                <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  {current?.logo
                    ? <img src={current.logo} alt="" className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg object-cover" />
                    : <span className="text-base sm:text-lg leading-none">{current?.icon ?? '✦'}</span>}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-semibold text-white truncate">{current?.label ?? 'Helpotron'}</h1>
                <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                  {activeView === 'overview' && 'Your personal academic command center'}
                  {activeView === 'activity' && 'Every event, in one timeline'}
                  {activeView === 'history' && 'All your assignments, in one place'}
                  {activeView === 'study' && 'Guides, flashcards, practice tests and summaries'}
                  {activeView === 'library' && 'Files, saved materials and your calendar'}
                  {activeView === 'insights' && 'Analytics, progress and recommendations'}
                  {activeView === 'credits' && 'Balance, plans, top-ups and earnings — free beta, payments not available yet'}
                  {activeView === 'settings' && 'Your complete configuration workspace'}
                  {activeView === 'admin' && 'Helpotron Control Center'}
                </p>
              </div>
            </div>
            {activeView === 'overview' && (
              <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/4 border border-white/8 text-[10px] text-slate-500">
                <GraduationCap className="w-3.5 h-3.5" /> Capture → Understand → Execute → Improve
              </span>
            )}
          </div>

          {/* Page body */}
          <div className="space-y-4 sm:space-y-5">
            {React.Children.count(children) ? children : null}
          </div>
        </main>
      </div>

      {/* ── MOBILE STICKY BOTTOM NAVIGATION BAR ────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#090d16]/95 border-t border-white/10 backdrop-blur-xl px-2 py-1.5 flex items-center justify-around"
        aria-label="Mobile Bottom Navigation"
      >
        <button
          type="button"
          onClick={() => onNavigate('overview')}
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition ${
            activeView === 'overview' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px]">Dashboard</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('agent')}
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition ${
            activeView === 'agent' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Brain className="w-5 h-5" />
          <span className="text-[10px]">My Agent</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('history')}
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition ${
            activeView === 'history' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-5 h-5" />
          <span className="text-[10px]">Tasks</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('insights')}
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition ${
            activeView === 'insights' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px]">Insights</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center gap-1 px-3 py-1 rounded-xl text-slate-400 hover:text-slate-200 transition"
          aria-label="Open full menu"
        >
          <div className="flex flex-col gap-0.5 items-center justify-center w-5 h-5">
            <span className="w-3.5 h-0.5 bg-current rounded-full" />
            <span className="w-3.5 h-0.5 bg-current rounded-full" />
            <span className="w-3.5 h-0.5 bg-current rounded-full" />
          </div>
          <span className="text-[10px]">More</span>
        </button>
      </nav>
    </>
  );
}

