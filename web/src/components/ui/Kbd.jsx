import React from 'react';

/**
 * Kbd — LUMINOUS GLASS Keyboard Shortcut Chip (Stitch v6)
 * JetBrains Mono 10px key chip with subtle border and container background.
 */
export default function Kbd({ children, className = '' }) {
  return (
    <kbd
      className={[
        'inline-flex items-center justify-center font-mono font-medium',
        'text-[10px] leading-tight uppercase tracking-wider',
        'px-1.5 py-0.5 rounded-lg',
        'bg-surface-container-high/80 border border-outline-variant/30',
        'text-on-surface-variant shadow-sm select-none',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </kbd>
  );
}

export { Kbd };
