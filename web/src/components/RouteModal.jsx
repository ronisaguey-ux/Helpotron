/**
 * RouteModal.jsx — Route & Triage Unassigned Intake Modal (Stitch v6 / §3.7.3).
 * Triages raw dump/extension intake items with per-item decisions (New / Append / Discard).
 */
import React, { useState, useEffect } from 'react';
import {
  Route as RouteIcon, X, FileAudio, FileText, CheckCircle2,
  Sparkles, ArrowRight, Trash2, Plus, CornerDownRight
} from 'lucide-react';
import { TRIAGE_DECISIONS, analyzeIntakeConfidence, estimateTriageTokens } from '../lib/routing.js';

export default function RouteModal({
  isOpen = true,
  onClose = () => {},
  intakeItems = [],
  subjects = [
    { id: 'sub_bio', code: 'BIO-309', name: 'Organic Chemistry' },
    { id: 'sub_cs', code: 'CS-441', name: 'Distributed Systems' },
    { id: 'sub_math', code: 'MATH-202', name: 'Topology' },
    { id: 'sub_phy', code: 'PHY-201', name: 'Classical Mechanics' },
  ],
  onRouteComplete = () => {},
}) {
  const initialItems = intakeItems.length > 0 ? intakeItems : [
    {
      id: 'dump_01',
      name: 'Lecture_09_Chiral_Catalysts_Audio_Transcription.vtt',
      size: 43008,
      kind: 'Audio transcript',
    },
    {
      id: 'dump_02',
      name: 'CS441_Raft_Invariant_Safety_Proofs_Handout.pdf',
      size: 118784,
      kind: 'PDF Document',
    },
    {
      id: 'dump_03',
      name: 'Topology_Midterm_Review_Problem_Set.txt',
      size: 18432,
      kind: 'Text notes',
    },
  ];

  const [items, setItems] = useState(() =>
    initialItems.map((item) => {
      const analysis = analyzeIntakeConfidence(item.name);
      return {
        ...item,
        decision: TRIAGE_DECISIONS.NEW,
        targetSubject: analysis.subjectCode,
        confidence: analysis.confidence,
        keywords: analysis.keywords,
      };
    })
  );

  const [submitting, setSubmitting] = useState(false);

  // Esc key listener
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDecisionChange = (id, dec) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, decision: dec } : it))
    );
  };

  const handleSubjectChange = (id, subj) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, targetSubject: subj } : it))
    );
  };

  const totalTokens = items
    .filter((it) => it.decision !== TRIAGE_DECISIONS.DISCARD)
    .reduce((acc, it) => acc + estimateTriageTokens(it).tokenCost, 0);

  const handleConfirmRouting = async () => {
    setSubmitting(true);
    try {
      await onRouteComplete(items);
      onClose();
    } catch (e) {
      console.warn('Routing error:', e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-unit-3 sm:p-unit-6 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="route-modal-title"
        className="w-full max-w-2xl rounded-3xl bg-surface-container-lowest/95 border border-outline-variant/30 shadow-2xl p-unit-5 sm:p-unit-6 flex flex-col gap-unit-5 relative overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-unit-3 border-b border-outline-variant/15 pb-4">
          <div className="flex items-center gap-unit-3">
            <div className="w-11 h-11 rounded-2xl bg-primary-container/20 text-primary flex items-center justify-center shrink-0 shadow-inner">
              <RouteIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 id="route-modal-title" className="font-headline-lg text-title-md font-semibold text-on-surface">
                Route &amp; Triage Unassigned Intake
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {items.length} unassigned items awaiting subject binding.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Triage Items List */}
        <div className="flex flex-col gap-unit-3 max-h-96 overflow-y-auto pr-1">
          {items.map((item) => {
            const isAudio = item.name.endsWith('.vtt') || item.name.endsWith('.mp3');
            return (
              <div
                key={item.id}
                className="rounded-2xl bg-surface-container-low/60 border border-outline-variant/20 p-unit-4 flex flex-col gap-unit-3 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start gap-unit-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-surface-container-high text-primary flex items-center justify-center shrink-0 mt-0.5">
                      {isAudio ? <FileAudio className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <span className="font-body-sm text-body-sm text-on-surface font-semibold truncate block">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2 text-xs text-outline mt-0.5">
                        <span>{item.kind || 'Document'}</span>
                        <span>•</span>
                        <span>{(item.size / 1024).toFixed(0)} KB</span>
                        {item.keywords && (
                          <>
                            <span>•</span>
                            <span className="text-on-surface-variant truncate">
                              Matches: {item.keywords.join(', ')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Confidence Pill */}
                  <div className="inline-flex items-center gap-1 self-start sm:self-center px-2 py-0.5 rounded-full bg-sem-green/10 text-sem-green font-chip-status text-[11px] whitespace-nowrap">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{item.confidence}% CONFIDENCE</span>
                  </div>
                </div>

                {/* Subject and Action Selector Grid */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-unit-2 pt-1">
                  <div className="md:col-span-6 flex flex-col gap-1">
                    <label className="font-label-caps text-[10px] text-outline uppercase tracking-wider">
                      Target Subject Module
                    </label>
                    <select
                      value={item.targetSubject}
                      onChange={(e) => handleSubjectChange(item.id, e.target.value)}
                      disabled={item.decision === TRIAGE_DECISIONS.DISCARD}
                      className="h-10 px-unit-3 rounded-xl bg-surface-container-lowest border border-outline-variant/25 text-on-surface font-body-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
                    >
                      {subjects.map((sub) => (
                        <option key={sub.id || sub.code} value={sub.code}>
                          {sub.code} {sub.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-6 flex flex-col gap-1">
                    <label className="font-label-caps text-[10px] text-outline uppercase tracking-wider">
                      Triage Action
                    </label>
                    <div className="grid grid-cols-3 gap-1 bg-surface-container-lowest p-1 rounded-xl border border-outline-variant/20">
                      {[
                        { id: TRIAGE_DECISIONS.NEW, label: 'New' },
                        { id: TRIAGE_DECISIONS.APPEND, label: 'Append' },
                        { id: TRIAGE_DECISIONS.DISCARD, label: 'Discard' },
                      ].map((btn) => {
                        const isSelected = item.decision === btn.id;
                        return (
                          <button
                            key={btn.id}
                            type="button"
                            onClick={() => handleDecisionChange(item.id, btn.id)}
                            className={`py-1 rounded-lg font-label-caps text-[11px] transition-all cursor-pointer ${
                              isSelected
                                ? btn.id === TRIAGE_DECISIONS.DISCARD
                                  ? 'bg-error-container/25 text-error font-semibold'
                                  : 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                                : 'text-outline hover:text-on-surface'
                            }`}
                          >
                            {btn.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-unit-3 pt-unit-3 border-t border-outline-variant/15">
          <div className="flex items-center gap-2 font-code-sm text-xs text-outline">
            <span>Estimated synthesis budget:</span>
            <span className="text-primary font-semibold">{totalTokens} Tokens</span>
            <span>(${(totalTokens * 0.00001).toFixed(4)} USD)</span>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-unit-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-label-caps transition-colors cursor-pointer"
            >
              Cancel (Esc)
            </button>
            <button
              type="button"
              disabled={submitting || items.length === 0}
              onClick={handleConfirmRouting}
              className="h-11 px-unit-5 rounded-xl bg-primary text-on-primary font-label-caps text-label-caps font-semibold flex items-center gap-2 shadow-[0_0_20px_rgba(89,216,201,0.25)] hover:shadow-[0_0_28px_rgba(89,216,201,0.4)] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              <span>Batch Route Intake</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
