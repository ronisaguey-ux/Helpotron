/* ═══════════════════════════════════════════════════════════════════════════
   Button.jsx — LUMINOUS GLASS Unified Component (Stitch v6 / WCAG 2.1 AA)
   - 44px minimum touch target (min-h-[44px])
   - Accessible focus-visible ring (2px primary, 2px offset)
   - aria-label / aria-busy for loading state
   - 5 canonical variants + key CTA glow + press scale(0.98)
   - Label tracking in JetBrains Mono label-caps
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  // 1. Primary: Solid M3 Electric Teal, dark on-primary text, hover lift, optional key CTA glow
  primary:
    'bg-primary text-on-primary hover:opacity-95 shadow-sm active:scale-[0.98]',
  // 2. Secondary: Frosted container with specular hairline border
  secondary:
    'bg-surface-container/40 text-on-surface border border-outline-variant/20 hover:border-outline-variant/50 hover:bg-surface-container/60 active:scale-[0.98]',
  // 3. Ghost: Transparent surface with hover highlight
  ghost:
    'bg-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50 active:scale-[0.98]',
  // 4. Danger: M3 Error container with error text & border
  danger:
    'bg-error-container/20 text-error border border-error/30 hover:bg-error-container/30 active:scale-[0.98]',
  // 5. Primary-Soft: Translucent teal container with primary text
  'primary-soft':
    'bg-primary-container/15 text-primary border border-primary/25 hover:bg-primary-container/25 active:scale-[0.98]',

  // Legacy mappings for backwards compatibility with pre-Stitch views
  outline:
    'bg-primary-container/15 text-primary border border-primary/25 hover:bg-primary-container/25 active:scale-[0.98]',
  emerald:
    'bg-primary text-on-primary hover:opacity-95 shadow-sm active:scale-[0.98]',
  aurora:
    'bg-primary text-on-primary hover:opacity-95 shadow-sm glow-primary active:scale-[0.98]',
};

const SIZES = {
  sm: 'px-3 py-1.5 min-h-[44px] text-xs font-medium',
  md: 'px-4 py-2 min-h-[44px] text-sm font-medium',
  lg: 'px-6 py-2.5 min-h-[48px] text-base font-semibold',
};

const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    isLoading = false,
    loadingText = '',
    disabled = false,
    glow = false,
    ariaLabel,
    className = '',
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isBusy = loading || isLoading;
  const isDisabled = disabled || isBusy;
  const label = ariaLabel || (typeof children === 'string' ? children : undefined);

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-label={label}
      aria-busy={isBusy || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-xl font-label-caps select-none whitespace-nowrap cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        'transition-all duration-150',
        glow ? 'glow-primary' : '',
        VARIANTS[variant] || VARIANTS.primary,
        SIZES[size] || SIZES.md,
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {isBusy ? (
        <span className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
          {loadingText ? <span>{loadingText}</span> : children}
        </span>
      ) : (
        children
      )}
    </button>
  );
});

export default Button;
export { Button };
