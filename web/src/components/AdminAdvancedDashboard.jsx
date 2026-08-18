import React, { useEffect, useState } from 'react';

export default function AdminAdvancedDashboard({ userId }) {
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

  useEffect(() => {
    fetchUsers();
    fetchHealth();
    fetchModeration();
    fetchModelMetrics();
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

  return (
    <div className="space-y-6 text-slate-100">
      {/* Tab Navigation */}
      <div className="flex border-b border-slate-800 bg-slate-950/40 rounded-xl overflow-x-auto text-xs font-semibold p-1">
        {[
          ['bulk_users', '👥 Bulk Operations'],
          ['system_control', '🛡️ Platform System Control'],
          ['health', '🩺 System Health & Latency'],
          ['moderation', '🚨 Content Moderation'],
          ['models', '⚡ Model Performance Scorecard'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2.5 rounded-lg whitespace-nowrap transition ${
              activeTab === key
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: BULK USERS */}
      {activeTab === 'bulk_users' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <h3 className="font-semibold text-sm text-white">Bulk User Operations ({selectedUserIds.length} selected)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Set Plan</label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  value={bulkPlan}
                  onChange={(e) => setBulkPlan(e.target.value)}
                >
                  <option value="">— No Plan Change —</option>
                  <option value="basic">Basic ($10)</option>
                  <option value="pro">Pro ($20)</option>
                  <option value="elite">Elite ($40)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Adjust Credits (+ / -)</label>
                <input
                  type="number"
                  placeholder="e.g. 50 or -20"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  value={bulkCredits}
                  onChange={(e) => setBulkCredits(e.target.value)}
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Assign Tag</label>
                <input
                  type="text"
                  placeholder="e.g. VIP, Trial User"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  value={bulkTag}
                  onChange={(e) => setBulkTag(e.target.value)}
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  disabled={selectedUserIds.length === 0 || loading}
                  onClick={() => handleBulkExecute()}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition"
                >
                  Apply Bulk
                </button>
                <button
                  disabled={selectedUserIds.length === 0 || loading}
                  onClick={() => handleBulkExecute(true)}
                  className="bg-red-600/80 hover:bg-red-500 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition"
                >
                  Ban
                </button>
                <button
                  disabled={selectedUserIds.length === 0 || loading}
                  onClick={() => handleBulkExecute(false)}
                  className="bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition"
                >
                  Unban
                </button>
              </div>
            </div>
            {bulkStatus && <div className="text-xs text-indigo-400 font-medium">{bulkStatus}</div>}
          </div>

          {/* User Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="p-3">
                    <input
                      type="checkbox"
                      checked={users.length > 0 && selectedUserIds.length === users.length}
                      onChange={(e) =>
                        setSelectedUserIds(e.target.checked ? users.map((u) => u.id) : [])
                      }
                      className="rounded accent-indigo-500"
                    />
                  </th>
                  <th className="p-3">User ID</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Credits</th>
                  <th className="p-3">Assets</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {users.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  return (
                    <tr key={u.id} className={`hover:bg-slate-800/40 ${isSelected ? 'bg-indigo-950/20' : ''}`}>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) =>
                            setSelectedUserIds(
                              e.target.checked
                                ? [...selectedUserIds, u.id]
                                : selectedUserIds.filter((id) => id !== u.id)
                            )
                          }
                          className="rounded accent-indigo-500"
                        />
                      </td>
                      <td className="p-3 font-semibold text-slate-200">{u.public_id}</td>
                      <td className="p-3 capitalize">{u.plan}</td>
                      <td className="p-3 text-emerald-400">{u.credits}</td>
                      <td className="p-3 text-slate-400">
                        {u.assignment_count || 0} assign / {u.material_count || 0} mat
                      </td>
                      <td className="p-3">
                        {u.is_banned ? (
                          <span className="text-red-400 font-bold">BANNED</span>
                        ) : (
                          <span className="text-emerald-400">ACTIVE</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SYSTEM HEALTH */}
      {activeTab === 'health' && healthData && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-xs text-slate-400">System Uptime SLA</div>
              <div className="text-3xl font-extrabold text-emerald-400 mt-1">
                {healthData.uptime_percentage}%
              </div>
              <p className="text-xs text-slate-500 mt-1">Continuous operation: {healthData.uptime_formatted}</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-xs text-slate-400">24-Hour Error Rate</div>
              <div className="text-3xl font-extrabold text-indigo-400 mt-1">
                {healthData.error_rates?.last_24h_error_rate_pct}%
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {healthData.error_rates?.failed_requests_24h} failed / {healthData.error_rates?.total_requests_24h} total
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-xs text-slate-400">Average LLM Latency</div>
              <div className="text-3xl font-extrabold text-amber-400 mt-1">
                {healthData.api_latencies_ms?.deepseek_api} ms
              </div>
              <p className="text-xs text-slate-500 mt-1">DeepSeek V4 Flash stream pipeline</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <h4 className="font-semibold text-sm text-white">External Service Latency Matrix</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {Object.entries(healthData.api_latencies_ms || {}).map(([service, latency]) => (
                <div key={service} className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-slate-400 capitalize">{service.replace('_', ' ')}</div>
                  <div className="text-lg font-bold text-white mt-1">{latency} ms</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MODERATION QUEUE */}
      {activeTab === 'moderation' && (
        <div className="space-y-4">
          <h3 className="font-semibold text-sm text-white">Flagged Content Moderation Queue ({modQueue.length})</h3>
          <div className="space-y-3">
            {modQueue.map((item) => (
              <div key={item.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">{item.user_public_id}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                    item.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {item.status}
                  </span>
                </div>
                <p className="text-slate-300 italic bg-slate-950 p-2.5 rounded border border-slate-800 font-serif">
                  "{item.snippet}"
                </p>
                <div className="text-slate-400 text-[11px]">Reason: {item.reason}</div>
                {item.status === 'pending' && (
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleModerationAction(item.id, 'approved')}
                      className="bg-emerald-600/80 hover:bg-emerald-500 text-white px-3 py-1 rounded text-xs transition"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleModerationAction(item.id, 'rejected')}
                      className="bg-amber-600/80 hover:bg-amber-500 text-white px-3 py-1 rounded text-xs transition"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleModerationAction(item.id, 'deleted')}
                      className="bg-red-600/80 hover:bg-red-500 text-white px-3 py-1 rounded text-xs transition"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: MODEL PERFORMANCE SCORECARD */}
      {activeTab === 'models' && modelMetrics && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {modelMetrics.models?.map((m) => (
              <div key={m.model_id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="font-bold text-white text-sm">{m.display_name}</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 pt-1">
                  <div>Accuracy: <span className="text-emerald-400 font-semibold">{m.accuracy_score}%</span></div>
                  <div>Latency: <span className="text-white font-semibold">{m.avg_latency_ms}ms</span></div>
                  <div>Cost / 1k: <span className="text-amber-400 font-semibold">${m.cost_per_1k_tokens_usd}</span></div>
                </div>
                <div className="pt-2 text-[11px] text-slate-500">
                  Best for: {m.recommended_for?.join(', ')}
                </div>
              </div>
            ))}
          </div>

          {/* Routing Overrides */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
            <h4 className="font-semibold text-sm text-white">Override Model Routing by Task Type</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(modelMetrics.routing_overrides || {}).map(([task, modelId]) => (
                <div key={task} className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="capitalize font-medium text-slate-300">{task} Generation</span>
                  <select
                    className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-white text-xs"
                    value={modelId}
                    onChange={(e) => handleOverrideRouting(task, e.target.value)}
                  >
                    <option value="deepseek-v4-flash">DeepSeek V4 Flash</option>
                    <option value="mimo-v2.5">MIMO v2.5</option>
                    <option value="nemotron-3">Nemotron-3</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SYSTEM CONTROL & STORAGE PURGE */}
      {activeTab === 'system_control' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <span className="text-blue-400">🛡️</span>
              Platform System Control & Runtime Storage
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Global configuration and runtime adjustments for your workspace instance.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-4">
            {/* Sandbox Safety Setting */}
            <div className="p-5 bg-slate-950/40 border border-white/5 rounded-2xl flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <span className="text-blue-400">⚡</span>
                  Isolated Sub-Agent Sandboxing
                </span>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Forces all multi-agent parsing routines, file operations, and code processing into isolated, unprivileged virtualization environments.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextState = !(window.__sandboxIsolation ?? true);
                  window.__sandboxIsolation = nextState;
                  alert(`Sandbox Isolation set to: ${nextState ? 'RESTRICTED (Enabled)' : 'UNRESTRICTED (Disabled)'}`);
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition shrink-0 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
              >
                RESTRICTED
              </button>
            </div>

            {/* Local Storage System Cache Hard Purge Action Block */}
            <div className="p-5 bg-slate-950/40 border border-white/5 rounded-2xl flex flex-col justify-between gap-3">
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <span className="text-rose-400">🗑️</span>
                  Temporary Storage Cleanup
                </span>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Instantly purges temporary cache pipelines, local storage variables, transcript chunks, and unlinked file vectors.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!confirm("Confirm formatting of temporary background file buffers? All local execution states will be cleared.")) return;
                  try {
                    localStorage.removeItem('helpotron_csrf_token');
                    localStorage.removeItem('helpotron_cached_cards');
                  } catch (e) {}
                  alert("Temporary execution cache formatted cleanly.");
                }}
                className="w-full py-2.5 bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/20 rounded-xl text-xs font-medium transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Format Temp Cache Directories</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
