/* ────────────────────────────────────────────────────────────────────────────
 * ErrorState.jsx — the full-page error surface.
 *
 * THE SHAPE IS THE POINT. Every error state on this surface carries three
 * things, and this component exists to make that structural rather than a
 * convention someone has to remember:
 *
 *   1. SHOWCASE     — a concise statement of what went wrong. A short headline
 *                     plus an honest status pill. No invented ERR_* codes.
 *   2. EXPLANATION  — why it happened, in words a person would use, plus the
 *                     one useful piece of reassurance ("nothing was saved yet").
 *   3. CALL TO ACTION — what the user can actually DO about THIS error. Not the
 *                     same "Try Again" everywhere: a stale deploy needs its
 *                     cache cleared, an expired session needs a sign-in, a
 *                     server fault needs a report.
 *
 * ⚠️ THE COPY IN HERE IS USER-FACING AND MUST STAY HONEST.
 * It previously carried invented machine codes — ERR_ROUTER_NODE_UNRESOLVED,
 * ERR_COMPILATION_FAULT, "Kernel Exception Vector", "Network Partition
 * Detected" — plus a description claiming the model had "intercepted the
 * panic" and that the app was "operating in local offline persistence mode".
 * None of that was true; it was decorative text styled to look like a backend
 * diagnostic. The owner's report was "the errors literally just flash random
 * backend code on my screen", and this component was a large part of it.
 *
 * The rule for this file: say what happened, in the words a person would use,
 * and offer the one action that helps. A status code is fine — 404 and 500 are
 * meaningful and a support request benefits from them. An invented error CODE
 * is not.
 *
 * Errors raised in code reach this surface through humanError() (lib/errors.js),
 * which supplies `actions` — so a new error cannot silently ship without a call
 * to action.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import {
  Compass, Lock, AlertTriangle, WifiOff, Home, RefreshCw, PackageX,
} from 'lucide-react';
import ErrorReportButton from './ErrorReportButton.jsx';
import { runErrorAction } from '../../lib/errorActions.js';
import { humanError } from '../../lib/errors.js';

const ERROR_CONFIGS = {
  404: {
    code: '404',
    tag: 'Not found',
    headline: 'Page not found',
    description: "We couldn't find that page. It may have been moved, or the link may be out of date.",
    icon: Compass,
    accent: 'primary',
    accentBorder: 'border-primary/30',
    accentBg: 'bg-primary/10',
    accentText: 'text-primary',
  },
  401: {
    code: '401',
    tag: 'Sign in',
    headline: 'Session expired',
    description: 'You have been signed out. Sign in again to pick up where you left off.',
    icon: Lock,
    accent: 'secondary',
    accentBorder: 'border-secondary/30',
    accentBg: 'bg-secondary/10',
    accentText: 'text-secondary',
  },
  403: {
    code: '403',
    tag: 'Not allowed',
    headline: "You don't have access to this",
    description: 'Your account is signed in, but it is not permitted to view this. If you think that is wrong, support can check it.',
    icon: Lock,
    accent: 'secondary',
    accentBorder: 'border-secondary/30',
    accentBg: 'bg-secondary/10',
    accentText: 'text-secondary',
  },
  502: {
    code: '502',
    tag: 'Temporarily unavailable',
    headline: 'The server is restarting',
    description: 'It should be back in a few seconds. Your work has not been lost.',
    icon: AlertTriangle,
    accent: 'error',
    accentBorder: 'border-error/30',
    accentBg: 'bg-error/10',
    accentText: 'text-error',
  },
  503: {
    code: '503',
    tag: 'Temporarily unavailable',
    headline: 'The server is busy',
    description: 'It is briefly unavailable — usually for a few seconds. Nothing you saved is affected.',
    icon: AlertTriangle,
    accent: 'error',
    accentBorder: 'border-error/30',
    accentBg: 'bg-error/10',
    accentText: 'text-error',
  },
  500: {
    code: '500',
    tag: 'Server problem',
    headline: 'Something went wrong on our end',
    description: 'This was not caused by anything you did. Trying again often works; if it keeps happening, send us the report.',
    icon: AlertTriangle,
    accent: 'error',
    accentBorder: 'border-error/30',
    accentBg: 'bg-error/10',
    accentText: 'text-error',
  },
  'stale-deploy': {
    code: null,
    tag: 'Update available',
    headline: 'A newer version is available',
    description: 'This tab is running an older version of the app, so part of it could not load. Reloading picks up the latest — nothing you have saved is affected.',
    icon: PackageX,
    accent: 'sem-amber',
    accentBorder: 'border-sem-amber/30',
    accentBg: 'bg-sem-amber/10',
    accentText: 'text-sem-amber',
  },
  network: {
    code: 'Offline',
    tag: 'No connection',
    headline: "You're offline",
    description: 'We could not reach the server. Check your internet connection, then try again.',
    icon: WifiOff,
    accent: 'sem-amber',
    accentBorder: 'border-sem-amber/30',
    accentBg: 'bg-sem-amber/10',
    accentText: 'text-sem-amber',
  },
};

// Icons per action kind, so the call to action reads at a glance.
const ACTION_ICONS = {
  retry: RefreshCw,
  refresh: RefreshCw,
  'clear-cache': RefreshCw,
  'sign-in': Lock,
  'go-home': Home,
  report: AlertTriangle,
  contact: AlertTriangle,
  'fix-fields': AlertTriangle,
};

export default function ErrorState({
  type = '404',
  title,
  message,
  hint,
  onPrimaryAction,
  onSecondaryAction,
  primaryLabel,
  secondaryLabel,
  error,
  onRetry,
  onReport,
  onContact,
  className = '',
}) {
  const [busyAction, setBusyAction] = useState(null);

  // If a real error object was supplied, let it decide the copy AND the call to
  // action — that is the whole reason humanError() returns `actions`.
  const derived = error ? humanError(error) : null;
  const config = ERROR_CONFIGS[type] || ERROR_CONFIGS['404'];
  const Icon = config.icon;

  const headline = title || (derived && derived.title) || config.headline;
  const explanation = message || (derived && derived.message) || config.description;
  const tip = hint || (derived && derived.hint) || '';
  const statusLabel = config.code || (derived && derived.status ? String(derived.status) : null);

  // The action list: an explicit override wins, otherwise the derived actions,
  // otherwise a safe default. There is never an empty list — an error screen
  // with nothing to do is the failure this component exists to prevent.
  const actions = (derived && derived.actions && derived.actions.length)
    ? derived.actions
    : [{ kind: 'retry', label: primaryLabel || 'Try again' }];

  const handleAction = async (action) => {
    if (busyAction) return;
    setBusyAction(action.kind);
    try {
      const did = await runErrorAction(action, {
        onRetry: onRetry || onPrimaryAction,
        onReport,
        onContact,
        error,
      });
      // A 'fix-fields' action that found no field is not a failure worth
      // shouting about — fall through so the user can still see the tip.
      if (!did && action.kind === 'report' && onSecondaryAction) onSecondaryAction();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      role="main"
      aria-label={headline}
      className={`relative min-h-[60vh] w-full flex items-center justify-center p-6 select-none overflow-hidden ${className}`}
    >
      {/* Background Dot Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle at center, var(--st-outline, currentColor) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden="true"
      />

      {/* Atmospheric Blur Radial Glows */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-primary/10 blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-secondary/10 blur-3xl pointer-events-none -z-10" />

      {/* Center Glass Cockpit Card */}
      <div className="relative z-10 w-full max-w-lg mx-auto p-8 sm:p-12 text-center rounded-3xl bg-surface-container-lowest/80 backdrop-blur-2xl border border-outline-variant/30 shadow-2xl space-y-6">
        {/* Orbital SVG Radar / Icon Art */}
        <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border border-outline-variant/40 animate-spin motion-reduce:animate-none"
            style={{ animationDuration: '24s' }}
          />
          <div
            className={`absolute inset-2 rounded-full border-2 ${config.accentBorder} animate-ping motion-reduce:animate-none`}
            style={{ animationDuration: '4s' }}
          />
          <div className={`w-20 h-20 rounded-2xl ${config.accentBg} border ${config.accentBorder} flex items-center justify-center shadow-inner`}>
            <Icon className={`w-10 h-10 ${config.accentText} transition-transform`} />
          </div>
        </div>

        {/* ── 1. SHOWCASE ────────────────────────────────────────────────
            A plain status pill. A status code is honest and useful in a
            support request; an invented ERR_* code is neither. */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-high border border-outline-variant/30">
          <span className={`w-1.5 h-1.5 rounded-full ${config.accentBg} ${config.accentText} animate-pulse motion-reduce:animate-none`} />
          <span className={`font-mono text-[10px] uppercase tracking-widest ${config.accentText} font-bold`}>
            {statusLabel ? `${config.tag} · ${statusLabel}` : config.tag}
          </span>
        </div>

        {/* ── 1b. SHOWCASE: the headline ─────────────────────────────── */}
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
          {headline}
        </h1>

        {/* ── 2. EXPLANATION ─────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs sm:text-sm text-on-surface-variant max-w-md mx-auto leading-relaxed">
            {explanation}
          </p>
          {tip ? (
            <p className="text-[11px] text-on-surface-variant/70 max-w-md mx-auto leading-relaxed">
              {tip}
            </p>
          ) : null}
        </div>

        {/* ── 3. CALL TO ACTION ──────────────────────────────────────────
            The primary action is the one that fits this error. A report is
            offered as a secondary where the fault is ours. */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          {actions.slice(0, 1).map((action) => {
            const ActionIcon = ACTION_ICONS[action.kind] || RefreshCw;
            const isBusy = busyAction === action.kind;
            return (
              <button
                key={action.kind}
                type="button"
                onClick={() => handleAction(action)}
                disabled={Boolean(busyAction)}
                aria-busy={isBusy ? 'true' : undefined}
                className="min-h-[44px] w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-sm active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <ActionIcon className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} />
                <span>{isBusy ? 'Working…' : action.label}</span>
              </button>
            );
          })}

          {/* The second action, when there is one, is quieter. */}
          {actions.length > 1 && actions[1].kind !== 'report' ? (
            <button
              type="button"
              onClick={() => handleAction(actions[1])}
              disabled={Boolean(busyAction)}
              className="min-h-[44px] w-full sm:w-auto px-5 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/30 font-semibold text-xs transition cursor-pointer active:scale-95 disabled:opacity-70"
            >
              <span>{actions[1].label}</span>
            </button>
          ) : null}

          {/* The report affordance appears only when reporting is the RIGHT
              action for this error — a wrong password or a rejected form field
              is not ours to fix, and offering "report" there trains users to
              file noise. It carries no readable diagnostics: the bundle is
              sealed before it leaves. See ErrorReportButton. */}
          {actions.some((a) => a.kind === 'report') ? (
            <ErrorReportButton
              error={derived ? { ...error, ...derived } : error}
              title={headline}
              kind={derived ? derived.kind : undefined}
              surface="web"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
