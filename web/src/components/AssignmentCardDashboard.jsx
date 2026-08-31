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
} from 'lucide-react';

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

export function AssignmentCardDashboard({ userId = 'student_demo', isGuest = false, onSelectAssignment = null }) {
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

  return (
    <div className="space-y-6">
      <style>{AURORA_CHIP_TINTS}</style>

      {/* LEVEL 1: BUBBLE GRID (NO ASSIGNMENTS SHOWN BY DEFAULT) */}
      {!activeBubble ? (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center flex-wrap gap-x-2 gap-y-1">
                    <Layers className="w-4 h-4 text-[var(--accent)] shrink-0" />
                    <span>Curriculum Assignment Bubbles</span>
                    {/* Count + noun live in one visual text (08-28): no "(7)"
                        split label, correct pluralization */}
                    <span className="aurora-chip tight">
                      {`${allBubblesList.length} ${allBubblesList.length === 1 ? 'bubble' : 'bubbles'}`}
                    </span>
                  </h2>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Click any bubble to enter its workspace and view organized assignments and sub-agent teams.
                  </p>
                </div>

                {/* + Button for Custom Bubble */}
                <Button
                  onClick={() => setIsCreatingBubble(true)}
                  variant="primary"
                  size="sm"
                  className="shrink-0 self-start"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Bubble</span>
                </Button>
              </div>

              {/* Create Custom Bubble Modal */}
              {isCreatingBubble && (
                <div className="p-6 rounded-[var(--radius-lg)] surface-glass-strong border border-[rgba(139,92,246,0.30)] space-y-3.5 text-xs animate-fadeIn shadow-2xl">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
                      <span>🫧</span> Add a New Custom Assignment Bubble
                    </h3>
                    <button
                      onClick={() => setIsCreatingBubble(false)}
                      className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
                      aria-label="Close create bubble dialog"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleCreateBubble} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="Bubble Title (e.g. Dr. Miller Lab Reports, Exam 2 Prep)..."
                        value={newBubbleTitle}
                        onChange={(e) => setNewBubbleTitle(e.target.value)}
                        className="sm:col-span-2 clean-input px-3 py-2 text-white"
                      />
                      <select
                        value={newBubbleIcon}
                        onChange={(e) => setNewBubbleIcon(e.target.value)}
                        className="clean-input px-3 py-2 text-white"
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
                      className="w-full clean-input px-3 py-2.5 text-white resize-y"
                    />

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCreatingBubble(false)}
                        className="rounded-[var(--radius-sm)] px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!newBubbleTitle.trim() || !newBubbleDesc.trim()}
                        className="rounded-[var(--radius-sm)] px-4 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white font-semibold transition cursor-pointer"
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
                      className="panel p-5 flex flex-col justify-between space-y-4 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer relative overflow-hidden group"
                    >
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.25)] flex items-center justify-center text-xl">
                          {bubble.icon || '🫧'}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="chip chip-neutral text-xs">
                            {`${count} ${count === 1 ? 'Assignment' : 'Assignments'}`}
                          </span>

                          {/* - Button for Custom Bubbles */}
                          {bubble.is_custom && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteBubble(bubble.id, e)}
                              className="p-1 text-[var(--text-muted)] hover:text-[#fda4af] hover:bg-[rgba(244,63,94,0.12)] rounded-lg transition cursor-pointer"
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
                        <div className="font-semibold text-sm text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors flex items-center gap-1.5">
                          <span>{(bubble.title || '').trim() || 'Untitled Bubble'}</span>
                          {bubble.is_custom && (
                            <span className="chip chip-accent text-[10px]">Custom</span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2 leading-relaxed">
                          {(bubble.description || '').trim() || 'No description provided.'}
                        </p>
                      </div>

                      {/* Footer Info */}
                      <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
                        <span className="flex items-center gap-1 text-emerald-400">
                          <Bot className="w-3.5 h-3.5" /> {count > 0 ? `${count} Teams Active` : 'Idle'}
                        </span>
                        <span className="text-[var(--accent-2)] group-hover:translate-x-1 transition-transform flex items-center gap-0.5 font-semibold">
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
              <div className="panel p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => setActiveBubble(null)}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4 text-[var(--accent)]" />
                    <span>Back to All Bubbles</span>
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{activeBubble.icon || '🫧'}</span>
                      <h2 className="text-base font-bold text-white truncate">{activeBubble.title}</h2>
                      <span className="chip chip-neutral text-xs shrink-0">
                        {`${currentBubbleCards.length} ${currentBubbleCards.length === 1 ? 'Assignment' : 'Assignments'}`}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{activeBubble.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                  <span className="chip chip-emerald">
                    🤖 {currentBubbleCards.length === 0 ? 'Idle — no assignments yet' : 'Sub-agent chat ready'}
                  </span>
                </div>
              </div>

              {/* Assignments Inside Active Bubble */}
              {currentBubbleCards.length === 0 ? (
                <div className="panel">
                  <div className="empty-state">
                    <span className="empty-state__icon">🫧</span>
                    <p>No assignments currently inside “{activeBubble.title}”. Scraped assignments matching this bubble&apos;s description will be automatically organized here.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {currentBubbleCards.map((card) => {
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
                  })}
                </div>
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
