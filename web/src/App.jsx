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

const Button = ({ variant = 'primary', className = '', ...props }) => {
  const base = 'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-slate-900 text-white hover:bg-slate-700',
    outline: 'border border-slate-300 hover:bg-slate-100',
    ghost: 'hover:bg-slate-100',
    danger: 'bg-red-600 text-white hover:bg-red-500',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
};

const Card = ({ className = '', children }) => (
  <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>
);

const Badge = ({ color = 'slate', children }) => {
  const colors = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-700',
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    purple: 'bg-purple-100 text-purple-700',
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[color]}`}>{children}</span>;
};

const Progress = ({ value, className = '' }) => (
  <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-200 ${className}`}>
    <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${Math.min(100, value)}%` }} />
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
    { key: 'assignments', label: '📋 Assignments' },
    { key: 'overview', label: 'Overview' },
    { key: 'study-tools', label: 'Study Tools' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'referral', label: 'Referral' },
    { key: 'groups', label: 'Study Groups' },
    { key: 'settings', label: 'Settings' },
    { key: 'billing', label: 'Billing' },
  ];

  const activeTabs = allTabs.filter((t) => visibleSections[t.key] !== false);

  const [authModalOpen, setAuthModalOpen] = useState(false);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50 text-slate-900">
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
        <div className="bg-amber-500 text-slate-950 px-4 py-2.5 text-xs font-bold flex flex-col sm:flex-row items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-base">👁️</span>
            <span>
              GUEST (READ-ONLY) MODE: You are exploring simulated courses and workflows. Action execution is restricted.
            </span>
          </div>
          <button
            onClick={() => setAuthModalOpen(true)}
            className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition cursor-pointer"
          >
            Sign In or Create Account →
          </button>
        </div>
      )}

      {/* ─── Main Header ───────────────────────────────────────────── */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <h1 className="text-base font-black text-slate-900 tracking-tight">Helpotron Automator</h1>
              <span className="text-[10px] font-mono text-slate-400 block -mt-0.5">Autonomous Academic Suite</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-500 flex-wrap">
            <span className="font-mono bg-slate-100 px-2 py-1 rounded-lg text-slate-700">
              user: <strong>{userId}</strong>
            </span>
            <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-200">
              💰 {credits} credits
            </span>

            {/* Visibility Toggle Dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                className="text-xs px-2.5 py-1"
                onClick={() => setShowVisibilityMenu(!showVisibilityMenu)}
              >
                👁️ Visibility ({activeTabs.length}/{allTabs.length})
              </Button>

              {showVisibilityMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-50 space-y-1.5 text-xs">
                  <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block mb-1">
                    Toggle Section Visibility
                  </span>
                  {allTabs.map((t) => (
                    <label
                      key={t.key}
                      className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      <span className="font-medium text-slate-700">{t.label}</span>
                      <input
                        type="checkbox"
                        checked={visibleSections[t.key] !== false}
                        onChange={() => toggleSection(t.key)}
                        className="rounded accent-indigo-600"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <Button
              variant="outline"
              className="text-xs px-2.5 py-1"
              onClick={() => setSettingsModalOpen(true)}
            >
              ⚙️ Preferences
            </Button>

            {isAdmin && <Badge color="purple">👑 Admin</Badge>}

            {isLoggedIn ? (
              <Button variant="outline" className="text-xs px-2.5 py-1 text-rose-600 cursor-pointer" onClick={handleLogout}>
                Logout
              </Button>
            ) : (
              <Button
                variant="primary"
                className="text-xs px-2.5 py-1 cursor-pointer"
                onClick={() => setAuthModalOpen(true)}
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {!connected && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700 text-center font-medium">
          ⚠️ Server at {serverUrl} is unreachable — start it with <code>.venv/bin/uvicorn server.main:app --port 8000</code>
        </div>
      )}

      {/* ─── Navigation Tabs ───────────────────────────────────────── */}
      <nav className="mx-auto flex max-w-6xl gap-1.5 px-4 py-3 flex-wrap">
        {activeTabs.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? 'primary' : 'ghost'}
            onClick={() => setTab(t.key)}
            className="capitalize text-xs font-semibold"
          >
            {t.label}
          </Button>
        ))}
        {isAdmin && (
          <Button
            key="admin"
            variant={tab === 'admin' ? 'primary' : 'ghost'}
            onClick={() => setTab('admin')}
            className="capitalize text-xs font-semibold text-purple-700"
          >
            🛡️ Admin Control
          </Button>
        )}
      </nav>

      {/* ─── Main Content Views ────────────────────────────────────── */}
      <main className="mx-auto max-w-6xl px-4 pb-16">
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
        <h2 className="mb-2 font-semibold">Source material</h2>
        <label className="text-xs text-slate-500">Assignment (optional)</label>
        <select
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          value={assignmentId}
          onChange={(e) => setAssignmentId(e.target.value)}
        >
          <option value="">— none —</option>
          {data.assignments && data.assignments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
        <label className="mt-3 block text-xs text-slate-500">Lecture transcript</label>
        <textarea
          className="mt-1 min-h-40 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="Paste your transcribed lecture here…"
          value={transcriptText}
          onChange={(e) => setTranscriptText(e.target.value)}
        />
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {kinds.map(([kind, label, hint]) => (
          <Card key={kind}>
            <h3 className="font-semibold">{label}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{hint} · 0.5 credits</p>
            <Button className="mt-3" disabled={busy !== '' || !transcriptText.trim() || (data.credits ?? 0) < 0.5} onClick={() => generate(kind)}>
              {busy === kind ? 'Generating…' : 'Generate'}
            </Button>
          </Card>
        ))}
      </div>

      {error && <Card className="border-red-200 text-sm text-red-600">{error}</Card>}

      {result && (
        <Card>
          <h2 className="font-semibold">Result — {result.kind}</h2>
          <pre className="whitespace-pre-wrap font-sans text-sm mt-2">{JSON.stringify(result.content, null, 2)}</pre>
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
    <div className="max-w-xl space-y-4">
      <Card className="bg-gradient-to-r from-indigo-950/20 to-purple-950/20 border-indigo-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base text-indigo-900">✨ Extended User Preferences</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Writing Personas, Plagiarism Verification, Citation Generator, Goals & Themes.
            </p>
          </div>
          <Button variant="primary" onClick={onOpenModal}>
            Open Preferences
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Study preferences</h2>
        <label className="text-xs text-slate-500">Reading level</label>
        <select className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={readingLevel} onChange={(e) => setReadingLevel(e.target.value)}>
          {['9th', '10th', '11th', '12th', 'college-freshman', 'sophomore'].map((l) => <option key={l}>{l}</option>)}
        </select>
        <p className="mt-2 text-xs text-slate-400">Tone is fixed to formal for all assignments.</p>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Connection</h2>
        <label className="text-xs text-slate-500">Server URL</label>
        <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={localServer} onChange={(e) => setLocalServer(e.target.value)} />
        <label className="mt-3 block text-xs text-slate-500">Your user id</label>
        <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={localUser} onChange={(e) => setLocalUser(e.target.value)} />
        <Button className="mt-3" onClick={save}>{saved ? '✅ Saved' : 'Save settings'}</Button>
      </Card>
    </div>
  );
}

function Billing({ userId }) {
  const [balance, setBalance] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [discount, setDiscount] = useState(null);

  const plans = [
    { name: 'basic', price: '$10', credits: '300 credits', detail: '3M tokens ~300 assignments' },
    { name: 'pro', price: '$20', credits: '600 credits', detail: '6M tokens ~600 assignments (BEST VALUE)' },
    { name: 'elite', price: '$40', credits: '1500 credits', detail: '15M tokens ~1500 assignments' },
  ];

  useEffect(() => {
    api.dashboard(userId).then((d) => setBalance(d.credits)).catch(() => {});
  }, [userId]);

  async function pay(amountCents) {
    setBusy(true); setMsg('');
    try {
      const r = await api.pay({ public_id: userId, provider: 'cashapp', amount_cents: amountCents });
      setBalance(r.credits);
      setMsg(`✅ ${amountCents / 100} paid — balance now ${r.credits} credits`);
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.name} className="text-center">
            <div className="font-semibold capitalize">{p.name}</div>
            <div className="mt-1 text-2xl font-bold">{p.price}<span className="text-sm font-normal text-slate-500">/mo</span></div>
            <div className="mt-1 text-sm text-slate-600">{p.credits}</div>
            <div className="text-xs text-slate-400">{p.detail}</div>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Top up</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => pay(500)}>$5 → 5 credits</Button>
          <Button variant="outline" disabled={busy} onClick={() => pay(1000)}>$10 → 10 credits</Button>
          <Button variant="outline" disabled={busy} onClick={() => pay(2000)}>$20 → 20 credits</Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Balance: {balance === null ? '…' : `${balance} credits`}</p>
        <p className="text-xs text-slate-400 mt-1">1 credit = 10,000 tokens processed</p>
      </Card>

      {msg && <Card className="text-sm">{msg}</Card>}
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

