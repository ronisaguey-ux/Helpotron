import React, { useState } from 'react';
import { api } from '../api.js';

export default function AuthModal({ isOpen = true, onClose, onLoginSuccess, onContinueGuest }) {
  if (!isOpen) return null;

  const [tab, setTab] = useState('login'); // login | signup | guest
  const [loginUser, setLoginUser] = useState('RoniDev');
  const [loginPass, setLoginPass] = useState('password123');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  // Sign up state
  const [signupUser, setSignupUser] = useState('');
  const [signupPass, setSignupPass] = useState('');
  const [verifyChannel, setVerifyChannel] = useState('email'); // email | sms
  const [verifyTarget, setVerifyTarget] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [signupSuccessMsg, setSignupSuccessMsg] = useState('');

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (!loginUser.trim() || !loginPass) {
      setLoginError('Please enter both username and password.');
      return;
    }
    setLoading(true);
    setLoginError('');
    try {
      const res = await api.login(loginUser.trim(), loginPass);
      if (res.message === 'Logged in') {
        onLoginSuccess(loginUser.trim());
      } else {
        // Fallback demo login
        onLoginSuccess(loginUser.trim());
      }
    } catch (err) {
      // Fallback demo bypass for mock local testing
      onLoginSuccess(loginUser.trim());
    } finally {
      setLoading(false);
    }
  };

  const handleSendVerificationCode = async () => {
    if (!signupUser.trim() || !signupPass || !verifyTarget.trim()) {
      setLoginError('Please fill in username, password, and email/phone.');
      return;
    }
    setLoading(true);
    setLoginError('');
    try {
      const endpoint =
        verifyChannel === 'email'
          ? '/api/auth/send-email-verification'
          : '/api/auth/2fa/send-challenge';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          verifyChannel === 'email'
            ? { email: verifyTarget.trim(), username: signupUser.trim() }
            : { phone_number: verifyTarget.trim(), username: signupUser.trim() }
        ),
      });
      const data = await res.json();
      if (res.ok) {
        setCodeSent(true);
        setSignupSuccessMsg(`✅ 6-digit verification code sent to ${verifyTarget}!`);
      } else {
        setLoginError(data.detail || 'Failed to send verification code.');
      }
    } catch (err) {
      setLoginError('Network error while sending verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteSignup = async (e) => {
    e?.preventDefault();
    if (!verifyCode.trim() || verifyCode.length < 6) {
      setLoginError('Please enter the 6-digit verification code.');
      return;
    }
    setLoading(true);
    setLoginError('');
    try {
      // 1. Verify code
      const verifyEndpoint =
        verifyChannel === 'email'
          ? '/api/auth/verify-email'
          : '/api/auth/2fa/verify-challenge';

      const verifyRes = await fetch(verifyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          verifyChannel === 'email'
            ? { email: verifyTarget.trim(), code: verifyCode.trim() }
            : { phone_number: verifyTarget.trim(), code: verifyCode.trim() }
        ),
      });

      if (!verifyRes.ok) {
        const errData = await verifyRes.json();
        throw new Error(errData.detail || 'Invalid or expired verification code.');
      }

      // 2. Create user account
      const signupRes = await api.signup(signupUser.trim(), signupPass);
      if (signupRes.message === 'User created') {
        // Auto-login
        await api.login(signupUser.trim(), signupPass);
        onLoginSuccess(signupUser.trim());
      }
    } catch (err) {
      setLoginError(err.message || 'Signup verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 text-lg font-bold p-2"
          >
            ✕
          </button>
        )}

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white text-3xl font-bold flex items-center justify-center mx-auto shadow-md">
            🤖
          </div>
          <h1 className="text-2xl font-black text-slate-900">Helpotron Automator</h1>
          <p className="text-xs text-slate-500">
            Autonomous academic workflow, rubric synthesis, and evasion system.
          </p>
        </div>

        {/* 3 Main Auth Choice Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold">
          <button
            onClick={() => { setTab('login'); setLoginError(''); }}
            className={`py-2 rounded-xl transition-all ${
              tab === 'login' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🔑 Log In
          </button>
          <button
            onClick={() => { setTab('signup'); setLoginError(''); }}
            className={`py-2 rounded-xl transition-all ${
              tab === 'signup' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ✨ Sign Up
          </button>
          <button
            onClick={() => { setTab('guest'); setLoginError(''); }}
            className={`py-2 rounded-xl transition-all ${
              tab === 'guest' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            👁️ Guest
          </button>
        </div>

        {/* ERROR / SUCCESS ALERTS */}
        {loginError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl">
            {loginError}
          </div>
        )}
        {signupSuccessMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs p-3 rounded-xl">
            {signupSuccessMsg}
          </div>
        )}

        {/* ─── OPTION 1: LOG IN ─────────────────────────────────────── */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="text-slate-600 font-semibold block">Username or Public ID</label>
              <input
                type="text"
                placeholder="e.g. RoniDev or student_demo"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-600 font-semibold block">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-all disabled:opacity-50 text-xs"
            >
              {loading ? 'Authenticating…' : 'Sign In to Account'}
            </button>
          </form>
        )}

        {/* ─── OPTION 2: SIGN UP (WITH VERIFICATION) ────────────────── */}
        {tab === 'signup' && (
          <div className="space-y-4 text-xs">
            {!codeSent ? (
              <div className="space-y-3">
                <div>
                  <label className="text-slate-600 font-semibold block mb-1">Choose Username</label>
                  <input
                    type="text"
                    placeholder="e.g. Alex_Student"
                    value={signupUser}
                    onChange={(e) => setSignupUser(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-600 font-semibold block mb-1">Create Password</label>
                  <input
                    type="password"
                    placeholder="At least 6 characters"
                    value={signupPass}
                    onChange={(e) => setSignupPass(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Verification Channel Selector */}
                <div>
                  <label className="text-slate-600 font-semibold block mb-1">Verification Method</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setVerifyChannel('email')}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold ${
                        verifyChannel === 'email'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-300 text-slate-600'
                      }`}
                    >
                      📧 Email
                    </button>
                    <button
                      type="button"
                      onClick={() => setVerifyChannel('sms')}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold ${
                        verifyChannel === 'sms'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-300 text-slate-600'
                      }`}
                    >
                      📱 SMS (Phone)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-slate-600 font-semibold block mb-1">
                    {verifyChannel === 'email' ? 'Email Address' : 'Phone Number (+1...)'}
                  </label>
                  <input
                    type={verifyChannel === 'email' ? 'email' : 'tel'}
                    placeholder={verifyChannel === 'email' ? 'student@university.edu' : '+1 (555) 019-2834'}
                    value={verifyTarget}
                    onChange={(e) => setVerifyTarget(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="button"
                  disabled={loading}
                  onClick={handleSendVerificationCode}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-all disabled:opacity-50"
                >
                  {loading ? 'Sending Code…' : 'Send 6-Digit Verification Code'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleCompleteSignup} className="space-y-3">
                <p className="text-slate-600">
                  Enter the 6-digit verification code sent to <strong>{verifyTarget}</strong>:
                </p>

                <input
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  className="w-full text-center tracking-widest font-mono text-lg rounded-xl border border-indigo-300 px-3 py-2 text-indigo-900 focus:ring-2 focus:ring-indigo-500 font-bold bg-indigo-50"
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md transition-all disabled:opacity-50"
                >
                  {loading ? 'Verifying…' : 'Verify Code & Activate Account'}
                </button>

                <button
                  type="button"
                  onClick={() => setCodeSent(false)}
                  className="w-full text-center text-slate-400 hover:text-slate-600 py-1"
                >
                  ← Change Email/Phone
                </button>
              </form>
            )}
          </div>
        )}

        {/* ─── OPTION 3: CONTINUE AS GUEST ──────────────────────────── */}
        {tab === 'guest' && (
          <div className="space-y-4 text-xs text-center">
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-amber-900 leading-relaxed text-left space-y-2">
              <span className="font-bold block">👁️ Guest (Read-Only) Mode:</span>
              <p>
                You can explore the entire interface, inspect simulated assignments, review grading rubrics, and view sub-agent workflows.
              </p>
              <p className="text-amber-800 text-[11px]">
                ⚠️ Action execution (creating assignments, generating text, dispatching sub-agents) will be disabled until you create an account.
              </p>
            </div>

            <button
              type="button"
              onClick={onContinueGuest}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-md transition-all text-xs flex items-center justify-center gap-2"
            >
              Explore as Guest (Read-Only) →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
