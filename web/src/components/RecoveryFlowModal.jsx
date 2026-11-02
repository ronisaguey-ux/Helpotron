/* ────────────────────────────────────────────────────────────────────────────
 * RecoveryFlowModal.jsx — Real Channel Recovery Flow & Key Reset (Spec 3.2.4)
 *
 * 4-Step Pipeline:
 * 1. Identity & Channel Selection (email / phone / ask-developer ticket)
 * 2. Segmented OTP Verification (6 cells, cooldown timer, edit channel fallback)
 * 3. Cryptographic Passphrase Reset (new master passphrase + match indicator)
 * 4. Sync Complete (credentials synchronized, return to sign in)
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Mail,
  Phone,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  Edit2,
  RefreshCw,
  Send,
  Eye,
  EyeOff,
  Clock,
  Check,
} from 'lucide-react';
import api from '../api.js';
import SegmentedOTPInput from './ui/SegmentedOTPInput.jsx';
import Button from './Button.jsx';

export default function RecoveryFlowModal({ open, onClose, publicId = '' }) {
  const [step, setStep] = useState(1); // 1: Identity/Channel, 2: OTP, 3: Reset, 4: Done
  const [targetId, setTargetId] = useState(publicId || '');
  const [options, setOptions] = useState(null); // { email_set, phone_set, email_masked, phone_masked }
  const [selectedChannel, setSelectedChannel] = useState('email'); // email | phone | dev
  const [otpCode, setOtpCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // Ask Developer / Help Ticket inline drawer
  const [devMessage, setDevMessage] = useState('');
  const [devSent, setDevSent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1);
      setTargetId(publicId || '');
      setOtpCode('');
      setNewPass('');
      setConfirmPass('');
      setErrorMsg('');
      setDevMessage('');
      setDevSent(false);
      if (publicId) {
        fetchOptions(publicId);
      }
    }
  }, [open, publicId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const triggerError = (msg) => {
    setErrorMsg(msg);
    setHasError(true);
    setTimeout(() => setHasError(false), 500);
  };

  const fetchOptions = async (id) => {
    if (!id.trim()) return;
    try {
      const res = await api.recoveryOptions(id.trim());
      setOptions(res);
      if (res?.email_set) setSelectedChannel('email');
      else if (res?.phone_set) setSelectedChannel('phone');
      else setSelectedChannel('dev');
    } catch {
      setOptions(null);
    }
  };

  const handleRequestOtp = async (channelOverride) => {
    const id = targetId.trim();
    if (!id) {
      triggerError('Please enter your Public ID or registered handle.');
      return;
    }
    const channel = channelOverride || selectedChannel;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.recoveryRequest(id, channel);
      if (res.delivered !== false) {
        setCooldown(30);
        setStep(2);
      } else {
        triggerError(res.message || 'Dispatch to requested channel failed. Try asking the developer.');
      }
    } catch (err) {
      triggerError(err.message || 'Could not dispatch recovery challenge.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = (e) => {
    e?.preventDefault();
    if (otpCode.length < 6) {
      triggerError('Please enter the complete 6-digit passcode.');
      return;
    }
    setStep(3);
    setErrorMsg('');
  };

  const handleResetPassword = async (e) => {
    e?.preventDefault();
    if (newPass.length < 8) {
      triggerError('Passphrase must be at least 8 characters long.');
      return;
    }
    if (newPass !== confirmPass) {
      triggerError('Passphrases do not match. Please verify.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      await api.recoveryVerify({
        public_id: targetId.trim(),
        new_password: newPass,
        code: otpCode.trim(),
      });
      setStep(4);
    } catch (err) {
      triggerError(err.message || 'Key renewal failed. Verification code may be invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendDevTicket = async () => {
    if (!devMessage.trim()) {
      triggerError('Please explain the issue to the developer.');
      return;
    }
    setLoading(true);
    try {
      await api.sendMessageToAdmin({
        subject: `Account Recovery Assistance: ${targetId.trim()}`,
        category: 'recovery',
        message: devMessage.trim(),
      });
      setDevSent(true);
      setErrorMsg('');
    } catch (err) {
      triggerError(err.message || 'Could not send developer ticket.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Account Recovery & Credential Reset"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface-container-lowest/95 border border-outline-variant/30 rounded-3xl p-6 sm:p-8 text-on-surface shadow-2xl relative overflow-hidden backdrop-blur-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close recovery modal"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header with Icon */}
        <div className="flex items-center gap-3.5 pb-5 border-b border-outline-variant/20">
          <div className="w-11 h-11 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(89,216,201,0.2)]">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-headline-lg text-lg sm:text-xl font-bold text-on-surface leading-tight">
              Account Recovery &amp; Credential Reset
            </h1>
            <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
              Cryptographic key reset &amp; verified account restoration channel (Spec 3.2.4).
            </p>
          </div>
        </div>

        {/* 4-Step Progress Pipeline */}
        <div className="my-6">
          <div className="flex items-center justify-between relative">
            {/* Background Line */}
            <div className="absolute top-3.5 left-4 right-4 h-0.5 bg-surface-container-high -z-0" />
            {/* Active Line */}
            <div
              className="absolute top-3.5 left-4 h-0.5 bg-primary -z-0 transition-all duration-300"
              style={{ width: `${((step - 1) / 3) * 100}%` }}
            />

            {[
              { num: 1, label: '1. Identity' },
              { num: 2, label: '2. Verify OTP' },
              { num: 3, label: '3. Reset Key' },
              { num: 4, label: '4. Complete' },
            ].map(({ num, label }) => {
              const isPassed = step > num;
              const isCurrent = step === num;
              return (
                <div key={num} className="relative z-10 flex flex-col items-center select-none">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-bold transition-all ${
                      isPassed
                        ? 'bg-primary text-on-primary shadow-[0_0_12px_rgba(89,216,201,0.35)]'
                        : isCurrent
                        ? 'bg-primary text-on-primary ring-4 ring-primary/20 shadow-[0_0_16px_rgba(89,216,201,0.5)]'
                        : 'bg-surface-container-highest text-on-surface-variant'
                    }`}
                  >
                    {isPassed ? <Check className="w-3.5 h-3.5" /> : num}
                  </div>
                  <span
                    className={`font-mono text-[10px] mt-1.5 uppercase tracking-wider ${
                      isCurrent || isPassed ? 'text-primary font-semibold' : 'text-on-surface-variant/70'
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Error Feedback */}
        {errorMsg && (
          <div
            className={`mb-5 p-3 rounded-xl bg-error/15 border border-error/30 text-error text-xs flex items-center gap-2 font-mono ${
              hasError ? 'animate-shake' : ''
            }`}
            role="alert"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ── STEP 1: IDENTITY & CHANNEL ──────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="recovery-public-id" className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold block">
                Target Public ID
              </label>
              <input
                id="recovery-public-id"
                type="text"
                placeholder="Your public ID"
                value={targetId}
                onChange={(e) => {
                  setTargetId(e.target.value);
                  fetchOptions(e.target.value);
                }}
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 font-mono text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition"
              />
            </div>

            <div className="space-y-2 pt-1">
              <label className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold block">
                Available Verification Channels:
              </label>

              {/* Email Option */}
              <button
                type="button"
                onClick={() => setSelectedChannel('email')}
                className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition cursor-pointer min-h-[44px] ${
                  selectedChannel === 'email'
                    ? 'bg-primary/10 border-primary text-on-surface'
                    : 'bg-surface-container-low/60 border-outline-variant/20 text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Mail className={`w-4 h-4 ${selectedChannel === 'email' ? 'text-primary' : ''}`} />
                  <div>
                    <div className="text-xs font-semibold">Registered Email</div>
                    <div className="font-mono text-[10px] text-on-surface-variant">
                      {options?.email_masked || 'Channel recorded at account registration'}
                    </div>
                  </div>
                </div>
                {selectedChannel === 'email' && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
              </button>

              {/* Phone Option */}
              <button
                type="button"
                onClick={() => setSelectedChannel('phone')}
                className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition cursor-pointer min-h-[44px] ${
                  selectedChannel === 'phone'
                    ? 'bg-primary/10 border-primary text-on-surface'
                    : 'bg-surface-container-low/60 border-outline-variant/20 text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Phone className={`w-4 h-4 ${selectedChannel === 'phone' ? 'text-primary' : ''}`} />
                  <div>
                    <div className="text-xs font-semibold">SMS Phone Verification</div>
                    <div className="font-mono text-[10px] text-on-surface-variant">
                      {options?.phone_masked || 'Channel recorded in user security settings'}
                    </div>
                  </div>
                </div>
                {selectedChannel === 'phone' && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
              </button>

              {/* Developer Ticket Option (Absorbs DevContactModal) */}
              <button
                type="button"
                onClick={() => setSelectedChannel('dev')}
                className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition cursor-pointer min-h-[44px] ${
                  selectedChannel === 'dev'
                    ? 'bg-secondary/10 border-secondary text-on-surface'
                    : 'bg-surface-container-low/60 border-outline-variant/20 text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <MessageSquare className={`w-4 h-4 ${selectedChannel === 'dev' ? 'text-secondary' : ''}`} />
                  <div>
                    <div className="text-xs font-semibold">Ask the Developer / Help Ticket</div>
                    <div className="font-mono text-[10px] text-on-surface-variant">
                      Direct operator assistance for forgotten credentials
                    </div>
                  </div>
                </div>
                {selectedChannel === 'dev' && <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />}
              </button>
            </div>

            {selectedChannel === 'dev' ? (
              <div className="p-4 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 space-y-3">
                <div className="text-xs font-semibold text-on-surface">Submit Recovery Ticket to Developer</div>
                {devSent ? (
                  <div className="p-3 rounded-lg bg-sem-green/15 text-sem-green text-xs font-mono">
                    ✅ Recovery ticket sent. The developer will review and issue your recovery code.
                  </div>
                ) : (
                  <>
                    <textarea
                      rows={3}
                      placeholder="Briefly describe your account details or student email..."
                      value={devMessage}
                      onChange={(e) => setDevMessage(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs font-body-sm text-on-surface focus:outline-none focus:border-secondary transition"
                    />
                    <Button
                      variant="primary"
                      disabled={loading || !devMessage.trim()}
                      onClick={handleSendDevTicket}
                      className="w-full text-xs uppercase tracking-wider py-2 font-semibold"
                    >
                      {loading ? 'Dispatching...' : 'Send Message to Developer'}
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <Button
                variant="primary"
                glow={true}
                disabled={loading || !targetId.trim()}
                onClick={() => handleRequestOtp()}
                className="w-full h-11 uppercase font-semibold text-xs tracking-wider flex items-center justify-center gap-2 mt-2"
              >
                <span>{loading ? 'Dispatching Passcode...' : 'Send Recovery Code →'}</span>
              </Button>
            )}
          </div>
        )}

        {/* ── STEP 2: VERIFY OTP ──────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Channel Recipient Badge with Edit Button */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low/80 border border-outline-variant/20">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  {selectedChannel === 'phone' ? <Phone className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant">Send to</div>
                  <div className="text-xs font-semibold text-on-surface truncate">
                    {targetId} via {selectedChannel.toUpperCase()}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1 font-mono text-[11px] text-primary hover:underline cursor-pointer"
              >
                <Edit2 className="w-3 h-3" /> Edit
              </button>
            </div>

            {/* Segmented OTP 6-Cell Form */}
            <div className="space-y-2 text-center">
              <label className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold block">
                Cryptographic Passcode (6-Digit OTP)
              </label>
              <SegmentedOTPInput
                value={otpCode}
                onChange={setOtpCode}
                length={6}
                error={hasError}
                autoFocus={true}
              />
            </div>

            {/* Cooldown Timer */}
            <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant px-1">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sem-amber animate-spin" />
                {cooldown > 0 ? (
                  <span>Resend in <span className="font-semibold text-sem-amber">00:{String(cooldown).padStart(2, '0')}</span></span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRequestOtp()}
                    disabled={loading}
                    className="text-primary hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Resend Code Now
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedChannel('dev');
                  setStep(1);
                }}
                className="hover:text-primary transition underline underline-offset-4"
              >
                Ask the Developer
              </button>
            </div>

            {/* Security Notice */}
            <div className="p-3.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-mono text-[10px] uppercase tracking-wider text-primary font-semibold">
                  Security Notice
                </div>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Existing sessions are invalidated when you set a new password.
                </p>
              </div>
            </div>

            {/* Next Action */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="primary"
                glow={true}
                disabled={otpCode.length < 6}
                onClick={handleVerifyOtp}
                className="flex-1 h-11 uppercase font-semibold text-xs tracking-wider flex items-center justify-center gap-2"
              >
                <span>Verify &amp; Proceed to Reset →</span>
              </Button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 h-11 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface-variant hover:text-on-surface font-mono text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: RESET KEY ───────────────────────────────────────── */}
        {step === 3 && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="recovery-new-pass" className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold block">
                New Master Passphrase
              </label>
              <div className="relative flex items-center">
                <input
                  id="recovery-new-pass"
                  type={showPass ? 'text' : 'password'}
                  required
                  placeholder="Minimum 8 characters — a letter and a number"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className="w-full h-11 px-3.5 pr-10 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 font-mono text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((prev) => !prev)}
                  aria-label={showPass ? 'Hide passphrase' : 'Show passphrase'}
                  aria-pressed={showPass}
                  className="absolute right-2 p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface transition cursor-pointer"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="recovery-confirm-pass" className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold block">
                Confirm New Master Passphrase
              </label>
              <div className="relative flex items-center">
                <input
                  id="recovery-confirm-pass"
                  type={showConfirmPass ? 'text' : 'password'}
                  required
                  placeholder="Re-enter new passphrase..."
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className="w-full h-11 px-3.5 pr-10 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 font-mono text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPass((prev) => !prev)}
                  aria-label={showConfirmPass ? 'Hide passphrase' : 'Show passphrase'}
                  aria-pressed={showConfirmPass}
                  className="absolute right-2 p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface transition cursor-pointer"
                >
                  {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              variant="primary"
              glow={true}
              type="submit"
              disabled={loading || !newPass || newPass !== confirmPass}
              className="w-full h-11 uppercase font-semibold text-xs tracking-wider flex items-center justify-center gap-2 mt-2"
            >
              <span>{loading ? 'Renewing Passphrase...' : 'Save New Password →'}</span>
            </Button>
          </form>
        )}

        {/* ── STEP 4: COMPLETE ────────────────────────────────────────── */}
        {step === 4 && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-sem-green/15 text-sem-green mx-auto flex items-center justify-center shadow-[0_0_24px_rgba(34,197,94,0.3)]">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h2 className="font-title-md text-xl font-bold text-on-surface">
                Credential Reset Complete
              </h2>
              <p className="font-body-sm text-xs text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                Your password has been updated. You can now sign in with your new password.
              </p>
            </div>
            <Button
              variant="primary"
              glow={true}
              onClick={onClose}
              className="w-full h-11 uppercase font-semibold text-xs tracking-wider mt-4"
            >
              Return to Sign In &amp; Enter Workspace
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
