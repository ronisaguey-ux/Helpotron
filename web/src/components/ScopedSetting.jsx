/* ────────────────────────────────────────────────────────────────────────────
 * ScopedSetting.jsx — hierarchical apply scopes for settings.
 *
 * Collapsed: just the basic (global) setting control + an expander.
 * Expanded:  (1) a collapsible ~20-word description,
 *             (2) a hierarchy wizard — Subject → Class/Teacher → Assignment →
 *                 Task — pick a scope, press "Apply", go deeper if you want
 *                 the override to be even more specific,
 *             (3) existing overrides as chips with one-click delete/edit.
 *
 * Variants live in settings.scoped[path] = [{ id, scope: {level, ref}, value }]
 * Most-specific scope wins at resolve time (effectiveValue).
 *
 * Props:  path, variants, setVariants, levels (optional), values (chips or
 *         free-text when omitted), refs (subject datalist), description
 *         (~20-word text; falls back to a generic one), children (the global
 *         control), title.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import { Plus, Pencil, ChevronDown, ChevronUp, Trash2, Layers, ArrowRight } from 'lucide-react';

export const SCOPE_LEVELS = [
  { key: 'subject', label: 'Subject' },
  { key: 'class', label: 'Class / Teacher' },
  { key: 'assignment', label: 'Assignment' },
  { key: 'task', label: 'Task' },
];

/* Most-specific-wins resolver: given a context ({subject?, class?, assignment?,
 * task?}), returns the matching variant's value or null when no variant applies. */
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

export function getSetting(settings, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), settings);
}

/* Effective value for a path under a context: the most-specific scoped
 * variant wins; otherwise the global value. `settings` = the full settings
 * object (from loadSettings()). This is what enforcement should use. */
export function effectiveValue(settings, path, ctx = {}) {
  const v = resolveScopedValue(settings?.scoped, path, ctx);
  return v !== null ? v : getSetting(settings, path);
}

const LEVEL_PLACEHOLDERS = {
  subject: 'e.g. Biology',
  class: 'e.g. Biology 201',
  assignment: 'e.g. Chapter 5 test',
  task: 'e.g. Intro paragraph',
};

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

/* One row of the hierarchy wizard: label + searchable ref input + Apply button,
 * plus the "go deeper" arrow when this level is not the deepest. */
function ScopeRow({
  levelKey,
  levelLabel,
  placeholder,
  refValue,
  onRefChange,
  refs,
  applyLabel,
  onApply,
  isDeepest,
  onDeeper,
  clash,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{levelLabel}</span>
      <input
        value={refValue}
        onChange={(e) => onRefChange(e.target.value)}
        placeholder={placeholder}
        list={refs && refs.length ? 'scoped-refs-subjects' : undefined}
        className="clean-input flex-1 min-w-[140px] px-3 py-1.5 text-[11px] outline-none"
        aria-label={`${levelLabel} name`}
      />
      <button
        type="button"
        onClick={onApply}
        disabled={!refValue.trim() || !!clash}
        className="px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-[10px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {applyLabel}
      </button>
      {!isDeepest && (
        <button
          type="button"
          onClick={onDeeper}
          disabled={!refValue.trim()}
          title="Go deeper — apply to a Class, Assignment or Task as well"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/12 text-[10px] text-slate-300 hover:text-white hover:border-white/30 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          deeper <ArrowRight className="w-3 h-3" />
        </button>
      )}
      {clash && <span className="text-[10px] text-rose-400 w-full">{clash}</span>}
    </div>
  );
}

