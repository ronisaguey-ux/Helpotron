import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/* ── SectionCard: every panel on the site is collapsible ───────────────────
 * Wraps any clean-card block with a header row that carries a minimize /
 * maximize toggle. When collapsed the card shrinks to a slim one-line bar
 * (title + chevron only — no dead space). State persists per id in
 * localStorage, so a section the user collapsed stays collapsed across
 * navigation and reloads.
 *
 *   <SectionCard id="today-overview" title="Overview" subtitle="…">
 *     …children…
 *   </SectionCard>
 *
 * To keep an existing header (e.g. a <SectionHeader /> or any custom row),
 * pass it as `header` — it renders inside the card with the toggle appended:
 *
 *   <SectionCard id="today-attention" header={<SectionHeader title="…" />}>
 *     …children…
 *   </SectionCard>
 *
 * If neither title nor header is passed, the header row is omitted entirely
 * (no toggle) — pass `headerRight` alone for a bare toggle on a dense card.
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
  padding = 'p-5',
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

  const hasHeader = !!(header || title || icon || headerRight);

  return (
    /* Collapsed = a slim one-line bar (no big padding, no empty box);
     * open = the normal padded card with content. */
    <section className={`clean-card ${open ? padding : 'p-2'} relative ${className}`}>
      {hasHeader && (
        <div className={`flex gap-2 ${open ? 'items-start' : 'items-center'} ${title || header ? (open ? 'mb-3' : '') : ''}`}>
          {icon && <span className="text-blue-400 shrink-0">{icon}</span>}
          {title && (
            <h3 className="text-[13px] font-bold tracking-wide text-slate-200 flex-1 truncate">
              {title}
            </h3>
          )}
          {header && <div className="flex-1 min-w-0">{header}</div>}
          {subtitle && !title && !header && (
            <span className="text-[11px] font-mono text-slate-500 flex-1 truncate">{subtitle}</span>
          )}
          {headerRight}
          <button
            type="button"
            onClick={toggle}
            aria-label={open ? 'Minimize section' : 'Maximize section'}
            title={open ? 'Minimize' : 'Maximize'}
            className="w-7 h-7 -mr-1.5 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-white/6 transition cursor-pointer shrink-0"
          >
            {open ? <ChevronUp width={15} height={15} /> : <ChevronDown width={15} height={15} />}
          </button>
        </div>
      )}
      {open && children}
    </section>
  );
}
