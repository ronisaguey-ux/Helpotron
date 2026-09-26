import React, { useEffect, useRef, useState } from 'react';
import api from '../api';
import {
  ShieldAlert,
  Users,
  CircleDollarSign,
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
  MoreVertical,
  Gauge,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function AdminAdvancedDashboard({ userId = '' }) {
  const [activeTab, setActiveTab] = useState('bulk_users');
  const [rowMoreFor, setRowMoreFor] = useState(null); // expanded per-row management panel (u.id)
  const [loading, setLoading] = useState(false);

  // Bulk Users State
  const [users, setUsers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  /* Alphabetical user groups (operator 08-28-9:42pm): collapsible per-letter
   * sections; '#' holds every non-letter first character. */
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const toggleGroup = (key) => setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  const [bulkPlan, setBulkPlan] = useState('');
  const [bulkCredits, setBulkCredits] = useState('');
  const [bulkTag, setBulkTag] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [tempbanHoursMap, setTempbanHoursMap] = useState({});
  /* Admin → user notice drafts (operator 08-28): per-row "message" input;
   * the notice pops up on the user's screen via client polling. */
  const [noticeTextMap, setNoticeTextMap] = useState({});
  const [noticeSendingFor, setNoticeSendingFor] = useState(null);

  // Change-password dialog (operator 08-28): admin sets a new password for a
  // user WITHOUT their current password; an optional recovery code ties the
  // change to a request in flight (consumed on success).
  const [pwChangeFor, setPwChangeFor] = useState(null); // public_id | null
  const [pwChangeNew, setPwChangeNew] = useState('');
  const [pwChangeCode, setPwChangeCode] = useState('');
  const [pwChangeBusy, setPwChangeBusy] = useState(false);

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
  const [inboxStatus, setInboxStatus] = useState('');

  // Cost & Usage State
  const [costsSummary, setCostsSummary] = useState(null);
  const [usersCosts, setUsersCosts] = useState([]);
  const [multiplierMap, setMultiplierMap] = useState({});
  const [costMsg, setCostMsg] = useState('');
  const [creditAmountMap, setCreditAmountMap] = useState({});
  const [tokenAmountMap, setTokenAmountMap] = useState({});
  const [busyAction, setBusyAction] = useState(null);

  const runBusy = async (key, fn) => {
    setBusyAction(key);
    try {
      await fn();
    } finally {
      setBusyAction(null);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.adminUsers();
      if (Array.isArray(res)) {
        setUsers(res);
      } else if (res && Array.isArray(res.users)) {
        setUsers(res.users);
      } else {
        setUsers([]);
      }
    } catch (e) {
      console.warn('Failed to fetch users:', e);
      setUsers([]);
    }
  };

  const fetchHealth = async () => {
    try {
      const res = await api.request('/api/admin/system-health', { method: 'GET' });
      if (res) setHealthData(res);
    } catch (e) {
      console.warn('Failed to fetch health:', e);
    }
  };

  const fetchModeration = async () => {
    try {
      const res = await api.request('/api/admin/moderation', { method: 'GET' });
      if (res && Array.isArray(res.queue)) {
        setModQueue(res.queue);
      } else {
        setModQueue([]);
      }
    } catch (e) {
      console.warn('Failed to fetch moderation:', e);
      setModQueue([]);
    }
  };

  const fetchModelMetrics = async () => {
    try {
      const res = await api.request('/api/admin/model-metrics', { method: 'GET' });
      if (res) setModelMetrics(res);
    } catch (e) {
      console.warn('Failed to fetch model metrics:', e);
    }
  };

  const fetchAdminMessages = async () => {
    try {
      const res = await api.getAllAdminMessages();
      if (res && Array.isArray(res.messages)) {
        setAdminMessages(res.messages);
      } else {
        setAdminMessages([]);
      }
    } catch (e) {
      console.warn('Failed to fetch admin messages:', e);
      setAdminMessages([]);
    }
  };

  const fetchCosts = async () => {
    try {
      const summary = await api.adminCostsSummary();
      if (summary) setCostsSummary(summary);
      const usersData = await api.adminUsersCosts();
      if (usersData && Array.isArray(usersData.users)) {
        setUsersCosts(usersData.users);
        const map = {};
        usersData.users.forEach((u) => {
          map[u.public_id] = u.token_cost_multiplier;
        });
        setMultiplierMap(map);
      }
    } catch (e) {
      console.warn('Failed fetching costs:', e);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchHealth();
    fetchModeration();
    fetchModelMetrics();
    fetchAdminMessages();
    fetchCosts();
  }, [userId]);

  const handleUpdateMultiplier = async (publicId, mult) => {
    try {
      const res = await api.adminSetUserMultiplier(publicId, Number(mult));
      if (res && res.status === 'success') {
        setCostMsg(`✅ Multiplier updated for ${publicId} to ${mult}x`);
        fetchCosts();
        setTimeout(() => setCostMsg(''), 4000);
      }
    } catch (e) {
      setCostMsg('❌ Failed updating multiplier');
    }
  };

  const handleBulkExecute = async (banStatus = null) => {
    if (!selectedUserIds || selectedUserIds.length === 0) return;
    setLoading(true);
    try {
      const payload = {
        user_ids: selectedUserIds,
        plan: bulkPlan || null,
        delta_credits: bulkCredits ? Number(bulkCredits) : null,
        ban_status: banStatus,
        tags_to_add: bulkTag ? [bulkTag] : null,
      };
      const res = await api.request('/api/admin/bulk-operations', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res) {
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

  /* Per-row user management (operator 08-27): Kick / Temp Ban / Ban-Unban /
   * Delete / Act-as. Status feedback reuses the bulkStatus banner. */
  const statusTimer = useRef(null);
  const flash = (text) => {
    setBulkStatus(text);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setBulkStatus(''), 5000);
  };

  // Inbox-local status line (delete/clear live in the Inquiries tab, not bulk).
  const inboxStatusTimer = useRef(null);
  const flashInbox = (text) => {
    setInboxStatus(text);
    if (inboxStatusTimer.current) clearTimeout(inboxStatusTimer.current);
    inboxStatusTimer.current = setTimeout(() => setInboxStatus(''), 5000);
  };

  const handleRowKick = async (u) => {
    try {
      await api.adminKickUser(u.public_id);
      flash(`✅ Kicked ${u.public_id} — active sessions terminated`);
    } catch (e) {
      flash(`❌ Kick failed: ${e.message || 'unknown error'}`);
    }
  };

  const handleRowTempBan = async (u) => {
    const hours = Number(tempbanHoursMap[u.public_id] ?? 24);
    if (!Number.isFinite(hours) || hours <= 0) {
      flash('❌ Temp-ban needs a number of hours > 0');
      return;
    }
    try {
      await api.adminTempBanUser(u.public_id, hours);
      flash(`✅ Temp-banned ${u.public_id} for ${hours}h`);
      fetchUsers();
    } catch (e) {
      flash(`❌ Temp-ban failed: ${e.message || 'unknown error'}`);
    }
  };

  const handleRowBanToggle = async (u) => {
    try {
      if (u.banned) {
        await api.adminUnbanUser(u.public_id);
        flash(`✅ Unbanned ${u.public_id} — login & sessions allowed again`);
      } else {
        await api.adminBanUser(u.public_id);
        flash(`✅ Banned ${u.public_id} — login & sessions blocked`);
      }
      fetchUsers();
    } catch (e) {
      flash(`❌ Ban change failed: ${e.message || 'unknown error'}`);
    }
  };

  const handleRowDelete = async (u) => {
    if (!window.confirm(`Permanently delete user ${u.public_id}? This destroys the account, all assignments, materials and credits. This cannot be undone.`)) return;
    try {
      await api.adminDeleteUser(u.public_id);
      flash(`🗑 Deleted user ${u.public_id}`);
      setSelectedUserIds((prev) => prev.filter((id) => id !== u.id));
      fetchUsers();
    } catch (e) {
      flash(`❌ Delete failed: ${e.message || 'unknown error'}`);
    }
  };

  const handleRowActAs = async (u) => {
    try {
      await api.adminActAsUser(u.public_id);
      // Server swapped the session cookie to the target user — reload the app
      // so the UI renders that user's full account (operator 08-27).
      window.location.reload();
    } catch (e) {
      flash(`❌ Act-as failed: ${e.message || 'unknown error'}`);
    }
  };

  const handleRowMessage = async (u) => {
    const text = (noticeTextMap[u.id] ?? '').trim();
    if (!text) {
      flash('✉️ Type a message first');
      return;
    }
    setNoticeSendingFor(u.id);
    try {
      await api.adminNotifyUser(u.public_id, text);
      flash(`✉️ Notice sent to ${u.public_id} — pops up on their screen`);
      setNoticeTextMap((prev) => ({ ...prev, [u.id]: '' }));
    } catch (e) {
      flash(`❌ Send failed: ${e.message || 'unknown error'}`);
    } finally {
      setNoticeSendingFor(null);
    }
  };

  const openPwDialog = (publicId) => {
    setPwChangeFor(publicId);
    setPwChangeNew('');
    setPwChangeCode('');
  };

  const handleRowChangePw = async () => {
    if (!pwChangeFor) return;
    if (pwChangeNew.length < 8) {
      flash('❌ New password must be at least 8 characters.');
      return;
    }
    setPwChangeBusy(true);
    try {
      const res = await api.adminChangePassword(pwChangeFor, pwChangeNew, pwChangeCode.trim() || null);
      flash(`✅ ${res.message || `Password changed for ${pwChangeFor} — sessions revoked`}`);
      setPwChangeFor(null);
      setPwChangeNew('');
      setPwChangeCode('');
    } catch (e) {
      flash(`❌ Password change failed: ${e.message || 'unknown error'}`);
    } finally {
      setPwChangeBusy(false);
    }
  };

  const handleModerationAction = async (modId, action) => {
    try {
      await api.request(`/api/admin/moderation/${modId}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, admin_notes: 'Reviewed by admin' }),
      });
      fetchModeration();
    } catch (e) {
      console.error(e);
    }
  };

  const handleOverrideRouting = async (taskType, modelId) => {
    try {
      await api.request('/api/admin/model-metrics/override', {
        method: 'POST',
        body: JSON.stringify({ task_type: taskType, model_id: modelId }),
      });
      fetchModelMetrics();
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

  const handleDeleteMessage = async (msg) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await api.deleteAdminMessage(msg.id);
      flashInbox(`🗑 Deleted message #${msg.id} — "${msg.subject || 'no subject'}"`);
      fetchAdminMessages();
    } catch (e) {
      flashInbox(`❌ Delete failed: ${e.message || 'unknown error'}`);
    }
  };

  const handleClearInbox = async () => {
    if (!window.confirm('Delete ALL admin messages? This cannot be undone.')) return;
    try {
      const res = await api.clearAdminMessages();
      setAdminMessages([]);
      flashInbox(`🗑 Cleared inbox — ${res.deleted ?? 0} message(s) removed`);
    } catch (e) {
      flashInbox(`❌ Clear failed: ${e.message || 'unknown error'}`);
    }
  };

  const safeUsers = Array.isArray(users) ? users : [];
  /* The operator is not a user (operator 08-28): hide the signed-in dev
   * account (public_id === userId prop) from the operations list entirely —
   * no select-all, no searching over it, no accidental bulk ops on self. */
  const listUsers = safeUsers.filter((u) => u.public_id !== userId);
  /* Fuzzy user search (operator 08-26): matches substrings AND typo-ish tail
   * differences via a 6-char prefix compare, so "dreybejerking" finds
   * "dreybejerkin22". */
  const fuzzyUserMatch = (a, b) => {
    const x = String(a).toLowerCase().trim();
    const y = String(b).toLowerCase().trim();
    return x.includes(y) || y.includes(x) || (x.slice(0, 6) === y.slice(0, 6));
  };
  const visibleUsers = listUsers.filter((u) => !userSearch.trim() || fuzzyUserMatch(u.public_id, userSearch.trim()));
  /* Alphabetical groups: one per starting letter (A–Z), '#' for anything that
   * is not a letter. Letters sort first, special characters grouped last. */
  const groupKeyOf = (id) => {
    const ch = String(id || '?').trim().charAt(0).toUpperCase();
    return /^[A-Z]$/.test(ch) ? ch : '#';
  };
  const userGroups = (() => {
    const map = new Map();
    for (const u of visibleUsers) {
      const key = groupKeyOf(u.public_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(u);
    }
    return [...map.entries()]
      .map(([key, users2]) => ({ key, users: users2 }))
      .sort((a, b) => {
        if (a.key === '#') return 1;
        if (b.key === '#') return -1;
        return a.key.localeCompare(b.key);
      });
  })();
  /* While searching, force every group open so matches are visible. */
  const isSearching = !!userSearch.trim();
  const safeAdminMessages = Array.isArray(adminMessages) ? adminMessages : [];
  const safeModQueue = Array.isArray(modQueue) ? modQueue : [];
  const safeScorecards = Array.isArray(modelMetrics?.scorecard) ? modelMetrics.scorecard : [];

  return (
    <div className="space-y-6 text-[var(--text-primary)] max-w-6xl mx-auto">
      {/* Section switch + admin identity.
          08-30 overhaul: this used to be an entire empty SectionCard whose only
          content was the heading "Helpotron Master Admin Panel" — the third
          near-identical title on one screen (page header → section card →
          panel), directly above a second full-width card holding seven tabs.
          Both cards are gone. The page header already says "Control Center",
          so this is one control row: a recessed segmented track with a single
          raised thumb, plus the admin identity chip. Emoji were standing in for
          icons; real icons carry the meaning and counts became chips. */}
      <div className="flex items-center gap-3">
        <div className="os-scroll overflow-x-auto min-w-0 flex-1">
          <div className="bg-surface-container-low p-1 rounded-2xl border border-outline-variant/30 flex w-max gap-1" role="tablist" aria-label="Admin sections">
            {[
              ['bulk_users', 'User Operations', Users, listUsers.length],
              ['costs', 'Cost & Usage', CircleDollarSign, null],
              ['inbox', 'Inquiries Inbox', MessageSquare, safeAdminMessages.length],
              ['models', 'Model Scorecards', Zap, null],
              ['moderation', 'Moderation', AlertCircle, safeModQueue.length],
              ['health', 'System Health', Activity, null],
              ['system_control', 'Storage Control', ShieldCheck, null],
            ].map(([key, label, Icon, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                role="tab"
                aria-selected={activeTab === key}
                className={`px-4 py-2 rounded-xl font-label-caps text-xs uppercase tracking-wider flex items-center gap-2 transition ${
                  activeTab === key
                    ? 'bg-surface-container-lowest text-primary shadow-sm font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                {label}
                {count != null && <span className="font-tabular-stat text-xs bg-surface-container-high px-2 py-0.5 rounded-full">{count}</span>}
              </button>
            ))}
          </div>
        </div>
        <span className="font-label-caps text-xs uppercase px-3.5 py-1.5 rounded-full bg-primary/15 text-primary font-semibold shrink-0 hidden lg:inline-flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
          ADMIN: {userId || 'anonymous'}
        </span>
      </div>

      {/* TAB 1: BULK USERS */}
      {activeTab === 'bulk_users' && (
        <div className="space-y-4">
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-title-md text-title-md text-on-surface">Bulk user operations</span>
              <span className={`font-label-caps text-xs uppercase px-3 py-1 rounded-full font-semibold ${selectedUserIds.length ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                {selectedUserIds.length} selected
              </span>
            </div>
            <div className="space-y-4">
            {selectedUserIds.length === 0 ? (
              /* 08-30 de-clunk: with nothing selected this box used to render
                 the whole control grid plus a huge disabled "Apply to 0"
                 button — an empty-operations wall. One honest hint instead. */
              <div className="empty-state empty-state--compact">
                <span className="empty-state__icon"><Users className="w-4 h-4" aria-hidden="true" /></span>
                <p>Select users in the table below to change their plan, adjust credits, or tag them together.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label htmlFor="admin-bulk-plan" className="text-[var(--text-secondary)] block mb-1">Set Plan</label>
                <select
                  id="admin-bulk-plan"
                  className="clean-input w-full px-3 py-2 text-white outline-none"
                  value={bulkPlan}
                  onChange={(e) => setBulkPlan(e.target.value)}
                >
                  <option value="">— No Plan Change —</option>
                  <option value="trial">Trial (15,000 Tokens)</option>
                  <option value="basic">Basic (30,000 Tokens)</option>
                  <option value="pro">Pro (100,000 Tokens)</option>
                  <option value="elite">Elite (270,000 Tokens)</option>
                </select>
              </div>

              <div>
                <label htmlFor="admin-bulk-credits" className="text-[var(--text-secondary)] block mb-1">Adjust Credits (+ / -)</label>
                <input
                  id="admin-bulk-credits"
                  type="number"
                  placeholder="e.g. 50 or -20"
                  className="clean-input w-full px-3 py-2 text-white outline-none"
                  value={bulkCredits}
                  onChange={(e) => setBulkCredits(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="admin-bulk-tag" className="text-[var(--text-secondary)] block mb-1">Assign Tag</label>
                <input
                  id="admin-bulk-tag"
                  type="text"
                  placeholder="e.g. vip, tester"
                  className="clean-input w-full px-3 py-2 text-white outline-none"
                  value={bulkTag}
                  onChange={(e) => setBulkTag(e.target.value)}
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => handleBulkExecute(null)}
                  disabled={loading || selectedUserIds.length === 0}
                  className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-30 text-white rounded-[var(--radius-sm)] py-2 font-semibold transition cursor-pointer shadow-[0_0_0_1px_rgba(139,92,246,0.35),0_4px_18px_rgba(139,92,246,0.30)]"
                >
                  Apply to {selectedUserIds.length}
                </button>
              </div>
            </div>

                    {bulkStatus && (
                      <div className="p-3 bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.28)] rounded-[var(--radius-md)] text-xs text-[var(--accent)] font-mono">
                        {bulkStatus}
                      </div>
                    )}
              </>
            )}
          </div>
          </div>

          {/* User Table */}
          <div className="clean-card p-5">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder={`Search user ID… (fuzzy: 'dreybejerking' finds 'dreybejerkin22')${isSearching ? '' : ' — uses alphabetical groups below'}`}
                aria-label="Search user ID"
                className="clean-input flex-1 min-w-[220px] px-3 py-2 text-white text-xs font-mono outline-none"
              />
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCollapsedGroups({})}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[11px] font-medium border border-[var(--border-subtle)] transition cursor-pointer"
                  title="Expand every letter group"
                >
                  <ChevronDown className="w-3 h-3" /> Expand all
                </button>
                <button
                  type="button"
                  onClick={() => setCollapsedGroups(Object.fromEntries(userGroups.map((g) => [g.key, true])))}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[11px] font-medium border border-[var(--border-subtle)] transition cursor-pointer"
                  title="Collapse every letter group"
                >
                  <ChevronUp className="w-3 h-3" /> Collapse all
                </button>
              </div>
            </div>
            <div className="os-scroll overflow-x-auto -mx-5 px-5">
            <table className="data-table w-full min-w-[720px]">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all users for bulk operation"
                      onChange={(e) => {
                        if (e.target.checked) setSelectedUserIds(listUsers.map((u) => u.id));
                        else setSelectedUserIds([]);
                      }}
                      checked={selectedUserIds.length === listUsers.length && listUsers.length > 0}
                    />
                  </th>
                  <th>User ID</th>
                  <th>Plan</th>
                  <th>Credits</th>
                  <th>Token Multiplier</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
                {listUsers.length === 0 ? (
                  <tbody className="font-mono">
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-[var(--text-muted)] text-xs">
                        {safeUsers.length <= 1
                          ? 'No other users registered yet — your account is hidden from this list.'
                          : 'No users registered yet.'}
                      </td>
                    </tr>
                  </tbody>
                ) : visibleUsers.length === 0 ? (
                  <tbody className="font-mono">
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-[var(--text-muted)] text-xs">
                        No users match “{userSearch}”.
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  userGroups.map(({ key, users: groupUsers }) => {
                    const isCollapsed = isSearching ? false : !!collapsedGroups[key];
                    return (
                      <tbody key={key} className={`font-mono ${isCollapsed ? 'border-b border-[var(--border-subtle)]' : ''}`}>
                        {/* Group header — click to collapse/expand this letter */}
                        <tr className="bg-[var(--bg-surface-elevated)] border-y border-[var(--border-subtle)]">
                          <td colSpan={6} className="py-0">
                            <button
                              type="button"
                              onClick={() => toggleGroup(key)}
                              aria-expanded={!isCollapsed}
                              aria-label={`${key} group, ${groupUsers.length} user${groupUsers.length === 1 ? '' : 's'}`}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left transition cursor-pointer hover:bg-white/[0.03]"
                            >
                              {isCollapsed
                                ? <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                : <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                              <span
                                className={`inline-flex items-center justify-center w-6 h-6 rounded-md font-bold text-[11px] ${
                                  key === '#'
                                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                    : 'bg-[var(--accent-subtle)] text-[var(--accent)] border border-[rgba(139,92,246,0.35)]'
                                }`}
                              >
                                {key}
                              </span>
                              <span className="text-[11px] font-bold text-white uppercase tracking-wider">{key === '#' ? 'Symbols & special' : `Letter ${key}`}</span>
                              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                {groupUsers.length} user{groupUsers.length === 1 ? '' : 's'}
                              </span>
                              <span className="flex-1" />
                              <span className="text-[10px] text-[var(--text-muted)]">{isCollapsed ? 'show' : 'hide'}</span>
                            </button>
                          </td>
                        </tr>
                        {!isCollapsed && groupUsers.map((u) => {
                          const currentMult = multiplierMap[u.public_id] !== undefined ? multiplierMap[u.public_id] : (u.token_cost_multiplier || 1.0);

                          return (
                      <tr key={u.id} className="hover:bg-white/[0.03]">
                        <td className="py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select user ${u.public_id} for bulk operation`}
                            checked={selectedUserIds.includes(u.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedUserIds([...selectedUserIds, u.id]);
                              else setSelectedUserIds(selectedUserIds.filter((id) => id !== u.id));
                            }}
                          />
                        </td>
                        <td className="py-3 font-semibold text-white">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{u.public_id}</span>
                            {u.role === 'admin' && (
                              <span className="text-[10px] bg-[var(--accent-subtle)] text-[var(--accent)] border border-[rgba(139,92,246,0.35)] px-1.5 py-0.5 rounded-full font-semibold">ADMIN</span>
                            )}
                            {u.banned && (
                              <span
                                className="text-[10px] bg-rose-500/15 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded-full font-semibold"
                                title={u.banned_until ? `Banned until ${u.banned_until}` : 'Banned'}
                              >
                                BANNED{u.banned_until ? ` · till ${String(u.banned_until).slice(0, 10)}` : ''}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 uppercase text-[11px] font-bold text-[var(--accent)]">{u.plan || 'none'}</td>
                        <td className="py-3 font-mono text-[11px] whitespace-nowrap">
                          <span className="text-emerald-300 font-bold">{Number(u.token_balance ?? 0).toLocaleString()} tk</span>
                          <span className="mx-1.5 text-[var(--text-muted)]">·</span>
                          <span className="text-[var(--accent)] font-bold">{Number(u.credits ?? 0).toLocaleString()} cr</span>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              max="10.0"
                              value={currentMult}
                              onChange={(e) => {
                                const val = e.target.value;
                                setMultiplierMap((prev) => ({ ...prev, [u.public_id]: val }));
                              }}
                              aria-label={`Token cost multiplier for ${u.public_id}`}
                              className="clean-input w-16 px-2 py-1 text-white text-xs font-mono text-center outline-none"
                              title="Token Cost Multiplier (e.g. 0.5x, 1.0x, 1.5x)"
                            />
                            <span className="text-[var(--text-muted)] text-xs">x</span>

                            {/* Quick Presets */}
                            <div className="hidden sm:flex items-center gap-1">
                              {[0.5, 1.0, 1.5, 2.0].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => {
                                    setMultiplierMap((prev) => ({ ...prev, [u.public_id]: preset }));
                                    handleUpdateMultiplier(u.public_id, preset);
                                  }}
                                  className={`px-1.5 py-0.5 rounded-[var(--radius-sm)] text-[10px] transition cursor-pointer ${
                                    Number(currentMult) === preset
                                      ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)] font-bold border border-[rgba(139,92,246,0.35)]'
                                      : 'bg-white/5 hover:bg-[var(--color-surface-raised)] text-[var(--text-muted)] border border-transparent'
                                  }`}
                                >
                                  {preset}x
                                </button>
                              ))}
                            </div>

                            <button
                              type="button"
                              onClick={() => runBusy(`mult:${u.public_id}`, () => handleUpdateMultiplier(u.public_id, currentMult))}
                              disabled={busyAction === `mult:${u.public_id}`}
                              className="px-2.5 py-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[var(--radius-sm)] text-[11px] font-semibold transition cursor-pointer ml-1 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Save
                            </button>
                          </div>
                        </td>
                        <td className="py-3 max-w-[420px]">
                          <div className="flex flex-col items-end gap-1.5">
                            {/* Per-row user management: Kick / Temp Ban / Ban / Unban / Delete / Act as / Change Pw —
                                grouped behind a ⋮ More toggle (IA rule: max 1 primary + 2 secondary per row). */}
                            <button
                              type="button"
                              onClick={() => setRowMoreFor(rowMoreFor === u.id ? null : u.id)}
                              aria-expanded={rowMoreFor === u.id}
                              aria-label="More user actions"
                              title="More user actions"
                              className={`px-2.5 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-semibold border transition cursor-pointer inline-flex items-center gap-1 ${
                                rowMoreFor === u.id
                                  ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)] border-[rgba(139,92,246,0.35)]'
                                  : 'bg-white/4 text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              <MoreVertical className="w-3 h-3" />
                              More
                            </button>
                            {rowMoreFor === u.id && (
                              <div className="flex flex-wrap items-center justify-end gap-1.5 p-2 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] max-w-[380px]">
                                <button
                                  type="button"
                                  onClick={() => runBusy(`kick:${u.public_id}`, () => handleRowKick(u))}
                                  disabled={busyAction === `kick:${u.public_id}`}
                                  title="Terminate all of this user's active sessions"
                                  className="px-2 py-1 rounded-[var(--radius-sm)] bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 text-[10px] font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Kick
                                </button>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={tempbanHoursMap[u.public_id] ?? 24}
                                    onChange={(e) => setTempbanHoursMap((prev) => ({ ...prev, [u.public_id]: e.target.value }))}
                                    className="clean-input w-14 px-1.5 py-1 text-white text-[11px] font-mono text-center outline-none"
                                    title="Temp-ban duration (hours)"
                                    aria-label={`Temp-ban hours for ${u.public_id}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => runBusy(`tempban:${u.public_id}`, () => handleRowTempBan(u))}
                                    disabled={busyAction === `tempban:${u.public_id}`}
                                    title="Temporarily ban — blocks login/sessions until the clock runs out"
                                    className="px-2 py-1 rounded-[var(--radius-sm)] bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 text-[10px] font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Temp Ban
                                  </button>
                                </div>
                                {u.banned ? (
                                  <button
                                    type="button"
                                    onClick={() => runBusy(`ban:${u.public_id}`, () => handleRowBanToggle(u))}
                                    disabled={busyAction === `ban:${u.public_id}`}
                                    title="Lift the ban — login & sessions allowed again"
                                    className="px-2 py-1 rounded-[var(--radius-sm)] bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 text-[10px] font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Unban
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => runBusy(`ban:${u.public_id}`, () => handleRowBanToggle(u))}
                                    disabled={busyAction === `ban:${u.public_id}`}
                                    title="Ban — block login & sessions (until unbanned)"
                                    className="px-2 py-1 rounded-[var(--radius-sm)] bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 text-[10px] font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Ban
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => runBusy(`delete:${u.public_id}`, () => handleRowDelete(u))}
                                  disabled={busyAction === `delete:${u.public_id}`}
                                  title="Permanently delete this user (confirmation required)"
                                  className="px-2 py-1 rounded-[var(--radius-sm)] bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => runBusy(`actas:${u.public_id}`, () => handleRowActAs(u))}
                                  disabled={busyAction === `actas:${u.public_id}`}
                                  title="Impersonate: switch this session to the user's account (reload: the app enters their full account; logout returns to admin)"
                                  className="px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.35)] text-[var(--accent)] hover:bg-[var(--accent-subtle)]/80 text-[10px] font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Act as
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openPwDialog(u.public_id)}
                                  title="Change this user's password without their current password (optional recovery code consumes an open request)"
                                  className="px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.35)] text-[var(--accent)] hover:bg-[var(--accent-subtle)]/80 text-[10px] font-semibold transition cursor-pointer"
                                >
                                  Change Pw
                                </button>
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] w-12 text-right shrink-0">plan</span>
                              <select
                                value={u.plan || 'none'}
                                onChange={async (e) => {
                                  e.stopPropagation();
                                  await api.adminSetPlan(u.public_id, e.target.value);
                                  setBulkStatus(`Plan for ${u.public_id} → ${e.target.value}`);
                                  fetchUsers();
                                }}
                                aria-label={`Set plan for ${u.public_id}`}
                                className="clean-input w-20 px-2 py-1 text-white text-xs font-mono outline-none"
                                title="Upgrade / downgrade plan"
                              >
                                <option value="none">none</option>
                                <option value="basic">basic</option>
                                <option value="pro">pro</option>
                                <option value="elite">elite</option>
                              </select>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] uppercase tracking-wider text-emerald-400/80 w-12 text-right shrink-0">tokens</span>
                              <input
                                type="number"
                                step="1"
                                placeholder="amount"
                                aria-label={`Token amount to grant or remove for ${u.public_id}`}
                                value={tokenAmountMap[u.id] ?? ''}
                                onChange={(e) => setTokenAmountMap((prev) => ({ ...prev, [u.id]: e.target.value }))}
                                className="clean-input w-16 px-2 py-1 text-white text-xs font-mono text-center outline-none"
                                title="Grant usage tokens (negative removes)"
                              />
                              <button
                                type="button"
                                onClick={() => runBusy(`grant:${u.id}`, async () => {
                                  const amt = Number(tokenAmountMap[u.id]);
                                  if (!Number.isInteger(amt) || amt === 0) {
                                    setBulkStatus('Enter a non-zero whole number token amount');
                                    return;
                                  }
                                  try {
                                    const res = await api.adminGrantTokens(u.public_id, amt);
                                    setUsers((prev) => prev.map((x) =>
                                      x.public_id === res.public_id ? { ...x, token_balance: res.token_balance } : x));
                                    setBulkStatus(`✓ Granted ${amt} tokens to ${u.public_id} → now ${res.token_balance} tk.`);
                                    setTokenAmountMap((prev) => ({ ...prev, [u.id]: '' }));
                                  } catch (e) {
                                    setBulkStatus(`✗ Grant failed: ${e.message || 'unknown error'}`);
                                  }
                                  fetchUsers();
                                })}
                                disabled={busyAction === `grant:${u.id}`}
                                className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Grant
                              </button>
                              <button
                                type="button"
                                onClick={() => runBusy(`remtok:${u.id}`, async () => {
                                  const amt = Math.abs(Number(tokenAmountMap[u.id]));
                                  if (!Number.isInteger(amt) || amt === 0) {
                                    setBulkStatus('Enter a whole number amount to remove');
                                    return;
                                  }
                                  try {
                                    const res = await api.adminGrantTokens(u.public_id, -amt);
                                    setUsers((prev) => prev.map((x) =>
                                      x.public_id === res.public_id ? { ...x, token_balance: res.token_balance } : x));
                                    setBulkStatus(`✓ Removed ${amt} tokens from ${u.public_id} → now ${res.token_balance} tk. (${res.token_balance === 0 && amt > 0 ? 'balance floor reached' : ''})`);
                                    setTokenAmountMap((prev) => ({ ...prev, [u.id]: '' }));
                                  } catch (e) {
                                    setBulkStatus(`✗ Removal failed: ${e.message || 'unknown error'}`);
                                  }
                                  fetchUsers();
                                })}
                                disabled={busyAction === `remtok:${u.id}`}
                                className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-rose-600/80 hover:bg-rose-600 text-white text-[11px] font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Remove
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] uppercase tracking-wider text-[var(--accent)]/80 w-12 text-right shrink-0">credits</span>
                              <input
                                type="number"
                                step="1"
                                placeholder="amount"
                                aria-label={`Credit amount to adjust for ${u.public_id}`}
                                value={creditAmountMap[u.id] ?? ''}
                                onChange={(e) => setCreditAmountMap((prev) => ({ ...prev, [u.id]: e.target.value }))}
                                className="clean-input w-16 px-2 py-1 text-white text-xs font-mono text-center outline-none"
                                title="Discount credits (negative deducts)"
                              />
                              <button
                                type="button"
                                onClick={() => runBusy(`addcred:${u.id}`, async () => {
                                  const amt = Number(creditAmountMap[u.id]);
                                  if (!Number.isInteger(amt) || amt === 0) {
                                    setBulkStatus('Enter a non-zero whole number credit amount');
                                    return;
                                  }
                                  try {
                                    await api.adminAdjustCredits(u.public_id, amt, 'Admin Grant');
                                    setBulkStatus(`✓ Added ${amt} discount credits for ${u.public_id}.`);
                                    setCreditAmountMap((prev) => ({ ...prev, [u.id]: '' }));
                                  } catch (e) {
                                    setBulkStatus(`✗ Credit change failed: ${e.message || 'unknown error'}`);
                                  }
                                  fetchUsers();
                                })}
                                disabled={busyAction === `addcred:${u.id}`}
                                className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[11px] font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Apply
                              </button>
                              <button
                                type="button"
                                onClick={() => runBusy(`remcred:${u.id}`, async () => {
                                  const amt = Math.abs(Number(creditAmountMap[u.id]));
                                  if (!Number.isInteger(amt) || amt === 0) {
                                    setBulkStatus('Enter a whole number amount to remove');
                                    return;
                                  }
                                  try {
                                    const res = await api.adminAdjustCredits(u.public_id, -amt, 'Admin Removal');
                                    setBulkStatus(`✓ Removed ${amt} discount credits from ${u.public_id} → now ${res.new_balance} cr.`);
                                    setCreditAmountMap((prev) => ({ ...prev, [u.id]: '' }));
                                  } catch (e) {
                                    setBulkStatus(`✗ Credit removal failed: ${e.message || 'unknown error'}`);
                                  }
                                  fetchUsers();
                                })}
                                disabled={busyAction === `remcred:${u.id}`}
                                className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-rose-600/80 hover:bg-rose-600 text-white text-[11px] font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Remove
                              </button>
                            </div>
                            {/* Admin → user message (operator 08-28): pops on their screen */}
                            <div className="flex items-center gap-1 w-full sm:w-auto">
                              <span className="text-[9px] uppercase tracking-wider text-cyan-400/80 w-12 text-right shrink-0">message</span>
                              <input
                                type="text"
                                placeholder="Direct message… pops up on their screen"
                                aria-label={`Message to ${u.public_id}`}
                                value={noticeTextMap[u.id] ?? ''}
                                onChange={(e) => setNoticeTextMap((prev) => ({ ...prev, [u.id]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleRowMessage(u); }}
                                className="clean-input flex-1 min-w-0 px-2 py-1 text-white text-xs outline-none"
                                title="Sends a notice that pops up on this user's screen"
                              />
                              <button
                                type="button"
                                onClick={() => handleRowMessage(u)}
                                disabled={noticeSendingFor === u.id}
                                className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-[11px] font-semibold transition cursor-pointer"
                              >
                                {noticeSendingFor === u.id ? '…' : 'Send'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                          );
                        })}
                      </tbody>
                    );
                  })
                )}
            </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INQUIRIES INBOX */}
      {activeTab === 'inbox' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="section-label">Incoming user inquiries</span>
            <div className="flex items-center gap-2">
              {safeAdminMessages.length > 0 && (
                <button
                  type="button"
                  onClick={() => runBusy('clear-inbox', handleClearInbox)}
                  disabled={busyAction === 'clear-inbox'}
                  className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs text-rose-300 hover:text-white bg-rose-500/15 hover:bg-rose-600 border border-rose-500/30 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear Inbox
                </button>
              )}
              <button
                type="button"
                onClick={() => runBusy('refresh-inbox', fetchAdminMessages)}
                disabled={busyAction === 'refresh-inbox'}
                className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] bg-white/5 border border-[var(--border-subtle)] flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'refresh-inbox' ? 'animate-spin' : ''}`} /> Refresh Inbox
              </button>
            </div>
          </div>

          {inboxStatus && (
            <div className="p-3 bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.28)] rounded-[var(--radius-md)] text-xs text-[var(--accent)] font-mono">
              {inboxStatus}
            </div>
          )}

          {safeAdminMessages.length === 0 ? (
            <div className="panel">
              <div className="empty-state">
                <span className="empty-state__icon"><MessageSquare className="w-4 h-4" aria-hidden="true" /></span>
                <p>No incoming messages yet. Student inquiries addressed to Admin will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {safeAdminMessages.map((msg) => (
                <div key={msg.id} className="panel space-y-3">
                  <div className="panel-head flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="chip chip-accent uppercase text-[10px] font-mono">
                        {msg.category}
                      </span>
                      <strong className="text-white text-sm font-semibold">{msg.subject}</strong>
                      <span className="text-[var(--text-muted)] text-xs font-mono">from: {msg.user_id}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`chip ${msg.status === 'replied' ? 'chip-emerald' : 'chip-amber'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${msg.status === 'replied' ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-hidden="true" />
                        {msg.status === 'replied' ? 'Replied' : 'Pending Reply'}
                      </span>
                      <button
                        type="button"
                        onClick={() => runBusy(`delmsg:${msg.id}`, () => handleDeleteMessage(msg))}
                        disabled={busyAction === `delmsg:${msg.id}`}
                        title="Delete this message"
                        aria-label={`Delete message ${msg.id}`}
                        className="p-1.5 rounded-[var(--radius-sm)] text-rose-300 hover:text-white bg-rose-500/15 hover:bg-rose-600 border border-rose-500/30 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="panel-body space-y-3 text-xs">
                    <div className="group p-3.5 text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap font-sans">
                      {msg.message}
                    </div>

                    {msg.admin_reply && (
                      <div className="group-strong p-3.5 text-[var(--text-primary)]">
                        <strong className="text-[var(--accent)] font-semibold">Admin Reply:</strong> {msg.admin_reply}
                      </div>
                    )}

                    {/* Reply Box */}
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Type admin response to student..."
                        aria-label="Type admin response to student"
                        value={replyTextMap[msg.id] || ''}
                        onChange={(e) => setReplyTextMap({ ...replyTextMap, [msg.id]: e.target.value })}
                        className="clean-input flex-1 px-3 py-2 text-white text-xs outline-none placeholder:text-[var(--text-muted)]"
                      />
                      <button
                        type="button"
                        onClick={() => runBusy(`reply:${msg.id}`, () => handleSendAdminReply(msg.id))}
                        disabled={busyAction === `reply:${msg.id}`}
                        className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[var(--radius-sm)] font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Reply</span>
                      </button>
                    </div>

                    {replyStatusMap[msg.id] && (
                      <div className="text-[11px] font-mono text-[var(--accent)]">{replyStatusMap[msg.id]}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MODEL METRICS */}
      {activeTab === 'models' && (
        <div className="space-y-4">
          <span className="section-label">Model performance scorecards</span>
          {safeScorecards.length === 0 ? (
            <div className="panel">
              <div className="empty-state">
                <span className="empty-state__icon"><Gauge className="w-4 h-4" aria-hidden="true" /></span>
                <p>No model scorecards yet. Live per-model stats from API usage logs will appear here as calls are made.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {safeScorecards.map((m) => (
                <div key={m.model_id} className="panel p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-white text-sm">{m.display_name || m.model_id}</div>
                      <div className="text-[10px] font-mono text-[var(--text-muted)]">{m.model_id}</div>
                    </div>
                    <span className="chip chip-neutral font-mono text-[10px]">{Number(m.calls ?? 0).toLocaleString()} calls</span>
                  </div>
                  <div className="group p-3 space-y-1.5 font-mono text-[11px] text-[var(--text-secondary)]">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Total tokens:</span>
                      <span className="text-white font-semibold">{Number(m.total_tokens ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                      <span>In / Out:</span>
                      <span>{Number(m.input_tokens ?? 0).toLocaleString()} / {Number(m.output_tokens ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Cost / 1k:</span>
                      <span className="text-amber-300 font-semibold">${Number(m.cost_per_1k_tokens_usd ?? 0).toFixed(6)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Charged:</span>
                      <span className="text-rose-400 font-semibold">${Number(m.charged_cost_usd ?? 0).toFixed(6)}</span>
                    </div>
                    {m.last_used && (
                      <div className="flex justify-between text-[10px] pt-1 border-t border-[var(--border-subtle)]">
                        <span className="text-[var(--text-muted)]">Last used:</span>
                        <span className="text-[var(--text-secondary)]">{String(m.last_used).slice(0, 10)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: MODERATION */}
      {activeTab === 'moderation' && (
        <div className="panel space-y-4">
          <div className="panel-head flex items-center justify-between">
            <span className="panel-head__title">Content moderation queue</span>
            <span className={`chip ${safeModQueue.length ? 'chip-amber' : 'chip-emerald'}`}>
              {safeModQueue.length} flagged
            </span>
          </div>
          <div className="panel-body">
            {safeModQueue.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state__icon"><ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" /></span>
                <p>The moderation queue is clear — flagged items will appear here for review.</p>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {safeModQueue.map((item) => (
                  <div key={item.id} className="group p-3 flex items-center justify-between gap-3">
                    <span className="text-[var(--text-primary)] font-medium truncate">{item.type}: {item.title || item.id}</span>
                    <div className="flex gap-2 shrink-0">
                      <button type="button" onClick={() => runBusy(`mod:${item.id}`, () => handleModerationAction(item.id, 'approved'))} disabled={busyAction === `mod:${item.id}`} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-[var(--radius-sm)] text-xs font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">Approve</button>
                      <button type="button" onClick={() => runBusy(`mod:${item.id}`, () => handleModerationAction(item.id, 'rejected'))} disabled={busyAction === `mod:${item.id}`} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-[var(--radius-sm)] text-xs font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: COST & USAGE MONITORING */}
      {activeTab === 'costs' && (
        <div className="space-y-6 animate-fadeIn">
          {costMsg && (
            <div className="p-3 bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.28)] rounded-[var(--radius-md)] text-xs text-[var(--accent)] font-mono">
              {costMsg}
            </div>
          )}

          {/* Top Platform Metrics */}
          {costsSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="group p-4 space-y-1">
                <span className="text-[var(--text-muted)] block text-[10px] uppercase tracking-wider font-semibold">Total API Cost</span>
                <strong className="text-rose-400 text-lg">${costsSummary.total_cost_usd || '0.00'}</strong>
                <span className="text-[10px] text-[var(--text-muted)] block">Provider Expense</span>
              </div>
              <div className="group p-4 space-y-1">
                <span className="text-[var(--text-muted)] block text-[10px] uppercase tracking-wider font-semibold">Total Charged</span>
                <strong className="text-[var(--accent)] text-lg">${costsSummary.total_charged_usd || '0.00'}</strong>
                <span className="text-[10px] text-[var(--text-muted)] block">Token Equivalent</span>
              </div>
              <div className="group p-4 space-y-1">
                <span className="text-[var(--text-muted)] block text-[10px] uppercase tracking-wider font-semibold">Platform Profit</span>
                <strong className="text-emerald-400 text-lg">${costsSummary.platform_profit_summary?.estimated_profit_usd || '0.00'}</strong>
                <span className="text-[10px] text-emerald-400/80 block">{costsSummary.platform_profit_summary?.profit_margin_pct}% Margin</span>
              </div>
              <div className="group p-4 space-y-1">
                <span className="text-[var(--text-muted)] block text-[10px] uppercase tracking-wider font-semibold">Total API Calls</span>
                <strong className="text-[var(--text-primary)] text-lg">{costsSummary.total_logs || 0}</strong>
                <span className="text-[10px] text-[var(--text-muted)] block">LLM / Vision / Audio</span>
              </div>
            </div>
          )}

          {/* Per-User Token Cost Multiplier Adjustment */}
          <div className="panel space-y-4">
            <div className="panel-head flex items-center justify-between">
              <div>
                <span className="panel-head__title">Per-user token multiplier &amp; pricing control</span>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Adjust individual multipliers (0.5x beta, 1.0x standard, 1.5x premium, 2.0x heavy compute).
                </p>
              </div>
              <span className="chip chip-neutral font-mono">{usersCosts.length} Users</span>
            </div>

            <div className="panel-body overflow-x-auto">
              <table className="w-full min-w-[580px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-[11px] font-mono uppercase tracking-wider">
                    <th className="pb-3">User</th>
                    <th className="pb-3">Plan</th>
                    <th className="pb-3">Calls</th>
                    <th className="pb-3">API Cost</th>
                    <th className="pb-3">Profit Margin</th>
                    <th className="pb-3">Token Multiplier</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {usersCosts.map((u) => {
                    const currentVal = multiplierMap[u.public_id] !== undefined ? multiplierMap[u.public_id] : u.token_cost_multiplier;

                    return (
                      <tr key={u.id} className="hover:bg-white/[0.03]">
                        <td className="py-3 font-semibold text-white">{u.public_id}</td>
                        <td className="py-3 uppercase text-[10px] font-bold text-[var(--accent)]">{u.plan}</td>
                        <td className="py-3 text-[var(--text-muted)]">{u.total_calls}</td>
                        <td className="py-3 text-rose-400">${u.total_cost_usd}</td>
                        <td className="py-3 text-emerald-400 font-bold">
                          {u.profit_margin_pct}% (${u.estimated_profit_usd})
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              max="10.0"
                              value={currentVal}
                              onChange={(e) => {
                                const val = e.target.value;
                                setMultiplierMap((prev) => ({ ...prev, [u.public_id]: val }));
                              }}
                              aria-label={`Token cost multiplier for ${u.public_id}`}
                              className="clean-input w-16 px-2 py-1 text-white text-xs font-mono text-center outline-none"
                            />
                            <span className="text-[var(--text-muted)] text-[11px]">x</span>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => runBusy(`mult2:${u.public_id}`, () => handleUpdateMultiplier(u.public_id, currentVal))}
                            disabled={busyAction === `mult2:${u.public_id}`}
                            className="px-3 py-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[var(--radius-sm)] text-xs font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Save
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Model & Tool Breakdown + Usage Trends */}
          {costsSummary && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Tool / Model Cost Breakdown */}
              <div className="panel space-y-3">
                <div className="panel-head">
                  <span className="panel-head__title">Cost breakdown by tool / model</span>
                </div>
                <div className="panel-body space-y-2 text-xs font-mono">
                  {costsSummary.tool_breakdown?.length ? (
                    costsSummary.tool_breakdown.map((tool, i) => (
                      <div key={i} className="group p-3 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-white block">{tool.tool_or_model}</span>
                          <span className="text-[10px] text-[var(--text-muted)]">{tool.call_count} invocations</span>
                        </div>
                        <div className="text-right">
                          <span className="text-rose-400 font-bold block">${tool.total_base_cost}</span>
                          <span className="text-[10px] text-[var(--accent)]">Charged: ${tool.total_charged}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="group p-4 text-center text-[11px] text-[var(--text-muted)]">
                      No usage data yet — API calls will populate this breakdown.
                    </div>
                  )}
                </div>
              </div>

              {/* 7-Day Usage & Cost Trends */}
              <div className="panel space-y-3">
                <div className="panel-head">
                  <span className="panel-head__title">Usage trends (last 7 days)</span>
                </div>
                <div className="panel-body space-y-2 text-xs font-mono">
                  {costsSummary.trends?.length ? (
                    costsSummary.trends.map((day, i) => (
                      <div key={i} className="group p-3 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-white">{day.date} ({day.day_name})</span>
                          <span className="text-[10px] text-[var(--text-muted)] block">{day.calls} API calls</span>
                        </div>
                        <span className="text-[var(--accent)] font-bold">${day.cost_usd}</span>
                      </div>
                    ))
                  ) : (
                    <div className="group p-4 text-center text-[11px] text-[var(--text-muted)]">
                      No usage in the last 7 days.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: HEALTH */}
      {activeTab === 'health' && (
        <div className="panel space-y-4">
          <div className="panel-head flex items-center justify-between">
            <span className="panel-head__title">System health status</span>
            <button
              type="button"
              onClick={() => runBusy('health', fetchHealth)}
              disabled={busyAction === 'health'}
              className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer disabled:opacity-50"
              title="Refresh health"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'health' ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="panel-body">
            {healthData ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                <div className="group p-4">
                  <span className="text-[var(--text-muted)] block text-[10px] uppercase font-semibold">API Status</span>
                  <strong className={`text-base inline-flex items-center gap-1.5 mt-1 ${healthData.status === 'healthy' ? 'text-emerald-400' : 'text-red-400'}`}>
                    <span className={`w-2 h-2 rounded-full ${healthData.status === 'healthy' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} aria-hidden="true" />
                    {healthData.status === 'healthy' ? 'operational' : 'degraded'}
                  </strong>
                </div>
                <div className="group p-4">
                  <span className="text-[var(--text-muted)] block text-[10px] uppercase font-semibold">Database</span>
                  <strong className={`text-base inline-flex items-center gap-1.5 mt-1 ${healthData.db_alive ? 'text-emerald-400' : 'text-red-400'}`}>
                    <span className={`w-2 h-2 rounded-full ${healthData.db_alive ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} aria-hidden="true" />
                    {healthData.db_alive ? 'connected' : 'down'}
                  </strong>
                </div>
                <div className="group p-4">
                  <span className="text-[var(--text-muted)] block text-[10px] uppercase font-semibold">Uptime</span>
                  <strong className="text-white text-base block mt-1">{healthData.uptime_formatted || 'unknown'}</strong>
                </div>
              </div>
              {healthData.metrics_mode === 'placeholder' && (
                <p className="mt-3 text-[10px] text-[var(--text-muted)]">
                  Latency and error-rate metrics are not instrumented yet. Only the values above are
                  measured; the raw health payload still carries placeholder figures.
                </p>
              )}
            ) : (
              <div className="empty-state">
                <span className="empty-state__icon"><Activity className="w-4 h-4" aria-hidden="true" /></span>
                <p>Health telemetry unavailable. System health data will appear here once the backend responds.</p>
                <button
                  type="button"
                  onClick={() => runBusy('health-retry', fetchHealth)}
                  disabled={busyAction === 'health-retry'}
                  className="mx-auto mt-2 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs bg-white/5 hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] transition cursor-pointer disabled:opacity-50"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: SYSTEM CONTROL */}
      {activeTab === 'system_control' && (
        <div className="panel space-y-4 text-xs">
          <div className="panel-head">
            <span className="panel-head__title">Temporary storage &amp; cache control</span>
          </div>
          <div className="panel-body space-y-3">
            <p className="text-[var(--text-muted)] leading-relaxed">
              Flush local in-memory card caches and client session storage keys across all active browser windows.
            </p>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem('helpotron_cached_cards');
                } catch (e) {}
                alert('Temporary cache cleared.');
              }}
              className="px-4 py-2 bg-rose-500/15 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded-[var(--radius-sm)] font-semibold transition cursor-pointer"
            >
              Clear Local Runtime Cache
            </button>
          </div>
        </div>
      )}

      {/* Change user password dialog (operator 08-28) */}
      {pwChangeFor && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPwChangeFor(null)}>
          <div
            className="w-full max-w-md surface-glass-strong bg-[var(--bg-surface-elevated)] border border-[rgba(139,92,246,0.3)] rounded-[var(--radius-lg)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[var(--border-subtle)]">
              <KeyRound className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-sm font-bold text-white">
                Change password — <span className="font-mono text-[var(--accent)]">{pwChangeFor}</span>
              </h3>
            </div>
            <div className="px-5 py-4 space-y-3 text-xs">
              <p className="text-[var(--text-muted)] leading-relaxed">
                Sets a new password without the user's current one. Sessions are revoked on
                success. Optionally enter an open recovery code to tie this change to a
                request in flight (it gets consumed).
              </p>
              <label htmlFor="pw-change-new" className="block text-[var(--text-secondary)]">
                New password <span className="text-[var(--text-muted)]">(min 8 chars, letter + number)</span>
              </label>
              <input
                id="pw-change-new"
                type="password"
                autoComplete="new-password"
                value={pwChangeNew}
                onChange={(e) => setPwChangeNew(e.target.value)}
                placeholder="New password"
                autoFocus
                className="clean-input w-full px-3 py-2 text-white outline-none"
              />
              <label htmlFor="pw-change-code" className="block text-[var(--text-secondary)]">
                Recovery code <span className="text-[var(--text-muted)]">(optional, 6 digits)</span>
              </label>
              <input
                id="pw-change-code"
                type="text"
                value={pwChangeCode}
                onChange={(e) => setPwChangeCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                placeholder="Optionally consume an open recovery request"
                className="clean-input w-full px-3 py-2 text-white font-mono outline-none"
              />
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleRowChangePw}
                  disabled={pwChangeBusy}
                  className="px-3.5 py-2 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-[11px] font-semibold transition cursor-pointer"
                >
                  {pwChangeBusy ? 'Changing…' : 'Change password'}
                </button>
                <button
                  type="button"
                  onClick={() => setPwChangeFor(null)}
                  className="px-3 py-2 rounded-[var(--radius-sm)] bg-white/4 border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--color-surface-raised)] transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
