import React, { useState, useEffect } from 'react';
import {
  Database,
  Tag,
  Gift,
  Send,
  AlertCircle,
  Clock,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Coins,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import api from '../api';

export default function DataLakeView({ userId = 'RoniDev' }) {
  const [dataLakeType, setDataLakeType] = useState('teacher_quirk');
  const [dataLakeTitle, setDataLakeTitle] = useState('');
  const [dataLakeContent, setDataLakeContent] = useState('');
  const [submittingData, setSubmittingData] = useState(false);
  const [valuationResult, setValuationResult] = useState(null);
  const [dataLakeHistory, setDataLakeHistory] = useState([]);
  const [microCreditsBalance, setMicroCreditsBalance] = useState(0);
  const [redeemMethod, setRedeemMethod] = useState('compute_credits');
  const [redeemMsg, setRedeemMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await api.getMicrocreditsHistory(userId);
      if (res && res.status === 'success') {
        setDataLakeHistory(res.history || []);
        setMicroCreditsBalance(res.balance || 0);
      }
    } catch (e) {
      console.warn('Failed to fetch Data Lake history:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [userId]);

  const handleSubmitDataLake = async (e) => {
    e.preventDefault();
    if (!dataLakeTitle.trim() || !dataLakeContent.trim()) return;

    setSubmittingData(true);
    setValuationResult(null);
    try {
      const res = await api.submitDataLakeMicrocredits({
        data_type: dataLakeType,
        title: dataLakeTitle.trim(),
        data_content: dataLakeContent.trim(),
      });
      if (res && res.status === 'success') {
        setValuationResult(res);
        setDataLakeTitle('');
        setDataLakeContent('');
        await fetchHistory();
      }
    } catch (e) {
      alert(e.message || 'Error submitting data to Data Lake');
    } finally {
      setSubmittingData(false);
    }
  };

  const handleRedeemMicrocredits = async () => {
    setRedeemMsg('');
    try {
      const res = await api.redeemMicrocredits({
        amount: 20,
        destination: redeemMethod,
      });
      setRedeemMsg(res.message || '✅ 20 Micro-Credits redeemed successfully toward compute credits.');
      await fetchHistory();
      setTimeout(() => setRedeemMsg(''), 6000);
    } catch (e) {
      setRedeemMsg(`❌ Error: ${e.message || 'Redemption failed'}`);
    }
  };

  return (
    <div className="space-y-6 text-slate-100 max-w-5xl mx-auto animate-fadeIn">
      {/* Header Banner */}
      <div className="clean-card rounded-3xl p-6 bg-slate-950/80 border border-emerald-500/30 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-2xl font-bold shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-semibold mb-1">
              <Sparkles className="w-3.5 h-3.5" /> Anonymized Training Pool & Micro-Credits
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Academic Data Lake & Micro-Credits</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Submit empirical course data, grading patterns, rubrics, or lecture notes to earn micro-credits and subscription discounts.
            </p>
          </div>
        </div>

        {/* Balance Card */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/20 flex items-center justify-between gap-4 shrink-0">
          <div>
            <span className="text-[10px] text-slate-400 font-mono uppercase block">Data Lake Balance</span>
            <div className="text-xl font-black text-emerald-400 font-mono">
              {microCreditsBalance} cr
            </div>
            <span className="text-[10px] text-slate-400">100 cr = $1.00 USD</span>
          </div>
          <button
            type="button"
            onClick={handleRedeemMicrocredits}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer shrink-0"
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

      {/* Honest 2+ Business Days Crediting Notice */}
      <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3">
        <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong>Micro-Credits Crediting & Verification Policy:</strong> Micro-credits are only credited to your live account once your submitted training data is verified and utilized by the synthesis engine. Processing may take <strong>2+ business days</strong> for credits to arrive in your balance.
        </div>
      </div>

      {/* Data Submission Form */}
      <div className="clean-card rounded-3xl p-6 sm:p-8 bg-slate-950/60 border border-white/10 space-y-5">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-400" />
            Submit Training Data to Earn Micro-Credits
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            An autonomous sub-agent evaluates your submission on Relevance, Uniqueness, and Actionability (rewards 1–25 cr).
          </p>
        </div>

        <form onSubmit={handleSubmitDataLake} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1 text-[11px] font-semibold">Data Category</label>
              <select
                value={dataLakeType}
                onChange={(e) => setDataLakeType(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
              >
                <option value="assignment_score">Assignment Score: predicted vs actual (1–5 cr)</option>
                <option value="teacher_quirk">Teacher Grading Quirks & Patterns (5–15 cr)</option>
                <option value="lecture_notes">Lecture Notes & Transcripts (5–25 cr)</option>
                <option value="instructor_feedback">Instructor Rubric Feedback (10–25 cr)</option>
                <option value="feedback_sample">Detection & Evasion Feedback (10–25 cr)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1 text-[11px] font-semibold">Title / Subject</label>
              <input
                type="text"
                placeholder="e.g. Prof. Miller's Chemistry Grading Rubric"
                value={dataLakeTitle}
                onChange={(e) => setDataLakeTitle(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1 text-[11px] font-semibold">Empirical Data / Content</label>
            <textarea
              rows={4}
              placeholder="Provide empirical details, assignment instructions, teacher quirks, or lecture excerpts..."
              value={dataLakeContent}
              onChange={(e) => setDataLakeContent(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-xl p-3.5 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 leading-relaxed font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={submittingData || !dataLakeTitle.trim() || !dataLakeContent.trim()}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-md shadow-emerald-600/20"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{submittingData ? 'Sub-Agent Ranking & Evaluating…' : 'Submit to Data Lake (2+ Days Verification)'}</span>
          </button>
        </form>

        {/* Live Sub-Agent Valuation Result */}
        {valuationResult && (
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-amber-500/30 text-xs space-y-2.5 animate-fadeIn">
            <div className="flex items-center justify-between text-amber-400 font-bold">
              <span>⏳ Estimated +{valuationResult.credits_awarded} Micro-Credits</span>
              <span className="font-mono text-[10px] text-amber-300 font-semibold bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                Pending Utilization (2+ Business Days)
              </span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">{valuationResult.valuation?.reasoning}</p>
            <div className="grid grid-cols-3 gap-2 pt-2 font-mono text-[10px] text-slate-400 border-t border-white/5">
              <div>Relevance: {valuationResult.valuation?.relevance}/10</div>
              <div>Uniqueness: {valuationResult.valuation?.uniqueness}/10</div>
              <div>Actionability: {valuationResult.valuation?.actionability}/10</div>
            </div>
          </div>
        )}
      </div>

      {/* Submission History Table */}
      <div className="clean-card rounded-3xl p-6 bg-slate-950/60 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Your Data Lake Submissions & Crediting History
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">
            {dataLakeHistory.length} Submissions
          </span>
        </div>

        {dataLakeHistory.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No submissions recorded yet. Submit rubrics or notes above to earn micro-credits.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 text-[11px]">
                  <th className="pb-3 font-semibold">Title</th>
                  <th className="pb-3 font-semibold">Category</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Valuation</th>
                  <th className="pb-3 font-semibold">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {dataLakeHistory.map((sub, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="py-3 font-semibold text-white">{sub.title}</td>
                    <td className="py-3 text-[11px] text-slate-400 capitalize">{sub.data_type?.replace('_', ' ')}</td>
                    <td className="py-3">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${
                          sub.status === 'credited'
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                        }`}
                      >
                        {sub.status === 'credited' ? '✅ Credited' : '⏳ Pending (2+ days)'}
                      </span>
                    </td>
                    <td className="py-3 text-emerald-400 font-bold">+{sub.credits_awarded} cr</td>
                    <td className="py-3 text-[11px] text-slate-500">
                      {sub.created_at ? sub.created_at.slice(0, 10) : 'Recent'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
