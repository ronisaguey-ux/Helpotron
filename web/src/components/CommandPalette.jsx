import React, { useEffect, useMemo, useRef, useState } from 'react';
import useModalA11y from '../lib/useModalA11y.js';
import { motion, AnimatePresence } from 'motion';
import { Search, CornerDownLeft, Clock, SearchX, Terminal } from 'lucide-react';
import { searchIndex, SLASH_COMMANDS, demoEnabled } from '../demoData.js';
import Kbd from './ui/Kbd.jsx';

const RECENT_KEY = 'helpotron_palette_recent';

function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function pushRecent(item) {
  try {
    const recent = loadRecent().filter((r) => r.title !== item.title).slice(0, 4);
    recent.unshift({ kind: item.kind, title: item.title, target: item.target });
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch (e) {
    /* ignore */
  }
}

/**
 * CommandPalette — LUMINOUS GLASS ⌘K Global Command Palette (Spec 3.1.5)
 * Theme-aware, trap & restore focus, slash command suggestions, admin-gated commands.
 */
export default function CommandPalette({ open, onClose, onNavigate, isAdmin = false }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  /* aria-modal="true" now means something: Tab cycles inside the panel, the
     page behind stops scrolling, and focus returns to the opener on close
     (audit-v5 A1-04). */
  useModalA11y({ active: open, containerRef: panelRef });

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  const index = useMemo(() => (demoEnabled() ? searchIndex() : []), []);
  const recent = loadRecent();

  // Filter slash commands (admin gated)
  const allowedSlashCommands = useMemo(() => {
    return SLASH_COMMANDS.filter((c) => {
      if (!isAdmin && (c.cmd === '/admin' || c.cmd === '/monitors' || c.target === 'admin' || c.target === 'monitors')) {
        return false;
      }
      return true;
    });
  }, [isAdmin]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.startsWith('/')) {
      return allowedSlashCommands
        .filter((c) => c.cmd.startsWith(q))
        .map((c) => ({
          kind: 'command',
          title: `${c.cmd} — ${c.label}`,
          target: c.target,
          subtitle: 'slash command',
        }));
    }
    if (!q) {
      return recent.map((r) => ({ ...r, subtitle: 'recent' }));
    }
    return index
      .filter((it) => (it.title + ' ' + (it.subtitle || '')).toLowerCase().includes(q))
      .slice(0, 14);
  }, [query, index, recent, allowedSlashCommands]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const r of results) {
      (groups[r.kind] = groups[r.kind] || []).push(r);
    }
    return groups;
  }, [results]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, results.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
      if (e.key === 'Enter' && results[selected]) {
        const item = results[selected];
        pushRecent(item);
        onNavigate(item.target);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, selected, results, onNavigate, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            ref={panelRef}
            className="w-full max-w-xl rounded-2xl bg-surface-container-low/95 backdrop-blur-xl border border-outline-variant/30 shadow-2xl overflow-hidden text-on-surface"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Command Palette"
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-outline-variant/20 bg-surface-container/40">
              <Search className="w-4 h-4 text-primary shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(0);
                }}
                placeholder="Search commands, navigation, topics (type '/' for slash commands)..."
                className="flex-1 bg-transparent outline-none text-sm text-on-surface placeholder:text-on-surface-variant font-medium"
                aria-label="Command palette search input"
              />
              <Kbd>esc</Kbd>
            </div>

            {/* Results Feed */}
            <div className="max-h-[50vh] overflow-y-auto py-2 os-scroll">
              {results.length === 0 && (
                <div className="px-6 py-10 text-center flex flex-col items-center">
                  <SearchX className="w-8 h-8 text-on-surface-variant mb-2" />
                  <div className="text-xs font-medium text-on-surface mb-1">
                    No results for "{query}"
                  </div>
                  <p className="text-[11px] font-mono text-on-surface-variant max-w-xs leading-relaxed">
                    Live mode covers this screen — try a slash command like{' '}
                    <code className="text-primary font-semibold">/assignment</code> or{' '}
                    <code className="text-primary font-semibold">/study</code>.
                  </p>
                </div>
              )}

              {Object.entries(grouped).map(([kind, items]) => (
                <div key={kind} className="py-1">
                  <div className="px-4 pt-2 pb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant flex items-center justify-between">
                    <span>{kind === 'command' ? 'Available Commands' : kind}</span>
                    {kind === 'command' && (
                      <span className="text-[9px] text-primary">{items.length} matched</span>
                    )}
                  </div>
                  {items.map((item) => {
                    const idx = results.indexOf(item);
                    const isSel = selected === idx;

                    return (
                      <button
                        key={kind + item.title}
                        type="button"
                        onMouseEnter={() => setSelected(idx)}
                        onClick={() => {
                          pushRecent(item);
                          onNavigate(item.target);
                          onClose();
                        }}
                        className={[
                          'w-full flex items-center gap-3 px-4 py-2.5 text-left transition cursor-pointer min-h-[44px]',
                          isSel
                            ? 'bg-primary-container/15 text-primary border-l-2 border-primary'
                            : 'border-l-2 border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container',
                        ].join(' ')}
                      >
                        <span className="w-5 text-center text-xs shrink-0">
                          {item.subtitle === 'recent' ? (
                            <Clock className="w-3.5 h-3.5 mx-auto text-on-surface-variant" />
                          ) : kind === 'command' ? (
                            <Terminal className="w-3.5 h-3.5 mx-auto text-primary" />
                          ) : (
                            <span className="text-on-surface-variant font-mono">→</span>
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className={`block text-xs font-medium truncate ${isSel ? 'text-primary' : 'text-on-surface'}`}>
                            {item.title}
                          </span>
                          {item.subtitle && item.subtitle !== 'recent' && (
                            <span className="block font-mono text-[10px] text-on-surface-variant truncate">
                              {item.subtitle}
                            </span>
                          )}
                        </div>
                        {isSel && <CornerDownLeft className="w-3.5 h-3.5 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Dynamic Footer with Slash Command Count */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-outline-variant/20 bg-surface-container/50 font-mono text-[10px] text-on-surface-variant">
              <div className="flex items-center gap-2">
                <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate</span>
                <span><Kbd>↵</Kbd> select</span>
              </div>
              <span className="text-primary font-medium">
                {allowedSlashCommands.length} slash commands registered
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
