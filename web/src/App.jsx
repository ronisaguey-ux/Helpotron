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
    purple: 'bg-purple-100 text-purple-700',
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
  draft_ready: <Badge color="green">draft ready</Badge>,
  draft_risky: <Badge color="red">risky</Badge>,
  completed: <Badge color="green">✅ completed</Badge>,
}[status] ?? <Badge>{status}</Badge>);

const orchestratorStatusBadge = (status) => ({
  pending: <Badge color="slate">pending</Badge>,
  analyzing: <Badge color="blue">analyzing</Badge>,
  planning: <Badge color="amber">planning</Badge>,
  executing: <Badge color="amber">executing</Badge>,
  reviewing: <Badge color="blue">reviewing</Badge>,
  done: <Badge color="green">✅ done</Badge>,
  risky: <Badge color="red">⚠️ risky</Badge>,
  failed: <Badge color="red">❌ failed</Badge>,
}[status] ?? <Badge>{status}</Badge>);

// ─── main app ─────────────────────────────────────────────────────────────

export default function App() {
  const [userId, setUserIdState] = useState(getUserId);
  const [serverUrl, setServerUrlState] = useState(getServer);
  const [connected, setConnected] = useState(true);
  const [tab, setTab] = useState('overview');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [credits, setCredits] = useState(3);
  const [showPassword, setShowPassword] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminAnalytics, setAdminAnalytics] = useState(null);

  useEffect(() => {
    api.health().then(() => setConnected(true)).catch(() => setConnected(false));
    const saved = localStorage.getItem('helpotron_logged_in');
    if (saved === 'true') {
      setIsLoggedIn(true);
      const user = localStorage.getItem('helpotron_user');
      if (user === 'RoniDev' || user === 'admin') {
        setIsAdmin(true);
        fetchAdminData();
      }
    }
  }, [serverUrl]);

  const fetchAdminData = async () => {
    try {
      const users = await api.get('/api/admin/users');
      setAdminUsers(users || []);
      const analytics = await api.get('/api/admin/analytics');
      setAdminAnalytics(analytics);
    } catch (e) { console.error('Admin fetch error', e); }
  };

  const handleLogin = () => {
    // Use the correct backend credential: lowercase 'd' in Mongosdev999
    if (loginUser === 'RoniDev' && loginPass === 'Mongosdev999') {
      setIsLoggedIn(true);
      setLoginError('');
      localStorage.setItem('helpotron_logged_in', 'true');
      localStorage.setItem('helpotron_user', loginUser);
      if (loginUser === 'RoniDev' || loginUser === 'admin') {
        setIsAdmin(true);
        fetchAdminData();
      }
    } else {
      setLoginError('Invalid credentials');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('helpotron_logged_in');
    localStorage.removeItem('helpotron_user');
    setCredits(3);
    setIsAdmin(false);
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="w-96">
          <h1 className="text-xl font-bold mb-4">🤖 Helpotron Automator</h1>
          <p className="text-sm text-slate-500 mb-4">Sign in to continue. You have {credits} free credits remaining.</p>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Username"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={loginUser}
              onChange={(e) => setLoginUser(e.target.value)}
            />
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm pr-10"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 text-slate-500 hover:text-slate-700"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            {loginError && <p className="text-sm text-red-600">{loginError}</p>}
            <Button className="w-full" onClick={handleLogin}>Sign In</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold">🤖 Helpotron Automator</h1>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>user: <code className="text-slate-700">{userId}</code></span>
            {isAdmin && <Badge color="purple">👑 Admin</Badge>}
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <Button variant="outline" size="sm" onClick={handleLogout}>Logout</Button>
          </div>
        </div>
      </header>

      {!connected && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700">
          ⚠️ Server at {serverUrl} is unreachable — start it with <code>.venv/bin/uvicorn server.main:app --port 8000</code>
        </div>
      )}

      <nav className="mx-auto flex max-w-5xl gap-1 px-4 py-3 flex-wrap">
        {['overview', 'study-tools', 'settings', 'billing'].map((t) => (
          <Button key={t} variant={tab === t ? 'primary' : 'ghost'} onClick={() => setTab(t)} className="capitalize">
            {t.replace('-', ' ')}
          </Button>
        ))}
        {isAdmin && (
          <Button key="admin" variant={tab === 'admin' ? 'primary' : 'ghost'} onClick={() => setTab('admin')} className="capitalize">
            🛡️ Admin
          </Button>
        )}
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
        {tab === 'admin' && isAdmin && <AdminPanel adminUsers={adminUsers} adminAnalytics={adminAnalytics} refreshAdmin={fetchAdminData} />}
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

  const active = data.assignments.filter((a) => a.status !== 'materials_ready' && a.status !== 'draft_ready' && a.status !== 'draft_risky' && a.status !== 'completed').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <div className="text-xs text-slate-500">Active assignments</div>
          <div className="mt-1 text-2xl font-bold">{active}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">Credits remaining</div>
          <div className="mt-1 text-2xl font-bold">{data.credits}</div>
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
          <p className="text-sm text-slate-500">No tracked assignments yet.</p>
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
                  <Progress value={(done / 5) * 100} className="max-w-64" />
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
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.dashboard(userId).then((d) => {
      setData(d);
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
    ['study_guide', '📖 Study guide', 'Key concepts, definitions'],
    ['flashcards', '🃏 Flashcards', 'Q/A pairs for active recall'],
    ['practice_test', '✏️ Practice test', 'MCQs + model answers'],
    ['summary', '⚡ 2-min summary', 'Read right before class'],
  ];

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-2 font-semibold">Source material</h2>
        <label className="text-xs text-slate-500">Assignment (optional)</label>
        <select
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          value={assignmentId}
          onChange={(e) => setAssignmentId(e.target.value)}
        >
          <option value="">— none —</option>
          {data.assignments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
        <label className="mt-3 block text-xs text-slate-500">Lecture transcript</label>
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
          <h2 className="font-semibold">Result — {result.kind}</h2>
          <pre className="whitespace-pre-wrap font-sans text-sm mt-2">{JSON.stringify(result.content, null, 2)}</pre>
        </Card>
      )}
    </div>
  );
}

