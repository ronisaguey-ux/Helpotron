/**
 * TelegramIntegration.jsx — Telegram Notification & Telemetry Integration (Stitch v6 / §3.18.6).
 * Manages pairing with @HelpotronBot, alert preferences, and real verification states.
 */
import React, { useState } from 'react';
import { Send, CheckCircle2, AlertCircle, ExternalLink, Link2, Unlink, Bell } from 'lucide-react';
import { generateTelegramPairing, validateTelegramHandle } from '../lib/preferences.js';

export default function TelegramIntegration({
  preferences = {},
  onChange = () => {},
  disabled = false,
}) {
  const [handleInput, setHandleInput] = useState(preferences.telegramUsername || '');
  const [pairingData, setPairingData] = useState(() => generateTelegramPairing());
  const [copied, setCopied] = useState(false);
  const [validationError, setValidationError] = useState('');

  const isConnected = !!preferences.telegramConnected;

  const handleConnect = (e) => {
    e?.preventDefault();
    const val = validateTelegramHandle(handleInput);
    if (!val.valid) {
      setValidationError(val.error);
      return;
    }
    setValidationError('');
    onChange({
      telegramConnected: true,
      telegramUsername: handleInput.trim(),
      telegramChatId: `tg_${Date.now()}`,
    });
  };

  const handleDisconnect = () => {
    onChange({
      telegramConnected: false,
      telegramUsername: '',
      telegramChatId: '',
    });
    setPairingData(generateTelegramPairing());
  };

  const copyPairingCode = () => {
    navigator.clipboard.writeText(pairingData.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-unit-4 rounded-2xl bg-surface-container-low/60 border border-outline-variant/25 p-unit-5">
      <div className="flex items-center justify-between border-b border-outline-variant/15 pb-3">
        <div className="flex items-center gap-unit-3">
          <div className="w-10 h-10 rounded-xl bg-sem-blue/15 text-sem-blue flex items-center justify-center shrink-0 shadow-sm">
            <Send className="w-5 h-5 -rotate-12" />
          </div>
          <div>
            <h3 className="font-title-md text-title-md font-semibold text-on-surface">
              Telegram Dispatch Channel
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Receive real-time deadline warnings and 2FA approval pings directly on mobile.
            </p>
          </div>
        </div>

        <span
          className={`font-chip-status text-xs px-2.5 py-1 rounded-full uppercase font-medium flex items-center gap-1.5 ${
            isConnected
              ? 'bg-sem-green/15 text-sem-green border border-sem-green/30'
              : 'bg-surface-container text-on-surface-variant'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-sem-green' : 'bg-outline'}`} />
          {isConnected ? 'Connected' : 'Offline'}
        </span>
      </div>

      {!isConnected ? (
        <div className="flex flex-col gap-unit-3">
          <div className="p-unit-4 rounded-xl bg-surface-container-lowest/80 border border-outline-variant/20 flex flex-col gap-unit-3">
            <p className="font-body-sm text-body-sm text-on-surface font-medium">
              Step 1: Open the official Helpotron Telegram bot:
            </p>
            <div className="flex items-center gap-2">
              <a
                href={pairingData.deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="h-10 px-unit-4 rounded-xl bg-sem-blue hover:bg-sem-blue/90 text-surface-container-lowest font-label-caps text-label-caps font-semibold flex items-center gap-2 shadow-sm transition-all"
              >
                <span>Launch @HelpotronBot</span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={copyPairingCode}
                className="h-10 px-unit-3 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/25 text-on-surface font-code-sm text-xs transition-colors cursor-pointer"
              >
                {copied ? 'Code Copied!' : `Pairing Code: ${pairingData.code}`}
              </button>
            </div>
          </div>

          <form onSubmit={handleConnect} className="flex flex-col gap-2">
            <label className="font-label-caps text-xs text-on-surface-variant uppercase">
              Step 2: Enter your Telegram @Username
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={handleInput}
                disabled={disabled}
                onChange={(e) => setHandleInput(e.target.value)}
                placeholder="@StudentDev"
                className="h-11 px-unit-3 rounded-xl bg-surface-container-lowest border border-outline-variant/25 text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-1 focus:ring-primary flex-1"
              />
              <button
                type="submit"
                disabled={disabled || !handleInput.trim()}
                className="h-11 px-unit-4 rounded-xl bg-primary text-on-primary font-label-caps text-label-caps font-semibold flex items-center gap-2 shadow-sm hover:shadow transition-all cursor-pointer disabled:opacity-50"
              >
                <Link2 className="w-4 h-4" />
                <span>Verify &amp; Link</span>
              </button>
            </div>
            {validationError && (
              <span className="font-code-sm text-xs text-error">{validationError}</span>
            )}
          </form>
        </div>
      ) : (
        <div className="flex flex-col gap-unit-3">
          <div className="flex items-center justify-between p-unit-3 rounded-xl bg-surface-container-lowest/80 border border-outline-variant/20">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-sem-green" />
              <span className="font-body-sm text-body-sm text-on-surface font-medium">
                Paired with {preferences.telegramUsername}
              </span>
            </div>
            <button
              type="button"
              onClick={handleDisconnect}
              className="px-unit-3 py-1.5 rounded-lg bg-surface-container hover:bg-error-container/20 text-on-surface-variant hover:text-error font-label-caps text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Unlink className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          </div>

          {/* Notification toggles */}
          <div className="flex flex-col gap-2 pt-1">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">
              Telegram Notification Preferences
            </span>
            {[
              { key: 'telegramNotifyDueSoon', label: 'Impending Due-Date Countdown Warnings (24h / 6h)' },
              { key: 'telegramNotifyAssignments', label: 'Agent Synthesis & Proof Completion Alerts' },
              { key: 'telegramNotify2FA', label: '2FA One-Time Login & Purchase Approval Tokens' },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between p-unit-2.5 rounded-xl bg-surface-container-lowest/60 border border-outline-variant/15 text-xs text-on-surface cursor-pointer hover:bg-surface-container-lowest transition-colors"
              >
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={preferences[item.key] !== false}
                  onChange={(e) => onChange({ [item.key]: e.target.checked })}
                  className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
