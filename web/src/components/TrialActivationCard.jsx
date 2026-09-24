import React, { useEffect, useRef, useState } from 'react';
import { Check, CreditCard, Lock, ShieldCheck, Sparkles, Loader2 } from 'lucide-react';
import api from '../api.js';
import Skeleton from './ui/Skeleton.jsx';

/**
 * TrialActivationCard — Free Trial activation (owner 09-06).
 *
 * The Free Trial now requires: (1) 2FA enabled in Account > Settings, and
 * (2) a 1-cent payment verification (Stripe checkout when configured, else a
 * manual record the operator confirms). This card drives that sequence and
 * grants the 15,000 task tokens on the third step.
 */
export default function TrialActivationCard({ userId = '', onActivated = null }) {
  const [trial, setTrial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(''); // 'verify' | 'activate'
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const pollRef = useRef(null);

  const load = async () => {
    try {
      const t = await api.getTrialStatus();
      setTrial(t);
      // Stop polling once the payment resolved (or the trial is claimed).
      if (t && (t.payment_verified || t.trial_claimed)) stopPoll();
    } catch (e) {
      /* status is best-effort — card stays hidden on transient failure */
    } finally {
      setLoading(false);
    }
  };

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    load();
    return stopPoll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // While a manual verification is pending, poll until the operator confirms.
    if (trial && !trial.trial_claimed && trial.requires_1c_payment && !trial.payment_verified) {
      if (pollRef.current) return;
      pollRef.current = setInterval(load, 8000);
    }
    return stopPoll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trial]);

  if (loading) {
    return (
      <section className="rounded-3xl bg-surface-container-lowest/80 border border-primary/30 p-6 sm:p-8 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-7 w-full max-w-md" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-11 w-56" />
      </section>
    );
  }
  if (!trial || trial.trial_claimed || done) return null;

  const onEnable2fa = () => {
    window.dispatchEvent(new CustomEvent('helpotron:nav', { detail: 'settings' }));
  };

  const onVerifyPayment = async () => {
    setBusy('verify');
    setError('');
    try {
      const r = await api.verifyTrialPayment();
      if (r && r.mode === 'stripe' && r.verification_url) {
        window.location.href = r.verification_url; // hosted 1-cent checkout
        return;
      }
      if (r && r.mode === 'already_verified') {
        setTrial({ ...trial, payment_verified: true });
        return;
      }
      // manual mode: instructions shown inline; polling picks up the operator's confirmation
      setTrial({ ...trial, payment_verified: false, manual_pending: true, manual_ref: r?.payment_id });
    } catch (e) {
      setError(e?.detail || 'Could not start the payment verification. Try again.');
    } finally {
      setBusy('');
    }
  };

  const onActivate = async () => {
    setBusy('activate');
    setError('');
    try {
      const r = await api.activateTrial();
      setDone(true);
      if (onActivated) onActivated(r);
    } catch (e) {
      setError(e?.detail || 'Activation failed. Try again.');
    } finally {
      setBusy('');
    }
  };

  const stepOk = (n) => {
    if (n === 1) return Boolean(trial.two_fa_enabled);
    if (n === 2) return Boolean(trial.payment_verified);
    return false;
  };

  const activeStep = !stepOk(1) ? 1 : !stepOk(2) ? 2 : 3;
  const claim = trial.credits_grant || 15000;

  return (
    <section className="relative rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-primary/30 shadow-xl p-6 sm:p-8 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-secondary/6 pointer-events-none" />
      <div className="relative flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 font-code-sm text-xs text-on-surface-variant uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Free Trial
          </div>
          <h2 className="font-title-md text-body-lg font-semibold text-on-surface">
            Activate your 14-day Free Trial — {claim} task tokens
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-xl mt-1">
            One-time per account. Requires 2FA enabled and a 1-cent payment verification (it also keeps
            trial farms out — serious users only).
          </p>
        </div>
      </div>

      <ol className="relative mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { n: 1, icon: <ShieldCheck className="w-5 h-5" />, label: 'Enable 2FA', hint: 'Account > Settings' },
          { n: 2, icon: <CreditCard className="w-5 h-5" />, label: 'Verify 1¢ payment', hint: '1-cent card check' },
          { n: 3, icon: <Check className="w-5 h-5" />, label: 'Activate trial', hint: `+${claim} tokens` },
        ].map((s) => {
          const ok = stepOk(s.n);
          const isActive = activeStep === s.n;
          return (
            <li
              key={s.n}
              className={`flex items-start gap-3 p-4 rounded-2xl border transition-all ${
                ok
                  ? 'border-sem-green/40 bg-sem-green/8'
                  : isActive
                    ? 'border-primary/50 bg-primary/8'
                    : 'border-outline-variant/25 bg-surface-container-low/40'
              }`}
            >
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  ok ? 'bg-sem-green/15 text-sem-green' : isActive ? 'bg-primary/15 text-primary' : 'bg-outline-variant/15 text-on-surface-variant'
                }`}
              >
                {ok ? <Check className="w-4 h-4" /> : s.icon}
              </span>
              <span>
                <span className="block text-sm font-semibold text-on-surface">
                  {s.n}. {s.label}
                </span>
                <span className="block text-xs text-on-surface-variant mt-0.5">{s.hint}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="relative mt-6 flex flex-wrap items-center gap-3">
        {activeStep === 1 && (
          <button
            type="button"
            onClick={onEnable2fa}
            className="inline-flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container font-title-md text-body-md font-semibold px-5 py-2.5 transition-all active:scale-95 cursor-pointer"
          >
            <Lock className="w-4 h-4" /> Enable 2FA now
          </button>
        )}
        {activeStep === 2 && (
          <button
            type="button"
            onClick={onVerifyPayment}
            disabled={busy === 'verify'}
            className="inline-flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container font-title-md text-body-md font-semibold px-5 py-2.5 transition-all active:scale-95 cursor-pointer disabled:opacity-60"
          >
            {busy === 'verify' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            Verify payment ($0.01)
          </button>
        )}
        {activeStep === 3 && (
          <button
            type="button"
            onClick={onActivate}
            disabled={busy === 'activate'}
            className="inline-flex items-center gap-2 rounded-xl bg-sem-deepgreen hover:bg-sem-green text-on-sem-deepgreen font-title-md text-body-md font-semibold px-5 py-2.5 transition-all active:scale-95 cursor-pointer disabled:opacity-60"
          >
            {busy === 'activate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Activate Free Trial (+{claim} tokens)
          </button>
        )}
        {error && (
          <span className="text-xs text-sem-red font-code-sm" role="alert">
            {error}
          </span>
        )}
      </div>

      {activeStep === 2 && trial.manual_pending && (
        <p className="relative mt-3 text-xs text-on-surface-variant font-code-sm">
          Send 1¢ via CashApp / Venmo to the Helpotron support handle and note your public ID
          <span className="text-primary font-semibold"> ({userId})</span> — we confirm it shortly and this
          card unlocks automatically.
        </p>
      )}
    </section>
  );
}
