/* ────────────────────────────────────────────────────────────────────────────
 * DemoRibbon.jsx — Demo Mode Labeled Environment (Stitch v6 / §3.23)
 * FlaskConical + sem-amber badge/banner on every demo surface.
 * LIVE MODE NEVER BORROWS IT: if isDemoMode() is false, banner renders null.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import { FlaskConical, RotateCcw, LogOut, ArrowRight, Sparkles } from 'lucide-react';
import { isDemoMode, setDemoMode } from '../mock.js';

/**
 * DemoRibbon — renders persistent banner or corner chip
 * @param {Object} props
 * @param {'banner'|'chip'|'corner'} [props.variant='banner']
 * @param {string} [props.className]
 * @param {() => void} [props.onExit]
 */
export default function DemoRibbon({ variant = 'banner', className = '', onExit = null }) {
  const [active, setActive] = useState(() => isDemoMode());

  if (!active) return null;

  const handleReset = () => {
    // Clear demo mock modifications
    try {
      sessionStorage.clear();
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  const handleExit = () => {
    setDemoMode(false);
    if (onExit) onExit();
    else window.location.reload();
  };

  if (variant === 'chip' || variant === 'corner') {
    return (
      <span
        role="status"
        aria-label="Demonstration simulated data"
        className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-sem-amber bg-sem-amber/15 border border-sem-amber/30 px-2 py-0.5 rounded-md select-none ${className}`}
      >
        <FlaskConical className="w-3 h-3 text-sem-amber animate-pulse" />
        <span>DEMO DATA</span>
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-label="Active demo mode environment notice"
      className={`relative w-full rounded-2xl bg-surface-container-lowest/85 backdrop-blur-xl border border-sem-amber/30 p-3.5 sm:p-4 shadow-xl overflow-hidden select-none mb-4 ${className}`}
    >
      <div className="absolute -right-12 -top-12 w-48 h-48 bg-sem-amber/10 rounded-full blur-2xl pointer-events-none" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 relative z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-sem-amber/15 text-sem-amber shrink-0 border border-sem-amber/25">
            <FlaskConical className="w-5 h-5 animate-pulse" />
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-sem-amber font-bold bg-sem-amber/15 px-2 py-0.5 rounded-md">
                <span className="w-1.5 h-1.5 rounded-full bg-sem-amber animate-ping" />
                DEMO MODE: SIMULATED SANDBOX DATA (READ-ONLY)
              </span>
              <span className="font-mono text-[10px] text-on-surface-variant hidden lg:inline">
                ENV_INSTANCE: sandbox-node-09a2.synth
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5 truncate">
              Sandbox transactions do not consume real task tokens or mutate production database records.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-end md:self-auto">
          <button
            type="button"
            onClick={handleReset}
            className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-surface-container-high/60 hover:bg-surface-container-high text-on-surface font-mono text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 border border-outline-variant/30 active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5 text-on-surface-variant" />
            <span>Reset State</span>
          </button>
          <button
            type="button"
            onClick={handleExit}
            className="min-h-[36px] px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container font-bold text-xs uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            <span>Exit Demo Mode</span>
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export { DemoRibbon };
