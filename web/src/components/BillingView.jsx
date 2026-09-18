import React, { useEffect, useState, useRef } from 'react';
import {
  Check,
  Zap,
  Sparkles,
  Shield,
  ShieldCheck,
  Lock,
  Mail,
  Phone,
  KeyRound,
  AlertCircle,
  X,
  CheckCircle2,
  Eye,
  EyeOff,
  RefreshCw,
  Gift,
} from 'lucide-react';
import api from '../api.js';

export default function BillingView({ userId = '' }) {
  const [balance, setBalance] = useState(0);
  const [tokens, setTokens] = useState(0);
  const [plan, setPlan] = useState('basic');
  const [transactions, setTransactions] = useState([]);
  const [referralPct, setReferralPct] = useState(0);
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'yearly'
    const [msg, setMsg] = useState('');
    const [loading, setLoading] = useState(true);
    // Live tier catalogue. Empty until /api/plans answers; TIERS derives from it.
    const [plans, setPlans] = useState([]);

  // 2FA Checkout Dialog State
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null); // { type: 'plan' | 'topup', name, price, tokens }
  const [authUsername, setAuthUsername] = useState(userId || '');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState('email');
  const [destination, setDestination] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [sendCooldown, setSendCooldown] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState(null);

  const modalRef = useRef(null);

  const loadData = () => {
    setLoading(true);
    api.dashboard(userId)
      .then((d) => {
        setBalance(typeof d.credits === 'number' ? d.credits : 0);
        setTokens(Number(d.settings?.token_balance ?? 0));
        setPlan(typeof d.plan === 'string' ? d.plan : 'basic');
        setTransactions(d.recent_transactions || []);
        setReferralPct(Number(d.referral_discount_pct ?? 0));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  // Tier catalogue comes from the server, which is also where `available` is
  // decided — so when the payment gateway is configured at launch these open
  // by themselves, with nothing to change here.
  useEffect(() => {
    let alive = true;
    fetch('/api/plans', { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.plans?.length) setPlans(d.plans); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setAuthUsername(userId || '');
    if (!destination) {
      setDestination(twoFactorMethod === 'email' ? `${userId.toLowerCase()}@helpotron.internal` : '+15550192834');
    }
  }, [userId, twoFactorMethod]);

  // Cooldown timer
  useEffect(() => {
    let timer;
    if (sendCooldown > 0) {
      timer = setTimeout(() => setSendCooldown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [sendCooldown]);

  // Handle ESC dismissal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && checkoutOpen) {
        setCheckoutOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [checkoutOpen]);

  const openCheckout = (product) => {
    setSelectedProduct(product);
    setAuthError('');
    setAuthSuccess(null);
    setVerificationCode('');
    setCodeSent(false);
    setCheckoutOpen(true);
  };

  const handleSend2FACode = async () => {
    if (!destination.trim()) {
      setAuthError(`Please provide a valid destination ${twoFactorMethod === 'email' ? 'email' : 'phone number'}.`);
      return;
    }
    setSendingCode(true);
    setAuthError('');
    try {
      await api.sendPurchaseChallenge({
        public_id: authUsername.trim() || userId,
        method: twoFactorMethod,
        destination: destination.trim(),
      });
      setCodeSent(true);
      setSendCooldown(30);
    } catch (err) {
      setAuthError(err.message || 'Failed to send 2FA verification code.');
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyAndPurchase = async (e) => {
    e.preventDefault();
    if (!authPassword.trim()) {
      setAuthError('Please enter your account password.');
      return;
    }
    if (!verificationCode.trim() || verificationCode.trim().length !== 6) {
      setAuthError('Please enter the 6-digit verification code.');
      return;
    }

    setVerifying(true);
    setAuthError('');
    try {
      const amountCents = Math.round(Number(selectedProduct.price) * 100);
      const res = await api.verifyPurchaseChallenge({
        public_id: authUsername.trim() || userId,
        password: authPassword.trim(),
        method: twoFactorMethod,
        code: verificationCode.trim(),
        destination: destination.trim(),
        plan: selectedProduct.type === 'plan' ? selectedProduct.planId : plan,
        amount_cents: amountCents,
        discount_credits_used: 0,
      });

      if (res?.verified) {
        setAuthSuccess(res);
        setMsg(`✅ Order confirmed: +${selectedProduct.tokens.toLocaleString()} tokens added.`);
        loadData();
        setTimeout(() => {
          setCheckoutOpen(false);
          setAuthSuccess(null);
        }, 2000);
      } else {
        setAuthError(res?.message || 'Verification failed. Please check your credentials.');
      }
    } catch (err) {
      setAuthError(err.message || 'Authentication error. Please verify your password and 2FA code.');
    } finally {
      setVerifying(false);
    }
  };

  // Pricing (owner 09-06): $0 Trial, $10 Basic, $20 Pro, $40 Elite.
  // Token allowances come from the same /api/plans table the landing page
  // bills against; no USD-value disclosure, token counts only.
  // Derived from GET /api/plans so this page can never disagree with the public
  // pricing table or the server's allowance table. It previously held a second
  // hardcoded copy (150/300/1000/2700) that had gone stale by 100x after the
  // token-unit change, so the checkout page was selling balances that did not
  // match what a payment actually deposits.
  //
  // `available` is false for tiers that cannot be started today (no payment
  // gateway configured). The owner's rule (2026-09-18): keep every tier visible,
  // and clicking an unavailable one explains why instead of opening a checkout
  // that cannot complete.
  const TIERS = React.useMemo(
    () =>
      plans.map((p) => ({
        id: p.id,
        planId: p.id,
        name: p.name,
        priceMonthly: p.price_monthly ?? 0,
        priceYearly: p.price_monthly ? Math.round(p.price_monthly * 10) : 0,
        tokens: p.monthly_task_tokens ?? p.monthly_credits ?? 0,
        desc: p.tagline || '',
        features: p.capabilities || [],
        popular: !!p.popular,
        isTrial: !!p.is_trial,
        isTesting: !!p.is_testing,
        available: p.available !== false,
        unavailableReason: p.unavailable_reason || 'Not available yet.',
      })),
    [plans]
  );



  return (
    <div className="space-y-8">
      {/* Toast message */}
      {msg && (
        <div className="bg-surface-container-low border border-primary/40 rounded-2xl p-4 text-sm text-primary flex items-center justify-between shadow-sm">
          <span>{msg}</span>
          <button type="button" onClick={() => setMsg('')} className="p-1 hover:text-on-surface">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Referral Discount Notice */}
      {referralPct > 0 && (
        <div className="bg-surface-container-lowest/80 border border-primary/40 rounded-3xl p-5 shadow-sm text-primary flex items-center gap-3">
          <Gift className="w-6 h-6 text-primary shrink-0" />
          <div>
            <p className="font-title-md text-sm font-semibold text-primary">
              🎁 Referral discount active: {referralPct}% off your next order
            </p>
            <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
              Applied automatically at checkout upon 2FA verification.
            </p>
          </div>
        </div>
      )}

      {/* NO FEATURE GATING GUARANTEE STRIP */}
      <div className="rounded-2xl bg-sem-deepgreen/15 border border-sem-deepgreen/30 p-4 flex items-center justify-between text-xs text-on-surface">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-sem-green shrink-0" />
          <div>
            <span className="font-label-caps uppercase tracking-wider text-sem-green font-semibold block">
              Transparent Compute Policy
            </span>
            <span className="text-on-surface-variant font-body-sm">
              All plans have full access to tools and models. You only pay for the deterministic compute tokens your tasks use.
            </span>
          </div>
        </div>
        <span className="font-chip-status text-[10px] text-sem-green bg-sem-green/10 px-2 py-0.5 rounded-full shrink-0">
          ZERO PAYWALL GATING
        </span>
      </div>

      {/* Billing Cycle Segmented Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-title-md text-title-md text-on-surface font-semibold">Subscription Plans</h2>
          <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
            Deterministic token allocation per monthly or annual billing cycle.
          </p>
        </div>
        <div className="bg-surface-container-low p-1 rounded-xl border border-outline-variant/30 flex items-center gap-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg font-label-caps text-xs tracking-wider transition ${
              billingCycle === 'monthly'
                ? 'bg-surface-container text-primary font-semibold shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg font-label-caps text-xs tracking-wider transition flex items-center gap-1.5 ${
              billingCycle === 'yearly'
                ? 'bg-surface-container text-primary font-semibold shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span>Annual</span>
            <span className="font-chip-status text-[9px] bg-sem-green/15 text-sem-green px-1.5 py-0.2 rounded-full">
              Save 17%
            </span>
          </button>
        </div>
      </div>

      {/* Tier Pricing Cards Grid (4 Columns) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {TIERS.map((tier) => {
          const price = billingCycle === 'yearly' ? tier.priceYearly : tier.priceMonthly;
          const cycleLabel = tier.priceMonthly === 0 ? '7 days' : billingCycle === 'yearly' ? '/ year' : '/ month';
          const isCurrent = plan === tier.planId;

          return (
            <div
              key={tier.id}
              className={`relative rounded-3xl p-6 flex flex-col justify-between backdrop-blur-xl transition-all shadow-md ${
                tier.popular
                  ? 'bg-surface-container-low border-2 border-primary/40 shadow-[0_0_24px_rgba(120,245,229,0.15)]'
                  : 'bg-surface-container-lowest/80 border border-outline-variant/20 hover:border-outline-variant/40'
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-on-primary font-chip-status text-[10px] font-bold uppercase tracking-wider shadow-sm">
                  Most Popular
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-title-md text-base text-on-surface font-semibold">{tier.name}</h3>
                  <span className="font-chip-status text-[10px] text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full uppercase">
                    {tier.id}
                  </span>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="font-tabular-stat text-3xl text-on-surface font-bold">${price}</span>
                  <span className="font-code-sm text-xs text-on-surface-variant">{cycleLabel}</span>
                </div>

                <div className="p-3 rounded-xl bg-surface-container-low/90 border border-outline-variant/10 text-xs">
                  <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block mb-0.5">INCLUDED RUNWAY</span>
                  <span className="font-tabular-stat text-on-surface font-semibold text-sm">
                    {tier.tokens.toLocaleString()} Tokens / mo
                  </span>
                </div>

                <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
                  {tier.desc}
                </p>

                <div className="space-y-2 pt-2 border-t border-outline-variant/15">
                  <span className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block">
                    Features Included
                  </span>
                  {tier.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-on-surface">
                      <Check className="w-3.5 h-3.5 text-sem-green shrink-0 mt-0.5" />
                      <span className="font-body-sm">{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6">
                <button
                  type="button"
                  // Deliberately NOT disabled for an unavailable tier: a dead
                  // button explains nothing, and the owner asked for the warning.
                  onClick={() => {
                    if (!tier.available) {
                      setMsg(`${tier.name} — ${tier.unavailableReason}`);
                      return;
                    }
                    if (tier.isTesting) {
                      setMsg('Testing access is granted by hand. Apply from the pricing page or message the developer.');
                      return;
                    }
                    openCheckout({ type: 'plan', planId: tier.planId, name: tier.name, price, tokens: tier.tokens });
                  }}
                  className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl font-label-caps text-xs tracking-wider transition-all flex items-center justify-center gap-2 ${
                    !tier.available
                      ? 'bg-surface-container text-on-surface-variant/70 cursor-pointer hover:bg-surface-container-high'
                      : tier.popular
                      ? 'bg-primary text-on-primary font-semibold hover:brightness-105 shadow-[0_0_20px_rgba(120,245,229,0.3)] active:scale-[0.98]'
                      : 'bg-surface-container hover:bg-surface-container-high text-on-surface active:scale-[0.98]'
                  }`}
                >
                  {!tier.available ? (
                    <span>Not available yet</span>
                  ) : isCurrent ? (
                    <>
                      <Check className="w-4 h-4 text-sem-green" />
                      <span>Active Plan</span>
                    </>
                  ) : (
                    <span>{tier.isTesting ? 'Apply for free access' : `Choose ${tier.name}`}</span>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* PROTOTYPE NOTICE PLACED HONESTLY BELOW PRICE TERMS */}
      <div className="bg-surface-container-lowest/80 border border-outline-variant/20 rounded-2xl p-4 text-xs text-on-surface-variant flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-sem-amber shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-label-caps text-sem-amber uppercase tracking-wider font-semibold block">
            Open Beta Prototype Notice
          </span>
          <p className="font-body-sm text-xs leading-relaxed">
            Payment processing is currently running in test sandbox mode during platform evaluation. No real credit card charges will occur. Token balances and subscription states settle upon official release.
          </p>
        </div>
      </div>

      {/* Credit & Transaction Activity Ledger */}
      <div className="bg-surface-container-lowest/80 backdrop-blur-xl p-6 rounded-3xl border border-outline-variant/20 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-title-md text-title-md text-on-surface font-semibold">Activity &amp; Receipts Ledger</h3>
            <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
              Verified compute deduction and credit history.
            </p>
          </div>
          <span className="font-tabular-stat text-xs text-on-surface-variant bg-surface-container-high px-3 py-1 rounded-full">
            {transactions.length} Records
          </span>
        </div>

        {transactions.length === 0 ? (
          <div className="p-8 text-center text-on-surface-variant font-body-sm text-xs rounded-2xl bg-surface-container-low/40">
            No credit transactions logged yet for this account.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {transactions.map((tx, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container-low/60 hover:bg-surface-container transition-colors text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`shrink-0 font-tabular-stat font-bold text-sm ${
                      tx.delta >= 0 ? 'text-sem-green' : 'text-primary'
                    }`}
                  >
                    {tx.delta >= 0 ? '+' : ''}
                    {Number(tx.delta).toFixed(2)}
                  </span>
                  <span className="text-on-surface font-body-sm truncate">{tx.reason}</span>
                </div>
                <span className="shrink-0 text-on-surface-variant font-tabular-stat text-[11px]">
                  {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : 'Recent'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2FA MANDATORY PURCHASE CHECKOUT MODAL (DialogShell) */}
      {checkoutOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-modal-title"
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            ref={modalRef}
            className="w-full max-w-lg rounded-3xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl p-6 sm:p-8 space-y-6 relative animate-scaleIn"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-chip-status text-[10px] uppercase">
                  <Lock className="w-3 h-3 text-primary" />
                  Mandatory 2FA Purchase Auth
                </div>
                <h3 id="checkout-modal-title" className="font-title-md text-lg text-on-surface font-semibold">
                  Confirm {selectedProduct?.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition"
                aria-label="Close checkout modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Price & Token Summary Shelf */}
            <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/15 flex items-center justify-between text-xs">
              <div>
                <span className="font-label-caps text-on-surface-variant uppercase text-[10px] block">Order Summary</span>
                <span className="font-tabular-stat text-on-surface font-semibold text-sm">
                  {selectedProduct?.tokens.toLocaleString()} Tokens
                </span>
              </div>
              <div className="text-right">
                <span className="font-label-caps text-on-surface-variant uppercase text-[10px] block">Total Due</span>
                <span className="font-tabular-stat text-primary font-bold text-lg">
                  ${selectedProduct?.price} USD
                </span>
              </div>
            </div>

            {/* Inline Error */}
            {authError && (
              <div className="p-3 rounded-xl bg-error-container/20 border border-error/30 text-error text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {/* Inline Success */}
            {authSuccess && (
              <div className="p-3 rounded-xl bg-sem-green/15 border border-sem-green/30 text-sem-green text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Verification successful! Allocation granted.</span>
              </div>
            )}

            {/* Auth Form */}
            <form onSubmit={handleVerifyAndPurchase} className="space-y-4">
              {/* Password */}
              <div className="space-y-1">
                <label className="font-label-caps text-xs text-on-surface-variant uppercase">Account Password</label>
                <div className="relative flex items-center">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Enter your current password"
                    className="w-full h-11 px-3 pr-10 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface font-body-sm text-xs focus:outline-none focus:border-primary transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 text-on-surface-variant hover:text-on-surface p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* 2FA Method Selector */}
              <div className="space-y-1">
                <label className="font-label-caps text-xs text-on-surface-variant uppercase">2FA Delivery Method</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTwoFactorMethod('email')}
                    className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-label-caps flex items-center justify-center gap-2 border transition ${
                      twoFactorMethod === 'email'
                        ? 'bg-surface-container-high text-primary border-primary/40 font-semibold'
                        : 'bg-surface-container-low border-outline-variant/20 text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <Mail className="w-4 h-4" />
                    <span>Email OTP</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTwoFactorMethod('sms')}
                    className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-label-caps flex items-center justify-center gap-2 border transition ${
                      twoFactorMethod === 'sms'
                        ? 'bg-surface-container-high text-primary border-primary/40 font-semibold'
                        : 'bg-surface-container-low border-outline-variant/20 text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <Phone className="w-4 h-4" />
                    <span>SMS OTP</span>
                  </button>
                </div>
              </div>

              {/* Destination & Send Challenge */}
              <div className="space-y-1">
                <label className="font-label-caps text-xs text-on-surface-variant uppercase">
                  {twoFactorMethod === 'email' ? 'Registered Email' : 'Mobile Phone'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder={twoFactorMethod === 'email' ? 'user@example.com' : '+1...'}
                    className="flex-1 h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface font-body-sm text-xs focus:outline-none focus:border-primary transition"
                  />
                  <button
                    type="button"
                    disabled={sendingCode || sendCooldown > 0}
                    onClick={handleSend2FACode}
                    className="min-h-[44px] px-4 rounded-xl bg-surface-container-high hover:bg-surface-container text-on-surface font-label-caps text-xs tracking-wider transition shrink-0 disabled:opacity-50"
                  >
                    {sendingCode ? 'Sending...' : sendCooldown > 0 ? `${sendCooldown}s` : codeSent ? 'Resend' : 'Send Code'}
                  </button>
                </div>
              </div>

              {/* 6-Digit Code */}
              <div className="space-y-1">
                <label className="font-label-caps text-xs text-on-surface-variant uppercase">6-Digit Verification Code</label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface font-tabular-stat text-center tracking-widest text-base focus:outline-none focus:border-primary transition"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={verifying || !codeSent}
                  className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider font-semibold shadow-[0_0_24px_rgba(120,245,229,0.3)] hover:brightness-105 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {verifying ? 'Verifying 2FA...' : `Authenticate & Confirm ($${selectedProduct?.price})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
