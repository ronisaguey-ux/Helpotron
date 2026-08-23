/* ────────────────────────────────────────────────────────────────────────────
 * ScopedSetting.jsx — hierarchical apply scopes for settings.
 *
 * Wraps any settings control with a scope row: chips for every existing
 * variant ("Subject: Biology → High"), an "+ Add new setting" button that
 * creates a variant of this setting applying to a specific hierarchy level
 * (subject / class / assignment / task). Most-specific scope wins at resolve
 * time; the wrapped control itself keeps editing the GLOBAL (default) value.
 *
 *   <ScopedSetting path="ai.effort" variants={...} setVariants={...}
 *                  values={['low','balanced','high']}>
 *     <EffortCards ... />   // edits the global value
 *   </ScopedSetting>
 *
 * `values` may be an array of plain strings or {key, label} pairs; when
 * omitted the variant editor falls back to a free-text value input
 * (numeric settings, names, instructions — anything).
 *
 * Variants live in settings.scoped[path] = [{ id, scope: {level, ref}, value }]
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import { Plus, X, Pencil, Layers } from 'lucide-react';

export const SCOPE_LEVELS = [
  { key: 'subject', label: 'Subject' },
  { key: 'class', label: 'Class' },
  { key: 'assignment', label: 'Assignment' },
  { key: 'task', label: 'Task' },
];

/* Most-specific-wins resolver: given a context ({subject?, class?, assignment?,
 * task?}), returns the matching variant's value or null when no variant applies.
 * Used by the app to actually apply scoped settings at runtime. */
export function resolveScopedValue(scoped, path, ctx = {}) {
  const variants = scoped?.[path];
  if (!variants || variants.length === 0) return null;
  for (let i = SCOPE_LEVELS.length - 1; i >= 0; i--) {
    const level = SCOPE_LEVELS[i].key;
    const ref = ctx[level];
    if (!ref) continue;
    const hit = variants.find((v) => v.scope?.level === level && v.scope?.ref === ref);
    if (hit) return hit.value;
  }
  return null;
}

function newId() {
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const valueLabel = (values, v) => {
  if (values) {
    const opt = values.find((o) => (typeof o === 'object' ? o.key === v : o === v));
    if (opt) return typeof opt === 'object' ? opt.label : opt;
  }
  return String(v);
};

export default function ScopedSetting({
  path,
  variants,
  setVariants,
  levels = SCOPE_LEVELS,
  values,
  refs,
  refPlaceholder = 'e.g. Biology',
  title,
  children,
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [level, setLevel] = useState(levels[0].key);
  const [ref, setRef] = useState('');
  const [value, setValue] = useState(values && values[0] ? (typeof values[0] === 'object' ? values[0].key : values[0]) : '');

  const list = variants || [];

  const startAdd = () => {
    setEditingId(null);
    setLevel(levels[0].key);
    setRef('');
    setValue(values && values[0] ? (typeof values[0] === 'object' ? values[0].key : values[0]) : '');
    setOpen(true);
  };

  const startEdit = (v) => {
    setEditingId(v.id);
    setLevel(v.scope.level);
    setRef(v.scope.ref || '');
    setValue(v.value);
    setOpen(true);
  };

  const save = () => {
    if (!ref.trim()) return;
    const next = [...list];
    const variant = { id: editingId || newId(), scope: { level, ref: ref.trim() }, value };
    if (editingId) {
      const i = next.findIndex((x) => x.id === editingId);
      if (i >= 0) next[i] = variant;
    } else {
      next.push(variant);
    }
    setVariants(path, next);
    setOpen(false);
    setEditingId(null);
  };

  const remove = (id) => {
    setVariants(path, list.filter((x) => x.id !== id));
    if (editingId === id) setOpen(false);
  };

  const levelLabel = (key) => (levels.find((l) => l.key === key) || {}).label || key;

  return (
    <div>
      {children}

      {/* Scope row: existing variants + add button */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600 mr-0.5">
          <Layers className="w-3 h-3" /> Applies to
        </span>
        {list.length === 0 && (
          <span className="text-[10px] text-slate-600 italic">everything (global)</span>
        )}
        {list.map((v) => (
          <span
            key={v.id}
            className="group inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-blue-500/10 border border-blue-500/25 text-[10px] text-blue-300 cursor-pointer hover:border-blue-500/50 transition"
            onClick={() => startEdit(v)}
            title={`Edit variant: ${levelLabel(v.scope.level)} · ${v.scope.ref || ''}`}
          >
            <Pencil className="w-2.5 h-2.5 opacity-50" />
            <span className="font-semibold">{levelLabel(v.scope.level)}:</span>
            <span className="text-slate-200">{v.scope.ref || '?'}</span>
            <span className="text-slate-400">→</span>
            <span className="font-semibold">{valueLabel(values, v.value)}</span>
            <button
              type="button"
              aria-label={`Delete variant ${v.scope.ref}`}
              onClick={(e) => { e.stopPropagation(); remove(v.id); }}
              className="w-4 h-4 flex items-center justify-center rounded-md text-slate-500 opacity-0 group-hover:opacity-100 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={startAdd}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-white/15 text-[10px] text-slate-400 hover:text-slate-200 hover:border-white/30 hover:bg-white/4 transition cursor-pointer"
        >
          <Plus className="w-3 h-3" /> Add new setting
        </button>
      </div>

      {/* Variant editor */}
      {open && (
        <div className="mt-2 p-3 rounded-xl bg-slate-950/50 border border-white/8 space-y-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {editingId ? 'Edit variant' : 'New variant'} — {title || path}
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Level */}
            <div className="flex flex-wrap gap-1">
              {levels.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => setLevel(l.key)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition cursor-pointer border ${
                    level === l.key
                      ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                      : 'bg-white/4 text-slate-400 border-white/8 hover:text-slate-200'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            {/* Ref */}
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder={refPlaceholder}
              list={refs && refs.length ? `scoped-refs-${path.replace(/[^a-z0-9]/gi, '-')}` : undefined}
              className="clean-input flex-1 min-w-[160px] px-3 py-1.5 text-[11px] outline-none"
              aria-label="Scope reference (e.g. subject, class or task name)"
            />
            {refs && refs.length > 0 && (
              <datalist id={`scoped-refs-${path.replace(/[^a-z0-9]/gi, '-')}`}>
                {refs.map((r) => <option key={r} value={r} />)}
              </datalist>
            )}
          </div>
          {/* Value */}
          {values ? (
            <div className="flex flex-wrap gap-1">
              {values.map((o) => {
                const k = typeof o === 'object' ? o.key : o;
                const label = typeof o === 'object' ? o.label : o;
                return (
                  <button
                    key={String(k)}
                    type="button"
                    onClick={() => setValue(k)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] capitalize transition cursor-pointer border ${
                      value === k
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 font-semibold'
                        : 'bg-white/4 text-slate-400 border-white/8 hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <input
              value={typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
              onChange={(e) => setValue(e.target.value)}
              className="clean-input w-full px-3 py-1.5 text-[11px] outline-none"
              aria-label="Variant value"
              placeholder="Value for this scope…"
            />
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setOpen(false); setEditingId(null); }}
              className="px-3 py-1.5 rounded-lg text-[10px] text-slate-400 hover:text-slate-200 hover:bg-white/5 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!ref.trim()}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {editingId ? 'Save variant' : 'Add variant'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
