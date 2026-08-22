// Floating DEMO MODE toggle — switches the app between hardcoded sample data
// (everything populated, no backend/credits/LLM needed) and the live backend.
// The mode persists in localStorage and the page reloads on change so every
// view re-renders in the selected mode. The amber badge labels sample data as
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
    <>
      {on && (
        <div className="fixed top-3 right-3 z-[100] pointer-events-none">
          <div className="flex items-center gap-2 rounded-full bg-amber-500/15 border border-amber-400/40 px-3 py-1.5 backdrop-blur-sm shadow-lg shadow-amber-500/10">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[11px] font-mono font-bold text-amber-300 tracking-wide">DEMO MODE · sample data</span>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        title={on ? 'Showing sample data — click to use the live app' : 'Sample data is off — click to preview the app fully populated'}
        className={`fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-mono font-bold border shadow-xl backdrop-blur-sm transition-all hover:scale-[1.03] active:scale-[0.97] cursor-pointer ${
          on
            ? 'bg-slate-900/80 border-amber-400/50 text-amber-300 shadow-amber-500/10'
            : 'bg-slate-900/80 border-white/15 text-slate-300 shadow-black/40'
        }`}
      >
        <span aria-hidden="true">{on ? '🎬' : '⚡'}</span>
        {on ? 'Demo data: ON' : 'Demo data: OFF'}
      </button>
    </>
  );
}
