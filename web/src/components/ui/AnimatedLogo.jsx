/* ────────────────────────────────────────────────────────────────────────────
 * AnimatedLogo.jsx — Helpotron platform logo with state-driven ambient glow,
 * rotating cybernetic halo ring, and optional WebM video loop support.
 *
 *   <AnimatedLogo size="md" isWorking={bool} videoSrc="/assets/logo.webm" />
 *
 * Sizes: sm (24px) / md (36px) / lg (48px) / xl (64px). The halo ring spins
 * while `isWorking` is true, otherwise it lights up on hover.
 * ──────────────────────────────────────────────────────────────────────────── */
import React from 'react';

export const AnimatedLogo = ({
  size = 'md', // 'sm' (24px), 'md' (36px), 'lg' (48px), 'xl' (64px)
  isWorking = false,
  videoSrc = null, // Optional path to animated WebM loop e.g. '/assets/HelpoTron_logo.webm'
  showWordmark = true,
  className = '',
}) => {
  const sizeClasses = {
    sm: 'h-6 w-6 rounded-lg',
    md: 'h-9 w-9 rounded-xl',
    lg: 'h-12 w-12 rounded-2xl',
    xl: 'h-16 w-16 rounded-2xl',
  };

  const currentSize = sizeClasses[size] || sizeClasses.md;

  return (
    <div className={`flex items-center gap-2.5 select-none group ${className}`}>
      <div className="relative flex items-center justify-center">
        {/* Ambient Halo Glow */}
        <div
          className={`absolute -inset-1 rounded-2xl bg-gradient-to-tr from-cyan-500/30 to-emerald-500/30 blur-md transition-opacity duration-300 ${
            isWorking ? 'opacity-100 animate-cyber-spin' : 'opacity-0 group-hover:opacity-60'
          }`}
        />

        {/* Logo Media (Video or Image) */}
        {videoSrc ? (
          <video
            src={videoSrc}
            autoPlay
            loop
            muted
            playsInline
            className={`relative ${currentSize} object-cover border border-cyan-500/20 shadow-lg pointer-events-none`}
          />
        ) : (
          <img
            src="/HelpoTron_logo.jpeg"
            alt="Helpotron Logo"
            className={`relative ${currentSize} object-cover border border-white/10 shadow-sm transition-all duration-300 ${
              isWorking ? 'animate-aperture-pulse scale-105 border-emerald-500/60' : 'group-hover:scale-105 group-hover:border-blue-500/50'
            }`}
          />
        )}
      </div>

      {/* Modern Wordmark */}
      {showWordmark && (
        <div className="flex flex-col leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-base tracking-tight text-slate-100">helpotron</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <span className="text-[9px] font-mono text-slate-400 tracking-widest uppercase font-semibold">Academic OS</span>
        </div>
      )}
    </div>
  );
};

export default AnimatedLogo;
