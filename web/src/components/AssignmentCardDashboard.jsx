import React, { useState, useEffect } from 'react';
import AssignmentCard from './AssignmentCard';
import Button from './Button';
import LaunchToDocModal from './LaunchToDocModal';
import api from '../api';
import { normalizeCards } from '../lib/assignmentEvents';
import {
  Layers,
  Bot,
  Video,
  ArrowLeft,
  ArrowRight,
  Plus,
  Minus,
  X,
  Download,
  RefreshCw,
  Archive,
} from 'lucide-react';
import { getAssignmentBucket, BUBBLE_SECTIONS } from '../lib/assignmentBuckets.js';

/* Aurora semantic chip tints (scoped): .aurora-chip keeps its glass pill
   base from index.css; these modifiers recolor it for status semantics. */
const AURORA_CHIP_TINTS = `
.aurora-chip.ok    { background: rgba(16,185,129,0.14); border-color: rgba(16,185,129,0.32); color: #6ee7b7; }
.aurora-chip.info  { background: rgba(34,211,238,0.13); border-color: rgba(34,211,238,0.30); color: #67e8f9; }
.aurora-chip.warn  { background: rgba(245,158,11,0.14); border-color: rgba(245,158,11,0.32); color: #fcd34d; }
.aurora-chip.tight { padding: 0 0.5rem; font-size: 0.75rem; }
`;

const DEFAULT_SUBJECT_BUBBLES = [
  { id: 'subj_math', title: 'Mathematics', description: 'Calculus, linear algebra, statistics & formal proofs', color: 'blue', icon: '📐' },
  { id: 'subj_english', title: 'English & Literature', description: 'Literary analysis, rhetorical essays & close reading', color: 'purple', icon: '📖' },
  { id: 'subj_history', title: 'History & Social Studies', description: 'Historiography, primary source evaluation & analysis', color: 'amber', icon: '🏛️' },
  { id: 'subj_cs', title: 'Computer Science', description: 'Algorithms, data structures & software engineering', color: 'emerald', icon: '💻' },
  { id: 'subj_biology', title: 'Biology & Life Sciences', description: 'Genetics, cellular biology & lab investigations', color: 'teal', icon: '🧬' },
  { id: 'subj_psychology', title: 'Psychology & Cognitive Sciences', description: 'Empirical research, cognitive neuroscience & case studies', color: 'indigo', icon: '🧠' },
];

