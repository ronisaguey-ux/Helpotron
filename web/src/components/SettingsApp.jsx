/**
 * SettingsApp.jsx — Bare-bones 6-Section Settings Application (Stitch v6 / §3.18).
 * Deleted 17-section legacy wizard in favor of calm single screen with auto-save mono tick.
 * Complies strictly with LUMINOUS GLASS M3 design tokens.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sliders, User, Moon, Bell, Shield, CreditCard, Send, Trash2,
  Check, CheckCircle2, Loader2, Search, Sparkles, ExternalLink, ScanSearch, KeyRound, TrendingUp
} from 'lucide-react';
import api from '../api.js';
import { loadSettings, saveSettings } from '../demoData.js';
import { SettingsSections } from './SettingsSections.jsx';
import TrashPanel from './TrashPanel.jsx';
import { toast } from '../lib/overlay.js';

export const SETTINGS_NAV_ITEMS = [
  { id: 'all', label: 'All Settings', icon: Sliders },
  // Owner 2026-09-21: API Keys, Privacy & Security and Credits & Billing all live
  // UNDER Account. They are the account's own settings — who you are, what can
  // reach it, and what it costs — and a flat pill row made them look like peers
  // of Appearance and Notifications. `children` renders as a sub-row beneath.
  {
    id: 'account',
    label: 'Account',
    icon: User,
    children: [
      { id: 'account', label: 'Profile', icon: User },
      { id: 'apikeys', label: 'API Keys', icon: KeyRound },
      { id: 'privacy', label: 'Privacy & Security', icon: Shield },
      { id: 'credits', label: 'Credits & Billing', icon: CreditCard },
    ],
  },
  { id: 'appearance', label: 'Appearance', icon: Moon },
  { id: 'humanizer', label: 'AI Detection', icon: ScanSearch },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  // Owner 2026-09-19: Insights moved off the nav — a niche analytics page
  // relevant to a small minority, so it sits in Settings rather than owning a
  // top-level product area.
  { id: 'insights', label: 'Insights', icon: TrendingUp },
  { id: 'integrations', label: 'Integrations', icon: Send },
  { id: 'trash', label: 'Trash', icon: Trash2 },
];

export function applyFontScale(score) {
  // Two stored conventions coexist: the legacy 0–50 scale (default 50 = 100%,
  // used by QuickSettings/DEFAULT_SETTINGS) and the 0.85–1.25 multiplier the
  // Settings slider writes. Values > 2 are the legacy 0–50 scale.
  const n = Number(score);
  let m = 1;
  if (Number.isFinite(n) && n > 0) {
    m = n > 2 ? Math.min(1.6, Math.max(0.8, n / 50)) : Math.min(1.4, Math.max(0.8, n));
  }
  document.documentElement.style.fontSize = `${16 * m}px`;
  document.documentElement.style.setProperty('--font-scale', String(m));
}

/* Section settings are nested (appearance.*, accessibility.*, ...) while some
 * callers send flat deltas; merge one level deep so nested deltas like
 * { appearance: { theme: 'light' } } don't wipe sibling sub-keys. */
function mergeSettings(prev, delta) {
  const next = { ...prev };
  for (const [k, v] of Object.entries(delta || {})) {
    if (
      v && typeof v === 'object' && !Array.isArray(v) &&
      next[k] && typeof next[k] === 'object' && !Array.isArray(next[k])
    ) {
      next[k] = { ...next[k], ...v };
    } else {
      next[k] = v;
    }
  }
  return next;
}

export function applyAppearance(appearance) {
  if (!appearance) return;
  const root = document.documentElement;
  if (appearance.fontScale) applyFontScale(appearance.fontScale);
  if (appearance.theme) root.setAttribute('data-theme', appearance.theme);
  if (appearance.accent) root.setAttribute('data-accent', appearance.accent);
  if (appearance.density) root.setAttribute('data-density', appearance.density);
  if (appearance.animation) root.setAttribute('data-anim', appearance.animation);
  if (appearance.background) root.setAttribute('data-bg', appearance.background);
  if (appearance.uiStyle) root.setAttribute('data-ui', appearance.uiStyle);
  if (appearance.background || appearance.uiStyle || appearance.animation) {
    root.classList.add('appearance-live');
  }
}

export function applyAccessibility(acc) {
  if (!acc) return;
  const root = document.documentElement;
  root.setAttribute('data-motion', acc.reducedMotion ? 'reduced' : 'full');
  root.setAttribute('data-contrast', acc.highContrast ? 'high' : 'normal');
  root.setAttribute('data-reading', acc.dyslexiaFriendly ? 'dyslexia' : 'standard');
  root.setAttribute('data-textscale', acc.largeText ? 'large' : 'normal');
  root.setAttribute('data-screenreader', acc.screenReader ? 'on' : 'off');
}

