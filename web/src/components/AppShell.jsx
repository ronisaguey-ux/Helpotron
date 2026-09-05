// export target: web/src/components/AppShell.jsx
/* ────────────────────────────────────────────────────────────────────────────
 * AppShell.jsx — Helpotron OS v3 Shell (Google Stitch v3 Design)
 * Topbar: current title, compact search button (⌘K), credits pill, notification bell,
 * avatar quick-settings.
 * Sidebar: flat navigation list with left accent bar, v3 brand tile, New Study Session CTA.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion";
import api from "../api.js";
import { applyAppearance, applyAccessibility, applyFontScale } from "./SettingsApp.jsx";
import { resolveScopedValue } from "./ScopedSetting.jsx";
import {
  Search, Settings, Bell, LogOut, ChevronLeft, ChevronRight,
  Plus, ShieldCheck, LayoutDashboard, Brain,
  BarChart3, Shield, Gauge, X, History, Home, Inbox, Database,
  Coins,
} from "lucide-react";
import { NOTIFICATIONS, loadSettings, saveSettings } from "../demoData.js";
import { Badge, timeAgo } from "./ui/os.jsx";
import Button from "./Button.jsx";
import DevContactModal from "./DevContactModal.jsx";
import NewAssignmentModal from "./NewAssignmentModal.jsx";

const EFFORT_LABELS = { low: "Low", balanced: "Balanced", high: "High" };

const usageTokenLabel = (u) =>
  u?.unlimited ? "Unlimited" : `${Number(u?.token_balance ?? 0).toLocaleString()} tokens`;

export const getNavItems = (isAdmin) => [
  { key: "overview", label: "Dashboard", Icon: LayoutDashboard },
  { key: "agent", id: "my_agent", label: "My Agent", Icon: Brain },
  { key: "insights", label: "Insights", Icon: BarChart3 },
  { key: "history", label: "History", Icon: History },
  { key: "settings", label: "Settings", Icon: Settings },
  { key: "dump", label: "Drop Assignment", Icon: Inbox },
  { key: "datalake", label: "Data Lake", Icon: Database },
  ...(isAdmin
    ? [
        { key: "admin", label: "Control Center", Icon: Shield },
        { key: "monitors", label: "Monitors", Icon: Gauge },
      ]
    : []),
];
/* ── Quick settings (avatar menu) ─────────────────────────────────────────── */
function QuickSettings({ settings, onChange, onOpenFull, user }) {
  const set = (path, value) => {
    const next = JSON.parse(JSON.stringify(settings));
    const keys = path.split(".");
    let obj = next;
    while (keys.length > 1) {
      obj = obj[keys.shift()];
    }
    obj[keys[0]] = value;
    onChange(next);
  };

  const fileRef = useRef(null);
  const [phoneDraft, setPhoneDraft] = useState(settings.profile.phone || "");
  const [pfpMsg, setPfpMsg] = useState(null);

  const savePhone = () => {
    const v = phoneDraft.trim();
    set("profile.phone", v);
    api.updateSettings({ profile: { ...settings.profile, phone: v } }).catch(() => {});
  };

  const pickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const r = await api.uploadAvatar(file, "user");
      set("profile.avatarUrl", r.url);
      api.updateSettings({ profile: { ...settings.profile, avatarUrl: r.url } }).catch(() => {});
      setPfpMsg(null);
    } catch (err) {
      console.error("avatar upload failed", err);
      setPfpMsg(err.message || "Avatar upload failed");
      setTimeout(() => setPfpMsg(null), 5000);
    }
  };

  const removeAvatar = () => {
    set("profile.avatarUrl", "");
    api.updateSettings({ profile: { ...settings.profile, avatarUrl: "" } }).catch(() => {});
  };

  return (
    <div className="w-64 p-4 space-y-3">
      <div className="flex items-center gap-3 pb-3 border-b border-outline-variant/20">
        <div className="w-9 h-9 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-sm font-bold overflow-hidden border border-outline-variant/30">
          {settings.profile.avatarUrl
            ? <img src={settings.profile.avatarUrl} alt="" className="w-full h-full object-cover" />
            : (settings.profile.displayName?.[0] || "R")}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-on-surface truncate">{settings.profile.displayName || user.public_id}</div>
          <div className="text-[10px] text-on-surface-variant">{user.public_id}</div>
        </div>
        <span className="ml-auto text-[10px] font-mono text-primary">{user.unlimited ? "∞" : Number(user.token_balance ?? 0).toLocaleString()} tk · {Number(user.credits ?? 0).toLocaleString()} cr</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-on-surface-variant">Theme</span>
        <div className="flex gap-1">
          {["dark", "light", "system"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set("appearance.theme", t)}
              className={`px-2 py-1 rounded-md text-[10px] capitalize transition cursor-pointer ${
                settings.appearance.theme === t ? "bg-primary text-on-primary font-semibold" : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {t === "system" ? "Auto" : t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-on-surface-variant">AI Effort</span>
        <div className="flex gap-1">
          {Object.entries(EFFORT_LABELS).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => set("ai.effort", k)}
              className={`px-2 py-1 rounded-md text-[10px] transition cursor-pointer ${
                settings.ai.effort === k ? "bg-primary text-on-primary font-semibold" : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-on-surface-variant">Academic level</span>
        <select
          value={settings.profile.educationLevel}
          onChange={(e) => set("profile.educationLevel", e.target.value)}
          className="bg-surface-container-high border border-outline-variant/30 rounded-md px-2 py-1 text-[10px] text-on-surface outline-none cursor-pointer"
          aria-label="Academic level"
        >
          {["High School", "Undergraduate", "Graduate", "Professional"].map((l) => (
            <option key={l} value={l} className="bg-surface text-on-surface">{l}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-on-surface-variant shrink-0">Phone number</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <input
            value={phoneDraft}
            onChange={(e) => setPhoneDraft(e.target.value)}
            placeholder={settings.profile.phone || "Add phone…"}
            className="w-28 bg-surface-container-high border border-outline-variant/30 rounded-md px-2 py-1 text-[10px] text-on-surface outline-none placeholder:text-on-surface-variant/50"
            aria-label="Phone number"
          />
          <button
            type="button"
            onClick={savePhone}
            disabled={!phoneDraft.trim() || phoneDraft.trim() === (settings.profile.phone || "")}
            className="px-2 py-1 rounded-md text-[10px] font-medium bg-primary text-on-primary disabled:opacity-30 transition cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-on-surface-variant shrink-0">Profile picture</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-2 py-1 rounded-md text-[10px] font-medium bg-surface-container-high text-on-surface hover:bg-surface-container transition cursor-pointer"
          >
            {settings.profile.avatarUrl ? "Change" : "Add"}
          </button>
          {settings.profile.avatarUrl && (
            <button
              type="button"
              onClick={removeAvatar}
              className="px-2 py-1 rounded-md text-[10px] text-error hover:bg-error-container/20 transition cursor-pointer"
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
        <div className="text-[10px] text-error bg-error-container/20 border border-error/30 rounded-lg px-2 py-1.5">
          ⚠️ {pfpMsg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-on-surface-variant">Notifications</span>
        <Badge color={settings.notifications?.channels?.inapp ? "green" : "slate"}>
          {settings.notifications?.channels?.inapp ? "On" : "Off"}
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
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications (${unread} unread)`}
        aria-expanded={open}
        className="relative p-2.5 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <Bell className="w-5 h-5" width={18} height={18} />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-error text-on-error text-[9px] font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <>
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
              className="fixed left-3 right-3 top-20 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80 bg-surface-container-low border border-outline-variant/30 rounded-2xl p-0 overflow-hidden shadow-2xl z-50"
            >
              <div className="px-4 py-3 border-b border-outline-variant/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-on-surface">Notifications</span>
                  <Badge color={unread > 0 ? "green" : "slate"}>{unread} unread</Badge>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-on-surface-variant hover:text-on-surface p-1 rounded-md transition cursor-pointer"
                  title="Close notifications"
                  aria-label="Close notifications"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {recent.length === 0 && (
                  <div className="px-4 py-8 text-center text-xs text-on-surface-variant">You’re all caught up ✦</div>
                )}
                {recent.map((n) => (
                  <div key={n.id} className="flex gap-3 px-4 py-3 border-b border-outline-variant/10 hover:bg-surface-container transition">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? "bg-outline" : "bg-primary"}`} />
                    <div className="min-w-0">
                      <div className={`text-xs ${n.read ? "text-on-surface-variant" : "text-on-surface font-medium"}`}>{n.title}</div>
                      <div className="text-[11px] text-on-surface-variant mt-0.5 line-clamp-2">{n.body}</div>
                      <div className="text-[10px] text-on-surface-variant mt-1">{timeAgo(n.timestamp)} · {n.channel}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => { setOpen(false); onOpenAll(); }}
                className="w-full py-2.5 text-center text-[11px] font-medium text-primary hover:bg-surface-container transition cursor-pointer border-t border-outline-variant/20"
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
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings);

  const quickMenuRef = useRef(null);
  useEffect(() => {
    if (!quickOpen) return;
    const handleClickOutside = (e) => {
      if (quickMenuRef.current && !quickMenuRef.current.contains(e.target)) {
        setQuickOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setQuickOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [quickOpen]);

  useEffect(() => {
    const onSettings = (e) => setSettings(e.detail);
    window.addEventListener("helpotron:settings-changed", onSettings);
    return () => window.removeEventListener("helpotron:settings-changed", onSettings);
  }, []);

  useEffect(() => {
    const merged = { ...settings.appearance };
    if (settings.scoped) {
      for (const field of ["theme", "accent", "density", "animation", "background", "uiStyle"]) {
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
  const current = navItems.find((i) => i.key === activeView);

  return (
    <>
      {/* Fixed Desktop Sidebar Layout */}
      <div className={sidebarOpen ? "md:pl-64" : "md:pl-20"}>
        {/* ── TOPBAR (A4 + A5) ──────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 border-b border-outline-variant/20 bg-surface/80 backdrop-blur-md">
          <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
            {/* Left: Mobile hamburger + Current Page Title (A4) */}
            <div className="flex items-center gap-3 min-w-0">
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

              <h1 className="font-headline-lg text-lg sm:text-headline-lg font-bold text-on-background truncate">
                {current?.label ?? "Dashboard"}
              </h1>

              {/* History back/forward on tablet/desktop */}
              <div className="hidden lg:flex items-center gap-0.5 ml-2">
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
            </div>

            {/* Right: Search button (A5) + Credits pill (A4) + Notifications + Avatar */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
              {/* Compact Search Trigger (A5) */}
              <button
                type="button"
                onClick={onOpenSearch}
                className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer flex items-center justify-center min-h-[44px] min-w-[44px]"
                aria-label="Search anything… (⌘K)"
                title="Search anything… (⌘K)"
              >
                <Search className="w-5 h-5" width={18} height={18} />
              </button>

              {/* Credits Pill (A4) */}
              <button
                type="button"
                onClick={() => onNavigate("credits")}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-low border border-outline-variant/30 hover:border-outline/50 transition cursor-pointer min-h-[44px]"
                aria-label={`${user?.unlimited ? "unlimited" : `${Number(user?.token_balance ?? 0).toLocaleString()} tokens`} (usage), ${Number(user?.credits ?? 0).toLocaleString()} credits (discounts), open wallet`}
              >
                <Coins className="w-4 h-4 text-primary shrink-0" width={16} height={16} aria-hidden="true" />
                <span className="font-tabular-stat text-tabular-stat font-medium text-on-surface truncate">
                  Credits: {user?.unlimited ? "Unlimited" : Number(user?.credits ?? 0).toLocaleString()}
                </span>
                <span className="font-tabular-stat text-tabular-stat text-on-surface-variant shrink-0 hidden sm:inline">
                  {usageTokenLabel(user)}
                </span>
              </button>

              {/* Notification Bell */}
              <NotificationBell onOpenAll={() => onNavigate("activity")} />

              {/* Circular Avatar Button */}
              {isLoggedIn ? (
                <div className="relative" ref={quickMenuRef}>
                  <button
                    type="button"
                    onClick={() => setQuickOpen((o) => !o)}
                    className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container border border-outline-variant/30 hover:ring-2 hover:ring-primary flex items-center justify-center font-bold text-sm transition cursor-pointer"
                    aria-label="Quick settings"
                    aria-haspopup="menu"
                    aria-expanded={quickOpen}
                  >
                    {user?.public_id?.[0] || "R"}
                  </button>
                  <AnimatePresence>
                    {quickOpen && (
                      <motion.div
                        key="quick-settings-menu"
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.12 }}
                        className="absolute top-full right-0 mt-2 bg-surface-container-low border border-outline-variant/30 rounded-2xl p-0 shadow-2xl z-50 overflow-hidden"
                      >
                        <QuickSettings
                          settings={settings}
                          onChange={persistSettings}
                          onOpenFull={() => { setQuickOpen(false); onNavigate("settings"); }}
                          user={user}
                        />
                        <div className="border-t border-outline-variant/20 p-2 space-y-0.5">
                          <button
                            type="button"
                            onClick={() => { setQuickOpen(false); onOpenPrivacy(); }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" /> Privacy Policy
                          </button>
                          <button
                            type="button"
                            onClick={() => { setQuickOpen(false); onLogout(); }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] text-error hover:bg-error-container/20 transition cursor-pointer"
                          >
                            <LogOut className="w-3.5 h-3.5" /> Sign out
                          </button>
                          <div className="px-3 pt-1 text-[9px] text-on-surface-variant font-mono select-none">
                            build {__BUILD_ID__}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="px-4 py-2 rounded-xl bg-primary hover:opacity-90 text-on-primary text-xs font-semibold shadow-sm transition cursor-pointer min-h-[44px]"
                >
                  Sign in
                </button>
              )}
            </div>
          </div>
        </header>

        {/* ── MOBILE SLIDE-OVER NAVIGATION DRAWER (A7) ─────────────────────── */}
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
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 250 }}
                className="fixed inset-y-0 left-0 z-50 w-72 bg-surface-container-low border-r border-outline-variant/30 p-4 flex flex-col justify-between shadow-2xl md:hidden overflow-y-auto"
              >
                <div className="space-y-4">
                  {/* Brand Block (A1) */}
                  <div className="flex items-center justify-between pb-3 border-b border-outline-variant/30">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-primary text-on-primary flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                        <img
                          src="/HelpoTron_logo.jpeg"
                          alt="Helpotron Logo"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <h1 className="font-headline-lg text-lg font-bold text-primary leading-tight">Helpotron OS</h1>
                        <p className="font-label-caps text-label-caps text-on-surface-variant">Premium Co-pilot</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMobileMenuOpen(false)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition cursor-pointer"
                      aria-label="Close menu"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Primary CTA (A2) */}
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setNewSessionOpen(true);
                    }}
                    className="w-full bg-primary text-on-primary rounded-xl py-3 px-4 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-sm min-h-[44px] cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="font-label-caps text-label-caps uppercase tracking-wider font-semibold">New Study Session</span>
                  </button>

                  {/* Flat Mobile Navigation Links (A3) */}
                  <div className="space-y-1">
                    {navItems.map((item) => {
                      const selected = activeView === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            onNavigate(item.key);
                            setMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-label-caps text-label-caps uppercase tracking-wider text-xs min-h-[44px] transition ${
                            selected
                              ? "bg-surface-container text-on-surface font-semibold border-l-4 border-primary"
                              : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface border-l-4 border-transparent"
                          }`}
                        >
                          {item.Icon && <item.Icon className="w-[18px] h-[18px] shrink-0" width={18} height={18} />}
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Mobile Drawer Footer */}
                <div className="pt-4 border-t border-outline-variant/30 space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigate("credits");
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-surface-container border border-outline-variant/30 text-xs font-semibold font-mono text-on-surface-variant min-h-[44px]"
                  >
                    <Coins className="w-4 h-4 text-primary shrink-0" width={16} height={16} />
                    <span className="text-primary">{usageTokenLabel(user)}</span>
                    <span className="text-on-surface-variant">·</span>
                    <span className="text-on-surface-variant">{Number(user?.credits ?? 0).toLocaleString()} credits</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onOpenPrivacy();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer"
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
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-error hover:bg-error-container/20 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" /> Sign out
                    </button>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ── DESKTOP SIDEBAR (A1, A2, A3) ─────────────────────────────────── */}
        <aside className={`hidden md:flex fixed left-0 top-0 h-full flex-col py-6 gap-4 bg-surface-container-low border-r border-outline-variant/30 z-40 transition-all duration-300 ${sidebarOpen ? "w-64" : "w-20"}`}>
          <div className={sidebarOpen ? "px-6 flex items-center justify-between" : "flex justify-center"}>
            {sidebarOpen ? (
              <>
                {/* Brand block (A1) */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-primary text-on-primary flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                    <img
                      src="/HelpoTron_logo.jpeg"
                      alt="Helpotron Logo"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h1 className="font-headline-lg text-lg font-bold text-primary leading-tight">Helpotron OS</h1>
                    <p className="font-label-caps text-label-caps text-on-surface-variant">Premium Co-pilot</p>
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
                className="w-10 h-10 rounded-2xl bg-primary text-on-primary flex items-center justify-center overflow-hidden hover:opacity-90 transition cursor-pointer shrink-0 shadow-sm"
                aria-label="Expand Navigation sidebar"
                title="Expand sidebar"
              >
                <img
                  src="/HelpoTron_logo.jpeg"
                  alt="Helpotron Logo"
                  className="w-full h-full object-cover"
                />
              </button>
            )}
          </div>

          {/* New Study Session CTA (A2) */}
          {sidebarOpen ? (
            <div className="px-6">
              <button
                type="button"
                onClick={() => setNewSessionOpen(true)}
                className="w-full bg-primary text-on-primary rounded-xl py-3 px-4 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-sm min-h-[44px] focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span className="font-label-caps text-label-caps uppercase tracking-wider font-semibold">New Study Session</span>
              </button>
            </div>
          ) : (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setNewSessionOpen(true)}
                className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center hover:opacity-90 transition-opacity shadow-sm focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
                title="New Study Session"
                aria-label="New Study Session"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Flat Nav list (A3) */}
          <nav className="flex-1 overflow-y-auto px-3 space-y-1" aria-label="Primary">
            {navItems.map((item) => {
              const selected = activeView === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onNavigate(item.key)}
                  className={`w-full flex items-center gap-3 py-2.5 transition-all cursor-pointer min-h-[44px] rounded-xl font-label-caps text-label-caps uppercase tracking-wider text-xs ${
                    sidebarOpen ? "px-3" : "justify-center px-0"
                  } ${
                    selected
                      ? "bg-surface-container text-on-surface font-semibold border-l-4 border-primary"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low border-l-4 border-transparent"
                  }`}
                  aria-label={item.label}
                  aria-current={selected ? "page" : undefined}
                  title={sidebarOpen ? undefined : item.label}
                >
                  {item.Icon && <item.Icon className="w-[18px] h-[18px] shrink-0" width={18} height={18} aria-hidden="true" />}
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </nav>

          {/* Footer user chip (Stitch design) → settings */}
          <div className="px-6 pt-4 border-t border-outline-variant/30">
            {sidebarOpen ? (
              <button
                type="button"
                onClick={() => onNavigate("settings")}
                className="w-full flex items-center gap-3 text-left cursor-pointer group"
                aria-label="Open settings"
              >
                <span className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-xs font-bold shrink-0">
                  {isLoggedIn ? (user?.public_id?.[0] || "R") : "R"}
                </span>
                <span className="min-w-0">
                  <span className="font-body-sm text-body-sm text-on-surface block truncate">
                    {isLoggedIn ? (user?.public_id || "Guest") : "Guest"}
                  </span>
                  <span className="font-body-sm text-xs text-on-surface-variant block truncate">
                    {isLoggedIn ? `${Number(user?.credits ?? 0).toLocaleString()} credits${user?.unlimited ? " · Unl." : ""}` : "Sign in"}
                  </span>
                </span>
              </button>
            ) : (
              <div className="flex justify-center">
                <span className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-xs font-bold">
                  {isLoggedIn ? (user?.public_id?.[0] || "R") : "R"}
                </span>
              </div>
            )}
          </div>
        </aside>

        {/* ── MAIN CONTENT CANVAS ─────────────────────────────────────────── */}
        <main id="main-content" className="min-w-0 w-full overflow-x-hidden p-4 sm:p-8 pb-24 md:pb-12">
          <div className="max-w-[1400px] mx-auto">
            {children}
          </div>
        </main>

        {/* ── FOOTER (A6) ─────────────────────────────────────────────────── */}
        <footer role="contentinfo" className="border-t border-outline-variant/20 text-on-surface-variant text-[11px] text-center px-4 pt-3 pb-20 md:pb-4">
          <div className="flex items-center justify-center gap-x-5 gap-y-1 flex-wrap">
            <span>© 2026 Helpotron Academic Companion</span>
            <button
              type="button"
              onClick={() => onNavigate("privacy")}
              className="hover:text-on-surface underline underline-offset-2 transition cursor-pointer"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => onNavigate("terms")}
              className="hover:text-on-surface underline underline-offset-2 transition cursor-pointer"
            >
              Terms of Service
            </button>
          </div>
        </footer>
      </div>

      {/* ── MOBILE STICKY BOTTOM NAVIGATION BAR ────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-outline-variant/20 px-4 pt-2 pb-safe flex items-center justify-around"
        aria-label="Mobile Bottom Navigation"
      >
        {[
          { key: "overview", label: "Home", Icon: Home },
          { key: "agent", label: "Agent", Icon: Brain },
          { key: "insights", label: "Insights", Icon: BarChart3 },
          { key: "history", label: "History", Icon: History },
        ].map((t) => {
          const selected = activeView === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onNavigate(t.key)}
              aria-current={selected ? "page" : undefined}
              className={`flex flex-col items-center justify-center rounded-xl px-4 py-1 transition-all ${
                selected
                  ? "bg-primary-container text-on-primary-container scale-90 font-semibold"
                  : "text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"
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

      {newSessionOpen && (
        <NewAssignmentModal
          onClose={() => setNewSessionOpen(false)}
          onCreated={(newAssign) => {
            setNewSessionOpen(false);
            onNavigate("overview");
            window.dispatchEvent(new CustomEvent("helpotron:assignment-created", { detail: newAssign }));
          }}
        />
      )}
    </>
  );
}
