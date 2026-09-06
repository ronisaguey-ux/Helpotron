/* ────────────────────────────────────────────────────────────────────────────
 * TwoFactorSetup.jsx — LUMINOUS GLASS 2FA Configuration Widget (Spec 3.2.3)
 *
 * Requirements:
 * - 6-cell segmented OTP input (SegmentedOTPInput primitive)
 * - Auto-advance, paste-spread, backspace retreat
 * - Shake animation + inline error state
 * - 30s resend cooldown mono countdown
 * - Honest server captions (Authenticator App TOTP, Email, SMS; zero fake hardware claims)
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Mail,
  MessageSquare,
  Key,
  QrCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { api } from '../api.js';
import SegmentedOTPInput from './ui/SegmentedOTPInput.jsx';
import Button from './Button.jsx';

export default function TwoFactorSetup({ s, set }) {
  const [method, setMethod] = useState('totp');
  const [setupStep, setSetupStep] = useState('idle'); // idle | method_select | configuring | disabling
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [hasError, setHasError] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // Server state is authoritative (user.settings["2fa_enabled"] via the
  // settings sync); the parsed local flag is kept only as the widget's own
  // just-verified result. The legacy root-level twoFactorEnabled toggle was a
  // client-only fake and is deliberately NOT counted.
  const [enabled, setEnabled] = useState(Boolean(s?.['2fa_enabled'] || s?.privacy?.twoFactorEnabled));

  useEffect(() => {
    setEnabled(Boolean(s?.['2fa_enabled'] || s?.privacy?.twoFactorEnabled));
  }, [s]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const triggerError = (text) => {
    setMsg({ text, type: 'error' });
    setHasError(true);
    setTimeout(() => setHasError(false), 500);
  };

  const startSetup = async () => {
    setLoading(true);
    setMsg({ text: '', type: '' });
    try {
      const res = await api.setup2FA(method, s?.profile?.phone || null);
      if (res && res.status === 'success') {
        setSecret(res.secret || '');
        setSetupStep('configuring');
        setCooldown(30);
        setCode('');
        if (res.message) setMsg({ text: res.message, type: 'info' });
      } else {
        triggerError(res?.detail || 'Could not initiate two-factor setup.');
      }
    } catch (err) {
      triggerError(err.message || 'Error starting 2FA setup.');
    } finally {
      setLoading(false);
    }
  };

  const verifySetup = async () => {
    if (code.length < 6) {
      triggerError('Please enter the full 6-digit passcode.');
      return;
    }
    setLoading(true);
    setMsg({ text: '', type: '' });
    try {
      const res = await api.verifySetup2FA(method, code.trim(), secret);
      if (res && res.status === 'success') {
        setEnabled(true);
        setSetupStep('idle');
        setCode('');
        set?.({ privacy: { ...s?.privacy, twoFactorEnabled: true, twoFactorMethod: method } });
        setMsg({ text: 'Two-Factor Authentication is now active on your account.', type: 'success' });
      } else {
        triggerError(res?.detail || 'Invalid verification passcode.');
      }
    } catch (err) {
      triggerError(err.message || 'Verification failed. Please check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    if (code.length < 6) {
      triggerError('Please enter your 6-digit confirmation code.');
      return;
    }
    setLoading(true);
    setMsg({ text: '', type: '' });
    try {
      const res = await api.disable2FA(code.trim());
      if (res && res.status === 'success') {
        setEnabled(false);
        setSetupStep('idle');
        setCode('');
        set?.({ privacy: { ...s?.privacy, twoFactorEnabled: false } });
        setMsg({ text: 'Two-Factor Authentication has been successfully disabled.', type: 'info' });
      } else {
        triggerError(res?.detail || 'Failed to disable 2FA.');
      }
    } catch (err) {
      triggerError(err.message || 'Failed to disable 2FA.');
    } finally {
      setLoading(false);
    }
  };

  const methods = [
    {
      key: 'totp',
      label: 'Authenticator App',
      desc: 'RFC 6238 TOTP (Google Auth, 1Password, Aegis)',
      Icon: Smartphone,
    },
    {
      key: 'email',
      label: 'Email Verification',
      desc: 'One-time passcode dispatched to your email address',
      Icon: Mail,
    },
    {
      key: 'sms',
      label: 'SMS Text Message',
      desc: 'One-time passcode delivered via carrier SMS',
      Icon: MessageSquare,
    },
  ];

  return (
    <div className="p-6 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm space-y-5">
      {/* Header & Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            enabled ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant'
          }`}>
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="font-title-md text-sm font-bold text-on-surface">Two-Factor Authentication</div>
            <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
              Protect your account with a second verification step (Authenticator App, email, or SMS).
            </p>
          </div>
        </div>
        <span
          className={`font-mono text-[10px] uppercase tracking-wider px-3 py-1 rounded-full font-semibold ${
            enabled ? 'bg-sem-green/15 text-sem-green border border-sem-green/30' : 'bg-surface-container-high text-on-surface-variant'
          }`}
        >
          {enabled ? 'Active' : 'Disabled'}
        </span>
      </div>

      {/* Status Feedback Message */}
      {msg.text && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-center gap-2 font-mono ${
            msg.type === 'error'
              ? 'bg-error/15 border border-error/30 text-error'
              : 'bg-primary/15 border border-primary/30 text-primary'
          }`}
          role="alert"
        >
          {msg.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Idle State */}
      {setupStep === 'idle' && (
        <div className="flex items-center gap-3 pt-1">
          {!enabled ? (
            <Button
              variant="primary"
              glow={true}
              onClick={() => setSetupStep('method_select')}
              className="text-xs uppercase tracking-wider font-semibold py-2.5 px-4"
            >
              Configure Two-Factor Auth
            </Button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSetupStep('disabling');
                setCode('');
                setMsg({ text: '', type: '' });
              }}
              className="px-4 py-2 rounded-xl bg-error/15 border border-error/30 hover:bg-error/25 text-error font-mono text-xs uppercase tracking-wider font-semibold transition cursor-pointer min-h-[44px]"
            >
              Disable 2FA
            </button>
          )}
        </div>
      )}

      {/* Step 1: Method Selection */}
      {setupStep === 'method_select' && (
        <div className="space-y-4 pt-4 border-t border-outline-variant/20">
          <label className="block font-mono text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">
            Select Secondary Verification Protocol:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {methods.map(({ key, label, desc, Icon }) => {
              const isSelected = method === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMethod(key)}
                  className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between min-h-[44px] ${
                    isSelected
                      ? 'bg-primary-container/20 border-primary text-on-surface shadow-[0_0_16px_rgba(89,216,201,0.15)]'
                      : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-primary' : 'text-on-surface-variant'}`} />
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-on-surface">{label}</div>
                    <div className="font-mono text-[10px] text-on-surface-variant leading-tight mt-1">{desc}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="primary"
              disabled={loading}
              onClick={startSetup}
              className="text-xs uppercase tracking-wider font-semibold py-2.5 px-4"
            >
              {loading ? 'Initiating...' : 'Continue with Selected Protocol →'}
            </Button>
            <button
              type="button"
              onClick={() => setSetupStep('idle')}
              className="px-4 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface-variant hover:text-on-surface font-mono text-xs uppercase tracking-wider transition cursor-pointer min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Code Verification (Segmented OTP) */}
      {setupStep === 'configuring' && (
        <div className="space-y-4 pt-4 border-t border-outline-variant/20">
          {method === 'totp' ? (
            <div className="space-y-3">
              <p className="font-body-sm text-xs text-on-surface leading-relaxed">
                Add this cryptographic key to your Authenticator App (Aegis, 1Password, Google Authenticator):
              </p>
              <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30 text-center font-mono text-xs text-primary select-all break-all tracking-wider shadow-inner">
                {secret}
              </div>
            </div>
          ) : (
            <p className="font-body-sm text-xs text-on-surface">
              A 6-digit verification code has been dispatched via <span className="font-semibold uppercase">{method}</span>.
            </p>
          )}

          <div className="space-y-2 text-center">
            <label className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant block font-semibold">
              Enter 6-Digit Passcode
            </label>
            <SegmentedOTPInput
              value={code}
              onChange={setCode}
              length={6}
              error={hasError}
              autoFocus={true}
            />
          </div>

          <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant px-1">
            <span>Method: {method.toUpperCase()}</span>
            {cooldown > 0 ? (
              <span className="text-sem-amber font-semibold">
                Resend code in 00:{String(cooldown).padStart(2, '0')}
              </span>
            ) : (
              <button
                type="button"
                onClick={startSetup}
                className="text-primary hover:underline cursor-pointer flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Resend Code
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="primary"
              disabled={loading || code.length < 6}
              onClick={verifySetup}
              glow={true}
              className="text-xs uppercase tracking-wider font-semibold py-2.5 px-5"
            >
              {loading ? 'Verifying...' : 'Activate Two-Factor Authentication'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setSetupStep('idle');
                setCode('');
              }}
              className="px-4 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface-variant hover:text-on-surface font-mono text-xs uppercase tracking-wider transition cursor-pointer min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Disabling 2FA (Segmented OTP confirmation) */}
      {setupStep === 'disabling' && (
        <div className="space-y-4 pt-4 border-t border-outline-variant/20">
          <p className="font-body-sm text-xs text-on-surface">
            Enter your active 6-digit 2FA passcode to verify your identity before disabling:
          </p>
          <div className="space-y-2 text-center">
            <SegmentedOTPInput
              value={code}
              onChange={setCode}
              length={6}
              error={hasError}
              autoFocus={true}
            />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              disabled={loading || code.length < 6}
              onClick={disable}
              className="px-5 py-2.5 rounded-xl bg-error text-white hover:bg-error/90 disabled:opacity-40 font-mono text-xs uppercase tracking-wider font-semibold transition cursor-pointer shadow-sm min-h-[44px]"
            >
              {loading ? 'Disabling...' : 'Confirm Turn Off'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSetupStep('idle');
                setCode('');
              }}
              className="px-4 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface-variant hover:text-on-surface font-mono text-xs uppercase tracking-wider transition cursor-pointer min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
