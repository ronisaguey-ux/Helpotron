import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  Upload,
  FileText,
  Send,
  AlertCircle,
  Clock,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Coins,
  ShieldCheck,
  TrendingUp,
  X,
  Bot,
} from 'lucide-react';
import api from '../api';

export default function DataLakeView({ userId = 'RoniDev' }) {
  const [textContent, setTextContent] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [valuationResult, setValuationResult] = useState(null);
  const [dataLakeHistory, setDataLakeHistory] = useState([]);
  const [microCreditsBalance, setMicroCreditsBalance] = useState(0);
  const [redeemMsg, setRedeemMsg] = useState('');
  const fileInputRef = useRef(null);

  const fetchHistory = async () => {
    try {
      const res = await api.getMicrocreditsHistory(userId);
      if (res && res.status === 'success') {
        setDataLakeHistory(res.history || []);
        setMicroCreditsBalance(res.balance || 0);
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

  const handleRedeemMicrocredits = async () => {
    setRedeemMsg('');
    try {
      const res = await api.redeemMicrocredits({
        amount: 20,
        destination: 'compute_credits',
      });
      setRedeemMsg(res.message || '✅ 20 Micro-Credits redeemed successfully toward compute credits.');
      await fetchHistory();
      setTimeout(() => setRedeemMsg(''), 6000);
    } catch (e) {
      setRedeemMsg(`❌ Error: ${e.message || 'Redemption failed'}`);
    }
  };

  return (
    <div className="space-y-6 text-slate-100 max-w-4xl mx-auto animate-fadeIn">
      {/* Header Banner */}
      <div className="clean-card rounded-3xl p-6 bg-slate-950/80 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-2xl font-bold shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-semibold mb-1">
              <Bot className="w-3.5 h-3.5" /> Autonomous Subagent Classification
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Academic Data Lake</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Submit empirical notes or files. Subagent evaluates an estimated score (0–25 cr); actual credits are awarded once reviewed and implemented.
            </p>
          </div>
        </div>

        {/* Balance Card */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/20 flex items-center justify-between gap-4 shrink-0">
          <div>
            <span className="text-[10px] text-slate-400 font-mono uppercase block">Active Data Lake Balance</span>
            <div className="text-xl font-black text-emerald-400 font-mono">
              {microCreditsBalance} cr
            </div>
            <span className="text-[10px] text-slate-400">100 cr = $1.00 USD</span>
          </div>
          <button
            type="button"
            onClick={handleRedeemMicrocredits}
            disabled={microCreditsBalance < 20}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition cursor-pointer shrink-0"
          >
            Redeem 20 cr
          </button>
        </div>
      </div>

      {redeemMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300 font-mono">
          {redeemMsg}
        </div>
      )}

      {/* Crediting & Implementation Policy Notice */}
      <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3">
        <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong>Review & Implementation Policy:</strong> The score shown upon submission is an <strong>Estimated Score</strong>. Actual micro-credits are only awarded and added to your spendable balance once the entry is reviewed and successfully implemented into Helpotron (processing may take <strong>2+ business days</strong>).
        </div>
      </div>

      {/* Simplified Submission Card: Text + File Upload */}
      <div className="clean-card rounded-3xl p-6 sm:p-8 bg-slate-950/60 border border-white/10 space-y-5">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-400" />
            Contribute to Data Lake
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Just paste text or drop any file (rubric, syllabus, teacher quirks, notes, exam questions). The subagent does the rest.
          </p>
        </div>

        <form onSubmit={handleSubmitDataLake} className="space-y-4">
          {/* Text Area */}
          <div>
            <label className="text-slate-300 block mb-1 text-xs font-semibold">Paste or Type Text</label>
            <textarea
              rows={5}
              placeholder="Paste rubric details, teacher grading quirks, assignment guidelines, lecture excerpts, or study feedback..."
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-2xl p-4 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 leading-relaxed font-sans"
            />
          </div>

          {/* Upload File Box */}
          <div>
            <label className="text-slate-300 block mb-1 text-xs font-semibold">Attach File (Optional)</label>
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
              className="p-5 border-2 border-dashed border-white/10 hover:border-emerald-500/50 rounded-2xl bg-slate-900/50 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition"
            >
              <Upload className="w-6 h-6 text-emerald-400" />
              <div className="text-xs text-slate-200 font-medium">
                Click to browse or drag and drop files here
              </div>
              <p className="text-[11px] text-slate-400">
                PDF, Word, TXT, CSV, Images, or Audio lecture recordings
              </p>
            </div>

            {/* Attached Files Pill List */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-3">
                {attachedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 px-3 py-1.5 rounded-xl text-xs"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="font-medium">{file.name}</span>
                    <span className="text-[10px] text-slate-400">({file.size})</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
                      }}
                      className="hover:text-white text-slate-400 p-0.5"
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
            className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-emerald-600/20"
          >
            <Send className="w-4 h-4" />
            <span>{submitting ? 'Subagent Interpreting & Classifying…' : 'Submit to Data Lake (Est. Score: 0–25 cr)'}</span>
          </button>
        </form>

        {/* Live Subagent Valuation Output */}
        {valuationResult && (
          <div className="p-5 rounded-2xl bg-slate-900 border border-emerald-500/40 text-xs space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="font-bold text-white text-sm">Subagent Classification & Estimated Score</span>
              </div>
              <span className="font-mono text-xs px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold">
                Est. ~{valuationResult.estimated_credits || valuationResult.credits_awarded || 0} / 25 Micro-Credits
              </span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 space-y-1.5">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-400 font-medium">Classified Category:</span>
                <span className="text-emerald-300 font-semibold font-mono">
                  {valuationResult.valuation?.category || valuationResult.data_type}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-400 font-medium">Auto Title:</span>
                <span className="text-white font-semibold">{valuationResult.title}</span>
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
      <div className="clean-card rounded-3xl p-6 bg-slate-950/60 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Your Contributed Entries
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">
            {dataLakeHistory.length} Submissions
          </span>
        </div>

        {dataLakeHistory.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No submissions recorded yet. Paste notes or upload a file above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 text-[11px]">
                  <th className="pb-3 font-semibold">Classified Entry</th>
                  <th className="pb-3 font-semibold">Category</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Est. Score</th>
                  <th className="pb-3 font-semibold">Actual Award</th>
                  <th className="pb-3 font-semibold">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {dataLakeHistory.map((sub, i) => {
                  const isImplemented = sub.status === 'implemented' || sub.status === 'credited';
                  const estScore = sub.estimated_credits || sub.credits_awarded || 0;
                  const actualScore = isImplemented ? (sub.actual_credits || sub.credits_awarded || estScore) : 0;

                  return (
                    <tr key={i} className="hover:bg-white/[0.02]">
                      <td className="py-3 font-semibold text-white max-w-[200px] truncate">{sub.title}</td>
                      <td className="py-3 text-[11px] text-slate-400 capitalize">
                        {sub.data_type?.replace('_', ' ')}
                      </td>
                      <td className="py-3">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border ${
                            isImplemented
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                              : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                          }`}
                        >
                          {isImplemented ? '✅ Implemented' : '⏳ Pending Review'}
                        </span>
                      </td>
                      <td className="py-3 text-slate-300 font-bold">~{estScore} cr</td>
                      <td className="py-3">
                        {isImplemented ? (
                          <span className="text-emerald-400 font-bold">+{actualScore} cr</span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">Pending (0 cr)</span>
                        )}
                      </td>
                      <td className="py-3 text-[11px] text-slate-500">
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
