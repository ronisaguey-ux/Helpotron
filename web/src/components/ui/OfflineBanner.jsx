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
          <span className="font-mono text-[11px] font-bold text-sem-amber uppercase tracking-wider">
            OFFLINE PERSISTENCE MODE
          </span>
          <span className="text-on-surface-variant font-mono text-[10px]">· NODE_CACHE_LOCAL</span>
          <span className="text-on-surface hidden md:inline truncate">
            Serving local derivations · Edits queue and re-sync when network resumes.
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleReconnect}
        disabled={reconnecting}
        className="min-h-[32px] px-3 py-1 rounded-lg bg-sem-amber/20 hover:bg-sem-amber/30 text-sem-amber font-mono text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer active:scale-95 shrink-0"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${reconnecting ? 'animate-spin' : ''}`} />
        <span>{reconnecting ? 'Checking...' : 'Force Reconnect'}</span>
      </button>
    </div>
  );
}
