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

export default function CreditsPricingDashboard({
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

  const tiers = [
    {
      name: 'Basic',
      basePrice: 10,
      annualBasePrice: 100,
      maxDiscount: 5, // 50% of $10
      credits: '30 Credits / mo',
      creditsAward: 1000,
      capacity: 'Up to 15 Assignment Workflows',
      popular: false,
      features: [
        'Assignment Rubric Analysis',
        'Active Recall Flashcard Generator',
        'Interactive Practice Quizzes',
        'Canvas & LMS Course Sync',
        'Standard Sub-Agent Execution',
      ],
      plan: 'basic',
    },
    {
      name: 'Pro',
      basePrice: 20,
      annualBasePrice: 200,
      maxDiscount: 10, // 50% of $20
      credits: '100 Credits / mo',
      creditsAward: 2000,
      capacity: 'Up to 50 Assignment Workflows + Audio',
      popular: true,
      features: [
        'Everything in Basic',
        'Lecture Audio Transcriber & Summarizer',
        'AI Plagiarism & Humanized Style Passes',
        'Virtual Sub-Agent Sandboxes',
        'Priority Autonomous Scheduling',
      ],
      plan: 'pro',
    },
    {
      name: 'Elite',
      basePrice: 40,
      annualBasePrice: 400,
      maxDiscount: 20, // 50% of $40
      credits: '280 Credits / mo',
      creditsAward: 4000,
      capacity: 'Up to 140 Heavy Workflows & Deep Tasks',
      popular: false,
      features: [
        'Everything in Pro',
        'Full Multi-Agent Overlord Orchestration',
        'Unlimited Sandbox Runtime Instances',
        'Dedicated Compute Node Allocation',
        '24/7 Webhooks & Instant Auto-Approvals',
      ],
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

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier) => {
          const isAnnual = billingCycle === 'annual';
          const base = isAnnual ? tier.annualBasePrice : tier.basePrice;
          const maxCred = isAnnual ? tier.maxDiscount * 10 : tier.maxDiscount;
          const credApplied = useDiscountCredits ? Math.min(userDiscountCredits, maxCred) : 0;
          const finalAmount = Math.max(base - credApplied, base * 0.5);

          return (
            <div
              key={tier.name}
              className={`clean-card rounded-3xl p-6 flex flex-col justify-between transition-all duration-300 relative ${
                tier.popular ? 'border-blue-500/50 shadow-xl shadow-blue-500/10' : 'border-white/10'
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-600 text-white font-bold text-[10px] uppercase tracking-wider shadow-lg">
                  Most Popular
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{tier.capacity}</p>
                </div>

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

                <div className="text-xs font-semibold text-blue-400 font-mono bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-xl">
                  ⚡ {tier.credits}
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
            </div>
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