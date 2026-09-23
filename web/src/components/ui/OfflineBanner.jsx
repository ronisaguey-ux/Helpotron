/* ────────────────────────────────────────────────────────────────────────────
 * OfflineBanner.jsx — Offline Persistence Mode Strip (Stitch v6 / §3.22)
 * Dispatches automatically on window online/offline events.
 * Role="status", sem-amber luminous glass styling, and "Force Reconnect" trigger.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(() => {
    return typeof navigator !== 'undefined' && !navigator.onLine;
  });
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      const res = await fetch('/health', { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        setIsOffline(false);
      }
    } catch {
      // Still offline
    } finally {
      setTimeout(() => setReconnecting(false), 800);
    }
  };

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-sem-amber/15 backdrop-blur-xl border-b border-sem-amber/30 px-4 py-2.5 shadow-md flex items-center justify-between gap-4 text-xs select-none z-50 sticky top-0"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-6 h-6 rounded-lg bg-sem-amber/20 flex items-center justify-center text-sem-amber shrink-0">
          <WifiOff className="w-3.5 h-3.5" />
        </div>
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* 1. SHOWCASE */}
          <span className="font-mono text-[11px] font-bold text-sem-amber uppercase tracking-wider">
            You're offline
          </span>
          {/* 2. EXPLANATION — always visible. This was `hidden md:inline`, so a
              narrow window showed the banner with no explanation of what it
              meant or what would happen to the user's work. A short version now
              shows at every width, and the fuller one takes over when there is
              room. */}
          <span className="text-on-surface md:hidden truncate">
            Changes are saved on this device.
          </span>
          <span className="text-on-surface hidden md:inline truncate">
            Changes you make are saved here and will sync when the connection returns.
          </span>
        </div>
      </div>

      {/* 3. CALL TO ACTION */}
      <button
        type="button"
        onClick={handleReconnect}
        disabled={reconnecting}
        aria-busy={reconnecting ? 'true' : undefined}
        className="min-h-[36px] px-3 py-1 rounded-lg bg-sem-amber/20 hover:bg-sem-amber/30 text-sem-amber font-mono text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer active:scale-95 shrink-0 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${reconnecting ? 'animate-spin' : ''}`} />
        <span>{reconnecting ? 'Checking…' : 'Force Reconnect'}</span>
      </button>
    </div>
  );
}
