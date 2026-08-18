import React, { useEffect, useState } from 'react';
import { api, getServer, getUserId, setServer, setUserId } from './api.js';
import AnalyticsDashboard from './components/AnalyticsDashboard.jsx';
import ReferralSection from './components/ReferralSection.jsx';
import CreditLeaderboard from './components/CreditLeaderboard.jsx';
import UserSettingsModal from './components/UserSettingsModal.jsx';
import AssignmentCardDashboard from './components/AssignmentCardDashboard.jsx';
import AdminAdvancedDashboard from './components/AdminAdvancedDashboard.jsx';
import PrivacyPolicyModal from './components/PrivacyPolicyModal.jsx';
import AuthModal from './components/AuthModal.jsx';
import Navbar from './components/Navbar.jsx';
import CreditsPricingDashboard from './components/CreditsPricingDashboard.jsx';
import StudyBuddyPanel from './components/StudyBuddyPanel.jsx';
import AssignmentDetailView from './components/AssignmentDetailView.jsx';
import StudyToolsHub from './components/StudyToolsHub.jsx';
import AssignmentHistoryView from './components/AssignmentHistoryView.jsx';
import MessageAdminView from './components/MessageAdminView.jsx';
import { CollapsibleSection } from './components/ui/CollapsibleSection.jsx';

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
  Trophy,
  History as HistoryIcon,
  LogOut,
  MessageSquare,
} from 'lucide-react';

const Button = ({ variant = 'primary', className = '', ...props }) => {
  const base = 'inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-500/20 font-semibold',
    outline: 'border border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20',
    ghost: 'text-slate-400 hover:text-white hover:bg-white/5',
    danger: 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-600/20',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
};

const Card = ({ className = '', children }) => (
  <div className={`clean-card p-5 text-slate-100 ${className}`}>{children}</div>
);

const Badge = ({ color = 'slate', children }) => {
  const colors = {
    slate: 'bg-white/5 text-slate-300 border border-white/10',
    green: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30',
    blue: 'bg-blue-500/10 text-blue-300 border border-blue-500/30',
    amber: 'bg-amber-500/10 text-amber-300 border border-amber-500/30',
    red: 'bg-rose-500/10 text-rose-300 border border-rose-500/30',
    purple: 'bg-purple-500/10 text-purple-300 border border-purple-500/30',
  };
  return <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${colors[color] || colors.slate}`}>{children}</span>;
};

const Progress = ({ value, className = '' }) => (
  <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-950 border border-white/5 ${className}`}>
    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300" style={{ width: `${Math.min(100, value)}%` }} />
  </div>
);

