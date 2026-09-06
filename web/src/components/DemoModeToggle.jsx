/* ────────────────────────────────────────────────────────────────────────────
 * DemoModeToggle.jsx — Top Bar Mock Environment Switch (Stitch v6 / §3.23)
 * FlaskConical + sem-amber indicator switch. Persists in localStorage.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { isDemoMode, setDemoMode } from '../mock.js';

export default function DemoModeToggle() {
  const [on, setOn] = useState(() => isDemoMode());

  function toggle() {
    setDemoMode(!on);
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      role="switch"
      aria-label={on ? 'Demo mock data active — click to switch to live app' : 'Live app active — click to preview mock demo data'}
      title={on ? 'Demo mode ON — click to switch to live backend' : 'Live app — click to preview populated demo sandbox'}
      className={`hidden md:flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-xl border text-xs font-mono font-bold transition cursor-pointer select-none min-h-[36px] ${
        on
          ? 'bg-sem-amber/15 border-sem-amber/40 text-sem-amber hover:bg-sem-amber/25 shadow-sm'
          : 'bg-surface-container-low/70 border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
      }`}
    >
      <FlaskConical className={`w-3.5 h-3.5 ${on ? 'text-sem-amber animate-pulse' : 'text-on-surface-variant'}`} />
      <span className="tracking-wider">SANDBOX</span>
      <span className={`px-1.5 py-0.5 rounded text-[10px] leading-none ${on ? 'bg-sem-amber/25 text-sem-amber' : 'bg-surface-container-high text-on-surface-variant'}`}>
        {on ? 'DEMO' : 'LIVE'}
      </span>
    </button>
  );
}
