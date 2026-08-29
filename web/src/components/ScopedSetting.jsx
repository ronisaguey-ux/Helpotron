/* ────────────────────────────────────────────────────────────────────────────
 * ScopedSetting.jsx — variant configs for a single setting.
 *
 * Collapsed: the setting's basic (global) control only. No clutter.
 * Expanded:  the FULL menu — pick a value, choose where this variant config
 *            applies (an app place, subject, class, assignment or task) and
 *            press Apply. Existing variants list below, one-click edit/delete.
 *
 * Variants live in settings.scoped[path] = [{ id, scope: {level, ref}, value }]
 * Most-specific scope wins at resolve time (effectiveValue):
 *   task > assignment > class > subject > place
 *
 * Props:  path, variants, setVariants, levels (optional), values (chips or
 *         free-text when omitted), slider ({min,max,step}), refs (datalist
 *         strings, or APP_PLACES objects for a dropdown when level is 'place'),
 *         refPlaceholder, description, children (the global control), title.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import { Plus, Pencil, ChevronDown, ChevronUp, Trash2, Layers, Check, Globe } from 'lucide-react';

export const SCOPE_LEVELS = [
  { key: 'place', label: 'App place' },
  { key: 'subject', label: 'Subject' },
  { key: 'class', label: 'Class / Teacher' },
  { key: 'assignment', label: 'Assignment' },
  { key: 'task', label: 'Task' },
];

/* Appearance-style settings scope only by app place. */
export const PLACE_LEVELS = [{ key: 'place', label: 'App place' }];

/* The places a variant can apply to (app views, keyed by activeView id). */
export const APP_PLACES = [
  { key: 'overview', label: 'Dashboard' },
  { key: 'activity', label: 'Activity' },
  { key: 'history', label: 'Assignments' },
  { key: 'agent', label: 'Agent Chat' },
  { key: 'ai-workspace', label: 'AI Workspace' },
  { key: 'library', label: 'Library' },
  { key: 'dump', label: 'Assignment Dump' },
  { key: 'datalake', label: 'Data Lake' },
  { key: 'insights', label: 'Insights' },
  { key: 'credits', label: 'Credits' },
  { key: 'settings', label: 'Settings' },
  { key: 'extension', label: 'Extension' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'automation', label: 'Automation' },
  { key: 'monitors', label: 'Monitors' },
  { key: 'admin', label: 'Control Center' },
];

/* Most-specific-wins resolver: given a context ({place?, subject?, class?,
 * assignment?, task?}), returns the matching variant's value or null when no
 * variant applies. */
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
  place: 'e.g. Dashboard',
  subject: 'e.g. Biology',
  class: 'e.g. Biology 201',
  assignment: 'e.g. Chapter 5 test',
  task: 'e.g. Intro paragraph',
};

