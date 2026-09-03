import React from 'react';

/* Real 404 page (09-01, operator QA round): the SPA serves index.html at
 * every pathname, so unknown URLs used to silently render the landing page
 * with the address bar left on the dead URL. This view is what unknown
 * paths get instead — styled on the app's Stitch-token surfaces. */
export default function NotFound({ onGoHome }) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-[var(--background)]"
      role="main"
      aria-label="Page not found"
    >
      <div className="panel w-full max-w-md mx-auto p-8 sm:p-10 text-center space-y-4 bg-surface-container-lowest border border-outline-variant/30 rounded-3xl shadow-2xl">
        <div className="text-6xl font-bold tracking-tight text-[var(--accent)] leading-none select-none">
          404
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-on-surface">
            This page doesn't exist
          </h1>
          <p className="text-xs text-on-surface-variant max-w-sm mx-auto leading-relaxed">
            The URL you opened isn't a Helpotron page — it may have moved,
            been renamed, or was never there to begin with.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoHome}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold rounded-[var(--radius-sm)] transition cursor-pointer"
        >
          Back to home
        </button>
      </div>
    </div>
  );
}
