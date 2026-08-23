/* ────────────────────────────────────────────────────────────────────────────
 * AdminConsole.jsx — the Control Center: first screen for admins.
 * System status, today's numbers, attention queue, live admin activity,
 * user management with User 360 (14 admin actions + impersonation),
 * and quick actions. Deep panels live in AdminPanels.jsx.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion';
import {
  Eye, EyeOff, X, UserPlus, Mail, ShieldAlert, CreditCard, Star, Flag,
  LogOut, KeyRound, Download, Ban, RotateCcw, SlidersHorizontal, Ghost, Trash2, Zap, Megaphone,
} from 'lucide-react';
import api from '../api.js';
import {
  SYSTEM_STATUS, ADMIN_TODAY, ADMIN_ATTENTION, ADMIN_USERS, ADMIN_EVENTS,
  MAINTENANCE, demoEnabled,
} from '../demoData.js';
import { Badge, StatusBadge, StatCard, SectionHeader, Timeline, EmptyState, timeAgo } from './ui/os.jsx';
import SectionCard from './SectionCard.jsx';

/* 14 admin actions from the vision spec (static hover classes — Tailwind JIT
   cannot generate `hover:bg-${tone}-…` from a template literal) */
const TONE_HOVER = {
  blue: 'hover:bg-blue-500/15 hover:border-blue-500/30',
  purple: 'hover:bg-purple-500/15 hover:border-purple-500/30',
  cyan: 'hover:bg-cyan-500/15 hover:border-cyan-500/30',
  amber: 'hover:bg-amber-500/15 hover:border-amber-500/30',
  slate: 'hover:bg-white/10 hover:border-white/20',
  red: 'hover:bg-rose-500/15 hover:border-rose-500/30',
  green: 'hover:bg-emerald-500/15 hover:border-emerald-500/30',
};

const ADMIN_ACTIONS = [
  { key: 'grant', label: 'Grant credits', icon: CreditCard, tone: 'blue', desc: 'Add credits to the balance.' },
  { key: 'plan', label: 'Adjust plan', icon: Star, tone: 'purple', desc: 'Move between Basic / Pro / Elite.' },
  { key: 'flagOverride', label: 'Feature-flag override', icon: Flag, tone: 'cyan', desc: 'Force a flag for this user only.' },
  { key: 'impersonate', label: 'Impersonate', icon: Eye, tone: 'amber', desc: 'Log in as this user (audited).' },
  { key: 'forceLogout', label: 'Force logout', icon: LogOut, tone: 'slate', desc: 'Terminate all sessions.' },
  { key: 'resetPassword', label: 'Reset password', icon: KeyRound, tone: 'slate', desc: 'Email a reset link.' },
  { key: 'email', label: 'Send email', icon: Mail, tone: 'slate', desc: 'Compose an email to this user.' },
  { key: 'export', label: 'Export data', icon: Download, tone: 'slate', desc: 'Package all user data.' },
  { key: 'suspend', label: 'Suspend account', icon: Ban, tone: 'red', desc: 'Immediately block access.' },
  { key: 'restore', label: 'Restore account', icon: RotateCcw, tone: 'green', desc: 'Reinstate a suspended account.' },
  { key: 'restrict', label: 'Restrict AI tier', icon: SlidersHorizontal, tone: 'amber', desc: 'Cap which engines this user can reach.' },
  { key: 'shadowBan', label: 'Shadow ban', icon: Ghost, tone: 'red', desc: 'Silently cap AI access for review.' },
  { key: 'quota', label: 'Adjust quotas', icon: Zap, tone: 'amber', desc: 'Raise or lower rate limits.' },
  { key: 'delete', label: 'Delete account', icon: Trash2, tone: 'red', desc: 'Permanent — requires confirmation.' },
];

