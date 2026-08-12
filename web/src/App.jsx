import React, { useEffect, useMemo, useState } from 'react';
import { api, getServer, getUserId, setServer, setUserId } from './api.js';

// ─── tiny shadcn-style primitives ─────────────────────────────────────────

const Button = ({ variant = 'primary', className = '', ...props }) => {
  const base = 'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-slate-900 text-white hover:bg-slate-700',
    outline: 'border border-slate-300 hover:bg-slate-100',
    ghost: 'hover:bg-slate-100',
    danger: 'bg-red-600 text-white hover:bg-red-500',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
};

const Card = ({ className = '', children }) => (
  <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>
);

const Badge = ({ color = 'slate', children }) => {
  const colors = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-700',
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[color]}`}>{children}</span>;
};

const Progress = ({ value, className = '' }) => (
  <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-200 ${className}`}>
    <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${Math.min(100, value)}%` }} />
  </div>
);

const statusBadge = (status) => ({
  tracked: <Badge color="slate">tracked</Badge>,
  transcribed: <Badge color="blue">transcribed</Badge>,
  materials_ready: <Badge color="green">ready</Badge>,
}[status] ?? <Badge>{status}</Badge>);

// ─── main app ─────────────────────────────────────────────────────────────

export default function App() {
  const [userId, setUserIdState] = useState(getUserId);
  const [serverUrl, setServerUrlState] = useState(getServer);
  const [connected, setConnected] = useState(true);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    api.health().then(() => setConnected(true)).catch(() => setConnected(false));
  }, [serverUrl]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold">🤖 Helpotron Automator</h1>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>user: <code className="text-slate-700">{userId}</code></span>
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
          </div>
        </div>
      </header>

      {!connected && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700">
          ⚠️ Server at {serverUrl} is unreachable — start it with <code>.venv/bin/uvicorn server.main:app --port 8000</code>
        </div>
      )}

      <nav className="mx-auto flex max-w-5xl gap-1 px-4 py-3">
        {['overview', 'study-tools', 'settings', 'billing'].map((t) => (
          <Button key={t} variant={tab === t ? 'primary' : 'ghost'} onClick={() => setTab(t)} className="capitalize">
            {t.replace('-', ' ')}
          </Button>
        ))}
      </nav>

      <main className="mx-auto max-w-5xl px-4 pb-16">
        {tab === 'overview' && <Overview userId={userId} onGoTo={(t) => setTab(t)} />}
        {tab === 'study-tools' && <StudyTools userId={userId} />}
        {tab === 'settings' && (
          <Settings
            userId={userId}
            onUserId={(id) => { setUserId(id); setUserIdState(id); }}
            onServer={(url) => { setServer(url); setServerUrlState(url); }}
          />
        )}
        {tab === 'billing' && <Billing userId={userId} />}
      </main>
    </div>
  );
}

// ─── overview ─────────────────────────────────────────────────────────────

function Overview({ userId, onGoTo }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.dashboard(userId).then(setData).catch((e) => setError(e.message));
  }, [userId]);

  if (error) return <Card className="text-red-600">{error}</Card>;
  if (!data) return <Card>Loading…</Card>;

  const active = data.assignments.filter((a) => a.status !== 'materials_ready').length;
  const monthly = data.monthly_credits || 40;
  const usagePct = data.plan === 'elite' ? 0 : Math.min(100, (1 - data.credits / monthly) * 100);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <div className="text-xs text-slate-500">Active assignments</div>
          <div className="mt-1 text-2xl font-bold">{active}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">Credits remaining</div>
          <div className="mt-1 text-2xl font-bold">
            {data.plan === 'elite' ? '∞' : data.credits}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">Plan</div>
          <div className="mt-1 text-2xl font-bold capitalize">{data.plan}</div>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Active assignments</h2>
          <Button variant="outline" onClick={() => onGoTo('study-tools')}>Generate materials</Button>
        </div>
        {data.assignments.length === 0 && (
          <p className="text-sm text-slate-500">
            Nothing tracked yet. Open the browser extension on a Canvas assignment page and hit <b>Start Scrape</b>.
          </p>
        )}
        <div className="space-y-3">
          {data.assignments.map((a) => {
            const done = Object.values(a.progress || {}).filter(Boolean).length;
            return (
              <div key={a.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{a.title}</span>
                    {statusBadge(a.status)}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Progress value={(done / 4) * 100} className="max-w-64" />
                    <span className="text-xs text-slate-500">{done}/4 materials</span>
                  </div>
                </div>
                <span className="text-xs text-slate-400">{a.due_date || 'no due date'}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {data.materials.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Latest study materials</h2>
          <div className="flex flex-wrap gap-2">
            {data.materials.slice(0, 6).map((m) => (
              <Badge key={m.id} color="blue">{m.kind}</Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── study tools ──────────────────────────────────────────────────────────

function StudyTools({ userId }) {
  const [data, setData] = useState(null);
  const [assignmentId, setAssignmentId] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const [transcripts, setTranscripts] = useState([]);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.dashboard(userId).then((d) => {
      setData(d);
      const t = [];
      d.assignments.forEach((a) => { if (a.progress?.transcribed) t.push({ id: a.id, title: a.title }); });
      setTranscripts(t);
    }).catch((e) => setError(e.message));
  }, [userId]);

  async function generate(kind) {
    setError(''); setResult(null);
    setBusy(kind);
    try {
      const body = { public_id: userId, transcript_text: transcriptText, assignment_id: assignmentId ? Number(assignmentId) : null };
      const fn = { study_guide: api.studyGuide, flashcards: api.flashcards, practice_test: api.practiceTest, summary: api.summary }[kind];
      const res = await fn(body);
      setResult({ kind, ...res });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  if (error && !data) return <Card className="text-red-600">{error}</Card>;
  if (!data) return <Card>Loading…</Card>;

  const kinds = [
    ['study_guide', '📖 Study guide', 'Key concepts, definitions, sample questions'],
    ['flashcards', '🃏 Flashcards', 'Q/A pairs for active recall'],
    ['practice_test', '✏️ Practice test', 'MCQs + short answers with model answers'],
    ['summary', '⚡ 2-min summary', 'Read right before class'],
  ];

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-2 font-semibold">Source material</h2>
        <label className="text-xs text-slate-500">Assignment (optional — links materials to your tracker)</label>
        <select
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          value={assignmentId}
          onChange={(e) => setAssignmentId(e.target.value)}
        >
          <option value="">— none —</option>
          {data.assignments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
        {transcripts.length > 0 && (
          <p className="mt-2 text-xs text-emerald-600">✅ {transcripts.length} assignment(s) already transcribed</p>
        )}
        <label className="mt-3 block text-xs text-slate-500">Lecture transcript (paste from /api/transcribe or the extension recorder)</label>
        <textarea
          className="mt-1 min-h-40 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="Paste your transcribed lecture here…"
          value={transcriptText}
          onChange={(e) => setTranscriptText(e.target.value)}
        />
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {kinds.map(([kind, label, hint]) => (
          <Card key={kind}>
            <h3 className="font-semibold">{label}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{hint} · 0.5 credits</p>
            <Button className="mt-3" disabled={busy !== '' || !transcriptText.trim() || data.credits < 0.5} onClick={() => generate(kind)}>
              {busy === kind ? 'Generating…' : 'Generate'}
            </Button>
          </Card>
        ))}
      </div>

      {error && <Card className="border-red-200 text-sm text-red-600">{error}</Card>}

      {result && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Result — {result.kind}</h2>
            <span className="text-xs text-slate-400">model: {result.model_used}</span>
          </div>
          <ResultBody result={result} />
        </Card>
      )}
    </div>
  );
}

function ResultBody({ result }) {
  const content = result.content;
  if (Array.isArray(content)) {
    return (
      <div className="space-y-2">
        {content.map((c, i) => (
          <div key={i} className="rounded-md bg-slate-50 p-2 text-sm">
            <div className="font-medium">Q: {c.q}</div>
            <div className="text-slate-600">A: {c.a}</div>
          </div>
        ))}
      </div>
    );
  }
  if (typeof content === 'object') {
    return (
      <div className="space-y-3 text-sm">
        {(content.multiple_choice || []).map((q, i) => (
          <div key={i} className="rounded-md bg-slate-50 p-2">
            <div className="font-medium">{i + 1}. {q.q}</div>
            <div className="ml-2 text-slate-600">{q.options.join('  ·  ')}</div>
            <div className="mt-0.5 text-emerald-700">✓ {q.options[q.answer_index]} — {q.explanation}</div>
          </div>
        ))}
        {(content.short_answer || []).map((q, i) => (
          <div key={`s${i}`} className="rounded-md bg-slate-50 p-2">
            <div className="font-medium">{q.q}</div>
            <div className="text-slate-600">Model answer: {q.model_answer}</div>
          </div>
        ))}
      </div>
    );
  }
  return <pre className="whitespace-pre-wrap font-sans text-sm">{content}</pre>;
}

// ─── settings ─────────────────────────────────────────────────────────────

function Settings({ userId, onUserId, onServer }) {
  const [localUser, setLocalUser] = useState(userId);
  const [localServer, setLocalServer] = useState(getServer());
  const [readingLevel, setReadingLevel] = useState('college-freshman');
  const [tone, setTone] = useState('neutral');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.dashboard(userId).then((d) => {
      setReadingLevel(d.settings?.reading_level || 'college-freshman');
      setTone(d.settings?.tone || 'neutral');
    }).catch(() => {});
  }, [userId]);

  async function save() {
    await api.updateSettings({ reading_level: readingLevel, tone });
    onUserId(localUser.trim());
    onServer(localServer.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-xl space-y-4">
      <Card>
        <h2 className="mb-3 font-semibold">Study preferences</h2>
        <label className="text-xs text-slate-500">Reading level</label>
        <select className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={readingLevel} onChange={(e) => setReadingLevel(e.target.value)}>
          {['9th', '10th', '11th', '12th', 'college-freshman', 'sophomore'].map((l) => <option key={l}>{l}</option>)}
        </select>
        <label className="mt-3 block text-xs text-slate-500">Tone</label>
        <select className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={tone} onChange={(e) => setTone(e.target.value)}>
          {['formal', 'neutral', 'casual'].map((t) => <option key={t}>{t}</option>)}
        </select>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Connection</h2>
        <label className="text-xs text-slate-500">Server URL</label>
        <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={localServer} onChange={(e) => setLocalServer(e.target.value)} />
        <label className="mt-3 block text-xs text-slate-500">Your user id</label>
        <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={localUser} onChange={(e) => setLocalUser(e.target.value)} />
        <Button className="mt-3" onClick={save}>{saved ? '✅ Saved' : 'Save settings'}</Button>
      </Card>
    </div>
  );
}

// ─── billing ──────────────────────────────────────────────────────────────

function Billing({ userId }) {
  const [balance, setBalance] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [discount, setDiscount] = useState(null);

  const plans = [
    { name: 'basic', price: '$10', credits: '15 credits', detail: '$1/credit overage' },
    { name: 'pro', price: '$20', credits: '40 credits', detail: '$0.75/credit overage' },
    { name: 'elite', price: '$30', credits: 'Unlimited', detail: 'no overage' },
  ];

  useEffect(() => {
    api.dashboard(userId).then((d) => setBalance(d.credits)).catch(() => {});
  }, [userId]);

  async function pay(amountCents) {
    setBusy(true); setMsg('');
    try {
      const r = await api.pay({ public_id: userId, provider: 'cashapp', amount_cents: amountCents });
      setBalance(r.credits);
      setMsg(`✅ ${amountCents / 100} paid — balance now ${r.credits} credits (${r.status})`);
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitData() {
    setBusy(true); setMsg('');
    try {
      const r = await api.discount({ grades: 'anonymized example grade history' });
      setDiscount(r);
      setMsg(`✅ Data submitted — +${r.discount_earned}% discount (balance ${r.discount_balance}%)`);
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.name} className="text-center">
            <div className="font-semibold capitalize">{p.name}</div>
            <div className="mt-1 text-2xl font-bold">{p.price}<span className="text-sm font-normal text-slate-500">/mo</span></div>
            <div className="mt-1 text-sm text-slate-600">{p.credits}</div>
            <div className="text-xs text-slate-400">{p.detail}</div>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Top up</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => pay(500)}>$5 → 5 credits</Button>
          <Button variant="outline" disabled={busy} onClick={() => pay(1000)}>$10 → 10 credits</Button>
          <Button variant="outline" disabled={busy} onClick={() => pay(2000)}>$20 → 20 credits</Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Balance: {balance === null ? '…' : balance === '∞' ? '∞' : `${balance} credits`}</p>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Data discount program</h2>
        <p className="text-xs text-slate-500">Opt-in: share anonymized grades/teacher notes → 1% off per submission, max 20% per purchase, spillover carries.</p>
        <Button variant="outline" className="mt-3" disabled={busy} onClick={submitData}>Submit data sample (+1%)</Button>
        {discount && <p className="mt-2 text-xs text-emerald-600">Balance: {discount.discount_balance}% — next purchase: {discount.next_purchase_discount}% off</p>}
      </Card>

      {msg && <Card className="text-sm">{msg}</Card>}
    </div>
  );
}