export function AssignmentCardDashboard({ userId = 'student_demo', isGuest = false, onSelectAssignment = null, onOpenHistory = null }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [fullViewData, setFullViewData] = useState(null);
  const [launchToDocAssignment, setLaunchToDocAssignment] = useState(null);
  // Ghost filter (operator 08-28): ids of assignments that were turned in —
  // they live in the history ledger, so they never render in the bubbles.
  const [turnedInIds, setTurnedInIds] = useState(() => new Set());

  // Active View: 'bubbles' | 'history'
  const [dashboardTab, setDashboardTab] = useState('bubbles'); // 'bubbles' | 'history'

  // Selected active bubble (null = showing bubble grid; 'ALL' or bubble object = showing bubble's assignments)
  const [activeBubble, setActiveBubble] = useState(null);

  // Custom Bubbles & Subjects
  const [customBubbles, setCustomBubbles] = useState([]);
  const [isCreatingBubble, setIsCreatingBubble] = useState(false);
  const [newBubbleTitle, setNewBubbleTitle] = useState('');
  const [newBubbleDesc, setNewBubbleDesc] = useState('');
  const [newBubbleColor, setNewBubbleColor] = useState('blue');
  const [newBubbleIcon, setNewBubbleIcon] = useState('🫧');

  // Assignment History State
  const [historyList, setHistoryList] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historySubjectFilter, setHistorySubjectFilter] = useState('ALL');
  const [historyLoading, setHistoryLoading] = useState(false);

  // Data Export & Deletion Modals
  const [exportNotice, setExportNotice] = useState('');
  // Bubble export (09-01): one subject bubble at a time — assignments +
  // materials + messages + agent_actions as a JSON attachment.
  const [bubbleExporting, setBubbleExporting] = useState(false);
  const [showSoftResetModal, setShowSoftResetModal] = useState(false);
  const [showPermanentDeleteModal, setShowPermanentDeleteModal] = useState(false);
  const [permDeleteConfirmText, setPermDeleteConfirmText] = useState('');
  const [permDeleteNotifyEmail, setPermDeleteNotifyEmail] = useState('');
  const [permDeleteNotifyPhone, setPermDeleteNotifyPhone] = useState('');
  const [permDeleteSendNotification, setPermDeleteSendNotification] = useState(true);
  const [permDeleteStatus, setPermDeleteStatus] = useState('');

  useEffect(() => {
    fetchDashboardData();
    fetchCustomBubbles();
  }, [userId]);

  // Ghost guard (operator 08-28): the cards snapshot is a one-shot mount-time
  // fetch — an assignment deleted or turned in inside another view (agent
  // chat, dump, turn-in history) would keep rendering as a dead card here.
  // Re-pull the snapshot whenever the tab regains attention; the turned-in
  // cross-reference then drops history rows from every count and card list.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (dashboardTab === 'history') {
      fetchAssignmentHistory();
    }
  }, [dashboardTab, historySubjectFilter]);

  async function fetchCustomBubbles() {
    try {
      const data = await api.getCustomBubbles();
      if (data?.bubbles) {
        // Dedupe by id — a duplicated/corrupt row must never render two
        // bubble tiles or collide React keys.
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
      // Normalize (dedupe + drop idless rows) before it ever reaches state.
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

  async function fetchAssignmentHistory() {
    setHistoryLoading(true);
    try {
      const data = await api.getAssignmentHistory(historySubjectFilter === 'ALL' ? '' : historySubjectFilter);
      if (data?.history) setHistoryList(data.history);
    } catch (e) {
      console.error('Failed to load assignment history:', e);
    } finally {
      setHistoryLoading(false);
    }
  }

  // Create Custom Bubble
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

  // Delete Custom Bubble
  const handleDeleteBubble = async (bubbleId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this custom bubble?')) return;
    try {
      await api.deleteCustomBubble(bubbleId);
      setCustomBubbles((prev) => prev.filter((b) => b.id !== bubbleId));
      if (activeBubble?.id === bubbleId) {
        setActiveBubble(null);
      }
    } catch (e) {}
  };

  // Export EVERYTHING
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
      setExportNotice('✅ Complete data archive exported successfully (100% of telemetry, prompts, assignments, and datalake records).');
      setTimeout(() => setExportNotice(''), 4000);
    } catch (e) {
      setExportNotice('❌ Failed to export data.');
    }
  };

  // Bubble export (09-01): the server builds the whole-bubble JSON payload —
  // only a missing bubble title (or a still-404 endpoint) is an error here.
  const handleExportBubble = async (title) => {
    if (!title) return;
    setBubbleExporting(true);
    try {
      await api.exportAssignmentData({ bubble: title });
    } catch (e) {
      setExportNotice(`❌ Export failed — ${e && e.status === 404 ? 'nothing recorded for this bubble yet.' : (e.message || 'try again.')}`);
      setTimeout(() => setExportNotice(''), 5000);
    } finally {
      setBubbleExporting(false);
    }
  };

  // Soft Reset (Restorable)
  // Reports what the server actually did — the old copy claimed the workspace
  // had been cleared while the endpoint was a no-op that changed nothing.
  const handleSoftReset = async () => {
    try {
      const res = await api.softResetData();
      setShowSoftResetModal(false);
      setExportNotice(`✅ ${res?.message || 'Reset complete.'}`);
      fetchDashboardData();
      setTimeout(() => setExportNotice(''), 6000);
    } catch (e) {
      setShowSoftResetModal(false);
      setExportNotice(`❌ ${e?.message || 'Reset failed.'}`);
      setTimeout(() => setExportNotice(''), 6000);
    }
  };

  // Permanent Delete Request (Legal / Cryptographic Wipe - 3+ business days)
  const handlePermanentDelete = async (e) => {
    e.preventDefault();
    if (permDeleteConfirmText !== 'DELETE PERMANENTLY') {
      alert('Please type "DELETE PERMANENTLY" exactly.');
      return;
    }
    try {
      const res = await api.permanentDeleteRequest({
        reason: 'User requested legal/privacy erasure',
        notify_email: permDeleteSendNotification ? permDeleteNotifyEmail : null,
        notify_sms: permDeleteSendNotification ? permDeleteNotifyPhone : null,
        confirmation_text: permDeleteConfirmText,
      });
      setPermDeleteStatus(res?.message || 'Purge request registered.');
      setTimeout(() => {
        setShowPermanentDeleteModal(false);
        setPermDeleteStatus('');
        setPermDeleteConfirmText('');
      }, 4000);
    } catch (e) {
      alert('Failed to dispatch purge request.');
    }
  };

  // Helper to match card to bubble
  // 08-27: the cards endpoint sends name/subject/class_code — NOT card.course
  // / card.title, so bubbles were never populated (matching ran against empty
  // strings). Match on the real fields, subject keywords included.
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

  const allBubblesList = [
    { id: 'all', title: 'All Course Assignments', description: 'Universal view of all coursework across all subjects & modules', icon: '🌐', color: 'blue', is_all: true },
    ...DEFAULT_SUBJECT_BUBBLES,
    ...customBubbles.map((b) => ({ ...b, is_custom: true })),
  ];

  // Ghost filter (operator 08-28): turned-in assignments belong to the
  // history ledger — the cards endpoint still includes them, so every count
  // and every card list renders from this visible set only. Ids are
  // canonicalized to String on both sides (numeric vs string id mismatch).
  const visibleCards = cards.filter((c) => !turnedInIds.has(String(c.id)));

  // Cards for active bubble (ghost guard 08-28: rows without an id can't
  // own a chat thread or a detail view — drop them silently, never render).
  const currentBubbleCards = (activeBubble
    ? visibleCards.filter((c) => matchCardToBubble(c, activeBubble))
    : []
  ).filter((c) => c != null && c.id != null);

  // Chat bubble entry (operator 08-28): open the SAME per-assignment agent
  // team chat the detail workspace hosts — pass focus_chat so the workspace
  // scrolls to and focuses the composer the moment it loads.
  const handleAssignmentChat = (card, e) => {
    if (e) e.stopPropagation();
    if (onSelectAssignment) onSelectAssignment({ ...card, focus_chat: true });
    else setSelectedCardId(card.id);
  };

  // Lifecycle sections (09-01): distribute the bubble's cards into the three
  // sections by bucket — archived cards NEVER render as cards here (they live
  // in Assignment History; the bubble gets a pointer section instead). A card
  // with an unrecognized status lands in pending rather than dropping out.
  const groupedCards = { completed: [], in_progress: [], pending: [], archived: [] };
  currentBubbleCards.forEach((card) => {
    const b = getAssignmentBucket(card.status);
    if (groupedCards[b]) groupedCards[b].push(card);
    else groupedCards.pending.push(card);
  });

  // Card render (09-01): shared by all three sections so the matched-badge
  // button → onSelectAssignment behavior stays identical wherever it shows.
  const renderBubbleCard = (card) => {
    const cardBlob = `${card.name || ''} ${card.subject || ''}`.toLowerCase();
    const hasVideoOrMedia = cardBlob.includes('video') ||
      cardBlob.includes('lecture') ||
      cardBlob.includes('presentation');

    return (
      <div key={card.id} className="relative group">
        <AssignmentCard
          id={card.id}
          title={card.name}
          course={[card.subject, card.class_code].filter(Boolean).join(' · ') || '—'}
          dueDate={card.due_date}
          status={card.status}
          urgency={card.urgency}
          detectorRisk={card.detector_risk}
          scoreAI={card.score_ai}
          teacherName={card.teacher_name}
          onSelect={() => {
            if (onSelectAssignment) onSelectAssignment(card);
            else setSelectedCardId(card.id);
          }}
          onChat={(e) => handleAssignmentChat(card, e)}
          onLaunchToDoc={() => setLaunchToDocAssignment(card)}
        />

        {/* AI Multimodal Attachment */}
        {hasVideoOrMedia && (
          <div className="absolute top-3 right-3 z-10 pointer-events-none">
            <span className="aurora-chip info">
              <Video className="w-3.5 h-3.5" />
              <span>AI Multimodal</span>
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <style>{AURORA_CHIP_TINTS}</style>

      {/* Export / reset feedback (09-01: bubble exports reuse this notice) */}
      {exportNotice && (
        <div className="p-3 bg-primary/10 border border-primary/30 rounded-xl text-xs text-primary font-label-caps uppercase tracking-wider">
          {exportNotice}
        </div>
      )}

      {/* LEVEL 1: BUBBLE GRID (NO ASSIGNMENTS SHOWN BY DEFAULT) */}
      {!activeBubble ? (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 mb-4">
                <div className="min-w-0">
                  <h2 className="font-headline-lg text-headline-lg text-on-surface flex items-center flex-wrap gap-x-3 gap-y-1">
                    <Layers className="w-6 h-6 text-secondary shrink-0" aria-hidden="true" />
                    <span>Active Subjects</span>
                    {/* Count + noun live in one visual text (08-28): no "(7)"
                        split label, correct pluralization */}
                    <span className="font-tabular-stat text-tabular-stat text-on-surface-variant bg-surface-container-low rounded-full px-3 py-1">
                      {`${allBubblesList.length} ${allBubblesList.length === 1 ? 'bubble' : 'bubbles'}`}
                    </span>
                  </h2>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                    Manage and review your study tasks grouped by domain — click any bubble to open its workspace.
                  </p>
                </div>

                {/* + Button for Custom Bubble */}
                <Button
                  onClick={() => setIsCreatingBubble(true)}
                  variant="secondary"
                  size="sm"
                  className="shrink-0 self-start rounded-lg font-label-caps uppercase tracking-wider"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Bubble</span>
                </Button>
              </div>

              {/* Create Custom Bubble Modal */}
              {isCreatingBubble && (
                <div className="p-6 rounded-3xl bg-surface-container-lowest border border-outline-variant/30 space-y-4 text-xs animate-fadeIn shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                  <div className="flex items-center justify-between">
                    <h3 className="font-title-md text-title-md text-on-surface flex items-center gap-2">
                      <span>🫧</span> Add a New Custom Assignment Bubble
                    </h3>
                    <button
                      onClick={() => setIsCreatingBubble(false)}
                      className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition cursor-pointer"
                      aria-label="Close create bubble dialog"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleCreateBubble} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <input
                        type="text"
                        placeholder="Bubble Title (e.g. Dr. Miller Lab Reports, Exam 2 Prep)..."
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
                      </select>
                    </div>

                    <textarea
                      rows={2}
                      placeholder="Describe what goes inside this bubble so AI auto-organizes your scraped assignments into it..."
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
                        Save Bubble
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Bubble Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {allBubblesList.map((bubble) => {
                  const count = bubble.id === 'all'
                    ? visibleCards.length
                    : visibleCards.filter((c) => matchCardToBubble(c, bubble)).length;

                  return (
                    <div
                      key={bubble.id}
                      onClick={() => setActiveBubble(bubble)}
                      className="bg-surface-container-lowest rounded-3xl p-6 border border-outline-variant/20 shadow-[0_4px_20px_rgba(0,0,0,0.02)] card-lift flex flex-col justify-between space-y-4 cursor-pointer relative overflow-hidden group"
                    >
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center text-xl">
                          {bubble.icon || '🫧'}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="font-tabular-stat text-tabular-stat text-on-surface-variant bg-surface-container-low rounded-full px-2.5 py-1 whitespace-nowrap">
                            {`${count} ${count === 1 ? 'Assignment' : 'Assignments'}`}
                          </span>

                          {/* Export button (09-01): whole-bubble JSON download */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleExportBubble(bubble.title); }}
                            disabled={bubbleExporting}
                            className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-low rounded-lg transition cursor-pointer disabled:opacity-40"
                            title={`Export ${bubble.title} data`}
                            aria-label={`Export ${bubble.title} data as JSON`}
                          >
                            {bubbleExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          </button>

                          {/* - Button for Custom Bubbles */}
                          {bubble.is_custom && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteBubble(bubble.id, e)}
                              className="p-2 text-on-surface-variant hover:text-error hover:bg-error-container/20 rounded-lg transition cursor-pointer"
                              title="Delete custom bubble"
                              aria-label="Delete custom bubble"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <div>
                        <div className="font-title-md text-title-md text-on-surface group-hover:text-primary transition-colors flex items-center gap-1.5">
                          <span>{(bubble.title || '').trim() || 'Untitled Bubble'}</span>
                          {bubble.is_custom && (
                            <span className="font-label-caps text-[10px] text-primary bg-primary-container/15 rounded-full px-2 py-0.5 uppercase">Custom</span>
                          )}
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 line-clamp-2 leading-relaxed">
                          {(bubble.description || '').trim() || 'No description provided.'}
                        </p>
                      </div>

                      {/* Footer Info */}
                      <div className="pt-4 border-t border-outline-variant/20 flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
                        <span className="flex items-center gap-1 text-primary">
                          <Bot className="w-3.5 h-3.5" /> {count > 0 ? `${count} Teams Active` : 'Idle'}
                        </span>
                        <span className="text-secondary group-hover:translate-x-1 transition-transform flex items-center gap-0.5 font-semibold">
                          Open Bubble <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* LEVEL 2: ACTIVE BUBBLE WORKSPACE VIEW (ASSIGNMENTS ONLY VISIBLE HERE) */
            <div className="space-y-5 animate-fadeIn">
              {/* Back Bar & Bubble Info */}
              <div className="bg-surface-container-lowest rounded-3xl p-5 border border-outline-variant/20 shadow-[0_4px_20px_rgba(0,0,0,0.02)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => setActiveBubble(null)}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/30 px-3 py-2 font-label-caps text-label-caps uppercase text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4 text-[var(--accent)]" />
                    <span>Back to All Bubbles</span>
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{activeBubble.icon || '🫧'}</span>
                      <h2 className="font-title-md text-title-md text-on-surface truncate">{activeBubble.title}</h2>
                      <span className="font-tabular-stat text-tabular-stat text-on-surface-variant bg-surface-container-low rounded-full px-2.5 py-1 shrink-0">
                        {`${currentBubbleCards.length} ${currentBubbleCards.length === 1 ? 'Assignment' : 'Assignments'}`}
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5 truncate">{activeBubble.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                  <span className="inline-flex items-center gap-1.5 bg-secondary/10 text-secondary rounded-full px-3 py-1 font-label-caps text-[10px] uppercase">
                    <Bot className="w-3.5 h-3.5" /> {currentBubbleCards.length === 0 ? 'Idle — no assignments yet' : 'Sub-agent chat ready'}
                  </span>
                  {/* Bubble export (09-01): ↓ icon + label, whole-bubble JSON */}
                  <button
                    type="button"
                    onClick={() => handleExportBubble(activeBubble.title)}
                    disabled={bubbleExporting || !activeBubble.title}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/30 px-3 py-2 font-label-caps text-label-caps uppercase text-on-surface-variant hover:text-primary hover:border-primary/50 transition cursor-pointer disabled:opacity-40"
                    title={`Export ${activeBubble.title} data`}
                  >
                    {bubbleExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span>Export</span>
                  </button>
                </div>
              </div>

              {/* Assignments Inside Active Bubble — lifecycle sections (09-01)
                  Completed / In Progress / Pending for Approval, sorted by
                  bucket; archived assignments point at History instead. */}
              {currentBubbleCards.length === 0 ? (
                <div className="bg-surface-container-low/50 rounded-2xl border border-dashed border-outline-variant/50 p-8 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-surface-container-highest flex items-center justify-center mb-4 text-outline">
                    <Layers className="w-7 h-7" aria-hidden="true" />
                  </div>
                  <h4 className="font-body-md text-body-md font-semibold text-on-surface mb-2">Nothing here yet</h4>
                  <p className="font-body-sm text-body-sm text-on-surface-variant max-w-sm">
                    No assignments inside “{activeBubble.title}” yet — scraped assignments matching this bubble&apos;s description are organized here automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {BUBBLE_SECTIONS.map((sec) => {
                    const items = groupedCards[sec.bucket] || [];
                    return (
                      <section key={sec.bucket} aria-label={`${sec.label}: ${items.length} assignment${items.length === 1 ? '' : 's'}`}>
                        <div className="flex items-center gap-2.5 mb-3">
                          <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">{sec.label}</h3>
                          <span className="font-tabular-stat text-tabular-stat text-on-surface-variant bg-surface-container-low rounded-full w-5 h-5 flex items-center justify-center text-[10px]">{items.length}</span>
                        </div>
                        {items.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                            {items.map(renderBubbleCard)}
                          </div>
                        ) : (
                          <p className="font-body-sm text-body-sm text-on-surface-variant">Nothing here yet.</p>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}

              {/* Archived (09-01): always rendered — fix: it used to live
                  inside the length>0 branch, so a brand-new user with zero
                  assignments could never reach Submission History (and its
                  New Assignment button) from the dashboard. */}
              <section aria-label="Archived assignments">
                    <div className="flex items-center gap-2.5 mb-3">
                      <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                        <Archive className="w-3.5 h-3.5 text-outline" /> Archived
                      </h3>
                      <span className="font-tabular-stat text-tabular-stat text-on-surface-variant bg-surface-container-low rounded-full px-2 py-0.5 text-[10px]">{groupedCards.archived.length}</span>
                    </div>
                    <div className="bg-surface-container-low rounded-xl border border-outline-variant/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      {groupedCards.archived.length > 0 ? (
                        <span className="font-body-sm text-body-sm text-on-surface-variant">
                          {groupedCards.archived.length} archived assignment{groupedCards.archived.length === 1 ? '' : 's'} in this bubble — archived assignments show up in Assignment History instead.
                        </span>
                      ) : (
                        <span className="font-body-sm text-body-sm text-on-surface-variant">None yet — move a finished assignment to history from its workspace.</span>
                      )}
                      {onOpenHistory && (
                        <button
                          type="button"
                          onClick={onOpenHistory}
                          className="shrink-0 inline-flex items-center gap-1 font-label-caps text-xs text-secondary hover:text-on-surface transition cursor-pointer uppercase tracking-wider"
                        >
                          Open Assignment History <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                </section>
              )}
            </div>
          )}

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
