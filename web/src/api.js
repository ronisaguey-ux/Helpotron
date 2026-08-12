// Thin API client for the Helpotron backend.

const DEFAULT_SERVER = 'http://localhost:8000';

export function getServer() {
  return localStorage.getItem('helpotron_server') || DEFAULT_SERVER;
}

export function setServer(url) {
  localStorage.setItem('helpotron_server', url.replace(/\/$/, ''));
}

export function getUserId() {
  return localStorage.getItem('helpotron_user') || 'dev-user';
}

export function setUserId(id) {
  localStorage.setItem('helpotron_user', id);
}

async function request(path, options = {}) {
  const resp = await fetch(`${getServer()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : `HTTP ${resp.status}`;
    throw new Error(detail);
  }
  return body;
}

export const api = {
  health: () => request('/health'),
  status: (publicId) => request(`/api/status/${publicId}`),
  dashboard: (publicId) => request(`/api/dashboard/${publicId}`),
  studyGuide: (body) => request('/api/study-guide', { method: 'POST', body: JSON.stringify(body) }),
  flashcards: (body) => request('/api/flashcards', { method: 'POST', body: JSON.stringify(body) }),
  practiceTest: (body) => request('/api/practice-test', { method: 'POST', body: JSON.stringify(body) }),
  summary: (body) => request('/api/summary', { method: 'POST', body: JSON.stringify(body) }),
  pay: (body) => request('/api/payments', { method: 'POST', body: JSON.stringify(body) }),
  discount: (payload) => request('/api/discount', { method: 'POST', body: JSON.stringify({ public_id: getUserId(), payload }) }),
  updateSettings: (settings) => request(`/api/users/${getUserId()}`, { method: 'PATCH', body: JSON.stringify({ public_id: getUserId(), settings }) }),
  transcribe: async (file) => {
    const form = new FormData();
    form.append('public_id', getUserId());
    form.append('file', file);
    const resp = await fetch(`${getServer()}/api/transcribe`, { method: 'POST', body: form });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `HTTP ${resp.status}`);
    return body;
  },
  // ── Writing style ──
  uploadStyle: (publicId, styleText) =>
    request('/api/style/upload', { method: 'POST', body: JSON.stringify({ public_id: publicId, style_text: styleText }) }),
  getStyle: (publicId) => request(`/api/style/${publicId}`),
  // ── Draft generation ──
  generateDraft: (publicId, assignmentId, threshold) =>
    request('/api/draft/generate', { method: 'POST', body: JSON.stringify({ public_id: publicId, assignment_id: assignmentId, threshold }) }),
  getDraftStatus: (draftId) => request(`/api/draft/${draftId}`),
  retryDraft: (draftId) => request(`/api/draft/${draftId}/retry`, { method: 'POST' }),
  adminHelp: (draftId) => request(`/api/draft/${draftId}/admin`, { method: 'POST' }),
  // ── Orchestrator ──
  startOrchestrator: (publicId, assignmentId) =>
    request('/api/orchestrator/start', { method: 'POST', body: JSON.stringify({ public_id: publicId, assignment_id: assignmentId }) }),
  getOrchestratorStatus: (assignmentId) => request(`/api/orchestrator/status/${assignmentId}`),
  getAllOrchestratorStatuses: (publicId) => request(`/api/orchestrator/all?public_id=${publicId}`),
  sendOrchestratorMessage: (publicId, assignmentId, text) =>
    request(`/api/orchestrator/message/${assignmentId}`, { method: 'POST', body: JSON.stringify({ public_id: publicId, text }) }),
};
