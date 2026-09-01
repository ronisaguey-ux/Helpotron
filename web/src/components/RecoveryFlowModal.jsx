// export target: web/src/components/RecoveryFlowModal.jsx
/* ────────────────────────────────────────────────────────────────────────────
 * RecoveryFlowModal.jsx — forgot-password / recovery flow (operator 08-28).
 * Three channels: (a) email code, (b) phone code, (c) ask the developer.
 * Email/phone read the server-recorded contact; when unset the card says so
 * and nudges to (c) — or the user can save a contact inline right there.
 * The dev option pings the developer on Telegram and the code arrives with
 * them; the user then redeems code + new password (old one NOT needed).
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Mail, Phone, UserCog, KeyRound } from 'lucide-react';
import api from '../api.js';

const CARD = 'p-4 rounded-2xl border text-left transition cursor-pointer w-full';
const CARD_OFF = `${CARD} bg-surface-container-low border-outline-variant/30 opacity-55 cursor-not-allowed`;
const CARD_ON = `${CARD} bg-surface-container-low border-outline-variant/30 hover:border-primary text-on-surface`;
const CARD_DEV = `${CARD} bg-secondary-container/10 border-secondary/30 hover:border-secondary text-on-surface`;
// text-base (>= 16px computed) so iOS/Safari never auto-zooms the field on focus.
const INPUT = 'w-full px-4 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-base text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary';
const BTN = 'px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-label-caps text-xs uppercase tracking-wider font-semibold transition cursor-pointer shadow-sm';
const BTN_SUB = 'px-4 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/30 font-label-caps text-xs uppercase tracking-wider text-on-surface-variant hover:text-on-surface transition cursor-pointer';

export default function RecoveryFlowModal({ open, onClose, publicId }) {
  const [step, setStep] = useState('options'); // options | enter | done
  const [status, setStatus] = useState(null);  // { email_set, phone_set, email_masked, phone_masked }
  const [emailInput, setEmailInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [msg, setMsg] = useState(null);        // { ok, text }
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState(null);  // email | phone | dev
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep('options');
    setStatus(null);
    setMsg(null);
    setCode(''); setPw(''); setPw2(''); setMethod(null);
    setEmailInput(''); setPhoneInput('');
    api.recoveryOptions(publicId).then(setStatus).catch(() => setStatus(null));
  }, [open, publicId]);

  const request = async (m) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.recoveryRequest(publicId, m);
      setMethod(m);
      setMsg({ ok: res.delivered !== false, text: res.message });
      if (res.delivered !== false) {
        setStep('enter');
      } else {
        // channel send failed server-side — offer the dev lane immediately
        setStep('options');
      }
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const saveContact = async (kind) => {
    const val = kind === 'email' ? emailInput : phoneInput;
    if (!val.trim()) return;
    setSavingContact(true);
    setMsg(null);
    try {
      const res = await api.recoverySetContact(
        kind === 'email' ? { email: val.trim() } : { phone: val.trim() }
      );
      setStatus((s) => ({ ...(s || {}), ...res }));
      setEmailInput(''); setPhoneInput('');
      setMsg({ ok: true, text: `${kind === 'email' ? 'Email' : 'Phone'} saved — you can now send a code to it.` });
      const updated = await api.recoveryOptions(publicId);
      setStatus(updated);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSavingContact(false);
    }
  };

  // WebKit replay (08-29): pointer-events must NOT ride the CSS animation clock
  // (WebKit can stall the fade for seconds+; a keyframe-carried flip could leave
  // the modal permanently non-hit-testable). Flip on the animation's end event
  // with a hard-timer safety net — same contract as AuthModal/PrivacyPolicyModal.
  const [peReady, setPeReady] = useState(false);
  useEffect(() => {
    if (!open) { setPeReady(false); return; }
    const t = setTimeout(() => setPeReady(true), 4500);
    return () => clearTimeout(t);
  }, [open]);
  const onPanelAnimEnd = (e) => {
    if (e.animationName === 'aurora-panel-in') setPeReady(true);
  };

  const submitRedeem = async () => {
    setMsg(null);
    if (!code.trim()) { setMsg({ ok: false, text: 'Enter the recovery code from your email/phone/developer.' }); return; }
    if (pw.length < 8) { setMsg({ ok: false, text: 'New password must be at least 8 characters.' }); return; }
    if (pw !== pw2) { setMsg({ ok: false, text: 'New passwords do not match.' }); return; }
    setBusy(true);
    try {
      await api.recoveryVerify({ public_id: publicId, new_password: pw, code: code.trim() });
      setStep('done');
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  // Portal (08-29): this modal lives inside SettingsSections, whose Account
  // section is a .clean-card with a backdrop-filter — a backdrop-filter turns
  // the section into the CONTAINING BLOCK for `fixed` descendants, so the
  // backdrop's inset-0 resolved against the section ([436,1427] at 390×844)
  // instead of the viewport: the overlay covered only the settings card, the
  // bottom nav rendered over the modal, and its content sat mid-page.
  // Portal to <body> so the modal always covers the real viewport.
  return createPortal(
    <div className={`fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 aurora-modal-backdrop ${peReady ? 'pointer-events-auto' : 'pointer-events-none'}`} onClick={onClose}>
      {/* Aurora modal chrome (scoped; index.css owns the design system).
          pointer-events is state-driven (see peReady above), never keyframe-driven. */}
      <style>{`@keyframes aurora-backdrop-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes aurora-panel-in { from { opacity: 0; transform: translateY(12px) scale(0.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
.aurora-modal-backdrop { animation: aurora-backdrop-in 0.18s ease-out both }
.aurora-modal-panel { animation: aurora-panel-in 0.22s ease-out both }
.recovery-card-on {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
}
.recovery-card-on:hover { background: color-mix(in srgb, var(--accent) 25%, transparent); }
.recovery-card-dev {
  background: color-mix(in srgb, var(--accent-2) 15%, transparent);
  border-color: color-mix(in srgb, var(--accent-2) 40%, transparent);
}
.recovery-card-dev:hover { background: color-mix(in srgb, var(--accent-2) 25%, transparent); }`}</style>
      <div
        className={`w-full max-w-md bg-surface-container-lowest border border-outline-variant/30 rounded-3xl shadow-2xl max-h-[85vh] overflow-y-auto aurora-modal-panel ${peReady ? 'pointer-events-auto' : 'pointer-events-none'}`}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={onPanelAnimEnd}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/30">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            <h2 className="font-headline-lg text-title-md text-on-surface">Recover your password</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-on-surface-variant hover:text-on-surface transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {step === 'options' && (
            <>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Pick how to get a 6-digit recovery code. It stays valid 30 minutes and
                works <b>without your current password</b>.
              </p>

              {/* (a) EMAIL */}
              <button
                type="button"
                disabled={status ? !status.email_set : true}
                onClick={() => request('email')}
                className={status?.email_set ? CARD_ON : CARD_OFF}
              >
                <div className="flex items-center gap-2.5">
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs font-semibold flex-1">
                    {status?.email_set ? <>Send code <span className="text-[var(--accent)] font-mono">to {status.email_masked}</span></> : 'Email not set'}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">
                  {status?.email_set
                    ? 'We email you a 6-digit code.'
                    : 'No email is on file for this account. Save one below, or ask the developer for a code (option C).'}
                </div>
              </button>
              {status && !status.email_set && (
                <div className="flex gap-1.5 -mt-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="you@example.com"
                    aria-label="Email to receive recovery codes"
                    className={`${INPUT} flex-1`}
                  />
                  <button type="button" onClick={() => saveContact('email')} disabled={savingContact} className={BTN}>
                    {savingContact ? '…' : 'Save'}
                  </button>
                </div>
              )}

              {/* (b) PHONE */}
              <button
                type="button"
                disabled={status ? !status.phone_set : true}
                onClick={() => request('phone')}
                className={status?.phone_set ? CARD_ON : CARD_OFF}
              >
                <div className="flex items-center gap-2.5">
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs font-semibold flex-1">
                    {status?.phone_set ? <>Send code <span className="text-[var(--accent)] font-mono">to {status.phone_masked}</span></> : 'Phone not set'}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">
                  {status?.phone_set
                    ? 'We text you a 6-digit code.'
                    : 'No phone number is on file for this account. Save one below, or ask the developer for a code (option C).'}
                </div>
              </button>
              {status && !status.phone_set && (
                <div className="flex gap-1.5 -mt-2">
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="+1 555 123 4567"
                    aria-label="Phone to receive recovery codes"
                    className={`${INPUT} flex-1`}
                  />
                  <button type="button" onClick={() => saveContact('phone')} disabled={savingContact} className={BTN}>
                    {savingContact ? '…' : 'Save'}
                  </button>
                </div>
              )}

              {/* (c) DEV */}
              <button type="button" onClick={() => request('dev')} disabled={busy} className={CARD_DEV}>
                <div className="flex items-center gap-2.5">
                  <UserCog className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs font-semibold flex-1">Ask the developer to give you one</span>
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">
                  Pings the developer on Telegram with your name and a fresh code — they hand it
                  to you and you redeem it below. Always available.
                </div>
              </button>

              {msg && <p className={`text-[11px] ${msg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{msg.text}</p>}

              {!msg && (
                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                  Didn't set email or phone? You can add either right here — used only for
                  recovery codes, stored on your account.
                </p>
              )}
            </>
          )}

          {step === 'enter' && (
            <>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                {method === 'dev'
                  ? 'The developer was pinged — fetch your code from them, then enter it with your new password.'
                  : `Code sent (valid 30 minutes). Enter it with your new password — the old one is NOT needed.`}
              </p>
              <label className="block text-[11px] text-[var(--text-muted)]" htmlFor="recovery-code">Recovery code</label>
              <input
                id="recovery-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit code"
                autoFocus
                className={`${INPUT} font-mono tracking-widest`}
              />
              <label className="block text-[11px] text-[var(--text-muted)]" htmlFor="recovery-new-pw">New password</label>
              <input
                id="recovery-new-pw"
                type="password"
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="min 8 chars, letter + number"
                className={INPUT}
              />
              <label className="block text-[11px] text-[var(--text-muted)]" htmlFor="recovery-new-pw2">Repeat new password</label>
              <input
                id="recovery-new-pw2"
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="repeat new password"
                className={INPUT}
              />
              {msg && <p className={`text-[11px] ${msg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{msg.text}</p>}
              <div className="flex items-center gap-2 pt-1">
                <button type="button" onClick={submitRedeem} disabled={busy} className={`${BTN} disabled:opacity-50`}>
                  {busy ? 'Setting new password…' : 'Set new password'}
                </button>
                <button type="button" onClick={() => setStep('options')} className={BTN_SUB}>Back</button>
              </div>
            </>
          )}

          {step === 'done' && (
            <div className="space-y-3 text-center py-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-emerald-400" />
              </div>
              <p className="text-sm font-bold text-[var(--text-primary)]">Password updated!</p>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Sign in with your new password. Any other open sessions were signed out for security.
              </p>
              <button type="button" onClick={onClose} className={`${BTN} mx-auto`}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
