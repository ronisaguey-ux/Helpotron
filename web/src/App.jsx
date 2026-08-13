import React, { useEffect, useMemo, useState } from 'react';
import { api, getServer, getUserId, setServer, setUserId } from './api.js';
import PrivacyPolicy from './PrivacyPolicy.jsx';

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
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[color]}`}>{children}</span>;
};

// ─── main app ───────────────────────────────────────────────────────────────

function App() {
  const [publicId, setPublicId] = useState(() => localStorage.getItem('helpotron_public_id') || '');
  const [server, setServerState] = useState(() => localStorage.getItem('helpotron_server') || 'http://localhost:8000');
  const [assignments, setAssignments] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [credits, setCredits] = useState({ credits: 0, plan: 'basic', discount_balance: 0, discount_spillover: 0 });
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('assignments');
  const [privacyAgreed, setPrivacyAgreed] = useState(() => localStorage.getItem('helpotron_privacy_agreed') === 'true');

  // ─── API helpers ──────────────────────────────────────────────────────

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    'X-Public-ID': publicId,
  }), [publicId]);

  const fetchAssignments = async () => {
    if (!publicId) return;
    try {
      const res = await api.get(`/api/assignments?public_id=${publicId}`);
      setAssignments(res.data || []);
    } catch (e) {
      setError('Failed to load assignments');
    }
  };

  const fetchMaterials = async () => {
    if (!publicId) return;
    try {
      const res = await api.get(`/api/materials?public_id=${publicId}`);
      setMaterials(res.data || []);
    } catch (e) {
      setError('Failed to load materials');
    }
  };

  const fetchCredits = async () => {
    if (!publicId) return;
    try {
      const res = await api.get(`/api/credits?public_id=${publicId}`);
      setCredits(res.data || { credits: 0, plan: 'basic' });
    } catch (e) {
      setError('Failed to load credits');
    }
  };

  const fetchSettings = async () => {
    if (!publicId) return;
    try {
      const res = await api.get(`/api/settings?public_id=${publicId}`);
      setSettings(res.data || {});
    } catch (e) {
      setError('Failed to load settings');
    }
  };

  useEffect(() => {
    if (publicId && privacyAgreed) {
      fetchAssignments();
      fetchMaterials();
      fetchCredits();
      fetchSettings();
    }
  }, [publicId, privacyAgreed]);

  // ─── login ─────────────────────────────────────────────────────────────

  const handleLogin = () => {
    if (!publicId.trim()) {
      setError('Please enter your Public ID');
      return;
    }
    localStorage.setItem('helpotron_public_id', publicId);
    localStorage.setItem('helpotron_server', server);
    setServer(server);
    setUserId(publicId);
    fetchAssignments();
    fetchMaterials();
    fetchCredits();
    fetchSettings();
  };

  const handlePrivacyAgree = () => {
    setPrivacyAgreed(true);
    localStorage.setItem('helpotron_privacy_agreed', 'true');
  };

  // ─── render ────────────────────────────────────────────────────────────

  // If privacy not agreed, show the privacy policy
  if (!privacyAgreed) {
    return <PrivacyPolicy onAgree={handlePrivacyAgree} />;
  }

  if (!publicId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6">
          <h1 className="text-2xl font-bold text-center mb-6">🔧 Helpotron Automator</h1>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Server URL</label>
              <input
                type="text"
                value={server}
                onChange={(e) => setServerState(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="http://localhost:8000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Your Public ID</label>
              <input
                type="text"
                value={publicId}
                onChange={(e) => setPublicId(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your unique ID"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button onClick={handleLogin} className="w-full">
              Connect
            </Button>
            <p className="text-xs text-slate-500 text-center mt-4">
              Your Public ID is provided by your system administrator.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // ─── dashboard ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">🔧 Helpotron</span>
            <Badge color="blue">{credits.plan || 'basic'}</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span>💰 {credits.credits?.toFixed(1) || 0} credits</span>
            <span>📊 {credits.discount_balance || 0}% discount</span>
            <button
              onClick={() => {
                localStorage.removeItem('helpotron_public_id');
                setPublicId('');
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200 mb-6">
          {['assignments', 'materials', 'settings'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'assignments' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">📋 Assignments</h2>
              <Button onClick={fetchAssignments} variant="outline" className="text-sm">
                Refresh
              </Button>
            </div>
            {assignments.length === 0 ? (
              <Card className="p-8 text-center text-slate-500">
                No assignments found. Connect your Canvas account or upload manually.
              </Card>
            ) : (
              <div className="space-y-3">
                {assignments.map((a) => (
                  <Card key={a.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium">{a.title}</h3>
                        <p className="text-sm text-slate-500">Due: {a.due_date || 'No due date'}</p>
                        <p className="text-sm text-slate-600 line-clamp-2">{a.prompt}</p>
                      </div>
                      <Badge color={a.status === 'completed' ? 'green' : a.status === 'failed' ? 'red' : 'amber'}>
                        {a.status || 'tracked'}
                      </Badge>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button variant="outline" className="text-xs px-3 py-1">
                        Generate Materials
                      </Button>
                      <Button variant="outline" className="text-xs px-3 py-1">
                        Generate Draft
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'materials' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">📚 Study Materials</h2>
            {materials.length === 0 ? (
              <Card className="p-8 text-center text-slate-500">
                No study materials yet. Generate them from your assignments.
              </Card>
            ) : (
              <div className="grid gap-3">
                {materials.map((m) => (
                  <Card key={m.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <Badge color="blue">{m.kind}</Badge>
                        <p className="text-sm text-slate-600 mt-1">
                          {typeof m.content === 'string' ? m.content.substring(0, 200) : JSON.stringify(m.content).substring(0, 200)}
                          ...
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">{new Date(m.created_at).toLocaleDateString()}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">⚙️ Settings</h2>
            <Card className="p-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Reading Level</label>
                  <select
                    value={settings.reading_level || 'college-freshman'}
                    onChange={(e) => {
                      const newSettings = { ...settings, reading_level: e.target.value };
                      setSettings(newSettings);
                      api.post('/api/settings', { public_id: publicId, settings: newSettings });
                    }}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="9th">9th Grade</option>
                    <option value="10th">10th Grade</option>
                    <option value="11th">11th Grade</option>
                    <option value="12th">12th Grade</option>
                    <option value="college-freshman">College Freshman</option>
                    <option value="college-sophomore">College Sophomore</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Tone</label>
                  <select
                    value={settings.tone || 'neutral'}
                    onChange={(e) => {
                      const newSettings = { ...settings, tone: e.target.value };
                      setSettings(newSettings);
                      api.post('/api/settings', { public_id: publicId, settings: newSettings });
                    }}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="formal">Formal</option>
                    <option value="neutral">Neutral</option>
                    <option value="casual">Casual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Theme</label>
                  <select
                    value={settings.theme || 'light'}
                    onChange={(e) => {
                      const newSettings = { ...settings, theme: e.target.value };
                      setSettings(newSettings);
                      api.post('/api/settings', { public_id: publicId, settings: newSettings });
                    }}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="auto">Auto</option>
                  </select>
                </div>
                <div className="pt-4 border-t">
                  <h3 className="font-medium text-sm">📱 Telegram Notifications</h3>
                  <p className="text-xs text-slate-500 mt-1">Configure your Telegram bot to receive alerts.</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      placeholder="Bot Token"
                      className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      value={settings.telegram_bot_token || ''}
                      onChange={(e) => {
                        const newSettings = { ...settings, telegram_bot_token: e.target.value };
                        setSettings(newSettings);
                        api.post('/api/settings', { public_id: publicId, settings: newSettings });
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Chat ID"
                      className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      value={settings.telegram_chat_id || ''}
                      onChange={(e) => {
                        const newSettings = { ...settings, telegram_chat_id: e.target.value };
                        setSettings(newSettings);
                        api.post('/api/settings', { public_id: publicId, settings: newSettings });
                      }}
                    />
                    <Button variant="outline" className="text-sm" onClick={() => {
                      api.post('/api/features/telegram/test', {}, { headers });
                    }}>
                      Test
                    </Button>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <h3 className="font-medium text-sm">🎫 Redeem Token</h3>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter your token"
                      className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      id="tokenInput"
                    />
                    <Button variant="outline" className="text-sm" onClick={() => {
                      const token = document.getElementById('tokenInput').value;
                      api.post('/api/admin/tokens/redeem', { token }, { headers });
                    }}>
                      Redeem
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
