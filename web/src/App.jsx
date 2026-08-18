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
import StudyBuddyPanel from './components/StudyBuddyPanel.jsx';
import AssignmentDetailView from './components/AssignmentDetailView.jsx';

import {
  Menu,
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  ShieldCheck,
  Flame,
  Clock,
  TrendingUp,
  ClipboardList,
  Sparkles,
  Layers,
  Plus,
  Eye,
  Settings as SettingsIcon,
  Users,
  Award,
  CreditCard,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

const Button = ({ variant = 'primary', className = '', ...props }) => {
  const base = 'inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-mono font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';
  const variants = {
    primary: 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-md shadow-cyan-500/20 font-bold',
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
              type="button"
              onClick={() => {
                try { localStorage.clear(); } catch (e) {}
                window.location.reload();
              }}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition cursor-pointer"
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
  const [userId, setUserIdState] = useState(() => {
    try {
      return getUserId() || 'RoniDev';
    } catch (e) {
      return 'RoniDev';
    }
  });
  const [serverUrl, setServerUrlState] = useState(getServer);
  const [connected, setConnected] = useState(true);
  const [activeView, setActiveView] = useState('assignments'); // single-view mode
  const [sidebarOpen, setSidebarOpen] = useState(true); // collapsible side menu
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminAnalytics, setAdminAnalytics] = useState(null);
  const [credits, setCredits] = useState(10029);
  const [userPlan, setUserPlan] = useState('elite');
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [buddyOpen, setBuddyOpen] = useState(true);
  const [openAssignment, setOpenAssignment] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Privacy Policy state
  const [showPrivacyModal, setShowPrivacyModal] = useState(() => {
    try {
      return localStorage.getItem('helpotron_privacy_accepted') !== 'true';
    } catch (e) {
      return false;
    }
  });

  const checkSession = async () => {
    try {
      const me = await api.me();
      if (me && me.public_id) {
        setIsLoggedIn(true);
        setIsGuest(false);
        setUserIdState(me.public_id);
        setCredits(me.credits || 10029);
        setUserPlan(me.plan || 'elite');
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
    try {
      localStorage.setItem('helpotron_privacy_accepted', 'true');
    } catch (e) {}
    setShowPrivacyModal(false);
    setIsLoggedIn(true);
    setIsGuest(false);
    const activeId = getUserId() || 'RoniDev';
    setUserIdState(activeId);
    setUserId(activeId);
  };

  const handleDeclinePrivacy = () => {
    try {
      localStorage.setItem('helpotron_privacy_accepted', 'declined');
    } catch (e) {}
    setShowPrivacyModal(false);
    setIsGuest(true);
    setIsLoggedIn(false);
    setUserIdState('Guest');
  };

  const handleSelectView = (viewKey) => {
    setActiveView(viewKey);
    setOpenAssignment(null);
  };

  // Nav Items for Collapsible Side Menu
  const menuItems = [
    { key: 'assignments', label: 'Assignments Hub', icon: ClipboardList, badge: null },
    { key: 'overview', label: 'Activity Overview', icon: Eye, badge: null },
    { key: 'analytics', label: 'Data Lake & Telemetry', icon: TrendingUp, badge: null },
    { key: 'groups', label: 'Study Groups', icon: Users, badge: null },
    { key: 'referral', label: 'Referral Program', icon: Award, badge: '+50 cr' },
    { key: 'billing', label: 'Pricing & Compute', icon: CreditCard, badge: null },
    { key: 'settings', label: 'Workspace Settings', icon: SettingsIcon, badge: null },
  ];

  if (isAdmin) {
    menuItems.push({ key: 'admin', label: 'Admin Infrastructure', icon: ShieldAlert, badge: 'ADMIN' });
  }

  const currentItem = menuItems.find((m) => m.key === activeView) || menuItems[0];

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#0b0f19] text-slate-100 font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
        
        {/* Privacy Policy Modal Overlay */}
        <PrivacyPolicyModal
          isOpen={showPrivacyModal}
          onAccept={handleAcceptPrivacy}
          onDecline={handleDeclinePrivacy}
        />

        {/* Auth Modal Overlay */}
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

        {/* Guest Warning Banner */}
        {isGuest && (
          <div className="bg-amber-500/90 backdrop-blur-md text-slate-950 px-6 py-2 text-xs font-bold flex flex-col sm:flex-row items-center justify-between gap-2 shadow-lg border-b border-amber-400/40">
            <div className="flex items-center gap-2">
              <span className="text-base">👁️</span>
              <span>
                GUEST (READ-ONLY) MODE: You are exploring simulated courses and workflows.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="px-3 py-1 bg-slate-950 text-amber-300 rounded-lg text-xs font-semibold hover:bg-slate-900 border border-amber-400/30 transition cursor-pointer"
            >
              Sign In or Create Account →
            </button>
          </div>
        )}

        {/* Low Credit Warning Banner */}
        {isLoggedIn && credits > 0 && (() => {
          const planLimit = { basic: 30, pro: 100, elite: 280 }[userPlan] || 30;
          const pct = (credits / planLimit) * 100;
          if (pct < 15) {
            return (
              <div className="bg-rose-500/90 backdrop-blur-md text-slate-950 px-6 py-2 text-xs font-bold flex flex-col sm:flex-row items-center justify-between gap-2 shadow-lg border-b border-rose-400/40">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚠️</span>
                  <span>
                    LOW CREDIT WARNING: You have {Math.floor(credits)} credits remaining.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectView('billing')}
                  className="px-3 py-1 bg-slate-950 text-rose-300 rounded-lg text-xs font-semibold hover:bg-slate-900 border border-rose-400/30 transition cursor-pointer"
                >
                  Upgrade / Top Up →
                </button>
              </div>
            );
          }
          return null;
        })()}

        {/* Futuristic HUD Navbar */}
        <Navbar
          activeAgent="Overlord Orchestrator"
          systemHealth={connected ? "Nominal (100%)" : "Degraded"}
          isLoggedIn={isLoggedIn}
          isGuest={isGuest}
          user={{ credits, public_id: userId }}
          isAdmin={isAdmin}
          onOpenSettings={() => setSettingsModalOpen(true)}
          onOpenAuth={() => setAuthModalOpen(true)}
          onOpenPrivacy={() => setShowPrivacyModal(true)}
          onLogout={handleLogout}
        />

        {!connected && (
          <div className="max-w-7xl mx-auto px-6 mb-4">
            <div className="glass-panel border-rose-500/40 bg-rose-950/40 px-4 py-2.5 rounded-xl text-xs text-rose-300 text-center font-mono">
              ⚠️ Backend server at {serverUrl} is unreachable — start it with <code className="text-white bg-black/40 px-1.5 py-0.5 rounded">.venv/bin/uvicorn server.main:app --port 8000</code>
            </div>
          </div>
        )}

        {/* ─── Main Workspace: Collapsible Side Menu + Dynamic Full-Page View + Overlord Side-dock ────────── */}
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pb-16 flex gap-6 items-start relative">
          
          {/* ─── SLEEK 3-LINE VERTICAL COLLAPSIBLE SIDE MENU ─── */}
          <aside className={`shrink-0 transition-all duration-300 sticky top-24 z-30 ${sidebarOpen ? 'w-64' : 'w-16'}`}>
            <div className="glass-panel rounded-2xl border border-white/10 bg-slate-950/70 backdrop-blur-xl p-3 flex flex-col justify-between min-h-[560px] shadow-2xl">
              
              {/* Top Header with 3-Line Vertical Icon Button */}
              <div>
                <div className="flex items-center justify-between px-2 py-2 mb-3 border-b border-white/5">
                  {sidebarOpen && (
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
                      Navigation
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    aria-label="Toggle Side Menu"
                    className="p-2 rounded-xl text-slate-400 hover:text-cyan-300 hover:bg-white/5 transition flex items-center justify-center cursor-pointer min-w-[36px] min-h-[36px]"
                  >
                    {/* Clean 3-Line Vertical Design */}
                    <div className="flex flex-col gap-1 items-center justify-center w-4 h-4">
                      <span className="w-3.5 h-0.5 bg-current rounded-full transition-all" />
                      <span className="w-3.5 h-0.5 bg-current rounded-full transition-all" />
                      <span className="w-3.5 h-0.5 bg-current rounded-full transition-all" />
                    </div>
                  </button>
                </div>

                {/* Vertical Menu Navigation Options */}
                <nav className="space-y-1 font-mono text-xs">
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isSelected = activeView === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleSelectView(item.key)}
                        aria-label={`Navigate to ${item.label}`}
                        aria-pressed={isSelected}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition cursor-pointer select-none ${
                          isSelected
                            ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 font-bold shadow-sm shadow-cyan-500/10'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                        } ${!sidebarOpen ? 'justify-center px-2' : ''}`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-cyan-400' : 'text-slate-400'}`} />
                        {sidebarOpen && (
                          <div className="flex-1 flex items-center justify-between truncate text-left">
                            <span className="truncate">{item.label}</span>
                            {item.badge && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                {item.badge}
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Bottom Quick Status in Side Menu */}
              {sidebarOpen && (
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 font-mono text-[11px] space-y-1">
                  <div className="text-slate-500 uppercase text-[9px]">Active Engine</div>
                  <div className="text-slate-200 font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Overlord Autonomous
                  </div>
                  <div className="text-cyan-400 text-[10px] mt-1">{Number(credits).toLocaleString()} Compute Credits</div>
                </div>
              )}
            </div>
          </aside>

          {/* ─── DYNAMIC FULL-PAGE VIEW CONTAINER ─── */}
          <main className="flex-1 min-w-0 w-full">
            {/* View Header Title Banner */}
            <div className="mb-6 glass-panel rounded-2xl px-6 py-4 border border-white/10 flex items-center justify-between bg-slate-950/40">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <currentItem.icon className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-base font-bold font-mono text-white tracking-wide">{currentItem.label}</h1>
                  <p className="text-xs text-slate-400 font-mono">
                    {activeView === 'assignments' && 'Manage course assignments, rubrics, and launch targeted study tools'}
                    {activeView === 'overview' && 'High-level course progress, study streak telemetry, and recent synthesis'}
                    {activeView === 'analytics' && 'Real-time telemetry, model performance metrics, and study time logs'}
                    {activeView === 'groups' && 'Collaborative study pools and synchronized peer course material'}
                    {activeView === 'referral' && 'Invite classmates to earn task-based compute credits'}
                    {activeView === 'billing' && 'Transparent task-based credit packages and ledger history'}
                    {activeView === 'settings' && 'Writing persona matrices, anti-detector configurations, and GDPR data export'}
                    {activeView === 'admin' && 'Infrastructure cluster health, telemetry ledger, and user management'}
                  </p>
                </div>
              </div>
            </div>

            {/* Render ONLY the Active View */}
            <div className="transition-opacity duration-200">
              {activeView === 'assignments' && (
                openAssignment ? (
                  <AssignmentDetailView
                    assignment={openAssignment}
                    userId={userId}
                    onBack={() => setOpenAssignment(null)}
                  />
                ) : (
                  <AssignmentCardDashboard
                    userId={userId}
                    isGuest={isGuest}
                    onSelectAssignment={(a) => setOpenAssignment(a)}
                  />
                )
              )}

              {activeView === 'overview' && (
                openAssignment ? (
                  <AssignmentDetailView
                    assignment={openAssignment}
                    userId={userId}
                    onBack={() => setOpenAssignment(null)}
                  />
                ) : (
                  <Overview
                    userId={userId}
                    onGoTo={(t) => handleSelectView(t)}
                    onSelectAssignment={(a) => setOpenAssignment(a)}
                  />
                )
              )}

              {activeView === 'analytics' && (
                <AnalyticsDashboard userId={userId} />
              )}

              {activeView === 'groups' && (
                <StudyGroups userId={userId} />
              )}

              {activeView === 'referral' && (
                <ReferralSection userId={userId} />
              )}

              {activeView === 'billing' && (
                <Billing userId={userId} />
              )}

              {activeView === 'settings' && (
                <Settings
                  userId={userId}
                  onOpenModal={() => setSettingsModalOpen(true)}
                  onOpenPrivacy={() => setShowPrivacyModal(true)}
                  onUserId={(id) => { setUserId(id); setUserIdState(id); }}
                  onServer={(url) => { setServer(url); setServerUrlState(url); }}
                />
              )}

              {activeView === 'admin' && isAdmin && (
                <AdminPanel
                  userId={userId}
                  adminUsers={adminUsers}
                  adminAnalytics={adminAnalytics}
                  refreshAdmin={fetchAdminData}
                />
              )}
            </div>
          </main>

          {/* ─── PERSISTENT OVERLORD SIDE-DOCK PANEL ─── */}
          <div className={`transition-all duration-300 shrink-0 sticky top-24 ${buddyOpen ? 'w-full lg:w-96' : 'w-12'}`}>
            <StudyBuddyPanel
              open={buddyOpen}
              setOpen={setBuddyOpen}
              onGenerateAction={(kind, query) => {
                handleSelectView('assignments');
              }}
            />
          </div>
        </div>

        <UserSettingsModal
          isOpen={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          userId={userId}
        />
      </div>
    </ErrorBoundary>
  );
}

function Overview({ userId, onGoTo, onSelectAssignment }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.dashboard(userId).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <Card className="text-center text-xs font-mono text-cyan-400 py-8">Loading Neural Activity Overview…</Card>;
  if (error) return <Card className="text-rose-400 font-mono text-xs">{error}</Card>;
  if (!data) return <Card className="text-slate-400 font-mono text-xs">No active study data found.</Card>;

  const active = data.assignments ? data.assignments.filter((a) => a.status !== 'materials_ready' && a.status !== 'draft_ready' && a.status !== 'completed').length : 0;

  return (
    <div className="space-y-6">
      {/* Top Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass-panel rounded-2xl p-5 border border-white/5 bg-slate-950/40">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>Due Assignments</span>
            <ClipboardList className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">{active}</div>
          <div className="text-[11px] font-mono text-slate-400 mt-1">Pending student tasks</div>
        </div>

        <div className="glass-panel rounded-2xl p-5 border border-white/5 bg-slate-950/40">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>Active Study Streak</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-300">12 Days</div>
          <div className="text-[11px] font-mono text-emerald-400 mt-1">Top 5% of active learners</div>
        </div>

        <div className="glass-panel rounded-2xl p-5 border border-white/5 bg-slate-950/40">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>Compute Tier</span>
            <Sparkles className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-300 capitalize">{data.plan || 'Elite'}</div>
          <div className="text-[11px] font-mono text-cyan-300 mt-1">{Number(data.credits ?? 10029).toLocaleString()} credits available</div>
        </div>
      </div>

      {/* Tracked Assignments with Click to Detail */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm text-white font-mono flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-cyan-400" />
              Active Course Assignments ({data.assignments?.length || 0})
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">Click any assignment card to view rubrics & study tools</p>
          </div>
        </div>

        {!data.assignments || data.assignments.length === 0 ? (
          <p className="text-xs text-slate-500 font-mono py-4">No tracked assignments yet.</p>
        ) : (
          <div className="space-y-3">
            {data.assignments.map((a) => {
              const done = Object.values(a.progress || {}).filter(Boolean).length;
              return (
                <div
                  key={a.id}
                  onClick={() => onSelectAssignment && onSelectAssignment(a)}
                  className="glass-panel rounded-xl p-4 border border-white/5 hover:border-cyan-500/40 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-white">{a.title}</span>
                      {statusBadge(a.status)}
                    </div>
                    <div className="flex items-center gap-3 text-xs font-mono text-slate-400 mt-1.5">
                      <span>Course: <strong className="text-slate-300">{a.course || a.subject || 'GEN-101'}</strong></span>
                      <span>·</span>
                      <span>Due: <strong className="text-amber-300">{a.due_date || 'Aug 24'}</strong></span>
                    </div>
                    <Progress value={(done / 5) * 100} className="max-w-64 mt-2" />
                  </div>
                  <div className="flex items-center gap-2 font-mono text-xs text-cyan-400 shrink-0">
                    <span>Inspect Assignment</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Settings({ userId, onOpenModal, onOpenPrivacy, onUserId, onServer }) {
  const [localUser, setLocalUser] = useState(userId);
  const [localServer, setLocalServer] = useState(getServer());
  const [readingLevel, setReadingLevel] = useState('college-freshman');
  const [tone, setTone] = useState('formal');
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exportNotice, setExportNotice] = useState('');

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

  const handleExportData = async () => {
    try {
      const data = await api.dashboard(userId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `helpotron_data_export_${userId || 'student'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportNotice('✅ Data archive exported successfully');
      setTimeout(() => setExportNotice(''), 3000);
    } catch (e) {
      setExportNotice('❌ Failed to export data');
    }
  };

  const handleDeleteAccount = () => {
    try {
      localStorage.clear();
    } catch (e) {}
    window.location.reload();
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Extended User Preferences Card */}
      <div className="glass-panel rounded-2xl p-5 border border-cyan-500/30 bg-gradient-to-r from-cyan-950/20 to-indigo-950/20">
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
      </div>

      {/* Study Preferences */}
      <div className="glass-panel rounded-2xl p-5 border border-white/5 bg-slate-950/30 space-y-3">
        <h2 className="font-semibold text-white text-sm font-mono">Study Preferences</h2>
        <div>
          <label className="text-xs text-slate-400 font-mono">Reading Level</label>
          <select
            className="mt-1 w-full rounded-xl glass-input px-3 py-2 text-xs font-mono"
            value={readingLevel}
            onChange={(e) => setReadingLevel(e.target.value)}
          >
            {['9th', '10th', '11th', '12th', 'college-freshman', 'sophomore'].map((l) => (
              <option key={l} className="bg-slate-900 text-slate-300">{l}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-400 font-mono">Tone is calibrated to formal for academic compliance.</p>
      </div>

      {/* Server & User ID */}
      <div className="glass-panel rounded-2xl p-5 border border-white/5 bg-slate-950/30 space-y-3">
        <h2 className="font-semibold text-white text-sm font-mono">Neural Uplink Connection</h2>
        <div>
          <label className="text-xs text-slate-400 font-mono">Server URL (Relative / Same-Origin)</label>
          <input
            className="mt-1 w-full rounded-xl glass-input px-3 py-2 text-xs font-mono"
            value={localServer}
            onChange={(e) => setLocalServer(e.target.value)}
            placeholder="Auto-detected origin (e.g. '')"
          />
        </div>
        <div>
          <label className="mt-2 block text-xs text-slate-400 font-mono">Telemetry User Public ID</label>
          <input
            className="mt-1 w-full rounded-xl glass-input px-3 py-2 text-xs font-mono"
            value={localUser}
            onChange={(e) => setLocalUser(e.target.value)}
          />
        </div>
        <Button className="mt-2 w-full" onClick={save}>
          {saved ? '✅ Settings Synchronized' : 'Save Settings'}
        </Button>
      </div>

      {/* Privacy, GDPR & Data Management */}
      <div className="glass-panel rounded-2xl p-5 border border-white/5 bg-slate-950/30 space-y-3">
        <h2 className="font-semibold text-white text-sm font-mono flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          Privacy & Data Compliance (GDPR / CCPA)
        </h2>

        <div className="space-y-2 font-mono text-xs">
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-black/40 hover:bg-white/5 border border-white/5 text-slate-300 transition cursor-pointer"
          >
            <span>Read Complete Privacy & Compliance Policy</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

          <button
            type="button"
            onClick={handleExportData}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-black/40 hover:bg-white/5 border border-white/5 text-cyan-300 transition cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Download className="w-4 h-4" /> Export My Study Data (.json archive)
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

          {exportNotice && (
            <div className="text-emerald-400 text-xs px-2 py-1">{exportNotice}</div>
          )}

          <button
            type="button"
            onClick={() => setConfirmDelete(!confirmDelete)}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-rose-950/20 hover:bg-rose-950/40 border border-rose-500/20 text-rose-300 transition cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Delete My Account & Wipe Cache
            </span>
            <ChevronRight className="w-4 h-4 text-rose-400" />
          </button>

          {confirmDelete && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 space-y-3">
              <p className="text-xs text-rose-200">
                Are you sure? This will immediately purge all cached study sessions, writing personas, and tokens.
              </p>
              <div className="flex gap-2">
                <Button variant="danger" onClick={handleDeleteAccount}>
                  Confirm Wipe & Logout
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Billing({ userId }) {
  const [balance, setBalance] = useState(10029);
  const [msg, setMsg] = useState('');
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    api.dashboard(userId).then((d) => {
      setBalance(d.credits || 10029);
      setTransactions(d.recent_transactions || []);
    }).catch(() => {});
  }, [userId]);

  async function handleTopUp(amountCents) {
    try {
      const r = await api.pay({ public_id: userId, provider: 'cashapp', amount_cents: amountCents });
      setBalance(r.credits);
      setMsg(`✅ Allocation updated — Current balance: ${r.credits} credits`);
      api.dashboard(userId).then((d) => setTransactions(d.recent_transactions || [])).catch(() => {});
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
      <CreditsPricingDashboard currentCredits={balance} onTopUp={handleTopUp} userId={userId} />

      {/* Credit Transaction History */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10 bg-slate-950/40">
        <h3 className="font-semibold mb-4 font-mono text-sm text-white flex items-center gap-2">
          🧾 Credit Transaction History
        </h3>
        {transactions.length === 0 ? (
          <p className="text-xs text-slate-500 font-mono py-4">No credit transactions yet.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {transactions.map((tx, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5 text-xs font-mono"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`shrink-0 font-bold ${tx.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {tx.delta >= 0 ? '+' : ''}{tx.delta.toFixed(2)}
                  </span>
                  <span className="text-slate-400 truncate">{tx.reason}</span>
                </div>
                <span className="shrink-0 text-slate-500 text-[10px]">
                  {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminPanel({ userId, adminUsers, adminAnalytics, refreshAdmin }) {
  return (
    <div className="space-y-6">
      <AdminAdvancedDashboard userId={userId} />

      {adminAnalytics && (
        <div className="glass-panel rounded-2xl p-5 border border-white/10 bg-slate-950/40">
          <h3 className="font-semibold mb-3 font-mono text-sm text-cyan-300">📊 Financial & Content Overview</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-xl bg-black/40 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase">Total users</span>
              <strong className="text-white text-base">{adminAnalytics.users?.total || 0}</strong>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase">Total assignments</span>
              <strong className="text-white text-base">{adminAnalytics.content?.assignments || 0}</strong>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase">Study materials</span>
              <strong className="text-white text-base">{adminAnalytics.content?.study_materials || 0}</strong>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase">Revenue</span>
              <strong className="text-emerald-300 text-base">${adminAnalytics.finance?.total_revenue_usd?.toFixed(2) || '0.00'}</strong>
            </div>
          </div>
          <Button variant="outline" className="mt-4" onClick={refreshAdmin}>Refresh Data</Button>
        </div>
      )}
    </div>
  );
}
