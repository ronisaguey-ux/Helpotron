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
    <div className="p-6 rounded-3xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-title-md text-sm font-bold text-on-surface">Two-Factor Authentication</div>
          <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
            Secure your account with an extra verification layer on sign in.
          </p>
        </div>
        <span className={`font-label-caps text-xs uppercase px-3 py-1 rounded-full font-semibold ${
          enabled ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant'
        }`}>
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {msg.text && (
        <div className={`p-3 rounded-xl text-xs font-label-caps uppercase ${msg.type === 'error' ? 'bg-error/15 border border-error/30 text-error' : 'bg-primary/15 border border-primary/30 text-primary'}`}>
          {msg.text}
        </div>
      )}

      {setupStep === 'idle' && (
        <div className="flex items-center gap-3 pt-1">
          {!enabled ? (
            <button type="button" onClick={() => setSetupStep('method_select')}
              className="px-4 py-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary-container font-label-caps text-xs uppercase tracking-wider font-semibold transition cursor-pointer shadow-sm">
              Set up two-factor authentication
            </button>
          ) : (
            <button type="button" onClick={() => { setSetupStep('disabling'); setCode(''); setMsg({ text: '', type: '' }); }}
              className="px-4 py-2.5 rounded-xl bg-error/15 border border-error/30 hover:bg-error/25 text-error font-label-caps text-xs uppercase tracking-wider font-semibold transition cursor-pointer">
              Disable 2FA
            </button>
          )}
        </div>
      )}

      {setupStep === 'method_select' && (
        <div className="space-y-3 pt-4 border-t border-outline-variant/20">
          <label className="block font-label-caps text-xs uppercase tracking-wider text-on-surface-variant">Choose Verification Method:</label>
          <div className="grid grid-cols-3 gap-2">
            {methods.map((m) => (
              <button key={m.key} type="button" onClick={() => setMethod(m.key)}
                className={`p-3 rounded-xl border text-left transition cursor-pointer ${method === m.key ? 'bg-primary/15 border-primary text-on-surface' : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:text-on-surface'}`}>
                <div className="text-xs font-bold">{m.label}</div>
                <div className="font-body-sm text-[11px] text-on-surface-variant leading-tight mt-0.5">{m.desc}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" disabled={loading} onClick={startSetup}
              className="px-4 py-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary-container disabled:opacity-40 font-label-caps text-xs uppercase tracking-wider font-semibold transition cursor-pointer shadow-sm">
              {loading ? 'Setting up…' : 'Continue Setup →'}
            </button>
            <button type="button" onClick={() => setSetupStep('idle')}
              className="px-4 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface-variant hover:text-on-surface font-label-caps text-xs uppercase tracking-wider transition cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      )}

      {setupStep === 'configuring' && (
        <div className="space-y-3 pt-4 border-t border-outline-variant/20">
          {method === 'totp' ? (
            <div className="space-y-2">
              <p className="font-body-sm text-xs text-on-surface">
                Scan the QR code in your Authenticator app, or enter the key manually:
              </p>
              <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30 text-center font-mono text-xs text-primary select-all break-all">
                {secret}
              </div>
            </div>
          ) : (
            <p className="font-body-sm text-xs text-on-surface">A 6-digit verification code has been sent via {method.toUpperCase()}.</p>
          )}
          <div className="space-y-1.5">
            <label htmlFor="two-factor-setup-code" className="font-label-caps text-xs uppercase tracking-wider text-on-surface-variant">Enter 6-Digit Code to Confirm:</label>
            <input id="two-factor-setup-code" type="text" maxLength={6} placeholder="123456" value={code}
              inputMode="numeric" autoComplete="one-time-code"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-2.5 text-center font-tabular-stat text-lg tracking-widest text-on-surface outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" disabled={loading || code.length < 6} onClick={verifySetup}
              className="px-4 py-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary-container disabled:opacity-40 font-label-caps text-xs uppercase tracking-wider font-semibold transition cursor-pointer shadow-sm">
              {loading ? 'Verifying…' : 'Activate 2FA'}
            </button>
            <button type="button" onClick={() => { setSetupStep('idle'); setCode(''); }}
              className="px-4 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface-variant hover:text-on-surface font-label-caps text-xs uppercase tracking-wider transition cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      )}

      {setupStep === 'disabling' && (
        <div className="space-y-3 pt-4 border-t border-outline-variant/20">
          <p className="font-body-sm text-xs text-on-surface">Enter your current 6-digit 2FA security code to confirm turning off 2FA:</p>
          <input type="text" maxLength={6} placeholder="123456" value={code} aria-label="6-digit security code to confirm turning off 2FA"
            inputMode="numeric" autoComplete="one-time-code"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-2.5 text-center font-tabular-stat text-lg tracking-widest text-on-surface outline-none focus:ring-2 focus:ring-error" />
          <div className="flex gap-2 pt-2">
            <button type="button" disabled={loading || code.length < 6} onClick={disable}
              className="px-4 py-2.5 rounded-xl bg-error text-white hover:bg-error/90 disabled:opacity-40 font-label-caps text-xs uppercase tracking-wider font-semibold transition cursor-pointer shadow-sm">
              {loading ? 'Disabling…' : 'Confirm Turn Off'}
            </button>
            <button type="button" onClick={() => { setSetupStep('idle'); setCode(''); }}
              className="px-4 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface-variant hover:text-on-surface font-label-caps text-xs uppercase tracking-wider transition cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
