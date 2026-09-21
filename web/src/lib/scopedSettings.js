/**
 * scopedSettings.js — read and write per-area setting overrides.
 *
 * Owner (2026-09-21): "have the main settings page work globally, and then at the
 * individual regional areas, at like an assignment bubble, or subject bubble, my
 * agent, etc u have subsettings there that can override the global default".
 *
 * Storage (canonical, and what the backend reads):
 *   settings.scoped[path] = [{ id, scope: { level, ref }, value }]
 *
 * Resolution: most-specific wins — assignment, then subject — then the global value.
 *
 * `ref` is a NAME, not an id. The server builds its resolution context from the
 * assignment TITLE and the subject NAME (`routes_overlord.py` sets
 * `{"assignment": title, "subject": subject}`), so an override saved against an id
 * would never match anything.
 *
 * Writes go through PATCH /api/user/settings. Until 2026-09-21 the API silently
 * DROPPED this key (`scoped` was not in the writable set), so a saved override
 * vanished with a success response — the declared key `scoped_subsettings` used a
 * different shape that nothing read. Both are fixed on the server; this module
 * writes only the canonical one.
 */
import api from '../api.js';
import { getSetting } from '../components/ScopedSetting.jsx';

const LEVEL_ORDER = ['assignment', 'subject'];

function normalise(variant) {
  const scope = variant?.scope || {
    level: variant?.target_type || variant?.level,
    ref: variant?.target_value || variant?.ref,
  };
  return scope?.level && scope?.ref ? { scope, value: variant?.value } : null;
}

/** The most specific scoped value for `path` under `ctx`, or null. */
export function resolveScoped(scoped, path, ctx = {}) {
  const variants = (scoped?.[path] || []).map(normalise).filter(Boolean);
  if (!variants.length) return null;
  for (const level of LEVEL_ORDER) {
    const ref = ctx[level];
    if (!ref) continue;
    const hit = variants.find((v) => v.scope.level === level && String(v.scope.ref) === String(ref));
    if (hit) return hit.value;
  }
  return null;
}

/** The scope level and ref that a context would write to — the most specific
 *  dimension the current area actually has. */
export function scopeFor(ctx = {}) {
  if (ctx.assignment) return { level: 'assignment', ref: String(ctx.assignment) };
  if (ctx.subject) return { level: 'subject', ref: String(ctx.subject) };
  return null;
}

export function useScopedOverrides(settings, path, ctx = {}) {
  const scoped = (settings && settings.scoped) || {};
  const target = scopeFor(ctx);
  const globalValue = getSetting(settings, path);
  const scopedValue = resolveScoped(scoped, path, ctx);
  const isOverridden = scopedValue !== null && scopedValue !== undefined;

  const write = async (variants) => {
    await api.updateSettings({ scoped: { ...scoped, [path]: variants } });
  };

  const setOverride = async (value) => {
    if (!target) throw new Error('This area has no subject or assignment to scope to.');
    // Replace any existing variant at the same scope rather than stacking a
    // second one — two variants at one scope resolve by list order, which is not
    // something the user can see or reason about.
    const kept = (scoped[path] || []).filter(
      (v) => !(normalise(v)?.scope.level === target.level
               && String(normalise(v)?.scope.ref) === target.ref),
    );
    kept.push({
      id: `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      scope: { level: target.level, ref: target.ref },
      value,
    });
    await write(kept);
  };

  const clearOverride = async () => {
    if (!target) return;
    const kept = (scoped[path] || []).filter(
      (v) => !(normalise(v)?.scope.level === target.level
               && String(normalise(v)?.scope.ref) === target.ref),
    );
    await write(kept);
  };

  return { globalValue, scopedValue, isOverridden, setOverride, clearOverride, target };
}
