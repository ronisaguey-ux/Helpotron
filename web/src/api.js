// Unified API client for Helpotron with automatic X-Public-ID and CSRF header handling.

const DEFAULT_SERVER = '';

export function getServer() {
  const saved = localStorage.getItem('helpotron_server');
  if (saved && (saved.startsWith('http://') || saved.startsWith('https://'))) {
    if (typeof window !== 'undefined' && saved.includes(window.location.host)) {
      return '';
    }
    return saved;
  }
  return '';
}

export function getUserId() {
  return localStorage.getItem('public_id') || localStorage.getItem('helpotron_public_id') || 'RoniDev';
}

export function setServer(server) {
  localStorage.setItem('helpotron_server', server);
}

export function setUserId(id) {
  localStorage.setItem('public_id', id);
  localStorage.setItem('helpotron_public_id', id);
}

function getBaseUrl() {
  return getServer();
}

function getCsrfToken() {
  const local = localStorage.getItem('helpotron_csrf_token');
  if (local) return local;
  const name = 'csrf_token=';
  const decoded = decodeURIComponent(document.cookie);
  const parts = decoded.split(';');
  for (let i = 0; i < parts.length; i++) {
    let part = parts[i].trim();
    if (part.indexOf(name) === 0) {
      return part.substring(name.length, part.length);
    }
  }
  return null;
}

