// Top-bar MOCK DATA toggle — switches the app between hardcoded sample data
// (everything populated, no backend/credits/LLM needed) and the live backend.
// The mode persists in localStorage and the page reloads on change so every
// view re-renders in the selected mode. Amber state labels sample data as
// demo content while it is active.

import { useState } from 'react';
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
      title={on ? 'Showing mock data — click to use the live app' : 'Mock data is off — click to preview the app fully populated'}
      className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition cursor-pointer ${
        on
          ? 'bg-amber-500/15 border-amber-400/40 text-amber-300 hover:bg-amber-500/25'
          : 'bg-white/5 border-white/15 text-slate-400 hover:bg-white/10 hover:text-slate-200'
      }`}
    >
      {on && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />}
      {on ? '🎬 Mock data: ON' : '⚡ Mock data: OFF'}
    </button>
  );
}
