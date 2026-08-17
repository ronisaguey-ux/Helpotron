import React, { useState, useEffect } from 'react';
import AssignmentCard from './AssignmentCard';

const API_BASE = '';

function getHeaders(userId) {
  return {
    'Content-Type': 'application/json',
    'X-Public-ID': userId || 'anon',
  };
}

export default function AssignmentCardDashboard({ userId = 'student_demo', isGuest = false }) {
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

  // Load cards & mode on mount
  useEffect(() => {
    fetchDashboardData();
    fetchSimulationStatus();
    const interval = setInterval(fetchPendingPermissions, 4000);
    return () => clearInterval(interval);
  }, [userId]);

  async function fetchSimulationStatus() {
    try {
      const res = await fetch(`${API_BASE}/api/simulation/status`, { headers: getHeaders(userId) });
      const data = await res.json();
      if (data.is_enabled !== undefined) setSimEnabled(data.is_enabled);
    } catch (e) {}
  }

  async function toggleSimulator() {
    try {
      const res = await fetch(`${API_BASE}/api/simulation/toggle`, {
        method: 'POST',
        headers: getHeaders(userId),
        body: JSON.stringify({ enabled: !simEnabled }),
      });
      const data = await res.json();
      setSimEnabled(data.is_enabled);
      fetchDashboardData();
    } catch (e) {}
  }

  async function seedDemoData() {
    setSimSeeding(true);
    try {
      await fetch(`${API_BASE}/api/simulation/seed`, {
        method: 'POST',
        headers: getHeaders(userId),
      });
      await fetchDashboardData();
    } catch (e) {} finally {
      setSimSeeding(false);
    }
  }

  async function clearDemoData() {
    if (!confirm('Clear synthetic mock assignments?')) return;
    try {
      await fetch(`${API_BASE}/api/simulation/clear`, {
        method: 'POST',
        headers: getHeaders(userId),
      });
      await fetchDashboardData();
    } catch (e) {}
  }

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const [cardsRes, modeRes, rulesRes] = await Promise.all([
        fetch(`${API_BASE}/api/assignments/cards`, { headers: getHeaders(userId) }),
        fetch(`${API_BASE}/api/agent/mode`, { headers: getHeaders(userId) }),
        fetch(`${API_BASE}/api/agent/permissions/rules`, { headers: getHeaders(userId) }),
      ]);
      const cardsData = await cardsRes.json();
      const modeData = await modeRes.json();
      const rulesData = await rulesRes.json();

      if (cardsData.cards) setCards(cardsData.cards);
      if (modeData.operation_mode) setMode(modeData.operation_mode);
      if (rulesData.rules) setAutoRules(rulesData.rules);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPendingPermissions() {
    try {
      const res = await fetch(`${API_BASE}/api/agent/permissions/pending`, { headers: getHeaders(userId) });
      const data = await res.json();
      if (data.pending) {
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
      await fetch(`${API_BASE}/api/agent/mode`, {
        method: 'POST',
        headers: getHeaders(userId),
        body: JSON.stringify({ mode: newMode, is_session_override: true }),
      });
    } catch (err) {
      console.error('Failed to update mode:', err);
    }
  }

  async function openFullView(assignmentId) {
    setSelectedCardId(assignmentId);
    try {
      const res = await fetch(`${API_BASE}/api/assignment/${assignmentId}/full-view`, {
        headers: getHeaders(userId),
      });
      const data = await res.json();
      setFullViewData(data.assignment);
      setChatMessages(data.chat_history || []);
    } catch (err) {
      console.error('Failed to load full view:', err);
    }
  }

  async function sendChatMessage(presetText = null) {
    if (isGuest) {
      alert('⚠️ Guest Mode (Read-Only): You can explore all courses and rubrics. Please sign in or create an account to dispatch AI tasks.');
      return;
    }
    const textToSend = presetText || inputMsg;
    if (!textToSend.trim() || !selectedCardId) return;

    setSendingMsg(true);
    if (!presetText) setInputMsg('');

    // Optimistic user bubble
    const tempUserMsg = {
      id: `temp_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`${API_BASE}/api/agent/chat`, {
        method: 'POST',
        headers: getHeaders(userId),
        body: JSON.stringify({
          assignment_id: selectedCardId,
          text: textToSend,
          session_mode_override: mode,
        }),
      });
      const data = await res.json();

      if (data.status === 'permission_required') {
        setActivePermModal(data.permission_request);
        if (data.message) setChatMessages((prev) => [...prev, data.message]);
      } else if (data.message) {
        setChatMessages((prev) => [...prev, data.message]);
      }
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setSendingMsg(false);
    }
  }

  const [permComment, setPermComment] = useState('');

  async function handlePermissionDecision(decision) {
    if (!activePermModal) return;
    try {
      const res = await fetch(`${API_BASE}/api/agent/permission/respond`, {
        method: 'POST',
        headers: getHeaders(userId),
        body: JSON.stringify({
          permission_id: activePermModal.id,
          decision: decision,
          comment: permComment.trim() || undefined,
          replacement_text: decision === 'write_something_else' ? permComment.trim() || 'New task direction requested.' : undefined,
        }),
      });
      const data = await res.json();
      setActivePermModal(null);
      setPermComment('');
      fetchPendingPermissions();

      if (decision === 'always_approve') {
        fetchDashboardData();
      }

      if (data.decision === 'reject') {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `rej_${Date.now()}`,
            sender: 'overlord',
            text: `❌ Action rejected. ${permComment ? `Note: "${permComment}"` : ''}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      } else if (data.execution_result) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `res_${Date.now()}`,
            sender: 'overlord',
            text: `✅ Action executed: ${data.execution_result.message || 'Completed'}${permComment ? ` (with user note: "${permComment}")` : ''}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.error('Permission respond error:', err);
    }
  }

  async function addAutoRule() {
    if (!newRule.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/agent/permissions/rules`, {
        method: 'POST',
        headers: getHeaders(userId),
        body: JSON.stringify({ rule: newRule.trim() }),
      });
      const data = await res.json();
      if (data.rules) setAutoRules(data.rules);
      setNewRule('');
    } catch (e) {}
  }

  async function deleteAutoRule(ruleToDelete) {
    try {
      const res = await fetch(`${API_BASE}/api/agent/permissions/rules/${encodeURIComponent(ruleToDelete)}`, {
        method: 'DELETE',
        headers: getHeaders(userId),
      });
      const data = await res.json();
      if (data.rules) setAutoRules(data.rules);
    } catch (e) {}
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'Submitted':
        return 'bg-emerald-50 text-emerald-700 border-emerald-300';
      case 'Ready for Review':
        return 'bg-indigo-50 text-indigo-700 border-indigo-300';
      case 'Humanizing':
        return 'bg-purple-50 text-purple-700 border-purple-300';
      case 'In Progress':
        return 'bg-amber-50 text-amber-700 border-amber-300';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Simulator & Test Data Hub ────────────────────────────── */}
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
              Simulates course assignments, progressive rubric stages, and live AI evasion scores.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap font-mono">
          <button
            onClick={toggleSimulator}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              simEnabled
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30'
                : 'glass-panel text-slate-400 hover:text-slate-200'
            }`}
          >
            {simEnabled ? 'Disable Simulator' : 'Enable Simulator'}
          </button>

          <button
            onClick={seedDemoData}
            disabled={simSeeding}
            className="px-3 py-1.5 bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/30 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
          >
            {simSeeding ? 'Seeding…' : '🔄 Seed Sample Courses'}
          </button>

          <button
            onClick={clearDemoData}
            className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-rose-400 transition-colors font-mono cursor-pointer"
          >
            Clear Data
          </button>
        </div>
      </div>

      {/* ─── Control Header: Modes & Rules ─────────────────────────── */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-sm">
                🤖
              </div>
              <h2 className="text-base font-bold text-slate-100 font-mono tracking-wide">Main Agent (Overlord) Hub</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                Online & Coordinating
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              Autonomous orchestration of sub-agent teams, rubric decomposition, and AI humanization.
            </p>
          </div>

          {/* Mode Selector Buttons */}
          <div className="flex items-center gap-1.5 p-1 bg-black/40 rounded-xl border border-white/10 font-mono">
            <button
              onClick={() => switchMode('manual')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mode === 'manual'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🛡️ Manual
            </button>
            <button
              onClick={() => switchMode('auto')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mode === 'auto'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ⚡ Auto
            </button>
            <button
              onClick={() => switchMode('yolo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mode === 'yolo'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                  : 'text-rose-400 hover:bg-rose-500/10'
              }`}
            >
              🔥 YOLO
            </button>
          </div>
        </div>

        {/* YOLO Warning Banner */}
        {mode === 'yolo' && (
          <div className="glass-panel border-rose-500/50 bg-rose-950/40 rounded-xl p-3.5 flex items-start gap-3 text-xs font-mono">
            <span className="text-xl">⚠️</span>
            <div className="text-rose-200 leading-relaxed">
              <span className="font-bold text-rose-400">YOLO MODE ACTIVE:</span> All sub-agent actions, drafts, external requests, and submissions execute immediately with zero confirmation prompts. Use at your own risk.
            </div>
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex gap-4 border-t border-white/5 pt-3 font-mono text-xs">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`pb-1 border-b-2 transition-all cursor-pointer ${
              activeTab === 'dashboard'
                ? 'border-cyan-400 text-cyan-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📋 Assignment Cards ({cards.length})
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`pb-1 border-b-2 transition-all cursor-pointer ${
              activeTab === 'rules'
                ? 'border-cyan-400 text-cyan-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚙️ Auto-Approved Rules ({autoRules.length})
          </button>
        </div>
      </div>

      {/* ─── TAB 1: ASSIGNMENT CARDS GRID ───────────────────────────── */}
      {activeTab === 'dashboard' && (
        <>
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-xs font-mono">Loading telemetry & assignment cards…</div>
          ) : cards.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center border-dashed border-white/10 font-mono">
              <span className="text-4xl">📚</span>
              <h3 className="text-base font-semibold text-slate-200 mt-2">No active assignments</h3>
              <p className="text-xs text-slate-400 mt-1">Assignments imported or synced from Canvas/LMS will appear here as cards.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {cards.map((c) => (
                <AssignmentCard
                  key={c.id}
                  id={c.id}
                  title={c.name}
                  course={c.class_code || c.subject}
                  dueDate={c.due_date}
                  status={c.status}
                  urgency={c.status === "Humanizing" ? "high" : "normal"}
                  detectorRisk={c.score_ai ? c.score_ai / 100 : 0.02}
                  estimatedTime={c.estimated_time}
                  scoreAI={c.score_ai}
                  teacherName={c.teacher_name}
                  onSelect={openFullView}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── TAB 2: AUTO-APPROVED RULES MANAGER ─────────────────────── */}
      {activeTab === 'rules' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Auto-Approved Actions Manager</h3>
            <p className="text-xs text-slate-500 mt-1">
              Actions matching any rule in this list bypass confirmation prompts in Manual and Auto modes.
            </p>
          </div>

          <div className="flex gap-2 max-w-md">
            <input
              type="text"
              placeholder="e.g. humanize, check_citations, draft_intro"
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={addAutoRule}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors"
            >
              + Add Rule
            </button>
          </div>

          <div className="space-y-2">
            {autoRules.map((rule) => (
              <div
                key={rule}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 max-w-md"
              >
                <span className="font-mono text-xs font-semibold text-slate-800">✅ {rule}</span>
                <button
                  onClick={() => deleteAutoRule(rule)}
                  className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── FULL-PAGE / EXPANDED ASSIGNMENT MODAL ───────────────────── */}
      {selectedCardId && fullViewData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 font-mono">
                  Full Assignment Workspace
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-0.5">{fullViewData.title}</h2>
              </div>
              <button
                onClick={() => setSelectedCardId(null)}
                className="text-slate-400 hover:text-slate-700 text-xl font-bold p-2"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
              {/* Left Column: Assignment Details & Rubric */}
              <div className="space-y-5">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                  <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Assignment Prompt</h4>
                  <p className="text-xs text-slate-800 mt-2 leading-relaxed whitespace-pre-wrap">{fullViewData.prompt}</p>
                </div>

                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                  <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Grading Rubric</h4>
                  <p className="text-xs text-slate-700 mt-2 leading-relaxed">{fullViewData.rubric}</p>
                </div>

                {fullViewData.attached_files && fullViewData.attached_files.length > 0 && (
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                    <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Attached Materials</h4>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {fullViewData.attached_files.map((f) => (
                        <span key={f} className="text-xs px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-mono text-slate-700">
                          📎 {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sub-Agent Execution Progress */}
                {fullViewData.subagent_progress && (
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                    <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-3">Sub-Agent Pipeline</h4>
                    <div className="space-y-2">
                      {fullViewData.subagent_progress.map((step) => (
                        <div key={step.agent} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-semibold text-slate-800">{step.agent}</span>
                            <span className="text-slate-500">{step.progress}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
                              style={{ width: `${step.progress}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Interactive Chat & Task Presets */}
              <div className="flex flex-col h-full bg-slate-50 rounded-2xl p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    💬 Sub-Agent Cluster Chat
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-mono">
                    Mode: {mode.toUpperCase()}
                  </span>
                </div>

                {/* Chat Messages Log */}
                <div className="flex-1 overflow-y-auto space-y-3 min-h-[220px] max-h-[300px] pr-1">
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`rounded-2xl px-3.5 py-2 text-xs max-w-[85%] leading-relaxed ${
                          msg.sender === 'user'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white border border-slate-200 text-slate-800 shadow-sm'
                        }`}
                      >
                        {msg.text}
                      </div>
                      {msg.subagent_logs && msg.subagent_logs.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {msg.subagent_logs.map((log, i) => (
                            <span key={i} className="text-[10px] block font-mono text-slate-400">
                              ⚡ {log}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Suggested Action Presets */}
                <div className="mt-3 pt-2 border-t border-slate-200 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Suggested Tasks</span>
                  <div className="flex flex-wrap gap-1.5">
                    {['Write Introduction', 'Check Citations', 'Humanize Section', 'Analyze Rubric', 'Submit Assignment'].map((act) => (
                      <button
                        key={act}
                        onClick={() => sendChatMessage(act)}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 hover:border-indigo-500 hover:text-indigo-600 transition-all font-medium"
                      >
                        + {act}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chat Input */}
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    placeholder="Ask Main Agent or command sub-agent team…"
                    value={inputMsg}
                    onChange={(e) => setInputMsg(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                    className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                  <button
                    disabled={sendingMsg}
                    onClick={() => sendChatMessage()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── PERMISSION CONFIRMATION MODAL ──────────────────────────── */}
      {activePermModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl font-bold">
                ⚠️
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">{activePermModal.title}</h3>
                <span className="text-[11px] font-mono text-slate-400 uppercase">Action: {activePermModal.action_type}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {activePermModal.description || 'This action requires explicit approval in current operation mode.'}
            </p>

            {/* Optional Comment / Instruction Input */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Additional Notes or Instructions (Optional)
              </label>
              <textarea
                placeholder="e.g. 'Use APA citation format' or 'Only summarize the first 2 pages' or rejection reason..."
                value={permComment}
                onChange={(e) => setPermComment(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
              />
            </div>

            <div className="space-y-2 pt-1">
              <button
                onClick={() => handlePermissionDecision('approve')}
                className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm"
              >
                ✅ Approve (Execute Once)
              </button>

              <button
                onClick={() => handlePermissionDecision('always_approve')}
                className="w-full py-2.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors"
              >
                ✨ Always Approve This Action Type
              </button>

              <button
                onClick={() => handlePermissionDecision('reject')}
                className="w-full py-2.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold hover:bg-rose-100 transition-colors"
              >
                ❌ Reject (Decline Action)
              </button>

              <button
                onClick={() => handlePermissionDecision('write_something_else')}
                className="w-full py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors"
              >
                ✍️ Write Something Else (Cancel & Reframe)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
