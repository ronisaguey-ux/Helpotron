import React, { useState } from 'react';

const CONSENT_KEY = 'helpotron_cookie_consent';

export function CookieBanner() {
  const [consent, setConsent] = useState(() => {
    try {
      return localStorage.getItem(CONSENT_KEY);
    } catch {
      return null;
    }
  });

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
    <div className="fixed bottom-14 md:bottom-0 inset-x-0 z-50 border-t border-white/10 bg-[#0f172a]/95 backdrop-blur shadow-2xl">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
        <p className="text-xs sm:text-sm text-slate-300 flex-1 text-center sm:text-left">
          We use cookies to improve your experience. By continuing you agree to our use of cookies.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => choose('rejected')}
            className="px-4 py-2 rounded-lg border border-white/15 text-slate-300 hover:bg-white/5 transition text-sm font-medium"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => choose('accepted')}
            className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition text-sm font-semibold"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

export default CookieBanner;
