import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

const Card = ({ className = '', children }) => (
  <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>
);

const Button = ({ variant = 'primary', className = '', ...props }) => {
  const base = 'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-slate-900 text-white hover:bg-slate-700',
    outline: 'border border-slate-300 hover:bg-slate-100',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
};

export default function ReferralSection({ userId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [url, setUrl] = useState('');
  const [stats, setStats] = useState({ total: 0, completed: 0 });
  const [redeemInput, setRedeemInput] = useState('');
  const [redeemMsg, setRedeemMsg] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [codeData, statsData] = await Promise.all([
          api.get('/api/referrals/code'),
          api.get('/api/referrals/stats'),
        ]);
        setCode(codeData.code);
        setUrl(codeData.url);
        setStats(statsData);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleRedeem = async () => {
    if (!redeemInput.trim()) return;
    try {
      const result = await api.post('/api/referrals/redeem', { code: redeemInput.trim() });
      setRedeemMsg(`✅ Referral applied! +${result.bonus_credits} credits`);
      setRedeemInput('');
    } catch (e) {
      setRedeemMsg(`❌ ${e.message}`);
    }
  };

  if (loading) return <Card>Loading referral…</Card>;
  if (error) return <Card className="text-red-600">{error}</Card>;

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-semibold mb-2">📎 Your Referral Code</h2>
        <p className="text-sm text-slate-600 mb-3">Share your code and earn 40 credits per friend who signs up.</p>
        <div className="flex items-center gap-3">
          <code className="bg-slate-100 px-3 py-1.5 rounded text-sm font-mono flex-1">{code}</code>
          <Button variant="outline" onClick={() => navigator.clipboard.writeText(code)}>
            Copy
          </Button>
        </div>
        <p className="text-xs text-slate-400 mt-2">Share link: {url}</p>
        <div className="mt-3 flex gap-4 text-sm">
          <span>Total referrals: <strong>{stats.total}</strong></span>
          <span>Completed: <strong>{stats.completed}</strong></span>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-2">🎁 Redeem a Code</h2>
        <p className="text-sm text-slate-600 mb-3">Got a referral code from a friend? Enter it here.</p>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Enter referral code"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            value={redeemInput}
            onChange={(e) => setRedeemInput(e.target.value)}
          />
          <Button onClick={handleRedeem}>Redeem</Button>
        </div>
        {redeemMsg && <p className="mt-2 text-sm">{redeemMsg}</p>}
      </Card>
    </div>
  );
}