export default function ScopedSetting({
  path,
  variants,
  setVariants,
  levels = SCOPE_LEVELS,
  values,
  slider,
  refs,
  refPlaceholder,
  title,
  currentValue,
  children,
}) {
  const [expanded, setExpanded] = useState(false);
  const [descOpen, setDescOpen] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [deeper, setDeeper] = useState(1); // how many hierarchy rows are visible
  const [refsByLevel, setRefsByLevel] = useState({});
  const [value, setValue] = useState(
    currentValue !== undefined
      ? currentValue
      : slider && !values
      ? slider.min
      : values && values[0]
      ? typeof values[0] === 'object'
        ? values[0].key
        : values[0]
      : ''
  );
  const [flash, setFlash] = useState(false);

  const list = variants || [];
  if (!refsByLevel.subject && refs && refs.length) setRefsByLevel((r) => ({ ...r, subject: refs[0] }));

  const clashFor = (levelKey) => {
    const q = (refsByLevel[levelKey] || '').trim().toLowerCase();
    if (!q) return null;
    return list.some(
      (x) => x.id !== editingId && x.scope?.level === levelKey && String(x.scope?.ref || '').trim().toLowerCase() === q
    )
      ? 'That scope already has an override — click its chip below to edit it.'
      : null;
  };

  const desc = description || `Controls “${title || path}” globally, or only for a specific subject, class, assignment or task.`;

  const applyAt = (levelKey) => {
    const ref = (refsByLevel[levelKey] || '').trim();
    if (!ref || clashFor(levelKey)) return;
    const next = [...list];
    const variant = { id: editingId || newId(), scope: { level: levelKey, ref }, value };
    if (editingId) {
      const i = next.findIndex((x) => x.id === editingId);
      if (i >= 0) next[i] = variant;
    }
    if (!editingId) next.push(variant);
    setVariants(path, next);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1600);
  };

  const remove = (id) => {
    setVariants(path, list.filter((x) => x.id !== id));
    if (editingId === id) { setEditingId(null); }
  };

  const editChip = (v) => {
    setEditingId(v.id);
    setRefsByLevel((r) => ({ ...r, [v.scope.level]: v.scope.ref || '' }));
    setValue(v.value);
    setExpanded(true);
  };

  const levelLabel = (key) => (levels.find((l) => l.key === key) || {}).label || key;

  return (
    <div>
      {children}

      {/* Expander: everything about scoping lives behind this. */}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setExpanded(!expanded); if (!expanded) setDescOpen(true); }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 text-[10px] text-slate-400 hover:text-slate-200 hover:border-white/25 transition cursor-pointer"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          <Layers className="w-3 h-3" />
          {expanded ? 'Done — collapse' : 'Where this applies'}
          {!expanded && list.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold">{list.length}</span>
          )}
        </button>
        {!expanded && flash && (
          <span className="text-[10px] text-emerald-400 animate-fadeIn">✓ saved</span>
        )}
      </div>

      {expanded && (
        <div className="mt-2 p-3 rounded-xl bg-slate-950/50 border border-white/8 space-y-3"
             onKeyDown={(e) => { if (e.key === 'Escape') setExpanded(false); }}>
          {/* What this setting does — independently collapsible */}
          <div>
            <button
              type="button"
              onClick={() => setDescOpen(!descOpen)}
              className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition cursor-pointer"
            >
              {descOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              What this setting does
            </button>
            {descOpen && (
              <p className="text-[11px] text-slate-400 leading-relaxed mt-1">{desc}</p>
            )}
          </div>

          {/* The value this override will force */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              {editingId ? 'Editing override' : 'New override'} — {title || path}
            </div>
            {slider ? (
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={Number(value) || slider.min}
                  onChange={(e) => setValue(Number(e.target.value))}
                  className="flex-1 accent-emerald-500 cursor-pointer"
                />
                <span className="text-[11px] font-mono font-bold text-emerald-300">{Number(value) || slider.min}</span>
              </div>
            ) : values ? (
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
                aria-label="Override value"
                placeholder="Value for this scope…"
              />
            )}
          </div>

          {/* Hierarchy wizard: Subject → Class → Assignment → Task */}
          <div className="space-y-2.5 pt-1">
            {levels.slice(0, Math.max(deeper, 1)).map((l, i) => {
              const deeperPressed = i < deeper - 1;
              const rowRefValue = refsByLevel[l.key] || '';
              const clash = clashFor(l.key);
              const applied = list.find((x) => x.scope?.level === l.key && x.scope?.ref === rowRefValue);
              return (
                <div key={l.key} className="relative">
                  {i > 0 && (
                    <div className="absolute -top-2 left-10 h-4 w-px bg-white/10" aria-hidden />
                  )}
                  <ScopeRow
                    levelKey={l.key}
                    levelLabel={l.label}
                    placeholder={refPlaceholder && l.key === 'subject' ? refPlaceholder : LEVEL_PLACEHOLDERS[l.key]}
                    refValue={rowRefValue}
                    onRefChange={(v) => setRefsByLevel((r) => ({ ...r, [l.key]: v }))}
                    refs={l.key === 'subject' ? refs : undefined}
                    applyLabel={applied && !editingId ? 'Update' : editingId && i === deeper - 1 ? 'Save' : 'Apply'}
                    onApply={() => applyAt(l.key)}
                    isDeepest={i === levels.length - 1}
                    onDeeper={() => setDeeper(Math.min(levels.length, i + 2))}
                    clash={clash}
                  />
                  {deeperPressed && rowRefValue && (
                    <div className="text-[9px] text-slate-600 mt-1 ml-28">
                      also applies inside <span className="text-slate-400">{rowRefValue}</span>
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-[9px] text-slate-600 leading-relaxed">
              Stop at the level that matches your intent: bold=subject only; deeper for a teacher, one assignment or one task. Most specific wins.
            </p>
          </div>

          {/* Existing overrides — easy add/delete */}
          {list.length > 0 && (
            <div className="pt-1 border-t border-white/6">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Existing overrides
              </div>
              <div className="flex flex-wrap gap-1.5">
                {list.map((v) => (
                  <span
                    key={v.id}
                    className={`group inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg border text-[10px] cursor-pointer transition ${
                      editingId === v.id
                        ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                        : 'bg-blue-500/10 border-blue-500/25 text-blue-300 hover:border-blue-500/50'
                    }`}
                    onClick={() => editChip(v)}
                    title={`${levelLabel(v.scope.level)}: ${v.scope.ref || '?'} → ${valueLabel(values, v.value)}`}
                  >
                    <Pencil className="w-2.5 h-2.5 opacity-50" />
                    <span className="font-semibold">{levelLabel(v.scope.level)}:</span>
                    <span className="text-slate-200">{v.scope.ref || '?'}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-semibold">{valueLabel(values, v.value)}</span>
                    <button
                      type="button"
                      aria-label={`Delete override ${v.scope.ref}`}
                      onClick={(e) => { e.stopPropagation(); remove(v.id); }}
                      className="w-4 h-4 flex items-center justify-center rounded-md text-slate-500 opacity-0 group-hover:opacity-100 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => { setEditingId(null); setExpanded(true); }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-white/15 text-[10px] text-slate-400 hover:text-slate-200 hover:border-white/30 hover:bg-white/4 transition cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
