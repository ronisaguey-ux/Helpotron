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
    danger: 'bg-red-600 text-white hover:bg-red-500',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
};

const Input = ({ className = '', ...props }) => (
  <input className={`w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm ${className}`} {...props} />
);

export default function StudyGroups({ userId }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [message, setMessage] = useState('');

  const fetchGroups = async () => {
    try {
      const data = await api.get('/api/groups/my');
      setGroups(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, [userId]);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    setCreateLoading(true);
    setMessage('');
    try {
      const result = await api.post('/api/groups/create', { name: groupName.trim() });
      setMessage(`✅ Group "${result.name}" created! Invite code: ${result.invite_code}`);
      setGroupName('');
      setShowCreate(false);
      await fetchGroups();
    } catch (e) {
      setMessage(`❌ ${e.message}`);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!inviteCode.trim()) return;
    setJoinLoading(true);
    setMessage('');
    try {
      const result = await api.post('/api/groups/join', { invite_code: inviteCode.trim() });
      setMessage(`✅ Joined group "${result.name}"`);
      setInviteCode('');
      await fetchGroups();
    } catch (e) {
      setMessage(`❌ ${e.message}`);
    } finally {
      setJoinLoading(false);
    }
  };

  if (loading) return <Card>Loading study groups…</Card>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">📚 Study Groups</h2>
        <Button onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : '+ Create Group'}
        </Button>
      </div>

      {showCreate && (
        <Card>
          <h3 className="font-semibold mb-2">Create a Study Group</h3>
          <div className="flex gap-3">
            <Input
              placeholder="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <Button onClick={handleCreateGroup} disabled={createLoading || !groupName.trim()}>
              {createLoading ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-semibold mb-2">Join a Group</h3>
        <div className="flex gap-3">
          <Input
            placeholder="Enter invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
          />
          <Button variant="outline" onClick={handleJoinGroup} disabled={joinLoading || !inviteCode.trim()}>
            {joinLoading ? 'Joining…' : 'Join'}
          </Button>
        </div>
      </Card>

      {message && <Card className={message.startsWith('✅') ? 'border-green-200' : 'border-red-200'}>{message}</Card>}

      {groups.length === 0 ? (
        <Card className="text-slate-500 text-sm">You haven't joined any study groups yet.</Card>
      ) : (
        groups.map((g) => (
          <Card key={g.id}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{g.name}</div>
                <div className="text-xs text-slate-400">Invite: {g.invite_code}</div>
              </div>
              <Button variant="outline" onClick={() => navigator.clipboard.writeText(g.invite_code)}>
                Copy Code
              </Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
