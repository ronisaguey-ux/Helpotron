/* ────────────────────────────────────────────────────────────────────────────
 * CookieBanner.jsx — LUMINOUS GLASS Student Privacy & Cookie Choice (Spec 3.3.5)
 *
 * Requirements:
 * - Glass card with LUMINOUS GLASS tokens (zero hex literals).
 * - 2 honest buttons: "Necessary only" and "Accept all".
 * - Stored via getCookieConsent / setCookieConsent in localStorage.
 * - Revert path via Settings > Privacy.
 * - Adds .cookie-banner-visible to body while visible to prevent occlusion.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useEffect } from 'react';
import { ShieldCheck, Cookie } from 'lucide-react';
import { getCookieConsent, setCookieConsent, applyConsentToEnvironment } from '../lib/cookieConsent.js';
import Button from './Button.jsx';

export function CookieBanner() {
  const [consent, setConsent] = useState(getCookieConsent);

  useEffect(() => {
    applyConsentToEnvironment(consent);
  }, [consent]);

  useEffect(() => {
    const onConsentChanged = (e) => setConsent(e.detail);
    window.addEventListener('helpotron:cookie-consent-changed', onConsentChanged);
    return () => window.removeEventListener('helpotron:cookie-consent-changed', onConsentChanged);
  }, []);

  useEffect(() => {
    if (consent) {
      document.body.classList.remove('cookie-banner-visible');
      return;
    }
    document.body.classList.add('cookie-banner-visible');
    return () => document.body.classList.remove('cookie-banner-visible');
  }, [consent]);

  if (consent) return null;

  const handleChoose = (choice) => {
    setCookieConsent(choice);
    setConsent(choice);
  };

  return (
    <div
      role="region"
      aria-label="Student Privacy & Cookie Choice"
      className="fixed bottom-4 inset-x-4 max-w-4xl mx-auto z-50 bg-surface-container-low/95 backdrop-blur-xl border border-outline-variant/30 rounded-2xl shadow-2xl p-4 sm:p-5 text-on-surface select-none"
    >
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm font-bold text-on-surface tracking-tight">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Student Privacy &amp; Cookie Choice
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 uppercase font-semibold">
              FERPA Compliant
            </span>
          </div>
          <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
            We use essential cookies for session security and strictly optional anonymous telemetry to improve AI performance.
            We <strong className="text-on-surface font-medium">never sell student data</strong>, harvest coursework, or track browsing across external sites.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full lg:w-auto justify-end">
          <button
            type="button"
            onClick={() => handleChoose('necessary')}
            className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface-variant hover:text-on-surface font-title-md text-xs font-semibold transition cursor-pointer min-h-[44px]"
          >
            Necessary only
          </button>
          <Button
            variant="primary"
            glow={true}
            onClick={() => handleChoose('all')}
            className="px-5 py-2 text-xs uppercase tracking-wider font-semibold min-h-[44px]"
          >
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}

export default CookieBanner;
