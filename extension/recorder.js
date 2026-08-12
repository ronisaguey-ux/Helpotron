// Standalone recording tab: captures microphone audio and uploads to the
// Helpotron server. Uses MediaRecorder to an Opus/WebM blob.

const params = new URLSearchParams(window.location.search);
const SERVER = params.get('server') || 'http://localhost:8000';
const PUBLIC_ID = params.get('public_id') || 'dev-user';

const timerEl = document.getElementById('timer');
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const stateEl = document.getElementById('state');

let mediaRecorder = null;
let chunks = [];
let startedAt = 0;
let timerInt = null;

function fmt(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

recordBtn.addEventListener('click', async () => {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    stateEl.textContent = '❌ Microphone access denied — check browser permissions.';
    return;
  }
  chunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mediaRecorder.onstop = upload;
  mediaRecorder.start();
  startedAt = Date.now();
  timerInt = setInterval(() => { timerEl.textContent = fmt(Math.floor((Date.now() - startedAt) / 1000)); }, 500);
  recordBtn.style.display = 'none';
  stopBtn.style.display = 'inline-block';
  stateEl.textContent = '● Recording — stop when the lecture ends.';
});

stopBtn.addEventListener('click', () => {
  clearInterval(timerInt);
  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach((t) => t.stop());
  stopBtn.disabled = true;
  stateEl.textContent = '⏳ Uploading…';
});

async function upload() {
  const blob = new Blob(chunks, { type: 'audio/webm' });
  const form = new FormData();
  form.append('file', blob, `lecture_${Date.now()}.webm`);
  form.append('public_id', PUBLIC_ID);
  try {
    const resp = await fetch(`${SERVER}/api/transcribe`, { method: 'POST', body: form });
    const body = await resp.json();
    if (!resp.ok) {
      stateEl.textContent = `❌ Server: ${body.detail || resp.status}`;
      return;
    }
    stateEl.textContent = `✅ Uploaded ${body.chars} chars of transcript (${Math.round(body.duration_seconds / 60)} min). Generate study tools from the dashboard!`;
    timerEl.textContent = fmt(Math.floor((Date.now() - startedAt) / 1000));
  } catch (e) {
    stateEl.textContent = `❌ Upload failed: ${e}`;
  } finally {
    stopBtn.disabled = false;
  }
}
