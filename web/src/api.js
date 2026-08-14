// Thin API client for the Helpotron backend.

const DEFAULT_SERVER = 'http://localhost:8000';

export function getServer() {
  return localStorage.getItem('helpotron_server') || DEFAULT_SERVER;
}

export function getUserId() {
  return localStorage.getItem('helpotron_public_id') || '';
}

export function setServer(server) {
  localStorage.setItem('helpotron_server', server);
}

export function setUserId(id) {
  localStorage.setItem('helpotron_public_id', id);
}

function getBaseUrl() {
  return getServer();
}

// Get CSRF token from cookie
function getCsrfToken() {
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

async function request(endpoint, options = {}) {
  const url = `${getBaseUrl()}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add CSRF token for state-changing requests
  const method = options.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && method !== 'TRACE') {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  console.log('📡 API Request:', { url, method, headers });
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',  // Include cookies for session
  });
  console.log('📡 API Response:', { status: response.status, statusText: response.statusText });
  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ API Error:', errorText);
    throw new Error(errorText || `HTTP ${response.status}`);
  }
  const data = await response.json();
  console.log('📡 API Data:', data);
  return data;
}

export const api = {
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, data) => request(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  put: (endpoint, data) => request(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
  request,
  
  // Auth endpoints
  login: (public_id, password) => request('/api/login', { method: 'POST', body: JSON.stringify({ public_id, password }) }),
  logout: () => request('/api/logout', { method: 'POST' }),
  me: () => request('/api/me', { method: 'GET' }),
  signup: (public_id, password) => request('/api/signup', { method: 'POST', body: JSON.stringify({ public_id, password }) }),
  adminCheck: () => request('/api/admin/check', { method: 'GET' }),
  
  // Health and data
  health: () => request('/api/health', { method: 'GET' }),
  dashboard: (userId) => request(`/api/dashboard?public_id=${userId}`, { method: 'GET' }),
  studyGuide: (body) => request('/api/study_guide', { method: 'POST', body: JSON.stringify(body) }),
  flashcards: (body) => request('/api/flashcards', { method: 'POST', body: JSON.stringify(body) }),
  practiceTest: (body) => request('/api/practice_test', { method: 'POST', body: JSON.stringify(body) }),
  summary: (body) => request('/api/summary', { method: 'POST', body: JSON.stringify(body) }),
  updateSettings: (settings) => request('/api/settings', { method: 'POST', body: JSON.stringify(settings) }),
  pay: (body) => request('/api/credits/topup', { method: 'POST', body: JSON.stringify(body) }),
  discount: (body) => request('/api/discount', { method: 'POST', body: JSON.stringify(body) }),
  
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
