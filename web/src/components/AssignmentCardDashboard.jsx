import React, { useState, useEffect } from 'react';
import AssignmentCard from './AssignmentCard';
import api from '../api';
import {
  BookOpen,
  Layers,
  Sparkles,
  Bot,
  Video,
  CheckCircle2,
  Clock,
  Zap,
  ArrowRight,
  Filter,
  Flame,
  AlertCircle,
  Play,
  RotateCcw,
  Plus,
} from 'lucide-react';

const DEFAULT_SUBJECTS = [
  { id: 'subj_math', name: 'Mathematics', description: 'Calculus, linear algebra, statistics & formal proofs', color: 'blue', icon: '📐' },
  { id: 'subj_english', name: 'English & Literature', description: 'Literary analysis, rhetorical essays & close reading', color: 'purple', icon: '📖' },
  { id: 'subj_history', name: 'History & Social Studies', description: 'Historiography, primary source evaluation & analysis', color: 'amber', icon: '🏛️' },
  { id: 'subj_cs', name: 'Computer Science', description: 'Algorithms, data structures & software engineering', color: 'emerald', icon: '💻' },
  { id: 'subj_biology', name: 'Biology & Life Sciences', description: 'Genetics, cellular biology & lab investigations', color: 'teal', icon: '🧬' },
  { id: 'subj_psychology', name: 'Psychology & Cognitive Sciences', description: 'Empirical research, cognitive neuroscience & case studies', color: 'indigo', icon: '🧠' },
];

