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
import { applyAppearance, applyAccessibility, applyFontScale } from './SettingsApp.jsx';
import { resolveScopedValue } from './ScopedSetting.jsx';
import {
  Search, Settings, Bell, LogOut, GraduationCap, ChevronLeft, ChevronRight,
  Plus, Star, ShieldCheck, LayoutDashboard, Activity, Brain, FileText, BookOpen,
  BarChart3, CreditCard, Shield, Puzzle, Inbox, Database, Gauge, X, HelpCircle,
} from 'lucide-react';
import { NOTIFICATIONS, loadSettings, saveSettings, EFFORT_SCORES } from '../demoData.js';
import { Kbd, Badge, timeAgo } from './ui/os.jsx';
import Button from './Button.jsx';
import { AnimatedLogo } from './ui/AnimatedLogo.jsx';
import DevContactModal from './DevContactModal.jsx';

const EFFORT_LABELS = { low: 'Low', balanced: 'Balanced', high: 'High' };

/* ── Navigation tree ─────────────────────────────────────────────────────── */
const NAV_TREE = (isAdmin) => [
  {
    group: 'HOME',
    items: [
      { key: 'overview', label: 'Dashboard', Icon: LayoutDashboard },
      { key: 'activity', label: 'Activity', Icon: Activity },
      { key: 'extension', label: 'Extension', Icon: Puzzle },
      { key: 'guide', label: 'Guide', Icon: HelpCircle },
    ],
  },
  {
    group: 'WORKSPACE',
    items: [
      { key: 'agent', id: 'my_agent', label: 'My Agent', Icon: Brain },
      { key: 'library', label: 'Library', Icon: BookOpen },
      { key: 'dump', label: 'Assignment Dump', Icon: Inbox },
      { key: 'datalake', label: 'Data Lake', Icon: Database },
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
          { key: 'monitors', label: 'Monitors', Icon: Gauge },
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
  const [pfpMsg, setPfpMsg] = useState(null);

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
      setPfpMsg(null);
    } catch (err) {
      console.error('avatar upload failed', err);
      // Surface the real reason (size/format) instead of failing silently.
      setPfpMsg(err.message || 'Avatar upload failed');
      setTimeout(() => setPfpMsg(null), 5000);
    }
  };

  const removeAvatar = () => {
    set('profile.avatarUrl', '');
    api.updateSettings({ profile: { ...settings.profile, avatarUrl: '' } }).catch(() => {});
  };

  return (
    <div className="w-64 p-4 space-y-3">
      <div className="flex items-center gap-3 pb-3 border-b border-white/8">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white overflow-hidden" style={{ backgroundImage: 'var(--accent-mix)' }}>
          {settings.profile.avatarUrl
            ? <img src={settings.profile.avatarUrl} alt="" className="w-full h-full object-cover" />
            : (settings.profile.displayName?.[0] || 'R')}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-white truncate">{settings.profile.displayName || user.public_id}</div>
          <div className="text-[10px] text-slate-500">{user.public_id}</div>
        </div>
        <span className="ml-auto text-[10px] font-mono text-[var(--accent-2)]">{Number(user.token_balance ?? 0).toLocaleString()} tk · {Number(user.credits).toLocaleString()} cr</span>
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
                settings.appearance.theme === t ? 'bg-[var(--accent)] text-white' : 'bg-white/5 text-slate-400 hover:text-slate-200'
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
                settings.ai.effort === k ? 'bg-[var(--accent)] text-white' : 'bg-white/5 text-slate-400 hover:text-slate-200'
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
          className="bg-white/5 border border-[var(--border-subtle)] rounded-md px-2 py-1 text-[10px] text-slate-200 outline-none cursor-pointer"
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
            className="w-28 bg-white/5 border border-[var(--border-subtle)] rounded-md px-2 py-1 text-[10px] text-slate-200 outline-none placeholder:text-slate-600"
            aria-label="Phone number"
          />
          <button
            type="button"
            onClick={savePhone}
            disabled={!phoneDraft.trim() || phoneDraft.trim() === (settings.profile.phone || '')}
            className="px-2 py-1 rounded-md text-[10px] font-medium bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.28)] text-[var(--accent)] hover:bg-[var(--accent-subtle)] hover:border-[rgba(139,92,246,0.5)] disabled:opacity-30 transition cursor-pointer"
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
      {pfpMsg && (
        <div className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2 py-1.5">
          ⚠️ {pfpMsg}
        </div>
      )}

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
  const containerRef = useRef(null);
  const unread = NOTIFICATIONS.filter((n) => !n.read).length;
  const recent = NOTIFICATIONS.slice(0, 5);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications (${unread} unread)`}
        aria-expanded={open}
        className="relative p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition cursor-pointer"
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
          <>
            {/* Mobile backdrop for easy tap-to-dismiss */}
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-xs sm:hidden z-40"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className="fixed left-3 right-3 top-[calc(4rem+var(--safe-top))] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80 clean-card p-0 overflow-hidden shadow-2xl shadow-black/50 z-50"
            >
              <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">Notifications</span>
                  <Badge color={unread > 0 ? 'red' : 'slate'}>{unread} unread</Badge>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-md transition cursor-pointer"
                  title="Close notifications"
                  aria-label="Close notifications"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
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
                className="w-full py-2.5 text-center text-[11px] font-medium text-[var(--accent)] hover:bg-white/3 transition cursor-pointer border-t border-[var(--border-subtle)]"
              >
                View all notifications →
              </button>
            </motion.div>
          </>
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings);
  /* Live settings from the settings view (saved via saveSettings → custom
   * event) — AppShell is the single owner of <html> attribute application. */
  useEffect(() => {
    const onSettings = (e) => setSettings(e.detail);
    window.addEventListener('helpotron:settings-changed', onSettings);
    return () => window.removeEventListener('helpotron:settings-changed', onSettings);
  }, []);
  /* Apply appearance AT BOOT (operator 08-26): without this the stored
   * accent/light/etc only kick in when the settings view mounts — a refresh
   * snaps back to the default look. Per-place variant configs
   * (settings.scoped['appearance.*']) resolve against the ACTIVE VIEW, so a
   * "dark on Dashboard, light on Settings" config actually applies per place. */
  useEffect(() => {
    const merged = { ...settings.appearance };
    if (settings.scoped) {
      for (const field of ['theme', 'accent', 'density', 'animation', 'background', 'uiStyle']) {
        const v = resolveScopedValue(settings.scoped, `appearance.${field}`, { place: activeView });
        if (v != null) merged[field] = v;
      }
    }
    applyAppearance(merged);
    applyAccessibility(settings.accessibility);
  }, [settings.appearance, settings.scoped, settings.accessibility, activeView]);

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

  return (
    <>
      {/* Stitch sidebar (09-01) is a fixed full-height panel — the topbar and
          content live in the md:pl-* region right of it, exactly like the design. */}
      <div className={sidebarOpen ? 'md:pl-64' : 'md:pl-20'}>
      {/* ── TOPBAR ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-outline-variant/20 bg-surface/80 backdrop-blur-md">
        <div className="w-full px-3 sm:px-6 h-16 flex items-center gap-2 sm:gap-3">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="md:hidden p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition cursor-pointer"
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
            className="flex items-center gap-2.5 cursor-pointer select-none group"
            aria-label="helpotron ACADEMIC OS"
          >
            <AnimatedLogo size="md" showWordmark={false} />
            <span className="hidden sm:flex flex-col leading-tight text-left">
              <span className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-primary leading-none">Helpotron</span>
              <span className="font-label-caps text-label-caps text-on-surface-variant tracking-widest uppercase font-semibold mt-0.5">Academic OS</span>
            </span>
          </button>

          <span className="w-px h-6 bg-white/8 mx-1 hidden sm:block" />

          {/* Back / forward navigation — hidden on phones (<sm) where the
              browser's native edge-swipe/back gesture covers this; keeps the
              header's min-content width inside a 390px viewport (08-28). */}
          <div className="hidden sm:flex items-center gap-0.5">
            <button
              type="button"
              onClick={onGoBack}
              disabled={!canGoBack}
              aria-label="Back"
              title="Back"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant enabled:hover:text-on-surface enabled:hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronLeft width={18} height={18} />
            </button>
            <button
              type="button"
              onClick={onGoForward}
              disabled={!canGoForward}
              aria-label="Forward"
              title="Forward"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant enabled:hover:text-on-surface enabled:hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronRight width={18} height={18} />
            </button>
          </div>

          {/* Global search trigger — compact on phones so the header fits
              (was ~214px min-content: 'Search anything… ⌘K' pushed the whole
              page to zoom out on a 390px viewport; 08-28). */}
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex-1 min-w-0 max-w-[180px] sm:max-w-md flex items-center gap-2.5 overflow-hidden px-2.5 sm:px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:border-outline/50 transition cursor-pointer text-xs"
            aria-label="Search anything…"
            title="Search"
          >
            <Search width={14} height={14} className="shrink-0" />
            <span className="flex-1 text-left truncate hidden sm:block">Search anything…</span>
            {/* QA 08-31: the ⌘K hint had no shrink-0 and the button no
                overflow-hidden, so once the balance chip squeezed the button to
                26px the hint rendered OUTSIDE it and landed on top of the chip.
                It is also a keyboard affordance, so md+ only. */}
            <span className="hidden md:block shrink-0"><Kbd>⌘K</Kbd></span>
          </button>

          <div className="ml-auto flex items-center gap-1.5 min-w-0">
            {/* Tokens (usage) + Credits (discounts) chips — the chip cluster is
                ~214px and does not shrink, so it eats the header and squeezes
                the search trigger down to 26px. Hidden below md; the drawer
                that carries the balance in its footer is itself md:hidden, so
                the two hand over at exactly 768px with no gap and no overlap.
                (08-29 used sm, which left 640-767px showing both AND broken.) */}
            <button
              type="button"
              onClick={() => onNavigate('credits')}
              className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-low border border-outline-variant/30 hover:border-outline/50 transition cursor-pointer"
              aria-label={`${Number(user.token_balance ?? 0).toLocaleString()} tokens (usage), ${Number(user.credits ?? 0).toLocaleString()} credits (discounts), open wallet`}
            >
              <Star className="w-4 h-4 text-primary shrink-0" fill="currentColor" aria-hidden="true" />
              <span className="font-tabular-stat text-tabular-stat font-medium text-on-surface truncate">
                Credits: {Number(user?.credits ?? 0).toLocaleString()}
              </span>
              <span className="font-tabular-stat text-tabular-stat text-on-surface-variant shrink-0">
                {Number(user?.token_balance ?? 0).toLocaleString()} tokens
              </span>
            </button>

            {/* Notification bell */}
            <NotificationBell onOpenAll={() => onNavigate('activity')} />

            {/* Avatar / quick settings */}
            {isLoggedIn ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setQuickOpen((o) => !o)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white border-2 border-outline-variant/40 hover:border-primary transition cursor-pointer"
                  style={{ backgroundImage: 'var(--accent-mix)' }}
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
                className="px-3 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold glow-accent transition cursor-pointer"
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
              className="fixed inset-y-0 left-0 z-50 w-72 bg-surface-container-lowest border-r border-outline-variant/30 p-4 flex flex-col justify-between shadow-2xl md:hidden overflow-y-auto"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-outline-variant/30">
                  <div className="flex items-center gap-2">
                    <AnimatedLogo size="sm" />
                    <span className="font-label-caps text-label-caps text-primary font-bold tracking-wider uppercase">Helpotron OS</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition cursor-pointer"
                    aria-label="Close menu"
                  >
                    ✕
                  </button>
                </div>

                {/* Mobile Navigation Links */}
                <div className="space-y-3">
                  {tree.map((group) => (
                    <div key={group.group} className="space-y-1">
                      <div className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider px-2 pt-1">
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
                                ? 'bg-primary-container/15 text-primary border border-primary/25'
                                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                            }`}
                          >
                            {item.Icon && <item.Icon className={`w-4 h-4 ${selected ? 'text-primary' : 'text-on-surface-variant'}`} />}
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Mobile Drawer Footer */}
              <div className="pt-4 border-t border-outline-variant/30 space-y-2">
                {/* Balance chip lives here on phones (topbar chip is
                    sm+ only since 08-29 — see above) */}
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onNavigate('credits');
                  }}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold font-mono text-on-surface-variant"
                  aria-label={`${Number(user.token_balance ?? 0).toLocaleString()} tokens (usage), ${Number(user.credits ?? 0).toLocaleString()} credits (discounts), open wallet`}
                >
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                  <span className="text-primary">{Number(user.token_balance ?? 0).toLocaleString()} tokens</span>
                  <span className="text-on-surface-variant font-normal">·</span>
                  <span className="text-on-surface-variant">{Number(user?.credits ?? 0).toLocaleString()} credits</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenPrivacy();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition cursor-pointer"
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
      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 pt-4 sm:pt-6 flex gap-6 items-start">
        {/* Desktop Sidebar (Stitch design 09-01): fixed full-height panel,
            surface-container-lowest, capsule-mono nav labels, active = primary
            with container tint + 4px primary edge, footer user chip. */}
        <aside className={`hidden md:flex fixed left-0 top-0 h-full flex-col py-6 gap-4 bg-surface-container-lowest border-r border-outline-variant/30 z-40 transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-20'}`}>
          <div className={sidebarOpen ? 'px-6 flex items-center justify-between' : 'flex justify-center'}>
            {sidebarOpen ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-headline-lg text-headline-lg font-bold shrink-0">
                    H
                  </div>
                  <div>
                    <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-primary leading-tight">Helpotron OS</h1>
                    <p className="font-body-sm text-[11px] text-on-surface-variant">Premium Co-pilot</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition cursor-pointer"
                  aria-label="Collapse Navigation sidebar"
                  title="Collapse sidebar"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center hover:opacity-90 transition cursor-pointer shrink-0"
                aria-label="Expand Navigation sidebar"
                title="Expand sidebar"
              >
                <span className="font-headline-lg text-headline-lg font-bold leading-none">H</span>
              </button>
            )}
          </div>

          {sidebarOpen ? (
            <button
              type="button"
              onClick={() => onNavigate('overview')}
              className="mx-6 bg-primary text-on-primary rounded-xl py-3 px-4 flex items-center justify-center gap-2 hover:bg-primary-container transition-colors shadow-sm cursor-pointer min-h-[44px]"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span className="font-label-caps text-label-caps uppercase">New Study Session</span>
            </button>
          ) : (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => onNavigate('overview')}
                className="w-10 h-10 bg-primary text-on-primary rounded-xl flex items-center justify-center hover:bg-primary-container transition-colors shadow-sm cursor-pointer"
                title="New Study Session"
                aria-label="New Study Session"
              >
                <Plus className="w-5 h-5 shrink-0" aria-hidden="true" />
              </button>
            </div>
          )}

          <nav className="flex-1 overflow-y-auto space-y-4 px-2" aria-label="Primary">
            {tree.map((group) => (
              <div key={group.group}>
                {sidebarOpen && (
                  <div className="font-label-caps text-label-caps text-on-surface-variant uppercase px-4 pb-1 tracking-wider">{group.group}</div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const selected = activeView === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => onNavigate(item.key)}
                        className={`w-full flex items-center gap-4 py-3 transition-all cursor-pointer ${sidebarOpen ? 'px-4' : 'justify-center px-0'} ${
                          selected
                            ? 'text-primary font-bold border-r-4 border-primary bg-primary-container/10'
                            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                        }`}
                        aria-label={item.label}
                        aria-current={selected ? 'page' : undefined}
                        title={sidebarOpen ? undefined : item.label}
                      >
                        {item.Icon && <item.Icon className="w-5 h-5 shrink-0" aria-hidden="true" />}
                        {sidebarOpen && <span className="font-label-caps text-label-caps uppercase truncate">{item.label}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer user chip (Stitch design) → settings */}
          <div className="px-6 pt-6 border-t border-outline-variant/30">
            {sidebarOpen ? (
              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className="w-full flex items-center gap-3 text-left cursor-pointer group"
                aria-label="Open settings"
              >
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundImage: 'var(--accent-mix)' }}>
                  {isLoggedIn ? (user?.public_id?.[0] || 'R') : 'R'}
                </span>
                <span className="min-w-0">
                  <span className="font-body-sm text-body-sm text-on-surface block truncate">
                    {isLoggedIn ? (user?.public_id || 'Guest') : 'Guest'}
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant block truncate">
                    {isLoggedIn ? `${Number(user?.credits ?? 0).toLocaleString()} credits` : 'Sign in'}
                  </span>
                </span>
              </button>
            ) : (
              <div className="flex justify-center">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundImage: 'var(--accent-mix)' }}>
                  {isLoggedIn ? (user?.public_id?.[0] || 'R') : 'R'}
                </span>
              </div>
            )}
          </div>
        </aside>

        {/* Main content — overflow-x-hidden (not clip): `overflow: clip` is
            ignored by older Android WebView, which let a wide child inflate the
            layout viewport to ~544px post-login (scrollWidth 569 @ 390). Paired
            with min-w-0 so this flex child can shrink below its content width. */}
        <main id="main-content" className="flex-1 min-w-0 w-full overflow-x-hidden pb-24 md:pb-12">
          {/* View header */}
          <header className="mb-8">
            <div className="flex items-end gap-4 min-w-0">
              {activeView !== 'agent' && (
                <div className="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                  {current?.logo
                    ? <img src={current.logo} alt="" className="w-7 h-7 rounded-lg object-cover" />
                    : <span className="text-xl leading-none">{current?.icon ?? '✦'}</span>}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="font-headline-lg text-headline-lg text-on-surface truncate">{current?.label ?? 'Helpotron'}</h1>
                <p className="font-body-md text-body-md text-on-surface-variant line-clamp-2">
                  {activeView === 'overview' && 'Your personal academic command center'}
                  {activeView === 'activity' && 'Every event, in one timeline'}
                  {activeView === 'monitors' && 'Live traffic, activity, data lake & cost'}
                  {activeView === 'study' && 'Guides, flashcards, practice tests and summaries'}
                  {activeView === 'library' && 'Files, saved materials and your calendar'}
                  {activeView === 'insights' && 'Analytics, progress and recommendations'}
                  {activeView === 'credits' && 'Balance, plans, top-ups and earnings — free beta, payments not available yet'}
                  {activeView === 'settings' && 'Appearance, agent behaviour, privacy and account'}
                  {activeView === 'admin' && isAdmin && 'Users, credits, model health and moderation'}
                </p>
              </div>
            </div>
            {activeView === 'overview' && (
              <span className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-low border border-outline-variant/30 text-[10px] font-label-caps uppercase tracking-wider text-on-surface-variant">
                <GraduationCap className="w-3.5 h-3.5" /> Capture → Understand → Execute → Improve
              </span>
            )}
          </header>

          {/* Page body */}
          <div className="space-y-4 sm:space-y-5">
            {React.Children.count(children) ? children : null}
          </div>
        </main>
      </div>

      {/* ── FOOTER LANDMARK (audit 08-27): page-level contentinfo ──────────
          Legal links (08-29): the only always-available trigger for the
          full-page Privacy Policy / Terms of Service views — previously only
          reachable via ⌘K (demo-mode search index only) or a single Settings
          button, leaving the 'terms' route effectively unreachable. */}
      <footer role="contentinfo" className="text-center text-[11px] text-[var(--text-muted)] px-4 pt-2 pb-20 md:pb-4">
        <div className="flex items-center justify-center gap-x-5 gap-y-1 flex-wrap">
          <span>© 2026 Helpotron Automator</span>
          <button
            type="button"
            onClick={() => onNavigate('privacy')}
            className="hover:text-[var(--text-primary)] underline underline-offset-2 transition cursor-pointer"
          >
            Privacy Policy
          </button>
          <button
            type="button"
            onClick={() => onNavigate('terms')}
            className="hover:text-[var(--text-primary)] underline underline-offset-2 transition cursor-pointer"
          >
            Terms of Service
          </button>
        </div>
      </footer>
      </div>

      {/* ── MOBILE STICKY BOTTOM NAVIGATION BAR ────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-outline-variant/30 px-4 pt-2 pb-safe flex items-center justify-around"
        aria-label="Mobile Bottom Navigation"
      >
        {[
          { key: 'overview', label: 'Home', Icon: LayoutDashboard },
          { key: 'agent', label: 'Agent', Icon: Brain },
          { key: 'insights', label: 'Insights', Icon: BarChart3 },
          { key: 'activity', label: 'History', Icon: Activity },
        ].map((t) => {
          const selected = activeView === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onNavigate(t.key)}
              aria-current={selected ? 'page' : undefined}
              className={`flex flex-col items-center justify-center rounded-xl px-4 py-1 transition-all ${
                selected
                  ? 'bg-primary-container text-on-primary-container scale-90 font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
              }`}
            >
              <t.Icon className="w-5 h-5" aria-hidden="true" />
              <span className="font-label-caps text-[10px] mt-1">{t.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center rounded-xl px-3 py-1 text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
          aria-label="Open full menu"
        >
          <div className="flex flex-col gap-0.5 items-center justify-center w-5 h-5">
            <span className="w-3.5 h-0.5 bg-current rounded-full" />
            <span className="w-3.5 h-0.5 bg-current rounded-full" />
            <span className="w-3.5 h-0.5 bg-current rounded-full" />
          </div>
          <span className="font-label-caps text-[10px] mt-1">More</span>
        </button>
      </nav>
      {!isAdmin && <DevContactModal />}
    </>
  );
}