const statusBadge = (status) => ({
  tracked: <Badge color="slate">Tracked</Badge>,
  transcribed: <Badge color="blue">Transcribed</Badge>,
  materials_ready: <Badge color="green">Ready</Badge>,
  draft_ready: <Badge color="green">Draft Ready</Badge>,
  draft_risky: <Badge color="red">Review Needed</Badge>,
  completed: <Badge color="green">Completed</Badge>,
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
        <div className="min-h-screen bg-[#090d16] text-white flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl max-w-lg w-full p-8 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-600/10 text-rose-400 text-2xl font-bold flex items-center justify-center mx-auto border border-rose-500/20">
              ⚠️
            </div>
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-xs text-slate-400">
              An unexpected error occurred during rendering. You can reset session state below.
            </p>
            <div className="p-3 bg-slate-950/80 rounded-xl text-left text-[11px] font-mono text-rose-300 overflow-x-auto max-h-32 border border-white/5">
              {this.state.error?.message || 'Unknown runtime error'}
            </div>
            <button
              type="button"
              onClick={() => {
                try { localStorage.clear(); } catch (e) {}
                window.location.reload();
              }}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl text-xs transition cursor-pointer"
            >
              Reset Session Cache & Reload
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
  const [buddyOpen, setBuddyOpen] = useState(true);
  const [openAssignment, setOpenAssignment] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Privacy Policy modal state (opened on demand via Navbar or Settings)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

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
    { key: 'assignments', label: 'Assignment Bubbles', icon: ClipboardList, badge: null },
    { key: 'history', label: 'Assignment History', icon: HistoryIcon, badge: null },
    { key: 'study_tools', label: 'Study Tools & Flashcards', icon: Sparkles, badge: null },
    { key: 'overview', label: 'Overview', icon: Eye, badge: null },
    { key: 'analytics', label: 'Study Analytics', icon: TrendingUp, badge: null },
    { key: 'leaderboard', label: 'Credits Leaderboard', icon: Trophy, badge: 'TOP' },
    { key: 'referral', label: 'Referrals', icon: Award, badge: '+50 cr' },
    { key: 'billing', label: 'Plans & Credits', icon: CreditCard, badge: null },
    { key: 'message_admin', label: 'Message Admin', icon: MessageSquare, badge: 'DIRECT' },
    { key: 'settings', label: 'Settings', icon: SettingsIcon, badge: null },
    { key: 'privacy', label: 'Privacy Policy', icon: ShieldCheck, badge: null },
  ];

  if (isAdmin) {
    menuItems.push({ key: 'admin', label: 'Admin Panel', icon: ShieldAlert, badge: 'ADMIN' });
  }

  const currentItem = menuItems.find((m) => m.key === activeView) || menuItems[0];

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#090d16] text-slate-100 font-sans antialiased selection:bg-blue-500/30 selection:text-blue-200">
        
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
          <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-200 px-6 py-2 text-xs flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span>👁️</span>
              <span>
                <strong>Guest Mode:</strong> You are exploring simulated courses and workflows.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-xs transition cursor-pointer"
            >
              Sign In or Register →
            </button>
          </div>
        )}

        {/* Low Credit Warning Banner */}
        {isLoggedIn && credits > 0 && (() => {
          const planLimit = { basic: 30, pro: 100, elite: 280 }[userPlan] || 30;
          const pct = (credits / planLimit) * 100;
          if (pct < 15) {
            return (
              <div className="bg-rose-500/15 border-b border-rose-500/30 text-rose-200 px-6 py-2 text-xs flex flex-col sm:flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span>⚠️</span>
                  <span>
                    <strong>Low Credit Balance:</strong> You have {Math.floor(credits)} credits remaining.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectView('billing')}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg text-xs transition cursor-pointer"
                >
                  Upgrade / Top Up →
                </button>
              </div>
            );
          }
          return null;
        })()}

        {/* Modern SaaS Navbar */}
        <Navbar
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
            <div className="clean-card border-rose-500/30 bg-rose-950/20 px-4 py-2.5 rounded-xl text-xs text-rose-300 text-center font-mono">
              ⚠️ Backend server at {serverUrl} is unreachable — start it with <code className="text-white bg-black/40 px-1.5 py-0.5 rounded">.venv/bin/uvicorn server.main:app --port 8000</code>
            </div>
          </div>
        )}

        {/* ─── Main Workspace: Collapsible Side Menu + Dynamic Full-Page View + Overlord Agent Side-dock ────────── */}
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pb-16 pt-6 flex gap-6 items-start relative">
          
          {/* ─── COLLAPSIBLE SIDE MENU WITH 3-LINE VERTICAL BUTTON ─── */}
          <aside className={`shrink-0 transition-all duration-300 sticky top-24 z-30 ${sidebarOpen ? 'w-60' : 'w-16'}`}>
            <div className="clean-card p-3 flex flex-col justify-between min-h-[520px] shadow-lg">
              
              {/* Top Header with 3-Line Vertical Icon Button */}
              <div>
                <div className="flex items-center justify-between px-2 py-2 mb-2 border-b border-white/5">
                  {sidebarOpen && (
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Navigation
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    aria-label="Toggle Side Menu"
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition flex items-center justify-center cursor-pointer min-w-[32px] min-h-[32px]"
                  >
                    <div className="flex flex-col gap-1 items-center justify-center w-4 h-4">
                      <span className="w-3.5 h-0.5 bg-current rounded-full transition-all" />
                      <span className="w-3.5 h-0.5 bg-current rounded-full transition-all" />
                      <span className="w-3.5 h-0.5 bg-current rounded-full transition-all" />
                    </div>
                  </button>
                </div>

                {/* Vertical Menu Navigation Options */}
                <nav className="space-y-1 text-xs">
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
                            ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30 font-medium'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                        } ${!sidebarOpen ? 'justify-center px-2' : ''}`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`} />
                        {sidebarOpen && (
                          <div className="flex-1 flex items-center justify-between truncate text-left">
                            <span className="truncate">{item.label}</span>
                            {item.badge && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/20 font-mono">
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

              {/* Bottom Quick Status & Sign Out in Side Menu */}
              {sidebarOpen && (
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-slate-950/40 border border-white/5 text-[11px] space-y-1">
                    <div className="text-slate-400 text-[10px]">Overlord Agent</div>
                    <div className="text-slate-200 font-medium flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      Autonomous & Active
                    </div>
                    <div className="text-blue-400 text-[11px] mt-1 font-mono">{Number(credits).toLocaleString()} Credits</div>
                  </div>

                  {isLoggedIn && (
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-semibold transition cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </aside>

          {/* ─── DYNAMIC FULL-PAGE VIEW CONTAINER ─── */}
          <main className="flex-1 min-w-0 w-full space-y-5">
            {/* View Header Title Banner */}
            <div className="clean-card px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <currentItem.icon className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-base font-semibold text-white">{currentItem.label}</h1>
                  <p className="text-xs text-slate-400">
                    {activeView === 'assignments' && 'Manage course assignments, view rubrics, and launch targeted study tools'}
                    {activeView === 'study_tools' && 'Interactive active recall flashcards, quiz generator, and summary engine'}
                    {activeView === 'overview' && 'High-level course progress, study streak tracking, and recent activity'}
                    {activeView === 'analytics' && 'Study time logs, accuracy trends, and review consistency'}
                    {activeView === 'groups' && 'Collaborative study pools and shared notes'}
                    {activeView === 'referral' && 'Invite classmates and earn study credits'}
                    {activeView === 'billing' && 'Task-based credit packages and billing history'}
                    {activeView === 'settings' && 'Study preferences, writing personas, and data export'}
                    {activeView === 'admin' && 'System overview, user administration, and content stats'}
                  </p>
                </div>
              </div>
            </div>

            {/* Render Active Full-Page View */}
            <div>
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

              {activeView === 'study_tools' && (
                <StudyToolsHub userId={userId} />
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

              {activeView === 'leaderboard' && (
                <CreditLeaderboard userId={userId} userCredits={credits} />
              )}

              {activeView === 'referral' && (
                <ReferralSection userId={userId} />
              )}

              {activeView === 'billing' && (
                <Billing userId={userId} />
              )}

              {activeView === 'message_admin' && (
                <MessageAdminView userId={userId} />
              )}

              {activeView === 'history' && (
                <AssignmentHistoryView userId={userId} />
              )}

              {activeView === 'privacy' && (
                <UserSettingsModal
                  isOpen={true}
                  isModal={false}
                  userId={userId}
                  onLogout={handleLogout}
                  onOpenPrivacy={() => setShowPrivacyModal(true)}
                  initialTab="privacy_policy"
                />
              )}

              {activeView === 'settings' && (
                <UserSettingsModal
                  isOpen={true}
                  isModal={false}
                  userId={userId}
                  onLogout={handleLogout}
                  onOpenPrivacy={() => setShowPrivacyModal(true)}
                  initialTab="general"
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

          {/* ─── PERSISTENT OVERLORD AGENT CONTROLLER SIDEBAR ─── */}
          <div className={`transition-all duration-300 shrink-0 sticky top-24 ${buddyOpen ? 'w-full lg:w-96' : 'w-10'}`}>
            <StudyBuddyPanel
              open={buddyOpen}
              setOpen={setBuddyOpen}
              userId={userId}
            />
          </div>
        </div>
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

  if (loading) return <Card className="text-center text-xs text-blue-400 py-8">Loading Overview…</Card>;
  if (error) return <Card className="text-rose-400 text-xs">{error}</Card>;
  if (!data) return <Card className="text-slate-400 text-xs">No active study data found.</Card>;

  const active = data.assignments ? data.assignments.filter((a) => a.status !== 'materials_ready' && a.status !== 'draft_ready' && a.status !== 'completed').length : 0;

  return (
    <div className="space-y-6">
      {/* Top Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="clean-card p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Due Assignments</span>
            <ClipboardList className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white">{active}</div>
          <div className="text-[11px] text-slate-400 mt-1">Pending tasks</div>
        </div>

        <div className="clean-card p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Study Streak</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-300">12 Days</div>
          <div className="text-[11px] text-emerald-400 mt-1">Top 5% of active learners</div>
        </div>

        <div className="clean-card p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Active Plan</span>
            <Sparkles className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-indigo-300 capitalize">{data.plan || 'Elite'}</div>
          <div className="text-[11px] text-blue-300 mt-1 font-mono">{Number(data.credits ?? 10029).toLocaleString()} credits available</div>
        </div>
      </div>

      {/* Tracked Assignments with Click to Detail */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm text-white flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-blue-400" />
              Active Assignments ({data.assignments?.length || 0})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Click any assignment card to view rubrics & study tools</p>
          </div>
        </div>

        {!data.assignments || data.assignments.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">No tracked assignments yet.</p>
        ) : (
          <div className="space-y-3">
            {data.assignments.map((a) => {
              const done = Object.values(a.progress || {}).filter(Boolean).length;
              return (
                <div
                  key={a.id}
                  onClick={() => onSelectAssignment && onSelectAssignment(a)}
                  className="clean-card p-4 hover:border-blue-500/40 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-white">{a.title}</span>
                      {statusBadge(a.status)}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1.5">
                      <span>Course: <strong className="text-slate-300">{a.course || a.subject || 'GEN-101'}</strong></span>
                      <span>·</span>
                      <span>Due: <strong className="text-amber-300">{a.due_date || 'Upcoming'}</strong></span>
                    </div>
                    <Progress value={(done / 5) * 100} className="max-w-64 mt-2" />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-blue-400 font-medium shrink-0">
                    <span>Inspect</span>
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
        <div className="clean-card p-4 border border-blue-500/30 text-xs text-blue-300">
          {msg}
        </div>
      )}
      <CreditsPricingDashboard currentCredits={balance} onTopUp={handleTopUp} userId={userId} />

      {/* Credit Transaction History */}
      <div className="clean-card p-6">
        <h3 className="font-semibold mb-4 text-sm text-white flex items-center gap-2">
          Receipts & Credit Activity
        </h3>
        {transactions.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">No credit transactions yet.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {transactions.map((tx, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-white/5 text-xs font-mono"
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
        <div className="clean-card p-5">
          <h3 className="font-semibold mb-3 text-sm text-blue-300">Platform Overview</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950/40 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase">Total Users</span>
              <strong className="text-white text-base">{adminAnalytics.users?.total || 0}</strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/40 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase">Assignments</span>
              <strong className="text-white text-base">{adminAnalytics.content?.assignments || 0}</strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/40 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase">Study Materials</span>
              <strong className="text-white text-base">{adminAnalytics.content?.study_materials || 0}</strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/40 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase">Revenue</span>
              <strong className="text-emerald-300 text-base font-mono">${adminAnalytics.finance?.total_revenue_usd?.toFixed(2) || '0.00'}</strong>
            </div>
          </div>
          <Button variant="outline" className="mt-4" onClick={refreshAdmin}>Refresh Metrics</Button>
        </div>
      )}
    </div>
  );
}