export async function request(endpoint, options = {}) {
  // Ensure endpoint starts with /api if relative
  let cleanEndpoint = endpoint;
  if (!cleanEndpoint.startsWith('http://') && !cleanEndpoint.startsWith('https://') && !cleanEndpoint.startsWith('/api') && cleanEndpoint.startsWith('/')) {
    cleanEndpoint = `/api${cleanEndpoint}`;
  }
  const url = `${getBaseUrl()}${cleanEndpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const userId = getUserId();
  if (userId) {
    headers['X-Public-ID'] = userId;
  }

  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const method = options.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && method !== 'TRACE') {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data && data.csrf_token) {
    localStorage.setItem('helpotron_csrf_token', data.csrf_token);
  }

  // Support both raw data and axios-style .data access
  if (data && typeof data === 'object') {
    if (!('data' in data)) {
      Object.defineProperty(data, 'data', {
        get() { return this; },
        enumerable: false,
        configurable: true
      });
    }
  }
  return data;
}

export const api = {
  get: (endpoint, opts = {}) => request(endpoint, { method: 'GET', ...opts }),
  post: (endpoint, data, opts = {}) => request(endpoint, { method: 'POST', body: JSON.stringify(data), ...opts }),
  put: (endpoint, data, opts = {}) => request(endpoint, { method: 'PUT', body: JSON.stringify(data), ...opts }),
  delete: (endpoint, opts = {}) => request(endpoint, { method: 'DELETE', ...opts }),
  request,
  
  // Auth endpoints
  login: (public_id, password) => request('/api/login', { method: 'POST', body: JSON.stringify({ public_id, password }) }),
  logout: () => request('/api/logout', { method: 'POST' }),
  me: () => request('/api/me', { method: 'GET' }),
  signup: (public_id, password) => request('/api/signup', { method: 'POST', body: JSON.stringify({ public_id, password }) }),
  adminCheck: () => request('/api/admin/check', { method: 'GET' }),
  
  // Health and data
  health: () => request('/api/health', { method: 'GET' }),
  dashboard: (userId, limit = 50, offset = 0) => request(`/api/dashboard?public_id=${userId || 'RoniDev'}&limit=${limit}&offset=${offset}`, { method: 'GET' }),
  studyGuide: (body) => request('/api/study-guide', { method: 'POST', body: JSON.stringify(body) }),
  flashcards: (body) => request('/api/flashcards', { method: 'POST', body: JSON.stringify(body) }),
  practiceTest: (body) => request('/api/practice-test', { method: 'POST', body: JSON.stringify(body) }),
  summary: (body) => request('/api/summary', { method: 'POST', body: JSON.stringify(body) }),
  updateSettings: (settings) => request('/api/user/settings', { method: 'PATCH', body: JSON.stringify(settings) }),
  pay: (body) => request('/api/payments', { method: 'POST', body: JSON.stringify(body) }),
  discount: (body) => request('/api/discount', { method: 'POST', body: JSON.stringify(body) }),

  // Assignment Cards & Overlord Dashboard
  assignmentCards: () => request('/api/assignments/cards', { method: 'GET' }),
  assignmentFullView: (id) => request(`/api/assignment/${id}/full-view`, { method: 'GET' }),
  agentMode: () => request('/api/agent/mode', { method: 'GET' }),
  setAgentMode: (mode) => request('/api/agent/mode', { method: 'POST', body: JSON.stringify({ mode, is_session_override: true }) }),
  agentPermissionsPending: () => request('/api/agent/permissions/pending', { method: 'GET' }),
  agentPermissionRespond: (data) => request('/api/agent/permission/respond', { method: 'POST', body: JSON.stringify(data) }),
  agentPermissionRules: () => request('/api/agent/permissions/rules', { method: 'GET' }),
  addAgentPermissionRule: (rule) => request('/api/agent/permissions/rules', { method: 'POST', body: JSON.stringify({ rule }) }),
  deleteAgentPermissionRule: (rule) => request('/api/agent/permissions/rules/delete', { method: 'POST', body: JSON.stringify({ rule }) }),
  agentChat: (data) => request('/api/agent/chat', { method: 'POST', body: JSON.stringify(data) }),
  simulationStatus: () => request('/api/simulation/status', { method: 'GET' }),
  simulationToggle: (enabled) => request('/api/simulation/toggle', { method: 'POST', body: JSON.stringify({ enabled }) }),
  simulationSeed: () => request('/api/simulation/seed', { method: 'POST' }),
  // Settings, Custom Styles, TRIO, Models & Academic Levels
  getUserSettings: () => request('/api/user/settings', { method: 'GET' }),
  getAcademicLevels: () => request('/api/user/academic-levels', { method: 'GET' }),
  getAvailableModels: () => request('/api/user/models', { method: 'GET' }),
  resolveEffortScore: (score) => request(`/api/user/effort-score/resolve?score=${score || 500}`, { method: 'GET' }),
  getCustomSubjects: () => request('/api/user/custom-subjects', { method: 'GET' }),
  addCustomSubject: (data) => request('/api/user/custom-subjects', { method: 'POST', body: JSON.stringify(data) }),
  deleteCustomSubject: (id) => request(`/api/user/custom-subjects/${id}`, { method: 'DELETE' }),
  addStyleSample: (data) => request('/api/user/styles', { method: 'POST', body: JSON.stringify(data) }),
  deleteStyleSample: (id) => request(`/api/user/styles/${id}`, { method: 'DELETE' }),
  saveTrioRule: (data) => request('/api/user/trio', { method: 'POST', body: JSON.stringify(data) }),
  deleteTrioRule: (id) => request(`/api/user/trio/${id}`, { method: 'DELETE' }),
  resolveTrioContext: (data) => request('/api/user/trio/resolve', { method: 'POST', body: JSON.stringify(data) }),

  // Data Lake & Micro-Credits
  submitDataLakeMicrocredits: (data) => request('/api/datalake/microcredits/submit', { method: 'POST', body: JSON.stringify(data) }),
  getMicrocreditsHistory: (userId) => request(`/api/datalake/microcredits/history?user_id=${userId || 'RoniDev'}`, { method: 'GET' }),
  redeemMicrocredits: (data) => request('/api/datalake/microcredits/redeem', { method: 'POST', body: JSON.stringify(data) }),

  // Mandatory 2FA Purchase Authentication
  sendPurchaseChallenge: (data) => request('/api/auth/2fa/purchase-challenge', { method: 'POST', body: JSON.stringify(data) }),
  verifyPurchaseChallenge: (data) => request('/api/auth/2fa/purchase-verify', { method: 'POST', body: JSON.stringify(data) }),

  // Admin endpoints
  adminUsers: () => request('/api/admin/users', { method: 'GET' }),
  adminAnalytics: () => request('/api/admin/analytics', { method: 'GET' }),
  adminAdjustCredits: (userId, amount, reason) => request(`/api/admin/user/${userId}/credits?amount=${amount}&reason=${encodeURIComponent(reason)}`, { method: 'POST' }),
  adminSetPlan: (userId, plan) => request(`/api/admin/user/${userId}/plan?plan=${plan}`, { method: 'POST' }),
  adminResetPassword: (userId, newPassword) => request(`/api/admin/user/${userId}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password: newPassword }) }),
  adminBanUser: (userId) => request(`/api/admin/user/${userId}/ban`, { method: 'POST' }),
  adminUnbanUser: (userId) => request(`/api/admin/user/${userId}/unban`, { method: 'POST' }),
  adminGenerateToken: (durationDays, maxUses) => request('/api/admin/tokens/generate', { method: 'POST', body: JSON.stringify({ duration_days: durationDays, max_uses: maxUses }) }),
  adminDeactivateToken: (token) => request(`/api/admin/tokens/deactivate?token=${token}`, { method: 'POST' }),
  adminListTokens: () => request('/api/admin/tokens', { method: 'GET' }),
};

export default api;
