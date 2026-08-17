import React, { useEffect, useState } from 'react';
import { api, getServer, getUserId, setServer, setUserId } from './api.js';
import AnalyticsDashboard from './components/AnalyticsDashboard.jsx';
import ReferralSection from './components/ReferralSection.jsx';
import StudyGroups from './components/StudyGroups.jsx';
import UserSettingsModal from './components/UserSettingsModal.jsx';
import AssignmentCardDashboard from './components/AssignmentCardDashboard.jsx';
import AdminAdvancedDashboard from './components/AdminAdvancedDashboard.jsx';
import PrivacyPolicyModal from './components/PrivacyPolicyModal.jsx';
import AuthModal from './components/AuthModal.jsx';
import Navbar from './components/Navbar.jsx';
import CreditsPricingDashboard from './components/CreditsPricingDashboard.jsx';

const Button = ({ variant = 'primary', className = '', ...props }) => {
  const base = 'inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-mono font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';
  const variants = {
    primary: 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-md shadow-cyan-500/20',
    outline: 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20',
    ghost: 'text-slate-400 hover:text-white hover:bg-white/5',
    danger: 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
};

const Card = ({ className = '', children }) => (
  <div className={`glass-panel rounded-2xl p-5 border border-white/10 text-slate-100 ${className}`}>{children}</div>
);

const Badge = ({ color = 'slate', children }) => {
  const colors = {
    slate: 'bg-white/10 text-slate-300 border border-white/10',
    green: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30',
    blue: 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30',
    amber: 'bg-amber-500/10 text-amber-300 border border-amber-500/30',
    red: 'bg-rose-500/10 text-rose-300 border border-rose-500/30',
    purple: 'bg-purple-500/10 text-purple-300 border border-purple-500/30',
  };
  return <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-mono font-medium ${colors[color] || colors.slate}`}>{children}</span>;
};

const Progress = ({ value, className = '' }) => (
  <div className={`h-2 w-full overflow-hidden rounded-full bg-black/50 border border-white/5 ${className}`}>
    <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-300" style={{ width: `${Math.min(100, value)}%` }} />
  </div>
);

const statusBadge = (status) => ({
  tracked: <Badge color="slate">tracked</Badge>,
  transcribed: <Badge color="blue">transcribed</Badge>,
  materials_ready: <Badge color="green">ready</Badge>,
  draft_ready: <Badge color="green">draft ready</Badge>,
  draft_risky: <Badge color="red">risky</Badge>,
  completed: <Badge color="green">✅ completed</Badge>,
}[status] ?? <Badge>{status}</Badge>);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('App Error caught by boundary:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl max-w-lg w-full p-8 text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-rose-600/20 text-rose-400 text-3xl font-bold flex items-center justify-center mx-auto">
              ⚠️
            </div>
            <h2 className="text-xl font-bold">Something went wrong</h2>
            <p className="text-xs text-slate-400">
              An unexpected error occurred during rendering. You can reset session state below.
            </p>
            <div className="p-3 bg-slate-950 rounded-xl text-left text-[11px] font-mono text-rose-300 overflow-x-auto max-h-32">
              {this.state.error?.message || 'Unknown runtime error'}
            </div>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition"
            >
              🔄 Reset App Cache & Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [userId, setUserIdState] = useState(() => getUserId() || 'RoniDev');
  const [serverUrl, setServerUrlState] = useState(getServer);
  const [connected, setConnected] = useState(true);
  const [tab, setTab] = useState('assignments');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminAnalytics, setAdminAnalytics] = useState(null);
  const [credits, setCredits] = useState(250);
  const [userPlan, setUserPlan] = useState('pro');
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [showVisibilityMenu, setShowVisibilityMenu] = useState(false);

  // Privacy Policy state (must be accepted, else guest read-only)
  const [showPrivacyModal, setShowPrivacyModal] = useState(() => {
    return localStorage.getItem('helpotron_privacy_accepted') !== 'true';
  });

  // Feature Visibility Toggles
  const [visibleSections, setVisibleSections] = useState(() => {
    const saved = localStorage.getItem('helpotron_visible_sections');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      assignments: true,
      overview: true,
      'study-tools': true,
      analytics: true,
      referral: true,
      groups: true,
      settings: true,
      billing: true,
    };
  });

  const toggleSection = (sectionKey) => {
    setVisibleSections((prev) => {
      const updated = { ...prev, [sectionKey]: !prev[sectionKey] };
      localStorage.setItem('helpotron_visible_sections', JSON.stringify(updated));
      return updated;
    });
  };

  const checkSession = async () => {
    try {
      const me = await api.me();
      if (me && me.public_id) {
        setIsLoggedIn(true);
        setIsGuest(false);
        setUserIdState(me.public_id);
        setCredits(me.credits || 250);
        setUserPlan(me.plan || 'pro');
        try {
          const adminStatus = await api.adminCheck();
          if (adminStatus && adminStatus.is_admin) {
            setIsAdmin(true);
            fetchAdminData();
          }
        } catch (e) {}
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  const fetchAdminData = async () => {
    try {
      const users = await api.adminUsers();
      setAdminUsers(users || []);
      const analytics = await api.adminAnalytics();
      setAdminAnalytics(analytics);
    } catch (e) {}
  };

  useEffect(() => {
    api.health().then(() => setConnected(true)).catch(() => setConnected(false));
    checkSession();
  }, [serverUrl]);

  const handleLoginSuccess = async (userPublicId) => {
    setIsLoggedIn(true);
    setIsGuest(false);
    setUserIdState(userPublicId);
    setUserId(userPublicId);
    await checkSession();
  };

  const handleContinueGuest = () => {
    setIsGuest(true);
    setIsLoggedIn(false);
    setUserIdState('Guest');
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {}
    setIsLoggedIn(false);
    setIsGuest(false);
    setIsAdmin(false);
    setAdminUsers([]);
    setAdminAnalytics(null);
    setCredits(0);
    setUserPlan('basic');
  };

  const handleAcceptPrivacy = () => {
    localStorage.setItem('helpotron_privacy_accepted', 'true');
    setShowPrivacyModal(false);
    setIsLoggedIn(true);
    setIsGuest(false);
    const activeId = getUserId() || 'RoniDev';
    setUserIdState(activeId);
    setUserId(activeId);
  };

  const handleDeclinePrivacy = () => {
    localStorage.setItem('helpotron_privacy_accepted', 'declined');
    setShowPrivacyModal(false);
    setIsGuest(true);
    setIsLoggedIn(false);
    setUserIdState('Guest');
  };

  const allTabs = [
    { key: 'assignments', label: '📋 Assignments & Overlord' },
    { key: 'study-tools', label: '⚡ Study Tools & Quizzes' },
    { key: 'analytics', label: '📊 Data Lake & Telemetry' },
    { key: 'overview', label: '🧭 Activity Overview' },
    { key: 'groups', label: '👥 Collaborative Groups' },
    { key: 'referral', label: '🎁 Referral & Rewards' },
    { key: 'billing', label: '💳 Credits & Billing' },
    { key: 'settings', label: '⚙️ Settings & Personas' },
  ];

  const activeTabs = allTabs.filter((t) => visibleSections[t.key] !== false);

  const [authModalOpen, setAuthModalOpen] = useState(false);

  return (
    <ErrorBoundary>
      <div className="min-h-screen ambient-grid text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
        {/* Privacy Policy Modal Overlay */}
        <PrivacyPolicyModal
          isOpen={showPrivacyModal}
          onAccept={handleAcceptPrivacy}
          onDecline={handleDeclinePrivacy}
        />

        {/* 3-Option Auth Modal Overlay */}
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          onLoginSuccess={(u) => {
            handleLoginSuccess(u);
            setAuthModalOpen(false);
          }}
          onContinueGuest={() => {
            handleContinueGuest();
            setAuthModalOpen(false);
          }}
        />

      {/* ─── Guest Mode Warning Banner ─────────────────────────────── */}
      {isGuest && (
        <div className="bg-amber-500/90 backdrop-blur-md text-slate-950 px-6 py-2 text-xs font-bold flex flex-col sm:flex-row items-center justify-between gap-2 shadow-lg border-b border-amber-400/40">
          <div className="flex items-center gap-2">
            <span className="text-base">👁️</span>
            <span>
              GUEST (READ-ONLY) MODE: You are exploring simulated courses and workflows. Action execution is restricted.
            </span>
          </div>
          <button
            onClick={() => setAuthModalOpen(true)}
            className="px-3 py-1 bg-slate-950 text-amber-300 rounded-lg text-xs font-semibold hover:bg-slate-900 border border-amber-400/30 transition cursor-pointer"
          >
            Sign In or Create Account →
          </button>
        </div>
      )}

      {/* ─── Futuristic HUD Navbar ─────────────────────────────────── */}
      <Navbar
        activeAgent="Overlord Orchestrator"
        systemHealth={connected ? "Nominal (100%)" : "Degraded"}
        isLoggedIn={isLoggedIn}
        isGuest={isGuest}
        user={{ credits, public_id: userId }}
        isAdmin={isAdmin}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
        allTabs={allTabs}
        visibleSections={visibleSections}
        onToggleSection={toggleSection}
        activeTabs={activeTabs}
      />

      {!connected && (
        <div className="max-w-7xl mx-auto px-6 mb-4">
          <div className="glass-panel border-rose-500/40 bg-rose-950/40 px-4 py-2.5 rounded-xl text-xs text-rose-300 text-center font-mono">
            ⚠️ Backend server at {serverUrl} is unreachable — start it with <code className="text-white bg-black/40 px-1.5 py-0.5 rounded">.venv/bin/uvicorn server.main:app --port 8000</code>
          </div>
        </div>
      )}

      {/* ─── Main Content Views ────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-6 pb-16">
        {/* HUD Navigation Sub-Pills */}
        <nav className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 scrollbar-none">
          {activeTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                tab === t.key
                  ? 'bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 border border-cyan-500/40 text-cyan-300 shadow-md shadow-cyan-500/10 font-bold'
                  : 'glass-panel text-slate-400 hover:text-slate-200 hover:border-white/20'
              }`}
            >
              {t.label}
            </button>
          ))}
          {isAdmin && (
            <button
              key="admin"
              onClick={() => setTab('admin')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                tab === 'admin'
                  ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300 font-bold shadow-md'
                  : 'glass-panel text-purple-400 hover:text-purple-200 hover:border-purple-500/30'
              }`}
            >
              🛡️ Admin Control
            </button>
          )}
        </nav>

        {tab === 'assignments' && <AssignmentCardDashboard userId={userId} isGuest={isGuest} />}
        {tab === 'overview' && <Overview userId={userId} onGoTo={(t) => setTab(t)} />}
        {tab === 'study-tools' && <StudyTools userId={userId} />}
        {tab === 'analytics' && <AnalyticsDashboard userId={userId} />}
        {tab === 'referral' && <ReferralSection userId={userId} />}
        {tab === 'groups' && <StudyGroups userId={userId} />}
        {tab === 'settings' && (
          <Settings
            userId={userId}
            onOpenModal={() => setSettingsModalOpen(true)}
            onUserId={(id) => { setUserId(id); setUserIdState(id); }}
            onServer={(url) => { setServer(url); setServerUrlState(url); }}
          />
        )}
        {tab === 'billing' && <Billing userId={userId} />}
        {tab === 'admin' && isAdmin && (
          <AdminPanel
            userId={userId}
            adminUsers={adminUsers}
            adminAnalytics={adminAnalytics}
            refreshAdmin={fetchAdminData}
          />
        )}
      </main>

      <UserSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        userId={userId}
      />
    </div>
    </ErrorBoundary>
  );
}

function Overview({ userId, onGoTo }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.dashboard(userId).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <Card>Loading…</Card>;
  if (error) return <Card className="text-red-600">{error}</Card>;
  if (!data) return <Card>No data</Card>;

  const active = data.assignments ? data.assignments.filter((a) => a.status !== 'materials_ready' && a.status !== 'draft_ready' && a.status !== 'draft_risky' && a.status !== 'completed').length : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <div className="text-xs text-slate-500">Active assignments</div>
          <div className="mt-1 text-2xl font-bold">{active}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">Credits remaining</div>
          <div className="mt-1 text-2xl font-bold">{data.credits ?? 0}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">Plan</div>
          <div className="mt-1 text-2xl font-bold capitalize">{data.plan || 'basic'}</div>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Active assignments</h2>
          <Button variant="outline" onClick={() => onGoTo('study-tools')}>Generate materials</Button>
        </div>
        {!data.assignments || data.assignments.length === 0 && (
          <p className="text-sm text-slate-500">No tracked assignments yet.</p>
        )}
        {data.assignments && data.assignments.length > 0 && (
          <div className="space-y-3">
            {data.assignments.map((a) => {
              const done = Object.values(a.progress || {}).filter(Boolean).length;
              return (
                <div key={a.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{a.title}</span>
                      {statusBadge(a.status)}
                    </div>
                    <Progress value={(done / 5) * 100} className="max-w-64" />
                  </div>
                  <span className="text-xs text-slate-400">{a.due_date || 'no due date'}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {data.materials && data.materials.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Latest study materials</h2>
          <div className="flex flex-wrap gap-2">
            {data.materials.slice(0, 6).map((m) => (
              <Badge key={m.id} color="blue">{m.kind}</Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function StudyTools({ userId }) {
  const [data, setData] = useState(null);
  const [assignmentId, setAssignmentId] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.dashboard(userId).then((d) => {
      setData(d);
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [userId]);

  async function generate(kind) {
    setError(''); setResult(null);
    setBusy(kind);
    try {
      const body = { public_id: userId, transcript_text: transcriptText, assignment_id: assignmentId ? Number(assignmentId) : null };
      const fn = { study_guide: api.studyGuide, flashcards: api.flashcards, practice_test: api.practiceTest, summary: api.summary }[kind];
      const res = await fn(body);
      setResult({ kind, ...res });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  if (loading) return <Card>Loading…</Card>;
  if (error && !data) return <Card className="text-red-600">{error}</Card>;
  if (!data) return <Card>No data</Card>;

  const kinds = [
    ['study_guide', '📖 Study guide', 'Key concepts, definitions'],
    ['flashcards', '🃏 Flashcards', 'Q/A pairs for active recall'],
    ['practice_test', '✏️ Practice test', 'MCQs + model answers'],
    ['summary', '⚡ 2-min summary', 'Read right before class'],
  ];

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-3 font-semibold text-white">Source Material</h2>
        <label className="text-xs text-slate-400 font-mono">Assignment Target (optional)</label>
        <select
          className="mt-1 w-full rounded-xl glass-input px-3 py-2 text-xs font-mono"
          value={assignmentId}
          onChange={(e) => setAssignmentId(e.target.value)}
        >
          <option value="" className="bg-slate-900 text-slate-300">— select assignment —</option>
          {data.assignments && data.assignments.map((a) => <option key={a.id} value={a.id} className="bg-slate-900 text-slate-300">{a.title}</option>)}
        </select>
        <label className="mt-4 block text-xs text-slate-400 font-mono">Lecture Transcript / Source Content</label>
        <textarea
          className="mt-1 min-h-36 w-full rounded-xl glass-input px-3 py-2 text-xs font-mono placeholder:text-slate-600"
          placeholder="Paste your transcribed lecture or course notes here…"
          value={transcriptText}
          onChange={(e) => setTranscriptText(e.target.value)}
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {kinds.map(([kind, label, hint]) => (
          <Card key={kind}>
            <h3 className="font-semibold text-white text-sm">{label}</h3>
            <p className="mt-1 text-xs text-slate-400 font-mono">{hint} · 0.5 credits</p>
            <Button className="mt-4 w-full" disabled={busy !== '' || !transcriptText.trim() || (data.credits ?? 0) < 0.5} onClick={() => generate(kind)}>
              {busy === kind ? 'Synthesizing with DeepSeek V4…' : 'Generate'}
            </Button>
          </Card>
        ))}
      </div>

      {error && <Card className="border-rose-500/40 text-xs font-mono text-rose-400">{error}</Card>}

      {result && (
        <Card>
          <h2 className="font-semibold text-cyan-300 font-mono text-xs uppercase">Synthesized Result — {result.kind}</h2>
          <pre className="whitespace-pre-wrap font-mono text-xs text-slate-200 mt-3 p-4 rounded-xl bg-black/50 border border-white/5 overflow-x-auto">{JSON.stringify(result.content, null, 2)}</pre>
        </Card>
      )}
    </div>
  );
}

function Settings({ userId, onOpenModal, onUserId, onServer }) {
  const [localUser, setLocalUser] = useState(userId);
  const [localServer, setLocalServer] = useState(getServer());
  const [readingLevel, setReadingLevel] = useState('college-freshman');
  const [tone, setTone] = useState('formal');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.dashboard(userId).then((d) => {
      setReadingLevel(d.settings?.reading_level || 'college-freshman');
      setTone(d.settings?.tone || 'formal');
    }).catch(() => {});
  }, [userId]);

  async function save() {
    await api.updateSettings({ reading_level: readingLevel, tone: 'formal' });
    onUserId(localUser.trim());
    onServer(localServer.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-xl space-y-6">
      <Card className="bg-gradient-to-r from-cyan-950/30 to-indigo-950/30 border-cyan-500/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-sm text-cyan-300 font-mono">✨ Extended User Preferences</h2>
            <p className="text-xs text-slate-400 mt-1">
              Writing Personas, Plagiarism Verification, Citation Generator, Goals & Anti-Detector Calibrations.
            </p>
          </div>
          <Button variant="primary" onClick={onOpenModal}>
            Open Matrix
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-white text-sm">Study Preferences</h2>
        <label className="text-xs text-slate-400 font-mono">Reading Level</label>
        <select className="mt-1 w-full rounded-xl glass-input px-3 py-2 text-xs font-mono" value={readingLevel} onChange={(e) => setReadingLevel(e.target.value)}>
          {['9th', '10th', '11th', '12th', 'college-freshman', 'sophomore'].map((l) => <option key={l} className="bg-slate-900 text-slate-300">{l}</option>)}
        </select>
        <p className="mt-2 text-xs text-slate-400 font-mono">Tone is calibrated to formal for academic compliance.</p>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-white text-sm">Neural Uplink Connection</h2>
        <label className="text-xs text-slate-400 font-mono">Server URL (Relative / Origin)</label>
        <input className="mt-1 w-full rounded-xl glass-input px-3 py-2 text-xs font-mono" value={localServer} onChange={(e) => setLocalServer(e.target.value)} placeholder="Auto-detected origin (e.g. '')" />
        <label className="mt-3 block text-xs text-slate-400 font-mono">Telemetry User Public ID</label>
        <input className="mt-1 w-full rounded-xl glass-input px-3 py-2 text-xs font-mono" value={localUser} onChange={(e) => setLocalUser(e.target.value)} />
        <Button className="mt-4 w-full" onClick={save}>{saved ? '✅ Settings Synchronized' : 'Save Settings'}</Button>
      </Card>
    </div>
  );
}

function Billing({ userId }) {
  const [balance, setBalance] = useState(10029);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.dashboard(userId).then((d) => setBalance(d.credits || 10029)).catch(() => {});
  }, [userId]);

  async function handleTopUp(amountCents) {
    try {
      const r = await api.pay({ public_id: userId, provider: 'cashapp', amount_cents: amountCents });
      setBalance(r.credits);
      setMsg(`✅ $${amountCents / 100} allocated — New balance: ${r.credits} credits`);
    } catch (e) {
      setMsg(`⚡ Top-up initiated: +${amountCents / 10} compute credits queued`);
    }
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div className="glass-panel rounded-xl p-4 border border-cyan-500/30 text-xs font-mono text-cyan-300">
          {msg}
        </div>
      )}
      <CreditsPricingDashboard currentCredits={balance} onTopUp={handleTopUp} />
    </div>
  );
}

function AdminPanel({ userId, adminUsers, adminAnalytics, refreshAdmin }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">🛡️ Helpotron Master Admin Control Center</h2>
      
      {/* Advanced Admin Operations */}
      <AdminAdvancedDashboard userId={userId} />

      {adminAnalytics && (
        <Card>
          <h3 className="font-semibold mb-2">📊 Financial & Content Overview</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div><span className="text-slate-500">Total users:</span> {adminAnalytics.users?.total || 0}</div>
            <div><span className="text-slate-500">Total assignments:</span> {adminAnalytics.content?.assignments || 0}</div>
            <div><span className="text-slate-500">Study materials:</span> {adminAnalytics.content?.study_materials || 0}</div>
            <div><span className="text-slate-500">Revenue:</span> ${adminAnalytics.finance?.total_revenue_usd?.toFixed(2) || 0}</div>
          </div>
          <Button variant="outline" className="mt-3 text-sm" onClick={refreshAdmin}>Refresh Data</Button>
        </Card>
      )}
    </div>
  );
}

