export const COOKIE_CONSENT_KEY = 'helpotron_cookie_consent';

export function getCookieConsent() {
  try {
    return localStorage.getItem(COOKIE_CONSENT_KEY);
  } catch {
    return null;
  }
}

export function isTelemetryAllowed() {
  return getCookieConsent() === 'all';
}

export function applyConsentToEnvironment(value) {
  try {
    const allowed = value === 'all';
    if (typeof window !== 'undefined') {
      window.__HELPOTRON_TELEMETRY_ALLOWED__ = allowed;

      if (!allowed) {
        // Signal Cloudflare Web Analytics to halt beacon loading
        window.__cfBeacon = { load: 'disable' };
        if (typeof document !== 'undefined') {
          const beaconScripts = document.querySelectorAll(
            'script[src*="cloudflareinsights.com"], script[src*="beacon.min.js"]'
          );
          beaconScripts.forEach((s) => {
            try {
              s.remove();
            } catch {}
          });
        }
      }
    }
  } catch {}
}

export function setCookieConsent(value) {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, value);
    applyConsentToEnvironment(value);
    window.dispatchEvent(new CustomEvent('helpotron:cookie-consent-changed', { detail: value }));
  } catch {}
}

export function resetCookieConsent() {
  try {
    localStorage.removeItem(COOKIE_CONSENT_KEY);
    applyConsentToEnvironment(null);
    window.dispatchEvent(new CustomEvent('helpotron:cookie-consent-changed', { detail: null }));
  } catch {}
}

// Automatically evaluate and enforce stored choice in client environment
if (typeof window !== 'undefined') {
  applyConsentToEnvironment(getCookieConsent());
}
