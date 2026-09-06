import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  Upload,
  FileText,
  Send,
  Clock,
  CheckCircle2,
  Coins,
  TrendingUp,
  X,
  AlertCircle,
  Download,
  RotateCcw,
  Sparkles,
  Layers,
  Trash2,
} from 'lucide-react';
import api from '../api.js';

export default function DataLakeView({ userId = '' }) {
  const [textContent, setTextContent] = useState('');
  const [title, setTitle] = useState('');
  const [dataType, setDataType] = useState('empirical_data');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [valuationResult, setValuationResult] = useState(null);
  const [dataLakeHistory, setDataLakeHistory] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [exporting, setExporting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const fileInputRef = useRef(null);

  const fetchHistory = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.getMicrocreditsHistory(userId);
      if (res && res.status === 'success') {
        setDataLakeHistory(res.history || []);
        if (typeof res.balance === 'number') {
          setBalance(res.balance);
        }
      }
    } catch (e) {
      setErrorMsg(e.message || 'Failed to load Data Lake submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [userId]);

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const mapped = files.map((f) => ({
      name: f.name,
      size: (f.size / 1024).toFixed(1) + ' KB',
      type: f.type,
      rawFile: f,
    }));
    setAttachedFiles((prev) => [...prev, ...mapped]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    const mapped = files.map((f) => ({
      name: f.name,
      size: (f.size / 1024).toFixed(1) + ' KB',
      type: f.type,
      rawFile: f,
    }));
    setAttachedFiles((prev) => [...prev, ...mapped]);
  };

  const removeFile = (index) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitDataLake = async (e) => {
    e.preventDefault();
    if (!textContent.trim() && attachedFiles.length === 0) return;

    setSubmitting(true);
    setValuationResult(null);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const fileName = attachedFiles.length > 0 ? attachedFiles[0].name : '';
      const payload = {
        title: title.trim() || fileName || 'Empirical Submission',
        data_type: dataType,
        data_content: textContent.trim(),
        metadata: {
          file_name: fileName,
          file_count: attachedFiles.length,
          files: attachedFiles.map((f) => f.name),
        },
      };

      const res = await api.submitDataLakeMicrocredits(payload);
      if (res && res.status === 'success') {
        const sub = res.submission || res;
        setValuationResult(sub);
        setSuccessMsg('Submission received and evaluated by the valuation agent!');
        setTextContent('');
        setTitle('');
        setAttachedFiles([]);
        await fetchHistory();
      }
    } catch (e) {
      setErrorMsg(e.message || 'Error submitting data to Data Lake');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportJson = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || '';
      const resp = await fetch('/api/datalake/export.json', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'datalake_entries.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to export entries');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteEntry = async (id) => {
    setDeletingId(id);
    setErrorMsg('');
    try {
      await api.deleteDataLakeEntry(id);
      await fetchHistory();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete entry');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-2 sm:p-4 animate-fadeIn">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2 font-code-sm text-xs text-on-surface-variant uppercase tracking-wider mb-1">
          <span>Platform System</span>
          <span>/</span>
          <span className="text-primary font-medium">Data Lake</span>
          <span>/</span>
          <span className="text-sem-cyan flex items-center gap-1 font-chip-status text-[10px] px-2 py-0.5 rounded-full bg-sem-cyan/10">
            DATA VALUATION
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-headline-lg-mobile md:font-headline-lg text-title-md md:text-headline-lg text-on-surface font-semibold tracking-tight">
              Empirical Training &amp; Feedback Data Lake
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-1">
              Contribute anonymized datasets, problem sets, and syllabi to earn micro-credits.
            </p>
          </div>

          <button
            type="button"
            disabled={exporting}
            onClick={handleExportJson}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-label-caps text-xs tracking-wider transition border border-outline-variant/20 flex items-center gap-2 shrink-0 self-start sm:self-center active:scale-[0.98] shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-primary" />
            <span>{exporting ? 'Exporting...' : 'Export My Entries (.json)'}</span>
          </button>
        </div>
      </div>

      {/* Inline Feedback Strip */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-error-container/20 border border-error/30 text-error text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={fetchHistory}
            className="px-2.5 py-1 rounded-lg bg-surface-container text-on-surface font-label-caps text-[10px] hover:bg-surface-container-high transition"
          >
            Retry
          </button>
        </div>
      )}

      {successMsg && (
        <div role="status" className="p-4 rounded-2xl bg-sem-green/15 border border-sem-green/30 text-sem-green text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg('')} className="p-1 hover:text-on-surface">
            &times;
          </button>
        </div>
      )}

      {/* Contribution Panel & Balance Strip */}
      <section className="rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 p-6 sm:p-8 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">
                Micro-Credits Balance
              </span>
              <span className="font-chip-status text-[10px] text-sem-green bg-sem-green/10 px-2 py-0.5 rounded-full">
                1000 : 1 CONVERSION
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-tabular-stat text-3xl sm:text-4xl text-primary font-bold">
                {balance.toLocaleString()}
              </span>
              <span className="font-code-sm text-xs text-on-surface-variant">MICRO-CREDITS</span>
            </div>
            <p className="font-code-sm text-xs text-on-surface-variant mt-1">
              Equivalency: ~{(balance / 1000).toFixed(2)} compute credits (${(balance / 1000).toFixed(2)} USD).
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-surface-container-low/80 border border-outline-variant/15 max-w-md text-xs text-on-surface-variant space-y-1">
            <span className="font-label-caps text-[10px] text-on-surface uppercase font-semibold block">
              Honest Valuation Policy
            </span>
            <p className="font-body-sm text-xs leading-relaxed">
              Submissions receive an immediate estimated score (0–25 micro-credits). Actual credits are awarded to your balance once reviewed and incorporated into model training.
            </p>
          </div>
        </div>
      </section>

      {/* Contribution Form & Live Valuation Panel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form (7 cols) */}
        <div className="lg:col-span-7 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <h2 className="font-title-md text-lg text-on-surface font-semibold">Submit Dataset or Syllabus</h2>
            <p className="font-body-sm text-xs text-on-surface-variant">
              Paste textual content, course rubrics, or drag and drop reference documents.
            </p>
          </div>

          <form onSubmit={handleSubmitDataLake} className="space-y-4">
            <div className="space-y-1">
              <label className="font-label-caps text-xs text-on-surface-variant uppercase">Title or Topic</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Organic Chemistry Midterm Synthesis Guide"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary transition"
              />
            </div>

            <div className="space-y-1">
              <label className="font-label-caps text-xs text-on-surface-variant uppercase">Category</label>
              <select
                value={dataType}
                onChange={(e) => setDataType(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary transition"
              >
                <option value="empirical_data">Empirical Dataset / Notes</option>
                <option value="syllabus">Course Syllabus / Schedule</option>
                <option value="problem_set">Practice Problem Set / Solutions</option>
                <option value="academic_rubric">Grading Rubric / Criteria</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-label-caps text-xs text-on-surface-variant uppercase">Content / Raw Text</label>
              <textarea
                rows={4}
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Paste curriculum notes, lecture summaries, or assignment details..."
                className="w-full p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary transition resize-y"
              />
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="p-6 rounded-2xl border-2 border-dashed border-outline-variant/30 hover:border-primary/50 bg-surface-container-low/40 hover:bg-surface-container-low transition cursor-pointer flex flex-col items-center justify-center text-center gap-2"
            >
              <Upload className="w-6 h-6 text-primary" />
              <div>
                <span className="font-body-sm text-xs font-semibold text-on-surface">Click to upload</span>
                <span className="font-body-sm text-xs text-on-surface-variant"> or drag files here</span>
              </div>
              <span className="font-code-sm text-[10px] text-on-surface-variant">PDF, DOCX, TXT up to 25MB</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            {attachedFiles.length > 0 && (
              <div className="space-y-1.5">
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">Attached Files:</span>
                {attachedFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-xl bg-surface-container-low text-xs border border-outline-variant/15"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-on-surface font-body-sm truncate">{f.name}</span>
                      <span className="font-code-sm text-[10px] text-on-surface-variant shrink-0">({f.size})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="p-1 text-on-surface-variant hover:text-error transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || (!textContent.trim() && attachedFiles.length === 0)}
              className="w-full min-h-[44px] px-5 py-3 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider font-semibold shadow-[0_0_20px_rgba(120,245,229,0.25)] hover:brightness-105 active:scale-[0.98] transition disabled:opacity-50"
            >
              {submitting ? 'Evaluating & Submitting...' : 'Submit to Data Lake'}
            </button>
          </form>
        </div>

        {/* Valuation Panel (5 cols) */}
        <div
          aria-live="polite"
          className="lg:col-span-5 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 p-6 shadow-sm flex flex-col justify-between space-y-4"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-xs text-primary uppercase tracking-wider font-semibold">
                Valuation Sub-Agent
              </span>
              <span className="font-chip-status text-[10px] text-sem-cyan bg-sem-cyan/10 px-2 py-0.5 rounded-full uppercase">
                Active Scorer
              </span>
            </div>

            <h3 className="font-title-md text-base text-on-surface font-semibold">
              Automated Empirical Scoring
            </h3>
            <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
              Every submission is graded on empirical rigor, structural consistency, and novelty to prevent low-quality spam.
            </p>

            {/* 2x2 Score Grid */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">Empirical Validity</span>
                <span className="font-tabular-stat text-base text-on-surface font-bold">
                  {valuationResult?.scores?.validity ? `${valuationResult.scores.validity}/10` : '—'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">Novelty Index</span>
                <span className="font-tabular-stat text-base text-on-surface font-bold">
                  {valuationResult?.scores?.novelty ? `${valuationResult.scores.novelty}/10` : '—'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">Completeness</span>
                <span className="font-tabular-stat text-base text-on-surface font-bold">
                  {valuationResult?.scores?.completeness ? `${valuationResult.scores.completeness}/10` : '—'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">Structural Schema</span>
                <span className="font-tabular-stat text-base text-on-surface font-bold">
                  {valuationResult?.scores?.structure ? `${valuationResult.scores.structure}/10` : '—'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-surface-container-low/80 border border-outline-variant/15 space-y-1">
            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">Latest Valuation</span>
            <div className="flex items-baseline gap-2">
              <span className="font-tabular-stat text-2xl text-primary font-bold">
                {valuationResult?.estimated_credits ? `+${valuationResult.estimated_credits}` : '—'}
              </span>
              <span className="font-code-sm text-xs text-on-surface-variant">Est. Micro-Credits</span>
            </div>
            <span className="font-code-sm text-[10px] text-on-surface-variant block">
              Status: {valuationResult?.status || 'Awaiting submission'}
            </span>
          </div>
        </div>
      </div>

      {/* My Entries Table / Mobile Cards */}
      <section className="rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-title-md text-lg text-on-surface font-semibold">My Submission Records</h2>
          <span className="font-tabular-stat text-xs text-on-surface-variant bg-surface-container-high px-2.5 py-0.5 rounded-full">
            {dataLakeHistory.length} Total
          </span>
        </div>

        {loading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-surface-container-low/50 animate-pulse" />
            ))}
          </div>
        ) : dataLakeHistory.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-surface-container-low/40 space-y-2">
            <Database className="w-8 h-8 text-on-surface-variant/40 mx-auto" />
            <p className="font-title-md text-sm text-on-surface font-medium">No Data Lake entries found</p>
            <p className="font-body-sm text-xs text-on-surface-variant">
              Submit your first empirical document or syllabus above to start earning micro-credits.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {dataLakeHistory.map((item, idx) => {
              const isImplemented = item.status === 'implemented';
              return (
                <div
                  key={item.id || item.submission_id || idx}
                  className="p-4 rounded-2xl bg-surface-container-low/60 border border-outline-variant/15 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-outline-variant/35 transition"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-body-sm text-sm font-semibold text-on-surface truncate">
                        {item.title || item.file_name || `Submission #${item.id || idx + 1}`}
                      </span>
                      <span className="font-chip-status text-[9px] px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant uppercase">
                        {item.data_type || 'empirical'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 font-code-sm text-[11px] text-on-surface-variant">
                      <span>{item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Recent'}</span>
                      <span>·</span>
                      <span>Est. Score: +{item.estimated_credits || 0} micro-credits</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 justify-between md:justify-end">
                    {/* Status Pill (NO emojis) */}
                    {isImplemented ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sem-green/15 text-sem-green font-chip-status text-[10px] font-semibold uppercase">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Implemented
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sem-amber/15 text-sem-amber font-chip-status text-[10px] font-semibold uppercase">
                        <Clock className="w-3.5 h-3.5" />
                        Pending Review
                      </span>
                    )}

                    {/* Delete entry button if id exists */}
                    {item.id && typeof item.id === 'number' && (
                      <button
                        type="button"
                        disabled={deletingId === item.id}
                        onClick={() => handleDeleteEntry(item.id)}
                        className="p-2 rounded-xl text-on-surface-variant hover:text-error hover:bg-error-container/20 transition min-h-[36px] min-w-[36px] flex items-center justify-center disabled:opacity-50"
                        title="Delete submission"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
