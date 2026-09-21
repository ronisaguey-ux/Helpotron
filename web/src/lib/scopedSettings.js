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
 * Resolution: most-specific wins — assignment, then subject, then place, then the
 * global value.
 *
 * `ref` is a NAME, not an id. The server builds its resolution context from the
 * assignment TITLE and the subject NAME (`routes_overlord.py` sets
 * `{"assignment": title, "subject": subject, "place": agent_node}`), so an override
 * saved against an id would never match anything.
 *
 * ══ WHY THIS MODULE OWNS A SERVER CACHE ══════════════════════════════════════
 * The obvious implementation reads `settings.scoped` off `loadSettings()`. That is
 * wrong twice over, and both ways were live:
 *
 *   1. IT READ BLIND. `loadSettings()` reads localStorage; `api.updateSettings()`
 *      PATCHes the server and never writes it back. So the local copy is `{}` or
 *      stale for the whole session and the control reported every override as
 *      "Following global" — including ones the server was actively enforcing.
 *   2. IT WROTE DESTRUCTIVELY. The save spread that stale local object
 *      (`{...scoped, [path]: variants}`), which REPLACES the entire server-side
 *      `scoped` map. Setting an override for one subject silently deleted the
 *      overrides for every other subject and path.
 *
 * So the authoritative copy is fetched from the server, cached here, and every
 * write merges against it. A failed fetch degrades to the last known good value
 * rather than to `{}` — degrading to empty is what causes (2).
 */
import { useEffect, useState } from 'react';
import api from '../api.js';
import { getSetting } from '../components/ScopedSetting.jsx';

// Must match the backend's _SCOPE_ORDER (server/humanize_skill.py). `place` is the
// surface itself — "my_agent", "assignment_team" — which is how a whole screen
// carries overrides rather than just a bubble.
const LEVEL_ORDER = ['assignment', 'subject', 'place'];

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
 *  dimension the current area actually has. Order must match LEVEL_ORDER. */
export function scopeFor(ctx = {}) {
  if (ctx.assignment) return { level: 'assignment', ref: String(ctx.assignment) };
  if (ctx.subject) return { level: 'subject', ref: String(ctx.subject) };
  if (ctx.place) return { level: 'place', ref: String(ctx.place) };
  return null;
}

/** True when `variants` holds one for this exact scope. */
function sameScope(variant, target) {
  const n = normalise(variant);
  return !!n && n.scope.level === target.level && String(n.scope.ref) === target.ref;
}

/* ── the server copy ───────────────────────────────────────────────────────── */

let cache = null;
let inflight = null;
const subscribers = new Set();

function publish(next) {
  cache = next;
  subscribers.forEach((fn) => {
    try { fn(next); } catch (e) { /* a dead listener must not break the write */ }
  });
}

/**
 * The server's `scoped` map — the only authoritative copy.
 * `force` re-reads; concurrent callers share one request.
 */
export async function fetchScoped({ force = false } = {}) {
  if (!force && cache) return cache;
  if (!inflight) {
    inflight = api.getUserSettings()
      .then((j) => ((j && j.settings) || j || {}).scoped || {})
      .catch(() => cache || {}) // last known good, never {} — see the header
      .then((s) => { publish(s); return s; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Drop the cache so the next read comes from the server. */
export function invalidateScoped() {
  cache = null;
}

/** The whole server `scoped` map, for callers that need to inspect several paths
 *  at once (an "this subject has overrides" badge, say). */
export function useScopedMap() {
  const [scoped, setScoped] = useState(() => cache || {});
  useEffect(() => {
    let dead = false;
    subscribers.add(setScoped);
    fetchScoped().then((s) => { if (!dead) setScoped(s); }).catch(() => {});
    return () => { dead = true; subscribers.delete(setScoped); };
  }, []);
  return scoped;
}

/** Every path overridden at exactly `level`/`ref`. */
export function overriddenPathsAt(scoped, level, ref) {
  if (!ref) return [];
  return Object.entries(scoped || {})
    .filter(([, variants]) =>
      (Array.isArray(variants) ? variants : []).some((v) => {
        const n = normalise(v);
        return !!n && n.scope.level === level && String(n.scope.ref) === String(ref);
      }))
    .map(([path]) => path);
}

export function useScopedOverrides(settings, path, ctx = {}) {
  const [scoped, setScoped] = useState(() => cache || {});
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    let dead = false;
    subscribers.add(setScoped);
    fetchScoped()
      .then((s) => { if (!dead) { setScoped(s); setLoading(false); } })
      .catch(() => { if (!dead) setLoading(false); });
    return () => { dead = true; subscribers.delete(setScoped); };
  }, []);

  const target = scopeFor(ctx);
  const globalValue = getSetting(settings, path);
  const scopedValue = resolveScoped(scoped, path, ctx);
  const isOverridden = scopedValue !== null && scopedValue !== undefined;

  /**
   * Replace this area's variant for `path`, merged onto the SERVER's map.
   * `nextVariants` is the complete list for this path.
   */
  const commit = async (nextVariants) => {
    const serverScoped = await fetchScoped();
    const merged = { ...serverScoped, [path]: nextVariants };
    await api.updateSettings({ scoped: merged });
    publish(merged);
  };

  const setOverride = async (value) => {
    if (!target) throw new Error('This area has no subject or assignment to scope to.');
    const serverScoped = await fetchScoped();
    // Replace any existing variant at the same scope rather than stacking a second
    // one — two variants at one scope resolve by list order, which is not something
    // the user can see or reason about.
    const kept = (serverScoped[path] || []).filter((v) => !sameScope(v, target));
    kept.push({
      id: `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      scope: { level: target.level, ref: target.ref },
      value,
    });
    await commit(kept);
  };

  const clearOverride = async () => {
    if (!target) return;
    const serverScoped = await fetchScoped();
    const kept = (serverScoped[path] || []).filter((v) => !sameScope(v, target));
    await commit(kept);
  };

  return {
    globalValue, scopedValue, isOverridden, setOverride, clearOverride, target, loading,
  };
}
