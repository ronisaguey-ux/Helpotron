/* ────────────────────────────────────────────────────────────────────────────
 * AppShell.jsx — Helpotron OS v4 Shell (Stitch v6 / LUMINOUS GLASS)
 * Spec 3.1.1: 64px sticky glass topbar + 256px sidebar (collapsible to 90px,
 * persisted in `helpotron_sidebar_collapsed`, admin divider) + footer telemetry.
 * Integrates:
 * - MobileDrawer (slide-over with focus restore)
 * - MobileBottomBar (5-slot navigation with pending badge)
 * - QuickSettings (popover with theme / AI dials)
 * - NotificationsPanel (popover with feed / live empty)
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion';
import {
  Search,
  Bell,
  ChevronLeft,
  ChevronRight,
  Plus,
  LayoutDashboard,
  Brain,
  BarChart3,
  History,
  Settings,
  Inbox,
  Database,
  CreditCard,
  Puzzle,
  HelpCircle,
  Shield,
  Gauge,
  Coins,
  ChevronDown,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Library as LibraryIcon,
} from 'lucide-react';
import api from '../api.js';
import { applyAppearance, applyAccessibility, applyFontScale } from './SettingsApp.jsx';
import { resolveScopedValue } from './ScopedSetting.jsx';
import { loadSettings, saveSettings } from '../demoData.js';
import Button from './Button.jsx';
import { AvatarWidget } from './ui/AvatarWidget.jsx';
import QuickSettings from './QuickSettings.jsx';
import NotificationsPanel from './NotificationsPanel.jsx';
import MobileDrawer from './MobileDrawer.jsx';
import MobileBottomBar from './MobileBottomBar.jsx';
import DevContactModal from './DevContactModal.jsx';
import NewAssignmentModal from './NewAssignmentModal.jsx';

const SIDEBAR_COLLAPSED_KEY = 'helpotron_sidebar_collapsed';

export const getNavItems = () => [
  { key: 'overview', label: 'Dashboard', Icon: LayoutDashboard, group: 'Workspace Core' },
  { key: 'agent', label: 'My Agent', Icon: Brain, group: 'Workspace Core' },
  { key: 'insights', label: 'Insights', Icon: BarChart3, group: 'Workspace Core' },
  { key: 'history', label: 'History', Icon: History, group: 'Workspace Core' },
  { key: 'library', label: 'Library', Icon: LibraryIcon, group: 'Workspace Core' },
  { key: 'settings', label: 'Settings', Icon: Settings, group: 'Platform System' },
  { key: 'credits', label: 'Billing', Icon: CreditCard, group: 'Platform System' },
];

export default function AppShell({
  children,
  activeView,
  onNavigate,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  isAdmin = false,
  isLoggedIn = false,
  user,
  onLogout,
  onOpenSearch,
  onOpenAuth,
  onOpenPrivacy,
}) {
  // Collapsible sidebar state (persisted per Spec 3.1.1)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings);

  const quickMenuRef = useRef(null);
  const notificationsRef = useRef(null);
  const hamburgerRef = useRef(null);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  };

  // Close popovers on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (quickMenuRef.current && !quickMenuRef.current.contains(e.target)) {
        setQuickSettingsOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Poll unread notification count
  useEffect(() => {
    let mounted = true;
    const checkUnread = async () => {
      if (!isLoggedIn) return;
      try {
        const res = await api.get('/api/notifications?limit=10');
        if (mounted && res && typeof res.unread_count === 'number') {
          setUnreadNotifications(res.unread_count);
        }
      } catch (e) {}
    };
    checkUnread();
    const interval = setInterval(checkUnread, 45000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isLoggedIn]);

  // Appearance & Accessibility synchronization
  useEffect(() => {
    const onSettings = (e) => setSettings(e.detail);
    window.addEventListener('helpotron:settings-changed', onSettings);
    return () => window.removeEventListener('helpotron:settings-changed', onSettings);
  }, []);

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

  useEffect(() => {
    applyFontScale(settings.appearance?.fontScale);
  }, [settings.appearance?.fontScale]);

  const persistSettings = (next) => {
    setSettings(next);
    saveSettings(next);
  };

  const navItems = getNavItems(isAdmin);
  const ALL_VIEW_LABELS = {
    overview: 'Dashboard',
    agent: 'My Agent',
    insights: 'Insights',
    history: 'History',
    library: 'Library',
    settings: 'Settings',
    credits: 'Billing',
    dump: 'Drop Assignment',
    datalake: 'Data Lake',
    extension: 'Extension',
    guide: 'Guide',
    admin: 'Control Center',
    monitors: 'Monitors',
    notifications: 'Notifications',
  };
  const currentNav = navItems.find((i) => i.key === activeView) || {
    key: activeView,
    label: ALL_VIEW_LABELS[activeView] || 'Dashboard',
    Icon: LayoutDashboard,
  };

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col font-body-sm selection:bg-primary/20 selection:text-primary">
      {/* ── 1. DESKTOP FIXED SIDEBAR (256px or 90px) ────────────────────── */}
      <aside
        className={[
          'hidden lg:flex fixed left-0 top-0 h-full z-40 flex-col justify-between',
          'bg-surface-container-lowest/70 backdrop-blur-xl border-r border-outline-variant/20',
          'transition-all duration-200 select-none shadow-[0_1px_8px_rgba(0,0,0,0.04)]',
          sidebarCollapsed ? 'w-[90px]' : 'w-64',
        ].join(' ')}
      >
        <div className="flex flex-col flex-1 overflow-y-auto os-scroll">
          {/* Brand Header */}
          <div className="h-16 px-4 flex items-center justify-between border-b border-outline-variant/20 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-primary-container text-on-primary-container border border-primary/30 flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                H
              </div>
              {!sidebarCollapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="font-title-md text-sm font-bold text-on-surface leading-tight truncate">
                    Helpotron
                  </span>
                  <span className="font-mono text-[9px] text-primary uppercase tracking-wider">
                    OS v4.0
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>

          {/* New Study Session CTA */}
          <div className="p-3">
            {sidebarCollapsed ? (
              <Button
                variant="primary"
                glow={true}
                onClick={() => setNewSessionOpen(true)}
                className="w-full h-11 p-0 flex items-center justify-center rounded-xl"
                title="New Study Session"
                ariaLabel="New Study Session"
              >
                <Plus className="w-5 h-5" />
              </Button>
            ) : (
              <Button
                variant="primary"
                glow={true}
                onClick={() => setNewSessionOpen(true)}
                className="w-full text-xs font-semibold py-2.5 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>NEW STUDY SESSION</span>
              </Button>
            )}
          </div>

          {/* Nav Items */}
          <nav className="p-2 space-y-1">
            {navItems.map(({ key, label, Icon, group }, idx) => {
              const isActive = activeView === key;
              const prevItem = navItems[idx - 1];
              const showGroupHeader = !prevItem || prevItem.group !== group;

              return (
                <React.Fragment key={key}>
                  {!sidebarCollapsed && showGroupHeader && (
                    <div className="px-3 pt-3 pb-1 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                      {group}
                    </div>
                  )}
                  {sidebarCollapsed && showGroupHeader && idx !== 0 && (
                    <div className="my-2 border-t border-outline-variant/20 mx-2" />
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigate(key)}
                    title={sidebarCollapsed ? label : undefined}
                    className={[
                      'w-full flex items-center rounded-xl transition cursor-pointer',
                      sidebarCollapsed
                        ? 'justify-center h-11'
                        : 'gap-3 px-3 py-2 text-xs font-medium min-h-[44px]',
                      isActive
                        ? 'bg-primary-container text-on-primary-container font-semibold shadow-[0_0_24px_rgba(89,216,201,0.25)]'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container',
                    ].join(' ')}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-on-primary-container' : 'text-primary'}`} />
                    {!sidebarCollapsed && <span className="truncate">{label}</span>}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: WalletLine */}
        <div className="p-3 border-t border-outline-variant/20 shrink-0">
          {!sidebarCollapsed ? (
            <div className="p-2.5 rounded-xl bg-surface-container/50 border border-outline-variant/20">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] uppercase text-on-surface-variant flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-primary" /> WalletLine
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-sem-green/15 text-sem-green font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-sem-green animate-pulse" /> Live
                </span>
              </div>
              <div className="flex items-baseline justify-between font-mono">
                <div>
                  <span className="text-[9px] text-on-surface-variant block">SYS_CREDITS</span>
                  <span className="text-xs font-semibold text-primary tabular-nums">
                    {Number(user?.credits ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-on-surface-variant block">TOKENS</span>
                  <span className="text-xs font-semibold text-secondary tabular-nums">
                    {user?.unlimited ? '∞' : Number(user?.token_balance ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center" title={`${user?.credits ?? 0} credits`}>
              <Coins className="w-5 h-5 text-primary" />
            </div>
          )}
        </div>
      </aside>

      {/* ── 2. MAIN LAYOUT AREA ─────────────────────────────────────────── */}
      <div className={[sidebarCollapsed ? 'lg:pl-[90px]' : 'lg:pl-64', 'flex flex-col flex-1 transition-all duration-200'].join(' ')}>
        {/* Sticky Glass Topbar (64px) */}
        <header className="sticky top-0 z-30 h-16 bg-surface-container-lowest/70 backdrop-blur-xl border-b border-outline-variant/20 px-4 sm:px-6 flex items-center justify-between gap-3 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
          {/* Left: Mobile hamburger + Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              ref={hamburgerRef}
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="lg:hidden p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Open navigation menu"
            >
              <div className="flex flex-col gap-1 w-4">
                <span className="w-4 h-0.5 bg-current rounded-full" />
                <span className="w-4 h-0.5 bg-current rounded-full" />
                <span className="w-4 h-0.5 bg-current rounded-full" />
              </div>
            </button>

            {/* Breadcrumb / Title */}
            <div className="flex items-center gap-2 font-body-sm text-xs sm:text-sm">
              <span className="text-on-surface-variant hidden sm:inline">Helpotron OS</span>
              <span className="text-outline-variant/60 hidden sm:inline">/</span>
              <h1 className="font-semibold text-on-surface truncate">
                {currentNav.label}
              </h1>
            </div>

            {/* Status Indicator */}
            <div className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-surface-container-high ml-2 border border-outline-variant/20">
              <span className="w-1.5 h-1.5 rounded-full bg-sem-green animate-pulse" />
              <span className="font-mono text-[9px] text-on-surface-variant uppercase tracking-wider">
                SYNTH ACTIVE
              </span>
            </div>

            {/* Navigation back/forward */}
            <div className="hidden xl:flex items-center gap-0.5 ml-2">
              <button
                type="button"
                onClick={onGoBack}
                disabled={!canGoBack}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant enabled:hover:text-on-surface enabled:hover:bg-surface-container disabled:opacity-30 transition cursor-pointer"
                aria-label="Navigate back"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onGoForward}
                disabled={!canGoForward}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant enabled:hover:text-on-surface enabled:hover:bg-surface-container disabled:opacity-30 transition cursor-pointer"
                aria-label="Navigate forward"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right: Search Pill + Notification Bell + QuickSettings */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Search ⌘K Trigger Pill */}
            <button
              type="button"
              onClick={onOpenSearch}
              className="flex items-center gap-2 sm:gap-3 px-3 py-1.5 rounded-xl bg-surface-container-low/80 hover:bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:text-on-surface transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] cursor-pointer min-h-[44px]"
              aria-label="Search or run command (⌘K)"
            >
              <Search className="w-4 h-4 text-primary shrink-0" />
              <span className="hidden sm:inline text-xs font-medium text-on-surface-variant truncate max-w-[140px]">
                Search synthesis...
              </span>
              <span className="hidden sm:inline font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface border border-outline-variant/30">
                ⌘K
              </span>
            </button>

            {/* Notifications Bell Trigger */}
            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className="relative p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label={`Notifications (${unreadNotifications} unread)`}
                aria-haspopup="dialog"
                aria-expanded={notificationsOpen}
              >
                <Bell className="w-5 h-5" />
                {unreadNotifications > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-error ring-2 ring-background animate-pulse" />
                )}
              </button>

              <NotificationsPanel
                isOpen={notificationsOpen}
                onClose={() => setNotificationsOpen(false)}
                onViewAll={() => onNavigate('notifications')}
                onNavigate={onNavigate}
              />
            </div>

            {/* User Identity / QuickSettings Avatar Trigger */}
            {isLoggedIn ? (
              <div className="relative" ref={quickMenuRef}>
                <button
                  type="button"
                  onClick={() => setQuickSettingsOpen((prev) => !prev)}
                  className="rounded-full border border-outline-variant/30 hover:ring-2 hover:ring-primary flex items-center justify-center transition cursor-pointer overflow-hidden p-0 min-h-[44px] min-w-[44px]"
                  aria-label="Quick settings menu"
                  aria-haspopup="menu"
                  aria-expanded={quickSettingsOpen}
                >
                  <AvatarWidget user={user} avatarUrl={settings?.profile?.avatarUrl} size="md" />
                </button>

                <AnimatePresence>
                  {quickSettingsOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.98 }}
                      transition={{ duration: 0.12 }}
                      className="absolute top-full right-0 mt-2 z-50"
                    >
                      <QuickSettings
                        settings={settings}
                        onChange={persistSettings}
                        onNavigate={(v) => {
                          setQuickSettingsOpen(false);
                          onNavigate(v);
                        }}
                        isAdmin={isAdmin}
                        onOpenFull={() => {
                          setQuickSettingsOpen(false);
                          onNavigate('settings');
                        }}
                        onOpenNotifications={() => {
                          setQuickSettingsOpen(false);
                          onNavigate('notifications');
                        }}
                        onOpenPrivacy={() => {
                          setQuickSettingsOpen(false);
                          onOpenPrivacy?.();
                        }}
                        onLogout={() => {
                          setQuickSettingsOpen(false);
                          onLogout?.();
                        }}
                        user={user}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={onOpenAuth}>
                Sign in
              </Button>
            )}
          </div>
        </header>

        {/* Canvas Body */}
        <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8 max-w-page-max mx-auto w-full pb-20 lg:pb-8">
          {children}
        </main>
      </div>

      {/* ── 3. MOBILE SLIDE-OVER DRAWER ─────────────────────────────────── */}
      <MobileDrawer
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        activeView={activeView}
        onNavigate={onNavigate}
        user={user}
        isAdmin={isAdmin}
        onOpenNewSession={() => setNewSessionOpen(true)}
        triggerRef={hamburgerRef}
      />

      {/* ── 4. MOBILE BOTTOM NAVIGATION BAR ─────────────────────────────── */}
      <MobileBottomBar
        activeView={activeView}
        onNavigate={onNavigate}
        onOpenMore={() => setMobileDrawerOpen(true)}
        hasPendingReview={unreadNotifications > 0}
      />

      {/* ── 5. NEW STUDY SESSION MODAL ───────────────────────────────────── */}
      {newSessionOpen && (
        <NewAssignmentModal
          isOpen={newSessionOpen}
          onClose={() => setNewSessionOpen(false)}
          userId={user?.public_id}
          onCreated={(assignment) => {
            setNewSessionOpen(false);
            onNavigate('overview');
          }}
        />
      )}

      {/* ── 6. DEV CONTACT MODAL ────────────────────────────────────────── */}
      {contactModalOpen && (
        <DevContactModal
          isOpen={contactModalOpen}
          onClose={() => setContactModalOpen(false)}
          user={user}
        />
      )}
    </div>
  );
}
