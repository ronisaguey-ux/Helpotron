// Top-bar MOCK DATA switch — flips the app between hardcoded sample data
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
      role="switch"
      aria-label={on ? 'Mock data on — click to use the live app' : 'Mock data off — click to preview the fully populated sample app'}
      title={on ? 'Showing mock (sample) data — click to switch to the live app' : 'Live app — click to preview the fully populated sample data'}
      className={`hidden md:flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-xl border text-[10px] font-mono font-bold transition cursor-pointer select-none ${
        on
          ? 'bg-amber-500/15 border-amber-400/40 text-amber-300 hover:bg-amber-500/25 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
          : 'bg-white/5 border-white/15 text-slate-400 hover:bg-white/10 hover:text-slate-200'
      }`}
    >
      {/* Mock switch */}
      <span
        className={`relative inline-flex w-7 h-4 rounded-full transition-colors ${
          on ? 'bg-amber-500/70' : 'bg-slate-600/60'
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${
            on ? 'left-3.5' : 'left-0.5'
          }`}
        />
      </span>
      <span className="tracking-wide">MOCK</span>
      <span className={`px-1.5 py-0.5 rounded-md text-[9px] leading-none ${on ? 'bg-amber-400/20 text-amber-300' : 'bg-white/8 text-slate-400'}`}>
        {on ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}
