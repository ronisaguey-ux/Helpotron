// Unified API client for Helpotron with automatic X-Public-ID and CSRF header handling.
import { isDemoMode, resolveDemoRequest, mockGenerateStream } from './mock.js';

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

  // DEMO MODE: registered endpoints return hardcoded sample data instead of
  // hitting the backend (only while the demo toggle is ON; unmocked endpoints
  // fall through to the real network request below).
  if (isDemoMode()) {
    const demoData = await resolveDemoRequest(method, url, options.body);
    if (demoData !== null && demoData !== undefined) {
      const data = demoData;
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

  // FIX B3: SSE streaming generation with live 4-step progress via /api/generate/stream/{kind}.
  // onProgress(evt) fires per progress frame ({step, total, label}); resolves with the
  // material payload; rejects with the in-band error detail when the stream fails.
  generateStream: async (kind, body, onProgress) => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Public-ID': getUserId() || 'RoniDev',
    };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // DEMO MODE: simulate the SSE stream with hardcoded sample material.
    if (isDemoMode()) {
      return mockGenerateStream(kind, body, onProgress);
    }
    const response = await fetch(`${getBaseUrl()}/api/generate/stream/${kind}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop();
      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        let evt;
        try { evt = JSON.parse(line.slice(6)); } catch { continue; }
        if (evt.event === 'progress' && typeof onProgress === 'function') onProgress(evt);
        else if (evt.event === 'done') result = evt.material;
        else if (evt.event === 'error') throw new Error(evt.detail || 'Generation failed');
      }
    }
    if (!result) throw new Error('Generation stream ended without a result');
    return result;
  },
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
  getCustomBubbles: () => request('/api/user/custom-bubbles', { method: 'GET' }),
  addCustomBubble: (data) => request('/api/user/custom-bubbles', { method: 'POST', body: JSON.stringify(data) }),
  deleteCustomBubble: (id) => request(`/api/user/custom-bubbles/${id}`, { method: 'DELETE' }),
  exportAllUserData: () => request('/api/user/data/export-all', { method: 'GET' }),
  softResetData: () => request('/api/user/data/soft-reset', { method: 'POST' }),
  permanentDeleteRequest: (data) => request('/api/user/data/permanent-delete-request', { method: 'POST', body: JSON.stringify(data) }),
  getAssignmentHistory: (subject) => request(`/api/user/assignment-history${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`, { method: 'GET' }),
  getLeaderboard: () => request('/api/user/leaderboard', { method: 'GET' }),
  updateLeaderboardAlias: (data) => request('/api/user/leaderboard/alias', { method: 'POST', body: JSON.stringify(data) }),
  addStyleSample: (data) => request('/api/user/styles', { method: 'POST', body: JSON.stringify(data) }),
  deleteStyleSample: (id) => request(`/api/user/styles/${id}`, { method: 'DELETE' }),
  saveTrioRule: (data) => request('/api/user/trio', { method: 'POST', body: JSON.stringify(data) }),
  deleteTrioRule: (id) => request(`/api/user/trio/${id}`, { method: 'DELETE' }),
  resolveTrioContext: (data) => request('/api/user/trio/resolve', { method: 'POST', body: JSON.stringify(data) }),

  // Data Lake & Micro-Credits
  submitDataLakeMicrocredits: (data) => request('/api/datalake/microcredits/submit', { method: 'POST', body: JSON.stringify(data) }),
  getMicrocreditsHistory: (userId) => request(`/api/datalake/microcredits/history?user_id=${userId || 'RoniDev'}`, { method: 'GET' }),
  redeemMicrocredits: (data) => request('/api/datalake/microcredits/redeem', { method: 'POST', body: JSON.stringify(data) }),

  // Referrals (40-digit single-use codes)
  getReferralCode: () => request('/api/referrals/code', { method: 'GET' }),
  generateReferralCode: () => request('/api/referrals/generate', { method: 'POST' }),
  redeemReferralCode: (code) => request('/api/referrals/redeem', { method: 'POST', body: JSON.stringify({ code }) }),
  getReferralStats: () => request('/api/referrals/stats', { method: 'GET' }),

  // Mandatory 2FA Purchase Authentication
  sendPurchaseChallenge: (data) => request('/api/auth/2fa/purchase-challenge', { method: 'POST', body: JSON.stringify(data) }),
  verifyPurchaseChallenge: (data) => request('/api/auth/2fa/purchase-verify', { method: 'POST', body: JSON.stringify(data) }),

  // Message Admin Direct Channel
  sendMessageToAdmin: (data) => request('/api/user/message-admin', { method: 'POST', body: JSON.stringify(data) }),
  getMyAdminMessages: () => request('/api/user/my-admin-messages', { method: 'GET' }),
  getAllAdminMessages: () => request('/api/admin/messages', { method: 'GET' }),
  replyToAdminMessage: (messageId, reply) => request(`/api/admin/messages/${messageId}/reply`, { method: 'POST', body: JSON.stringify({ reply }) }),

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

  // Cost Monitoring & Per-User Token Multipliers
  adminCostsSummary: () => request('/api/admin/costs/summary', { method: 'GET' }),
  adminUsersCosts: () => request('/api/admin/costs/users', { method: 'GET' }),
  adminSetUserMultiplier: (publicId, multiplier) => request(`/api/admin/costs/users/${publicId}/multiplier`, { method: 'POST', body: JSON.stringify({ multiplier }) }),

  // User Budget, Effort Level & Pre-Flight Cost Estimator
  getUserBudget: (userId) => request(`/api/admin/costs/budget?user_id=${userId || 'RoniDev'}`, { method: 'GET' }),
  updateUserBudget: (data, userId) => request(`/api/admin/costs/budget?user_id=${userId || 'RoniDev'}`, { method: 'POST', body: JSON.stringify(data) }),
  estimateTaskCost: (data, userId) => request(`/api/admin/costs/estimate?user_id=${userId || 'RoniDev'}`, { method: 'POST', body: JSON.stringify(data) }),

  // Universal Assignment Dump & Overlord Routing
  uploadDumpFile: async (formData) => {
    const headers = {
      'X-Public-ID': getUserId() || 'RoniDev',
    };
    const csrf = getCsrfToken();
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
    const res = await fetch(`${getServer()}/api/dump/upload`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Dump upload failed');
    }
    return res.json();
  },
  getDumpList: (userId, status) => request(`/api/dump/list?user_id=${userId || 'RoniDev'}${status ? `&status=${status}` : ''}`, { method: 'GET' }),
  routeDumpItem: (dumpId, payload, userId) => request(`/api/dump/${dumpId}/route?user_id=${userId || 'RoniDev'}`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteDumpItem: (dumpId) => request(`/api/dump/${dumpId}`, { method: 'DELETE' }),

  // Extension Version & Updates
  getExtensionVersion: () => request('/api/extension/version', { method: 'GET' }),
  checkExtensionUpdate: (currentVersion) => request('/api/extension/check-update', { method: 'POST', body: JSON.stringify({ current_version: currentVersion }) }),

  // FERPA / GDPR Self-Service Account Deletion
  deleteAccount: () => request('/api/features/account/delete', { method: 'POST' }),
};

export default api;

