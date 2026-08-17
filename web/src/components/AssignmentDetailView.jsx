import React, { useState } from 'react';
import {
  ChevronLeft,
  ClipboardList,
  FileText,
  Sparkles,
  BookOpen,
  Layers,
  GraduationCap,
  Clock,
  User,
  CheckCircle2,
  Circle,
  Calendar,
  AlertTriangle,
} from 'lucide-react';

export default function AssignmentDetailView({ assignment, onBack, onGenerateStudyTool }) {
  const [rubricState, setRubricState] = useState(() => {
    const initial = {};
    const items = assignment.rubric || [
      'Hypothesis & research question clearly stated',
      'Empirical data tables with standard deviation',
      'Discussion ties observations to core theoretical framework',
      'Peer-reviewed citations formatted in APA 7th edition',
      'Originality & humanized cadence verified',
    ];
    items.forEach((_, idx) => {
      initial[idx] = idx === 0 || idx === 1; // sample default checked
    });
    return initial;
  });

  const [notes, setNotes] = useState(() => {
    return localStorage.getItem(`assignment_notes_${assignment.id}`) || '';
  });
  const [notesSaved, setNotesSaved] = useState(false);

  const rubricItems = assignment.rubric || [
    'Hypothesis & research question clearly stated',
    'Empirical data tables with standard deviation',
    'Discussion ties observations to core theoretical framework',
    'Peer-reviewed citations formatted in APA 7th edition',
    'Originality & humanized cadence verified',
  ];

  const handleToggleRubric = (idx) => {
    setRubricState((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleSaveNotes = () => {
    localStorage.setItem(`assignment_notes_${assignment.id}`, notes);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  };

  const completedCount = Object.values(rubricState).filter(Boolean).length;
  const progressPct = Math.round((completedCount / rubricItems.length) * 100);

  return (
    <div className="space-y-6">
      {/* Back Breadcrumb */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>Back to Assignments Matrix</span>
      </button>

      {/* Assignment Header Card */}
      <div className="glass-panel rounded-2xl p-6 border border-cyan-500/20 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                {assignment.subject || assignment.course || 'Core Subject'}
              </span>
              <span className="text-xs font-mono text-slate-400">
                {assignment.class_code || 'CODE-101'}
              </span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-wide">
              {assignment.title || assignment.name}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 mt-2">
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-indigo-400" />
                {assignment.teacher_name || assignment.instructor || 'Course Professor'}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                Due: {assignment.due_date || assignment.due || 'Upcoming'}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                Est. Time: {assignment.estimated_time || assignment.est || '2.5 hrs'}
              </span>
            </div>
          </div>

          {/* Rubric Progress Gauge */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/5 font-mono text-right shrink-0">
            <div className="text-[11px] text-slate-400">Rubric Compliance</div>
            <div className="text-2xl font-black text-cyan-300 mt-0.5">{progressPct}%</div>
            <div className="text-[10px] text-emerald-400">{completedCount} of {rubricItems.length} criteria met</div>
          </div>
        </div>
      </div>

      {/* Rubric Checklist Section */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold font-mono text-white flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-cyan-400" />
            Rubric & Grading Criteria Checklist
          </h2>
          <span className="text-xs font-mono text-slate-400">Click items to mark complete</span>
        </div>

        <div className="space-y-2.5">
          {rubricItems.map((item, idx) => {
            const isChecked = !!rubricState[idx];
            return (
              <label
                key={idx}
                onClick={() => handleToggleRubric(idx)}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  isChecked
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-slate-200'
                    : 'bg-black/30 border-white/5 text-slate-400 hover:border-white/20'
                }`}
              >
                <div className="mt-0.5">
                  {isChecked ? (
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                </div>
                <span
                  className={`text-xs font-mono select-none ${
                    isChecked ? 'line-through text-slate-400' : 'text-slate-200'
                  }`}
                >
                  {item}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Contextual Study Tools Integration */}
      <div className="glass-panel rounded-2xl p-6 border border-indigo-500/20 bg-gradient-to-r from-indigo-950/20 to-cyan-950/20 space-y-4">
        <div>
          <h3 className="text-sm font-bold font-mono text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            Contextual Study Synthesizer
          </h3>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Instantly dispatch DeepSeek V4 to generate personalized study materials tailored to this assignment.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => onGenerateStudyTool && onGenerateStudyTool('study_guide', assignment)}
            className="flex items-center gap-2 p-3 rounded-xl bg-black/40 hover:bg-cyan-500/10 border border-white/10 hover:border-cyan-500/40 text-left transition cursor-pointer text-xs font-mono"
          >
            <BookOpen className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <div className="text-white font-bold">Generate Study Guide</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Structured outline & key concepts</div>
            </div>
          </button>

          <button
            onClick={() => onGenerateStudyTool && onGenerateStudyTool('flashcards', assignment)}
            className="flex items-center gap-2 p-3 rounded-xl bg-black/40 hover:bg-indigo-500/10 border border-white/10 hover:border-indigo-500/40 text-left transition cursor-pointer text-xs font-mono"
          >
            <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
            <div>
              <div className="text-white font-bold">Generate Flashcards</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Active recall Q/A pairs</div>
            </div>
          </button>

          <button
            onClick={() => onGenerateStudyTool && onGenerateStudyTool('practice_test', assignment)}
            className="flex items-center gap-2 p-3 rounded-xl bg-black/40 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/40 text-left transition cursor-pointer text-xs font-mono"
          >
            <GraduationCap className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="text-white font-bold">Practice Quiz</div>
              <div className="text-[10px] text-slate-400 mt-0.5">5 auto-graded MCQs</div>
            </div>
          </button>
        </div>
      </div>

      {/* Personal Notes Section */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold font-mono text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            My Assignment Notes & Outline
          </h3>
          {notesSaved && (
            <span className="text-xs font-mono text-emerald-400">✅ Saved to Local Storage</span>
          )}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add rough notes, citations, or instructions for this assignment..."
          className="w-full min-h-32 glass-input rounded-xl p-3 text-xs font-mono placeholder:text-slate-600"
        />
        <button
          onClick={handleSaveNotes}
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-mono text-xs transition cursor-pointer"
        >
          Save Notes
        </button>
      </div>
    </div>
  );
}
