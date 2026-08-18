import React, { useEffect, useState } from 'react';
import api from '../api';
import {
  ShieldAlert,
  Users,
  MessageSquare,
  Activity,
  Send,
  CheckCircle2,
  Clock,
  KeyRound,
  Shield,
  Trash2,
  RefreshCw,
  AlertCircle,
  Tag,
  Zap,
} from 'lucide-react';

export default function AdminAdvancedDashboard({ userId = 'RoniDev' }) {
  const [activeTab, setActiveTab] = useState('bulk_users');
  const [loading, setLoading] = useState(false);

  // Bulk Users State
  const [users, setUsers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [bulkPlan, setBulkPlan] = useState('');
  const [bulkCredits, setBulkCredits] = useState('');
  const [bulkTag, setBulkTag] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');

  // Health State
  const [healthData, setHealthData] = useState(null);

  // Moderation State
  const [modQueue, setModQueue] = useState([]);

  // Model Metrics State
  const [modelMetrics, setModelMetrics] = useState(null);

  // Admin Messages Inbox State
  const [adminMessages, setAdminMessages] = useState([]);
  const [replyTextMap, setReplyTextMap] = useState({});
  const [replyStatusMap, setReplyStatusMap] = useState({});

  // Tokens & Access Keys State
  const [tokensList, setTokensList] = useState([]);
  const [tokenDuration, setTokenDuration] = useState(30);
  const [tokenMaxUses, setTokenMaxUses] = useState(1);
  const [tokenMsg, setTokenMsg] = useState('');

  useEffect(() => {
    fetchUsers();
    fetchHealth();
    fetchModeration();
    fetchModelMetrics();
    fetchAdminMessages();
    fetchTokens();
  }, [userId]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'X-Public-ID': userId },
      });
      if (res.ok) setUsers(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/admin/system-health', {
        headers: { 'X-Public-ID': userId },
      });
      if (res.ok) setHealthData(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchModeration = async () => {
    try {
      const res = await fetch('/api/admin/moderation', {
        headers: { 'X-Public-ID': userId },
      });
      if (res.ok) {
        const data = await res.json();
        setModQueue(data.queue || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchModelMetrics = async () => {
    try {
      const res = await fetch('/api/admin/model-metrics', {
        headers: { 'X-Public-ID': userId },
      });
      if (res.ok) setModelMetrics(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAdminMessages = async () => {
    try {
      const res = await api.getAllAdminMessages();
      if (res && res.messages) {
        setAdminMessages(res.messages);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTokens = async () => {
    try {
      const res = await api.adminListTokens();
      if (res && res.tokens) {
        setTokensList(res.tokens);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkExecute = async (banStatus = null) => {
    if (selectedUserIds.length === 0) return;
    setLoading(true);
    try {
      const payload = {
        user_ids: selectedUserIds,
        plan: bulkPlan || null,
        delta_credits: bulkCredits ? Number(bulkCredits) : null,
        ban_status: banStatus,
        tags_to_add: bulkTag ? [bulkTag] : null,
      };
      const res = await fetch('/api/admin/bulk-operations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Public-ID': userId,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setBulkStatus('✅ Bulk operation executed successfully!');
        fetchUsers();
        setSelectedUserIds([]);
        setTimeout(() => setBulkStatus(''), 3000);
      }
    } catch (e) {
      setBulkStatus('❌ Bulk operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleModerationAction = async (modId, action) => {
    try {
      const res = await fetch(`/api/admin/moderation/${modId}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Public-ID': userId,
        },
        body: JSON.stringify({ action, admin_notes: 'Reviewed by admin' }),
      });
      if (res.ok) fetchModeration();
    } catch (e) {
      console.error(e);
    }
  };

  const handleOverrideRouting = async (taskType, modelId) => {
    try {
      const res = await fetch('/api/admin/model-metrics/override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Public-ID': userId,
        },
        body: JSON.stringify({ task_type: taskType, model_id: modelId }),
      });
      if (res.ok) fetchModelMetrics();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendAdminReply = async (msgId) => {
    const replyText = replyTextMap[msgId];
    if (!replyText || !replyText.trim()) return;

    try {
      await api.replyToAdminMessage(msgId, replyText.trim());
      setReplyStatusMap((prev) => ({ ...prev, [msgId]: '✅ Reply sent!' }));
      fetchAdminMessages();
    } catch (e) {
      setReplyStatusMap((prev) => ({ ...prev, [msgId]: '❌ Error sending reply' }));
    }
  };

  const handleGenerateToken = async () => {
    try {
      const res = await api.adminGenerateToken(tokenDuration, tokenMaxUses);
      if (res && res.token) {
        setTokenMsg(`✅ Token Created: ${res.token.token}`);
        fetchTokens();
        setTimeout(() => setTokenMsg(''), 6000);
      }
    } catch (e) {
      setTokenMsg('❌ Failed generating token');
    }
  };

  return (
    <div className="space-y-6 text-slate-100 max-w-6xl mx-auto">
      {/* Header */}
      <div className="clean-card p-6 rounded-3xl bg-slate-950/80 border border-purple-500/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Helpotron Master Admin Panel</h1>
            <p className="text-xs text-slate-400">
              Exclusive platform controls: User Management, Inquiries Inbox, Access Keys, Model Scorecards & Health.
            </p>
          </div>
        </div>
        <span className="text-[11px] font-mono font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300 px-3 py-1 rounded-full">
          ADMIN ACCESS: {userId}
        </span>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-800 bg-slate-950/60 rounded-2xl overflow-x-auto text-xs font-semibold p-1.5 gap-1">
        {[
          ['bulk_users', '👥 User Operations'],
          ['inbox', `💬 Inquiries Inbox (${adminMessages.length})`],
          ['tokens', `🔑 Tokens & Keys (${tokensList.length})`],
          ['models', '⚡ Model Scorecards'],
          ['moderation', `🚨 Moderation (${modQueue.length})`],
          ['health', '🩺 System Health'],
          ['system_control', '🛡️ Storage Control'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2.5 rounded-xl whitespace-nowrap transition cursor-pointer font-medium ${
              activeTab === key
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: BULK USERS */}
      {activeTab === 'bulk_users' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-slate-950/60 border border-white/10 space-y-4">
            <h3 className="font-semibold text-sm text-white">Bulk User Operations ({selectedUserIds.length} selected)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Set Plan</label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  value={bulkPlan}
                  onChange={(e) => setBulkPlan(e.target.value)}
                >
                  <option value="">— No Plan Change —</option>
                  <option value="basic">Basic (30 Tokens)</option>
                  <option value="pro">Pro (100 Tokens)</option>
                  <option value="elite">Elite (300 Tokens)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Adjust Credits (+ / -)</label>
                <input
                  type="number"
                  placeholder="e.g. 50 or -20"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  value={bulkCredits}
                  onChange={(e) => setBulkCredits(e.target.value)}
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Assign Tag</label>
                <input
                  type="text"
                  placeholder="e.g. vip, tester"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  value={bulkTag}
                  onChange={(e) => setBulkTag(e.target.value)}
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => handleBulkExecute(null)}
                  disabled={loading || selectedUserIds.length === 0}
                  className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white rounded-xl py-2 font-semibold transition cursor-pointer"
                >
                  Apply to {selectedUserIds.length}
                </button>
              </div>
            </div>

            {bulkStatus && (
              <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl text-xs text-purple-300 font-mono">
                {bulkStatus}
              </div>
            )}
          </div>

          {/* User Table */}
          <div className="clean-card rounded-2xl p-5 bg-slate-950/60 border border-white/10 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 text-[11px]">
                  <th className="pb-3">
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        if (e.target.checked) setSelectedUserIds(users.map((u) => u.id));
                        else setSelectedUserIds([]);
                      }}
                      checked={selectedUserIds.length === users.length && users.length > 0}
                    />
                  </th>
                  <th className="pb-3">User ID</th>
                  <th className="pb-3">Plan</th>
                  <th className="pb-3">Credits</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02]">
                    <td className="py-3">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(u.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedUserIds([...selectedUserIds, u.id]);
                          else setSelectedUserIds(selectedUserIds.filter((id) => id !== u.id));
                        }}
                      />
                    </td>
                    <td className="py-3 font-semibold text-white">{u.public_id}</td>
                    <td className="py-3 capitalize text-blue-300">{u.plan || 'basic'}</td>
                    <td className="py-3 text-emerald-400 font-bold">{u.credits || 0} cr</td>
                    <td className="py-3 text-slate-400">{u.role || 'member'}</td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={async () => {
                          await api.adminAdjustCredits(u.id, 50, 'Admin Grant');
                          fetchUsers();
                        }}
                        className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] mr-2"
                      >
                        +50 cr
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: INQUIRIES INBOX */}
      {activeTab === 'inbox' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-purple-400" />
              Incoming Student & User Inquiries ({adminMessages.length})
            </h3>
            <button
              type="button"
              onClick={fetchAdminMessages}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-mono cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh Inbox
            </button>
          </div>

          {adminMessages.length === 0 ? (
            <div className="clean-card rounded-2xl p-12 text-center text-slate-500 text-xs">
              No incoming messages in Admin inbox.
            </div>
          ) : (
            <div className="space-y-3">
              {adminMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="clean-card rounded-2xl p-5 bg-slate-950/60 border border-white/10 space-y-3 text-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-bold mr-2">
                        {msg.category}
                      </span>
                      <strong className="text-white text-sm">{msg.subject}</strong>
                      <span className="text-slate-400 text-xs ml-2 font-mono">from: {msg.user_id}</span>
                    </div>

                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        msg.status === 'replied'
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      }`}
                    >
                      {msg.status === 'replied' ? '✅ Replied' : '⏳ Pending Reply'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900 text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                    {msg.message}
                  </div>

                  {msg.admin_reply && (
                    <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-500/20 text-purple-200">
                      <strong>Admin Reply:</strong> {msg.admin_reply}
                    </div>
                  )}

                  {/* Reply Box */}
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Type admin response to student..."
                      value={replyTextMap[msg.id] || ''}
                      onChange={(e) => setReplyTextMap({ ...replyTextMap, [msg.id]: e.target.value })}
                      className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-purple-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleSendAdminReply(msg.id)}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Reply</span>
                    </button>
                  </div>

                  {replyStatusMap[msg.id] && (
                    <div className="text-[11px] font-mono text-purple-300">{replyStatusMap[msg.id]}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TOKENS & ACCESS KEYS */}
      {activeTab === 'tokens' && (
        <div className="space-y-4">
          <div className="clean-card rounded-2xl p-5 bg-slate-950/60 border border-white/10 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-purple-400" />
              Generate Platform Access Tokens / Coupons
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Duration (Days)</label>
                <input
                  type="number"
                  value={tokenDuration}
                  onChange={(e) => setTokenDuration(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Max Uses</label>
                <input
                  type="number"
                  value={tokenMaxUses}
                  onChange={(e) => setTokenMaxUses(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleGenerateToken}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold transition cursor-pointer"
                >
                  Generate Token
                </button>
              </div>
            </div>
            {tokenMsg && (
              <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl text-xs text-purple-300 font-mono">
                {tokenMsg}
              </div>
            )}
          </div>

          {/* Tokens List */}
          <div className="clean-card rounded-2xl p-5 bg-slate-950/60 border border-white/10 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 text-[11px]">
                  <th className="pb-3">Token String</th>
                  <th className="pb-3">Max Uses</th>
                  <th className="pb-3">Uses Count</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {tokensList.map((t) => (
                  <tr key={t.token} className="hover:bg-white/[0.02]">
                    <td className="py-3 text-white font-semibold">{t.token}</td>
                    <td className="py-3">{t.max_uses}</td>
                    <td className="py-3">{t.uses_count}</td>
                    <td className="py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                        {t.is_active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="py-3">
                      {t.is_active && (
                        <button
                          type="button"
                          onClick={async () => {
                            await api.adminDeactivateToken(t.token);
                            fetchTokens();
                          }}
                          className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded text-[10px]"
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: MODEL METRICS */}
      {activeTab === 'models' && modelMetrics && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {(modelMetrics.scorecard || []).map((m) => (
              <div key={m.model_id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="font-semibold text-white text-sm">{m.model_id}</div>
                <div className="space-y-1 font-mono text-[11px] text-slate-300">
                  <div>Accuracy: <span className="text-emerald-400">{m.accuracy_score}%</span></div>
                  <div>Latency: <span className="text-white">{m.avg_latency_ms}ms</span></div>
                  <div>Cost / 1k: <span className="text-amber-400">${m.cost_per_1k_tokens_usd}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: MODERATION */}
      {activeTab === 'moderation' && (
        <div className="clean-card rounded-2xl p-5 bg-slate-950/60 border border-white/10 space-y-3">
          <h3 className="text-sm font-bold text-white">Content Moderation Queue ({modQueue.length})</h3>
          {modQueue.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No flagged content pending review.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {modQueue.map((item) => (
                <div key={item.id} className="p-3 bg-slate-900 rounded-xl flex items-center justify-between">
                  <span>{item.type}: {item.title || item.id}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleModerationAction(item.id, 'approved')} className="px-2 py-1 bg-emerald-600 text-white rounded">Approve</button>
                    <button type="button" onClick={() => handleModerationAction(item.id, 'rejected')} className="px-2 py-1 bg-rose-600 text-white rounded">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: HEALTH */}
      {activeTab === 'health' && healthData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-4 rounded-xl bg-slate-900 border border-white/5">
            <span className="text-slate-400 block text-[10px]">API Status</span>
            <strong className="text-emerald-400 text-base">{healthData.api}</strong>
          </div>
          <div className="p-4 rounded-xl bg-slate-900 border border-white/5">
            <span className="text-slate-400 block text-[10px]">Database</span>
            <strong className="text-emerald-400 text-base">{healthData.database}</strong>
          </div>
          <div className="p-4 rounded-xl bg-slate-900 border border-white/5">
            <span className="text-slate-400 block text-[10px]">Sandbox Daemon</span>
            <strong className="text-emerald-400 text-base">{healthData.sandbox}</strong>
          </div>
          <div className="p-4 rounded-xl bg-slate-900 border border-white/5">
            <span className="text-slate-400 block text-[10px]">System Latency</span>
            <strong className="text-white text-base">{healthData.latency_ms}ms</strong>
          </div>
        </div>
      )}

      {/* TAB 7: SYSTEM CONTROL */}
      {activeTab === 'system_control' && (
        <div className="p-5 rounded-2xl bg-slate-950/60 border border-white/10 space-y-4 text-xs">
          <h3 className="text-sm font-bold text-white">Temporary Storage & Cache Control</h3>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem('helpotron_cached_cards');
              } catch (e) {}
              alert('Temporary cache cleared.');
            }}
            className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded-xl transition cursor-pointer"
          >
            Clear Local Runtime Cache
          </button>
        </div>
      )}
    </div>
  );
}
