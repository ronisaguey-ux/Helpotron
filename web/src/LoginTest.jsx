import React, { useState } from 'react';
import api from './api';

export default function LoginTest() {
  const [result, setResult] = useState('Not tested yet');
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleTestLogin = async () => {
    setLoading(true);
    setResult('Sending request...');
    try {
      const res = await api.login(username, password);
      setResult(JSON.stringify(res, null, 2));
    } catch (err) {
      setResult('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', background: '#0f172a', color: '#f8fafc', minHeight: '100vh' }}>
      <h1 style={{ color: '#38bdf8' }}>Helpotron Frontend Login Debugger</h1>
      <p>Enter credentials and click the button below to test the login API call.</p>
      <div style={{ marginBottom: '16px' }}>
        <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} style={{ padding: '8px', marginRight: '8px' }} />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={{ padding: '8px' }} />
      </div>
      <button 
        onClick={handleTestLogin}
        disabled={loading}
        style={{ padding: '12px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', cursor: 'pointer' }}
      >
        {loading ? 'Testing...' : 'Test Login'}
      </button>
      <div style={{ marginTop: '24px', background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
        <h3>Result:</h3>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{result}</pre>
      </div>
    </div>
  );
}
