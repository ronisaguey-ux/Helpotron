import React, { useState } from 'react';
import { api } from '../api.js';
import { Badge } from './ui/os.jsx';

/* Self-contained Two-Factor Authentication widget (reused in Profile + Privacy
 * sections). Anything a user touches for 2FA lives here — operator 08-26. */
export default function TwoFactorSetup({ s, set }) {
  const [method, setMethod] = useState('totp');
  const [setupStep, setSetupStep] = useState('idle'); // idle | method_select | configuring | disabling
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [enabled, setEnabled] = useState(Boolean(s?.privacy?.twoFactorEnabled));

  const startSetup = async () => {
    setLoading(true); setMsg({ text: '', type: '' });
    try {
      const res = await api.setup2FA(method, s?.profile?.phone || null);
      if (res && res.status === 'success') {
        setSecret(res.secret || '');
        setSetupStep('configuring');
        if (res.message) setMsg({ text: res.message, type: 'info' });
      } else {
        setMsg({ text: res?.detail || 'Could not start 2FA setup', type: 'error' });
      }
    } catch (err) {
      setMsg({ text: err.message || 'Error starting 2FA setup', type: 'error' });
    } finally { setLoading(false); }
  };

  const verifySetup = async () => {
    if (!code.trim()) return;
    setLoading(true); setMsg({ text: '', type: '' });
    try {
      const res = await api.verifySetup2FA(method, code.trim(), secret);
      if (res && res.status === 'success') {
        setEnabled(true); setSetupStep('idle'); setCode('');
        set('privacy', { ...s.privacy, twoFactorEnabled: true, twoFactorMethod: method });
        setMsg({ text: 'Two-Factor Authentication is now active on your account.', type: 'success' });
      } else {
        setMsg({ text: res?.detail || 'Invalid verification code', type: 'error' });
      }
    } catch (err) {
      setMsg({ text: err.message || 'Verification failed. Please check the code.', type: 'error' });
    } finally { setLoading(false); }
  };

  const disable = async () => {
    if (!code.trim()) return;
    setLoading(true); setMsg({ text: '', type: '' });
    try {
      const res = await api.disable2FA(code.trim());
      if (res && res.status === 'success') {
        setEnabled(false); setSetupStep('idle'); setCode('');
        set('privacy', { ...s.privacy, twoFactorEnabled: false });
        setMsg({ text: 'Two-Factor Authentication has been disabled.', type: 'info' });
      } else {
        setMsg({ text: res?.detail || 'Failed to disable 2FA', type: 'error' });
      }
    } catch (err) {
      setMsg({ text: err.message || 'Failed to disable 2FA', type: 'error' });
    } finally { setLoading(false); }
  };

  const methods = [
    { key: 'totp', label: 'Authenticator App', desc: 'Google Auth, Authy, 1Password' },
    { key: 'email', label: 'Email Code', desc: 'Delivered to registered email' },
    { key: 'sms', label: 'SMS Message', desc: 'Delivered via text message' },
  ];

  return (
    <div className="p-4 rounded-2xl bg-white/4 border border-white/10 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-white">Two-Factor Authentication</div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Secure your account with an extra verification layer on sign in.
          </p>
        </div>
        <Badge color={enabled ? 'emerald' : 'slate'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
      </div>

      {msg.text && (
        <div className={`p-2.5 rounded-xl text-xs ${msg.type === 'error' ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300' : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'}`}>
          {msg.text}
        </div>
      )}

      {setupStep === 'idle' && (
        <div className="flex items-center gap-3 pt-1">
          {!enabled ? (
            <button type="button" onClick={() => setSetupStep('method_select')}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer shadow-md shadow-blue-900/30">
              Set up two-factor authentication
            </button>
          ) : (
            <button type="button" onClick={() => { setSetupStep('disabling'); setCode(''); setMsg({ text: '', type: '' }); }}
              className="px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold transition cursor-pointer">
              Disable 2FA
            </button>
          )}
        </div>
      )}

      {setupStep === 'method_select' && (
        <div className="space-y-3 pt-2 border-t border-white/10">
          <label className="block text-xs font-medium text-slate-300">Choose Verification Method:</label>
          <div className="grid grid-cols-3 gap-2">
            {methods.map((m) => (
              <button key={m.key} type="button" onClick={() => setMethod(m.key)}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${method === m.key ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-white/4 border-white/8 text-slate-400 hover:text-slate-200'}`}>
                <div className="text-xs font-bold">{m.label}</div>
                <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{m.desc}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" disabled={loading} onClick={startSetup}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold transition cursor-pointer">
              {loading ? 'Setting up…' : 'Continue Setup →'}
            </button>
            <button type="button" onClick={() => setSetupStep('idle')}
              className="px-3.5 py-2 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 text-xs transition cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      )}

      {setupStep === 'configuring' && (
        <div className="space-y-3 pt-2 border-t border-white/10">
          {method === 'totp' ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-300">
                Scan the QR code in your Authenticator app, or enter the key manually:
              </p>
              <div className="p-3 bg-slate-950 rounded-xl border border-white/10 text-center font-mono text-xs text-blue-400 select-all break-all">
                {secret}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-300">A 6-digit verification code has been sent via {method.toUpperCase()}.</p>
          )}
          <div className="space-y-1.5">
            <label htmlFor="two-factor-setup-code" className="text-xs font-semibold text-slate-300">Enter 6-Digit Code to Confirm:</label>
            <input id="two-factor-setup-code" type="text" maxLength={6} placeholder="123456" value={code}
              inputMode="numeric" autoComplete="one-time-code"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-2 text-center font-mono text-base tracking-widest text-white outline-none focus:border-blue-500" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" disabled={loading || code.length < 6} onClick={verifySetup}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold transition cursor-pointer">
              {loading ? 'Verifying…' : 'Activate 2FA'}
            </button>
            <button type="button" onClick={() => { setSetupStep('idle'); setCode(''); }}
              className="px-3.5 py-2 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 text-xs transition cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      )}

      {setupStep === 'disabling' && (
        <div className="space-y-3 pt-2 border-t border-white/10">
          <p className="text-xs text-slate-300">Enter your current 6-digit 2FA security code to confirm turning off 2FA:</p>
          <input type="text" maxLength={6} placeholder="123456" value={code} aria-label="6-digit security code to confirm turning off 2FA"
            inputMode="numeric" autoComplete="one-time-code"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-2 text-center font-mono text-base tracking-widest text-white outline-none focus:border-rose-500" />
          <div className="flex gap-2 pt-1">
            <button type="button" disabled={loading || code.length < 6} onClick={disable}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-semibold transition cursor-pointer">
              {loading ? 'Disabling…' : 'Confirm Turn Off'}
            </button>
            <button type="button" onClick={() => { setSetupStep('idle'); setCode(''); }}
              className="px-3.5 py-2 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 text-xs transition cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
