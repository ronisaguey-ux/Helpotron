import React from 'react';

/**
 * Skeleton — LUMINOUS GLASS Shimmer Placeholder (Stitch v6)
 * Linear gradient shimmer animation over surface-container.
 */
export default function Skeleton({ className = '', style, ...rest }) {
  return (
    <div
      className={`skeleton-shimmer rounded-xl bg-surface-container ${className}`}
      style={style}
      aria-hidden="true"
      {...rest}
    />
  );
}

export { Skeleton };
