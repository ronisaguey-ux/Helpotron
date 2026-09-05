import React, { useState, useEffect } from 'react';
import Button from './Button';
import LaunchToDocModal from './LaunchToDocModal';
import NewAssignmentModal from './NewAssignmentModal';
import api from '../api';
import { normalizeCards } from '../lib/assignmentEvents';
import {
  Layers,
  Bot,
  Video,
  Plus,
  Minus,
  X,
  Download,
  RefreshCw,
  Archive,
  Calendar,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { getAssignmentBucket, BUBBLE_SECTIONS } from '../lib/assignmentBuckets.js';

const DEFAULT_SUBJECT_BUBBLES = [
  { id: 'subj_math', title: 'Mathematics', description: 'Calculus, linear algebra, statistics & formal proofs', color: 'blue', icon: '📐' },
  { id: 'subj_english', title: 'English & Literature', description: 'Literary analysis, rhetorical essays & close reading', color: 'purple', icon: '📖' },
  { id: 'subj_history', title: 'History & Social Studies', description: 'Historiography, primary source evaluation & analysis', color: 'amber', icon: '🏛️' },
  { id: 'subj_cs', title: 'Computer Science', description: 'Algorithms, data structures & software engineering', color: 'emerald', icon: '💻' },
  { id: 'subj_biology', title: 'Biology & Life Sciences', description: 'Genetics, cellular biology & lab investigations', color: 'teal', icon: '🧬' },
  { id: 'subj_psychology', title: 'Psychology & Cognitive Sciences', description: 'Empirical research, cognitive neuroscience & case studies', color: 'indigo', icon: '🧠' },
];

function isOverdue(dueDate) {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  return !isNaN(d.getTime()) && d.getTime() < Date.now();
}

function formatDue(dueDate) {
  if (!dueDate) return 'No deadline';
  const d = new Date(dueDate);
  if (isNaN(d.getTime())) return dueDate;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function actionLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('pending') || s.includes('review')) return 'Review Now';
  if (s.includes('humaniz') || s.includes('draft')) return 'View Draft';
  return 'Continue';
}

function getStatusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('completed') || s.includes('submitted') || s.includes('graded')) {
    return (
      <span className="px-2 py-0.5 rounded-lg bg-sem-green/10 text-sem-green border border-sem-green/20 font-label-caps text-[10px] uppercase font-medium">
        {status}
      </span>
    );
  }
  if (s.includes('pending')) {
    return (
      <span className="px-2 py-0.5 rounded-lg bg-sem-amber/10 text-sem-amber border border-sem-amber/20 font-label-caps text-[10px] uppercase font-medium">
        Pending Approval
      </span>
    );
  }
  if (s.includes('review')) {
    return (
      <span className="px-2 py-0.5 rounded-lg bg-sem-amber/10 text-sem-amber border border-sem-amber/20 font-label-caps text-[10px] uppercase font-medium">
        Ready for Review
      </span>
    );
  }
  if (s.includes('humaniz')) {
    return (
      <span className="px-2 py-0.5 rounded-lg bg-sem-cyan/10 text-sem-cyan border border-sem-cyan/20 font-label-caps text-[10px] uppercase font-medium">
        Humanizing
      </span>
    );
  }
  if (s.includes('progress')) {
    return (
      <span className="px-2 py-0.5 rounded-lg bg-sem-blue/10 text-sem-blue border border-sem-blue/20 font-label-caps text-[10px] uppercase font-medium">
        In Progress
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-lg bg-surface-container-high text-on-surface-variant border border-outline-variant/30 font-label-caps text-[10px] uppercase font-medium">
      {status || 'Drafting'}
    </span>
  );
}

