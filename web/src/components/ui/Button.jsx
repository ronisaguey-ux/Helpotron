import React from 'react';
import { Loader2 } from 'lucide-react';

export default function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loadingText = '',
  disabled = false,
  className = '',
  children,
  ...props
}) {
  const base =
    'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-h-[44px]';

  const sizes = {
    sm: 'px-3 py-1.5 text-xs min-h-[36px]',
    md: 'px-4 py-2 text-xs min-h-[44px]',
    lg: 'px-5 py-2.5 text-sm min-h-[48px]',
  };

  const variants = {
    primary:
      'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-900/30 active:scale-[0.99]',
    secondary:
      'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/10 hover:border-white/20 active:scale-[0.99]',
    emerald:
      'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/40 active:scale-[0.99]',
    outline:
      'border border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 active:scale-[0.99]',
    danger:
      'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-950/40 active:scale-[0.99]',
    ghost:
      'bg-transparent hover:bg-white/5 text-slate-300 hover:text-white',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${base} ${sizes[size] || sizes.md} ${variants[variant] || variants.primary} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{loadingText || children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
