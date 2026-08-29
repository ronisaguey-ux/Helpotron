/* ────────────────────────────────────────────────────────────────────────────
 * os.jsx — Helpotron OS primitive library (Experience Rewrite, 08-22)
 * Small, consistent building blocks every OS screen consumes.
 * ────────────────────────────────────────────────────────────────────────── */
import React from 'react';
import { motion } from 'motion';

/* ── Badge ────────────────────────────────────────────────────────────────── */
export function Badge({ color = 'slate', children, className = '' }) {
  const colors = {
    slate: 'bg-white/5 text-slate-300 border-white/10',
    green: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    blue: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    red: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    purple: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    cyan: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  };
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium border ${colors[color] || colors.slate} ${className}`}>
      {children}
    </span>
  );
}

export const StatusBadge = ({ status }) => {
  const map = {
    operational: <Badge color="green">● Operational</Badge>,
    warning: <Badge color="amber">● Warning</Badge>,
    down: <Badge color="red">● Down</Badge>,
    success: <Badge color="green">Success</Badge>,
    failed: <Badge color="red">Failed</Badge>,
    running: <Badge color="blue">● Running</Badge>,
    open: <Badge color="amber">Open</Badge>,
    completed: <Badge color="green">Completed</Badge>,
    skipped: <Badge color="slate">Skipped</Badge>,
    active: <Badge color="green">● Active</Badge>,
    flagged: <Badge color="amber">● Flagged</Badge>,
    suspended: <Badge color="red">● Suspended</Badge>,
  };
  return map[status] ?? <Badge>{status}</Badge>;
};

/* ── StatCard ─────────────────────────────────────────────────────────────── */
export function StatCard({ label, value, sub, icon: Icon, iconColor = 'text-blue-400', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay, ease: 'easeOut' }}
      whileHover={{ y: -2 }}
      className="clean-card p-5 cursor-default h-full"
    >
      <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
        <span>{label}</span>
        {Icon && <Icon className={`w-4 h-4 ${iconColor}`} />}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-[11px] mt-1 text-slate-500">{sub}</div>}
    </motion.div>
  );
}

/* ── SectionHeader ────────────────────────────────────────────────────────── */
/* `collapsed` is forwarded by SectionCard when its section is minimized:
 * only the title stays, subtitle + right actions are hidden so the
 * collapsed strip is a tight one-line bar. */
export function SectionHeader({ title, subtitle, right, collapsed }) {
  return (
    <div className={`flex items-end justify-between gap-3 ${collapsed ? '' : 'mb-3'}`}>
      <div>
        <h2 className="text-sm font-semibold text-white truncate">{title}</h2>
        {!collapsed && subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {!collapsed && right}
    </div>
  );
}

/* ── Progress (with optional pulsing accent) ──────────────────────────────── */
export function Progress({ value, className = '', color = 'from-blue-500 to-indigo-500', pulse = false }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-950 border border-white/5 ${className}`}>
      <div
        className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500 ${pulse ? 'animate-pulse' : ''}`}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

/* ── Toggle ───────────────────────────────────────────────────────────────── */
export function Toggle({ checked, onChange, label, description }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex items-start justify-between gap-4 w-full text-left cursor-pointer group"
    >
      <span className="min-w-0">
        <span className="block text-xs font-medium text-slate-200 group-hover:text-white transition">{label}</span>
        {description && <span className="block text-[11px] text-slate-500 mt-0.5">{description}</span>}
      </span>
      <span className={`relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200 ${checked ? 'bg-blue-600' : 'bg-slate-700'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

/* ── Slider (label + value readout) ───────────────────────────────────────── */
export function Slider({ label, value, min = 0, max = 100, onChange, format = (v) => `${v}`, disabled = false }) {
  return (
    <div className={disabled ? 'opacity-40 pointer-events-none' : ''}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-slate-300">{label}</label>
        <span className="text-[11px] font-mono text-blue-300">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="os-range w-full cursor-pointer"
        aria-label={label}
      />
    </div>
  );
}

/* ── Tabs ─────────────────────────────────────────────────────────────────── */
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
            active === t.key
              ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ── EmptyState ───────────────────────────────────────────────────────────── */
export function EmptyState({ icon = '✦', title, body, action, onAction, actionLabel }) {
  return (
    <div className="clean-card p-10 text-center space-y-3">
      <div className="text-3xl text-blue-400/60">{icon}</div>
      <div className="text-sm font-semibold text-white">{title}</div>
      {body && <p className="text-xs text-slate-500 max-w-sm mx-auto">{body}</p>}
      {(action || actionLabel) && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition cursor-pointer"
        >
          {actionLabel || action}
        </button>
      )}
    </div>
  );
}

/* ── Kbd ──────────────────────────────────────────────────────────────────── */
export function Kbd({ children }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-mono text-slate-400">
      {children}
    </kbd>
  );
}

/* ── Timeline (event stream) ──────────────────────────────────────────────── */
export function Timeline({ items, renderIcon, renderTitle, renderMeta }) {
  if (!items || items.length === 0) return null;
  return (
    <ol className="relative space-y-0">
      {items.map((item, i) => (
        <li key={item.id || i} className="relative flex gap-3 pb-4 last:pb-0">
          {i < items.length - 1 && <span className="absolute left-[11px] top-7 bottom-0 w-px bg-white/8" />}
          <span className="relative z-10 w-[22px] h-[22px] rounded-full bg-slate-800 border border-white/10 flex items-center justify-center shrink-0">
            {renderIcon ? renderIcon(item) : <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
          </span>
          <div className="min-w-0 pt-0.5 flex-1">
            {renderTitle ? renderTitle(item) : <div className="text-xs text-slate-200">{item.title}</div>}
            {renderMeta && renderMeta(item)}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── DataTable (lightweight) ──────────────────────────────────────────────── */
export function DataTable({ columns, rows, onRowClick, rowKey = 'id' }) {
  if (!rows || rows.length === 0) {
    return <div className="text-xs text-slate-500 py-6 text-center">No rows.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-white/8 text-slate-500">
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 font-medium whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row[rowKey]}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-white/5 text-slate-300 ${onRowClick ? 'cursor-pointer hover:bg-white/3 transition' : ''}`}
            >
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2.5 whitespace-nowrap">{c.render ? c.render(row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Relative time ────────────────────────────────────────────────────────── */
export function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function clockTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ── Event icon helper (type → lucide icon + color) ──────────────────────── */
export function eventIcon(type) {
  if (type.startsWith('assignment')) return { icon: '📝', cls: 'bg-blue-500/10 border-blue-500/30' };
  if (type.startsWith('material')) return { icon: '📄', cls: 'bg-emerald-500/10 border-emerald-500/30' };
  if (type.startsWith('automation') || type.startsWith('run')) return { icon: '⚙️', cls: 'bg-purple-500/10 border-purple-500/30' };
  if (type.startsWith('credit')) return { icon: '🪙', cls: 'bg-amber-500/10 border-amber-500/30' };
  if (type.startsWith('study')) return { icon: '🎯', cls: 'bg-cyan-500/10 border-cyan-500/30' };
  if (type.startsWith('payment')) return { icon: '💳', cls: 'bg-emerald-500/10 border-emerald-500/30' };
  if (type.startsWith('user')) return { icon: '👤', cls: 'bg-slate-500/10 border-slate-500/30' };
  if (type.startsWith('ai.')) return { icon: '🧠', cls: 'bg-indigo-500/10 border-indigo-500/30' };
  return { icon: '✦', cls: 'bg-white/5 border-white/10' };
}
