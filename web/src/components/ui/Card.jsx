import React from 'react';

export default function Card({
  variant = 'default',
  hoverEffect = false,
  className = '',
  children,
  ...props
}) {
  const base =
    'clean-card rounded-2xl border transition-all duration-200 text-slate-100';

  const variants = {
    default: 'bg-slate-900/90 border-white/10 shadow-lg',
    subtle: 'bg-slate-950/60 border-white/5 shadow-md',
    elevated: 'bg-slate-900 border-white/15 shadow-xl',
    emerald: 'bg-emerald-950/20 border-emerald-500/20 shadow-lg shadow-emerald-950/30',
    danger: 'bg-rose-950/20 border-rose-500/20 shadow-lg shadow-rose-950/30',
  };

  const hover = hoverEffect
    ? 'hover:border-white/20 hover:shadow-xl hover:-translate-y-0.5 cursor-pointer'
    : '';

  return (
    <div
      className={`${base} ${variants[variant] || variants.default} ${hover} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
