import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import PrivacyPolicy from './PrivacyPolicy.jsx';

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
    purple: 'bg-purple-100 text-purple-700',
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[color]}`}>{children}</span>;
};

function App() {
  const [publicId, setPublicId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('helpotron_session'));
  const [assignments, setAssignments] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [credits, setCredits] = useState({ credits: 0, plan: 'basic' });
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('assignments');
  const [privacyAgreed, setPrivacyAgreed] = useState(() => localStorage.getItem('helpotron_privacy_agreed') === 'true');
  const [selectedPlan, setSelectedPlan] = useState('basic');
  const [topUpAmount, setTopUpAmount] = useState(10);
  const [showLogin, setShowLogin] = useState(true);
  const [showSignup, setShowSignup] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState('users');
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminAnalytics, setAdminAnalytics] = useState(null);
  const [adminTokens, setAdminTokens] = useState([]);
  const [tokenDuration, setTokenDuration] = useState(7);
  const [tokenMaxUses, setTokenMaxUses] = useState(1);
  const [generatedToken, setGeneratedToken] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState(null);
  const [adminSuccess, setAdminSuccess] = useState(null);
  const [showCreateAssignment, setShowCreateAssignment] = useState(false);
  const [assignmentText, setAssignmentText] = useState('');
  const [assignmentFiles, setAssignmentFiles] = useState([]);
  const [gradeLevel, setGradeLevel] = useState('B');
  const [subjectGrades, setSubjectGrades] = useState({});
  const [gradeIncrement, setGradeIncrement] = useState(5);
  const [baselineGrade, setBaselineGrade] = useState('C');

  const fetchAssignments = async () => {
    if (!publicId || !isLoggedIn) return;
    try {
      const res = await api.get(`/api/assignments?public_id=${publicId}`);
      setAssignments(res || []);
    } catch (e) { setError('Failed to load assignments'); }
  };

  const fetchMaterials = async () => {
    if (!publicId || !isLoggedIn) return;
    try {
      const res = await api.get(`/api/materials?public_id=${publicId}`);
      setMaterials(res || []);
    } catch (e) { setError('Failed to load materials'); }
  };

  const fetchCredits = async () => {
    if (!publicId || !isLoggedIn) return;
    try {
      const res = await api.get(`/api/credits?public_id=${publicId}`);
      setCredits(res || { credits: 0, plan: 'basic' });
    } catch (e) { setError('Failed to load credits'); }
  };

  const fetchSettings = async () => {
    if (!publicId || !isLoggedIn) return;
    try {
      const res = await api.get(`/api/settings?public_id=${publicId}`);
      setSettings(res || {});
      if (res.grade_level) setGradeLevel(res.grade_level);
      if (res.subject_grades) setSubjectGrades(res.subject_grades);
      if (res.grade_increment) setGradeIncrement(res.grade_increment);
      if (res.baseline_grade) setBaselineGrade(res.baseline_grade);
    } catch (e) { setError('Failed to load settings'); }
  };

  const fetchAdminUsers = async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get('/api/admin/users');
      setAdminUsers(res || []);
    } catch (e) { setAdminError('Failed to load users'); }
  };

  const fetchAdminAnalytics = async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get('/api/admin/analytics');
      setAdminAnalytics(res);
    } catch (e) { setAdminError('Failed to load analytics'); }
  };

  const fetchAdminTokens = async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get('/api/admin/tokens');
      setAdminTokens(res.tokens || []);
    } catch (e) { setAdminError('Failed to load tokens'); }
  };

  useEffect(() => {
    if (publicId && isLoggedIn && privacyAgreed) {
      fetchAssignments();
      fetchMaterials();
      fetchCredits();
      fetchSettings();
      if (publicId === 'RoniDev' || publicId === 'admin') {
        setIsAdmin(true);
      }
    }
  }, [publicId, isLoggedIn, privacyAgreed]);

  useEffect(() => {
    if (isAdmin && isLoggedIn) {
      fetchAdminUsers();
      fetchAdminAnalytics();
      fetchAdminTokens();
    }
  }, [isAdmin]);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/login', { public_id: publicId, password });
      if (res.message === 'Logged in') {
        localStorage.setItem('helpotron_session', 'true');
        localStorage.setItem('helpotron_public_id', publicId);
        setIsLoggedIn(true);
        setShowLogin(false);
        if (publicId === 'RoniDev' || publicId === 'admin') {
          setIsAdmin(true);
        }
      } else {
        setError('Invalid credentials');
      }
    } catch (e) {
      setError('Invalid credentials');
    }
    setLoading(false);
  };

  const handleSignup = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/signup', { public_id: publicId, password });
      if (res.message === 'Account created') {
        localStorage.setItem('helpotron_session', 'true');
        localStorage.setItem('helpotron_public_id', publicId);
        setIsLoggedIn(true);
        setShowSignup(false);
        setShowLogin(false);
      }
    } catch (e) {
      setError('Failed to create account');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('helpotron_session');
    localStorage.removeItem('helpotron_public_id');
    setIsLoggedIn(false);
    setPublicId('');
    setPassword('');
    setIsAdmin(false);
  };

  const handlePrivacyAgree = () => {
    setPrivacyAgreed(true);
    localStorage.setItem('helpotron_privacy_agreed', 'true');
  };

  const handleAdminAdjustCredits = async (userId, amount, reason) => {
    setAdminLoading(true);
    setAdminError(null);
    setAdminSuccess(null);
    try {
      await api.post(`/api/admin/user/${userId}/credits?amount=${amount}&reason=${encodeURIComponent(reason)}`, {});
      setAdminSuccess(`Adjusted credits by ${amount}`);
      fetchAdminUsers();
      fetchAdminAnalytics();
    } catch (e) {
      setAdminError('Failed to adjust credits');
    }
    setAdminLoading(false);
  };

  const handleAdminSetPlan = async (userId, plan) => {
    setAdminLoading(true);
    setAdminError(null);
    setAdminSuccess(null);
    try {
      await api.post(`/api/admin/user/${userId}/plan?plan=${plan}`, {});
      setAdminSuccess(`Set plan to ${plan}`);
      fetchAdminUsers();
    } catch (e) {
      setAdminError('Failed to set plan');
    }
    setAdminLoading(false);
  };

  const handleAdminGenerateToken = async () => {
    setAdminLoading(true);
    setAdminError(null);
    setGeneratedToken(null);
    try {
      const res = await api.post('/api/admin/tokens/generate', { duration_days: tokenDuration, max_uses: tokenMaxUses });
      setGeneratedToken(res.token);
      setAdminSuccess('Token generated!');
      fetchAdminTokens();
    } catch (e) {
      setAdminError('Failed to generate token');
    }
    setAdminLoading(false);
  };

  const handleAdminDeactivateToken = async (token) => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      await api.post(`/api/admin/tokens/deactivate?token=${token}`, {});
      setAdminSuccess('Token deactivated');
      fetchAdminTokens();
    } catch (e) {
      setAdminError('Failed to deactivate token');
    }
    setAdminLoading(false);
  };

  const handleAdminResetPassword = async (userId) => {
    const newPassword = prompt('Enter new password (min 6 chars):');
    if (newPassword && newPassword.length >= 6) {
      setAdminLoading(true);
      try {
        await api.post(`/api/admin/user/${userId}/reset-password`, { new_password: newPassword });
        setAdminSuccess('Password reset successfully');
      } catch (e) {
        setAdminError('Failed to reset password');
      }
      setAdminLoading(false);
    }
  };

  const handleAdminBanUser = async (userId) => {
    if (confirm('Ban this user?')) {
      setAdminLoading(true);
      try {
        await api.post(`/api/admin/user/${userId}/ban`, {});
        setAdminSuccess('User banned');
        fetchAdminUsers();
      } catch (e) {
        setAdminError('Failed to ban user');
      }
      setAdminLoading(false);
    }
  };

  const handleCreateAssignment = async () => {
    if (!assignmentText.trim()) return;
    setLoading(true);
    try {
      await api.post('/api/assignments', {
        public_id: publicId,
        assignments: [{ title: 'New Assignment', prompt: assignmentText, file_urls: assignmentFiles }]
      });
      setAssignmentText('');
      setAssignmentFiles([]);
      setShowCreateAssignment(false);
      fetchAssignments();
    } catch (e) {
      setError('Failed to create assignment');
    }
    setLoading(false);
  };

  const handleSaveSettings = async () => {
    const newSettings = {
      ...settings,
      grade_level: gradeLevel,
      subject_grades: subjectGrades,
      grade_increment: gradeIncrement,
      baseline_grade: baselineGrade,
      tone: 'formal',
    };
    setSettings(newSettings);
    try {
      await api.post('/api/settings', { public_id: publicId, settings: newSettings });
      setError(null);
    } catch (e) {
      setError('Failed to save settings');
    }
  };

  if (!privacyAgreed) {
    return <PrivacyPolicy onAgree={handlePrivacyAgree} />;
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6">
          <h1 className="text-2xl font-bold text-center mb-6">🔧 Helpotron</h1>
          {showLogin && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Public ID</label>
                <input
                  type="text"
                  value={publicId}
                  onChange={(e) => setPublicId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Enter your Public ID"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm pr-10"
                    placeholder="Enter your password"
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 text-slate-500 hover:text-slate-700"
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button onClick={handleLogin} className="w-full" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </Button>
              <p className="text-sm text-center text-slate-600">
                Don't have an account?{' '}
                <button onClick={() => { setShowLogin(false); setShowSignup(true); }} className="text-blue-600 hover:underline">
                  Sign up
                </button>
              </p>
            </div>
          )}
          {showSignup && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Choose a Public ID</label>
                <input
                  type="text"
                  value={publicId}
                  onChange={(e) => setPublicId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Choose a unique ID"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm pr-10"
                    placeholder="Choose a strong password"
                    onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 text-slate-500 hover:text-slate-700"
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button onClick={handleSignup} className="w-full" disabled={loading}>
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>
              <p className="text-sm text-center text-slate-600">
                Already have an account?{' '}
                <button onClick={() => { setShowSignup(false); setShowLogin(true); }} className="text-blue-600 hover:underline">
                  Login
                </button>
              </p>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">🔧 Helpotron</span>
            <Badge color="blue">{credits.plan || 'basic'}</Badge>
            {isAdmin && <Badge color="purple">👑 Admin</Badge>}
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span>💰 {typeof credits.credits === 'number' ? credits.credits.toFixed(1) : '0'} credits</span>
            <span>📊 {credits.discount_balance || 0}% discount</span>
            <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex gap-2 border-b border-slate-200 mb-6 overflow-x-auto">
          {['assignments', 'materials', 'settings', 'billing'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
          {isAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'admin' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              🛡️ Admin
            </button>
          )}
        </div>

        {activeTab === 'assignments' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">📋 Assignments</h2>
              <div className="flex gap-2">
                <Button onClick={() => setShowCreateAssignment(!showCreateAssignment)} variant="outline" className="text-sm">
                  + New Assignment
                </Button>
                <Button onClick={fetchAssignments} variant="outline" className="text-sm">Refresh</Button>
              </div>
            </div>
            {showCreateAssignment && (
              <Card className="p-4">
                <h3 className="font-medium mb-2">Create New Assignment</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Assignment Text / Prompt</label>
                    <textarea
                      value={assignmentText}
                      onChange={(e) => setAssignmentText(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm min-h-[100px]"
                      placeholder="Paste your assignment prompt, text, or upload files below..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Files (paste URLs or paths)</label>
                    <input
                      type="text"
                      value={assignmentFiles.join(', ')}
                      onChange={(e) => setAssignmentFiles(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="file1.pdf, file2.docx, https://example.com/assignment.pdf"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleCreateAssignment} disabled={loading}>
                      {loading ? 'Creating...' : 'Create Assignment'}
                    </Button>
                    <Button variant="outline" onClick={() => setShowCreateAssignment(false)}>Cancel</Button>
                  </div>
                  <p className="text-xs text-slate-500">Sub-agents will analyze the text/files and organize them into structured assignments with a clear chain of action.</p>
                </div>
              </Card>
            )}
            {assignments.length === 0 ? (
              <Card className="p-8 text-center text-slate-500">No assignments found. Click "+ New Assignment" to create one.</Card>
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
                      <Button variant="outline" className="text-xs px-3 py-1">Generate Materials</Button>
                      <Button variant="outline" className="text-xs px-3 py-1">Generate Draft</Button>
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
              <Card className="p-8 text-center text-slate-500">No study materials yet.</Card>
            ) : (
              <div className="grid gap-3">
                {materials.map((m) => (
                  <Card key={m.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <Badge color="blue">{m.kind}</Badge>
                        <p className="text-sm text-slate-600 mt-1">{typeof m.content === 'string' ? m.content.substring(0, 200) : JSON.stringify(m.content).substring(0, 200)}...</p>
                      </div>
                      <span className="text-xs text-slate-400">{new Date(m.created_at).toLocaleDateString()}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
              <p className="font-medium text-blue-800">💡 1 credit = 10,000 tokens (~1 assignment)</p>
              <p className="text-blue-700 mt-1">Basic: ~50 assignments/mo | Pro: ~150 | Elite: ~400</p>
            </div>
            <h2 className="text-xl font-semibold">💳 Choose Your Plan</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['basic', 'pro', 'elite'].map((plan) => (
                <div
                  key={plan}
                  onClick={() => setSelectedPlan(plan)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-colors ${selectedPlan === plan ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <h3 className="font-semibold capitalize">{plan}</h3>
                  <p className="text-2xl font-bold">${plan === 'basic' ? 10 : plan === 'pro' ? 20 : 40}/mo</p>
                  <ul className="mt-2 text-sm text-slate-600 space-y-1">
                    <li>• {plan === 'basic' ? '50' : plan === 'pro' ? '150' : '400'} credits</li>
                    <li>• ~{plan === 'basic' ? '50' : plan === 'pro' ? '150' : '400'} assignments</li>
                  </ul>
                </div>
              ))}
            </div>
            <Button className="w-full mt-4">Subscribe to {selectedPlan} plan</Button>
            <div className="border-t pt-4 mt-4