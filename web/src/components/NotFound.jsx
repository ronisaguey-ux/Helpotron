import React from 'react';
import { Compass, ArrowLeft, Home } from 'lucide-react';

export default function NotFound({ onGoHome, onNavigate }) {
  const handleBack = () => {
    if (onGoHome) onGoHome();
    else if (onNavigate) onNavigate('overview');
    else window.location.href = '/';
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-background dark:bg-inverse-surface overflow-hidden select-none"
      role="main"
      aria-label="Page not found"
    >
      {/* Dot-grid background */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at center, currentColor 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Glow blobs */}
      <div className="absolute w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute w-[400px] h-[400px] rounded-full bg-secondary/10 blur-[100px] pointer-events-none translate-x-1/3 translate-y-1/3" />

      <div className="relative z-10 w-full max-w-lg mx-auto p-8 sm:p-12 text-center bg-surface-container-lowest dark:bg-surface-container border border-outline-variant/30 dark:border-outline/30 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)]">
        {/* Orbit Motif */}
        <div className="relative w-28 h-28 mx-auto mb-6 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-outline-variant/40 animate-spin" style={{ animationDuration: '20s' }} />
          <div className="absolute inset-2 rounded-full border-2 border-primary/20 animate-ping" style={{ animationDuration: '3s' }} />
          <div className="w-20 h-20 rounded-full bg-surface-container-high dark:bg-surface-container-highest flex items-center justify-center shadow-inner border border-outline-variant/30">
            <Compass className="w-10 h-10 text-primary animate-pulse" />
          </div>
        </div>

        <h1 className="font-display-xl text-display-xl text-primary font-bold tracking-tight mb-2">
          404
        </h1>

        <h2 className="font-title-md text-title-md text-on-surface mb-3">
          Lost in the stacks?
        </h2>

        <p className="font-body-md text-body-sm text-on-surface-variant max-w-sm mx-auto mb-8 leading-relaxed">
          The study material or page you are looking for has been moved, deleted, or never existed in this iteration of the Helpotron OS.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-xs mx-auto">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary-container text-on-primary font-body-sm font-semibold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer min-h-[44px]"
          >
            <Home className="w-4 h-4" />
            <span>Back to dashboard</span>
          </button>
        </div>
      </div>
    </div>
  );
}
