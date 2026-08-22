/* ────────────────────────────────────────────────────────────────────────────
 * Button.jsx — standardized WCAG 2.1 AA button (remediation BATCH-07)
 * - 44px minimum touch target (min-h-[44px])
 * - visible focus-visible ring
 * - aria-label / aria-busy for loading state
 * - variants driven by the --color-primary design tokens
 * ────────────────────────────────────────────────────────────────────────── */
import React, { forwardRef } from 'react';

const VARIANTS = {
  primary: 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)]',
  secondary: 'bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] border border-[var(--color-border-soft)] hover:border-[var(--color-primary)]',
  ghost: 'bg-transparent text-[var(--color-text-primary)] hover:bg-[var(--color-surface-raised)]',
  danger: 'bg-[oklch(0.6_0.2_25)] text-white hover:bg-[oklch(0.55_0.21_25)]',
};

const SIZES = {
  sm: 'px-3 min-h-[44px] text-sm',
  md: 'px-4 min-h-[44px] text-sm',
  lg: 'px-6 min-h-[48px] text-base',
};

const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    ariaLabel,
    className = '',
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const label = ariaLabel || (typeof children === 'string' ? children : undefined);

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-label={label}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
        'select-none whitespace-nowrap',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'transition-colors duration-150',
        VARIANTS[variant] || VARIANTS.primary,
        SIZES[size] || SIZES.md,
        className,
      ].join(' ')}
      {...rest}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
});

export default Button;
