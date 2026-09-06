/**
 * ThreadsRail.jsx — Workspace Threads Rail & Topic Management (Stitch v6 / §3.6.4).
 * Houses thread list with search filter, inline rename/delete, New Topic (⌘N), and EffortDial.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Pencil, Trash2, Check, X, MessageSquare } from 'lucide-react';
import EffortDial from './EffortDial.jsx';

export default function ThreadsRail({
  threads = [],
  activeThreadId = null,
  onSelectThread = () => {},
  onCreateThread = () => {},
  onRenameThread = () => {},
  onDeleteThread = () => {},
  effortScore = 600,
  onEffortChange = () => {},
  modelBadge = 'Claude 3.5 Sonnet + Z3 SMT Prover',
}) {
  const [filterText, setFilterText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const searchInputRef = useRef(null);

  // Keyboard shortcut: / focuses search, ⌘N creates new thread
  useEffect(() => {
    function handleKeyDown(e) {
      if (
        (e.key === 'n' || e.key === 'N') &&
        (e.metaKey || e.ctrlKey) &&
        !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
      ) {
        e.preventDefault();
        onCreateThread();
      }
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCreateThread]);

  const filteredThreads = threads.filter((t) =>
    (t.title || `Thread #${t.id || ''}`).toLowerCase().includes(filterText.toLowerCase())
  );

  const startRename = (thread, e) => {
    e.stopPropagation();
    setEditingId(thread.id);
    setEditingTitle(thread.title || '');
  };

  const saveRename = (thread, e) => {
    e?.stopPropagation();
    if (editingTitle.trim()) {
      onRenameThread(thread.id, editingTitle.trim());
    }
    setEditingId(null);
  };

  const cancelRename = (e) => {
    e?.stopPropagation();
    setEditingId(null);
  };

  return (
    <aside className="col-span-12 lg:col-span-4 xl:col-span-3 flex flex-col gap-unit-4">
      {/* Thread Rail Container Glass Card */}
      <div className="flex flex-col rounded-2xl bg-surface-container-lowest/70 backdrop-blur-xl border border-outline-variant/30 shadow-xl p-unit-4 min-h-[580px] lg:min-h-[640px] justify-between">
        {/* Rail Top & Topic List */}
        <div className="flex flex-col gap-unit-4">
          {/* Header with '+ New Topic' Primary Action */}
          <div className="flex items-center justify-between gap-micro-2">
            <div className="flex flex-col">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
                Workspace Threads
              </span>
              <span className="font-title-md text-title-md text-on-surface font-semibold">
                Active Synthesis
              </span>
            </div>
            <button
              type="button"
              id="btn-new-topic"
              onClick={onCreateThread}
              title="New Topic (⌘N)"
              className="h-11 px-unit-3 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/30 text-primary flex items-center gap-micro-2 transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-primary shrink-0" />
              <span className="font-label-caps text-label-caps uppercase">New Topic</span>
            </button>
          </div>

          {/* Thread Filter / Search Bar */}
          <div className="flex items-center gap-micro-2 px-unit-3 h-10 rounded-xl bg-surface-container-low border border-outline-variant/20 text-on-surface-variant">
            <Search className="w-4 h-4 text-outline shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter thread telemetry..."
              className="bg-transparent text-on-surface font-body-sm text-body-sm focus:outline-none w-full placeholder:text-outline"
            />
            <kbd className="hidden sm:inline-block font-code-sm text-code-sm text-outline px-1.5 py-0.5 rounded bg-surface-container-highest/40">
              /
            </kbd>
          </div>

          {/* Thread Stack */}
          <div className="flex flex-col gap-micro-2 mt-micro-1 overflow-y-auto max-h-[340px]" role="list">
            {filteredThreads.length === 0 ? (
              <div className="p-unit-4 text-center rounded-xl bg-surface-container-low/40 border border-outline-variant/15 text-outline font-body-sm">
                No threads found
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const isActive = thread.id === activeThreadId;
                const isEditing = thread.id === editingId;

                return (
                  <div
                    key={thread.id}
                    role="listitem"
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => !isEditing && onSelectThread(thread.id)}
                    className={`group relative flex flex-col p-unit-3 rounded-xl transition-all shadow-sm cursor-pointer border ${
                      isActive
                        ? 'bg-primary/10 border-primary/30 text-on-surface'
                        : 'bg-surface-container-low/50 hover:bg-surface-container-low border-outline-variant/15 text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-micro-2">
                      <div className="flex items-center gap-micro-2 min-w-0 flex-1">
                        {isActive ? (
                          <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                        ) : (
                          <MessageSquare className="w-3.5 h-3.5 text-outline shrink-0" />
                        )}

                        {isEditing ? (
                          <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editingTitle}
                              autoFocus
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveRename(thread, e);
                                if (e.key === 'Escape') cancelRename(e);
                              }}
                              className="bg-surface-container-lowest text-on-surface px-2 py-0.5 rounded text-xs w-full focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <button
                              type="button"
                              onClick={(e) => saveRename(thread, e)}
                              className="p-1 rounded text-primary hover:bg-surface-container-high"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelRename}
                              className="p-1 rounded text-outline hover:bg-surface-container-high"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className={`font-body-sm text-body-sm truncate ${isActive ? 'font-semibold text-on-surface' : ''}`}>
                            {thread.title || `Thread #${thread.id}`}
                          </span>
                        )}
                      </div>

                      {/* Outside action affordances for rename & delete */}
                      {!isEditing && (
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => startRename(thread, e)}
                            title="Rename Thread"
                            className="w-7 h-7 rounded-md text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors flex items-center justify-center cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteThread(thread.id);
                            }}
                            title="Purge Thread"
                            className="w-7 h-7 rounded-md text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Thread Telemetry Footer */}
                    <div className="flex items-center justify-between mt-micro-2 text-outline">
                      <span className="font-code-sm text-[11px]">
                        {thread.messages_count ? `${thread.messages_count} msgs` : 'Active Trace'}
                      </span>
                      {thread.tokens ? (
                        <span className="font-code-sm text-[11px] text-outline-variant">
                          {thread.tokens} tok
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Rail Bottom: Session Effort Dial (§3.6.4) */}
        <div className="mt-unit-4">
          <EffortDial
            score={effortScore}
            onChange={onEffortChange}
            modelBadge={modelBadge}
          />
        </div>
      </div>
    </aside>
  );
}
