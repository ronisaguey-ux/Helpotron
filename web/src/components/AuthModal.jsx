import React, { useState, useEffect } from 'react';
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

  // Sign up state
  const [signupUser, setSignupUser] = useState('');
  const [signupPass, setSignupPass] = useState('');
  const [signupPassConfirm, setSignupPassConfirm] = useState('');
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [signupSuccessMsg, setSignupSuccessMsg] = useState('');

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

  if (!isOpen) return null;

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
    setLoading(true);
    setLoginError('');
    try {
      const res = await api.login(loginUser.trim(), loginPass, requires2FA ? twoFactorCode.trim() : null);
      if (res && res.status === '2fa_required') {
        setRequires2FA(true);
        setTwoFactorMethod(res.method || 'totp');
      } else if (res && res.message === 'Logged in') {
        onLoginSuccess(loginUser.trim());
      } else {
        setLoginError('Invalid credentials. Please verify your username and password.');
      }
    } catch (err) {
      setLoginError(err.message || 'Login failed. Please check your username and password.');
    } finally {
      setLoading(false);
    }
  };

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
      const signupRes = await api.signup(u, signupPass);
      if (signupRes && (signupRes.public_id || signupRes.message?.includes('User created'))) {
        // Single-consent flow (legal-gate UX fix, 08-28): consent was just given
        // in THIS modal (Step 1) — carry it into the mandatory legal gate
        // (Step 2) so the gate opens with the checkbox pre-checked and needs
        // only one click. The gate still requires an explicit Accept.
        try { localStorage.setItem('helpotron_signup_consent', '1'); } catch (e) { /* storage unavailable */ }
        // Automatically log in with new credentials
        await api.login(u, signupPass);
        onLoginSuccess(u);
      } else {
        setLoginError(signupRes?.detail || 'Signup failed.');
      }
    } catch (err) {
      setLoginError(err.message || 'Could not create account. Username may already be taken.');
    } finally {
      setLoading(false);
    }
  };

  // text-base (16px → 17.6px at the 110% root): computed >= 16px so iOS/Safari
  // does NOT auto-zoom when the field is focused. text-sm (15.4px computed)
  // triggered the zoom every time a student tapped a field on a phone.
  const INPUT = 'clean-input w-full pl-9 pr-10 py-2.5 text-base';

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
        className={`w-full max-w-md m-auto surface-glass-strong rounded-[var(--radius-lg)] p-6 sm:p-8 text-[var(--text-primary)] relative overflow-hidden aurora-modal-panel ${peReady ? 'pointer-events-auto' : 'pointer-events-none'}`}
        data-modal-container
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={onPanelAnimEnd}
      >
        {!isMandatory && onClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {/* Top Brand Banner */}
        <div className="text-center space-y-2 pb-5 border-b border-[var(--border-subtle)]">
          <div className="flex justify-center">
            <AnimatedLogo size="lg" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
            {tab === 'signup' ? 'Create Student Account' : 'Sign in to Helpotron'}
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            {tab === 'signup'
              ? 'Join the autonomous academic operating system & study copilot'
              : 'Enter your credentials to access your autonomous study workspace'}
          </p>
          {tab === 'signup' && (
            <span className="aurora-chip text-[11px] uppercase tracking-wider">
              Step 1 of 2 · Legal consent
            </span>
          )}
        </div>

        {/* Tab Toggle. QA 08-31: which tab is active was carried by fill colour
            alone, and the pair had no roles — a screen reader read out two
            unlabelled buttons with no selected state (WCAG 4.1.2 / 1.4.1). */}
        <div
          className="flex bg-[var(--bg-surface)] p-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] my-5"
          role="tablist"
          aria-label="Create an account or sign in"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'signup'}
            onClick={() => { setTab('signup'); setLoginError(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              tab === 'signup' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'login'}
            onClick={() => { setTab('login'); setLoginError(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              tab === 'login' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Sign In
          </button>
        </div>

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
                  <label htmlFor="login-password" className="text-xs font-semibold text-[var(--text-secondary)]">Password</label>
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
              <div className="space-y-3 bg-[var(--accent-subtle)] border border-[var(--accent-subtle)] rounded-[var(--radius-md)] p-4">
                <div className="flex items-center gap-2 text-[var(--accent)]">
                  <ShieldCheck className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Two-Factor Authentication</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Enter the 6-digit verification code from your {twoFactorMethod === 'totp' ? 'authenticator app' : twoFactorMethod} to continue.
                </p>
                <div className="space-y-1">
                  <label htmlFor="two-factor-code" className="text-xs font-semibold text-[var(--text-secondary)]">Security Code</label>
                  <div className="relative">
                    <input
                      id="two-factor-code"
                      type="text"
                      maxLength={6}
                      autoFocus
                      required
                      placeholder="123456"
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                      className="clean-input w-full pl-9 text-base text-center tracking-widest font-mono"
                    />
                    <Lock className="w-4 h-4 text-[var(--accent)] absolute left-3 top-3.5" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setRequires2FA(false); setTwoFactorCode(''); }}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] underline cursor-pointer"
                >
                  ← Back to password sign in
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !loginUser || !loginPass || (requires2FA && twoFactorCode.length < 6)}
              className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-[var(--radius-sm)] transition cursor-pointer glow-accent flex items-center justify-center gap-2"
            >
              {loading ? 'Verifying…' : (requires2FA ? 'Verify Code & Sign In →' : 'Sign in to Workspace →')}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)]">
          Encrypted with TLS 1.3 &bull; Enterprise Zero Data Retention (ZDR)
        </div>
      </div>
    </div>
  );
}
