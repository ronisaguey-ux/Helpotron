// Standalone recording tab: captures microphone audio and uploads to the
// Helpotron server with dynamic real-time audio waveform visualizer.

const params = new URLSearchParams(window.location.search);
const SERVER = params.get('server') || 'http://localhost:8000';
const PUBLIC_ID = params.get('public_id') || 'dev-user';

const timerEl = document.getElementById('timer');
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const stateEl = document.getElementById('state');
const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');

let mediaRecorder = null;
let chunks = [];
let startedAt = 0;
let timerInt = null;
let audioCtx = null;
let analyser = null;
let animFrame = null;

function fmt(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function drawWaveform() {
  if (!analyser) return;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(dataArray);

  canvasCtx.fillStyle = '#1e293b';
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  canvasCtx.lineWidth = 2.5;
  canvasCtx.strokeStyle = '#38bdf8';
  canvasCtx.beginPath();

  const sliceWidth = (canvas.width * 1.0) / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * canvas.height) / 2;

    if (i === 0) {
      canvasCtx.moveTo(x, y);
    } else {
      canvasCtx.lineTo(x, y);
    }
    x += sliceWidth;
  }

  canvasCtx.lineTo(canvas.width, canvas.height / 2);
  canvasCtx.stroke();

  animFrame = requestAnimationFrame(drawWaveform);
}

recordBtn.addEventListener('click', async () => {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    stateEl.textContent = '❌ Microphone access denied — check browser permissions.';
    return;
  }

  // Setup Web Audio API Analyser for real-time waveform
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    drawWaveform();
  } catch (e) {
    console.warn('AudioContext visualization initialization failed:', e);
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
  stateEl.textContent = '● Recording live lecture audio — audio meter active.';
});

stopBtn.addEventListener('click', () => {
  clearInterval(timerInt);
  if (animFrame) cancelAnimationFrame(animFrame);
  if (audioCtx) audioCtx.close().catch(() => {});
  
  if (mediaRecorder) {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((t) => t.stop());
  }
  stopBtn.disabled = true;
  stateEl.textContent = '⏳ Processing and streaming audio to Helpotron…';
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
    stateEl.textContent = `✅ Transcribed ${body.chars} characters (${Math.round((body.duration_seconds || 0) / 60)} min). Study tools generated in dashboard!`;
    timerEl.textContent = fmt(Math.floor((Date.now() - startedAt) / 1000));
  } catch (e) {
    stateEl.textContent = `❌ Upload failed: ${e}`;
  } finally {
    stopBtn.disabled = false;
  }
}
