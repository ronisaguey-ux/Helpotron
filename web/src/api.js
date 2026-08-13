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
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }
  return response.json();
}

export const api = {
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, data) => request(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  put: (endpoint, data) => request(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
  request,
};
