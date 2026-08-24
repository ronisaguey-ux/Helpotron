import React, { useState, useEffect } from 'react';
import AssignmentCard from './AssignmentCard';
import SectionCard from './SectionCard';
import api from '../api';
import {
  Layers,
  Sparkles,
  Bot,
  Video,
  CheckCircle2,
  Clock,
  Zap,
  ArrowLeft,
  ArrowRight,
  Filter,
  Flame,
  AlertCircle,
  Play,
  RotateCcw,
  Plus,
  Minus,
  Trash2,
  Download,
  ShieldAlert,
  Archive,
  History as HistoryIcon,
  Search,
  Check,
  Bell,
  X,
} from 'lucide-react';

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

  // Simulator
  const [simEnabled, setSimEnabled] = useState(true);
  const [simSeeding, setSimSeeding] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    fetchCustomBubbles();
    fetchSimulationStatus();
  }, [userId]);

  useEffect(() => {
    if (dashboardTab === 'history') {
      fetchAssignmentHistory();
    }
  }, [dashboardTab, historySubjectFilter]);

  async function fetchCustomBubbles() {
    try {
      const data = await api.getCustomBubbles();
      if (data?.bubbles) setCustomBubbles(data.bubbles);
    } catch (e) {}
  }

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const cardsData = await api.assignmentCards();
      if (cardsData?.cards) setCards(cardsData.cards);
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

  async function fetchSimulationStatus() {
    try {
      const data = await api.simulationStatus();
      if (data?.is_enabled !== undefined) setSimEnabled(data.is_enabled);
    } catch (e) {}
  }

  async function seedDemoData() {
    setSimSeeding(true);
    try {
      await api.simulationSeed();
      await fetchDashboardData();
      if (dashboardTab === 'history') fetchAssignmentHistory();
    } catch (e) {} finally {
      setSimSeeding(false);
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
  const handleSoftReset = async () => {
    try {
      await api.softResetData();
      setShowSoftResetModal(false);
      setExportNotice('✅ Local cached workspace and staging cleared. Account data safely archived on server.');
      fetchDashboardData();
      setTimeout(() => setExportNotice(''), 4000);
    } catch (e) {
      alert('Reset failed.');
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
  const matchCardToBubble = (card, bubble) => {
    if (!bubble || bubble.id === 'all') return true;
    const title = (bubble.title || '').toLowerCase();
    const desc = (bubble.description || '').toLowerCase();
    const cName = (card.course || '').toLowerCase();
    const aTitle = (card.title || '').toLowerCase();

    return cName.includes(title) || aTitle.includes(title) ||
      (title.includes('math') && (cName.includes('math') || cName.includes('calc') || cName.includes('algebra'))) ||
      (title.includes('english') && (cName.includes('eng') || cName.includes('lit') || cName.includes('writing') || cName.includes('essay'))) ||
      (title.includes('history') && (cName.includes('hist') || cName.includes('social') || cName.includes('gov'))) ||
      (title.includes('computer') && (cName.includes('cs') || cName.includes('code') || cName.includes('comp'))) ||
      (title.includes('biology') && (cName.includes('bio') || cName.includes('life') || cName.includes('lab'))) ||
      (title.includes('psychology') && (cName.includes('psych') || cName.includes('cog') || cName.includes('behav'))) ||
      (desc.length > 5 && (cName.includes(desc.slice(0, 10)) || aTitle.includes(desc.slice(0, 10))));
  };

  const allBubblesList = [
    { id: 'all', title: 'All Course Assignments', description: 'Universal view of all coursework across all subjects & modules', icon: '🌐', color: 'blue', is_all: true },
    ...DEFAULT_SUBJECT_BUBBLES,
    ...customBubbles.map((b) => ({ ...b, is_custom: true })),
  ];

  // Cards for active bubble
  const currentBubbleCards = activeBubble
    ? cards.filter((c) => matchCardToBubble(c, activeBubble))
    : [];

  return (
    <div className="space-y-6">
      {/* LEVEL 1: BUBBLE GRID (NO ASSIGNMENTS SHOWN BY DEFAULT) */}
      {!activeBubble ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-400" />
                    Curriculum Assignment Bubbles ({allBubblesList.length})
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Click any bubble to enter its workspace and view organized assignments and sub-agent teams.
                  </p>
                </div>

                {/* + Button for Custom Bubble */}
                <button
                  onClick={() => setIsCreatingBubble(true)}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Custom Bubble</span>
                </button>
              </div>

              {/* Create Custom Bubble Modal */}
              {isCreatingBubble && (
                <div className="p-5 rounded-2xl bg-slate-950/90 border border-blue-500/40 space-y-3.5 text-xs animate-fadeIn shadow-2xl">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white flex items-center gap-2">
                      <span>🫧</span> Add a New Custom Assignment Bubble
                    </h3>
                    <button
                      onClick={() => setIsCreatingBubble(false)}
                      className="text-slate-400 hover:text-white"
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
                        className="sm:col-span-2 bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-slate-600"
                      />
                      <select
                        value={newBubbleIcon}
                        onChange={(e) => setNewBubbleIcon(e.target.value)}
                        className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white"
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
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-white placeholder:text-slate-600"
                    />

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCreatingBubble(false)}
                        className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!newBubbleTitle.trim() || !newBubbleDesc.trim()}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded-xl font-semibold cursor-pointer"
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
                    ? cards.length
                    : cards.filter((c) => matchCardToBubble(c, bubble)).length;

                  return (
                    <div
                      key={bubble.id}
                      onClick={() => setActiveBubble(bubble)}
                      className="group p-5 rounded-3xl bg-slate-950/60 hover:bg-slate-900/80 border border-white/10 hover:border-blue-500/40 transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-4 hover:shadow-xl hover:-translate-y-0.5 relative overflow-hidden"
                    >
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xl">
                          {bubble.icon || '🫧'}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-mono font-bold text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                            {count} Assignment{count === 1 ? '' : 's'}
                          </span>

                          {/* - Button for Custom Bubbles */}
                          {bubble.is_custom && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteBubble(bubble.id, e)}
                              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                              title="Delete custom bubble"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <div>
                        <div className="font-bold text-sm text-white group-hover:text-blue-300 transition-colors flex items-center gap-1.5">
                          <span>{bubble.title}</span>
                          {bubble.is_custom && (
                            <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded font-mono">
                              Custom
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                          {bubble.description}
                        </p>
                      </div>

                      {/* Footer Info */}
                      <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span className="flex items-center gap-1 text-emerald-400">
                          <Bot className="w-3.5 h-3.5" /> {count > 0 ? `${count} Teams Active` : 'Idle'}
                        </span>
                        <span className="text-blue-400 group-hover:translate-x-1 transition-transform flex items-center gap-0.5">
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
              <div className="p-5 rounded-3xl bg-slate-950/70 border border-blue-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveBubble(null)}
                    className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-white/10 transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
                  >
                    <ArrowLeft className="w-4 h-4 text-blue-400" />
                    <span>Back to All Bubbles</span>
                  </button>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{activeBubble.icon || '🫧'}</span>
                      <h2 className="text-base font-bold text-white">{activeBubble.title}</h2>
                      <span className="text-xs font-mono bg-blue-500/15 text-blue-300 border border-blue-500/25 px-2 py-0.5 rounded-full">
                        {currentBubbleCards.length} Assignments
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{activeBubble.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-xl">
                    🤖 Sub-Agent Teams Synchronized
                  </span>
                </div>
              </div>

              {/* Assignments Inside Active Bubble */}
              {currentBubbleCards.length === 0 ? (
                <SectionCard id="assignment-empty-bubble" padding="p-12" className="rounded-2xl text-center border-dashed border-white/10" title={`No assignments currently inside "${activeBubble.title}"`}>
                  <span className="text-4xl">🫧</span>
                  <p className="text-xs text-slate-400 mt-1">
                    Scraped assignments matching this bubble&apos;s description will be automatically organized here.
                  </p>
                </SectionCard>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {currentBubbleCards.map((card) => {
                    const hasVideoOrMedia = (card.title || '').toLowerCase().includes('video') ||
                      (card.title || '').toLowerCase().includes('lecture') ||
                      (card.title || '').toLowerCase().includes('presentation') ||
                      (card.course || '').toLowerCase().includes('biology');

                    return (
                      <div key={card.id} className="relative group">
                        <AssignmentCard
                          id={card.id}
                          title={card.title}
                          course={card.course}
                          dueDate={card.due_date}
                          status={card.status}
                          urgency={card.urgency}
                          detectorRisk={card.detector_risk}
                          teacherName={card.teacher_name}
                          onSelect={() => {
                            if (onSelectAssignment) onSelectAssignment(card.id);
                            else setSelectedCardId(card.id);
                          }}
                        />

                        {/* AI Multimodal Attachment */}
                        {hasVideoOrMedia && (
                          <div className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[10px] font-mono pointer-events-none">
                            <Video className="w-3 h-3 text-indigo-400" />
                            <span>AI Multimodal</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
    </div>
  );
}

export default AssignmentCardDashboard;
