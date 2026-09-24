import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  Send,
  Paperclip,
  X,
  Trash2,
  Coins,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import api from '../api.js';
import Skeleton from './ui/Skeleton.jsx';

/**
 * DataLakeView — the owner's own words describe this page (2026-09-19):
 *
 *   *"Data Lake entry place, submit pieces of information that may be useful to
 *   the developer to make Helpotron better for everyone, can be bugs,
 *   recommendations, official grades scored on an assignment, teacher notes, etc
 *   everything helps."*
 *
 * and, of what was here before:
 *
 *   *"get rid of the 'automated empirical scoring' and all other bloat, just a
 *   simple data lake dump box, title, and content, with the ability to upload, no
 *   category, nothing, and a small list of history with micro credits earned with
 *   date+timestamp, get rid of the 'submit dataset or syllabus'."*
 *
 * So this is deliberately small. No category picker, no "empirical rigour"
 * valuation, no export button, no "DATA VALUATION" badge, no marketing header —
 * a title, a box, an optional attachment, and your history.
 *
 * The `data_type` field still exists in the API for older entries, but the UI no
 * longer asks: a user cannot meaningfully classify their own note as an
 * "Empirical Dataset" vs a "Course Syllabus", and making them choose was the
 * category bloat being removed.
 */

const DESCRIPTION =
  'Submit pieces of information that may be useful to the developer to make ' +
  'Helpotron better for everyone — bugs, recommendations, official grades scored ' +
  'on an assignment, teacher notes, anything. Everything helps.';

export default function DataLakeView({ userId = '' }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const fileInputRef = useRef(null);
  const contentRef = useRef(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await api.getMicrocreditsHistory(userId);
      if (res && res.status === 'success') {
        setHistory(res.history || []);
        if (typeof res.balance === 'number') setBalance(res.balance);
      }
    } catch (e) {
      setError(e.message || 'Could not load your entries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHistory(); }, [userId]);

  const addFiles = (fileList) => {
    const mapped = Array.from(fileList || []).map((f) => ({
      name: f.name,
      size: `${(f.size / 1024).toFixed(1)} KB`,
      rawFile: f,
    }));
    if (mapped.length) setFiles((prev) => [...prev, ...mapped]);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!content.trim() && files.length === 0) {
      setError('Add something first — either text or a file.');
      return;
    }
    setSubmitting(true);
    setError('');
    setOk('');
    try {
      const res = await api.submitDataLakeMicrocredits({
        title: title.trim() || files[0]?.name || 'Data Lake entry',
        data_content: content.trim(),
        metadata: {
          file_name: files[0]?.name || '',
          file_count: files.length,
          files: files.map((f) => f.name),
        },
      });
      if (res && res.status === 'success') {
        setOk('Thanks — your entry is in.');
        setTitle('');
        setContent('');
        setFiles([]);
        await fetchHistory();
      }
    } catch (e) {
      setError(e.message || 'Could not submit that.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id) => {
    setDeletingId(id);
    setError('');
    try {
      await api.deleteDataLakeEntry(id);
      setOk('Entry deleted.');
      await fetchHistory();
    } catch (e) {
      setError(e.message || 'Could not delete that entry.');
    } finally {
      setDeletingId(null);
    }
  };

  const fmtWhen = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v).slice(0, 16);
    return d.toLocaleString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-2 sm:p-4">
      <div className="flex items-center gap-2">
        <Database className="w-5 h-5 text-primary" />
        <h1 className="font-headline-lg text-title-md md:text-headline-lg text-on-surface font-semibold tracking-tight">
          Data Lake
        </h1>
      </div>

      <p className="font-body-md text-body-md text-on-surface-variant">
        {DESCRIPTION}
      </p>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-error/30 bg-error-container/20 px-3 py-2">
          <AlertCircle className="w-4 h-4 text-error mt-0.5 shrink-0" />
          <span className="font-body-sm text-xs text-error">{error}</span>
        </div>
      )}
      {ok && (
        <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
          <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <span className="font-body-sm text-xs text-on-surface">{ok}</span>
        </div>
      )}

      {/* The dump box. */}
      <form onSubmit={submit} className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest/70 p-4 space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-primary transition"
        />
        <textarea
          ref={contentRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write whatever is useful — what you found, what you scored, what should change."
          rows={6}
          className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-primary transition resize-y"
        />

        {files.length > 0 && (
          <div className="space-y-1">
            {files.map((f, i) => (
              <div key={`${f.name}_${i}`} className="flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-2">
                <span className="font-code-sm text-[11px] text-on-surface truncate">{f.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-code-sm text-[10px] text-outline">{f.size}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-on-surface-variant hover:text-error transition cursor-pointer"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => addFiles(e.target.files)}
          className="hidden"
        />

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-11 px-4 rounded-xl border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-label-caps text-[11px] uppercase tracking-wider flex items-center gap-2 transition cursor-pointer"
          >
            <Paperclip className="w-4 h-4" />
            Attach
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-11 px-5 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider font-semibold flex items-center gap-2 transition disabled:opacity-60 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Sending…' : 'Submit'}
          </button>
        </div>
      </form>

      {/* History — micro-credits earned, with date + time. */}
      <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest/70 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-label-caps text-[11px] uppercase tracking-wider text-on-surface-variant">
            Your entries
          </span>
          <span className="flex items-center gap-1.5 font-code-sm text-[11px] text-on-surface-variant">
            <Coins className="w-3.5 h-3.5 text-primary" />
            {Number(balance || 0).toLocaleString()} micro-credits
          </span>
        </div>

        {loading && history.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container-low/40 p-8 text-center space-y-3">
            <Database className="w-8 h-8 text-primary mx-auto" />
            <h3 className="font-title-md text-on-surface">Nothing in the lake yet</h3>
            <p className="font-body-sm text-xs text-on-surface-variant max-w-sm mx-auto">
              Every entry you submit earns micro-credits you can spend on agent work.
            </p>
            <button
              type="button"
              onClick={() => contentRef.current?.focus()}
              className="h-9 px-4 rounded-lg bg-primary text-on-primary font-label-caps text-xs uppercase cursor-pointer"
            >
              Write your first entry
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {history.map((item) => {
              const credits = item.micro_credits ?? item.credits_awarded ?? item.estimated_credits ?? 0;
                const id = item.submission_id || item.id;
              return (
                <div
                  key={id}
                  className="flex items-start justify-between gap-3 rounded-xl px-3 py-2 hover:bg-surface-container/40 transition"
                >
                  <div className="min-w-0">
                    <div className="font-body-sm text-xs text-on-surface truncate">
                      {item.title || 'Data Lake entry'}
                    </div>
                    <div className="font-code-sm text-[10px] text-outline">
                      {fmtWhen(item.created_at || item.timestamp)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {Number(credits) > 0 && (
                      <span className="font-code-sm text-[11px] text-primary">
                        +{Number(credits).toLocaleString()}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(id)}
                      disabled={deletingId === id}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container/20 transition cursor-pointer disabled:opacity-50"
                      aria-label="Delete entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