function newId() {
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const valueLabel = (values, v) => {
  if (v === null || v === undefined) return '';
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
  slider,
  refs,
  refPlaceholder,
  title,
  currentValue,
  description,
  children,
  globalValue,       /* the base value that applies everywhere (defaults to currentValue) */
  onGlobalChange,    /* (v) => void — updates the base; without it Global is read-only */
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingGlobal, setEditingGlobal] = useState(false);
  const [globalDraft, setGlobalDraft] = useState(null);
  const [levelKey, setLevelKey] = useState(levels[0]?.key || 'place');
  const [ref, setRef] = useState('');
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

  /* The value controls (chips / slider / free text) — shared by the variant
   * editor and the Global editor so both edit the same kinds of values. */
  const valueControls = (val, change) => (
    slider ? (
      <div className="flex items-center gap-3 mb-2.5">
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={Number(val) || slider.min}
          onChange={(e) => change(Number(e.target.value))}
          className="flex-1 accent-[var(--accent)] cursor-pointer"
        />
        <span className="text-[11px] font-mono font-bold text-[var(--accent)]">{Number(val) || slider.min}</span>
      </div>
    ) : values ? (
      <div className="flex flex-wrap gap-1 mb-2.5">
        {values.map((o) => {
          const k = typeof o === 'object' ? o.key : o;
          const label = typeof o === 'object' ? o.label : o;
          return (
            <button
              key={String(k)}
              type="button"
              onClick={() => change(k)}
              className={`px-2.5 py-1 rounded-lg text-[10px] capitalize transition cursor-pointer border ${
                val === k
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
        value={typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}
        onChange={(e) => change(e.target.value)}
        className="clean-input w-full px-3 py-1.5 text-[11px] outline-none mb-2.5"
        aria-label="Value"
        placeholder="Value…"
      />
    )
  );

  const list = variants || [];
  /* 'place' level always gets the app-place dropdown (custom refs or the
   * built-in APP_PLACES); every other level gets a free input. */
  const placeRefs = refs && refs[0] && typeof refs[0] === 'object' ? refs : APP_PLACES;
  const refInput = levelKey === 'place' ? (
    <select
      value={ref}
      onChange={(e) => setRef(e.target.value)}
      aria-label="Where this variant applies"
      className="clean-input flex-1 min-w-[140px] px-2.5 py-1.5 text-[11px] outline-none bg-[var(--bg-surface-elevated)]"
    >
      <option value="">Choose a place…</option>
      {ref && !placeRefs.some((p) => p.key === ref) && <option value={ref}>{ref}</option>}
      {placeRefs.map((p) => (
        <option key={p.key} value={p.key}>{p.label}</option>
      ))}
    </select>
  ) : (
    <input
      value={ref}
      onChange={(e) => setRef(e.target.value)}
      placeholder={refPlaceholder || LEVEL_PLACEHOLDERS[levelKey] || 'Name…'}
      list={levelKey === 'subject' && refs && refs.length ? 'scoped-refs-subjects' : undefined}
      className="clean-input flex-1 min-w-[140px] px-3 py-1.5 text-[11px] outline-none"
      aria-label="Where this variant applies"
    />
  );

  const clash = (() => {
    const q = ref.trim().toLowerCase();
    if (!q) return null;
    return list.some(
      (x) => x.id !== editingId && x.scope?.level === levelKey && String(x.scope?.ref || '').trim().toLowerCase() === q
    )
      ? 'That place already has a variant — click its row below to edit it.'
      : null;
  })();

  const desc = description || `Global applies everywhere. Add a variant config below to override just one place.`;

  const apply = () => {
    const r = ref.trim();
    if (!r || clash) return;
    const next = [...list];
    const variant = { id: editingId || newId(), scope: { level: levelKey, ref: r }, value };
    if (editingId) {
      const i = next.findIndex((x) => x.id === editingId);
      if (i >= 0) next[i] = variant;
    }
    if (!editingId) next.push(variant);
    setVariants(path, next);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1600);
    setEditingId(null);
    setRef('');
  };

  const remove = (id) => {
    setVariants(path, list.filter((x) => x.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const editVariant = (v) => {
    setEditingId(v.id);
    setLevelKey(v.scope.level || levels[0]?.key);
    setRef(v.scope.ref || '');
    setValue(v.value);
    setExpanded(true);
  };

  const levelLabel = (key) => (levels.find((l) => l.key === key) || SCOPE_LEVELS.find((l) => l.key === key) || {}).label || key;

  return (
    <div>
      {children}

      {/* Expander — the whole variant menu lives behind this. */}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setExpanded(!expanded); if (!expanded) { setEditingId(null); setEditingGlobal(false); } }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] text-[10px] text-slate-400 hover:text-slate-200 hover:border-[rgba(139,92,246,0.45)] transition cursor-pointer"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          <Layers className="w-3 h-3" />
          {expanded ? 'Done — collapse' : 'Variant configs'}
          {!expanded && list.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold">{list.length}</span>
          )}
        </button>
        {!expanded && flash && (
          <span className="text-[10px] text-emerald-400 animate-fadeIn flex items-center gap-1"><Check className="w-3 h-3" /> saved</span>
        )}
      </div>

      {expanded && (
        <div
          className="mt-2 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3"
          onKeyDown={(e) => { if (e.key === 'Escape') { setExpanded(false); setEditingId(null); setEditingGlobal(false); } }}
        >
          {/* GLOBAL — always present (operator 08-28): the base value that
           * applies everywhere. Edit it here without touching place overrides. */}
          <div
            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition ${
              editingGlobal
                ? 'bg-[var(--accent-subtle)] border-[var(--accent)]'
                : 'bg-[var(--bg-surface-elevated)] border-[var(--border-subtle)] hover:border-[rgba(139,92,246,0.4)]'
            } ${onGlobalChange ? 'cursor-pointer' : ''}`}
            onClick={() => {
              if (!onGlobalChange) return;
              setEditingGlobal(!editingGlobal);
              if (!editingGlobal) {
                setGlobalDraft(globalValue !== undefined ? globalValue : currentValue);
                setEditingId(null);
              }
            }}
          >
            <Globe className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold text-slate-100">Global</div>
              <div className="text-[9px] text-slate-500">applies everywhere — the default</div>
            </div>
            <span className="text-[var(--accent)] font-semibold text-[11px] truncate">
              {valueLabel(values, editingGlobal ? globalDraft : (globalValue !== undefined ? globalValue : currentValue)) || '—'}
            </span>
            {onGlobalChange && (editingGlobal ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <Pencil className="w-3 h-3 text-slate-500 opacity-70 shrink-0" />)}
          </div>

          {editingGlobal && onGlobalChange && (
            <div className="p-3 rounded-lg bg-white/3 border border-[var(--border-subtle)] space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Set global value</div>
              {valueControls(globalDraft, setGlobalDraft)}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingGlobal(false)}
                  className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[10px] text-slate-400 hover:text-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onGlobalChange(globalDraft);
                    setEditingGlobal(false);
                    setFlash(true);
                    window.setTimeout(() => setFlash(false), 1600);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-[10px] font-semibold transition cursor-pointer"
                >
                  Apply to Global
                </button>
              </div>
              <p className="text-[9px] text-slate-500 leading-relaxed">
                Changing Global updates the default everywhere — places that have their own override below stay on their own value.
              </p>
            </div>
          )}

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              {editingId ? 'Editing variant' : 'New variant'} — {title || path}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-2">{desc}</p>

            {/* The value this variant forces */}
            {valueControls(value, setValue)}

            {/* Where it applies: level + name + Apply */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={levelKey}
                onChange={(e) => { setLevelKey(e.target.value); setRef(''); }}
                aria-label="Scope level"
                className="clean-input px-2.5 py-1.5 text-[11px] outline-none bg-[var(--bg-surface-elevated)]"
              >
                {levels.map((l) => (
                  <option key={l.key} value={l.key}>{l.label}</option>
                ))}
              </select>
              {refInput}
              <button
                type="button"
                onClick={apply}
                disabled={!ref.trim() || !!clash}
                className="px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-[10px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {editingId ? 'Save variant' : '+ Add variant'}
              </button>
            </div>
            {clash && <div className="text-[10px] text-rose-400 mt-1.5">{clash}</div>}
            <p className="text-[9px] text-slate-600 leading-relaxed mt-1.5">
              Choose the most specific scope that matches your intent — that variant wins. Add as many as you want.
            </p>
          </div>

          {/* Existing variants */}
          {list.length > 0 && (
            <div className="pt-1 border-t border-white/6">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Place overrides
              </div>
              <div className="space-y-1.5">
                {list.map((v) => (
                  <div
                    key={v.id}
                    className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] transition cursor-pointer ${
                      editingId === v.id
                        ? 'bg-[var(--accent-subtle)] border-[var(--accent)]'
                        : 'bg-[var(--bg-surface-elevated)] border-[var(--border-subtle)] hover:border-[rgba(139,92,246,0.4)]'
                    }`}
                    onClick={() => editVariant(v)}
                  >
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 shrink-0">{levelLabel(v.scope.level)}</span>
                    <span className="text-slate-200 font-medium truncate">{v.scope.ref || '?'}</span>
                    <span className="text-slate-500">→</span>
                    <span className="text-[var(--accent)] font-semibold truncate">{valueLabel(values, v.value)}</span>
                    <span className="flex-1" />
                    {/* Touch-first: no hover on mobile — edit/delete stay visible
                       below sm, hover-revealed only on pointer devices. */}
                    <Pencil className="w-3 h-3 text-slate-500 opacity-60 sm:opacity-0 sm:group-hover:opacity-70" />
                    <button
                      type="button"
                      aria-label={`Delete variant ${v.scope.ref}`}
                      onClick={(e) => { e.stopPropagation(); remove(v.id); }}
                      className="w-5 h-5 flex items-center justify-center rounded-md text-slate-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => { setEditingId(null); setRef(''); }}
                className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-[var(--border-subtle)] text-[10px] text-slate-400 hover:text-slate-200 hover:border-[rgba(139,92,246,0.45)] hover:bg-white/4 transition cursor-pointer"
              >
                <Plus className="w-3 h-3" /> New variant
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
