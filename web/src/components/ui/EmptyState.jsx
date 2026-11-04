import React from 'react';

/**
 * EmptyState — LUMINOUS GLASS Empty State Component (Stitch v6)
 * 64px icon orb backdrop, curved-stroke line-art accent, title, body, optional CTA.
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
  children,
}) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center text-center',
        'rounded-3xl bg-surface-container-lowest/70 backdrop-blur-xl',
        'border border-outline-variant/20 p-8 md:p-12 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
        'max-w-xl mx-auto w-full transition-all duration-150',
        className,
      ].filter(Boolean).join(' ')}
    >
      {icon && (
        <div className="w-16 h-16 rounded-full bg-surface-container-high/60 border border-outline-variant/30 flex items-center justify-center text-primary mb-4 shrink-0 shadow-inner">
          {icon}
        </div>
      )}
      {/* h2, not h3: EmptyState sits directly under a view's single h1, so an
          h3 jumped a level on every empty view (audit-v5 A1-06). */}
      {title && (
        <h2 className="font-headline-lg text-lg md:text-xl font-semibold text-on-surface mb-2 tracking-tight">
          {title}
        </h2>
      )}
      {description && (
        <p className="font-body-sm text-sm text-on-surface-variant max-w-md mx-auto mb-6 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
      {children}
    </div>
  );
}

export { EmptyState };
