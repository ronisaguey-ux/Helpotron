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

async function request(endpoint, options = {}) {
  const url = `${getBaseUrl()}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  console.log('📡 API Request:', { url, method: options.method || 'GET', headers });
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
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
  health: () => request('/api/health', { method: 'GET' }),
  dashboard: (userId) => request(`/api/dashboard?public_id=${userId}`, { method: 'GET' }),
  studyGuide: (body) => request('/api/study_guide', { method: 'POST', body: JSON.stringify(body) }),
  flashcards: (body) => request('/api/flashcards', { method: 'POST', body: JSON.stringify(body) }),
  practiceTest: (body) => request('/api/practice_test', { method: 'POST', body: JSON.stringify(body) }),
  summary: (body) => request('/api/summary', { method: 'POST', body: JSON.stringify(body) }),
  updateSettings: (settings) => request('/api/settings', { method: 'POST', body: JSON.stringify(settings) }),
  pay: (body) => request('/api/credits/topup', { method: 'POST', body: JSON.stringify(body) }),
  discount: (body) => request('/api/discount', { method: 'POST', body: JSON.stringify(body) }),
};
