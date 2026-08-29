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
      aria-label="Cookie consent notice"
      className="fixed bottom-16 md:bottom-0 inset-x-0 z-50 border-t border-[var(--border-subtle)] surface-glass-strong shadow-2xl"
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
        <p className="text-xs sm:text-sm text-slate-300 flex-1 text-center sm:text-left">
          We use cookies to improve your experience. By continuing you agree to our use of cookies.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => choose('rejected')}
            className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-white/5 hover:text-white transition text-sm font-medium"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => choose('accepted')}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition text-sm font-semibold"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

export default CookieBanner;
