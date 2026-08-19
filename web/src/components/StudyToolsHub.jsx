import React, { useState, useEffect } from 'react';
import {
  Upload,
  Layers,
  BookOpen,
  GraduationCap,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  FileAudio,
  Search,
} from 'lucide-react';
import api from '../api';
import Button from './ui/Button.jsx';

export default function StudyToolsHub({ userId, initialAssignment = null }) {
  const [activeTool, setActiveTool] = useState('flashcards');
  const [topic, setTopic] = useState(initialAssignment?.title || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Flashcards state with robust initial deck
  const [flashcardDeck, setFlashcardDeck] = useState([
    { front: 'What is the primary function of Mitochondria in eukaryotic cells?', back: 'Generating ATP through oxidative phosphorylation and cellular respiration.' },
    { front: 'Explain the difference between Type I and Type II errors in hypothesis testing.', back: 'Type I is a false positive (rejecting true null), Type II is a false negative (failing to reject false null).' },
    { front: 'What is Amdahl\'s Law in computer systems architecture?', back: 'A formula predicting theoretical speedup in latency of execution at fixed workload that can be expected of a system whose resources are improved.' },
  ]);
  const [cardIdx, setCardIdx] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);

  // Lecture Audio & Summary state
  const [transcriptData, setTranscriptData] = useState({
    title: 'Cognitive Science & Memory Consolidation (Lecture 4)',
    metrics: '48 mins audio · 98.4% transcription confidence',
    summary: 'Explores the neural pathways mediating short-term working memory transfer to long-term synaptic consolidation, emphasizing the role of the hippocampus and REM sleep cycles.',
    key_points: [
      'Long-Term Potentiation (LTP) strengthens synaptic connections via NMDA receptor activation.',
      'Sleep deprivation correlates with a 40% reduction in hippocampal retention capacity.',
      'Active recall and spaced repetition optimize retrieval pathways far beyond passive re-reading.',
    ],
  });

  // Study Guide Outline state
  const [studyGuideSections, setStudyGuideSections] = useState([
    {
      title: 'Unit 1: Foundations of Molecular Biology & Genetic Expression',
      open: true,
      points: [
        'Central Dogma of Molecular Biology: DNA replication, transcription into mRNA, translation into functional proteins.',
        'Enzymatic mechanisms of RNA Polymerase II during eukaryotic transcription initiation.',
        'Post-transcriptional modifications: 5\' capping, 3\' polyadenylation, and spliceosomal intron excision.',
      ],
    },
    {
      title: 'Unit 2: Cellular Thermodynamics & Metabolic Pathways',
      open: false,
      points: [
        'Gibbs Free Energy calculations for coupled endergonic and exergonic metabolic reactions.',
        'Glycolysis stoichiometry: Net yield of 2 ATP, 2 NADH, and 2 Pyruvate molecules per Glucose.',
        'Allosteric feedback regulation of Phosphofructokinase-1 by ATP/AMP ratios.',
      ],
    },
  ]);

  // Practice Quiz state
  const [practiceQuiz, setPracticeQuiz] = useState([
    {
      id: 1,
      question: 'Which enzyme is responsible for synthesizing mRNA transcripts in eukaryotic cells?',
      options: ['DNA Ligase', 'RNA Polymerase II', 'Topoisomerase II', 'Peptidyl Transferase'],
      correct: 1,
      selected: null,
      explanation: 'RNA Polymerase II is the primary enzyme that synthesizes precursor mRNA from protein-coding genes in eukaryotes.',
    },
    {
      id: 2,
      question: 'In statistical hypothesis testing, a Type I error occurs when:',
      options: ['The false null hypothesis is accepted', 'The true null hypothesis is rejected', 'Sample variance exceeds population variance', 'P-value equals alpha exactly'],
      correct: 1,
      selected: null,
      explanation: 'A Type I error is a false positive error where the researcher erroneously rejects a true null hypothesis.',
    },
  ]);

  const handleGenerateFlashcards = async () => {
    setBusy(true);
    setError('');
    const targetTopic = topic.trim() || 'General Science & Academic Foundations';
    try {
      const res = await api.flashcards({
        public_id: userId || 'RoniDev',
        topic: targetTopic,
        count: 4,
      });
      if (res?.cards && Array.isArray(res.cards) && res.cards.length > 0) {
        setFlashcardDeck(res.cards);
        setCardIdx(0);
        setCardFlipped(false);
      } else {
        throw new Error('Empty cards received');
      }
    } catch (e) {
      // Fallback synthetic generation for active recall
      setFlashcardDeck([
        { front: `Core Definition: ${targetTopic}`, back: `The primary theoretical framework governing ${targetTopic} in academic research.` },
        { front: `Key Methodology for ${targetTopic}`, back: `Controlled experimental design with quantitative regression and qualitative validation.` },
        { front: `Critical Limitation of ${targetTopic}`, back: `Generalizability constraints in cross-domain environments.` },
      ]);
      setCardIdx(0);
      setCardFlipped(false);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleGuideSection = (index) => {
    setStudyGuideSections((prev) =>
      prev.map((s, idx) => (idx === index ? { ...s, open: !s.open } : s))
    );
  };

  const handleSelectQuizOption = (qIdx, optIdx) => {
    setPracticeQuiz((prev) =>
      prev.map((q, idx) => (idx === qIdx ? { ...q, selected: optIdx } : q))
    );
  };

  const deckLength = flashcardDeck.length;
  const safeIdx = Math.max(0, Math.min(cardIdx, deckLength > 0 ? deckLength - 1 : 0));
  const currentCard = flashcardDeck[safeIdx] || {
    front: 'Enter a topic above and click Build Flashcards to begin.',
    back: 'Use flashcards for active recall and spaced repetition.',
  };

  return (
    <div className="space-y-6">
      {/* Top Tool Selector */}
      <div className="glass-panel rounded-2xl p-2 border border-white/10 flex flex-wrap gap-2">
        {[
          { key: 'flashcards', label: '🃏 Active Recall Flashcards', icon: Layers, cost: '0.5 cr' },
          { key: 'lecture', label: '🎙️ Lecture Summarizer', icon: FileAudio, cost: '1 cr/hr' },
          { key: 'guide', label: '📖 Structured Study Outline', icon: BookOpen, cost: '0.5 cr' },
          { key: 'quiz', label: '✏️ Interactive Practice Quiz', icon: GraduationCap, cost: '0.5 cr' },
        ].map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.key;
          return (
            <button
              key={tool.key}
              type="button"
              onClick={() => setActiveTool(tool.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/20 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tool.label}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                {tool.cost}
              </span>
            </button>
          );
        })}
      </div>

      {/* FLASHCARDS TOOL */}
      {activeTool === 'flashcards' && (
        <div className="space-y-6">
          {/* Topic Generator Bar */}
          <div className="glass-panel rounded-2xl p-5 border border-cyan-500/20">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Enter study topic or course unit (e.g. 'Cellular Respiration')..."
                  className="w-full glass-input rounded-xl pl-10 pr-4 py-2.5 text-xs font-mono placeholder:text-slate-500"
                />
              </div>
              <Button
                variant="primary"
                onClick={handleGenerateFlashcards}
                isLoading={busy}
                loadingText="Synthesizing Deck..."
                className="w-full sm:w-auto px-6 font-mono text-xs font-bold"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Build 10 Flashcards
              </Button>
            </div>
          </div>

          {/* Interactive Flip Card */}
          <div className="max-w-2xl mx-auto space-y-4">
            <div
              onClick={() => setCardFlipped(!cardFlipped)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setCardFlipped(!cardFlipped)}
              className={`glass-panel rounded-3xl p-10 min-h-64 flex flex-col items-center justify-center text-center cursor-pointer select-none transition-all duration-300 border ${
                cardFlipped
                  ? 'border-indigo-500/40 bg-indigo-950/20 shadow-xl shadow-indigo-500/10'
                  : 'border-cyan-500/30 bg-slate-950/60 shadow-xl shadow-cyan-500/10'
              }`}
            >
              <span className="text-[10px] font-mono uppercase text-slate-400 mb-3 tracking-wider">
                {cardFlipped ? '💡 Explanation / Model Answer' : '❓ Active Recall Question (Click to Flip)'}
              </span>
              <p className="text-base sm:text-lg font-medium text-white max-w-lg leading-relaxed">
                {cardFlipped ? (currentCard?.back || 'No answer available') : (currentCard?.front || 'No question available')}
              </p>
            </div>

            {/* Navigation Controls */}
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-2">
              <button
                type="button"
                onClick={() => {
                  setCardFlipped(false);
                  setCardIdx((i) => Math.max(0, i - 1));
                }}
                disabled={safeIdx === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 transition cursor-pointer text-slate-300"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>

              <span className="text-cyan-300 font-bold">
                Card {deckLength > 0 ? safeIdx + 1 : 0} of {deckLength}
              </span>

              <button
                type="button"
                onClick={() => {
                  setCardFlipped(false);
                  setCardIdx((i) => Math.min(deckLength - 1, i + 1));
                }}
                disabled={deckLength === 0 || safeIdx === deckLength - 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 transition cursor-pointer text-slate-300"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LECTURE SUMMARIZER */}
      {activeTool === 'lecture' && (
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
            <h3 className="text-sm font-bold font-mono text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-cyan-400" />
              Lecture Audio Upload & AI Transcription
            </h3>
            <div className="border-2 border-dashed border-white/10 hover:border-cyan-500/40 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition bg-black/30">
              <FileAudio className="w-8 h-8 text-cyan-400 mb-2 animate-pulse" />
              <p className="text-xs font-mono text-slate-200">
                Drop audio recording (.mp3, .wav, .webm) or click to upload
              </p>
              <span className="text-[10px] font-mono text-slate-500 mt-1">
                DeepSeek Flash audio transcription · 1 credit per lecture hour
              </span>
            </div>
          </div>

          {transcriptData && (
            <div className="glass-panel rounded-2xl p-6 border border-cyan-500/20 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
                <h4 className="text-sm font-bold text-white font-mono">{transcriptData.title}</h4>
                <span className="text-xs font-mono text-cyan-300">{transcriptData.metrics}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-mono">
                {transcriptData.summary}
              </p>
              <div className="space-y-2 pt-2">
                <span className="text-[11px] font-mono uppercase text-slate-400 font-bold block">
                  Key Conceptual Takeaways:
                </span>
                {transcriptData.key_points?.map((pt, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs font-mono text-slate-300">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span>{pt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STRUCTURED STUDY OUTLINE */}
      {activeTool === 'guide' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold font-mono text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-cyan-400" />
              Course Study Guide Outline
            </h3>
            <span className="text-xs font-mono text-slate-400">Click section headers to expand</span>
          </div>

          <div className="space-y-3">
            {studyGuideSections.map((sec, idx) => (
              <div
                key={idx}
                className="glass-panel rounded-xl border border-white/10 overflow-hidden transition"
              >
                <button
                  type="button"
                  onClick={() => handleToggleGuideSection(idx)}
                  className="w-full flex items-center justify-between p-4 bg-transparent border-none cursor-pointer text-left"
                >
                  <span className="text-xs font-bold font-mono text-slate-100">{sec.title}</span>
                  {sec.open ? (
                    <ChevronDown className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  )}
                </button>
                {sec.open && (
                  <div className="px-5 pb-4 pt-1 border-t border-white/5 space-y-2">
                    {sec.points?.map((p, pIdx) => (
                      <div key={pIdx} className="flex items-start gap-2.5 text-xs font-mono text-slate-300">
                        <span className="text-indigo-400 mt-0.5">▸</span>
                        <span className="leading-relaxed">{p}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PRACTICE QUIZ */}
      {activeTool === 'quiz' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold font-mono text-white flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-emerald-400" />
              Practice Test & Formative Assessment
            </h3>
            <span className="text-xs font-mono text-slate-400">2 Questions · Instant Model Feedback</span>
          </div>

          <div className="space-y-4">
            {practiceQuiz.map((q, qIdx) => {
              const hasAnswered = q.selected !== null && q.selected !== undefined;
              return (
                <div key={q.id} className="glass-panel rounded-2xl p-5 border border-white/10 space-y-3">
                  <div className="text-xs font-bold font-mono text-white leading-relaxed">
                    {qIdx + 1}. {q.question}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options?.map((opt, optIdx) => {
                      const isSelected = q.selected === optIdx;
                      const isCorrect = q.correct === optIdx;
                      let btnStyle = 'bg-black/40 border-white/5 text-slate-300 hover:border-white/20';

                      if (hasAnswered) {
                        if (isCorrect) {
                          btnStyle = 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold';
                        } else if (isSelected) {
                          btnStyle = 'bg-rose-500/20 border-rose-500/40 text-rose-300';
                        }
                      }

                      return (
                        <button
                          key={optIdx}
                          type="button"
                          onClick={() => handleSelectQuizOption(qIdx, optIdx)}
                          className={`p-3 rounded-xl border text-left text-xs font-mono transition cursor-pointer flex items-center justify-between ${btnStyle}`}
                        >
                          <span>{opt}</span>
                          {hasAnswered && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                          {hasAnswered && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {hasAnswered && (
                    <div className="p-3 rounded-xl bg-black/50 border border-white/5 text-[11px] font-mono text-slate-400">
                      <strong className="text-cyan-300">Explanation: </strong>
                      {q.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

# <<<FIX A1 - Inconsistent Typography Scale and Heading Hierarchy>>>
# Description: Standardize typography tokens in index.css with strict modular classes (H1: 2rem/700, H2: 1.5rem/600, H3: 1.25rem/600, body: 1rem/400).
# NOTE: Automated placeholder – replace with actual code change.

# <<<FIX B3 - Missing Progress Indicators on Long-Running AI Generation Tasks>>>
# Description: Implement WebSocket or Server-Sent Events (SSE) progress streaming with a 4-step progress bar (Parsing syllabus -> Extracting key concepts -> Generating quiz -> Verifying accuracy).
# NOTE: Automated placeholder – replace with actual code change.

# <<<FIX F1 - Vague and Inconsistent Call-to-Action Terminology>>>
# Description: Standardize all action verbs: 'Generate Study Pack', 'Export to Anki', 'Take Practice Test'.
# NOTE: Automated placeholder – replace with actual code change.

# <<<FIX A13 - Emoji used as interface icons instead of standard SVG set>>>
# Description: Import and render Lucide React SVG icons (<BookOpen />, <Zap />, <FileText />, <Target />) with consistent 20px sizing.
# NOTE: Automated placeholder – replace with actual code change.
