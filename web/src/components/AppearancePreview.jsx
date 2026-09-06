/**
 * AppearancePreview.jsx — Live Appearance & Accessibility Preview Tile (Stitch v6 / §3.18.1).
 * Displays live rendering of theme, font scaling, contrast mode, and accent palette.
 */
import React from 'react';
import { Sparkles, CheckCircle2, Shield, ArrowRight } from 'lucide-react';

export default function AppearancePreview({
  theme = 'dark',
  accent = 'teal',
  fontScale = 1.0,
  highContrast = false,
  reducedMotion = false,
  dyslexiaFriendly = false,
}) {
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const previewStyle = {
    fontSize: `${fontScale * 14}px`,
    fontFamily: dyslexiaFriendly
      ? 'OpenDyslexic, comic sans ms, sans-serif'
      : 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  };

  return (
    <div
      className={`rounded-2xl p-unit-4 border transition-all ${
        isDark
          ? 'bg-surface-container-lowest/90 border-outline-variant/30 text-on-surface'
          : 'bg-white border-slate-200 text-slate-900 shadow-md'
      } ${highContrast ? 'contrast-125 border-2 border-primary' : ''}`}
      style={previewStyle}
    >
      <div className="flex items-center justify-between border-b border-outline-variant/15 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="font-label-caps text-label-caps uppercase tracking-wider font-semibold">
            Live Surface Preview
          </span>
        </div>
        <span className="font-code-sm text-xs opacity-60">
          Scale: {Math.round(fontScale * 100)}%
        </span>
      </div>

      <div className="flex flex-col gap-unit-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
            <span className="font-semibold">Theme Surface Sample</span>
          </div>
          <span className="font-chip-status text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/25 uppercase font-medium">
            Preview
          </span>
        </div>

        <p className="text-on-surface-variant text-xs leading-relaxed">
          This sample surface re-renders live as you adjust color mode, font
          scaling, and accessibility toggles above.
        </p>

        <div className="flex items-center gap-2 pt-1">
          <span className="px-3 py-1.5 rounded-xl bg-primary text-on-primary font-label-caps text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm">
            <span>Sample Action</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-surface-container border border-outline-variant/20 font-label-caps text-xs">
            Secondary Sample
          </span>
        </div>
      </div>
    </div>
  );
}
