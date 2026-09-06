/**
 * preferences.js — User preferences, settings contracts & Telegram integration (Stitch v6 / §3.18).
 * Handles field dirty/valid/submitting/saved state tracking, appearance, and notifications.
 */

export const THEME_OPTIONS = [
  { id: 'dark', label: 'Dark', icon: 'Moon' },
  { id: 'light', label: 'Light', icon: 'Sun' },
  { id: 'system', label: 'System', icon: 'Laptop' },
];

export const ACCENT_PALETTES = [
  { id: 'teal', label: 'Teal (Default)', color: '#59d8c9' },
  { id: 'cyan', label: 'Cyan', color: '#06b6d4' },
  { id: 'indigo', label: 'Indigo', color: '#6366f1' },
  { id: 'emerald', label: 'Emerald', color: '#10b981' },
  { id: 'rose', label: 'Rose', color: '#f43f5e' },
];

export const DEFAULT_PREFERENCES = {
  // Account
  public_id: 'usr_syn_0941',
  plan: 'pro',
  api_key_masked: 'hp_live_9481******************a72f',

  // Appearance
  theme: 'dark',
  accent: 'teal',
  fontScale: 1.0,
  highContrast: false,
  reducedMotion: false,
  dyslexiaFriendly: false,

  // Notifications
  notifyEmail: true,
  notifyInApp: true,
  notifySound: true,
  notifyTelegram: false,

  // Telegram Integration
  telegramConnected: false,
  telegramChatId: '',
  telegramUsername: '',
  telegramNotifyAssignments: true,
  telegramNotifyDueSoon: true,
  telegramNotify2FA: true,

  // Privacy
  twoFactorEnabled: false,
  sessionTimeoutMinutes: 60,
};

/**
 * Validates Telegram handle or phone.
 */
export function validateTelegramHandle(handle = '') {
  const clean = handle.trim();
  if (!clean) return { valid: false, error: 'Telegram username is required' };
  if (!/^@?[a-zA-Z0-9_]{4,32}$/.test(clean)) {
    return { valid: false, error: 'Invalid username format (e.g. @StudentDev)' };
  }
  return { valid: true, error: null };
}

/**
 * Generates a one-time Telegram pairing link/code.
 */
export function generateTelegramPairing(userId = 'usr_0941') {
  const code = `HP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const deepLink = `https://t.me/HelpotronBot?start=${code}`;
  return { code, deepLink };
}
