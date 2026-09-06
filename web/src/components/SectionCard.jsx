import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/* ── SectionCard: LUMINOUS GLASS Collapsible Container ─────────────────────
 * Wraps any card block with a header row that carries a minimize / maximize toggle.
 * When collapsed, the card shrinks to a slim one-line bar (title + chevron only).
 * State persists per id in localStorage (`helpotron.collapse.${id}`).
 *
 *   <SectionCard id="today-overview" title="Overview" subtitle="…">
 *     …children…
 *   </SectionCard>
 */
export default function SectionCard({
  id = '',
  header,
  title,
  subtitle,
  icon,
  defaultOpen = true,
  headerRight,
  className = '',
  padding = 'p-5 md:p-6',
  children,
}) {
  const storageKey = id ? `helpotron.collapse.${id}` : null;
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    try {
      const saved = localStorage.getItem(storageKey);
      return saved === null ? defaultOpen : saved === '1';
    } catch {
      return defaultOpen;
    }
  });

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, next ? '1' : '0');
        } catch {}
      }
      return next;
    });
  };

  /* Programmatic open (e.g. Guide jump chips): window event expands without
   * overriding user preference */
  useEffect(() => {
    if (!id) return;
    const onOpen = (e) => {
      if (e.detail === id) setOpen(true);
    };
    window.addEventListener('helpotron:open-section', onOpen);
    return () => window.removeEventListener('helpotron:open-section', onOpen);
  }, [id]);

  /* Clicking header bar toggles, excluding interactive elements */
  const onHeaderClick = (e) => {
    if (e.target.closest('button, a, input, select, textarea, label')) return;
    toggle();
  };

  const hasHeader = !!(header || title || icon || headerRight);

  const headerEl = !open && React.isValidElement(header)
    ? (typeof header.type === 'string' ? header : React.cloneElement(header, { collapsed: true }))
    : header;

  return (
    <section
      id={id || undefined}
      className={[
        'relative rounded-2xl md:rounded-3xl',
        'bg-surface-container-lowest/70 backdrop-blur-xl',
        'border border-outline-variant/20',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
        'transition-all duration-150',
        open ? padding : 'p-3 md:p-4',
        className,
      ].filter(Boolean).join(' ')}
    >
      {hasHeader && (
        <div
          className={`flex gap-3 select-none cursor-pointer ${open ? 'items-start' : 'items-center'} ${title || header ? (open ? 'mb-4' : '') : ''}`}
          onClick={hasHeader ? onHeaderClick : undefined}
          role="presentation"
        >
          {icon && (
            <span className="text-primary shrink-0 mt-0.5" aria-hidden="true">
              {icon}
            </span>
          )}
          {title && (
            <h3 className="text-base md:text-lg font-semibold tracking-tight text-on-surface flex-1 truncate">
              {title}
            </h3>
          )}
          {headerEl && <div className="flex-1 min-w-0">{headerEl}</div>}
          {open && subtitle && !title && !header && (
            <span className="text-xs font-mono text-on-surface-variant flex-1 truncate">{subtitle}</span>
          )}
          {open && headerRight}
          <button
            type="button"
            onClick={toggle}
            aria-label={open ? 'Minimize section' : 'Maximize section'}
            title={open ? 'Minimize' : 'Maximize'}
            className="relative w-8 h-8 -mr-1 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer shrink-0"
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      )}
      {open && children}
    </section>
  );
}

export { SectionCard };
