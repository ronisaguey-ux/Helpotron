/* ────────────────────────────────────────────────────────────────────────────
 * ErrorState.jsx — ErrorState Family (Stitch v6 LUMINOUS GLASS M3 / §3.21)
 * Accessible fault & exception vectors (404, 401, 502/500, network)
 * Features: role="main", dot grid via var(--st-outline), reduced-motion support,
 * dark/light M3 design tokens, and mobile 44px touch targets.
 * ────────────────────────────────────────────────────────────────────────── */
import React from 'react';
import {
  Compass, Lock, AlertTriangle, WifiOff, Home, RefreshCw,
  ArrowRight, ShieldAlert, Bug
} from 'lucide-react';

const ERROR_CONFIGS = {
  404: {
    code: '404',
    tag: 'ERR_ROUTER_NODE_UNRESOLVED',
    headline: 'Lost in the Stacks',
    description: 'The study material, route, or ledger address you requested does not resolve in this iteration of the Helpotron OS.',
    icon: Compass,
    accent: 'primary',
    accentBorder: 'border-primary/30',
    accentBg: 'bg-primary/10',
    accentText: 'text-primary',
    primaryLabel: 'Return to Dashboard',
    primaryAction: 'overview',
  },
  401: {
    code: '401',
    tag: 'ERR_AUTH_LEASE_EXPIRED',
    headline: 'Session Expired',
    description: 'Your session has expired. Sign in again to continue your work.',
    icon: Lock,
    accent: 'secondary',
    accentBorder: 'border-secondary/30',
    accentBg: 'bg-secondary/10',
    accentText: 'text-secondary',
    primaryLabel: 'Sign In Again',
    primaryAction: 'login',
  },
  502: {
    code: '502',
    tag: 'ERR_COMPILATION_FAULT',
    headline: 'Kernel Exception Vector',
    description: 'Backend model execution timeout or unhandled AST synthesis error. The isolated sandbox has intercepted the panic.',
    icon: AlertTriangle,
    accent: 'error',
    accentBorder: 'border-error/30',
    accentBg: 'bg-error/10',
    accentText: 'text-error',
    primaryLabel: 'Retry Operation',
    primaryAction: 'retry',
  },
  500: {
    code: '500',
    tag: 'ERR_INTERNAL_SERVER_FAULT',
    headline: 'Internal System Anomaly',
    description: 'An unexpected exception occurred within the local or upstream inference node. State has been checkpointed.',
    icon: AlertTriangle,
    accent: 'error',
    accentBorder: 'border-error/30',
    accentBg: 'bg-error/10',
    accentText: 'text-error',
    primaryLabel: 'Reload Dashboard',
    primaryAction: 'overview',
  },
  network: {
    code: 'NET',
    tag: 'ERR_SOCKET_DISCONNECT',
    headline: 'Network Partition Detected',
    description: 'Connection to the central Helpotron node was interrupted. Operating in local offline persistence mode.',
    icon: WifiOff,
    accent: 'sem-amber',
    accentBorder: 'border-sem-amber/30',
    accentBg: 'bg-sem-amber/10',
    accentText: 'text-sem-amber',
    primaryLabel: 'Force Reconnect',
    primaryAction: 'retry',
  },
};

export default function ErrorState({
  type = '404',
  title,
  message,
  onPrimaryAction,
  onSecondaryAction,
  primaryLabel,
  secondaryLabel,
  className = '',
}) {
  const config = ERROR_CONFIGS[type] || ERROR_CONFIGS['404'];
  const Icon = config.icon;

  const handlePrimary = () => {
    if (onPrimaryAction) {
      onPrimaryAction();
    } else if (config.primaryAction === 'overview') {
      window.location.href = '/';
    } else if (config.primaryAction === 'retry') {
      window.location.reload();
    }
  };

  return (
    <div
      role="main"
      aria-label={title || `${config.code} ${config.headline}`}
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

        {/* Telemetry Tag */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-high border border-outline-variant/30">
          <span className={`w-1.5 h-1.5 rounded-full ${config.accentBg} ${config.accentText} animate-pulse motion-reduce:animate-none`} />
          <span className={`font-mono text-[10px] uppercase tracking-widest ${config.accentText} font-bold`}>
            {config.tag}
          </span>
        </div>

        {/* Headline */}
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
            {config.code} <span className="font-mono text-outline-variant text-2xl font-normal">//</span> {title || config.headline}
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-variant max-w-md mx-auto leading-relaxed">
            {message || config.description}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={handlePrimary}
            className="min-h-[44px] w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-sm active:scale-95"
          >
            <Home className="w-4 h-4" />
            <span>{primaryLabel || config.primaryLabel}</span>
          </button>

          {onSecondaryAction ? (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="min-h-[44px] w-full sm:w-auto px-5 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/30 font-semibold text-xs transition cursor-pointer active:scale-95"
            >
              <span>{secondaryLabel || 'Diagnostics'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] w-full sm:w-auto px-5 py-2.5 rounded-xl bg-surface-container-high/60 hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-outline-variant/30 font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Force Reload</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
