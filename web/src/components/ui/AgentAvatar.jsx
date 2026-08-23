/* ────────────────────────────────────────────────────────────────────────────
 * AgentAvatar.jsx — the sentient "My Agent" persona with live status rings,
 * working-state pulse + visor scanline sweep, and optional video loop.
 *
 *   <AgentAvatar size="lg" status={status} src={ai.avatarUrl} />
 *
 * status: 'ready' | 'working' | 'syncing' | 'error' | 'idle'
 * `src` defaults to the My Agent logo; pass a user-uploaded avatar to override.
 * ──────────────────────────────────────────────────────────────────────────── */
import React from 'react';

export const AgentAvatar = ({
  size = 'md', // 'sm' (28px), 'md' (36px), 'lg' (48px), 'xl' (64px)
  status = 'ready', // 'ready', 'working', 'syncing', 'error', 'idle'
  src = '/My_Agent_logo.jpeg',
  videoSrc = null,
  className = '',
}) => {
  const sizeClasses = {
    sm: 'h-7 w-7',
    md: 'h-9 w-9',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  };

  const statusRing = {
    ready: 'ring-1 ring-emerald-500/40',
    working: 'ring-2 ring-emerald-400 shadow-[0_0_12px_rgba(34,197,94,0.6)]',
    syncing: 'ring-2 ring-cyan-400 animate-pulse',
    error: 'ring-2 ring-amber-500/60',
    idle: 'ring-1 ring-white/10',
  };

  const currentSize = sizeClasses[size] || sizeClasses.md;

  return (
    <div className={`relative inline-flex items-center justify-center ${currentSize} ${className}`}>
      {/* Background Pulse Animation */}
      {status === 'working' && (
        <span className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping" />
      )}

      {/* Avatar Image / Video */}
      <div className={`relative w-full h-full rounded-full overflow-hidden bg-slate-900 ${statusRing[status] || statusRing.ready}`}>
        {videoSrc ? (
          <video
            src={videoSrc}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <img
            src={src}
            alt="My Agent"
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
          />
        )}

        {/* Scanline Sweep on Visor when Working */}
        {status === 'working' && (
          <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-transparent via-cyan-400/25 to-transparent animate-visor-scan pointer-events-none" />
        )}
      </div>

      {/* Status Dot */}
      <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#090d16] ${
        status === 'working' ? 'bg-emerald-400' :
        status === 'syncing' ? 'bg-cyan-400' :
        status === 'error' ? 'bg-amber-500' : 'bg-emerald-500'
      }`} />
    </div>
  );
};

export default AgentAvatar;
