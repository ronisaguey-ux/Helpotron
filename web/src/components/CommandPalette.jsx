/* ────────────────────────────────────────────────────────────────────────────
 * CommandPalette.jsx — ⌘K / Ctrl+K global command palette (Raycast-style)
 * Searches every entity (assignments, files, study, activity, users, settings,
 * views), supports slash commands, and remembers recent actions per session.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion';
import { CornerDownLeft, Clock } from 'lucide-react';
import { searchIndex, SLASH_COMMANDS, demoEnabled } from '../demoData.js';
import { Kbd } from './ui/os.jsx';

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
  } catch (e) { /* ignore */ }
}

export default function CommandPalette({ open, onClose, onNavigate }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Derived data must be declared before the keydown effect references it
  // (its deps array reads results.length at render time).
  const index = useMemo(() => (demoEnabled() ? searchIndex() : []), []);
  const recent = loadRecent();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.startsWith('/')) {
      return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(q)).map((c) => ({
        kind: 'command', title: `${c.cmd} — ${c.label}`, target: c.target, subtitle: 'command',
      }));
    }
    if (!q) {
      return recent.map((r) => ({ ...r, subtitle: 'recent' }));
    }
    return index.filter((it) => (it.title + ' ' + (it.subtitle || '')).toLowerCase().includes(q)).slice(0, 14);
  }, [query, index, recent]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const r of results) {
      (groups[r.kind] = groups[r.kind] || []).push(r);
    }
    return groups;
  }, [results]);

  // Global ⌘K / Ctrl+K binding lives in AppShell; palette handles Escape + arrows here.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
      if (e.key === 'Enter' && results[selected]) {
        const item = results[selected];
        pushRecent(item);
        onNavigate(item.target);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, selected, results.length]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="w-full max-w-xl clean-card p-0 overflow-hidden shadow-2xl shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
              <span className="text-slate-500">🔎</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
                placeholder="What do you want to do?"
                className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-slate-500"
                aria-label="Command palette search"
              />
              <Kbd>esc</Kbd>
            </div>

            {/* Results */}
            <div className="max-h-[46vh] overflow-y-auto py-2">
              {results.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-slate-500">
                  No results for “{query}”. Try <code className="text-slate-300">/assignment</code>, <code className="text-slate-300">/study</code>, <code className="text-slate-300">/settings</code>…
                </div>
              )}
              {Object.entries(grouped).map(([kind, items]) => (
                <div key={kind}>
                  <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {kind === 'command' ? 'Commands' : kind}
                  </div>
                  {items.map((item, i) => {
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
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition cursor-pointer ${
                          isSel ? 'bg-blue-600/15 border-l-2 border-blue-500' : 'border-l-2 border-transparent'
                        }`}
                      >
                        <span className="w-6 text-center text-xs shrink-0">
                          {item.subtitle === 'recent' ? <Clock className="w-3.5 h-3.5 mx-auto text-slate-500" /> : <span className="text-slate-400">{kind === 'command' ? '>' : '→'}</span>}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-xs truncate ${isSel ? 'text-blue-200' : 'text-slate-200'}`}>{item.title}</span>
                          {item.subtitle && item.subtitle !== 'recent' && (
                            <span className="block text-[10px] text-slate-500 truncate">{item.subtitle}</span>
                          )}
                        </span>
                        {isSel && <CornerDownLeft className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-3 px-4 py-2 border-t border-white/8 text-[10px] text-slate-500">
              <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate</span>
              <span><Kbd>↵</Kbd> open</span>
              <span className="ml-auto">Slash commands: /assignment /study /run /settings /admin</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
