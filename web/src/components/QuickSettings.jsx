import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Bell,
  ShieldCheck,
  LogOut,
  Sparkles,
  Sun,
  Moon,
  Monitor,
  Coins,
  Cpu,
} from 'lucide-react';
import { AvatarWidget } from './ui/AvatarWidget.jsx';
import api from '../api.js';

const EFFORT_OPTIONS = [
  { key: 'low', label: 'Low' },
  { key: 'balanced', label: 'Balanced' },
  { key: 'high', label: 'High' },
];

const THEME_OPTIONS = [
  { key: 'dark', label: 'Dark', Icon: Moon },
  { key: 'light', label: 'Light', Icon: Sun },
  { key: 'system', label: 'Auto', Icon: Monitor },
];

/**
 * QuickSettings — LUMINOUS GLASS Popover (Spec 3.1.4)
 * w-80 rounded-2xl bg-surface-container-low border shadow-2xl
 */
export default function QuickSettings({
  settings,
  onChange,
  onOpenFull,
  onOpenNotifications,
  onOpenPrivacy,
  onLogout,
  user,
}) {
  const containerRef = useRef(null);

  const set = (path, value) => {
    const next = JSON.parse(JSON.stringify(settings));
    const keys = path.split('.');
    let obj = next;
    while (keys.length > 1) {
      const k = keys.shift();
      if (!obj[k]) obj[k] = {};
      obj = obj[k];
    }
    obj[keys[0]] = value;
    onChange(next);
  };

  // Keyboard trap / Escape handler
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onOpenFull?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenFull]);

  const currentTheme = settings?.appearance?.theme || 'dark';
  const currentEffort = settings?.ai?.effort || 'balanced';

  return (
    <div
      ref={containerRef}
      role="menu"
      aria-label="Quick Settings Menu"
      className="w-80 p-4 space-y-4 rounded-2xl bg-surface-container-low/95 backdrop-blur-xl border border-outline-variant/30 shadow-2xl text-on-surface"
    >
      {/* Identity Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-outline-variant/20">
        <AvatarWidget user={user} avatarUrl={settings?.profile?.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-on-surface truncate">
            {settings?.profile?.displayName || user?.public_id || 'Student'}
          </div>
          <div className="text-[11px] font-mono text-on-surface-variant truncate">
            {user?.public_id || 'guest-session'}
          </div>
        </div>
      </div>

      {/* WalletLine Component */}
      <div className="p-3 rounded-xl bg-surface-container/60 border border-outline-variant/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-primary" /> Wallet Telemetry
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-sem-green/15 text-sem-green font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-sem-green animate-pulse" />
            Active
          </span>
        </div>
        <div className="flex items-baseline justify-between font-mono">
          <div>
            <span className="text-[10px] text-on-surface-variant block">CREDITS</span>
            <span className="text-sm font-semibold text-primary tabular-nums">
              {Number(user?.credits ?? 0).toLocaleString()} cr
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-on-surface-variant block">TOKENS</span>
            <span className="text-sm font-semibold text-secondary tabular-nums">
              {user?.unlimited ? '∞' : Number(user?.token_balance ?? 0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Theme Selection */}
      <div>
        <div className="text-[11px] font-mono text-on-surface-variant uppercase tracking-wider mb-1.5">
          Theme Mode
        </div>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-container border border-outline-variant/20">
          {THEME_OPTIONS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => set('appearance.theme', key)}
              className={[
                'flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer select-none',
                currentTheme === key
                  ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high',
              ].join(' ')}
              aria-pressed={currentTheme === key}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* AI Effort Dial */}
      <div>
        <div className="text-[11px] font-mono text-on-surface-variant uppercase tracking-wider mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5 text-primary" /> AI Effort
          </span>
          <span className="text-[10px] text-primary capitalize font-medium">{currentEffort}</span>
        </div>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-container border border-outline-variant/20">
          {EFFORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => set('ai.effort', key)}
              className={[
                'py-1.5 rounded-lg text-xs font-medium transition cursor-pointer select-none text-center',
                currentEffort === key
                  ? 'bg-primary text-on-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high',
              ].join(' ')}
              aria-pressed={currentEffort === key}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Action Links */}
      <div className="pt-2 border-t border-outline-variant/20 space-y-1">
        {onOpenFull && (
          <button
            type="button"
            onClick={onOpenFull}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer min-h-[44px]"
          >
            <Settings className="w-4 h-4 text-primary" /> Settings & Preferences
          </button>
        )}
        {onOpenNotifications && (
          <button
            type="button"
            onClick={onOpenNotifications}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer min-h-[44px]"
          >
            <Bell className="w-4 h-4 text-secondary" /> Notification Feed
          </button>
        )}
        {onOpenPrivacy && (
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer min-h-[44px]"
          >
            <ShieldCheck className="w-4 h-4" /> Privacy & Data Retention
          </button>
        )}
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-error hover:bg-error-container/20 transition cursor-pointer min-h-[44px]"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        )}
      </div>

      {/* Build ID Mono Footer */}
      <div className="pt-2 border-t border-outline-variant/15 flex items-center justify-between text-[10px] font-mono text-on-surface-variant select-none">
        <span>Helpotron OS</span>
        <span>build {typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'v4.0.0'}</span>
      </div>
    </div>
  );
}
