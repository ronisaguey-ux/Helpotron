/* ────────────────────────────────────────────────────────────────────────────
 * SessionExpiryModal.jsx — LUMINOUS GLASS Session Expiry States Suite (Spec 3.2.5)
 *
 * Includes:
 * 1. SessionExpiryModal: In-app lock screen modal that preserves unsaved workspace
 *    mutations, parameter seeds, and draft state while requiring passphrase renewal.
 * 2. Session401Banner: Non-blocking top banner for background telemetry / sync pauses.
 * 3. Pending intent & state preservation.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useEffect } from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  LogOut,
  ShieldAlert,
  User,
  X,
} from 'lucide-react';
import { api } from '../api.js';
import Button from './Button.jsx';
import { AvatarWidget } from './ui/AvatarWidget.jsx';

/**
 * Non-blocking Silent 401 Banner for Background Polling (Spec 3.2.5 Variant B)
 */
export function Session401Banner({ onReconnect, onDismiss }) {
  return (
    <aside
      aria-label="Authentication Alert"
      className="w-full mb-4 rounded-2xl bg-surface-container-high/90 backdrop-blur-xl p-3 shadow-xl flex items-center justify-between gap-4 border border-outline-variant/30 text-on-surface z-40"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex h-2.5 w-2.5 rounded-full bg-sem-amber animate-pulse shrink-0" />
        <div className="flex items-center gap-2 min-w-0 text-xs">
          <span className="font-mono text-[10px] text-sem-amber font-semibold uppercase tracking-wider shrink-0">
            State 401
          </span>
          <span className="text-on-surface-variant truncate">
            Background sync paused <span className="text-outline-variant mx-1">/</span> Authentication required for telemetry stream
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onReconnect}
          className="h-9 px-3 rounded-xl bg-surface-container-highest hover:bg-surface-bright text-primary font-mono text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reconnect</span>
        </button>
        {onDismiss && (
          <button
            type="button"
            aria-label="Dismiss banner"
            onClick={onDismiss}
            className="w-9 h-9 rounded-xl hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
}

/**
 * Modal Lock Screen for Active Expiry (Spec 3.2.5 Variant A)
 */
export default function SessionExpiryModal({
  isOpen,
  user,
  onSessionRestored,
  onSwitchAccount,
}) {
  const [passphrase, setPassphrase] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hasShaked, setHasShaked] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState('totp');
  const [twoFactorCode, setTwoFactorCode] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPassphrase('');
      setErrorMsg('');
      setRequires2FA(false);
      setTwoFactorCode('');
    }
  }, [isOpen]);

  const triggerError = (msg) => {
    setErrorMsg(msg);
    setHasShaked(true);
    setTimeout(() => setHasShaked(false), 500);
  };

  const handleUnlock = async (e) => {
    e?.preventDefault();
    const publicId = user?.public_id || localStorage.getItem('public_id') || '';
    if (!passphrase) {
      triggerError('Please enter your passphrase to unlock workspace.');
      return;
    }
    if (requires2FA && !twoFactorCode.trim()) {
      triggerError('Please enter your 2FA verification code.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const codeToSend = requires2FA ? twoFactorCode.trim() : null;
      const res = await api.login(publicId, passphrase, codeToSend, null);
      if (res && res.status === '2fa_required') {
        setRequires2FA(true);
        setTwoFactorMethod(res.method || 'totp');
      } else if (res && (res.message === 'Logged in' || res.status === 'ok')) {
        onSessionRestored?.(publicId);
      } else {
        triggerError('Invalid credentials. Verify your passphrase or 2FA code.');
      }
    } catch (err) {
      triggerError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const publicId = user?.public_id || localStorage.getItem('public_id') || 'Operator';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-lg select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expired-heading"
    >
      <div
        className="w-full max-w-md rounded-3xl bg-surface-container-lowest/95 backdrop-blur-2xl border border-outline-variant/30 p-6 sm:p-8 shadow-2xl relative overflow-hidden text-on-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Lock Icon Emblem */}
        <div className="text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-surface-container-high/90 border border-outline-variant/30 flex items-center justify-center text-sem-amber shadow-[0_0_24px_rgba(245,158,11,0.2)] mb-4">
            <Lock className="w-7 h-7" />
          </div>

          <h1
            id="session-expired-heading"
            className="font-headline-lg text-xl sm:text-2xl text-on-surface font-semibold tracking-tight"
          >
            Session Expired
          </h1>

          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high/80 text-sem-amber font-mono text-[10px] uppercase tracking-wider font-semibold border border-sem-amber/20">
            <span className="w-1.5 h-1.5 rounded-full bg-sem-amber animate-ping" />
            <span>Inactive for 24 hours</span>
          </div>

          <p className="mt-3.5 font-body-sm text-xs text-on-surface-variant leading-relaxed">
            Your cryptographic bearer token has expired. All unsaved workspace mutations, parameter seeds, and citations have been safely sealed in local storage.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleUnlock} className="mt-6 space-y-4">
          {/* Active Operator Pill */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-container-low/80 border border-outline-variant/20">
            <div className="flex items-center gap-3 min-w-0">
              <AvatarWidget user={user} size="sm" />
              <div className="flex flex-col min-w-0 text-left">
                <span className="font-mono text-xs font-semibold text-on-surface truncate">
                  {publicId}
                </span>
                <span className="font-mono text-[10px] text-on-surface-variant truncate">
                  Local Workspace Locked
                </span>
              </div>
            </div>
            <span className="font-mono text-[9px] px-2 py-0.5 rounded bg-primary/15 text-primary uppercase font-medium">
              Active Node
            </span>
          </div>

          {/* Passphrase Input */}
          <div className="space-y-1 text-left">
            <label
              htmlFor="session-passphrase"
              className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold block"
            >
              Session Passphrase / Node PIN
            </label>
            <div className="relative flex items-center">
              <input
                id="session-passphrase"
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                autoFocus={!requires2FA}
                required
                placeholder="Enter key to renew bearer context..."
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="w-full h-11 px-3.5 pr-10 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 font-mono text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition"
              />
              <button
                type="button"
                onClick={() => setShowPass((prev) => !prev)}
                className="absolute right-2 p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer"
                aria-label="Toggle password visibility"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 2FA Verification Input (when 2FA is required) */}
          {requires2FA && (
            <div className="space-y-1 text-left">
              <label
                htmlFor="session-2fa-code"
                className="font-mono text-[11px] uppercase tracking-wider text-sem-amber font-semibold block"
              >
                2FA Verification Code ({twoFactorMethod.toUpperCase()})
              </label>
              <input
                id="session-2fa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                maxLength={twoFactorMethod === 'email' ? 12 : 6}
                placeholder={twoFactorMethod === 'email' ? '12-digit email code' : '6-digit authenticator code'}
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, twoFactorMethod === 'email' ? 12 : 6))}
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low/70 border border-sem-amber/40 font-mono text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-sem-amber focus:ring-1 focus:ring-sem-amber transition"
              />
              <span className="font-mono text-[10px] text-on-surface-variant">
                {twoFactorMethod === 'email' ? 'Enter the 12-digit code emailed to your address.' : 'Enter the 6-digit code from your authenticator app.'}
              </span>
            </div>
          )}

          {/* Error Strip */}
          {errorMsg && (
            <div
              className={`p-3 rounded-xl bg-error/15 border border-error/30 text-error text-xs flex items-center gap-2 font-mono ${
                hasShaked ? 'animate-shake' : ''
              }`}
              role="alert"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Submit Action */}
          <Button
            variant="primary"
            glow={true}
            type="submit"
            disabled={loading || !passphrase || (requires2FA && !twoFactorCode.trim())}
            className="w-full h-12 uppercase font-semibold text-xs tracking-wider flex items-center justify-center gap-2 mt-2"
          >
            <span>{loading ? 'Validating Token...' : requires2FA ? 'Verify 2FA & Unlock Workspace' : 'Resume Session & Unlock Workspace'}</span>
            <ArrowRight className="w-4 h-4" />
          </Button>

          {/* Secondary Switch Operator / Sign Out */}
          <div className="pt-3 border-t border-outline-variant/15 flex items-center justify-between text-xs font-mono">
            <button
              type="button"
              onClick={onSwitchAccount}
              className="text-on-surface-variant hover:text-on-surface transition cursor-pointer flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Switch Operator Node</span>
            </button>
            <span className="text-on-surface-variant/50">Helpotron OS</span>
          </div>
        </form>
      </div>
    </div>
  );
}
