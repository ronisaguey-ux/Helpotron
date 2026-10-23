/**
 * Dump raw material into one subject.
 *
 * The owner's model: a subject is a place you drop things — a syllabus, a
 * teacher's email, a photo of the whiteboard, a set of notes — and the agent
 * picks it up from there. Two inputs, because both are ordinary:
 *
 *   - pasted text (the common case: you copy something and want it filed), and
 *   - a file (PDF, image, audio, doc).
 *
 * Both land in `universal_dump_items` with a `subject`, which is what lets an
 * agent ask for "everything under Biology" (`list_dumps`) instead of the user
 * having to repeat themselves.
 */
import { useEffect, useRef, useState } from 'react';
import { X, FileText, Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../api';

export default function SubjectDumpModal({ isOpen, subject, onClose, onDumped }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const fileInputRef = useRef(null);

  const reset = () => {
    setText('');
    setFile(null);
    setBusy(false);
    setError('');
    setDone('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit = !busy && (text.trim().length > 0 || file != null);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    setDone('');
    try {
      let result;
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        // The server reads `subject` as a form field; without it the dump lands
        // unfiled and never shows up under this subject again.
        if (subject) formData.append('subject', subject);
        result = await api.uploadDumpFile(formData);
      } else {
        result = await api.uploadDumpText({ text: text.trim(), subject });
      }
      const where = result?.subject ? ` under ${result.subject}` : '';
      const routed = result?.matched_assignment_title
        ? ` · routed to “${result.matched_assignment_title}”`
        : '';
      setDone(`Dumped${where}${routed}. The agent can use it now.`);
      setText('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onDumped?.(result);
    } catch (err) {
      setError(err?.message || 'Could not dump that. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-surface-container-lowest rounded-3xl border border-outline-variant/25 shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 p-6 border-b border-outline-variant/20">
          <div>
            <h3 className="font-title-lg text-lg font-semibold text-on-surface">
              Dump into {subject || 'this subject'}
            </h3>
            <p className="font-body-sm text-sm text-on-surface-variant mt-1">
              Paste text or attach a file. Whatever you drop here is filed under this
              subject for your agent to work from.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="w-9 h-9 rounded-xl border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <textarea
            id="subjectDumpText"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="Paste a syllabus, a teacher's instructions, your notes, a rubric — anything."
            className="w-full rounded-2xl bg-surface-container-low border border-outline-variant/30 p-4 font-body-sm text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary/60 resize-y"
          />

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              ref={fileInputRef}
              id="subjectDumpFile"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-11 px-4 rounded-xl border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors flex items-center gap-2 cursor-pointer font-label-caps text-xs uppercase tracking-wider"
            >
              <Upload className="w-4 h-4" />
              <span>Attach a file</span>
            </button>
            {file && (
              <span className="inline-flex items-center gap-2 text-xs text-on-surface-variant font-code-sm">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[16rem]">{file.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-on-surface-variant hover:text-error cursor-pointer"
                  aria-label="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
            <span className="font-body-sm text-xs text-on-surface-variant sm:ml-auto">
              Either one is enough — text or a file.
            </span>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-error-container/30 border border-error/30 px-3 py-2 text-xs text-on-error-container">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {done && (
            <div className="flex items-start gap-2 rounded-xl bg-primary/10 border border-primary/30 px-3 py-2 text-xs text-primary">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{done}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-outline-variant/20">
          <button
            type="button"
            onClick={handleClose}
            className="h-11 px-5 rounded-xl border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer font-label-caps text-xs uppercase tracking-wider"
          >
            {done ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="h-11 px-6 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-container active:scale-[0.98]"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <span>{busy ? 'Dumping…' : 'Dump it'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