function User360({ user, onClose, onAction }) {
  const [impersonating, setImpersonating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [done, setDone] = useState(null);

  const run = (key) => {
    onAction(user, key);
    setDone(key);
    if (key === 'impersonate') setImpersonating(true);
    if (key === 'delete' && !confirmDelete) { setConfirmDelete(true); return; }
    setTimeout(() => setDone(null), 1600);
  };

  const rows = [
    ['Plan', <Badge color={user.plan === 'Elite' ? 'purple' : user.plan === 'Pro' ? 'blue' : 'slate'}>{user.plan}</Badge>],
    ['Status', <StatusBadge status={user.status} />],
    ['Credits', <span className="font-mono text-slate-200">{user.credits.toLocaleString()}</span>],
    ['Assignments', <span className="font-mono text-slate-200">{user.assignments}</span>],
    ['AI runs', <span className="font-mono text-slate-200">{user.aiRuns}</span>],
    ['Lifetime spend', <span className="font-mono text-slate-200">${user.spend.toFixed(2)}</span>],
    ['Joined', <span className="text-slate-300">{user.joinedDaysAgo} days ago</span>],
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.22 }}
      className="w-full lg:w-[430px] shrink-0 border-l border-white/8 bg-[#0b0f17] p-5 flex flex-col gap-4 overflow-y-auto"
      style={{ maxHeight: 'calc(100vh - 140px)' }}
      role="dialog"
      aria-label={`User 360 — ${user.publicId}`}
    >
      {/* Impersonation banner */}
      <AnimatePresence>
        {impersonating && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1">You are viewing Helpotron as <b>{user.publicId}</b>. Every action is audited.</span>
            <button type="button" onClick={() => setImpersonating(false)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-[10px] font-semibold transition cursor-pointer">
              <EyeOff className="w-3 h-3" /> Exit
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-lg font-black text-white shrink-0">
          {user.publicId[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white">{user.publicId}</div>
          <div className="text-[10px] text-slate-500 font-mono">{user.id} · {user.subjects.join(' · ')}</div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {user.tags.map((t) => <Badge key={t} color="cyan">{t}</Badge>)}
            {user.flags.map((f) => <Badge key={f} color="red">{f}</Badge>)}
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/8 transition cursor-pointer" aria-label="Close User 360">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Snapshot */}
      <div className="grid grid-cols-2 gap-2">
        {rows.map(([label, val]) => (
          <div key={label} className="px-3 py-2 rounded-xl bg-slate-950/40 border border-white/6">
            <div className="text-[9px] uppercase tracking-wider text-slate-600">{label}</div>
            <div className="text-[11px] mt-0.5">{val}</div>
          </div>
        ))}
      </div>

      {/* Admin actions */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Admin actions</div>
        <div className="grid grid-cols-2 gap-1.5">
          {ADMIN_ACTIONS.map((a) => {
            const Icon = a.icon;
            const isDelete = a.key === 'delete';
            return (
              <button
                key={a.key}
                type="button"
                title={a.desc}
                onClick={() => run(a.key)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-[10px] font-medium transition cursor-pointer ${
                  isDelete && confirmDelete
                    ? 'bg-rose-600 border-rose-500 text-white'
                    : `border-white/8 bg-white/4 ${TONE_HOVER[a.tone] || TONE_HOVER.slate}`
                } ${done === a.key ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' : 'text-slate-300'}`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                {isDelete && confirmDelete ? 'Confirm?' : a.label}
              </button>
            );
          })}
        </div>
        {done && <div className="mt-2 text-[10px] text-emerald-300">✓ Action applied to {user.publicId} (demo)</div>}
      </div>

      <div className="text-[9px] text-slate-600 leading-relaxed border-t border-white/6 pt-3">
        All admin actions are written to the audit log with your identity and a timestamp.
      </div>
    </motion.div>
  );
}

export default function AdminConsole({ onOpenPanel }) {
  const demo = demoEnabled();
  const [adminSearch, setAdminSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);
  const [maintenance, setMaintenance] = useState(MAINTENANCE.mode !== 'normal');
  // LIVE mode: real users from /api/admin/users, universal search from
  // /api/admin/search, bulk selection. The demo path is unchanged.
  const [liveUsers, setLiveUsers] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [bulkSel, setBulkSel] = useState(new Set());

  useEffect(() => {
    if (demo) return;
    api.adminUsers()
      .then((list) => setLiveUsers(Array.isArray(list) ? list : []))
      .catch(() => setLiveUsers([]));
  }, [demo]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const toLive = (u) => ({
    ...u,
    publicId: u.public_id || u.publicId,
    plan: u.plan ? u.plan.charAt(0).toUpperCase() + u.plan.slice(1) : 'Basic',
    status: u.is_banned ? 'banned' : (u.status || 'active'),
    credits: u.credits ?? 0,
    assignments: u.assignment_count ?? u.assignments ?? 0,
    aiRuns: u.aiRuns ?? 0,
    spend: u.spend ?? 0,
    subjects: u.subjects || [],
    tags: u.tags || [],
    flags: u.flags || [],
    joinedDaysAgo: u.joinedDaysAgo ?? '—',
  });

  const users = demo ? ADMIN_USERS.filter((u) => {
    if (planFilter !== 'all' && u.plan !== planFilter) return false;
    if (adminSearch && !u.publicId.toLowerCase().includes(adminSearch.toLowerCase()) && !(u.subjects || []).join('').toLowerCase().includes(adminSearch.toLowerCase())) return false;
    return true;
  }) : (searchResults ? (searchResults.users || []).map(toLive) : liveUsers.map(toLive));

  const runSearch = (q) => {
    setAdminSearch(q);
    if (demo || q.trim().length < 2) { setSearchResults(null); return; }
    api.adminSearch(q.trim())
      .then((data) => { if (data && typeof data === 'object') setSearchResults(data); })
      .catch(() => { setSearchResults(null); showToast('Universal search failed — backend unreachable'); });
  };

  const onAction = (user, key) => {
    const pid = user.publicId || user.public_id;
    const label = ADMIN_ACTIONS.find((a) => a.key === key)?.label || key;
    // Actions with no backend endpoint stay honest: demo toast or explicit
    // "no endpoint" note — never a fake success.
    if (demo || ['impersonate', 'forceLogout', 'email', 'export', 'flagOverride', 'restrict', 'shadowBan', 'quota'].includes(key)) {
      showToast(`${pid} → ${label}${demo ? ' (demo)' : ' — endpoint not built yet'}`);
      return;
    }
    if (key === 'grant') {
      api.adminAdjustCredits(pid, 50, 'admin console grant')
        .then((r) => showToast(`+50 credits → ${pid} (new balance ${r?.new_balance ?? '?'})`))
        .catch(() => showToast(`Grant failed for ${pid}`));
    } else if (key === 'plan') {
      api.adminSetPlan(pid, 'pro')
        .then(() => showToast(`Plan set to Pro → ${pid}`))
        .catch(() => showToast(`Plan change failed for ${pid}`));
    } else if (key === 'resetPassword') {
      const pw = Math.random().toString(36).slice(2, 10);
      api.adminResetPassword(pid, pw)
        .then(() => showToast(`Password reset for ${pid} (random — user must use Forgot Password)`))
        .catch(() => showToast(`Password reset failed for ${pid}`));
    } else if (key === 'suspend') {
      api.adminBanUser(pid)
        .then(() => showToast(`Account suspended → ${pid}`))
        .catch(() => showToast(`Suspend failed for ${pid}`));
    } else if (key === 'restore') {
      api.adminUnbanUser(pid)
        .then(() => showToast(`Account restored → ${pid}`))
        .catch(() => showToast(`Restore failed for ${pid}`));
    } else if (key === 'delete') {
      showToast(`${pid} → Delete account has no backend endpoint yet — flag for manual review`);
    }
  };

  const toggleBulk = (id) => {
    setBulkSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const runBulk = (kind) => {
    const ids = [...bulkSel];
    if (!ids.length) { showToast('Select at least one user first'); return; }
    const ops = ids.map((pid) =>
      kind === 'grant' ? api.adminAdjustCredits(pid, 50, 'bulk grant') :
      kind === 'plan' ? api.adminSetPlan(pid, 'pro') :
      api.adminBanUser(pid));
    Promise.allSettled(ops).then(() => {
      showToast(`Bulk ${kind} applied to ${ids.length} user${ids.length > 1 ? 's' : ''}`);
      setBulkSel(new Set());
      if (!demo) api.adminUsers().then((list) => setLiveUsers(Array.isArray(list) ? list : [])).catch(() => {});
    });
  };

  const onQuickAction = (label) => {
    showToast(`${label}${demo ? ' — demo run' : ''}`);
  };

  const QUICK_ACTIONS = [
    { label: 'Create assignment', icon: '+', action: () => onQuickAction('Create assignment') },
    { label: 'Broadcast', icon: <Megaphone className="w-3.5 h-3.5" />, action: () => onOpenPanel?.('broadcast') },
    { label: 'Maintenance', icon: '🛠️', action: () => onOpenPanel?.('maintenance') },
    { label: 'Cost report', icon: '$', action: () => onOpenPanel?.('cost') },
    { label: 'User lookup', icon: '🔎', action: () => onOpenPanel?.('users') },
  ];

  return (
    <div className="space-y-5">
      {/* Maintenance banner */}
      {maintenance && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200 flex items-center gap-3">
          <span>🛠️ {MAINTENANCE.message || 'Maintenance mode is on.'}</span>
          <button type="button" onClick={() => setMaintenance(false)} className="ml-auto px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-[10px] font-semibold transition cursor-pointer">
            End maintenance
          </button>
        </div>
      )}

      {/* System status strip */}
      {demo && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {SYSTEM_STATUS.map((s) => (
            <div key={s.name} className="clean-card px-4 py-3 flex items-center gap-3">
              <StatusBadge status={s.status} pulse />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-white">{s.name}</div>
                <div className="text-[9px] text-slate-500 truncate">{s.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Today */}
      {demo && ADMIN_TODAY && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Users" value={ADMIN_TODAY.users.toLocaleString()} sub={`${ADMIN_TODAY.active} active now`} delay={0} />
          <StatCard label="Assignments today" value={ADMIN_TODAY.assignments.toLocaleString()} sub="captured" delay={0.03} />
          <StatCard label="AI runs today" value={ADMIN_TODAY.aiRuns.toLocaleString()} sub="across all tiers" delay={0.06} />
          <StatCard label="Credits used" value={ADMIN_TODAY.creditsUsed.toLocaleString()} sub="platform-wide" delay={0.09} />
          <StatCard label="Revenue today" value={`$${ADMIN_TODAY.revenue.toLocaleString()}`} sub="net of refunds" delay={0.12} />
          <StatCard label="Active users" value={ADMIN_TODAY.active} sub="right now" delay={0.15} />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left: attention + activity */}
        <div className="xl:col-span-2 space-y-5">
          {/* Attention queue */}
          <SectionCard id="admin-attention" header={<SectionHeader title="Needs attention" subtitle="Things worth looking at before they escalate" />}>
            {demo && ADMIN_ATTENTION.length === 0 ? <EmptyState title="All clear" /> : (
              <div className="space-y-2">
                {ADMIN_ATTENTION.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-950/40 border border-white/6">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${a.severity === 'error' ? 'bg-rose-500 animate-pulse' : 'bg-amber-400'}`} />
                    <span className="text-[11px] text-slate-300 flex-1">{a.text}</span>
                    <Badge color={a.severity === 'error' ? 'red' : 'amber'}>{a.severity}</Badge>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Live admin activity */}
          <SectionCard id="admin-live-activity" header={<SectionHeader title="Live activity" subtitle="The event engine, admin side" />}>
            {demo ? (
              <Timeline
                items={ADMIN_EVENTS}
                renderTitle={(e) => (
                  <span className="text-slate-200">
                    {e.metadata?.user ? <b>{e.metadata.user}</b> : null}{' '}
                    <span className="text-slate-400">{e.type.replace(/\./g, ' ')}</span>
                    {e.metadata?.amount ? <span className="font-mono text-emerald-300"> ${e.metadata.amount}</span> : null}
                    {e.metadata?.error ? <span className="text-rose-300"> — {e.metadata.error}</span> : null}
                  </span>
                )}
                renderMeta={(e) => (
                  <span className="flex items-center gap-2">
                    <StatusBadge status={e.status} />
                    {timeAgo(e.timestamp)}
                  </span>
                )}
              />
            ) : (
              <EmptyState title="No activity" body="Events appear here as the platform runs." />
            )}
          </SectionCard>
        </div>

        {/* Right: users + quick actions */}
        <div className="space-y-5">
          <SectionCard id="admin-users" header={<SectionHeader title="Users" subtitle="Search, inspect, act" />}>
            <div className="flex gap-2 mb-3">
              <input
                value={adminSearch}
                onChange={(e) => runSearch(e.target.value)}
                placeholder="universal_search — users, subjects, flags…"
                className="clean-input flex-1 px-3 py-2 text-[11px] outline-none"
                aria-label="Search users"
                data-testid="universal_search"
              />
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-[11px] text-slate-300 outline-none cursor-pointer"
                aria-label="Filter by plan"
              >
                {['all', 'Basic', 'Pro', 'Elite'].map((p) => <option key={p} className="bg-slate-900">{p === 'all' ? 'All plans' : p}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {users.length === 0 && !searchResults ? <EmptyState title="No users match" /> : users.map((u) => (
                <div key={u.id} className={`flex items-center gap-2 rounded-xl border transition ${
                  selected?.id === u.id ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/6 bg-slate-950/40 hover:border-white/15'
                }`}>
                  <input
                    type="checkbox"
                    checked={bulkSel.has(u.publicId)}
                    onChange={() => toggleBulk(u.publicId)}
                    aria-label={`Select ${u.publicId} for bulk action`}
                    className="ml-3 w-3.5 h-3.5 accent-blue-500 cursor-pointer shrink-0"
                  />
                  <button
                    type="button"
                    onClick={() => setSelected(selected?.id === u.id ? null : u)}
                    className="w-full flex items-center gap-3 px-2 py-2.5 text-left cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      {(u.publicId || '?')[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-white truncate">{u.publicId}</div>
                      <div className="text-[9px] text-slate-500 font-mono">{u.credits.toLocaleString()} cr · ${(u.spend || 0).toFixed(2)}</div>
                    </div>
                    <StatusBadge status={u.status} />
                  </button>
                </div>
              ))}
            </div>

            {/* Bulk action bar — real endpoints, applied to every selection */}
            {bulkSel.size > 0 && (
              <div className="mt-3 p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-blue-200 font-semibold mr-1">{bulkSel.size} selected</span>
                <button type="button" onClick={() => runBulk('grant')} className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-[10px] font-semibold text-white transition cursor-pointer">Grant +50 cr</button>
                <button type="button" onClick={() => runBulk('plan')} className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-[10px] font-semibold text-white transition cursor-pointer">Set Pro</button>
                <button type="button" onClick={() => runBulk('ban')} className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-[10px] font-semibold text-white transition cursor-pointer">Suspend</button>
                <button type="button" onClick={() => setBulkSel(new Set())} className="ml-auto px-2 py-1 rounded-lg text-[10px] text-slate-300 hover:text-white transition cursor-pointer">Clear</button>
              </div>
            )}

            {/* Universal search results (live mode): users + assignments + materials + credit activity */}
            {searchResults && !demo && (
              <div className="mt-3 space-y-3">
                {(searchResults.assignments || []).length > 0 && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Assignments</div>
                    {searchResults.assignments.map((a) => (
                      <div key={`a${a.id}`} className="px-3 py-2 rounded-xl bg-slate-950/40 border border-white/6 text-[10px] text-slate-300 flex gap-2">
                        <span className="truncate flex-1">{a.title}</span>
                        <Badge color="slate">{a.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
                {(searchResults.materials || []).length > 0 && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Study materials</div>
                    {searchResults.materials.map((m) => (
                      <div key={`m${m.id}`} className="px-3 py-2 rounded-xl bg-slate-950/40 border border-white/6 text-[10px] text-slate-300 truncate">
                        {m.kind} · {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}
                      </div>
                    ))}
                  </div>
                )}
                {(searchResults.credit_transactions || []).length > 0 && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Credit activity</div>
                    {searchResults.credit_transactions.map((t) => (
                      <div key={`t${t.id}`} className="px-3 py-2 rounded-xl bg-slate-950/40 border border-white/6 text-[10px] text-slate-300 flex gap-2">
                        <span className={`font-mono ${t.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{t.delta >= 0 ? '+' : ''}{t.delta}</span>
                        <span className="truncate flex-1">{t.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard id="admin-quick-actions" header={<SectionHeader title="Quick actions" subtitle="One click, fully audited" />}>
            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((qa) => (
                <button
                  key={qa.label}
                  type="button"
                  onClick={qa.action}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/4 border border-white/8 text-[11px] text-slate-300 hover:bg-blue-600 hover:text-white transition cursor-pointer"
                >
                  {qa.icon} {qa.label}
                </button>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* User 360 drawer */}
      <AnimatePresence>
        {selected && <User360 user={selected} onClose={() => setSelected(null)} onAction={onAction} />}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 right-6 px-4 py-3 rounded-xl bg-emerald-600 text-white text-[11px] font-medium shadow-xl z-50"
          >
            ✓ {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
