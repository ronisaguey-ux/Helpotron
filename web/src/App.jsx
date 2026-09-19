/* ────────────────────────────────────────────────────────────────────────────
 * App.jsx — Helpotron OS root (Experience Rewrite, 08-22)
 * AppShell chrome + Command Palette + all views:
 * HOME (Dashboard/Activity) · WORKSPACE (My Agent/Assignments/Study Tools/
 * Library) · INTELLIGENCE (Insights) · ACCOUNT (Credits/Settings) ·
 * ADMIN (Control Center). Legacy views map onto merged destinations
 * (see LEGACY_VIEWS). All existing capabilities preserved.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { WifiOff } from 'lucide-react';
import { api, getServer, getUserId, hasSessionIndicator, setServer, setUserId } from './api.js';

/* ── EAGER: the signed-out critical path only ────────────────────────────────
 * Perf audit 08-29: App.jsx used to statically import all 30 views, so an
 * anonymous visitor downloaded and parsed the entire authenticated product
 * — admin control center included — to render a marketing page. That was
 * 667 KB of app JS before a single pixel. Only what a logged-out visitor can
 * actually see stays eager; everything behind the auth gate is lazy() below
 * and lands in its own chunk, fetched the moment the session resolves. */
import AnonymousLanding from './components/AnonymousLanding.jsx';
import AuthModal from './components/AuthModal.jsx';
import SessionExpiryModal, { Session401Banner } from './components/SessionExpiryModal.jsx';
import NotFound from './components/NotFound.jsx';
import PrivacyPolicyModal from './components/PrivacyPolicyModal.jsx';
import { AnimatedLogo } from './components/ui/AnimatedLogo.jsx';
import { ToastContainer, OfflineBanner } from './components/ui/index.js';

/* ── LAZY: with automatic chunk retry for seamless zero-downtime updates ── */
function lazyWithRetry(componentImport) {
  return lazy(async () => {
    try {
      const component = await componentImport();
      sessionStorage.removeItem('helpotron.chunk_retry');
      return component;
    } catch (error) {
      console.warn('Lazy chunk load failed, checking for deployment update...', error);
      const hasRefreshed = sessionStorage.getItem('helpotron.chunk_retry');
      if (!hasRefreshed) {
        sessionStorage.setItem('helpotron.chunk_retry', 'true');
        window.location.reload();
        return new Promise(() => {}); // Wait for reload
      }
      sessionStorage.removeItem('helpotron.chunk_retry');
      throw error;
    }
  });
}

const AppShell = lazyWithRetry(() => import('./components/AppShell.jsx'));
const CookieBanner = lazyWithRetry(() => import('./components/CookieBanner.jsx'));
const AdminNoticePopup = lazyWithRetry(() => import('./components/ui/AdminNoticePopup.jsx'));
const QueueNoticeBanner = lazyWithRetry(() => import('./components/QueueNoticeBanner.jsx'));
const CommandPalette = lazyWithRetry(() => import('./components/CommandPalette.jsx'));

const AssignmentCardDashboard = lazyWithRetry(() => import('./components/AssignmentCardDashboard.jsx'));
const AssignmentDetailView = lazyWithRetry(() => import('./components/AssignmentDetailView.jsx'));
const AssignmentHistoryView = lazyWithRetry(() => import('./components/AssignmentHistoryView.jsx'));
const AssignmentDumpView = lazyWithRetry(() => import('./components/AssignmentDumpView.jsx'));
const GuideView = lazyWithRetry(() => import('./components/GuideView.jsx'));
const MessageAdminView = lazyWithRetry(() => import('./components/MessageAdminView.jsx'));
const PrivacyPolicyView = lazyWithRetry(() => import('./components/PrivacyPolicyView.jsx'));
const TermsOfServiceView = lazyWithRetry(() => import('./components/TermsOfServiceView.jsx'));
const DataLakeView = lazyWithRetry(() => import('./components/DataLakeView.jsx'));
const MonitorsView = lazyWithRetry(() => import('./components/MonitorsView.jsx'));
const ExtensionInstallView = lazyWithRetry(() => import('./components/ExtensionInstallView.jsx'));
const ActivityView = lazyWithRetry(() => import('./components/ActivityView.jsx'));
const AutomationCenter = lazyWithRetry(() => import('./components/AutomationCenter.jsx'));
const LibraryView = lazyWithRetry(() => import('./components/LibraryView.jsx'));
const SettingsApp = lazyWithRetry(() => import('./components/SettingsApp.jsx'));
const ControlCenterView = lazyWithRetry(() => import('./components/ControlCenterView.jsx'));
const InsightsView = lazyWithRetry(() => import('./components/InsightsView.jsx'));
const CreditsView = lazyWithRetry(() => import('./components/CreditsView.jsx'));
const MyAgentView = lazyWithRetry(() => import('./components/MyAgentView.jsx'));
const NotificationsView = lazyWithRetry(() => import('./components/NotificationsView.jsx'));

