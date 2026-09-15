/**
 * TrashPanel.jsx — the recoverable-deletion bin (Settings → Trash).
 *
 * Deleting things should not be a one-way door, so anything removed lands here
 * for a retention window. Each row can be restored or destroyed for good, and
 * the whole bin can be restored or emptied in one action. The retention length
 * comes from the server so the copy can never drift from the actual rule.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, RotateCcw, AlertTriangle, Loader2, Inbox, RefreshCw } from 'lucide-react';
import api from '../api.js';

const TYPE_LABELS = {
  study_material: 'Study material',
  assignment: 'Assignment',
  library_item: 'Library item',
};

function typeLabel(t) {
  return TYPE_LABELS[t] || String(t || 'Item').replace(/_/g, ' ');
}

function daysLeftLabel(item) {
  const d = Number(item?.days_left);
  if (!Number.isFinite(d) || d <= 0) return 'due for removal';
  return d === 1 ? '1 day left' : `${d} days left`;
}

export default function TrashPanel({ onNotice = () => {} }) {
  const [items, setItems] = useState([]);
  const [retention, setRetention] = useState(10);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);        // id | 'all' | 'restore-all' | 'empty'
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listTrash();
      setItems(Array.isArray(data?.items) ? data.items : []);
      if (Number.isFinite(Number(data?.retention_days))) setRetention(Number(data.retention_days));
    } catch (e) {
      setError(e?.message || 'Could not load the trash.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const restoreOne = async (item) => {
    setBusy(item.id);
    try {
      await api.restoreTrashItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      onNotice(`Restored “${item.title}”.`);
    } catch (e) {
      onNotice(e?.message || 'Restore failed.');
      load();
    } finally {
      setBusy(null);
    }
  };

  const purgeOne = async (item) => {
    setBusy(item.id);
    try {
      await api.purgeTrashItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      onNotice(`Deleted “${item.title}” permanently.`);
    } catch (e) {
      onNotice(e?.message || 'Delete failed.');
    } finally {
      setBusy(null);
    }
  };

  const restoreAll = async () => {
    setBusy('restore-all');
    try {
      const res = await api.restoreAllTrash();
      const failed = Array.isArray(res?.failed) ? res.failed : [];
      // Say what did NOT come back, not just what did — a bulk restore that
      // silently skipped a kind would leave the user thinking it worked.
      onNotice(
        failed.length
          ? `Restored ${res?.restored ?? 0}; ${failed.length} could not be restored.`
          : `Restored ${res?.restored ?? 0} item(s).`
      );
      await load();
    } catch (e) {
      onNotice(e?.message || 'Restore all failed.');
    } finally {
      setBusy(null);
    }
  };

  const emptyAll = async () => {
    setBusy('empty');
    try {
      const res = await api.emptyTrash();
      onNotice(`Permanently deleted ${res?.deleted ?? 0} item(s).`);
      setItems([]);
      setConfirmEmpty(false);
    } catch (e) {
      onNotice(e?.message || 'Empty trash failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-3xl bg-surface-container-lowest/80 border border-outline-variant/30 p-unit-6 shadow-sm flex flex-col gap-unit-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/15 pb-4">
        <div className="flex items-center gap-unit-3">
          <div className="w-10 h-10 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-title-md text-title-md font-semibold text-on-surface">Trash</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Deleted items stay recoverable for {retention} days, then are removed for good.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={load}
            disabled={busy !== null}
            title="Refresh"
            className="h-9 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface font-label-caps text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-error/10 border border-error/25 text-error text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-on-surface-variant text-xs">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading trash…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <Inbox className="w-8 h-8 text-outline" />
          <p className="font-body-sm text-sm text-on-surface-variant">Trash is empty.</p>
          <p className="font-code-sm text-[11px] text-outline">
            Anything you delete shows up here first, for {retention} days.
          </p>
        </div>
      ) : (
        <>
          {/* Bulk actions */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-label-caps text-[11px] text-on-surface-variant uppercase tracking-wider">
              {items.length} item{items.length === 1 ? '' : 's'}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={restoreAll}
              disabled={busy !== null}
              className="h-9 px-3 rounded-xl bg-surface-container-high hover:bg-surface-bright text-primary font-label-caps text-xs uppercase flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              {busy === 'restore-all'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RotateCcw className="w-3.5 h-3.5" />}
              <span>Restore all</span>
            </button>

            {confirmEmpty ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={emptyAll}
                  disabled={busy !== null}
                  className="h-9 px-3 rounded-xl bg-error text-on-error font-label-caps text-xs uppercase flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  {busy === 'empty' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>Yes, delete {items.length} forever</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmEmpty(false)}
                  className="h-9 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-xs uppercase transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmEmpty(true)}
                disabled={busy !== null}
                className="h-9 px-3 rounded-xl bg-error/15 hover:bg-error/25 text-error border border-error/25 font-label-caps text-xs uppercase flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete all now</span>
              </button>
            )}
          </div>

          {/* Rows */}
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-unit-3 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-chip-status text-[10px] uppercase font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                      {typeLabel(item.item_type)}
                    </span>
                    <span className="font-code-sm text-[10px] text-outline">{daysLeftLabel(item)}</span>
                  </div>
                  <p className="font-body-sm text-sm text-on-surface font-medium truncate mt-1">
                    {item.title || `Item #${item.item_id ?? item.id}`}
                  </p>
                  {item.subtitle && (
                    <p className="font-code-sm text-[11px] text-outline truncate">{item.subtitle}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => restoreOne(item)}
                    disabled={busy !== null}
                    className="min-h-[38px] px-3 rounded-xl bg-surface-container-high hover:bg-surface-bright text-primary font-label-caps text-[11px] uppercase flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    {busy === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    <span>Restore</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => purgeOne(item)}
                    disabled={busy !== null}
                    title="Delete permanently — this cannot be undone"
                    className="min-h-[38px] px-3 rounded-xl bg-error/15 hover:bg-error/25 text-error border border-error/25 font-label-caps text-[11px] uppercase flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete now</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
