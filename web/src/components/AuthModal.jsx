import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { Lock, User, Key, Check, AlertCircle, ArrowRight, ShieldCheck, Mail, Phone } from 'lucide-react';
import { AnimatedLogo } from './ui/AnimatedLogo.jsx';

export default function AuthModal({ isOpen = true, onClose, onLoginSuccess, isMandatory = false }) {
  if (!isOpen) return null;

  const [tab, setTab] = useState('signup'); // 'signup' | 'login'
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  // Sign up state
  const [signupUser, setSignupUser] = useState('');
  const [signupPass, setSignupPass] = useState('');
  const [signupPassConfirm, setSignupPassConfirm] = useState('');
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [signupSuccessMsg, setSignupSuccessMsg] = useState('');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose && !isMandatory) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isMandatory]);

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (!loginUser.trim() || !loginPass) {
      setLoginError('Please enter both your Public ID / Username and password.');
      return;
    }
    setLoading(true);
    setLoginError('');
    try {
      const res = await api.login(loginUser.trim(), loginPass);
      if (res && res.message === 'Logged in') {
        onLoginSuccess(loginUser.trim());
      } else {
        setLoginError('Invalid credentials. Please verify your username and password.');
      }
    } catch (err) {
      setLoginError(err.message || 'Login failed. Please check your username and password.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e?.preventDefault();
    const u = signupUser.trim();
    if (!u || !signupPass) {
      setLoginError('Please provide a username and password.');
      return;
    }
    if (signupPass !== signupPassConfirm) {
      setLoginError('Passwords do not match. Please re-enter.');
      return;
    }
    if (signupPass.length < 8 || !/[A-Za-z]/.test(signupPass) || !/[0-9]/.test(signupPass)) {
      setLoginError('Password must be at least 8 characters and contain both a letter and a number.');
      return;
    }
    if (!consentAgreed) {
      setLoginError('You must agree to the Terms of Service & Privacy Policy.');
      return;
    }

    setLoading(true);
    setLoginError('');
    try {
      const signupRes = await api.signup(u, signupPass);
      if (signupRes && (signupRes.public_id || signupRes.message?.includes('User created'))) {
        // Automatically log in with new credentials
        await api.login(u, signupPass);
        onLoginSuccess(u);
      } else {
        setLoginError(signupRes?.detail || 'Signup failed.');
      }
    } catch (err) {
      setLoginError(err.message || 'Could not create account. Username may already be taken.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Helpotron Authentication"
    >
      <div
        className="w-full max-w-md bg-[#0c1220] border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl text-slate-100 relative overflow-hidden"
        data-modal-container
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Brand Banner */}
        <div className="text-center space-y-2 pb-5 border-b border-white/10">
          <div className="flex justify-center">
            <AnimatedLogo size="lg" />
          </div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">
            {tab === 'signup' ? 'Create Student Account' : 'Sign in to Helpotron'}
          </h2>
          <p className="text-xs text-slate-400">
            {tab === 'signup'
              ? 'Join the autonomous academic operating system & study copilot'
              : 'Enter your credentials to access your autonomous study workspace'}
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex bg-slate-950 p-1 rounded-2xl border border-white/10 my-5">
          <button
            type="button"
            onClick={() => { setTab('signup'); setLoginError(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              tab === 'signup' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => { setTab('login'); setLoginError(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              tab === 'login' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sign In
          </button>
        </div>

        {/* Error Notification */}
        {loginError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{loginError}</span>
          </div>
        )}

        {/* SIGN UP FORM */}
        {tab === 'signup' && (
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Public ID / Username</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. alex_student24"
                  value={signupUser}
                  onChange={(e) => setSignupUser(e.target.value)}
                  className="w-full bg-slate-900 border border-white/15 rounded-xl px-3.5 py-2.5 pl-9 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 outline-none"
                />
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Password</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  placeholder="Min 8 chars, 1 letter & 1 number"
                  value={signupPass}
                  onChange={(e) => setSignupPass(e.target.value)}
                  className="w-full bg-slate-900 border border-white/15 rounded-xl px-3.5 py-2.5 pl-9 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 outline-none"
                />
                <Key className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Confirm Password</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  placeholder="Re-enter your password"
                  value={signupPassConfirm}
                  onChange={(e) => setSignupPassConfirm(e.target.value)}
                  className="w-full bg-slate-900 border border-white/15 rounded-xl px-3.5 py-2.5 pl-9 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 outline-none"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              </div>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer pt-1 select-none">
              <input
                type="checkbox"
                required
                checked={consentAgreed}
                onChange={(e) => setConsentAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-white/20 bg-slate-900 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-[11px] text-slate-400 leading-tight">
                I agree to the <strong>Academic Honor Code</strong> and <strong>FERPA / GDPR Terms</strong>.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !signupUser || !signupPass || !consentAgreed}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-lg shadow-blue-900/40 flex items-center justify-center gap-2"
            >
              {loading ? 'Creating Account…' : 'Create Free Account →'}
            </button>
          </form>
        )}

        {/* SIGN IN FORM */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Public ID / Username</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Enter your username"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  className="w-full bg-slate-900 border border-white/15 rounded-xl px-3.5 py-2.5 pl-9 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 outline-none"
                />
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Password</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  placeholder="Enter your password"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  className="w-full bg-slate-900 border border-white/15 rounded-xl px-3.5 py-2.5 pl-9 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 outline-none"
                />
                <Key className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !loginUser || !loginPass}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-lg shadow-blue-900/40 flex items-center justify-center gap-2"
            >
              {loading ? 'Signing in…' : 'Sign in to Workspace →'}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-white/8 text-center text-[11px] text-slate-500">
          Encrypted with TLS 1.3 &bull; Enterprise Zero Data Retention (ZDR)
        </div>
      </div>
    </div>
  );
}