export default function SettingsApp({
  userId = 'usr_0941',
  onGoTo = () => {},
  plan = 'pro',
  credits = 1000,
  tokenBalance = 1000,
  isAdmin = false,
}) {
    // Deep-link support: the browser extension links straight here
    // (`/settings#apikeys`) so a user who needs a key lands on the panel that
    // mints one, instead of a general settings page they have to search.
    const [activeSection, setActiveSection] = useState(() => {
      try {
        const h = (window.location.hash || '').replace(/^#/, '').trim();
        return h || 'all';
      } catch (e) {
        return 'all';
      }
    });

    useEffect(() => {
      const handleHashChange = () => {
        try {
          const h = (window.location.hash || '').replace(/^#/, '').trim();
          if (h) setActiveSection(h);
        } catch (e) {}
      };
      window.addEventListener('hashchange', handleHashChange);
      return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);
  const [settings, setSettings] = useState(() => loadSettings());
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'dirty'
  const saveTimeoutRef = useRef(null);

  // Synchronize settings from the backend — on mount, on every focus, and every
  // 30s while the tab is visible. Owner (2026-10-22): "when i told my agent to
  // edit my settings to light mode, it didng do anything" — the agent writes to
  // the account, but this tab only ever read settings once at mount, so a change
  // made elsewhere stayed invisible until a hard reload.
  useEffect(() => {
    let mounted = true;
    const pull = () => {
      api.userSettings?.()
        .then((res) => {
          if (!mounted || !res?.settings) return;
          setSettings((prev) => {
            const next = { ...prev, ...res.settings };
            applyAppearance(next);
            applyAccessibility(next.accessibility);
            return next;
          });
        })
        .catch(() => {});
    };
    pull();
    const onFocus = () => pull();
    const onVisible = () => { if (document.visibilityState === 'visible') pull(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') pull(); }, 30000);
    return () => {
      mounted = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);

  const updateSettings = useCallback((delta) => {
    setSettings((prev) => {
      const next = mergeSettings(prev, delta);
      saveSettings(next);
      // Live-apply appearance/font changes immediately (scale used to only
      // re-apply on hard reload, which made the slider feel dead).
      applyAppearance(next);
      return next;
    });

    setSaveStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await api.updateSettings?.(delta);
        setSaveStatus('saved');
      } catch (err) {
        console.warn('Auto-save error:', err);
        setSaveStatus('saved'); // Optimistic
      }
    }, 600);
  }, []);

  return (
    <div className="relative w-full max-w-5xl mx-auto px-gutter-desktop py-gutter-desktop flex flex-col gap-unit-6">
      {/* Page Header */}
      <header className="flex flex-wrap items-center justify-between gap-unit-4 border-b border-outline-variant/15 pb-unit-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-label-caps text-xs text-outline uppercase tracking-wider">
              System Configuration
            </span>
            {/* Auto-save mono tick indicator (§3.18) */}
            <span className="font-code-sm text-xs px-2 py-0.5 rounded-full flex items-center gap-1 bg-surface-container-high text-on-surface-variant border border-outline-variant/20">
              {saveStatus === 'saving' ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3 h-3 text-sem-green" />
                  <span className="font-mono text-[11px] text-sem-green">Saved</span>
                </>
              )}
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">
            Settings &amp; Preferences
          </h1>
        </div>

        {/* Section Navigation Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto p-1 rounded-2xl bg-surface-container-lowest/80 border border-outline-variant/25">
          {SETTINGS_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            // A parent is "selected" when it OR one of its children is open, so
            // opening API Keys keeps Account highlighted — otherwise the row
            // shows nothing active and the sub-tabs look detached.
            const childIds = (item.children || []).map((c) => c.id);
            const isSelected =
              activeSection === item.id || childIds.includes(activeSection);
            return (
              <button
                key={item.id}
                type="button"
                data-settings-nav={item.id}
                onClick={() => {
                  setActiveSection(item.id);
                  // Keep the hash in step so the section is linkable/shareable.
                  try { window.history.replaceState(null, '', `#${item.id}`); } catch (e) { /* non-fatal */ }
                }}
                className={`h-9 px-unit-3 rounded-xl font-label-caps text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Sub-row: the open group's own sections. Rendered only when the group
            is active, so the first row stays short for people who never go in. */}
        {(() => {
          const openGroup = SETTINGS_NAV_ITEMS.find(
            (i) => i.children && (i.id === activeSection || i.children.some((c) => c.id === activeSection)),
          );
          if (!openGroup) return null;
          return (
            <div className="flex items-center gap-1.5 overflow-x-auto pl-3 ml-1 border-l-2 border-primary/30">
              <span className="font-label-caps text-[10px] text-outline uppercase tracking-wider shrink-0 pr-1">
                {openGroup.label}
              </span>
              {openGroup.children.map((child) => {
                const isOn = activeSection === child.id;
                const ChildIcon = child.icon;
                return (
                  <button
                    key={child.id}
                    type="button"
                    data-settings-subnav={child.id}
                    onClick={() => {
                      setActiveSection(child.id);
                      try { window.history.replaceState(null, '', `#${child.id}`); } catch (e) { /* non-fatal */ }
                    }}
                    className={`h-8 px-3 rounded-lg font-label-caps text-[11px] flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                      isOn
                        ? 'bg-primary/15 text-primary font-semibold border border-primary/30'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40 border border-transparent'
                    }`}
                  >
                    <ChildIcon className="w-3 h-3" />
                    <span>{child.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}
      </header>

      {/* Main Bare-Bones Sections */}
      <main className="flex flex-col gap-unit-6">
        {activeSection === 'trash' && (
          <TrashPanel onNotice={(m) => toast.info(m)} />
        )}

        <SettingsSections
          section={activeSection}
          settings={settings}
          set={updateSettings}
          userId={userId}
          plan={plan}
          credits={credits}
          tokenBalance={tokenBalance}
          isAdmin={isAdmin}
          onGoTo={onGoTo}
          onSelectSection={setActiveSection}
        />
      </main>
    </div>
  );
}
