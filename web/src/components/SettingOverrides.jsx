/**
 * SettingOverrides.jsx — per-area overrides for a setting whose global default
 * lives in Settings.
 *
 * Owner (2026-09-21): "have the main settings page work globally, and then at the
 * individual regional areas, at like an assignment bubble, or subject bubble, my
 * agent, etc u have subsettings there that can override the global default".
 *
 * THE CONTRACT, because two schemas existed and neither worked:
 *   - Storage: `settings.scoped[path] = [{ id, scope: {level, ref}, value }]`
 *   - Resolution: most-specific wins (assignment > subject), then the global value.
 *   - `ref` is the NAME, not an id: the server builds its resolution context from
 *     the assignment TITLE and the subject NAME (`routes_overlord.py` passes
 *     `{"assignment": title, "subject": subject}`), so anything else here would
 *     write an override that never matches.
 *
 * The old panel on this screen saved `subject_configs` to localStorage only —
 * nothing the server could read — so its "overrides" were invisible to every
 * enforcement path. This writes to the server, in the shape the resolver reads.
 *
 * `path` must be a path the BACKEND actually resolves or the override is honest
 * but inert. Currently resolvable:
 *   ai.humanizer            on/off
 *   ai.detection.enabled    on/off
 *   ai.detection.min_human  number
 *   ai.detection.detectors.<name>   on/off   (zippy, roberta_onnx)
 *   ai.effortScore          1-10
 *   ai.style.enabled        on/off
 */
import React, { useState } from 'react';
import { Layers, RotateCcw, Check, Globe } from 'lucide-react';
import { useScopedOverrides } from '../lib/scopedSettings.js';

export default function SettingOverrides({
  path,
  label,
  description,
  globalLabel,
  valueType = 'toggle', // 'toggle' | 'level'
  min = 1,
  max = 10,
  ctx = {},
  settings,
  onSaved,
}) {
  const { globalValue, scopedValue, isOverridden, setOverride, clearOverride } =
    useScopedOverrides(settings, path, ctx);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setFailed(false);
    try {
      await fn();
      setFlash(true);
      window.setTimeout(() => setFlash(false), 1600);
      onSaved?.();
    } catch (e) {
      // Surfaced rather than swallowed: a failed write must not look saved. Rendered
      // inline instead of window.alert, which blocks the page and cannot be read.
      setFailed(e?.message || 'Could not save that override.');
    } finally {
      setBusy(false);
    }
  };

  const effective = isOverridden ? scopedValue : globalValue;

  const renderControl = () => {
    if (valueType === 'level') {
      const current = Number(effective ?? globalValue ?? 5);
      return (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={current}
            disabled={busy}
            onChange={(e) => run(() => setOverride(Number(e.target.value)))}
            aria-label={`${label} for this area`}
            className="flex-1 accent-primary cursor-pointer disabled:opacity-50"
          />
          <span className="font-code-sm text-xs text-primary font-semibold w-8 text-right">
            {current}
          </span>
        </div>
      );
    }
    const globalOn = globalValue !== false && globalValue !== 'off';
    const on = isOverridden ? !!scopedValue : globalOn;
    // Three reachable states, and the click has to distinguish them:
    //   not overridden -> override to the OPPOSITE of the global (so a global ON
    //     can actually be turned OFF for this area — the whole point of the control)
    //   overridden     -> flip the explicit value (an explicit OFF can be turned back ON)
    //   clearing       -> only ever via "Use global"
    // Clicking clearOverride() from a non-overridden state is a silent no-op, which
    // is what made the toggle do nothing whenever the global was on.
    const nextValue = isOverridden ? !scopedValue : !globalOn;
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => run(() => setOverride(nextValue))}
        aria-pressed={on}
        aria-label={isOverridden ? `${label} for this area (overridden)` : `${label} for this area`}
        className={`w-10 h-6 rounded-full border flex items-center px-0.5 transition-all cursor-pointer disabled:opacity-50 ${
          on
            ? 'bg-primary/30 border-primary/50 justify-end'
            : 'bg-surface-container-high border-outline-variant/30 justify-start'
        }`}
      >
        <span className={`w-4 h-4 rounded-full ${on ? 'bg-primary' : 'bg-on-surface-variant/50'}`} />
      </button>
    );
  };

  return (
    <div
      data-override-key={path}
      data-override-state={isOverridden ? 'overridden' : 'global'}
      className="flex items-start justify-between gap-unit-3 p-unit-3 rounded-xl bg-surface-container-low/40 border border-outline-variant/10"
    >
      <div className="flex flex-col pr-2 min-w-0">
        <span className="font-body-sm text-xs font-semibold text-on-surface">{label}</span>
        <span className="font-code-sm text-[11px] text-outline leading-relaxed">{description}</span>
        <span className="font-code-sm text-[10px] mt-1 flex items-center gap-1.5">
          {isOverridden ? (
            <>
              <Layers className="w-3 h-3 text-primary shrink-0" />
              <span className="text-primary">Overridden here</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => clearOverride())}
                className="inline-flex items-center gap-1 text-outline hover:text-primary cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Use global{gname()}</span>
              </button>
            </>
          ) : (
            <>
              <Globe className="w-3 h-3 shrink-0" />
              <span className="text-outline">Following global{gname()}</span>
            </>
          )}
        </span>
        {failed && (
          <span data-override-error className="font-code-sm text-[10px] mt-1 text-error">
            {failed}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 pt-0.5">
        {flash && <Check className="w-3.5 h-3.5 text-primary" />}
        {renderControl()}
      </div>
    </div>
  );

  function gname() {
    return globalLabel ? ` (${globalLabel})` : '';
  }
}
