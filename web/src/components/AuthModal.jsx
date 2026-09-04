import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import { Lock, User, Key, Check, AlertCircle, ArrowRight, ShieldCheck, Mail, Phone, Eye, EyeOff, X } from 'lucide-react';
import { AnimatedLogo } from './ui/AnimatedLogo.jsx';

export default function AuthModal({ isOpen = true, onClose, onLoginSuccess, isMandatory = false, mode = 'signup' }) {
  /* `mode` is the caller's INTENT for this open ('signup' | 'login'). Before
   * QA 08-31 the tab was hard-coded to 'signup', so every "Sign in" button
   * and the ?signin=1 deep link opened the create-account form. */
  const [tab, setTab] = useState(mode === 'login' ? 'login' : 'signup');
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState('totp');
  const [twoFactorCode, setTwoFactorCode] = useState('');

  // Password visibility toggles (operator 08-26: toggle on/off while typing)
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showSignupPass, setShowSignupPass] = useState(false);
  const [showSignupConfirm, setShowSignupConfirm] = useState(false);

  // Login captcha (08-31, operator): Cloudflare Turnstile, mandatory
  // server-side once TURNSTILE_SITEKEY/SECRET are configured. The widget is
  // client-side UX only — the server re-verifies the token on every login,
  // so a missing/failed widget still results in a clean 403.
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [turnstileSitekey, setTurnstileSitekey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  // Mirror of the widget token: the signup POST consumes the solve, so the
  // post-signup auto-login needs a tracked fresh one (state lags a tick).
  const turnstileTokenRef = useRef('');
  const turnstileContainerRef = useRef(null);
  const turnstileWidgetIdRef = useRef(null);

  // Sign up state
  const [signupUser, setSignupUser] = useState('');
  const [signupPass, setSignupPass] = useState('');
  const [signupPassConfirm, setSignupPassConfirm] = useState('');
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [signupSuccessMsg, setSignupSuccessMsg] = useState('');

  // Password reset state
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose && !isMandatory) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isMandatory]);

  // WebKit replay (08-28): on a small phone the sign-in submit can sit below the
  // first fold; bring the form into view by focusing the active tab's first field
  // when the modal opens or the tab switches (Enter still submits).
  // NOTE: must stay above the `if (!isOpen) return null` — hooks run unconditionally.
  useEffect(() => {
    if (!isOpen) return;
    const id = tab === 'signup' ? 'signup-username' : 'login-username';
    const el = document.getElementById(id);
    if (el) {
      el.focus({ preventScroll: false });
    }
  }, [isOpen, tab]);

  // WebKit replay (08-29): pointer-events must NOT ride the CSS animation clock.
  // WebKit can stall the animation for 2s+ (observed up to a full lockout) so a
  // keyframe-carried pointer-events flip either traps taps in the invisible
  // fade forever or never arms the modal. Flip on the animation's own end event,
  // with a hard timer as a clock-independent safety net.
  const [peReady, setPeReady] = useState(false);
  useEffect(() => {
    if (!isOpen) { setPeReady(false); return; }
    const t = setTimeout(() => setPeReady(true), 4500);
    return () => clearTimeout(t);
  }, [isOpen]);
  const onPanelAnimEnd = (e) => {
    if (e.animationName === 'aurora-panel-in') setPeReady(true);
  };

  // QA 08-31: the modal is kept mounted between opens, so the initial useState
  // above only fires once. Re-sync the tab to the caller's intent each time the
  // modal is (re)opened, otherwise the second "Sign in" click reopens on
  // whichever tab the user happened to leave behind.
  // NOTE: must stay above the `if (!isOpen) return null` — hooks run unconditionally.
  useEffect(() => {
    if (!isOpen) return;
    setTab(mode === 'login' ? 'login' : 'signup');
  }, [isOpen, mode]);

  // Fetch captcha config each time the modal opens. If this fails we simply
  // leave the widget off — the server still denies captcha-less logins with 403.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    api.publicConfig()
      .then((cfg) => {
        if (cancelled || !cfg) return;
        setCaptchaEnabled(!!cfg.captcha_enabled);
        setTurnstileSitekey(cfg.turnstile_sitekey || '');
      })
      .catch(() => { if (!cancelled) { setCaptchaEnabled(false); } });
    return () => { cancelled = true; };
  }, [isOpen]);

  // Render the Turnstile widget once the loader script is available. The
  // container lives outside the tab conditionals so the same solve covers
  // login, 2FA stage 2 and the post-signup auto-login.
  useEffect(() => {
    if (!isOpen || !captchaEnabled) return;
    const container = turnstileContainerRef.current;
    if (!container) return;
    const removeWidget = () => {
      if (turnstileWidgetIdRef.current !== null && window.turnstile) {
        try { window.turnstile.remove(turnstileWidgetIdRef.current); } catch (e) { /* noop */ }
      }
      turnstileWidgetIdRef.current = null;
    };
    const render = () => {
      if (!window.turnstile || turnstileWidgetIdRef.current !== null) return;
      turnstileWidgetIdRef.current = window.turnstile.render(container, {
        sitekey: turnstileSitekey,
        callback: (token) => { turnstileTokenRef.current = token; setTurnstileToken(token); },
        'expired-callback': () => { turnstileTokenRef.current = ''; setTurnstileToken(''); },
        'error-callback': () => { turnstileTokenRef.current = ''; setTurnstileToken(''); },
      });
    };
    let script = document.getElementById('cf-turnstile-script');
    if (!script) {
      script = document.createElement('script');
      script.id = 'cf-turnstile-script';
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    } else if (window.turnstile) {
      render();
    }
    return removeWidget;
  }, [isOpen, captchaEnabled, turnstileSitekey]);

  if (!isOpen) return null;

  // 08-31: share a successful web login's session with the browser extension.
  // The MV3 extension popup cannot render Cloudflare Turnstile (remote-script
  // ban), so captcha-gated logins happen here and the session (public_id +
  // session_token) is handed off through the content script on helpotron
  // pages (→ background storeSession). Harmless no-op on non-extension pages.
  const sendSessionHandoff = (res) => {
    try {
      window.postMessage({
        type: 'HELPOTRON_SESSION_HANDOFF',
        requestId: `handoff-${Date.now()}`,
        public_id: res?.public_id || loginUser.trim() || signupUser.trim(),
        session_token: res?.session_token,
        token: res?.token,
        server: window.location.origin,
      }, '*');
    } catch (e) { /* content script not present — popup login still works */ }
  };

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (!loginUser.trim() || !loginPass) {
      setLoginError('Please enter both your Public ID / Username and password.');
      return;
    }
    if (requires2FA && !twoFactorCode.trim()) {
      setLoginError('Please enter your 2FA verification code.');
      return;
    }
    if (captchaEnabled && !turnstileToken) {
      setLoginError('Please complete the security check before signing in.');
      return;
    }
    setLoading(true);
    setLoginError('');
    try {
      const res = await api.login(loginUser.trim(), loginPass, requires2FA ? twoFactorCode.trim() : null, turnstileToken || null);
      if (res && res.status === '2fa_required') {
        setRequires2FA(true);
        setTwoFactorMethod(res.method || 'totp');
      } else if (res && res.message === 'Logged in') {
        sendSessionHandoff(res);
        onLoginSuccess(loginUser.trim());
      } else {
        setLoginError('Invalid credentials. Please verify your username and password.');
      }
    } catch (err) {
      setLoginError(err.message || 'Login failed. Please check your username and password.');
    } finally {
      setLoading(false);
      // Turnstile tokens are single-use: every attempt (2FA stage 2 included)
      // needs a fresh solve, so clear the stored token and reset the widget.
      setTurnstileToken('');
      if (turnstileWidgetIdRef.current !== null && window.turnstile) {
        try { window.turnstile.reset(turnstileWidgetIdRef.current); } catch (e) { /* noop */ }
      }
    }
  };

  // Turnstile tokens are single-use: signup consumed the solve, so the
  // auto-login right after needs a fresh one. Re-challenge the widget and wait
  // for the next token (managed mode usually re-solves itself without a click);
  // bounded so a stalled widget can never hang the signup flow.
  const getFreshTurnstileToken = () => new Promise((resolve) => {
    if (!captchaEnabled || !window.turnstile || turnstileWidgetIdRef.current === null) {
      resolve(null);
      return;
    }
    turnstileTokenRef.current = '';  // drop the consumed solve
    try { window.turnstile.reset(turnstileWidgetIdRef.current); } catch (e) { resolve(null); return; }
    const started = Date.now();
    const iv = setInterval(() => {
      if (turnstileTokenRef.current) {
        clearInterval(iv);
        resolve(turnstileTokenRef.current);
      } else if (Date.now() - started > 15000) {
        clearInterval(iv);
        resolve(null);
      }
    }, 150);
  });

  const handleSignup = async (e) => {
    e?.preventDefault();
    const u = signupUser.trim();
    if (!u || !signupPass) {
      setLoginError('Please provide a username and password.');
      return;
    }
    if (signupPass !== signupPassConfirm) {
      setLoginError('Passwords do not match. Please re-enter.');
      return;
    }
    if (signupPass.length < 8 || !/[A-Za-z]/.test(signupPass) || !/[0-9]/.test(signupPass)) {
      setLoginError('Password must be at least 8 characters and contain both a letter and a number.');
      return;
    }
    if (!consentAgreed) {
      setLoginError('You must agree to the Terms of Service & Privacy Policy.');
      return;
    }

    setLoading(true);
    setLoginError('');
    try {
      const signupRes = await api.signup(u, signupPass, turnstileToken || null);
      if (signupRes && (signupRes.public_id || signupRes.message?.includes('User created'))) {
        // Single-consent flow (legal-gate UX fix, 08-28): consent was just given
        // in THIS modal (Step 1) — carry it into the mandatory legal gate
        // (Step 2) so the gate opens with the checkbox pre-checked and needs
        // only one click. The gate still requires an explicit Accept.
        try { localStorage.setItem('helpotron_signup_consent', '1'); } catch (e) { /* storage unavailable */ }
        // Automatically log in with new credentials. Turnstile tokens are
        // single-use: the signup POST consumed the solve, so re-challenge the
        // widget and wait for a fresh token (managed mode usually re-solves
        // instantly without a click) before the auto-login.
        const loginToken = await getFreshTurnstileToken();
        const autoLoginRes = await api.login(u, signupPass, null, loginToken);
        if (autoLoginRes && autoLoginRes.message === 'Logged in') {
          sendSessionHandoff(autoLoginRes);
          onLoginSuccess(u);
        } else {
          // Account was created; the auto-login's fresh solve just failed.
          // Don't lose the user — switch to the Sign in tab with the username
          // prefilled so they complete a fresh solve there.
          setLoginUser(u);
          setTab('login');
          setLoginError('Account created — complete the security check to sign in.');
        }
      } else {
        setLoginError(signupRes?.detail || 'Signup failed.');
      }
    } catch (err) {
      setLoginError(err.message || 'Could not create account. Username may already be taken.');
    } finally {
      setLoading(false);
      setTurnstileToken('');
      turnstileTokenRef.current = '';
      if (turnstileWidgetIdRef.current !== null && window.turnstile) {
        try { window.turnstile.reset(turnstileWidgetIdRef.current); } catch (e) { /* noop */ }
      }
    }
  };

  const handleReset = (e) => {
    e?.preventDefault();
    if (!resetEmail.trim()) {
      setLoginError('Please enter your registered email or username.');
      return;
    }
    setResetLoading(true);
    setLoginError('');
    setTimeout(() => {
      setResetLoading(false);
      setResetSent(true);
    }, 600);
  };

  // text-base (16px → 17.6px at the 110% root): computed >= 16px so iOS/Safari
  // does NOT auto-zoom when the field is focused. text-sm (15.4px computed)
  // triggered the zoom every time a student tapped a field on a phone.
  const INPUT = 'w-full pl-10 pr-10 py-3 text-base rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div
      className={`fixed inset-0 z-[100] flex p-4 bg-black/60 backdrop-blur-sm overflow-y-auto aurora-modal-backdrop ${peReady ? 'pointer-events-auto' : 'pointer-events-none'}`}
      role="dialog"
      aria-modal="true"
      aria-label="Helpotron Authentication"
      onClick={() => { if (!isMandatory) onClose?.(); }}
    >
      {/* Aurora modal chrome (scoped; index.css owns the design system).
          pointer-events is state-driven (see peReady above), never keyframe-driven. */}
      <style>{`@keyframes aurora-backdrop-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes aurora-panel-in { from { opacity: 0; transform: translateY(12px) scale(0.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
.aurora-modal-backdrop { animation: aurora-backdrop-in 0.18s ease-out both }
.aurora-modal-panel { animation: aurora-panel-in 0.22s ease-out both }`}</style>
      <div
        className={`w-full max-w-md m-auto bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 sm:p-8 text-on-surface shadow-2xl relative overflow-hidden aurora-modal-panel ${peReady ? 'pointer-events-auto' : 'pointer-events-none'}`}
        data-modal-container
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={onPanelAnimEnd}
      >
        {!isMandatory && onClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {/* Top Brand Banner */}
        <div className="text-center space-y-2 pb-5 border-b border-outline-variant/30">
          <div className="flex justify-center">
            <AnimatedLogo size="lg" />
          </div>
          <h2 className="font-headline-lg text-title-md text-on-surface tracking-tight">
            {tab === 'signup' ? 'Create Student Account' : tab === 'reset' ? 'Reset Account Access' : 'Sign in to Helpotron'}
          </h2>
          <p className="font-body-sm text-xs text-on-surface-variant">
            {tab === 'signup'
              ? 'Join the autonomous academic operating system & study copilot'
              : tab === 'reset'
              ? 'Enter your registered email address to receive a direct 6-digit reset code'
              : 'Enter your credentials to access your autonomous study workspace'}
          </p>
          {tab === 'signup' && (
            <span className="inline-block font-label-caps text-xs uppercase tracking-wider px-3 py-1 rounded-full bg-primary/15 text-primary font-semibold">
              Step 1 of 2 · Legal consent
            </span>
          )}
        </div>

        {/* 3-Tab Switcher */}
        <div
          className="flex bg-surface-container-low p-1 rounded-2xl border border-outline-variant/30 my-5 gap-1"
          role="tablist"
          aria-label="Create an account, sign in, or reset password"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'login'}
            onClick={() => { setTab('login'); setLoginError(''); }}
            className={`flex-1 py-2 font-label-caps text-[11px] uppercase tracking-wider rounded-xl transition cursor-pointer text-center ${
              tab === 'login' ? 'bg-surface-container-lowest text-primary shadow-sm font-semibold' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Sign In &amp; 2FA
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'signup'}
            onClick={() => { setTab('signup'); setLoginError(''); }}
            className={`flex-1 py-2 font-label-caps text-[11px] uppercase tracking-wider rounded-xl transition cursor-pointer text-center ${
              tab === 'signup' ? 'bg-surface-container-lowest text-primary shadow-sm font-semibold' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'reset'}
            onClick={() => { setTab('reset'); setLoginError(''); }}
            className={`flex-1 py-2 font-label-caps text-[11px] uppercase tracking-wider rounded-xl transition cursor-pointer text-center ${
              tab === 'reset' ? 'bg-surface-container-lowest text-primary shadow-sm font-semibold' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Reset Password
          </button>
        </div>

        {/* Security check — Cloudflare Turnstile (shown for both tabs; the
            server enforces it on /api/login regardless of this widget). */}
        {captchaEnabled && turnstileSitekey && tab !== 'reset' && (
          <div className="mb-4">
            <div
              ref={turnstileContainerRef}
              className="flex justify-center"
              data-turnstile
            />
            <p className="text-[10px] text-[var(--text-muted)] text-center mt-1.5">
              Security check required to keep your account safe.
            </p>
          </div>
        )}

        {/* Error Notification */}
        {loginError && (
          <div className="mb-4 p-3 rounded-[var(--radius-md)] bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{loginError}</span>
          </div>
        )}

        {/* SIGN UP FORM */}
        {tab === 'signup' && (
          <form onSubmit={handleSignup} method="post" action="#" className="space-y-4" autoComplete="on">
            <div className="space-y-1">
              <label htmlFor="signup-username" className="text-xs font-semibold text-[var(--text-secondary)]">Public ID / Username</label>
              <div className="relative">
                <input
                  id="signup-username"
                  name="username"
                  type="text"
                  required
                  autoComplete="username"
                  placeholder="e.g. alex_student24"
                  value={signupUser}
                  onChange={(e) => setSignupUser(e.target.value)}
                  className={INPUT}
                />
                <User className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-3" />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="signup-password" className="text-xs font-semibold text-[var(--text-secondary)]">Password</label>
              <div className="relative">
                <input
                  id="signup-password"
                  name="password"
                  type={showSignupPass ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="Min 8 chars, 1 letter & 1 number"
                  value={signupPass}
                  onChange={(e) => setSignupPass(e.target.value)}
                  className={INPUT}
                />
                <Key className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-3" />
                <button type="button" onClick={() => setShowSignupPass(!showSignupPass)} aria-label={showSignupPass ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  {showSignupPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="signup-confirm-password" className="text-xs font-semibold text-[var(--text-secondary)]">Confirm Password</label>
              <div className="relative">
                <input
                  id="signup-confirm-password"
                  name="confirm-password"
                  type={showSignupConfirm ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={signupPassConfirm}
                  onChange={(e) => setSignupPassConfirm(e.target.value)}
                  className={INPUT}
                />
                <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-3" />
                <button type="button" onClick={() => setShowSignupConfirm(!showSignupConfirm)} aria-label={showSignupConfirm ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  {showSignupConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer pt-1 select-none">
              <input
                type="checkbox"
                required
                checked={consentAgreed}
                onChange={(e) => setConsentAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-[11px] text-[var(--text-muted)] leading-tight">
                I agree to the <strong>Academic Honor Code</strong> and <strong>FERPA / GDPR Terms</strong>.
                {!consentAgreed && (
                  <em className="not-italic block text-[10px] mt-0.5 text-amber-300/90">
                    Check this box to continue.
                  </em>
                )}
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !signupUser || !signupPass || !consentAgreed}
              className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-[var(--radius-sm)] transition cursor-pointer glow-accent flex items-center justify-center gap-2"
            >
              {loading ? 'Creating Account…' : 'Create Free Account →'}
            </button>
          </form>
        )}

        {/* SIGN IN FORM */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} method="post" action="#" className="space-y-4" autoComplete="on">
            {!requires2FA ? (
              <>
                <div className="space-y-1">
                  <label htmlFor="login-username" className="text-xs font-semibold text-[var(--text-secondary)]">Public ID / Username</label>
                  <div className="relative">
                    <input
                      id="login-username"
                      name="username"
                      type="text"
                      required
                      autoComplete="username"
                      placeholder="Enter your username"
                      value={loginUser}
                      onChange={(e) => setLoginUser(e.target.value)}
                      className={INPUT}
                    />
                    <User className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-3" />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs font-semibold text-[var(--text-secondary)]">
                    <label htmlFor="login-password">Password</label>
                    <button
                      type="button"
                      onClick={() => { setTab('reset'); setLoginError(''); }}
                      className="text-[var(--accent)] hover:underline text-xs cursor-pointer font-normal"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="login-password"
                      name="password"
                      type={showLoginPass ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                      className={INPUT}
                    />
                    <Key className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-3" />
                    <button type="button" onClick={() => setShowLoginPass(!showLoginPass)} aria-label={showLoginPass ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                      {showLoginPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4 p-4 rounded-2xl bg-surface-container-low border border-primary/30">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-on-surface">Two-Factor Authentication</h4>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Enter the 6-digit code from your {twoFactorMethod === 'totp' ? 'authenticator app' : twoFactorMethod} or phone.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="two-factor-code" className="text-xs font-semibold text-on-surface-variant">Security Code (6 Digits)</label>
                  <div className="relative">
                    <input
                      id="two-factor-code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoFocus
                      required
                      placeholder="000000"
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full py-3 px-4 text-center tracking-[0.5em] font-mono text-xl font-bold rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px]">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Hardware / TOTP Synced
                    </span>
                    <button
                      type="button"
                      onClick={() => { setRequires2FA(false); setTwoFactorCode(''); }}
                      className="text-primary hover:underline text-xs cursor-pointer"
                    >
                      ← Back to password
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !loginUser || !loginPass || (requires2FA && twoFactorCode.length < 6)}
              className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-[var(--radius-sm)] transition cursor-pointer glow-accent flex items-center justify-center gap-2"
            >
              {loading ? 'Verifying…' : (requires2FA ? 'Verify 6-Digit Code & Sign In →' : 'Sign in to Workspace →')}
            </button>
          </form>
        )}

        {/* RESET PASSWORD FORM */}
        {tab === 'reset' && (
          <form onSubmit={handleReset} className="space-y-4">
            {resetSent ? (
              <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <Check className="w-4 h-4" /> Reset Code Dispatched
                </div>
                <p>
                  If an account exists for <span className="font-mono text-white">{resetEmail}</span>, a 6-digit verification code was sent.
                </p>
                <button
                  type="button"
                  onClick={() => { setTab('login'); setResetSent(false); }}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-white underline cursor-pointer"
                >
                  ← Return to Sign In &amp; 2FA
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <label htmlFor="reset-email" className="text-xs font-semibold text-on-surface-variant">Registered Email or Username</label>
                  <div className="relative">
                    <input
                      id="reset-email"
                      type="text"
                      required
                      placeholder="student@university.edu"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className={INPUT}
                    />
                    <Mail className="w-4 h-4 text-on-surface-variant/60 absolute left-3 top-3.5" />
                  </div>
                </div>

                <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30 text-xs text-on-surface-variant">
                  <span className="text-primary font-semibold block mb-0.5">Need instant help?</span>
                  You can also contact Roni directly on Support Chat for immediate account reset.
                </div>

                <button
                  type="submit"
                  disabled={resetLoading || !resetEmail.trim()}
                  className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-[var(--radius-sm)] transition cursor-pointer glow-accent flex items-center justify-center gap-2"
                >
                  {resetLoading ? 'Sending…' : 'Send 6-Digit Reset Code →'}
                </button>

                <button
                  type="button"
                  onClick={() => setTab('login')}
                  className="w-full text-center text-xs text-on-surface-variant hover:text-on-surface py-1 cursor-pointer"
                >
                  ← Back to Sign In
                </button>
              </>
            )}
          </form>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-outline-variant/20 flex items-center justify-between text-[11px] text-on-surface-variant">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            Zero Tracking Pixels · FERPA
          </span>
          <span className="font-mono text-[10px]">Engineered by Solo Dev Roni</span>
        </div>
      </div>
    </div>
  );
}
