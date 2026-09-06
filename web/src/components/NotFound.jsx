/**
 * NotFound.jsx — Canonical 404 Routing Fault (Stitch v6 LUMINOUS GLASS M3 / §3.21)
 * Powered by the ErrorState family primitive.
 */
import React from 'react';
import ErrorState from './ui/ErrorState.jsx';

export default function NotFound({ onGoHome, onNavigate }) {
  const handlePrimary = () => {
    if (onGoHome) onGoHome();
    else if (onNavigate) onNavigate('overview');
    else window.location.href = '/';
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-background overflow-hidden select-none">
      <ErrorState
        type="404"
        onPrimaryAction={handlePrimary}
        primaryLabel="Back to Dashboard"
      />
    </div>
  );
}