export default function AssignmentCardDashboard({ userId = 'student_demo', isGuest = false, onSelectAssignment = null }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [fullViewData, setFullViewData] = useState(null);
  const [mode, setMode] = useState('auto');
  const [autoRules, setAutoRules] = useState([]);
  const [newRule, setNewRule] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [pendingPermissions, setPendingPermissions] = useState([]);
  const [activePermModal, setActivePermModal] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard | rules
  const [simEnabled, setSimEnabled] = useState(true);
  const [simSeeding, setSimSeeding] = useState(false);

  // Subject filtering and custom subjects
  const [customSubjects, setCustomSubjects] = useState(DEFAULT_SUBJECTS);
  const [selectedSubject, setSelectedSubject] = useState('ALL'); // 'ALL' or subject name

  // Load cards, custom subjects & mode on mount
  useEffect(() => {
    fetchDashboardData();
    fetchCustomSubjects();
    fetchSimulationStatus();
    const interval = setInterval(fetchPendingPermissions, 12000);
    return () => clearInterval(interval);
  }, [userId]);

  async function fetchCustomSubjects() {
    try {
      const data = await api.getCustomSubjects();
      if (data?.subjects && data.subjects.length > 0) {
        setCustomSubjects(data.subjects);
      }
    } catch (e) {}
  }

  async function fetchSimulationStatus() {
    try {
      const data = await api.simulationStatus();
      if (data?.is_enabled !== undefined) setSimEnabled(data.is_enabled);
    } catch (e) {}
  }

  async function toggleSimulator() {
    try {
      const data = await api.simulationToggle(!simEnabled);
      if (data?.is_enabled !== undefined) setSimEnabled(data.is_enabled);
      fetchDashboardData();
    } catch (e) {}
  }

  async function seedDemoData() {
    setSimSeeding(true);
    try {
      await api.simulationSeed();
      await fetchDashboardData();
    } catch (e) {} finally {
      setSimSeeding(false);
    }
  }

  async function clearDemoData() {
    if (!confirm('Clear synthetic mock assignments?')) return;
    try {
      await api.simulationClear();
      await fetchDashboardData();
    } catch (e) {}
  }

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const [cardsData, modeData, rulesData] = await Promise.all([
        api.assignmentCards(),
        api.agentMode(),
        api.agentPermissionRules(),
      ]);

      if (cardsData?.cards) setCards(cardsData.cards);
      if (modeData?.operation_mode) setMode(modeData.operation_mode);
      if (rulesData?.rules) setAutoRules(rulesData.rules);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPendingPermissions() {
    try {
      const data = await api.agentPermissionsPending();
      if (data?.pending) {
        setPendingPermissions(data.pending);
        if (data.pending.length > 0 && !activePermModal) {
          setActivePermModal(data.pending[0]);
        }
      }
    } catch (e) {}
  }

  async function switchMode(newMode) {
    setMode(newMode);
    try {
      await api.setAgentMode(newMode);
    } catch (err) {
      console.error('Failed to update mode:', err);
    }
  }

  async function openFullView(assignmentId) {
    if (onSelectAssignment) {
      onSelectAssignment(assignmentId);
      return;
    }
    setSelectedCardId(assignmentId);
    try {
      const data = await api.assignmentFullView(assignmentId);
      setFullViewData(data);
    } catch (err) {
      console.error('Failed to load assignment full view:', err);
    }
  }

  async function sendOverlordMessage(e) {
    e.preventDefault();
    if (!inputMsg.trim()) return;

    const userText = inputMsg.trim();
    setInputMsg('');
    setChatMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setSendingMsg(true);

    try {
      const data = await api.overlordChat(userText);
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'overlord',
          text: data?.response || 'Acknowledged.',
          actions: data?.suggested_actions,
        },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { sender: 'overlord', text: 'Error contacting Overlord agent.' },
      ]);
    } finally {
      setSendingMsg(false);
    }
  }

  // Helper to map card to subject
  const matchSubject = (courseName, targetSubjectName) => {
    if (!courseName || !targetSubjectName) return false;
    const c = courseName.toLowerCase();
    const s = targetSubjectName.toLowerCase();
    return c.includes(s) || s.includes(c) ||
      (s.includes('math') && (c.includes('math') || c.includes('calc') || c.includes('algebra') || c.includes('stat'))) ||
      (s.includes('english') && (c.includes('eng') || c.includes('lit') || c.includes('writing') || c.includes('essay'))) ||
      (s.includes('history') && (c.includes('hist') || c.includes('social') || c.includes('gov') || c.includes('civic'))) ||
      (s.includes('computer') && (c.includes('cs') || c.includes('code') || c.includes('comp') || c.includes('prog'))) ||
      (s.includes('biology') && (c.includes('bio') || c.includes('life') || c.includes('chem') || c.includes('lab'))) ||
      (s.includes('psychology') && (c.includes('psych') || c.includes('cog') || c.includes('behav')));
  };

  // Filtered Cards
  const filteredCards = selectedSubject === 'ALL'
    ? cards
    : cards.filter((c) => matchSubject(c.course, selectedSubject));

  return (
    <div className="space-y-6">
      
      {/* ─── 1. SIMULATOR & TELEMETRY HUB ────────────────────────────── */}
      <div className="glass-panel border-cyan-500/30 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <span className="text-base">🧪</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-slate-100">Live Mock Activity Simulator</span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                simEnabled
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-bold'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {simEnabled ? 'ACTIVE (Real-time telemetry)' : 'DISABLED'}
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
              Simulates course assignments, progressive sub-agent teams, and Gemini 3.7 Flash multimodal runs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={seedDemoData}
            disabled={simSeeding}
            className="px-3.5 py-1.5 bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:bg-blue-600/30 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
          >
            {simSeeding ? 'Seeding…' : '🔄 Seed Sample Courses'}
          </button>

          <button
            onClick={clearDemoData}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
          >
            Clear Data
          </button>
        </div>
      </div>

      {/* ─── 2. INTERACTIVE SUBJECT BOXES / CLUSTERS ─────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            Curriculum Subject Hubs ({customSubjects.length})
          </h3>
          {selectedSubject !== 'ALL' && (
            <button
              onClick={() => setSelectedSubject('ALL')}
              className="text-[11px] font-mono text-blue-400 hover:underline cursor-pointer"
            >
              Reset to All Subjects
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* ALL SUBJECTS CARD */}
          <div
            onClick={() => setSelectedSubject('ALL')}
            className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
              selectedSubject === 'ALL'
                ? 'bg-blue-600/15 border-blue-500/50 shadow-lg ring-1 ring-blue-500/30'
                : 'bg-slate-950/40 hover:bg-slate-900/60 border-white/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-lg">🌐</span>
              <span className="text-[11px] font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                {cards.length} Total
              </span>
            </div>
            <div className="mt-2">
              <div className="font-bold text-xs text-white">All Subjects</div>
              <div className="text-[10px] text-slate-400 truncate mt-0.5">Complete course overview</div>
            </div>
          </div>

          {/* INDIVIDUAL SUBJECT BOXES */}
          {customSubjects.map((subj) => {
            const count = cards.filter((c) => matchSubject(c.course, subj.name)).length;
            const isSelected = selectedSubject === subj.name;

            return (
              <div
                key={subj.id || subj.name}
                onClick={() => setSelectedSubject(isSelected ? 'ALL' : subj.name)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between relative group ${
                  isSelected
                    ? 'bg-blue-600/20 border-blue-500/60 shadow-lg ring-1 ring-blue-500/40'
                    : 'bg-slate-950/40 hover:bg-slate-900/60 border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-lg">{subj.icon || '📚'}</span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    count > 0 ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {count} Active
                  </span>
                </div>

                <div className="mt-2">
                  <div className="font-bold text-xs text-white flex items-center justify-between">
                    <span className="truncate">{subj.name}</span>
                    {subj.is_custom && (
                      <span className="text-[8px] bg-blue-500/20 text-blue-300 px-1 rounded font-mono">
                        Custom
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                    {subj.description}
                  </div>
                </div>

                {/* Sub-agent Team Indicator */}
                {count > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[9px] font-mono text-slate-400">
                    <span className="flex items-center gap-1 text-blue-300">
                      <Bot className="w-3 h-3 text-blue-400" /> {count} Teams Working
                    </span>
                    <span className="flex items-center gap-1 text-purple-300">
                      <Sparkles className="w-3 h-3 text-purple-400" /> Humanized
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── 3. ASSIGNMENT CARDS GRID ────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Active Assignment Workspaces {selectedSubject !== 'ALL' && `(${selectedSubject})`}
            </h3>
            <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">
              {filteredCards.length} Cards
            </span>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400 text-xs font-mono">Loading assignment workspaces…</div>
        ) : filteredCards.length === 0 ? (
          <div className="clean-card rounded-2xl p-12 text-center border-dashed border-white/10">
            <span className="text-4xl">📚</span>
            <h3 className="text-base font-semibold text-slate-200 mt-2">
              No assignments found for {selectedSubject === 'ALL' ? 'current courses' : selectedSubject}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Click &quot;Seed Sample Courses&quot; above to simulate realistic student coursework with sub-agent teams.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCards.map((card) => {
              const hasVideoOrMedia = card.title?.toLowerCase().includes('video') ||
                card.title?.toLowerCase().includes('lecture') ||
                card.title?.toLowerCase().includes('presentation') ||
                card.course?.toLowerCase().includes('biology');

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
                    onSelect={openFullView}
                  />

                  {/* Gemini 3.7 Flash Multimodal Team Indicator */}
                  {hasVideoOrMedia && (
                    <div className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[10px] font-mono pointer-events-none">
                      <Video className="w-3 h-3 text-indigo-400" />
                      <span>Gemini 3.7 Flash</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── 4. FULL VIEW MODAL WITH SUB-AGENT TEAMS ─────────────────── */}
      {selectedCardId && fullViewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 overflow-y-auto">
          <div className="clean-card rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 space-y-6 border border-white/10 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <span className="text-xs font-mono uppercase text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-500/20">
                  {fullViewData.course || 'Course Work'}
                </span>
                <h2 className="text-xl font-bold text-white mt-2">{fullViewData.title}</h2>
                <div className="flex gap-4 text-xs text-slate-400 font-mono mt-1">
                  <span>Instructor: {fullViewData.teacher_name || 'Prof. Department'}</span>
                  <span>Due: {fullViewData.due_date || 'Upcoming'}</span>
                  <span>Target Grade: <strong className="text-blue-400">A (92%)</strong></span>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedCardId(null);
                  setFullViewData(null);
                }}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Sub-Agent Team Bubble Display */}
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Bot className="w-4 h-4 text-blue-400" />
                Active Sub-Agent Bubble Team
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-slate-900 border border-blue-500/20">
                  <div className="font-bold text-white">📑 Research Lead</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Syllabus & Lecture Mining</div>
                  <div className="text-[10px] text-emerald-400 font-mono mt-2">Active</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-purple-500/20">
                  <div className="font-bold text-white">📋 Rubric Auditor</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">HelpSteer Compliance</div>
                  <div className="text-[10px] text-emerald-400 font-mono mt-2">Verified (95%)</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-amber-500/20">
                  <div className="font-bold text-white">🛡️ Humanizer Specialist</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Cadence & Evasion</div>
                  <div className="text-[10px] text-emerald-400 font-mono mt-2">0% AI Score</div>
                </div>

                {/* Gemini 3.7 Flash Multimodal Team Specialist */}
                <div className="p-3 rounded-xl bg-slate-900 border border-indigo-500/30">
                  <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Gemini 3.7 Flash</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Multimodal Video & Vision</div>
                  <div className="text-[10px] text-indigo-400 font-mono mt-2">Spawned in Bubble</div>
                </div>
              </div>
            </div>

            {/* Rubric Breakdown */}
            {fullViewData.rubric_breakdown && (
              <div className="space-y-3">
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400">Institutional Rubric Criteria</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {fullViewData.rubric_breakdown.map((r, i) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-950/40 border border-white/5 space-y-1">
                      <div className="flex justify-between font-bold text-slate-200">
                        <span>{r.criterion}</span>
                        <span className="text-cyan-400 font-mono">{r.points} pts</span>
                      </div>
                      <p className="text-[11px] text-slate-400">{r.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
