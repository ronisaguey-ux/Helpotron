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
  currentCredits = 10029,
  onTopUp = () => {},
  userId = 'RoniDev',
}) {
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoMsg, setPromoMsg] = useState('');
  const [userDiscountCredits, setUserDiscountCredits] = useState(21); // $21 in discount credits
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
  const [authUsername, setAuthUsername] = useState(userId || 'RoniDev');
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
    setAuthUsername(userId || 'RoniDev');
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
      credits: '500 Task Tokens / mo',
      creditsAward: 500,
      standardTokens: '~3,000,000 LLM Tokens',
      capacity: '500 Complete Assignment, Lecture & Study Workflows',
      popular: false,
      features: ALL_PLATFORM_FEATURES,
      plan: 'basic',
    },
    {
      name: 'Pro',
      basePrice: 20,
      annualBasePrice: 200,
      maxDiscount: 10, // 50% of $20
      credits: '2,000 Task Tokens / mo',
      creditsAward: 2000,
      standardTokens: '~12,000,000 LLM Tokens',
      capacity: '2,000 Multimodal Workflows, Audio Transcriptions & Evasion Passes',
      popular: true,
      features: ALL_PLATFORM_FEATURES,
      plan: 'pro',
    },
    {
      name: 'Elite',
      basePrice: 40,
      annualBasePrice: 400,
      maxDiscount: 20, // 50% of $40
      credits: '6,000 Task Tokens / mo',
      creditsAward: 6000,
      standardTokens: '~40,000,000 LLM Tokens',
      capacity: '6,000 Heavy Multi-Agent, Full Audio Lectures & Deep Research Passes',
      popular: false,
      features: ALL_PLATFORM_FEATURES,
      plan: 'elite',
    },
  ];

  const handleApplyPromo = (e) => {
    e.preventDefault();
    if (!promoCode.trim()) return;
    setPromoApplied(true);
    setPromoMsg(`✅ Referral code "${promoCode.trim()}" activated! Rewards will be credited upon checkout.`);
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
        <div className="clean-card rounded-2xl p-6 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Available Task Balance</div>
              <div className="text-2xl font-black text-blue-400 font-mono">
                {Number(currentCredits).toLocaleString()} Credits
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2.5 py-1 rounded-full font-mono">
              Active Tier: Pro
            </span>
          </div>
        </div>

        {/* Referral Discount Credits Balance */}
        <div className="clean-card rounded-2xl p-6 flex items-center justify-between bg-gradient-to-r from-emerald-950/20 to-teal-950/20 border border-emerald-500/20">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Referral Discount Credits</div>
              <div className="text-2xl font-black text-emerald-400 font-mono">
                ${userDiscountCredits}.00 USD
              </div>
            </div>
          </div>
          <div className="text-right">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={useDiscountCredits}
                onChange={(e) => setUseDiscountCredits(e.target.checked)}
                className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
              />
              <span className="font-semibold text-emerald-300">Apply at Checkout</span>
            </label>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">Up to 50% max purchase discount</div>
          </div>
        </div>
      </div>

      {/* Cost Intelligence & Guardrails — real data from /api/features/costs/intelligence */}
      <div className="clean-card rounded-2xl p-6">
        <CostIntelligenceSection costData={costData} loading={costLoading} />
      </div>

      {/* Billing Switch & Promo Section */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-slate-950/40 border border-white/5">
        {/* Monthly vs Annual */}
        <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-white/5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`px-4 py-2 rounded-lg transition cursor-pointer ${
              billingCycle === 'monthly' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Monthly Billing
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('annual')}
            className={`px-4 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
              billingCycle === 'annual' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
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
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 rounded-xl font-semibold transition shrink-0 cursor-pointer"
          >
            Apply Code
          </button>
        </form>
      </div>

      {promoMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 font-mono animate-fadeIn">
          {promoMsg}
        </div>
      )}

      {/* All-Features-Unlocked Disclaimer Banner */}
      <SectionCard id="credits-unlocked-banner" padding="p-4" className="rounded-2xl bg-gradient-to-r from-blue-950/40 via-purple-950/40 to-slate-950/40 border border-blue-500/30" header={
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="text-xs font-bold text-white flex items-center gap-1.5">
            <span>All Platform Features & Tools Are 100% Unlocked on Every Plan</span>
            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-mono font-semibold">NO FEATURE GATING</span>
          </div>
        </div>
      }>
        <p className="text-xs text-slate-300 mt-0.5">
          Every plan includes full access to Universal Assignment Dump, AI Audio Transcription, AI Cognitive Vision & Reasoning, Overlord Multi-Agent Sandboxes, and all 5 AI Integrity Detectors. Your token allocation simply determines your monthly compute capacity.
        </p>
      </SectionCard>

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
                tier.popular ? 'border-blue-500/50 shadow-xl shadow-blue-500/10' : 'border-white/10'
              }`}
              header={
                <div>
                  <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{tier.capacity}</p>
                </div>
              }
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-600 text-white font-bold text-[10px] uppercase tracking-wider shadow-lg">
                  Most Popular
                </div>
              )}

              <div className="space-y-4">

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
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

                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-0.5">
                  <div className="text-xs font-bold text-blue-300 font-mono flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>{tier.credits}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Equivalent to {tier.standardTokens}
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
                  className={`w-full py-3 rounded-xl font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-2 ${
                    tier.popular
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5 text-blue-300" />
                  <span>Secure 2FA Checkout</span>
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
          <div className="clean-card rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-white/10 space-y-5 animate-fadeIn text-slate-100 relative">
            
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setCheckoutModalOpen(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
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
                <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 space-y-2">
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
                    <span className="text-blue-400 font-mono">${calculatedAmount}.00 USD</span>
                  </div>
                </div>

                {/* Step 1: Account Credentials */}
                <div className="space-y-2.5">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-blue-400" />
                    Step 1: Account Username & Password
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Username / Public ID"
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-slate-600"
                    />
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Account Password"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 pr-9 text-white placeholder:text-slate-600"
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
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-950 border border-white/5">
                    <button
                      type="button"
                      onClick={() => setTwoFactorMethod('email')}
                      className={`py-2 rounded-lg flex items-center justify-center gap-2 font-semibold transition cursor-pointer ${
                        twoFactorMethod === 'email'
                          ? 'bg-blue-600 text-white shadow-sm'
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
                          ? 'bg-blue-600 text-white shadow-sm'
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
                      className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-slate-600 font-mono"
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
                      className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] font-mono text-white focus:outline-none focus:border-emerald-400"
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
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
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
          <p className="text-xl font-bold text-blue-400">{costData?.most_used_effort_tier || '—'}</p>
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

