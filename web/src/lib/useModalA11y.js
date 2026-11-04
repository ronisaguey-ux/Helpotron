import { useEffect } from 'react';

/**
 * useModalA11y — the dialog contract for overlays (audit-v5 A1-04).
 *
 * A surface that declares role="dialog" aria-modal="true" must actually behave
 * modally. Three things were missing on the command palette (and are the norm
 * across the app's hand-rolled overlays):
 *
 *   1. Focus trap  — Tab walked straight out of the panel into the page behind
 *      (measured: 8/8 Tab presses landed outside the dialog while aria-modal
 *      was "true"), so keyboard users interacted with hidden content.
 *   2. Focus restore — closing left focus on whatever the last Tab reached
 *      instead of the control that opened the dialog.
 *   3. Scroll lock — the document behind the overlay kept scrolling (measured:
 *      scrollY 1776 -> 2046 with the palette open).
 *
 * @param {object}   opts
 * @param {boolean}  opts.active        overlay is open
 * @param {object}   opts.containerRef  ref to the dialog element
 * @param {Function} [opts.onEscape]    called on Escape (omit to ignore Escape)
 * @param {boolean}  [opts.lockScroll=true]
 */
export default function useModalA11y({ active, containerRef, onEscape, lockScroll = true }) {
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.activeElement;
    const container = containerRef?.current;

    const FOCUSABLE = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const focusable = () => Array.from(container?.querySelectorAll(FOCUSABLE) || [])
      .filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== 'Tab' || !container) return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        container.focus?.();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      // Focus may start on the panel itself (or the body): pull it to an edge.
      if (!container.contains(current)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && (current === first || current === container)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const prevOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (lockScroll) document.body.style.overflow = prevOverflow;
      // Return focus to the opener, never to <body> or a hidden control.
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [active, containerRef, onEscape, lockScroll]);
}
