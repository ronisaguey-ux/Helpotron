// export target: web/src/components/CreditsPricingDashboard.jsx
import React, { useState, useEffect } from 'react';
import {
  Zap,
  Check,
  Shield,
  Sparkles,
  Clock,
  Layers,
  BookOpen,
  GraduationCap,
  FileAudio,
  ShieldCheck,
  Tag,
  Gift,
  ArrowRight,
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
} from 'lucide-react';
import api from '../api';
import SectionCard from './SectionCard.jsx';

export function CreditsPricingDashboard({
  currentCredits = 0,
  currentTokens = 0,
  onTopUp = () => {},
  userId = '',
  plan = 'basic',
}) {
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoMsg, setPromoMsg] = useState('');
  const [promoPending, setPromoPending] = useState(false);
  const [userDiscountCredits, setUserDiscountCredits] = useState(0); // no free discount credits (08-26: fresh accounts get nothing)
  const [useDiscountCredits, setUseDiscountCredits] = useState(true);

  // Cost intelligence — live from the backend (ApiUsageLog-backed), demo-safe
  const [costData, setCostData] = useState(null);
  const [costLoading, setCostLoading] = useState(true);
  useEffect(() => {
    api.getCostIntelligence()
      .then((d) => setCostData(d))
      .catch(() => setCostData(null))
      .finally(() => setCostLoading(false));
  }, []);

  // 2FA Mandatory Purchase Checkout State
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState(null);
  const [calculatedAmount, setCalculatedAmount] = useState(0);
  const [appliedCredits, setAppliedCredits] = useState(0);

  // Credentials
  const [authUsername, setAuthUsername] = useState(userId || '');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 2FA Verification
  const [twoFactorMethod, setTwoFactorMethod] = useState('email'); // 'email' | 'sms'
  const [destination, setDestination] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [sendCooldown, setSendCooldown] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState(null);

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

  // Free Trial & SMS Verification State
  const [trialStatus, setTrialStatus] = useState(null);
  const [trialPhone, setTrialPhone] = useState('');
  const [trialCode, setTrialCode] = useState('');
  const [trialCodeSent, setTrialCodeSent] = useState(false);
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialError, setTrialError] = useState('');
  const [trialSuccess, setTrialSuccess] = useState('');

  const fetchTrialStatus = () => {
    api.getTrialStatus()
      .then((d) => setTrialStatus(d))
      .catch(() => setTrialStatus(null));
  };

  useEffect(() => {
    fetchTrialStatus();
  }, []);

  const handleRequestTrialSms = async (e) => {
    e?.preventDefault();
    if (!trialPhone.trim()) {
      setTrialError('Please enter your mobile phone number.');
      return;
    }
    setTrialLoading(true);
    setTrialError('');
    setTrialSuccess('');
    try {
      const res = await api.requestTrialSms(trialPhone.trim());
      setTrialCodeSent(true);
      setTrialSuccess(res?.message || 'Verification code sent via SMS.');
    } catch (err) {
      setTrialError(err?.message || 'Failed to send SMS code. Please check your number.');
    } finally {
      setTrialLoading(false);
    }
  };

  const handleVerifyTrialSms = async (e) => {
    e?.preventDefault();
    if (!trialCode.trim()) {
      setTrialError('Please enter the 6-digit SMS code.');
      return;
    }
    setTrialLoading(true);
    setTrialError('');
    setTrialSuccess('');
    try {
      const res = await api.verifyTrialSms(trialPhone.trim(), trialCode.trim());
      setTrialSuccess(res?.message || 'Free trial activated! 100 task tokens added.');
      fetchTrialStatus();
      onTopUp(100);
    } catch (err) {
      setTrialError(err?.message || 'Verification failed. Please check the code.');
    } finally {
      setTrialLoading(false);
    }
  };

  const ALL_PLATFORM_FEATURES = [
    'Universal Assignment Dump (PDF, DOCX, Audio, Video, Image OCR)',
    'AI Audio Transcription (Timestamps & Speaker Labels)',
    'AI Cognitive Vision & Reasoning Passes',
    'Overlord Multi-Agent Autonomous Routing & Sandbox Execution',
    'AI Detector Integrity Suite (Pangram, Sapling, Winston — fetched detectors only)',
    'Data Lake Empirical Rubric Ingestion & Micro-Credits Earning (+25 cr)',
    'Study Tools (Active Recall Flashcards, Practice Tests, Study Guides, Summaries)',
    '40-Digit Single-Use Referral Code Generation (+50 cr / referral)',
    'Canvas & Universal LMS Synchronization',
    'Direct Encrypted Admin Messaging Channel',
    'Mandatory 2FA Purchase Protection & Session Security',
    'Google Docs, Markdown, PDF & CSV Full Data Exports',
  ];

  const tiers = [
    {
      name: 'Basic',
      basePrice: 10,
      annualBasePrice: 100,
      maxDiscount: 5, // 50% of $10
      credits: '300 Task Tokens / mo',
      creditsAward: 300,
      capacity: '300 Task Tokens · 1 token = $0.01 API cost',
      popular: false,
      features: ALL_PLATFORM_FEATURES,
      plan: 'basic',
    },
    {
      name: 'Pro',
      basePrice: 20,
      annualBasePrice: 200,
      maxDiscount: 10, // 50% of $20
      credits: '1,000 Task Tokens / mo',
      creditsAward: 1000,
      capacity: '1,000 Task Tokens · 1 token = $0.01 API cost',
      popular: true,
      features: ALL_PLATFORM_FEATURES,
      plan: 'pro',
    },
    {
      name: 'Elite',
      basePrice: 40,
      annualBasePrice: 400,
      maxDiscount: 20, // 50% of $40
      credits: '2,700 Task Tokens / mo',
      creditsAward: 2700,
      capacity: '2,700 Task Tokens · 1 token = $0.01 API cost',
      popular: false,
      features: ALL_PLATFORM_FEATURES,
      plan: 'elite',
    },
  ];

  /* Referral redemption (audit 08-29).
   * This used to accept ANY string, call no API, and print a green
   * "✅ activated! Rewards will be credited upon checkout" — so an invalid
   * code looked identical to a valid one and no credits were ever granted.
   * It now calls the real endpoint (POST /api/referrals/redeem), which
   * credits the redeemer 10 and the referrer 40 immediately, and surfaces
   * the server's actual rejection reason for invalid / already-used /
   * self-redeemed codes. `promoApplied` was dead state; it now drives the
   * success-vs-error styling of the message. */
  const handleApplyPromo = async (e) => {
    e.preventDefault();
    const code = promoCode.trim();
    if (!code || promoPending) return;
    setPromoPending(true);
    setPromoMsg('');
    try {
      const res = await api.redeemReferralCode(code);
      const granted = res?.credits_awarded ?? res?.reward ?? 10;
      setPromoApplied(true);
      setPromoMsg(`Referral code accepted — ${granted} credits added to your balance.`);
      setPromoCode('');
    } catch (err) {
      setPromoApplied(false);
      setPromoMsg(err?.message || 'That referral code could not be redeemed.');
    } finally {
      setPromoPending(false);
    }
  };

  const initiateCheckout = (tier) => {
    const isAnnual = billingCycle === 'annual';
    const base = isAnnual ? tier.annualBasePrice : tier.basePrice;
    const maxCred = isAnnual ? tier.maxDiscount * 10 : tier.maxDiscount;
    const credApplied = useDiscountCredits ? Math.min(userDiscountCredits, maxCred) : 0;
    const finalAmount = Math.max(base - credApplied, base * 0.5);

    setSelectedTier(tier);
    setCalculatedAmount(finalAmount);
    setAppliedCredits(credApplied);
    setAuthError('');
    setAuthSuccess(null);
    setVerificationCode('');
    setCodeSent(false);
    setCheckoutModalOpen(true);
  };

  const handleSend2FACode = async () => {
    if (!destination.trim()) {
      setAuthError(`Please provide a destination ${twoFactorMethod === 'email' ? 'email' : 'phone number'}.`);
      return;
    }
    setSendingCode(true);
    setAuthError('');
    try {
      const res = await api.sendPurchaseChallenge({
        public_id: authUsername.trim(),
        method: twoFactorMethod,
        destination: destination.trim(),
      });
      setCodeSent(true);
      setSendCooldown(30);
      setAuthError('');
    } catch (err) {
      setAuthError(err.message || 'Failed to send 2FA verification code.');
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyAndPurchase = async (e) => {
    e.preventDefault();
    if (!authUsername.trim()) {
      setAuthError('Please provide your account username/ID.');
      return;
    }
    if (!authPassword.trim()) {
      setAuthError('Please enter your account password.');
      return;
    }
    if (!verificationCode.trim() || verificationCode.trim().length !== 6) {
      setAuthError('Please enter the valid 6-digit verification code.');
      return;
    }

    setVerifying(true);
    setAuthError('');
    try {
      const res = await api.verifyPurchaseChallenge({
        public_id: authUsername.trim(),
        password: authPassword.trim(),
        method: twoFactorMethod,
        code: verificationCode.trim(),
        destination: destination.trim(),
        plan: selectedTier.plan,
        amount_cents: Math.round(calculatedAmount * 100),
        discount_credits_used: appliedCredits,
      });

      if (res?.verified) {
        setAuthSuccess(res);
        setUserDiscountCredits((prev) => Math.max(0, prev - appliedCredits));
        onTopUp(res.credits_added || selectedTier.creditsAward);
      } else {
        setAuthError(res?.message || 'Verification failed. Check code and password.');
      }
    } catch (err) {
      setAuthError(err.message || 'Authentication error. Please verify password and 2FA code.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-8 text-slate-100 animate-fadeIn">
      {/* Balance & Discount Credits Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Regular Compute Balance */}
        <div className="clean-card rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.30)] flex items-center justify-center text-[var(--accent)] shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-slate-400 font-medium">Available Task Tokens</div>
                <div className="text-2xl font-black text-[var(--accent)] font-mono whitespace-nowrap">
                  {Number(currentTokens).toLocaleString()} tokens
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">usage budget for AI tasks</div>
              </div>
            </div>
            <div className="text-left sm:text-right shrink-0">
              <span className="inline-block text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2.5 py-1 rounded-full font-mono">
                Active Tier: {plan === 'none' || !plan ? 'No plan (activate via operator)' : plan}
              </span>
            </div>
          </div>
        </div>

        {/* Referral Discount Credits Balance */}
        <div className="clean-card rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <Tag className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-slate-400 font-medium">Referral Discount Credits</div>
                <div className="text-2xl font-black text-emerald-400 font-mono whitespace-nowrap">
                  ${userDiscountCredits}.00 USD
                </div>
              </div>
            </div>
            <div className="text-left sm:text-right shrink-0">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer py-1.5 sm:py-0">
                <input
                  type="checkbox"
                  checked={useDiscountCredits}
                  onChange={(e) => setUseDiscountCredits(e.target.checked)}
                  className="rounded accent-emerald-500 w-4 h-4 min-w-0 min-h-0 cursor-pointer"
                />
                <span className="font-semibold text-emerald-300">Apply at Checkout</span>
              </label>
              <div className="text-[10px] text-slate-400 mt-1 font-mono">Up to 50% max purchase discount</div>
            </div>
          </div>
        </div>
      </div>

      {/* Cost Intelligence & Guardrails — real data from /api/features/costs/intelligence */}
      <div className="clean-card rounded-2xl p-6">
        <CostIntelligenceSection costData={costData} loading={costLoading} />
      </div>

      {/* Billing Switch & Promo Section */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white/4 border border-white/8">
        {/* Monthly vs Annual */}
        <div className="flex items-center p-1 rounded-xl bg-white/4 border border-white/8 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`px-4 py-2 rounded-lg transition cursor-pointer ${
              billingCycle === 'monthly' ? 'bg-[var(--accent)] text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Monthly Billing
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('annual')}
            className={`px-4 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
              billingCycle === 'annual' ? 'bg-[var(--accent)] text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Annual Billing</span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">
              Save 20%
            </span>
          </button>
        </div>

        {/* Promo Code Box */}
        <form onSubmit={handleApplyPromo} className="flex gap-2 w-full sm:w-auto text-xs">
          <input
            type="text"
            placeholder="Have a referral/promo code?"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            className="clean-input px-3.5 py-2 w-full sm:w-60 font-mono text-xs uppercase"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-white/4 hover:bg-white/8 text-slate-200 border border-white/8 rounded-[var(--radius-md)] font-semibold transition shrink-0 cursor-pointer"
          >
            Apply Code
          </button>
        </form>
      </div>

      {promoMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-mono animate-fadeIn ${
            promoApplied
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}
          role="status"
        >
          {promoMsg}
        </div>
      )}

      {/* All-Features-Unlocked Disclaimer Banner */}
      <SectionCard id="credits-unlocked-banner" padding="p-4" className="rounded-2xl" header={
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.30)] flex items-center justify-center text-[var(--accent)] shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="text-xs font-bold text-white flex items-center gap-1.5">
            <span>All Platform Features & Tools Are 100% Unlocked on Every Plan</span>
            <span className="text-[10px] bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.30)] text-[var(--accent-2)] px-2 py-0.5 rounded-full font-mono font-semibold">NO FEATURE GATING</span>
          </div>
        </div>
      }>
        <p className="text-xs text-slate-300 mt-0.5">
          Every plan includes full access to Universal Assignment Dump, AI Audio Transcription, AI Cognitive Vision & Reasoning, Overlord Multi-Agent Sandboxes, and all 5 AI Integrity Detectors. Your token allocation simply determines your monthly compute capacity.
        </p>
      </SectionCard>

      {/* Free Trial SMS Verification Section (1-time per account & phone) */}
      {(!trialStatus || trialStatus?.eligible || !trialStatus?.trial_claimed) && (
        <SectionCard
          id="free-trial-activation-card"
          padding="p-6"
          className="rounded-3xl border-emerald-500/30 bg-emerald-950/10 relative overflow-hidden"
          header={
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Gift className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Claim 7-Day Free Trial</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-mono border border-emerald-500/30">
                      1-TIME · SMS VERIFIED
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Includes 100 Task Tokens with 100% features unlocked. Single-use per phone number.
                  </p>
                </div>
              </div>
            </div>
          }
        >
          {trialSuccess && (
            <div className="p-3.5 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-mono">
              {trialSuccess}
            </div>
          )}
          {trialError && (
            <div className="p-3.5 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono">
              {trialError}
            </div>
          )}

          {!trialCodeSent ? (
            <form onSubmit={handleRequestTrialSms} className="flex flex-col sm:flex-row gap-3 pt-2">
              <div className="relative flex-1">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={trialPhone}
                  onChange={(e) => setTrialPhone(e.target.value)}
                  className="clean-input pl-10 pr-3.5 py-2.5 w-full text-xs font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={trialLoading}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {trialLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>Send SMS Code</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyTrialSms} className="flex flex-col sm:flex-row gap-3 pt-2">
              <div className="relative flex-1">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Enter 6-digit SMS code"
                  value={trialCode}
                  onChange={(e) => setTrialCode(e.target.value)}
                  maxLength={6}
                  className="clean-input pl-10 pr-3.5 py-2.5 w-full text-xs font-mono tracking-widest uppercase"
                />
              </div>
              <button
                type="submit"
                disabled={trialLoading}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {trialLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Verify & Activate Trial</span>
              </button>
              <button
                type="button"
                onClick={() => { setTrialCodeSent(false); setTrialCode(''); }}
                className="px-3 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 text-xs rounded-xl transition"
              >
                Change Number
              </button>
            </form>
          )}
        </SectionCard>
      )}

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier) => {
          const isAnnual = billingCycle === 'annual';
          const base = isAnnual ? tier.annualBasePrice : tier.basePrice;
          const maxCred = isAnnual ? tier.maxDiscount * 10 : tier.maxDiscount;
          const credApplied = useDiscountCredits ? Math.min(userDiscountCredits, maxCred) : 0;
          const finalAmount = Math.max(base - credApplied, base * 0.5);

          return (
            <SectionCard
              key={tier.name}
              id={`credits-tier-${tier.name.toLowerCase()}`}
              padding="p-6"
              className={`rounded-3xl flex flex-col justify-between transition-all duration-300 relative ${
                tier.popular ? 'shadow-[0_0_0_1px_rgba(139,92,246,0.4),0_16px_48px_rgba(139,92,246,0.14)]' : ''
              }`}
              header={
                <div>
                  <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{tier.capacity}</p>
                </div>
              }
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[var(--accent)] text-white font-bold text-[10px] uppercase tracking-wider shadow-lg">
                  Most Popular
                </div>
              )}

              <div className="space-y-4">

                <div className="p-4 rounded-2xl bg-white/4 border border-white/8 space-y-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-black text-white font-mono">${finalAmount}</span>
                    <span className="text-xs text-slate-400 font-mono">
                      /{isAnnual ? 'yr' : 'mo'}
                    </span>
                  </div>

                  {credApplied > 0 && (
                    <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      <span>Original ${base} (-${credApplied} credits applied)</span>
                    </div>
                  )}
                </div>

                <div className="p-2.5 rounded-xl bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.30)] space-y-0.5">
                  <div className="text-xs font-bold text-[var(--accent-2)] font-mono flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>{tier.credits}</span>
                  </div>
                </div>

                {/* Features List */}
                <div className="space-y-2.5 pt-2">
                  {tier.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-300">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Checkout Trigger with 2FA Protection */}
              <div className="pt-6">
                <button
                  type="button"
                  onClick={() => initiateCheckout(tier)}
                  className={`w-full py-3 rounded-[var(--radius-md)] font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-2 ${
                    tier.popular
                      ? 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white glow-accent'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5 text-white/90" />
                  <span>2FA Checkout</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <div className="text-center text-[10px] text-slate-500 mt-2 flex items-center justify-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>Mandatory 2FA Purchase Protection Active</span>
                </div>
              </div>
            </SectionCard>
          );
        })}
      </div>

      {/* ─── MANDATORY 2FA PURCHASE CHECKOUT MODAL ─── */}
      {checkoutModalOpen && selectedTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 overflow-y-auto">
          <div className="clean-card surface-glass-strong rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-fadeIn text-slate-100 relative">
            
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setCheckoutModalOpen(false)}
              aria-label="Close checkout"
              title="Close"
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.30)] flex items-center justify-center text-[var(--accent)]">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Mandatory 2FA Purchase Authentication
                </h3>
                <p className="text-xs text-slate-400">
                  Password + 2FA (Email or SMS) verification required for all orders.
                </p>
              </div>
            </div>

            {/* Success Receipt State */}
            {authSuccess ? (
              <div className="p-6 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 space-y-4 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-2xl font-bold">
                  ✓
                </div>
                <div>
                  <h4 className="text-base font-bold text-emerald-300">Purchase Verified & Complete!</h4>
                  <p className="text-xs text-slate-300 mt-1">
                    Your subscription has been activated for <strong>{authSuccess.new_plan?.toUpperCase()}</strong>.
                  </p>
                  <p className="text-xs font-mono text-emerald-400 mt-1">
                    +{authSuccess.credits_added} Compute Credits added to account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCheckoutModalOpen(false)}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Return to Dashboard
                </button>
              </div>
            ) : (
              <form onSubmit={handleVerifyAndPurchase} className="space-y-4 text-xs">
                {/* Order Summary Box */}
                <div className="p-4 rounded-xl bg-white/4 border border-white/8 space-y-2">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Plan:</span>
                    <span className="font-bold text-white">{selectedTier.name} ({billingCycle})</span>
                  </div>
                  {appliedCredits > 0 && (
                    <div className="flex items-center justify-between text-emerald-400 font-mono">
                      <span>Discount Credits:</span>
                      <span>-${appliedCredits}.00 USD</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 border-t border-white/5 text-sm font-bold text-white">
                    <span>Total Charged:</span>
                    <span className="text-[var(--accent)] font-mono">${calculatedAmount}.00 USD</span>
                  </div>
                </div>

                {/* Step 1: Account Credentials */}
                <div className="space-y-2.5">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Step 1: Account Username & Password
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Username / Public ID"
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      className="clean-input rounded-xl px-3 py-2 outline-none"
                    />
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Account Password"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        className="clean-input w-full rounded-xl px-3 py-2 pr-9 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 transition"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Step 2: 2FA Delivery Method (Email or SMS) */}
                <div className="space-y-2.5 pt-1">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    Step 2: Choose 2FA Verification Channel
                  </label>

                  {/* Channel Switcher */}
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-white/4 border border-white/8">
                    <button
                      type="button"
                      onClick={() => setTwoFactorMethod('email')}
                      className={`py-2 rounded-lg flex items-center justify-center gap-2 font-semibold transition cursor-pointer ${
                        twoFactorMethod === 'email'
                          ? 'bg-[var(--accent)] text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Email Code</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTwoFactorMethod('sms')}
                      className={`py-2 rounded-lg flex items-center justify-center gap-2 font-semibold transition cursor-pointer ${
                        twoFactorMethod === 'sms'
                          ? 'bg-[var(--accent)] text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>SMS Phone</span>
                    </button>
                  </div>

                  {/* Destination Input & Send Button */}
                  <div className="flex gap-2">
                    <input
                      type={twoFactorMethod === 'email' ? 'email' : 'tel'}
                      placeholder={twoFactorMethod === 'email' ? 'your-email@domain.com' : '+1 (555) 000-0000'}
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className="clean-input flex-1 rounded-xl px-3 py-2 font-mono outline-none"
                    />
                    <button
                      type="button"
                      disabled={sendingCode || sendCooldown > 0}
                      onClick={handleSend2FACode}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl font-semibold shrink-0 transition cursor-pointer flex items-center gap-1.5"
                    >
                      {sendingCode ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <span>{sendCooldown > 0 ? `Resend (${sendCooldown}s)` : 'Send Code'}</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Step 3: Enter 6-Digit Code */}
                {codeSent && (
                  <div className="space-y-2 pt-1 animate-fadeIn">
                    <label className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                      <span>Step 3: Enter 6-Digit 2FA Verification Code</span>
                      <span className="text-[11px] text-emerald-400 font-mono font-normal">
                        Code sent to {destination}
                      </span>
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="• • • • • •"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-white/4 border border-emerald-500/40 rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] font-mono text-white focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                )}

                {/* Error Banner */}
                {authError && (
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{authError}</span>
                  </div>
                )}

                {/* Submit Checkout */}
                <button
                  type="submit"
                  disabled={verifying || !codeSent || verificationCode.length !== 6}
                  className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white rounded-[var(--radius-md)] font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-2 glow-accent"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{verifying ? 'Authenticating & Processing...' : 'Verify 2FA & Complete Purchase'}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
/* ────────────────────────────────────────────────────────────────────────────
 * Cost Intelligence & Guardrails Console (under Billing & Insights)
 * REAL data from /api/features/costs/intelligence — every number is
 * ApiUsageLog-backed (total spend, per-assignment cost, effort tier,
 * subject breakdown, wallet limit). No hardcoded figures.
 * ────────────────────────────────────────────────────────────────────────── */
export const CostIntelligenceSection = ({ costData, loading, onSetSpendingLimit }) => {
  if (loading) {
    return <div className="text-[11px] text-slate-500 py-2">Loading cost intelligence…</div>;
  }
  const total = (costData?.total_spent_cents ?? 0) / 100;
  const perAssignment = (costData?.cost_per_assignment_cents ?? 0) / 100;
  const limit = (costData?.spending_limit_cents ?? 1000) / 100;
  const pct = limit > 0 ? Math.min(100, Math.round((total / limit) * 100)) : 0;
  const subjects = costData?.breakdown_by_subject ? Object.entries(costData.breakdown_by_subject) : [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">AI Resource Consumption & Cost Intelligence</h3>
        <span className="text-xs text-slate-500">Scope: Lifetime</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-white/8 bg-white/4 space-y-1">
          <span className="text-xs text-slate-500">Cost per Completed Assignment</span>
          <p className="text-xl font-bold text-slate-100">
            ${perAssignment.toFixed(2)} <span className="text-xs font-normal text-slate-500">/ assignment</span>
          </p>
        </div>
        <div className="p-4 rounded-xl border border-white/8 bg-white/4 space-y-1">
          <span className="text-xs text-slate-500">Most Used Effort Tier</span>
          <p className="text-xl font-bold text-[var(--accent)]">{costData?.most_used_effort_tier || '—'}</p>
        </div>
        <div className="p-4 rounded-xl border border-white/8 bg-white/4 space-y-1">
          <span className="text-xs text-slate-500">Spent vs Spending Limit</span>
          <p className="text-xl font-bold text-slate-100">
            ${total.toFixed(2)} <span className="text-xs font-normal text-slate-500">of ${limit.toFixed(2)}</span>
          </p>
          <div className="h-1.5 rounded-full bg-white/10 mt-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-400' : 'bg-emerald-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
      {subjects.length > 0 && (
        <div>
          <div className="text-xs text-slate-500 mb-1.5">Spend by subject</div>
          <div className="flex flex-wrap gap-2">
            {subjects.map(([s, cents]) => (
              <span key={s} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/8 text-[11px] text-slate-300">
                {s}: ${(cents / 100).toFixed(2)}
              </span>
            ))}
          </div>
        </div>
      )}
      {costData?.auto_refill_enabled && (
        <div className="text-[11px] text-emerald-300">Auto-refill is on — spending limits recharge automatically.</div>
      )}
      {onSetSpendingLimit && (
        <button
          type="button"
          onClick={() => onSetSpendingLimit(limit)}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] text-slate-300 hover:bg-white/10 transition cursor-pointer"
        >
          Adjust spending limit
        </button>
      )}
    </div>
  );
};

export default CreditsPricingDashboard;

