/**
 * settings.js — Scoped Preferences & User Settings Engine (Stitch v6)
 * Handles global preferences, 3-level scoped preference resolution
 * (task > assignment > class > subject > place), persistence in localStorage,
 * and default configuration schemes.
 */

export const STORAGE_KEY = 'helpotron_settings';

export const SCOPE_LEVELS = [
  { key: 'place', label: 'App place', priority: 1 },
  { key: 'subject', label: 'Subject', priority: 2 },
  { key: 'class', label: 'Class / Teacher', priority: 3 },
  { key: 'assignment', label: 'Assignment', priority: 4 },
  { key: 'task', label: 'Task', priority: 5 },
];

export const APP_PLACES = [
  { key: 'overview', label: 'Dashboard' },
  { key: 'agent', label: 'My Agent' },
  { key: 'insights', label: 'Insights' },
  { key: 'history', label: 'History' },
  { key: 'settings', label: 'Settings' },
  { key: 'dump', label: 'Drop Assignment' },
  { key: 'datalake', label: 'Data Lake' },
  { key: 'credits', label: 'Billing' },
  { key: 'extension', label: 'Extension' },
  { key: 'guide', label: 'Guide' },
  { key: 'admin', label: 'Control Center' },
  { key: 'monitors', label: 'Monitors' },
];

export const DEFAULT_SETTINGS = {
  profile: {
    displayName: 'Student',
    avatarUrl: null,
    academicLevel: 'undergraduate',
  },
  appearance: {
    theme: 'dark', // dark default per Stitch v6
    accent: 'teal',
    density: 'comfortable',
    fontScale: 1.0,
    background: 'luminous_glass',
  },
  ai: {
    effort: 'balanced', // low | balanced | high
    defaultModel: 'deepseek-v3',
    temperature: 0.7,
  },
  accessibility: {
    motion: 'normal',
    contrast: 'normal',
    reading: 'standard',
    screenReader: false,
  },
  notifications: {
    inApp: true,
    email: false,
    telegram: false,
  },
  scoped: {},
};

/**
 * Loads user settings from localStorage, deep-merging with DEFAULT_SETTINGS
 */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      profile: { ...DEFAULT_SETTINGS.profile, ...(parsed.profile || {}) },
      appearance: { ...DEFAULT_SETTINGS.appearance, ...(parsed.appearance || {}) },
      ai: { ...DEFAULT_SETTINGS.ai, ...(parsed.ai || {}) },
      accessibility: { ...DEFAULT_SETTINGS.accessibility, ...(parsed.accessibility || {}) },
      notifications: { ...DEFAULT_SETTINGS.notifications, ...(parsed.notifications || {}) },
      scoped: parsed.scoped || {},
    };
  } catch (e) {
    console.warn('[settings.js] Failed to parse stored settings:', e);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Saves user settings to localStorage
 */
export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    // Dispatch cross-view sync event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('helpotron:settings-updated', { detail: settings }));
    }
  } catch (e) {
    console.warn('[settings.js] Failed to save settings to localStorage:', e);
  }
}

/**
 * Most-specific-wins resolver:
 * Priority hierarchy: task > assignment > class > subject > place
 */
export function resolveScopedValue(scoped, path, ctx = {}) {
  if (!scoped || !scoped[path]) return null;
  const variants = scoped[path];
  if (!Array.isArray(variants) || variants.length === 0) return null;

  // Search from highest specificity down to lowest
  for (let i = SCOPE_LEVELS.length - 1; i >= 0; i--) {
    const level = SCOPE_LEVELS[i].key;
    const ref = ctx[level];
    if (!ref) continue;

    const match = variants.find(
      (v) => v.scope?.level === level && String(v.scope?.ref).toLowerCase() === String(ref).toLowerCase()
    );
    if (match && match.value !== undefined) {
      return match.value;
    }
  }

  return null;
}

/**
 * Resolves a setting with fallback:
 * Checks scoped hierarchy first, then global settings path, then defaultValue
 */
export function getEffectiveSetting(settings, path, ctx = {}, defaultValue = null) {
  const scopedVal = resolveScopedValue(settings?.scoped, path, ctx);
  if (scopedVal != null) return scopedVal;

  const keys = path.split('.');
  let obj = settings;
  for (const k of keys) {
    if (obj == null) return defaultValue;
    obj = obj[k];
  }
  return obj != null ? obj : defaultValue;
}

/**
 * Immutably updates a setting at deep path
 */
export function setSettingByPath(settings, path, value) {
  const next = JSON.parse(JSON.stringify(settings || DEFAULT_SETTINGS));
  const keys = path.split('.');
  let obj = next;
  while (keys.length > 1) {
    const k = keys.shift();
    if (!obj[k] || typeof obj[k] !== 'object') obj[k] = {};
    obj = obj[k];
  }
  obj[keys[0]] = value;
  return next;
}
