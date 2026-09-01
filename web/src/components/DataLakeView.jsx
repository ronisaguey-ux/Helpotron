import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  Upload,
  FileText,
  Send,
  Clock,
  Coins,
  TrendingUp,
  X,
  Bot,
} from 'lucide-react';
import api from '../api';
import SectionCard from './SectionCard.jsx';

export default function DataLakeView({ userId = '' }) {
  const [textContent, setTextContent] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [valuationResult, setValuationResult] = useState(null);
  const [dataLakeHistory, setDataLakeHistory] = useState([]);
  const fileInputRef = useRef(null);

  const fetchHistory = async () => {
    try {
      const res = await api.getMicrocreditsHistory(userId);
      if (res && res.status === 'success') {
        setDataLakeHistory(res.history || []);
      }
    } catch (e) {
      console.warn('Failed to fetch Data Lake history:', e);
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

  const handleSubmitDataLake = async (e) => {
    e.preventDefault();
    if (!textContent.trim() && attachedFiles.length === 0) return;

    setSubmitting(true);
    setValuationResult(null);

    try {
      const fileName = attachedFiles.length > 0 ? attachedFiles[0].name : '';
      const payload = {
        data_content: textContent.trim(),
        metadata: {
          file_name: fileName,
          file_count: attachedFiles.length,
          files: attachedFiles.map((f) => f.name),
        },
      };

      const res = await api.submitDataLakeMicrocredits(payload);
      if (res && res.status === 'success') {
        setValuationResult(res.submission || res);
        setTextContent('');
        setAttachedFiles([]);
        await fetchHistory();
      }
    } catch (e) {
      alert(e.message || 'Error submitting data to Data Lake');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 text-on-surface max-w-4xl mx-auto animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center text-primary text-2xl font-bold shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 text-primary font-label-caps text-label-caps uppercase font-semibold mb-1.5">
              <Bot className="w-3.5 h-3.5" /> Autonomous Subagent Classification
            </div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Academic Data Lake</h2>
            <p className="font-body-sm text-xs text-on-surface-variant mt-1">
              Submit empirical notes or files. Subagent evaluates an estimated score (0–25 micro-credits); actual credits are awarded once reviewed and implemented. 1000 micro-credits = 1 credit, shown in your balance.
            </p>
          </div>
        </div>
      </div>

      {/* Crediting & Implementation Policy Notice */}
      <div className="p-4 rounded-2xl bg-surface-container-lowest border border-amber-500/30 text-amber-300 text-xs flex items-start gap-3 shadow-sm">
        <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="font-body-sm leading-relaxed">
          <strong>Review & Implementation Policy:</strong> The score shown upon submission is an <strong>Estimated Score</strong>. Actual micro-credits are only awarded and added to your spendable balance once the entry is reviewed and successfully implemented into Helpotron (processing may take <strong>2+ business days</strong>).
        </div>
      </div>

      {/* Simplified Submission Card: Text + File Upload */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div>
          <h2 className="font-title-md text-title-md text-on-surface flex items-center gap-2">
            <Coins className="w-4 h-4 text-primary" />
            Contribute to Data Lake
          </h2>
          <p className="font-body-sm text-xs text-on-surface-variant mt-1">
            Just paste text or drop any file (rubric, syllabus, teacher quirks, notes, exam questions). The subagent does the rest.
          </p>
        </div>

        <form onSubmit={handleSubmitDataLake} className="space-y-4">
          {/* Text Area */}
          <div>
            <label className="font-label-caps text-xs uppercase tracking-wider text-on-surface-variant block mb-1.5">Paste or Type Text</label>
            <textarea
              rows={5}
              placeholder="Paste rubric details, teacher grading quirks, assignment guidelines, lecture excerpts, or study feedback..."
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              className="w-full rounded-2xl bg-surface-container-low border border-outline-variant/30 p-4 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
            />
          </div>

          {/* Upload File Box */}
          <div>
            <label className="font-label-caps text-xs uppercase tracking-wider text-on-surface-variant block mb-1.5">Attach File (Optional)</label>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              multiple
              className="hidden"
            />

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="p-6 border-2 border-dashed border-outline-variant/40 hover:border-primary rounded-2xl bg-surface-container-low flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition"
            >
              <Upload className="w-6 h-6 text-primary" />
              <div className="font-body-sm text-xs text-on-surface font-medium">
                Click to browse or drag and drop files here
              </div>
              <p className="font-tabular-stat text-[11px] text-on-surface-variant">
                PDF, Word, TXT, CSV, Images, or Audio lecture recordings
              </p>
            </div>

            {/* Attached Files Pill List */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-3">
                {attachedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-primary/15 border border-primary/20 text-primary px-3 py-1.5 rounded-xl text-xs"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="font-medium">{file.name}</span>
                    <span className="text-[10px] text-on-surface-variant">({file.size})</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
                      }}
                      className="hover:text-on-surface text-on-surface-variant p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Action */}
          <button
            type="submit"
            disabled={submitting || (!textContent.trim() && attachedFiles.length === 0)}
            className="w-full sm:w-auto px-6 py-3 bg-primary hover:bg-primary-container disabled:opacity-40 text-on-primary rounded-xl font-label-caps text-xs uppercase tracking-wider font-semibold flex items-center justify-center gap-2 transition cursor-pointer shadow-sm"
          >
            <Send className="w-4 h-4" />
            <span>{submitting ? 'Subagent Interpreting & Classifying…' : 'Submit to Data Lake'}</span>
          </button>
        </form>

        {/* Live Subagent Valuation Output */}
        {valuationResult && (
          <div className="p-5 rounded-2xl bg-white/4 border border-white/8 text-xs space-y-3 animate-fadeIn">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                <span className="font-bold text-white text-sm break-words">Subagent Classification & Estimated Score</span>
              </div>
              <span className="font-mono text-xs px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold">
                Est. ~{valuationResult.estimated_credits || valuationResult.credits_awarded || 0} / 25 Micro-Credits
              </span>
            </div>

            <div className="p-3 bg-white/4 rounded-xl border border-white/8 space-y-1.5">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-400 font-medium">Classified Category:</span>
                <span className="text-emerald-300 font-semibold font-mono">
                  {valuationResult.valuation?.category || valuationResult.data_type}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-400 font-medium shrink-0">Auto Title:</span>
                <span className="text-white font-semibold min-w-0 break-words">{valuationResult.title}</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed pt-1">
                {valuationResult.valuation?.reasoning}
              </p>
            </div>

            <div className="text-[11px] text-amber-300/90 font-mono flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>Status: Pending Review & Implementation (Actual credits awarded upon integration)</span>
            </div>
          </div>
        )}
      </div>

      {/* History Table */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
        <div className="flex items-center justify-between w-full">
          <h3 className="font-title-md text-title-md text-on-surface flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Your Contributed Entries
          </h3>
          <span className="font-tabular-stat text-xs text-on-surface-variant bg-surface-container-low px-3 py-1 rounded-full">
            {dataLakeHistory.length} Submissions
          </span>
        </div>

        {dataLakeHistory.length === 0 ? (
          <div className="text-center py-8 font-body-sm text-xs text-on-surface-variant">
            No submissions recorded yet. Paste notes or upload a file above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* min-w: keep 6 columns legible — the wrapper scrolls on phones
                instead of crushing cells into unreadable snippets. */}
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-outline-variant/30 text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider">
                  <th className="pb-3 font-semibold">Classified Entry</th>
                  <th className="pb-3 font-semibold">Category</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Est. Score</th>
                  <th className="pb-3 font-semibold">Actual Award</th>
                  <th className="pb-3 font-semibold">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 font-tabular-stat">
                {dataLakeHistory.map((sub, i) => {
                  const isImplemented = sub.status === 'implemented' || sub.status === 'credited';
                  const estScore = sub.estimated_credits || sub.credits_awarded || 0;
                  const actualScore = isImplemented ? (sub.actual_credits || sub.credits_awarded || estScore) : 0;

                  return (
                    <tr key={i} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="py-3.5 font-semibold text-on-surface max-w-[200px] truncate font-body-sm">{sub.title}</td>
                      <td className="py-3.5 text-[11px] text-on-surface-variant capitalize">
                        {sub.data_type?.replace('_', ' ')}
                      </td>
                      <td className="py-3.5">
                        <span
                          className={`font-label-caps text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold ${
                            isImplemented
                              ? 'bg-primary/15 text-primary'
                              : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {isImplemented ? '✅ Implemented' : '⏳ Pending Review'}
                        </span>
                      </td>
                      <td className="py-3.5 text-on-surface font-bold">~{estScore} cr</td>
                      <td className="py-3.5">
                        {isImplemented ? (
                          <span className="text-primary font-bold">+{actualScore} cr</span>
                        ) : (
                          <span className="text-on-surface-variant/50 text-[10px]">Pending (0 cr)</span>
                        )}
                      </td>
                      <td className="py-3.5 text-[11px] text-on-surface-variant">
                        {sub.timestamp ? sub.timestamp.slice(0, 10) : sub.created_at ? sub.created_at.slice(0, 10) : 'Recent'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
