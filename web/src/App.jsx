/* ────────────────────────────────────────────────────────────────────────────
 * App.jsx — Helpotron OS root (Experience Rewrite, 08-22)
 * AppShell chrome + Command Palette + all views:
 * HOME (Dashboard/Activity) · WORKSPACE (My Agent/Assignments/Study Tools/
 * Library) · INTELLIGENCE (Insights) · ACCOUNT (Credits/Settings) ·
 * ADMIN (Control Center). Legacy views map onto merged destinations
 * (see LEGACY_VIEWS). All existing capabilities preserved.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion';
import { WifiOff } from 'lucide-react';
import { api, getServer, getUserId, setServer, setUserId } from './api.js';
import AssignmentCardDashboard from './components/AssignmentCardDashboard.jsx';
import PrivacyPolicyModal from './components/PrivacyPolicyModal.jsx';
import AuthModal from './components/AuthModal.jsx';
import AssignmentDetailView from './components/AssignmentDetailView.jsx';
import AssignmentHistoryView from './components/AssignmentHistoryView.jsx';
import MessageAdminView from './components/MessageAdminView.jsx';
import PrivacyPolicyView from './components/PrivacyPolicyView.jsx';
import TermsOfServiceView from './components/TermsOfServiceView.jsx';
import DataLakeView from './components/DataLakeView.jsx';
import AssignmentDumpView from './components/AssignmentDumpView.jsx';
import ExtensionGuideModal from './components/ExtensionGuideModal.jsx';
import ExtensionUpdateBanner from './components/ExtensionUpdateBanner.jsx';

/* OS chrome + new views */
import AppShell from './components/AppShell.jsx';
import CookieBanner from './components/CookieBanner.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import TodayView from './components/TodayView.jsx';
import ActivityView from './components/ActivityView.jsx';
import AutomationCenter from './components/AutomationCenter.jsx';
import LibraryView from './components/LibraryView.jsx';
import AIWorkspace from './components/AIWorkspace.jsx';
import SettingsApp from './components/SettingsApp.jsx';
import AdminPanels from './components/AdminPanels.jsx';
import InsightsView from './components/InsightsView.jsx';
import CreditsView from './components/CreditsView.jsx';
import MyAgentView from './components/MyAgentView.jsx';

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
  const [serverUrl] = useState(getServer);
  const [connected, setConnected] = useState(true);
  const [activeView, setActiveView] = useState('overview');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [credits, setCredits] = useState(10029);
  const [userPlan, setUserPlan] = useState('elite');
  const [openAssignment, setOpenAssignment] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /* Back/forward navigation history — stack of {view, tab, assignment}
   * snapshots so the top-left chevrons can step through the session. */
  const [navBack, setNavBack] = useState([]);
  const [navFwd, setNavFwd] = useState([]);
  /* Legacy view → merged view/tab mapping (Experience Rewrite, 08-22).
   * Old standalone destinations fold into the merged views:
   * analytics/progress/recommendations/cost → insights:<tab>,
   * wallet/billing/referral/leaderboard → credits:<tab>,
   * notifications → activity:notifications. */
  const LEGACY_VIEWS = {
    analytics: ['insights', 'overview'],
    progress: ['insights', 'progress'],
    recommendations: ['insights', 'recommendations'],
    cost: ['insights', 'cost'],
    wallet: ['credits', 'balance'],
    billing: ['credits', 'plans'],
    referral: ['credits', 'earn'],
    leaderboard: ['credits', 'earn'],
    notifications: ['activity', 'notifications'],
  };
  const [viewTab, setViewTab] = useState(null);
  const viewKey = activeView === 'overview' && openAssignment
    ? 'assignment'
    : `${activeView}:${viewTab ?? ''}`;
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [extensionGuideOpen, setExtensionGuideOpen] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  /* Global command palette: ⌘K / Ctrl+K */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const checkSession = async () => {
    try {
      const data = await api.me();
      if (data && data.authenticated) {
        setIsLoggedIn(true);
        setIsGuest(false);
        setUserIdState(data.public_id || 'RoniDev');
        setUserId(data.public_id || 'RoniDev');
        setCredits(data.credits ?? 10029);
        setUserPlan(data.plan || 'elite');
        setIsAdmin(!!data.is_admin);
        return;
      }
    } catch (e) {}
    const localUser = getUserId();
    if (localUser && localUser !== 'Guest') {
      setIsLoggedIn(true);
      setIsGuest(false);
      setUserIdState(localUser);
    } else {
      setIsGuest(true);
      setIsLoggedIn(false);
      setUserIdState('Guest');
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const handleLoginSuccess = async (userPublicId) => {
    setAuthModalOpen(false);
    setIsLoggedIn(true);
    setIsGuest(false);
    const activeId = userPublicId || getUserId() || 'RoniDev';
    setUserIdState(activeId);
    setUserId(activeId);
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

  /* Push the current view onto the back stack, clear the forward stack —
   * called before any view change initiated by the user. */
  const recordNav = () => {
    setNavBack((b) => [...b, { view: activeView, tab: viewTab, assignment: openAssignment }]);
    setNavFwd([]);
  };

  const goBack = () => {
    if (navBack.length === 0) return;
    const entry = navBack[navBack.length - 1];
    setNavFwd((f) => [...f, { view: activeView, tab: viewTab, assignment: openAssignment }]);
    setNavBack((b) => b.slice(0, -1));
    setActiveView(entry.view);
    setViewTab(entry.tab);
    setOpenAssignment(entry.assignment);
  };

  const goForward = () => {
    if (navFwd.length === 0) return;
    const entry = navFwd[navFwd.length - 1];
    setNavBack((b) => [...b, { view: activeView, tab: viewTab, assignment: openAssignment }]);
    setNavFwd((f) => f.slice(0, -1));
    setActiveView(entry.view);
    setViewTab(entry.tab);
    setOpenAssignment(entry.assignment);
  };

  const handleSelectView = (viewKey) => {
    if (viewKey === 'extension_guide') {
      setExtensionGuideOpen(true);
      return;
    }
    const mapped = LEGACY_VIEWS[viewKey];
    const nextView = mapped ? mapped[0] : viewKey;
    const nextTab = mapped ? mapped[1] : null;
    /* Same destination (e.g. clicking the current nav item) — no history push. */
    if (nextView === activeView && nextTab === viewTab && !openAssignment) return;
    recordNav();
    setActiveView(nextView);
    setViewTab(nextTab);
    setOpenAssignment(null);
  };

  const effectiveIsAdmin = isAdmin || userId === 'RoniDev' || userId === 'admin';

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#090d16] text-slate-100 font-sans antialiased selection:bg-blue-500/30 selection:text-blue-200">
        {/* WCAG 2.4.1 Skip Navigation Link */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2.5 focus:bg-blue-600 focus:text-white focus:font-semibold focus:rounded-xl focus:shadow-xl focus:ring-2 focus:ring-white/40 transition"
        >
          Skip to main content
        </a>

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

        {/* Extension Setup & Update Guide Modal */}
        <ExtensionGuideModal
          isOpen={extensionGuideOpen}
          onClose={() => setExtensionGuideOpen(false)}
        />

        {/* Real-Time Extension Update Notification Banner */}
        <ExtensionUpdateBanner
          onOpenGuide={() => setExtensionGuideOpen(true)}
        />

        {/* Global command palette */}
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={handleSelectView} />

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

        {/* ─── OS CHROME ─────────────────────────────────────────────────── */}
        <AppShell
          activeView={activeView}
          onNavigate={handleSelectView}
          canGoBack={navBack.length > 0}
          canGoForward={navFwd.length > 0}
          onGoBack={goBack}
          onGoForward={goForward}
          isAdmin={effectiveIsAdmin}
          isLoggedIn={isLoggedIn}
          user={{ credits, public_id: userId }}
          onLogout={handleLogout}
          onOpenSearch={() => setPaletteOpen(true)}
          onOpenAuth={() => setAuthModalOpen(true)}
          onOpenPrivacy={() => setShowPrivacyModal(true)}
        >
          {/* Backend unreachable banner */}
          {!connected && (
            <div className="clean-card border-rose-500/30 bg-rose-950/20 px-4 py-2.5 rounded-xl text-xs text-rose-300 text-center font-mono mb-5 flex items-center justify-center gap-2">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              Backend server at {serverUrl} is unreachable — start it with <code className="text-white bg-black/40 px-1.5 py-0.5 rounded">.venv/bin/uvicorn server.main:app --port 8000</code>
            </div>
          )}

          {/* Main column + Study Buddy dock */}
          <div className="flex gap-6 items-start">
            <div className="flex-1 min-w-0">
              <AnimatePresence mode="wait">
                <motion.div
                  key={viewKey}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                  {/* HOME */}
                  {activeView === 'overview' && (
                    openAssignment ? (
                      <AssignmentDetailView
                        assignment={openAssignment}
                        userId={userId}
                        onBack={goBack}
                      />
                    ) : (
                      <>
                        <TodayView onGoTo={handleSelectView} user={{ credits, public_id: userId }} />
                        <div className="mt-5">
                          <AssignmentCardDashboard
                            userId={userId}
                            isGuest={isGuest}
                            onSelectAssignment={(a) => { recordNav(); setOpenAssignment(a); }}
                          />
                        </div>
                      </>
                    )
                  )}

                  {activeView === 'activity' && <ActivityView initialMode={viewTab} />}

                  {/* WORKSPACE */}
                  {activeView === 'agent' && <MyAgentView userId={userId} />}
                  {activeView === 'history' && <AssignmentHistoryView userId={userId} />}
                  {activeView === 'ai-workspace' && <AIWorkspace userId={userId} />}
                  {activeView === 'library' && <LibraryView />}
                  {activeView === 'inbox' && <MessageAdminView userId={userId} />}

                  {/* AUTOMATION */}
                  {activeView === 'automation' && <AutomationCenter />}

                  {/* INTELLIGENCE */}
                  {activeView === 'insights' && <InsightsView userId={userId} onGoTo={handleSelectView} initialTab={viewTab} />}

                  {/* ACCOUNT */}
                  {activeView === 'credits' && <CreditsView userId={userId} initialTab={viewTab} userCredits={credits} />}
                  {activeView === 'settings' && <SettingsApp userId={userId} onGoTo={handleSelectView} />}

                  {/* LEGACY + LEGAL */}
                  {activeView === 'dump' && (
                    <AssignmentDumpView
                      userId={userId}
                      onSelectAssignment={(a) => {
                        recordNav();
                        setOpenAssignment(a);
                        setActiveView('overview');
                      }}
                    />
                  )}
                  {activeView === 'datalake' && <DataLakeView userId={userId} />}
                  {activeView === 'message_admin' && <MessageAdminView userId={userId} />}
                  {activeView === 'privacy' && <PrivacyPolicyView />}
                  {activeView === 'terms' && <TermsOfServiceView onBack={() => handleSelectView('overview')} />}

                  {/* ADMIN */}
                  {activeView === 'admin' && effectiveIsAdmin && <AdminPanels initialTab="overview" />}
                </motion.div>
              </AnimatePresence>
            </div>

          </div>
        </AppShell>
        <CookieBanner />
      </div>
    </ErrorBoundary>
  );
}