export function AssignmentCardDashboard({ userId = 'student_demo', isGuest = false, onSelectAssignment = null, onOpenHistory = null }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [launchToDocAssignment, setLaunchToDocAssignment] = useState(null);
  const [turnedInIds, setTurnedInIds] = useState(() => new Set());
  const [showImportModal, setShowImportModal] = useState(false);

  // Custom Bubbles & Subjects
  const [customBubbles, setCustomBubbles] = useState([]);
  const [isCreatingBubble, setIsCreatingBubble] = useState(false);
  const [newBubbleTitle, setNewBubbleTitle] = useState('');
  const [newBubbleDesc, setNewBubbleDesc] = useState('');
  const [newBubbleColor, setNewBubbleColor] = useState('blue');
  const [newBubbleIcon, setNewBubbleIcon] = useState('🫧');

  // Notices & loading
  const [exportNotice, setExportNotice] = useState('');
  const [bubbleExporting, setBubbleExporting] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    fetchCustomBubbles();
  }, [userId]);

  // Refetch when tab regains attention
  useEffect(() => {
    const refetch = () => {
      if (document.visibilityState === 'visible') fetchDashboardData();
    };
    document.addEventListener('visibilitychange', refetch);
    window.addEventListener('focus', refetch);
    return () => {
      document.removeEventListener('visibilitychange', refetch);
      window.removeEventListener('focus', refetch);
    };
  }, [userId]);

  // Re-fetch on assignment created event
  useEffect(() => {
    const handleCreated = () => fetchDashboardData();
    window.addEventListener('helpotron:assignment-created', handleCreated);
    return () => window.removeEventListener('helpotron:assignment-created', handleCreated);
  }, []);

  async function fetchCustomBubbles() {
    try {
      const data = await api.getCustomBubbles();
      if (data?.bubbles) {
        const seen = new Set();
        setCustomBubbles(data.bubbles.filter((b) => {
          if (!b || b.id == null) return false;
          if (seen.has(b.id)) return false;
          seen.add(b.id);
          return true;
        }));
      }
    } catch (e) {}
  }

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const [cardsData, turnedInRes] = await Promise.all([
        api.assignmentCards().catch(() => null),
        api.getTurnedInAssignments().catch(() => null),
      ]);
      if (cardsData?.cards) setCards(normalizeCards(cardsData.cards));
      setTurnedInIds(new Set(
        (turnedInRes?.history || []).map((h) => h.id ?? h.assignment_id)
          .filter((id) => id != null).map(String)
      ));
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleCreateBubble = async (e) => {
    e.preventDefault();
    if (!newBubbleTitle.trim() || !newBubbleDesc.trim()) return;
    try {
      const res = await api.addCustomBubble({
        title: newBubbleTitle.trim(),
        description: newBubbleDesc.trim(),
        color: newBubbleColor,
        icon: newBubbleIcon,
      });
      if (res?.bubble) {
        setCustomBubbles((prev) => [...prev, res.bubble]);
        setNewBubbleTitle('');
        setNewBubbleDesc('');
        setIsCreatingBubble(false);
      }
    } catch (e) {
      alert('Failed to create custom bubble.');
    }
  };

  const handleDeleteBubble = async (bubbleId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this custom bubble?')) return;
    try {
      await api.deleteCustomBubble(bubbleId);
      setCustomBubbles((prev) => prev.filter((b) => b.id !== bubbleId));
    } catch (e) {}
  };

  const handleExportAllData = async () => {
    try {
      const data = await api.exportAllUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `helpotron_complete_user_export_${userId || 'student'}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportNotice('✅ Complete data archive exported successfully.');
      setTimeout(() => setExportNotice(''), 4000);
    } catch (e) {
      setExportNotice('❌ Failed to export data.');
    }
  };

  const handleExportBubble = async (title) => {
    if (!title) return;
    setBubbleExporting(true);
    try {
      await api.exportAssignmentData({ bubble: title });
      setExportNotice(`✅ Export for ${title} complete.`);
      setTimeout(() => setExportNotice(''), 4000);
    } catch (e) {
      setExportNotice(`❌ Export failed — ${e && e.status === 404 ? 'nothing recorded for this subject yet.' : (e.message || 'try again.')}`);
      setTimeout(() => setExportNotice(''), 5000);
    } finally {
      setBubbleExporting(false);
    }
  };

  const handleExportAssignment = async (assignmentId, e) => {
    if (e) e.stopPropagation();
    try {
      await api.exportAssignmentData({ assignment_id: assignmentId });
      setExportNotice(`✅ Assignment #${assignmentId} export downloaded.`);
      setTimeout(() => setExportNotice(''), 4000);
    } catch (err) {
      setExportNotice(`❌ Failed to export assignment: ${err.message || 'try again.'}`);
      setTimeout(() => setExportNotice(''), 4000);
    }
  };

  const matchCardToBubble = (card, bubble) => {
    if (!bubble || bubble.id === 'all') return true;
    const title = (bubble.title || '').toLowerCase();
    const desc = (bubble.description || '').toLowerCase();
    const cName = `${card.subject || ''} ${card.class_code || ''}`.toLowerCase();
    const aTitle = (card.name || '').toLowerCase();
    const blob = `${cName} ${aTitle}`;

    return cName.includes(title) || aTitle.includes(title) || blob.includes(title) ||
      (title.includes('math') && /math|calc|algebra|stat/.test(blob)) ||
      (title.includes('english') && /eng|lit|writing|essay|novel|poem/.test(blob)) ||
      (title.includes('history') && /hist|social|gov|reconstruction|war|ancient|president/.test(blob)) ||
      (title.includes('computer') && /cs|code|comp|algorithm|neural|python|machine/.test(blob)) ||
      (title.includes('biology') && /bio|life|lab|genetic|cell|dna|crispr/.test(blob)) ||
      (title.includes('psychology') && /psych|cog|behav|bias|decision/.test(blob)) ||
      (desc.length > 5 && (cName.includes(desc.slice(0, 10)) || aTitle.includes(desc.slice(0, 10))));
  };

  // Ghost filter: turned-in assignments live in history ledger only
  const visibleCards = cards.filter((c) => !turnedInIds.has(String(c.id)));

  // Combine default subjects and custom bubbles
  const allSubjectBubbles = [
    ...DEFAULT_SUBJECT_BUBBLES,
    ...customBubbles.map((b) => ({ ...b, is_custom: true })),
  ];

  // Also check for unassigned cards to ensure 100% of coursework is visible
  const unassignedCards = visibleCards.filter(
    (c) => !allSubjectBubbles.some((b) => matchCardToBubble(c, b))
  );

  const finalSubjects = [
    ...allSubjectBubbles,
    ...(unassignedCards.length > 0
      ? [{ id: 'subj_other', title: 'General & Electives', description: 'Cross-disciplinary coursework and electives', icon: '📝', color: 'blue' }]
      : []),
  ];

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse p-4 md:p-6">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-surface-container rounded-xl" />
          <div className="h-4 w-96 bg-surface-container-low rounded-lg" />
        </div>
        {[1, 2].map((i) => (
          <div key={i} className="bg-surface-container-lowest rounded-3xl p-6 md:p-8 border border-outline-variant/20 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-surface-container-high" />
              <div className="space-y-2">
                <div className="h-5 w-48 bg-surface-container rounded-lg" />
                <div className="h-4 w-28 bg-surface-container-low rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 h-32 bg-surface rounded-2xl" />
              <div className="h-32 bg-surface-bright rounded-2xl" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1200px] mx-auto p-4 md:p-6">
      {/* Export / reset notice */}
      {exportNotice && (
        <div className="p-3 bg-primary/10 border border-primary/30 rounded-xl text-xs text-primary font-label-caps uppercase tracking-wider">
          {exportNotice}
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-background mb-1">
            Active Subjects
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Manage and review your study tasks grouped by domain.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            onClick={() => setIsCreatingBubble(true)}
            variant="secondary"
            size="sm"
            className="rounded-xl font-label-caps uppercase tracking-wider text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>New Subject</span>
          </Button>
          <button
            onClick={handleExportAllData}
            className="p-2.5 rounded-xl border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
            title="Export complete user data archive"
            aria-label="Export complete user data"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Create Custom Bubble Modal */}
      {isCreatingBubble && (
        <div className="p-6 rounded-3xl bg-surface-container-lowest border border-outline-variant/30 space-y-4 text-xs animate-fadeIn shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between">
            <h3 className="font-title-md text-title-md text-on-surface flex items-center gap-2">
              <span>🫧</span> Add a New Custom Subject
            </h3>
            <button
              onClick={() => setIsCreatingBubble(false)}
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition cursor-pointer"
              aria-label="Close create subject dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreateBubble} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                placeholder="Subject Title (e.g. AP Chemistry, Linear Algebra)..."
                value={newBubbleTitle}
                onChange={(e) => setNewBubbleTitle(e.target.value)}
                className="sm:col-span-2 bg-surface-container-low border border-outline-variant/30 rounded-xl px-3.5 py-2.5 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-xs"
              />
              <select
                value={newBubbleIcon}
                onChange={(e) => setNewBubbleIcon(e.target.value)}
                className="bg-surface-container-low border border-outline-variant/30 rounded-xl px-3.5 py-2.5 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary text-xs"
              >
                <option value="🫧">🫧 Bubble</option>
                <option value="🔬">🔬 Lab Science</option>
                <option value="📚">📚 Exam Prep</option>
                <option value="📝">📝 Term Papers</option>
                <option value="🎯">🎯 Milestone</option>
                <option value="💻">💻 Code</option>
              </select>
            </div>

            <textarea
              rows={2}
              placeholder="Describe keywords or topics for this subject..."
              value={newBubbleDesc}
              onChange={(e) => setNewBubbleDesc(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-3.5 py-2.5 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-xs resize-y"
            />

            <div className="flex justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setIsCreatingBubble(false)}
                className="rounded-lg px-4 py-2 font-label-caps text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-outline-variant/30 transition cursor-pointer uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newBubbleTitle.trim() || !newBubbleDesc.trim()}
                className="rounded-lg px-4 py-2 font-label-caps text-xs font-medium bg-primary text-on-primary hover:bg-primary-container disabled:opacity-40 transition cursor-pointer shadow-sm uppercase tracking-wider"
              >
                Save Subject
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Active Subjects Sections */}
      <div className="space-y-8">
        {finalSubjects.map((bubble) => {
          const subjectCards = (bubble.id === 'subj_other'
            ? unassignedCards
            : visibleCards.filter((c) => matchCardToBubble(c, bubble))
          ).filter((c) => c != null && c.id != null);

          // Categorize into in_progress vs pending vs others
          const pendingCards = subjectCards.filter(
            (c) => getAssignmentBucket(c.status) === 'pending'
          );
          const inProgressCards = subjectCards.filter(
            (c) => getAssignmentBucket(c.status) === 'in_progress' || getAssignmentBucket(c.status) === 'completed'
          );

          return (
            <section
              key={bubble.id}
              className="bg-surface-container-lowest rounded-3xl p-6 md:p-8 shadow-[0_4px_20px_rgba(0,0,0,0.02)] border border-outline-variant/20"
            >
              {/* Subject Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-outline-variant/20 pb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary text-2xl shrink-0">
                    {bubble.icon || '📚'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-title-md text-title-md text-on-surface">
                        {bubble.title}
                      </h3>
                      {bubble.is_custom && (
                        <span className="font-label-caps text-[10px] text-primary bg-primary-container/15 rounded-full px-2 py-0.5 uppercase">
                          Custom
                        </span>
                      )}
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {`${subjectCards.length} active ${subjectCards.length === 1 ? 'assignment' : 'assignments'}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleExportBubble(bubble.title)}
                    disabled={bubbleExporting}
                    className="font-label-caps text-label-caps text-secondary hover:bg-secondary/10 px-4 py-2 rounded-xl transition-colors flex items-center gap-2 border border-secondary/20 min-h-[44px] focus:ring-2 focus:ring-secondary focus:outline-none cursor-pointer"
                  >
                    {bubbleExporting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>EXPORT ALL</span>
                  </button>

                  {bubble.is_custom && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteBubble(bubble.id, e)}
                      className="p-2.5 text-on-surface-variant hover:text-error hover:bg-error-container/20 rounded-xl transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Delete custom subject"
                      aria-label="Delete custom subject"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Bento Grid or Empty State */}
              {subjectCards.length === 0 ? (
                <div className="bg-surface-container-low/50 rounded-2xl border border-dashed border-outline-variant/50 p-8 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-surface-container-highest flex items-center justify-center mb-4 text-outline">
                    <Plus className="w-8 h-8" />
                  </div>
                  <h4 className="font-body-md text-body-md font-semibold text-on-surface mb-2">
                    Ready to study {bubble.title}?
                  </h4>
                  <p className="font-body-sm text-body-sm text-on-surface-variant max-w-sm mb-6">
                    Import an assignment prompt, reading materials, or start a new problem set to populate this subject.
                  </p>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="bg-primary text-on-primary font-body-md text-body-md px-6 py-3 rounded-xl hover:bg-primary-container transition-colors shadow-sm flex items-center gap-2 min-h-[44px] focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Import Assignment</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* In Progress Column */}
                  <div className="col-span-1 md:col-span-2 lg:col-span-2 space-y-4">
                    <h4 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
                      In Progress ({inProgressCards.length})
                    </h4>

                    {inProgressCards.length === 0 ? (
                      <div className="bg-surface rounded-2xl p-5 border border-dashed border-outline-variant/30 text-center">
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                          No active assignments currently in progress.
                        </p>
                      </div>
                    ) : (
                      inProgressCards.map((card) => {
                        const overdue = isOverdue(card.due_date);
                        return (
                          <div
                            key={card.id}
                            className="card-lift bg-surface rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-outline-variant/20 hover:border-outline-variant/50 transition-all"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2 flex-wrap">
                                {getStatusBadge(card.status)}
                                <span
                                  className={`font-body-sm text-body-sm flex items-center gap-1 ${
                                    overdue
                                      ? 'text-error font-medium'
                                      : 'text-on-surface-variant'
                                  }`}
                                >
                                  {overdue ? (
                                    <AlertTriangle className="w-3.5 h-3.5 text-error" />
                                  ) : (
                                    <Calendar className="w-3.5 h-3.5 text-outline" />
                                  )}
                                  <span>{overdue ? 'Overdue: ' : 'Due: '}{formatDue(card.due_date)}</span>
                                </span>
                              </div>
                              <h5
                                onClick={() => {
                                  if (onSelectAssignment) onSelectAssignment(card);
                                }}
                                className="font-body-md text-body-md font-semibold text-on-surface hover:text-primary cursor-pointer transition-colors truncate"
                                title={card.name}
                              >
                                {card.name || 'Untitled Assignment'}
                              </h5>
                              {(card.subject || card.class_code) && (
                                <p className="font-body-sm text-xs text-on-surface-variant mt-0.5 truncate">
                                  {[card.subject, card.class_code].filter(Boolean).join(' · ')}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={(e) => handleExportAssignment(card.id, e)}
                                className="p-2 text-on-surface-variant hover:text-primary transition-colors bg-surface-container-low rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
                                title="Export assignment JSON"
                                aria-label="Export assignment JSON"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (onSelectAssignment) onSelectAssignment(card);
                                }}
                                className="bg-primary/10 text-primary font-body-sm text-body-sm px-4 py-2 rounded-xl hover:bg-primary hover:text-on-primary transition-colors min-h-[44px] focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer font-medium"
                              >
                                {actionLabel(card.status)}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Pending Approval Column */}
                  <div className="col-span-1 space-y-4">
                    <h4 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
                      Pending Approval
                      {pendingCards.length > 0 && (
                        <span className="bg-error-container text-on-error-container w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">
                          {pendingCards.length}
                        </span>
                      )}
                    </h4>

                    {pendingCards.length === 0 ? (
                      <div className="bg-surface-bright rounded-2xl p-5 border border-dashed border-outline-variant/30 text-center">
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                          No actions awaiting approval
                        </p>
                      </div>
                    ) : (
                      pendingCards.map((card) => (
                        <div
                          key={card.id}
                          className="card-lift bg-surface-bright rounded-2xl p-5 border-l-4 border-error/50 space-y-3"
                        >
                          <div>
                            <span className="px-2 py-0.5 bg-sem-amber/10 text-sem-amber border border-sem-amber/20 font-label-caps text-[10px] rounded-lg uppercase inline-block font-medium">
                              Pending Approval
                            </span>
                          </div>
                          <h5
                            onClick={() => {
                              if (onSelectAssignment) onSelectAssignment(card);
                            }}
                            className="font-body-md text-body-md font-semibold text-on-surface hover:text-primary cursor-pointer line-clamp-2"
                          >
                            {card.name || 'Untitled Assignment'}
                          </h5>
                          <p className="font-body-sm text-xs text-on-surface-variant line-clamp-2">
                            {card.description || 'Requires manual review of constraints or output before continuing.'}
                          </p>
                          <button
                            onClick={() => {
                              if (onSelectAssignment) onSelectAssignment(card);
                            }}
                            className="w-full bg-surface-container-low text-on-surface font-body-sm text-body-sm px-4 py-2 rounded-xl hover:bg-surface-container transition-colors border border-outline-variant/50 min-h-[44px] focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer font-medium"
                          >
                            Review Now
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Pointer row to Assignment History */}
      <section className="bg-surface-container-lowest rounded-3xl p-6 border border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-surface-container-high flex items-center justify-center text-outline shrink-0">
            <Archive className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-title-md text-title-md text-on-surface">
              Submission Ledger & Archive
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Review turned-in papers, completed problem sets, and full submission history.
            </p>
          </div>
        </div>

        {onOpenHistory && (
          <button
            type="button"
            onClick={onOpenHistory}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-secondary font-label-caps text-xs uppercase tracking-wider border border-outline-variant/30 transition-colors min-h-[44px] cursor-pointer shrink-0"
          >
            <Archive className="w-4 h-4" />
            <span>View Submission Ledger</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </section>

      {/* New Assignment Modal */}
      <NewAssignmentModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onCreated={() => {
          setShowImportModal(false);
          fetchDashboardData();
        }}
      />

      {/* Launch to Doc Accessibility Modal */}
      <LaunchToDocModal
        isOpen={!!launchToDocAssignment}
        assignment={launchToDocAssignment}
        onClose={() => setLaunchToDocAssignment(null)}
      />
    </div>
  );
}

export default AssignmentCardDashboard;