/* Shown while a lazy view chunk is in flight. Deliberately quiet — a spinner
 * that flashes for 80ms reads as jank, a dimmed placeholder does not. */
function ViewSuspenseFallback() {
  return (
    <div className="py-20 text-center text-xs text-[var(--text-muted)] animate-pulse">
      Loading…
    </div>
  );
}

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
    if (
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('ChunkLoadError') ||
      error?.message?.includes('Loading chunk')
    ) {
      const hasReloaded = sessionStorage.getItem('helpotron.chunk_reload');
      if (!hasReloaded) {
        sessionStorage.setItem('helpotron.chunk_reload', 'true');
        window.location.reload();
      }
    }
  }
  render() {
    if (this.state.hasError) {
      const isChunkError = this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.message?.includes('ChunkLoadError');
      return (
        <div className="app-background min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex items-center justify-center p-4">
          <div className="clean-card max-w-lg w-full p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-600/10 text-rose-400 text-2xl font-bold flex items-center justify-center mx-auto border border-rose-500/20">
              ⚠️
            </div>
            <h2 className="text-lg font-semibold">
              {isChunkError ? 'New Version Available' : 'Something went wrong'}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {isChunkError
                ? 'A newer version of the web app was published. Please reload to load the latest components.'
                : 'An unexpected error occurred during rendering. You can reset session state below.'}
            </p>
            <div className="p-3 bg-[var(--bg-surface)] rounded-[var(--radius-md)] text-left text-[11px] font-mono text-rose-300 overflow-x-auto max-h-32 border border-[var(--border-subtle)]">
              {this.state.error?.message || 'Unknown runtime error'}
            </div>
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem('helpotron.chunk_reload');
                sessionStorage.removeItem('helpotron.chunk_retry');
                window.location.reload();
              }}
              className="w-full py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium rounded-[var(--radius-sm)] text-xs transition cursor-pointer"
            >
              Reload Latest App Version
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* Pre-auth boot screen (auth gate 08-28): shown only while the session probe
 * is in flight. The dashboard never mounts before the auth state is known. */
function SessionBootScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-5">
        <AnimatedLogo size="lg" />
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] font-mono">
          <span className="w-3 h-3 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          Checking session…
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [userId, setUserIdState] = useState(() => {
    try {
      return getUserId() || 'Guest';
    } catch (e) {
      return 'Guest';
    }
  });
  const [serverUrl] = useState(getServer);
  const [connected, setConnected] = useState(true);
  const [activeView, setActiveView] = useState('overview');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  /* Auth gate (audit 08-28): three states —
   *   'checking'  — session probe in flight (indicator present, needs /api/me)
   *   'authed'    — session confirmed; only now does the shell mount
   *   'signedOut' — no session; anonymous landing only, zero authed fetches
   * The initializer runs synchronously: when no session indicator exists
   * (fresh/logged-out browser) the /api/me probe is skipped ENTIRELY, so a
   * signed-out visit causes no 401 console noise at all. */
  const [authStatus, setAuthStatus] = useState(() => (hasSessionIndicator() ? 'checking' : 'signedOut'));
  const [isGuest, setIsGuest] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [credits, setCredits] = useState(0);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [userPlan, setUserPlan] = useState('none');
  // 09-01: elite/admin users bypass the token gate server-side — the top bar
  // must render "Unlimited" usage, never "0 tokens" (owner report: RoniDev).
  const [userUnlimited, setUserUnlimited] = useState(false);
  const [openAssignment, setOpenAssignment] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /* Back/forward navigation history — stack of {view, tab, assignment}
   * snapshots so the top-left chevrons can step through the session. */
  const [navBack, setNavBack] = useState([]);
  const [navFwd, setNavFwd] = useState([]);
  /* Legacy view → merged view/tab mapping (Experience Rewrite, 08-22).
   * Old standalone destinations fold into the merged views:
   * analytics/progress/recommendations → insights:<tab>,
   * wallet/billing/referral/leaderboard/cost → credits:<tab>,
   * notifications → activity:notifications, ai-workspace → agent.
   * QA 08-31: three of these pointed at tabs that no longer exist —
   * `cost` at insights:cost (InsightsView only has overview/progress/
   * recommendations; the cost panel moved into CreditsPricingDashboard) and
   * `wallet` at credits:balance (that tab was folded into the top bar on
   * 08-28, so CreditsView silently discarded it). Both now name a tab that
   * is actually rendered. */
  const LEGACY_VIEWS = {
    analytics: ['insights', 'overview'],
    progress: ['insights', 'progress'],
    recommendations: ['insights', 'recommendations'],
    cost: ['credits', 'plans'],
    wallet: ['credits', 'plans'],
    billing: ['credits', 'plans'],
    referral: ['credits', 'earn'],
    leaderboard: ['credits', 'earn'],
    notifications: ['activity', 'notifications'],
    'ai-workspace': ['agent', null],
  };
  const [viewTab, setViewTab] = useState(null);
  const viewKey = activeView === 'overview' && openAssignment
    ? 'assignment'
    : `${activeView}:${viewTab ?? ''}`;
  const [authModalOpen, setAuthModalOpen] = useState(false);
  /* Which tab the auth modal should land on ('signup' | 'login'). A "Sign in"
   * CTA that opens the create-account form is a dead end for returning users
   * (QA 08-31), so every opener now states its intent. */
  const [authModalMode, setAuthModalMode] = useState('signup');
  const openAuth = (intent = 'signup') => {
    setAuthModalMode(intent === 'login' ? 'login' : 'signup');
    setAuthModalOpen(true);
  };
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [sessionExpiredOpen, setSessionExpiredOpen] = useState(false);
  const [silent401Visible, setSilent401Visible] = useState(false);

  useEffect(() => {
    const onSessionExpired = (e) => {
      if (authStatus !== 'authed') return;
      if (e.detail?.isBackground) {
        setSilent401Visible(true);
      } else {
        setSessionExpiredOpen(true);
      }
    };
    window.addEventListener('helpotron:session-expired', onSessionExpired);
    return () => window.removeEventListener('helpotron:session-expired', onSessionExpired);
  }, [authStatus]);

  /* Backend reachability probe (09-18). `connected` was initialised to `true` and
     `setConnected` was never called anywhere in this file, so the offline banner
     below was unreachable by construction and a dead backend showed a normal UI
     with every panel silently empty. Probes /api/health on mount and on an
     interval, and flips the banner for real. */
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const r = await fetch(`${serverUrl}/api/health`, { method: 'GET' });
        if (!cancelled) setConnected(r.ok);
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    probe();
    const id = setInterval(probe, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [serverUrl]);

  /* ─── Client-side path guard (09-01, operator QA round) ────────────────
     The SPA serves index.html at every pathname (vite preview history
     fallback), so unknown URLs used to silently render the landing page
     with the address bar left on the dead path, and protected deep links
     (/activity …) while logged out showed the landing with no route to
     sign in. This guard resolves the pathname per auth transition:
     known authed views → navigate to the view; protected paths while
     signed out → open the auth modal (this app's sign-in surface) and
     snap the URL back to '/' if the visitor backs out; /sign-in and
     /signup → modal with that intent; anything unknown → the 404 page. */
  const VIEW_PATH_MAP = {
    '/overview': ['overview', null],
    '/dashboard': ['overview', null],
    '/activity': ['activity', null],
    '/history': ['history', null],
    '/notifications': ['notifications', null],
    '/library': ['library', null],
    '/agent': ['agent', null],
    '/monitors': ['monitors', null],
    '/insights': ['insights', null],
    '/credits': ['credits', null],
    '/billing': ['credits', null],
    '/settings': ['settings', null],
    '/extension': ['extension', null],
    '/dump': ['dump', null],
    '/datalake': ['datalake', null],
    '/inbox': ['inbox', null],
    '/automation': ['automation', null],
    '/message_admin': ['message_admin', null],
    '/admin': ['admin', null],
  };
  /* Paths the anonymous landing page legitimately serves. */
  const PUBLIC_PATHS = new Set(['/', '/features', '/pricing', '/guide', '/terms', '/privacy', '/extension']);
  const [notFoundPath, setNotFoundPath] = useState(null);
  const pendingDeepLink = useRef(null);
  const resolvePath = (path, status) => {
    if (path === '/sign-in' || path === '/signup') {
      pendingDeepLink.current = ['overview', null];
      if (status === 'signedOut') openAuth(path === '/sign-in' ? 'login' : 'signup');
      return;
    }
    if (status === 'signedOut' && PUBLIC_PATHS.has(path)) {
      return;
    }
    const mapped = VIEW_PATH_MAP[path];
    if (!mapped) {
      if (PUBLIC_PATHS.has(path)) return;
      setNotFoundPath(path);
      return;
    }
    if (status === 'authed') {
      pendingDeepLink.current = null;
      handleSelectView(mapped[0], mapped[1]);
    } else {
      pendingDeepLink.current = mapped;
      if (status === 'signedOut') openAuth('login');
    }
  };
  useEffect(() => {
    const path = (window.location.pathname.replace(/\/+$/, '') || '/');
    resolvePath(path, authStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);
  /* Closing the modal without signing in: don't leave the visitor stranded
     on a protected deep-link URL showing an anonymous landing (QA 09-01). */
  const closeAuthModal = () => {
    setAuthModalOpen(false);
    if (pendingDeepLink.current) {
      pendingDeepLink.current = null;
      if (window.location.pathname !== '/') window.history.replaceState(null, '', '/');
    }
  };
  const goHomeFromNotFound = () => {
    setNotFoundPath(null);
    if (window.location.pathname !== '/') window.history.replaceState(null, '', '/');
  };

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

  const [termsAccepted, setTermsAccepted] = useState(() => {
    try {
      return localStorage.getItem('helpotron_terms_accepted_v2') === 'true';
    } catch (e) {
      return false;
    }
  });

  const checkSession = async (retryOnce = true) => {
    try {
      const data = await api.me();
      if (data && data.authenticated) {
        setIsLoggedIn(true);
        setIsGuest(false);
        setAuthStatus('authed');
        setUserIdState(data.public_id || data.user_id || 'Student');
        setUserId(data.public_id || data.user_id || 'Student');
        setCredits(data.credits ?? 0);
        setTokenBalance(Number(data.token_balance ?? 0) || 0);
        setUserPlan(data.plan || 'none');
        setIsAdmin(Boolean(data.is_admin));
        setUserUnlimited(Boolean(data.unlimited));
        const accepted = localStorage.getItem('helpotron_terms_accepted_v2') === 'true';
        if (!accepted) {
          setShowPrivacyModal(true);
        }
        return;
      }
    } catch (e) {
      // 401 etc. — session did not verify; fall through to the retry below.
    }
    /* Cookie-store race (08-28, operator report): right after a 200 login the
     * session cookie can land a frame AFTER the client's first /api/me probe
     * (Safari/WebKit is the classic case) — the immediate `me()` 401s, the
     * gate flips to signedOut, and the user is bounced off the shell while
     * the session is actually valid. Retry ONCE after a short delay before
     * accepting the signed-out verdict. Misses add ~1.2s to the rare stale
     * case; the verified-401 path is unchanged. */
    if (retryOnce) {
      await new Promise((r) => setTimeout(r, 1200));
      try {
        const data = await api.me();
        if (data && data.authenticated) {
          setIsLoggedIn(true);
          setIsGuest(false);
          setAuthStatus('authed');
          setUserIdState(data.public_id || data.user_id || 'Student');
          setUserId(data.public_id || data.user_id || 'Student');
          setCredits(data.credits ?? 0);
          setTokenBalance(Number(data.token_balance ?? 0) || 0);
          setUserPlan(data.plan || 'none');
          setIsAdmin(Boolean(data.is_admin));
        setUserUnlimited(Boolean(data.unlimited));
          const accepted = localStorage.getItem('helpotron_terms_accepted_v2') === 'true';
          if (!accepted) {
            setShowPrivacyModal(true);
          }
          return;
        }
      } catch (e) {
        // still not there — a genuinely signed-out/stale session; fall through.
      }
    }

    // Unauthenticated state
    setIsLoggedIn(false);
    setIsGuest(false);
    setAuthStatus('signedOut');
    setIsAdmin(false);
    setUserIdState('Guest');
    setUserId('');
    // Drop stale local auth artifacts so the next load takes the zero-request
    // fast path instead of probing (and 401ing) again. The csrf_token cookie
    // is a JS-readable double-submit nonce (regenerated on the next login),
    // so a client-side delete is safe and keeps the console 401-free.
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('helpotron_csrf_token');
      document.cookie = 'csrf_token=; Max-Age=0; path=/; SameSite=Lax';
    } catch (e) {}
    setCredits(0);
    setTokenBalance(0);
    setUserPlan('none');
    setUserUnlimited(false);
  };

  useEffect(() => {
    // logout=1 (set by handleLogout's hard redirect): force-clear the server
    // session so a reload can never resurrect the previous account. The
    // session cookie is HttpOnly — the POST to /api/logout removes it; the
    // browser is then known-signed-out, so no /api/me probe is made (the
    // probe would be an expected-401 the console must not see).
    const forceLogout = new URLSearchParams(window.location.search).get('logout');
    if (forceLogout) {
      api.logout().catch(() => {});
      try {
        localStorage.removeItem('public_id');
        localStorage.removeItem('helpotron_public_id');
        localStorage.removeItem('helpotron_csrf_token');
        localStorage.removeItem('token');
      } catch (e) {}
      window.history.replaceState({}, '', window.location.pathname.replace('?logout=1', '') || '/');
      setAuthStatus('signedOut');
      return;
    }
    // Auth gate (audit 08-28): probe the session ONLY when a client-side
    // indicator says one might exist. A fresh/logged-out browser already
    // initialized 'signedOut' synchronously — no request fires at all.
    if (authStatus !== 'checking') return;
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Auth modal: never auto-opens (conversion audit 08-29).
   * It used to fire on EVERY signed-out load, so a first-time visitor met a
   * password form before a single line of value prop — the highest-bounce
   * pattern there is. The landing page now gets to do its job; the modal is
   * opened only by an explicit CTA click, or by an intent-carrying URL
   * (?signup=1 / ?signin=1 / #signup) so marketing links still deep-link
   * straight into the form. */
  useEffect(() => {
    if (authStatus !== 'signedOut') return;
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash.toLowerCase();
    const wantsSignin = params.has('signin') || hash === '#signin';
    const wantsAuth = wantsSignin || params.has('signup') || hash === '#signup';
    if (wantsAuth) openAuth(wantsSignin ? 'login' : 'signup');
  }, [authStatus]);

  /* Live token balance polling (08-27): /api/me every 25s while logged in —
   * the top-bar widget stays fresh without a page refresh. Stops on 403
   * (banned — the session UI already shows the suspension) AND on 401
   * (dead/expired session — a stale signed-out tab must not spam 401s into
   * the access log forever; a fresh sign-in remounts and restarts, 08-30). */
  useEffect(() => {
    if (!isLoggedIn) return undefined;
    const pollBalance = async () => {
      try {
        const resp = await fetch(`${serverUrl}/api/me`, { credentials: 'include' });
        if (resp.status === 403 || resp.status === 401) {
          // banned (403) or dead session (401) — stop polling; the session UI
          // already shows the state, and a fresh sign-in remounts this effect
          clearInterval(timer);
          return;
        }
        if (!resp.ok) return;
        const data = await resp.json();
        if (data && data.authenticated) {
          setCredits(data.credits ?? 0);
          setTokenBalance(Number(data.token_balance ?? 0) || 0);
          setUserPlan(data.plan || 'basic');
          setUserUnlimited(Boolean(data.unlimited));
        }
      } catch (e) { /* transient network error — retry next tick */ }
    };
    let timer = setInterval(pollBalance, 25000);
    return () => { if (timer) clearInterval(timer); };
  }, [isLoggedIn, serverUrl]);

  const handleLoginSuccess = async (userPublicId) => {
    setAuthModalOpen(false);
    await checkSession();
    const accepted = localStorage.getItem('helpotron_terms_accepted_v2') === 'true';
    if (!accepted) {
      setShowPrivacyModal(true);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {}
    setUserId('');
    setIsLoggedIn(false);
    setIsGuest(false);
    setIsAdmin(false);
    setUserIdState('Guest');
    setCredits(0);
    setTokenBalance(0);
    setUserPlan('none');
    // Hard reset: reload with ?logout=1 so the mount effect force-clears the
    // session cookie again — a failed/partial logout must NEVER leave the
    // previous user's identity behind (08-26 cross-account leak report).
    window.location.assign('/?logout=1');
  };

  const handleAcceptPrivacy = () => {
    try {
      localStorage.setItem('helpotron_terms_accepted_v2', 'true');
    } catch (e) {}
    setTermsAccepted(true);
    setShowPrivacyModal(false);
  };

  const handleDeclinePrivacy = () => {
    setShowPrivacyModal(false);
    handleLogout();
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

  /* `tab` is optional and wins over the legacy alias table, so a caller can
   * land on insights:progress without needing a `progress` alias to exist. */
  const handleSelectView = (viewKey, tab = null) => {
    const mapped = LEGACY_VIEWS[viewKey];
    const nextView = mapped ? mapped[0] : viewKey;
    const nextTab = tab ?? (mapped ? mapped[1] : null);
    /* Same destination (e.g. clicking the current nav item) — no history push. */
    if (nextView === activeView && nextTab === viewTab && !openAssignment) return;
    recordNav();
    setActiveView(nextView);
    setViewTab(nextTab);
    setOpenAssignment(null);
  };

  /* Extension deep link (08-28): the popup's "Open assignment bubble" button
   * navigates to /#assignment=<id> — open that bubble directly instead of
   * landing on the overview. Best-effort: needs an active web session.
   * Auth gate: the full-view fetch is a private endpoint — never fired while
   * signed out (it would be an expected-401), only once 'authed', and the
   * hash still works after sign-in for a logged-out tab. */
  useEffect(() => {
    if (authStatus !== 'authed') return undefined;
    const openFromHash = async () => {
      const m = window.location.hash.match(/assignment=(\d+)/);
      if (!m) return;
      const id = Number(m[1]);
      if (!id) return;
      try {
        const full = await api.assignmentFullView(id);
        const a = full && full.assignment;
        if (a && a.id) {
          recordNav();
          setOpenAssignment(a);
          setActiveView('overview');
        }
      } catch (e) { /* not logged in or no such assignment — stay on overview */ }
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);

  /* helpotron:nav event bus (09-06): any embedded card (e.g. the trial
   * activation card's "Enable 2FA" step) can request a view switch without
   * prop-drilling the navigate handler. */
  useEffect(() => {
    const onNav = (e) => {
      const target = e?.detail;
      if (typeof target === 'string' && target) handleSelectView(target);
    };
    window.addEventListener('helpotron:nav', onNav);
    return () => window.removeEventListener('helpotron:nav', onNav);
  }, []);

  useEffect(() => {
    window.__helpotron_nav = handleSelectView;
    const onNav = (e) => {
      if (e && e.detail) {
        if (typeof e.detail === 'string') handleSelectView(e.detail);
        else if (e.detail.view) handleSelectView(e.detail.view, e.detail.tab, e.detail.assignment);
      }
    };
    window.addEventListener('helpotron_nav', onNav);
    return () => {
      window.removeEventListener('helpotron_nav', onNav);
      delete window.__helpotron_nav;
    };
  }, [activeView, viewTab, openAssignment]);

  const effectiveIsAdmin = isAdmin;

  /* Unknown path → real 404 page, regardless of auth state (QA 09-01). */
  if (notFoundPath) {
    return <NotFound onGoHome={goHomeFromNotFound} />;
  }

  return (
    <ErrorBoundary>
      <div className="app-canvas min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans antialiased selection:bg-[var(--accent-subtle)] selection:text-[var(--text-primary)]">
        {/* Offline Diagnostic Persistence Banner */}
        <OfflineBanner />

        {/* WCAG 2.4.1 Skip Navigation Link */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[10000] focus:px-4 focus:py-2.5 focus:bg-[var(--accent)] focus:text-white focus:font-semibold focus:rounded-[var(--radius-sm)] focus:shadow-xl focus:ring-2 focus:ring-white/40 transition"
        >
          Skip to main content
        </a>

        {/* Privacy Policy & Terms Modal Overlay */}
        <PrivacyPolicyModal
          isOpen={showPrivacyModal || (isLoggedIn && !termsAccepted)}
          requireMandatoryAgreement={isLoggedIn && !termsAccepted}
          onAccept={handleAcceptPrivacy}
          onDecline={handleDeclinePrivacy}
          onClose={() => setShowPrivacyModal(false)}
        />

        {/* Auth Modal Overlay - Mandatory on first visit. Auth gate: opens
            over the ANONYMOUS landing (confirmed signed-out state) or the
            dialog-on-demand handle — never while the probe is in flight. */}
        <AuthModal
          isOpen={authModalOpen}
          mode={authModalMode}
          isMandatory={false}
          onClose={closeAuthModal}
          onLoginSuccess={(u) => {
            handleLoginSuccess(u);
          }}
        />

        {/* Session Expiry Modal (Spec 3.2.5) */}
        <SessionExpiryModal
          isOpen={sessionExpiredOpen}
          user={{ credits, public_id: userId, token_balance: tokenBalance, plan: userPlan, unlimited: userUnlimited }}
          onSessionRestored={(u) => {
            setSessionExpiredOpen(false);
            setSilent401Visible(false);
            handleLoginSuccess(u);
          }}
          onSwitchAccount={() => {
            setSessionExpiredOpen(false);
            setSilent401Visible(false);
            handleLogout();
            openAuth('login');
          }}
        />

        {/* Extension install is a sidebar section now (see ExtensionInstallView) */}

        {/* ─── AUTH GATE (audit 08-28) ───────────────────────────────────────
             signedOut → anonymous marketing landing ONLY (no dashboard
             internals, no authed fetches, modal opens above the landing);
             checking → boot screen while the probe runs; authed → the full
             OS shell + data views. AppShell never mounts before auth. */}
        {authStatus === 'checking' && <SessionBootScreen />}

        {authStatus === 'signedOut' && (
          <AnonymousLanding
            onOpenAuth={openAuth}
            onOpenPrivacy={() => setShowPrivacyModal(true)}
          />
        )}

        {authStatus === 'authed' && (
          <Suspense fallback={<SessionBootScreen />}>
        {/* Admin → user direct notices: poll + pop on screen (operator 08-28) */}
        <AdminNoticePopup isLoggedIn={isLoggedIn} />

        {/* Global command palette */}
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={handleSelectView} isAdmin={effectiveIsAdmin} />

        {/* Memory-budget queue notice (08-31, operator) — shows while the
            API's 10G RAM budget is consumed and requests are auto-retried */}
        <QueueNoticeBanner />

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
              onClick={() => openAuth('login')}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-xs transition cursor-pointer"
            >
              Sign In or Register →
            </button>
          </div>
        )}

        {/* Low Credit Warning Banner — never nags the operator (operator 08-28) */}
        {isLoggedIn && !effectiveIsAdmin && credits > 0 && (() => {
          const planLimit = { basic: 30, pro: 100, elite: 280 }[userPlan] || 30;
          const pct = (credits / planLimit) * 100;
          if (pct < 15) {
            const display = credits < 1
              ? credits.toLocaleString(undefined, { maximumFractionDigits: 3 })
              : Math.floor(credits);
            return (
              <div className="bg-rose-500/15 border-b border-rose-500/30 text-rose-200 px-6 py-2 text-xs flex flex-col sm:flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span>⚠️</span>
                  <span>
                    <strong>Low Credit Balance:</strong> You have {display} credits remaining.
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
          user={{ credits, public_id: userId, token_balance: tokenBalance, plan: userPlan, unlimited: userUnlimited }}
          onLogout={handleLogout}
          onOpenSearch={() => setPaletteOpen(true)}
          onOpenAuth={() => openAuth('login')}
          onOpenPrivacy={() => setShowPrivacyModal(true)}
        >
          {/* Silent 401 Telemetry / Sync Pause Banner (Spec 3.2.5) */}
          {silent401Visible && (
            <Session401Banner
              onReconnect={() => setSessionExpiredOpen(true)}
              onDismiss={() => setSilent401Visible(false)}
            />
          )}

          {/* Backend unreachable banner */}
          {!connected && (
            <div className="clean-card border-rose-500/30 bg-rose-950/20 px-4 py-2.5 rounded-xl text-xs text-rose-300 text-center font-mono mb-5 flex items-center justify-center gap-2">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              Backend server at {serverUrl} is unreachable — start it with <code className="text-white bg-black/40 px-1.5 py-0.5 rounded">systemctl --user start helpotron-api.service</code> (API on :5000)
            </div>
          )}

          {/* Main column + Study Buddy dock */}
          <div className="flex gap-6 items-start min-w-0">
            <div className="flex-1 min-w-0 w-full">
              {/* View transition (08-29): was AnimatePresence + motion.div.
                  That single decorative fade was the only reason `motion`
                  (140 KB) sat in the entry chunk. The keyed div below gets
                  the identical 180ms ease-out enter from CSS — remounting on
                  viewKey replays the animation — for zero JS. `exit` is not
                  reproducible without the library and was never perceptible
                  at 180ms with mode="wait". */}
              <div key={viewKey} className="view-enter">
                <Suspense fallback={<ViewSuspenseFallback />}>
                  {/* HOME */}
                  {activeView === 'overview' && (
                    openAssignment ? (
                      <AssignmentDetailView
                        assignment={openAssignment}
                        userId={userId}
                        onBack={goBack}
                        onGoToHistory={() => handleSelectView('history')}
                      />
                    ) : (
                      <>
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
                  {activeView === 'agent' && (
                    <MyAgentView
                      userId={userId}
                      onGoTo={handleSelectView}
                      onTokenBalance={setTokenBalance}
                      onOpenAssignment={(a) => {
                        // (09-01) assignment bubbles in the agent chat open the
                        // assignment's full bubble workspace — never a bare
                        // dashboard grid that loses the card.
                        if (!a || a.id == null) return;
                        recordNav();
                        setOpenAssignment(a);
                        setActiveView('overview');
                      }}
                    />
                  )}
                  {activeView === 'history' && (
                    <AssignmentHistoryView
                      userId={userId}
                      onSelectAssignment={(a) => {
                        recordNav();
                        setOpenAssignment(a);
                        setActiveView('overview');
                      }}
                    />
                  )}
                  {activeView === 'library' && <LibraryView user={{ public_id: userId }} onOpenAssignmentBubble={() => setActiveView('agent')} onOpenWorkspace={() => setActiveView('agent')} />}
                  {activeView === 'inbox' && <MessageAdminView userId={userId} />}

                  {/* AUTOMATION */}
                  {activeView === 'automation' && <AutomationCenter />}

                  {/* INTELLIGENCE */}
                  {activeView === 'insights' && <InsightsView userId={userId} onGoTo={handleSelectView} initialTab={viewTab} />}

                  {/* ACCOUNT */}
                  {activeView === 'credits' && <CreditsView userId={userId} initialTab={viewTab} userCredits={credits} />}
                  {activeView === 'settings' && <SettingsApp userId={userId} onGoTo={handleSelectView} plan={userPlan} credits={credits} tokenBalance={tokenBalance} isAdmin={effectiveIsAdmin} />}
                  {activeView === 'extension' && <ExtensionInstallView />}
                  {activeView === 'guide' && <GuideView onGoTo={handleSelectView} />}
                  {activeView === 'notifications' && <NotificationsView onNavigate={handleSelectView} user={{ credits, public_id: userId, token_balance: tokenBalance }} />}

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
                  {activeView === 'monitors' && <MonitorsView userId={userId} />}
                  {activeView === 'message_admin' && <MessageAdminView userId={userId} />}
                  {activeView === 'privacy' && <PrivacyPolicyView />}
                  {activeView === 'terms' && <TermsOfServiceView onBack={() => handleSelectView('overview')} />}

                  {/* ADMIN — hard route guard: non-admins get a denial, not a shell */}
                  {activeView === 'admin' && effectiveIsAdmin && <ControlCenterView userId={userId} />}
                  {activeView === 'admin' && !effectiveIsAdmin && (
                    <div className="p-10 text-center">
                      <div className="text-3xl mb-3">🔒</div>
                      <div className="text-sm font-bold text-[var(--text-primary)] mb-1">Access denied</div>
                      <div className="text-xs text-[var(--text-muted)]">The Control Center requires administrative privileges. If you need help, use the ❓ chat.</div>
                    </div>
                  )}
                </Suspense>
              </div>
            </div>

          </div>
        </AppShell>
          </Suspense>
        )}
        {isLoggedIn && termsAccepted && (
          <Suspense fallback={null}><CookieBanner /></Suspense>
        )}

        {/* Global Luminous Glass Toast Stack */}
        <ToastContainer />
      </div>
    </ErrorBoundary>
  );
}
