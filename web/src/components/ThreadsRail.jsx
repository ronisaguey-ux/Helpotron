/**
 * ThreadsRail.jsx — the chat history rail.
 *
 * Owner (2026-09-19): "history rail with date/time + 3-dot menu per chat
 * (delete/rename/pin)". The two inline icons this used to carry (a pencil and a
 * bin, always visible on hover) grew with every feature; a single 3-dot menu is
 * the surface that stays fixed while the number of actions grows.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Pencil, Trash2, Check, X, MessageSquare, Pin, MoreVertical } from 'lucide-react';
import EffortDial from './EffortDial.jsx';

/**
 * When a thread last saw a message — the fact that used to be replaced by the
 * meaningless label "Active Trace" (owner 2026-09-19).
 *
 * `last_message_at` is the real timestamp of the newest message row for the
 * thread (server/routes_overlord.py list_chat_threads); `updated_at` is the
 * fallback for a thread that has none. Rendered relative for recent activity so
 * the list stays scannable, absolute date+time once it is older than a day.
 */
function threadLastActivity(thread) {
  const iso = thread?.last_message_at || thread?.updated_at || thread?.created_at;
  if (!iso) return 'No messages yet';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No messages yet';

  const now = Date.now();
  const diff = now - d.getTime();

  // Clock skew or a future timestamp: show the absolute value, never a
  // negative "3 minutes ago".
  if (diff < 0) return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  if (diff < 60 * 1000) return 'Last message just now';
  if (diff < 60 * 60 * 1000) {
    const m = Math.floor(diff / 60000);
    return `Last message ${m} min ago`;
  }
  if (diff < 24 * 60 * 60 * 1000) {
    const h = Math.floor(diff / 3600000);
    return `Last message ${h} hr${h === 1 ? '' : 's'} ago`;
  }
  return `Last message ${d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

export default function ThreadsRail({
  threads = [],
  activeThreadId = null,
  onSelectThread = () => {},
  onCreateThread = () => {},
  onRenameThread = () => {},
  onDeleteThread = () => {},
  onPinThread = () => {},
  effortScore = 600,
  onEffortChange = () => {},
  modelBadge = '',
}) {
  const [filterText, setFilterText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState(null);
  const searchInputRef = useRef(null);
  const menuRef = useRef(null);

  // A click anywhere else closes the 3-dot menu. Without this the menu stays
  // open behind whatever the user does next.
  useEffect(() => {
    if (menuOpenId == null) return undefined;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpenId(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpenId]);

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
    (t.title || "New chat").toLowerCase().includes(filterText.toLowerCase())
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
                Chats
              </span>
              <span className="font-title-md text-title-md text-on-surface font-semibold">
                History
              </span>
            </div>
            <button
              type="button"
              id="btn-new-topic"
              onClick={onCreateThread}
              title="New chat (⌘N)"
              className="h-11 px-unit-3 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/30 text-primary flex items-center gap-micro-2 transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-primary shrink-0" />
                <span className="font-label-caps text-label-caps uppercase">New chat</span>
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
              placeholder="Search chats..."
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
                No chats yet
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
                        {thread.pinned ? (
                          <Pin className="w-3.5 h-3.5 text-primary shrink-0" aria-label="Pinned" />
                        ) : isActive ? (
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
                            {thread.title || "New chat"}
                          </span>
                        )}
                      </div>

                      {/* One 3-dot menu per chat: rename, pin, delete. */}
                      {!isEditing && (
                        <div
                          className="relative shrink-0"
                          ref={menuOpenId === thread.id ? menuRef : null}
                        >
                          <button
                            type="button"
                            data-thread-menu={thread.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId(menuOpenId === thread.id ? null : thread.id);
                            }}
                            title="Chat options"
                            aria-haspopup="menu"
                            aria-expanded={menuOpenId === thread.id}
                            className="w-7 h-7 rounded-md text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors flex items-center justify-center cursor-pointer"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {menuOpenId === thread.id && (
                            <div
                              role="menu"
                              className="absolute right-0 top-8 z-30 w-40 rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl py-1"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                  setMenuOpenId(null);
                                  startRename(thread, e);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left font-body-sm text-xs text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>Rename</span>
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuOpenId(null);
                                  onPinThread(thread.id, !thread.pinned);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left font-body-sm text-xs text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors cursor-pointer"
                              >
                                <Pin className="w-3.5 h-3.5" />
                                <span>{thread.pinned ? 'Unpin' : 'Pin'}</span>
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuOpenId(null);
                                  onDeleteThread(thread.id);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left font-body-sm text-xs text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Thread Telemetry Footer.
                        Owner 2026-09-19: this read "Active Trace" for any thread
                        with no message count — a label that means nothing and
                        hid the one fact worth showing. It now shows the real
                        date + time of the thread's last message, which the
                        threads endpoint already returns as `last_message_at`
                        (falling back to the thread's own updated_at). */}
                    <div className="flex items-center justify-between mt-micro-2 text-outline">
                      <span className="font-code-sm text-[11px]">
                        {threadLastActivity(thread)}
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
