export const COOKIE_CONSENT_KEY = 'helpotron_cookie_consent';

export function getCookieConsent() {
  try {
    return localStorage.getItem(COOKIE_CONSENT_KEY);
  } catch {
    return null;
  }
}

export function setCookieConsent(value) {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, value);
    window.dispatchEvent(new CustomEvent('helpotron:cookie-consent-changed', { detail: value }));
  } catch {}
}

export function resetCookieConsent() {
  try {
    localStorage.removeItem(COOKIE_CONSENT_KEY);
    window.dispatchEvent(new CustomEvent('helpotron:cookie-consent-changed', { detail: null }));
  } catch {}
}
