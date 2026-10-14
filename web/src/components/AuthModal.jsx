/* ────────────────────────────────────────────────────────────────────────────
 * AuthModal.jsx — Sign in / create account (owner 09-06: v4 "sovereign" slop
 * eradicated — plain account naming, honest copy, no fake token awards).
 *
 * Design Spec:
 * - Desktop (>= lg): Two-pane split — Left brand hero + Right glass card.
 * - Mobile (< lg): Stacked card.
 * - Sign In: Public ID only (never "Username or Email"), eye toggle, Turnstile
 *   verification below form, Enter submits, inline error strip + shake animation.
 * - Create Account: Public ID with re-roll, password with 4-segment entropy
 *   meter, optional discount code (wired to /api/referrals/redeem — a referral
 *   code grants a one-time order discount; NO hardcoded token awards).
 * - 2FA Challenge: Integrated 6-cell segmented OTP stage upon 2fa_required response.
 * - Recovery Entry: Direct access to RecoveryFlowModal.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion';
import {
  X,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Dices,
  Sparkles,
  Lock,
  Key,
  Shield,
  Coins,
  Cpu,
  Ticket,
  ExternalLink,
} from 'lucide-react';
import { api } from '../api.js';
import { AnimatedLogo } from './ui/AnimatedLogo.jsx';
import SegmentedOTPInput from './ui/SegmentedOTPInput.jsx';
import RecoveryFlowModal from './RecoveryFlowModal.jsx';
import Button from './Button.jsx';

function generateRandomPublicId() {
  const chars = '0123456789ABCDEF';
  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += chars[Math.floor(Math.random() * chars.length)];
  }
  return `0x${hex.slice(0, 4)}...${hex.slice(4)}`;
}

function calculateEntropy(passphrase) {
  if (!passphrase) return { score: 0, label: 'Empty', color: 'bg-surface-variant' };
  let score = 0;
  if (passphrase.length >= 8) score += 1;
  if (passphrase.length >= 14) score += 1;
  if (/[A-Z]/.test(passphrase) && /[a-z]/.test(passphrase)) score += 1;
  if (/[0-9]/.test(passphrase) && /[^A-Za-z0-9]/.test(passphrase)) score += 1;

  if (score <= 1) return { score: 1, label: 'Weak Entropy', color: 'bg-error' };
  if (score === 2) return { score: 2, label: 'Moderate', color: 'bg-sem-amber' };
  if (score === 3) return { score: 3, label: 'Strong Entropy', color: 'bg-sem-green' };
  return { score: 4, label: 'Very strong', color: 'bg-primary' };
}

export default function AuthModal({
  isOpen = true,
  onClose,
  onLoginSuccess,
  isMandatory = false,
  mode = 'signup',
}) {
  const [tab, setTab] = useState(mode === 'login' ? 'login' : 'signup');
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [showLoginId, setShowLoginId] = useState(true);
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Sign up state
  const [signupId, setSignupId] = useState(() => `HLP-${Math.floor(1000 + Math.random() * 9000)}-${Math.random().toString(36).substring(2, 4).toUpperCase()}`);
  const [signupPass, setSignupPass] = useState('');
  const [signupPassConfirm, setSignupPassConfirm] = useState('');
  const [showSignupPass, setShowSignupPass] = useState(false);
  const [showSignupConfirm, setShowSignupConfirm] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [consentAgreed, setConsentAgreed] = useState(false);

  // 2FA Challenge state
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState('totp');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);

  // Recovery modal state
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  // General state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hasShaked, setHasShaked] = useState(false);

  // Turnstile Captcha
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [turnstileSitekey, setTurnstileSitekey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileTokenRef = useRef('');
  const turnstileContainerRef = useRef(null);
  const turnstileWidgetIdRef = useRef(null);

  // Keep tab synced with mode changes
  useEffect(() => {
    if (isOpen) {
      setTab(mode === 'login' ? 'login' : 'signup');
      setErrorMsg('');
      setRequires2FA(false);
      setTwoFactorCode('');
    }
  }, [isOpen, mode]);

  // Escape listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose && !isMandatory && !recoveryOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isMandatory, recoveryOpen]);

  // Public config for Captcha
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    api.publicConfig()
      .then((cfg) => {
        if (!active || !cfg) return;
        setCaptchaEnabled(Boolean(cfg.captcha_enabled));
        setTurnstileSitekey(cfg.turnstile_sitekey || '');
      })
      .catch(() => {
        if (active) setCaptchaEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  // Render Turnstile
  useEffect(() => {
    if (!isOpen || !captchaEnabled || !turnstileSitekey) return;
    const container = turnstileContainerRef.current;
    if (!container) return;

    const cleanup = () => {
      if (turnstileWidgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {}
      }
      turnstileWidgetIdRef.current = null;
    };

    const render = () => {
      if (!window.turnstile || turnstileWidgetIdRef.current !== null) return;
      try {
        turnstileWidgetIdRef.current = window.turnstile.render(container, {
          sitekey: turnstileSitekey,
          callback: (tok) => {
            turnstileTokenRef.current = tok;
            setTurnstileToken(tok);
          },
          'expired-callback': () => {
            turnstileTokenRef.current = '';
            setTurnstileToken('');
          },
          'error-callback': () => {
            turnstileTokenRef.current = '';
            setTurnstileToken('');
          },
        });
      } catch {}
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

    return cleanup;
  }, [isOpen, captchaEnabled, turnstileSitekey, tab]);

  // 2FA countdown timer
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setInterval(() => setOtpCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(t);
  }, [otpCooldown]);

  const triggerError = (msg) => {
    setErrorMsg(msg);
    setHasShaked(true);
    setTimeout(() => setHasShaked(false), 500);
  };

  // The browser extension no longer receives a login session from this page.
  // It authenticates with a user-issued API key (Settings → API Keys), so
  // handing it a `session_token` would store a credential it never uses.

  const handleLogin = async (e) => {
    e?.preventDefault();
    const id = loginId.trim();
    if (!id || !loginPass) {
      triggerError('Please enter your Public ID and password.');
      return;
    }
    if (requires2FA && twoFactorCode.trim().length < 6) {
      triggerError('Please enter the complete 6-digit verification code.');
      return;
    }
    if (captchaEnabled && !turnstileToken) {
      triggerError('Please complete the security check before signing in.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.login(
        id,
        loginPass,
        requires2FA ? twoFactorCode.trim() : null,
        turnstileToken || null
      );
      if (res && res.status === '2fa_required') {
        setRequires2FA(true);
        setTwoFactorMethod(res.method || 'totp');
        setOtpCooldown(30);
        } else if (res && (res.message === 'Logged in' || res.status === 'ok')) {
          onLoginSuccess?.(id);
        } else {
        triggerError('Invalid credentials. Check your Public ID or password.');
      }
    } catch (err) {
      triggerError(err.message || 'Login failed. Verify your Public ID or password.');
    } finally {
      setLoading(false);
      setTurnstileToken('');
      turnstileTokenRef.current = '';
      if (turnstileWidgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.reset(turnstileWidgetIdRef.current);
        } catch {}
      }
    }
  };

  const handleSignup = async (e) => {
    e?.preventDefault();
    const id = signupId.trim();
    if (!id || !signupPass) {
      triggerError('Please provide a Public ID and password.');
      return;
    }
    if (signupPass !== signupPassConfirm) {
      triggerError('Passwords do not match. Please re-enter.');
      return;
    }
    if (signupPass.length < 8 || !/[A-Za-z]/.test(signupPass) || !/[0-9]/.test(signupPass)) {
      triggerError('Password must be at least 8 characters with both letters and numbers.');
      return;
    }
    if (!consentAgreed) {
      triggerError('You must agree to the Terms of Service before creating an account.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const signupRes = await api.signup(id, signupPass, turnstileToken || null);
      if (signupRes && (signupRes.public_id || signupRes.message?.includes('User created'))) {
        try {
          localStorage.setItem('helpotron_signup_consent', '1');
        } catch {}

        // Auto-login with credentials
        const autoLogin = await api.login(id, signupPass, null, null);
        if (autoLogin && autoLogin.message === 'Logged in') {
          // Owner 09-06: the discount code redeems a real referral code
          // (one-time order discount — it never awards tokens). A bad code
          // must not block the account, so fall through to a sign-in prompt.
          const code = referralCode.trim();
          if (code) {
            try {
              const refRes = await api.referralRedeem(code);
              if (!refRes || refRes.status !== 'success') {
                setLoginId(id);
                setTab('login');
                triggerError('Account created — discount code not recognized. Sign in to continue.');
                return;
              }
            } catch {
              setLoginId(id);
              setTab('login');
              triggerError('Account created — discount code not recognized. Sign in to continue.');
              return;
            }
          }
          onLoginSuccess?.(id);
        } else {
          setLoginId(id);
          setTab('login');
          triggerError('Account created — please sign in with your password.');
        }
      } else {
        triggerError(signupRes?.detail || 'Account creation failed.');
      }
    } catch (err) {
      triggerError(err.message || 'Account creation failed. Public ID may already exist.');
    } finally {
      setLoading(false);
      setTurnstileToken('');
      turnstileTokenRef.current = '';
      if (turnstileWidgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.reset(turnstileWidgetIdRef.current);
        } catch {}
      }
    }
  };

  const handleRerollId = () => {
    const prefix = 'HLP';
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const suffix = Math.random().toString(36).substring(2, 5).toUpperCase();
    setSignupId(`${prefix}-${randNum}-${suffix}`);
  };

  if (!isOpen) return null;

  const entropy = calculateEntropy(signupPass);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Helpotron sign in"
      onClick={() => {
        if (!isMandatory && !recoveryOpen) onClose?.();
      }}
    >
      <div
        className="w-full max-w-4xl bg-surface-container-lowest/95 border border-outline-variant/30 rounded-3xl text-on-surface shadow-2xl relative overflow-hidden backdrop-blur-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {!isMandatory && onClose && (
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
          {/* ── LEFT PANE: BRAND HERO (Spec 3.2.1) ────────────────────── */}
          <div className="hidden lg:flex lg:col-span-6 p-8 sm:p-10 flex-col justify-between bg-gradient-to-br from-surface-container-low/90 to-surface-container-lowest/70 border-r border-outline-variant/20 relative overflow-hidden">
            <div className="space-y-6 relative z-10">
              <div className="flex items-center gap-3">
                <AnimatedLogo size="md" />
                <span className="font-mono text-xs text-primary uppercase tracking-widest font-semibold">
                  Academic Co-pilot
                </span>
              </div>

              <div className="space-y-3">
                <h1 className="font-display-xl text-3xl xl:text-4xl text-on-surface font-bold tracking-tight leading-tight">
                  Your coursework, one smart workspace.
                </h1>
                <p className="font-body-md text-sm text-on-surface-variant leading-relaxed">
                  Imported coursework sorts itself into subject bubbles, every assignment gets
                  its own agent with dedicated files and memory, and a completion ledger keeps
                  an honest record of what you submitted.
                </p>
              </div>

              {/* 3 Pillar Highlights */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 shadow-sm">
                  <div className="w-7 h-7 rounded-lg bg-sem-green/15 flex items-center justify-center text-sem-green shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-on-surface">An agent per assignment</div>
                    <div className="font-mono text-[11px] text-on-surface-variant">Dedicated thread, files and memory for every task</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 shadow-sm">
                  <div className="w-7 h-7 rounded-lg bg-sem-green/15 flex items-center justify-center text-sem-green shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-on-surface">Verified math, not guesses</div>
                    <div className="font-mono text-[11px] text-on-surface-variant">Every calculation runs in the sandbox and is proven with run artifacts</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 shadow-sm">
                  <div className="w-7 h-7 rounded-lg bg-sem-green/15 flex items-center justify-center text-sem-green shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-on-surface">Session security</div>
                    <div className="font-mono text-[11px] text-on-surface-variant">Two-factor authentication and encrypted sessions</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-6 border-t border-outline-variant/20 flex items-center gap-3 text-[11px] font-mono text-on-surface-variant/70 select-none">
              <span>Helpotron</span>
              <span className="w-1 h-1 rounded-full bg-outline-variant" />
              <span>Metered in task tokens</span>
              <span className="w-1 h-1 rounded-full bg-outline-variant" />
              <span>No hidden fees</span>
            </div>
          </div>

          {/* ── RIGHT PANE: FORM CARD (Spec 3.2.1 / 3.2.2) ────────────── */}
          <div className="lg:col-span-6 p-6 sm:p-8 flex flex-col justify-between relative overflow-y-auto max-h-[90vh] custom-scrollbar">
            <div>
              {/* Card Header & Tab Switcher */}
              <div className="flex items-center justify-between pb-4 border-b border-outline-variant/20">
                <div>
                  <h2 className="font-title-md text-xl font-bold text-on-surface">
                    {requires2FA
                      ? 'Two-Factor Challenge'
                      : tab === 'signup'
                      ? 'Create your account'
                      : 'Sign In'}
                  </h2>
                  <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
                    {requires2FA
                      ? 'Verify your secondary security factor to continue'
                      : tab === 'signup'
                      ? 'Create your account — the 14-day trial (15,000 task tokens) unlocks after verification.'
                      : 'Welcome back to your workspace'}
                  </p>
                  {tab === 'signup' && (
                    <p className="font-body-sm text-[11px] text-on-surface-variant/80 mt-1">
                      New accounts start at 0 tokens. The trial grants 15,000 once you enable 2FA,
                      pass a $0.01 verification, and it is approved.
                    </p>
                  )}
                </div>

                {!requires2FA && (
                  <span
                    className={`font-mono text-[10px] uppercase px-2.5 py-1 rounded-full font-semibold ${
                      tab === 'signup'
                        ? 'bg-primary/15 text-primary'
                        : 'bg-secondary/15 text-secondary'
                    }`}
                  >
                    {tab === 'signup' ? 'Free trial' : 'Secure sign-in'}
                  </span>
                )}
              </div>

              {/* Inline Error Strip with Shake */}
              <AnimatePresence>
                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className={`mt-4 p-3 rounded-xl bg-error/15 border border-error/30 text-error text-xs flex items-center gap-2 ${
                      hasShaked ? 'animate-shake' : ''
                    }`}
                    role="alert"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── 2FA VERIFICATION STAGE (Spec 3.2.3) ────────────────── */}
              {requires2FA ? (
                <form onSubmit={handleLogin} className="mt-6 space-y-6">
                  <div className="text-center space-y-2">
                    <p className="font-body-sm text-xs text-on-surface-variant">
                      Enter the 6-digit verification code generated by your Authenticator App.
                    </p>
                    <SegmentedOTPInput
                      value={twoFactorCode}
                      onChange={setTwoFactorCode}
                      length={6}
                      autoFocus={true}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant px-1">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                      Authenticator App ({twoFactorMethod.toUpperCase()})
                    </span>
                    {otpCooldown > 0 ? (
                      <span className="text-sem-amber font-semibold">Resend in 00:{String(otpCooldown).padStart(2, '0')}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOtpCooldown(30)}
                        className="text-primary hover:underline cursor-pointer"
                      >
                        Resend Code
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 pt-2">
                    <Button
                      variant="primary"
                      type="submit"
                      disabled={loading || twoFactorCode.length < 6}
                      glow={true}
                      className="w-full h-11 uppercase font-semibold text-xs tracking-wider"
                    >
                      {loading ? 'Verifying...' : 'Verify & Enter Workspace →'}
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setRequires2FA(false);
                        setTwoFactorCode('');
                      }}
                      className="w-full text-center py-2 text-xs text-on-surface-variant hover:text-on-surface transition cursor-pointer"
                    >
                      ← Back to credentials
                    </button>
                  </div>
                </form>
              ) : tab === 'login' ? (
                /* ── SIGN IN FORM (Spec 3.2.1) ────────────────────────── */
                <form onSubmit={handleLogin} className="mt-5 space-y-4">
                  {/* Public ID Input */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="login-public-id" className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">
                        PUBLIC ID
                      </label>
                      <span className="font-mono text-[10px] text-on-surface-variant/60">e.g. HLP-9402-TX</span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        id="login-public-id"
                        name="username"
                        type={showLoginId ? 'text' : 'password'}
                        autoComplete="username"
                        required
                        placeholder="Your public ID"
                        value={loginId}
                        onChange={(e) => setLoginId(e.target.value)}
                        className="w-full h-11 px-3 pr-10 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 font-mono text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition"
                      />
                      <button
                        type="button"
                        aria-label="Toggle Public ID Visibility"
                        onClick={() => setShowLoginId((prev) => !prev)}
                        className="absolute right-2 p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer"
                      >
                        {showLoginId ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Password Input */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="login-passphrase" className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">
                        PASSWORD
                      </label>
                      <button
                        type="button"
                        onClick={() => setRecoveryOpen(true)}
                        className="text-[11px] text-primary hover:underline cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        id="login-passphrase"
                        name="password"
                        type={showLoginPass ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        placeholder="Enter your password"
                        value={loginPass}
                        onChange={(e) => setLoginPass(e.target.value)}
                        className="w-full h-11 px-3 pr-10 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 font-mono text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition"
                      />
                      <button
                        type="button"
                        aria-label={showLoginPass ? 'Hide password' : 'Show password'}
                        aria-pressed={showLoginPass}
                        onClick={() => setShowLoginPass((prev) => !prev)}
                        className="absolute right-2 p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer"
                      >
                        {showLoginPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Turnstile Captcha (if enabled) */}
                  {captchaEnabled && turnstileSitekey && (
                    <div className="p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 flex flex-col items-center">
                      <div ref={turnstileContainerRef} data-turnstile />
                      <span className="text-[10px] text-on-surface-variant mt-1 font-mono">
                        Cloudflare Turnstile verification module
                      </span>
                    </div>
                  )}

                  {/* Submit Button */}
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={loading}
                    glow={true}
                    className="w-full h-11 uppercase font-semibold text-xs tracking-wider flex items-center justify-center gap-2 mt-2"
                  >
                    <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>

                  {/* Footer Action Links */}
                  <div className="pt-3 border-t border-outline-variant/15 flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setTab('signup');
                        setErrorMsg('');
                      }}
                      className="text-on-surface-variant hover:text-primary transition cursor-pointer"
                    >
                      New to Helpotron? <span className="text-primary font-semibold">Create account</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecoveryOpen(true)}
                      className="text-on-surface-variant hover:text-on-surface underline underline-offset-4 decoration-outline-variant/50 cursor-pointer"
                    >
                      Recovery channel
                    </button>
                  </div>
                </form>
              ) : (
                /* ── CREATE ACCOUNT ─────────────── */
                <form onSubmit={handleSignup} className="mt-5 space-y-3.5">
                  {/* Public ID with Re-roll */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="signup-public-id" className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">
                        PUBLIC ID
                      </label>
                      <span className="font-mono text-[10px] text-primary">Auto-generated — re-roll with the dice</span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        id="signup-public-id"
                        name="username"
                        type="text"
                        required
                        value={signupId}
                        onChange={(e) => setSignupId(e.target.value)}
                        className="w-full h-11 px-3 pr-11 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 font-mono text-xs text-primary font-semibold placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition"
                      />
                      <button
                        type="button"
                        onClick={handleRerollId}
                        title="Re-roll public ID"
                        className="absolute right-1.5 p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition cursor-pointer"
                      >
                        <Dices className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Password & Entropy Meter */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="signup-passphrase" className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">
                        PASSWORD
                      </label>
                      <span className="font-mono text-[10px] text-on-surface-variant">{entropy.label}</span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        id="signup-passphrase"
                        name="password"
                        type={showSignupPass ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        placeholder="Minimum 8 characters — a letter and a number"
                        value={signupPass}
                        onChange={(e) => setSignupPass(e.target.value)}
                        className="w-full h-11 px-3 pr-10 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 font-mono text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPass((prev) => !prev)}
                        aria-label={showSignupPass ? 'Hide password' : 'Show password'}
                        aria-pressed={showSignupPass}
                        className="absolute right-2 p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer"
                      >
                        {showSignupPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {/* 4-Segment Strength Indicator */}
                    <div className="grid grid-cols-4 gap-1 pt-1">
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={`h-1 rounded-full transition-all ${
                            entropy.score >= step ? entropy.color : 'bg-surface-container-high'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1">
                    <label htmlFor="signup-passphrase-confirm" className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold block">
                      CONFIRM PASSWORD
                    </label>
                    <div className="relative flex items-center">
                      <input
                        id="signup-passphrase-confirm"
                        name="confirm-password"
                        type={showSignupConfirm ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        placeholder="Re-enter your password"
                        value={signupPassConfirm}
                        onChange={(e) => setSignupPassConfirm(e.target.value)}
                        className="w-full h-11 px-3 pr-10 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 font-mono text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupConfirm((prev) => !prev)}
                        aria-label={showSignupConfirm ? 'Hide password' : 'Show password'}
                        aria-pressed={showSignupConfirm}
                        className="absolute right-2 p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer"
                      >
                        {showSignupConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Optional Discount Code (owner 09-06: was "Institutional or Peer Pass"
                      with a hardcoded +10,000 TOKENS award — that died here. The field now
                      redeems a real referral code at /api/referrals/redeem, which grants a
                      one-time order discount: 30% new user / 15% existing. No token awards.) */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setReferralOpen((prev) => !prev)}
                      className="flex items-center justify-between w-full py-1 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer select-none"
                    >
                      <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider">
                        <Ticket className="w-3.5 h-3.5 text-secondary" />
                        Discount code (optional)
                      </span>
                      <span className="font-mono text-[10px] text-on-surface-variant/70">
                        {referralOpen ? 'hide' : 'add'}
                      </span>
                    </button>
                    {referralOpen && (
                      <div>
                        <input
                          type="text"
                          aria-label="Referral or discount code"
                          placeholder="Enter a referral or discount code"
                          value={referralCode}
                          onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                          className="w-full h-10 px-3 mt-1.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 font-mono text-xs uppercase text-on-surface focus:outline-none focus:border-secondary transition"
                        />
                        <p className="text-[10px] text-on-surface-variant mt-1">
                          A referral code grants a one-time discount on your first order. It does
                          not add tokens.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Terms Consent Checkbox */}
                  <div className="flex items-start gap-2.5 pt-1 select-none">
                    <input
                      type="checkbox"
                      id="protocol-consent"
                      checked={consentAgreed}
                      onChange={(e) => setConsentAgreed(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded text-primary focus:ring-0 cursor-pointer accent-primary"
                    />
                    <label htmlFor="protocol-consent" className="text-[11px] text-on-surface-variant leading-tight cursor-pointer">
                      I agree to the{' '}
                      <a href="#/terms" className="text-primary underline underline-offset-2 hover:opacity-80" onClick={(e) => e.stopPropagation()}>
                        Terms of Service
                      </a>{' '}
                      and{' '}
                      <a href="#/privacy" className="text-primary underline underline-offset-2 hover:opacity-80" onClick={(e) => e.stopPropagation()}>
                        Privacy Policy
                      </a>.
                    </label>
                  </div>

                  {/* Turnstile Captcha */}
                  {captchaEnabled && turnstileSitekey && (
                    <div className="p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 flex flex-col items-center">
                      <div ref={turnstileContainerRef} data-turnstile />
                    </div>
                  )}

                  {/* Submit Button */}
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={loading || !consentAgreed}
                    glow={true}
                    className="w-full h-11 uppercase font-semibold text-xs tracking-wider flex items-center justify-center gap-2 mt-2"
                  >
                    <span>{loading ? 'Creating account...' : 'Create account'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>

                  {/* Switch to login */}
                  <div className="pt-2 text-center text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setTab('login');
                        setErrorMsg('');
                      }}
                      className="text-on-surface-variant hover:text-primary transition cursor-pointer"
                    >
                      Already have an account? <span className="text-primary font-semibold">Sign in</span>
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Security Notice */}
            <div className="mt-5 pt-3 border-t border-outline-variant/15 flex items-start gap-2 text-on-surface-variant">
              <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span className="font-mono text-[10px] leading-relaxed">
                Your session is protected with encrypted password storage and optional two-factor
                authentication. If you forget your password, the recovery flow lets you set a new one.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Recovery Flow Modal (Spec 3.2.4) */}
      <RecoveryFlowModal
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        publicId={loginId || signupId}
      />
    </div>
  );
}
