import React, { useState, useEffect } from 'react';

const CONSENT_KEY = 'helpotron_cookie_consent';

export function CookieBanner() {
  const [consent, setConsent] = useState(() => {
    try {
      return localStorage.getItem(CONSENT_KEY);
    } catch {
      return null;
    }
  });

  // 08-28 (visual polish): while the fixed bar is visible, reserve matching
  // scroll space at the bottom of the page (see .cookie-banner-visible in
  // index.css) so it never covers the footer or primary actions. The class is
  // dropped the moment consent is chosen or the banner unmounts.
  useEffect(() => {
    if (consent) return;
    document.body.classList.add('cookie-banner-visible');
    return () => document.body.classList.remove('cookie-banner-visible');
  }, [consent]);

  if (consent) return null;

  const choose = (value) => {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {
      /* private mode — hide for the session only */
    }
    setConsent(value);
  };

  return (
    <div
      role="region"
      aria-label="Student Privacy & Cookie Choice"
      className="fixed bottom-4 inset-x-4 max-w-4xl mx-auto z-50 bg-[#10121f] border border-white/10 rounded-2xl shadow-2xl p-5 backdrop-blur-xl"
    >
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white tracking-tight">Student Privacy &amp; Cookie Choice</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase font-semibold">
              FERPA Compliant
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            We use essential cookies for secure login and strictly optional anonymous telemetry to improve AI humanizing accuracy.
            We <strong className="text-white">never sell student data</strong>, harvest personal essays, or track browsing across external sites.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 w-full lg:w-auto justify-end">
          <button
            type="button"
            onClick={() => choose('rejected')}
            className="px-3 py-1.5 rounded-xl border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5 transition text-xs font-medium"
          >
            Reject All Optional
          </button>
          <button
            type="button"
            onClick={() => choose('necessary')}
            className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white transition text-xs font-semibold border border-white/10"
          >
            Necessary Only
          </button>
          <button
            type="button"
            onClick={() => choose('accepted')}
            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white transition text-xs font-bold shadow-lg shadow-purple-500/25"
          >
            Accept All &amp; Support Dev
          </button>
        </div>
      </div>
    </div>
  );
}

export default CookieBanner;
