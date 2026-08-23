/* ────────────────────────────────────────────────────────────────────────────
 * AutomationCenter.jsx — Automations, Runs, Schedules, Templates, Recipes.
 * Toggling an automation actually updates its state (session-persisted).
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react';
import { Play, Clock, Copy, Zap } from 'lucide-react';
import { AUTOMATIONS, RUNS, SCHEDULES, TEMPLATES, RECIPES, demoEnabled } from '../demoData.js';
import { Badge, StatusBadge, Tabs, Toggle, EmptyState, timeAgo, SectionHeader } from './ui/os.jsx';
import SectionCard from './SectionCard.jsx';

const AUTOS_KEY = 'helpotron_automations_state';

function loadAutoState() {
  try {
    return JSON.parse(localStorage.getItem(AUTOS_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

export default function AutomationCenter() {
  const [tab, setTab] = useState('automations');
  const demo = demoEnabled();
  const [autoState, setAutoState] = useState(loadAutoState);
  const [ran, setRan] = useState(false);

  const automations = useMemo(
    () => (demo ? AUTOMATIONS.map((a) => ({ ...a, enabled: autoState[a.id] ?? a.enabled })) : []),
    [demo, autoState],
  );

  const toggle = (id, enabled) => {
    const next = { ...autoState, [id]: enabled };
    setAutoState(next);
    try { localStorage.setItem(AUTOS_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
  };

  const runNow = () => {
    setRan(true);
    setTimeout(() => setRan(false), 1600);
  };

  const tabBtn = (key, label) => (
    <button
      key={key}
      type="button"
      onClick={() => setTab(key)}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
        tab === key ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {tabBtn('automations', 'Automations')}
        {tabBtn('runs', 'Runs')}
        {tabBtn('schedules', 'Schedules')}
        {tabBtn('templates', 'Templates')}
        {tabBtn('recipes', 'Recipes')}
        <button
          type="button"
          onClick={runNow}
          className="ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer"
        >
          <Play className="w-3.5 h-3.5" />
          {ran ? 'Run started…' : 'Run all'}
        </button>
      </div>

      {/* ── AUTOMATIONS ─────────────────────────────────────────────────── */}
      {tab === 'automations' && (
        automations.length === 0 ? (
          <EmptyState icon="⚙️" title="No automations yet" body="Create an automation to make Helpotron do the busy work for you." actionLabel="Browse templates" onAction={() => setTab('templates')} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {automations.map((a) => (
              <SectionCard id={`automation-item-${a.id}`} className="space-y-3" header={
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                      <h3 className="text-sm font-semibold text-white truncate">{a.name}</h3>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{a.description}</p>
                  </div>
                  <Toggle checked={a.enabled} onChange={(v) => toggle(a.id, v)} label={`${a.enabled ? 'On' : 'Off'}`} />
                </div>
              }>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <Badge color="slate">trigger: {a.trigger}</Badge>
                  <span>· {a.runs} runs</span>
                  <span className="ml-auto">{a.lastRun ? `last ${timeAgo(a.lastRun)}` : 'never run'}</span>
                </div>
              </SectionCard>
            ))}
          </div>
        )
      )}

      {/* ── RUNS ────────────────────────────────────────────────────────── */}
      {tab === 'runs' && (
        <SectionCard id="automation-run-history" header={<SectionHeader title="Run history" subtitle="Every execution of every automation" />}>
          {!demo || RUNS.length === 0 ? (
            <EmptyState title="No runs yet" body="Runs appear here as soon as an automation executes." />
          ) : (
            <div className="space-y-2">
              {RUNS.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-950/40 border border-white/6">
                  <StatusBadge status={r.status} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-200 truncate">{r.automation}</div>
                    <div className="text-[10px] text-slate-500">{r.id} · started {timeAgo(r.started)} · {r.duration}</div>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">−{r.credits} cr</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── SCHEDULES ───────────────────────────────────────────────────── */}
      {tab === 'schedules' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {demo && SCHEDULES.map((s) => (
            <SectionCard id={`automation-schedule-${s.id}`} className="flex items-start justify-between gap-3" header={
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-purple-300" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">{s.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{s.cadence}</div>
                  <div className="text-[10px] text-slate-600 mt-1">next: {new Date(s.next).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            } headerRight={<Toggle checked={s.enabled} onChange={() => { /* demo: schedules toggle live in settings */ }} label={s.enabled ? 'On' : 'Off'} />}>
            </SectionCard>
          ))}
          {(!demo || SCHEDULES.length === 0) && <EmptyState title="No schedules" body="Schedule automations to run on a cadence." />}
        </div>
      )}

      {/* ── TEMPLATES ───────────────────────────────────────────────────── */}
      {tab === 'templates' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {demo && TEMPLATES.map((t) => (
            <SectionCard id={`automation-template-${t.id}`} className="flex flex-col space-y-3" header={
              <div className="flex items-center justify-between w-full">
                <span className="text-lg">📋</span>
                <Badge color="slate">{t.steps} steps</Badge>
              </div>
            }>
              <div>
                <div className="text-xs font-semibold text-white">{t.name}</div>
                <p className="text-[11px] text-slate-500 mt-1">{t.description}</p>
              </div>
              <button
                type="button"
                className="mt-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-blue-600 hover:text-white border border-white/8 text-[11px] text-slate-300 transition cursor-pointer"
              >
                <Copy className="w-3 h-3" /> Use template
              </button>
              <div className="text-[10px] text-slate-600 text-center">used {t.uses}× by the community</div>
            </SectionCard>
          ))}
          {(!demo || TEMPLATES.length === 0) && <EmptyState title="No templates" body="Templates turn multi-step workflows into one click." />}
        </div>
      )}

      {/* ── RECIPES ─────────────────────────────────────────────────────── */}
      {tab === 'recipes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {demo && RECIPES.map((r) => (
            <SectionCard id={`automation-recipe-${r.id}`} className="space-y-3" header={
              <div className="flex items-center gap-2">
                <span className="text-base">🍲</span>
                <h3 className="text-sm font-semibold text-white">{r.name}</h3>
              </div>
            }>
              <p className="text-[11px] text-slate-500">{r.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {r.automations.map((id) => {
                  const auto = AUTOMATIONS.find((a) => a.id === id);
                  return auto ? <Badge key={id} color="blue">{auto.name}</Badge> : null;
                })}
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-600">{r.popularity} cooks using this</span>
                <button type="button" className="text-[11px] font-semibold text-blue-300 hover:text-blue-200 transition cursor-pointer">Apply recipe →</button>
              </div>
            </SectionCard>
          ))}
          {(!demo || RECIPES.length === 0) && <EmptyState title="No recipes yet" body="Recipes bundle automations into proven workflows." />}
        </div>
      )}
    </div>
  );
}