// ─── settings ─────────────────────────────────────────────────────────────

function Settings({ userId, onUserId, onServer }) {
  const [localUser, setLocalUser] = useState(userId);
  const [localServer, setLocalServer] = useState(getServer());
  const [readingLevel, setReadingLevel] = useState('college-freshman');
  const [tone, setTone] = useState('formal');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.dashboard(userId).then((d) => {
      setReadingLevel(d.settings?.reading_level || 'college-freshman');
      setTone(d.settings?.tone || 'formal');
    }).catch(() => {});
  }, [userId]);

  async function save() {
    await api.updateSettings({ reading_level: readingLevel, tone: 'formal' });
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
        <p className="mt-2 text-xs text-slate-400">Tone is fixed to formal for all assignments.</p>
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
    { name: 'basic', price: '$10', credits: '300 credits', detail: '3M tokens ~300 assignments' },
    { name: 'pro', price: '$20', credits: '600 credits', detail: '6M tokens ~600 assignments (BEST VALUE)' },
    { name: 'elite', price: '$40', credits: '1500 credits', detail: '15M tokens ~1500 assignments' },
  ];

  useEffect(() => {
    api.dashboard(userId).then((d) => setBalance(d.credits)).catch(() => {});
  }, [userId]);

  async function pay(amountCents) {
    setBusy(true); setMsg('');
    try {
      const r = await api.pay({ public_id: userId, provider: 'cashapp', amount_cents: amountCents });
      setBalance(r.credits);
      setMsg(`✅ ${amountCents / 100} paid — balance now ${r.credits} credits`);
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
      setMsg(`✅ Data submitted — +${r.discount_earned}% discount`);
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
        <p className="mt-2 text-xs text-slate-500">Balance: {balance === null ? '…' : `${balance} credits`}</p>
        <p className="text-xs text-slate-400 mt-1">1 credit = 10,000 tokens processed</p>
      </Card>

      {msg && <Card className="text-sm">{msg}</Card>}
    </div>
  );
}

// ─── admin panel ──────────────────────────────────────────────────────────

function AdminPanel({ adminUsers, adminAnalytics, refreshAdmin }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">🛡️ Admin Panel</h2>

      {adminAnalytics && (
        <Card>
          <h3 className="font-semibold mb-2">📊 Analytics</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-slate-500">Total users:</span> {adminAnalytics.users?.total || 0}</div>
            <div><span className="text-slate-500">Total assignments:</span> {adminAnalytics.content?.assignments || 0}</div>
            <div><span className="text-slate-500">Study materials:</span> {adminAnalytics.content?.study_materials || 0}</div>
            <div><span className="text-slate-500">Revenue:</span> ${adminAnalytics.finance?.total_revenue_usd?.toFixed(2) || 0}</div>
          </div>
          <Button variant="outline" className="mt-3 text-sm" onClick={refreshAdmin}>Refresh</Button>
        </Card>
      )}

      <Card>
        <h3 className="font-semibold mb-2">👥 Users</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2">User</th>
                <th className="text-left py-2 px-2">Plan</th>
                <th className="text-left py-2 px-2">Credits</th>
                <th className="text-left py-2 px-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {adminUsers.map((u) => (
                <tr key={u.id} className="border-b hover:bg-slate-50">
                  <td className="py-2 px-2 font-mono text-xs">{u.public_id}</td>
                  <td className="py-2 px-2"><Badge color={u.plan === 'elite' ? 'purple' : u.plan === 'pro' ? 'amber' : 'blue'}>{u.plan}</Badge></td>
                  <td className="py-2 px-2">{u.credits}</td>
                  <td className="py-2 px-2">
                    <div className="flex gap-1 flex-wrap">
                      <Button variant="outline" className="text-xs px-2 py-0.5">+10</Button>
                      <Button variant="outline" className="text-xs px-2 py-0.5">Set Pro</Button>
                      <Button variant="outline" className="text-xs px-2 py-0.5">Set Elite</Button>
                      <Button variant="outline" className="text-xs px-2 py-0.5 text-red-600">Ban</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold mb-2">🔑 Generate Token</h3>
        <div className="flex gap-2">
          <Button variant="outline" className="text-sm">7-day token</Button>
          <Button variant="outline" className="text-sm">30-day token</Button>
          <Button variant="outline" className="text-sm">List tokens</Button>
        </div>
      </Card>
    </div>
  );
}
