/* ────────────────────────────────────────────────────────────────────────────
 * AdminPanels.jsx — the deep admin workspace: Feature Flags, Experiments,
 * AI Control Room (spend simulator), Cost Intelligence, System Health,
 * Audit Log, Broadcast Center, Maintenance, the live System Map, and the
 * AI Admin Analyst. Tier labels only — no engine names.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion';
import { Send, Sparkles, AlertTriangle, MessageSquare, Gauge, TrendingUp } from 'lucide-react';
import {
  FEATURE_FLAGS, EXPERIMENTS, AI_ROOM, ROUTING_RULES, COST_FORECAST,
  SYSTEM_STATUS, AUDIT_LOG, SYSTEM_MAP, MAINTENANCE, ADMIN_EVENTS,
  demoEnabled,
} from '../demoData.js';
import { Badge, StatusBadge, SectionHeader, Progress, Slider, Toggle, Tabs, EmptyState, Timeline, timeAgo } from './ui/os.jsx';
import AdminConsole from './AdminConsole.jsx';
import AdminAgentChat from './AdminAgentChat.jsx';
import SectionCard from './SectionCard.jsx';

const inputCls = 'clean-input w-full px-3 py-2 text-xs outline-none';

/* ── FEATURE FLAGS ────────────────────────────────────────────────────────── */
function FlagsPanel() {
  const [flags, setFlags] = useState(FEATURE_FLAGS);
  const [toast, setToast] = useState(null);
  const demo = demoEnabled();
  const flip = (id) => {
    setFlags((f) => f.map((x) => (x.id === id ? { ...x, on: !x.on } : x)));
    setToast('Flag updated — rollout will adjust over ~2 min');
    setTimeout(() => setToast(null), 2200);
  };
  return (
    <SectionCard id="admin-flags" header={<SectionHeader title="Feature flags" subtitle="Ship anything, anywhere, anytime — with a kill switch" />}>
      {!demo || flags.length === 0 ? <EmptyState title="No flags" /> : flags.map((f) => (
        <div key={f.id} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-slate-950/40 border border-white/6">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-white">{f.name}</div>
            <div className="text-[10px] text-slate-500">owner: {f.owner} · rollout: <Badge color={f.rollout === 'off' ? 'red' : f.rollout === 'everyone' ? 'green' : 'amber'}>{f.rollout}</Badge></div>
          </div>
          <Toggle checked={f.on} onChange={() => flip(f.id)} label="" />
        </div>
      ))}
      {toast && <div className="text-[11px] text-emerald-300">✓ {toast}</div>}
    </SectionCard>
  );
}

/* ── EXPERIMENTS ──────────────────────────────────────────────────────────── */
function ExperimentsPanel() {
  return (
    <div className="space-y-4">
      <SectionHeader title="A/B experiments" subtitle="Every experiment has a kill switch and a clear winner rule" />
      {demoEnabled() && EXPERIMENTS.map((ex) => {
        const win = (ex.variantA > ex.control ? 'Variant A' : 'Control');
        return (
          <SectionCard id={`admin-experiment-${ex.id}`} header={
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-white">{ex.name}</span>
              <Badge color={ex.status === 'running' ? 'blue' : 'amber'}>{ex.status}</Badge>
              <span className="ml-auto text-[10px] text-slate-500">running {ex.startedDaysAgo} days</span>
            </div>
          }>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between text-[10px] text-slate-500 mb-1"><span>Control</span><span className="font-mono">{ex.control}%</span></div>
                <Progress value={ex.control} color="from-slate-500 to-slate-400" />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-slate-500 mb-1"><span>Variant A</span><span className="font-mono">{ex.variantA}%</span></div>
                <Progress value={ex.variantA} color={ex.variantA > ex.control ? 'from-emerald-500 to-teal-400' : 'from-slate-500 to-slate-400'} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(ex.metrics).map(([k, v]) => (
                <span key={k} className="px-2.5 py-1 rounded-lg bg-white/4 border border-white/8 text-[10px] text-slate-300 font-mono">
                  {k} <b className={v.startsWith('+') ? 'text-emerald-300' : 'text-rose-300'}>{v}</b>
                </span>
              ))}
            </div>
            <div className="text-[10px] text-slate-500">Current leader: <Badge color={ex.variantA > ex.control ? 'green' : 'slate'}>{win}</Badge> — auto-promote on statistical significance (95%)</div>
          </SectionCard>
        );
      })}
    </div>
  );
}

/* ── AI CONTROL ROOM ──────────────────────────────────────────────────────── */
function AIRoomPanel() {
  const [w, setW] = useState({ fast: 30, balanced: 40, flagship: 30 });
  const demo = demoEnabled();
  const total = w.fast + w.balanced + w.flagship;
  const projected = Math.round(COST_FORECAST?.currentMonthly * (total / 100));
  const simCost = (row) => Math.round(row.cost * (w[row.tier === 'Fast tier' ? 'fast' : row.tier === 'Balanced tier' ? 'balanced' : 'flagship'] / 100) * (100 / 30));
  return (
    <div className="space-y-5">
      <SectionCard id="admin-ai-room" header={<SectionHeader title="AI Control Room" subtitle="Watch the engines work, simulate the cost" />}>
        {!demo ? <EmptyState title="No AI traffic" /> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-4">
              {AI_ROOM.map((row) => {
                const key = row.tier === 'Fast tier' ? 'fast' : row.tier === 'Balanced tier' ? 'balanced' : 'flagship';
                return (
                  <div key={row.tier} className="p-4 rounded-xl bg-slate-950/40 border border-white/6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-white">{row.tier}</span>
                      <div className="text-[10px] text-slate-500 font-mono">{row.requests.toLocaleString()} req · {row.latency}s p95</div>
                    </div>
                    <div className="text-[10px] text-slate-500 mb-2">{row.tasks.join(' · ')}</div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-500">live cost share</span>
                      <span className="font-mono text-slate-200">${row.cost.toLocaleString()}/mo</span>
                    </div>
                    <Progress value={row.cost} color={key === 'fast' ? 'from-emerald-500 to-teal-400' : key === 'balanced' ? 'from-blue-500 to-cyan-400' : 'from-purple-500 to-fuchsia-400'} />
                    <StatusBadge status={row.latency > 3 ? 'warning' : 'operational'} pulse />
                  </div>
                );
              })}
            </div>
            <div className="p-4 rounded-xl bg-slate-950/40 border border-white/6">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5"><Gauge className="w-3 h-3" /> Spend simulator</div>
              <p className="text-[10px] text-slate-500 mb-4">Drag the mix — watch what the month would cost. (Demo; live controls are gated behind confirm.)</p>
              <div className="space-y-4">
                {[
                  ['fast', 'Fast tier', 'from-emerald-500 to-teal-400', 'Mechanical work'],
                  ['balanced', 'Balanced tier', 'from-blue-500 to-cyan-400', 'Routine writing'],
                  ['flagship', 'Flagship tier', 'from-purple-500 to-fuchsia-400', 'Complex reasoning'],
                ].map(([key, label, color, hint]) => (
                  <Slider key={key} label={`${label} — ${w[key]}%`} value={w[key]} min={0} max={60} onChange={(v) => setW({ ...w, [key]: v })} hint={hint} bar={color} />
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between p-4 rounded-xl bg-blue-500/8 border border-blue-500/25">
                <span className="text-[11px] text-slate-300">Simulated monthly cost</span>
                <span className="text-xl font-bold text-white font-mono">${projected.toLocaleString()}</span>
              </div>
              {total !== 100 && (
                <div className="mt-2 text-[10px] text-amber-300">Mix sums to {total}% — the rest is headroom for surges.</div>
              )}
              <div className="mt-3 text-[9px] text-slate-600">
                Simulated per-tier: {AI_ROOM.map((r) => `${r.tier.split(' ')[0]} $${simCost(r)}`).join(' · ')}
              </div>
            </div>
          </div>
        )}
      </SectionCard>
      <SectionCard id="admin-routing-rules" header={<SectionHeader title="Routing rules" subtitle="Task → tier. Effort score is the only user control." />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ROUTING_RULES.map((r) => (
            <div key={r.task} className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-950/40 border border-white/6">
              <span className="text-[11px] text-slate-300">{r.task}</span>
              <Badge color={r.tier.includes('Fast') ? 'green' : r.tier.includes('Balanced') ? 'blue' : 'purple'}>{r.tier}</Badge>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

/* ── COST INTELLIGENCE ────────────────────────────────────────────────────── */
function CostPanel() {
  const fc = COST_FORECAST;
  const demo = demoEnabled();
  if (!demo || !fc) return <EmptyState title="No cost data" />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          ['Current monthly', fc.currentMonthly, 'text-white'],
          ['Projected (trend)', fc.projected, 'text-amber-300'],
          ['Worst case', fc.worstCase, 'text-rose-300'],
        ].map(([label, val, cls]) => (
          <div key={label} className="clean-card p-5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
            <div className={`text-3xl font-bold font-mono mt-2 ${cls}`}>${val.toLocaleString()}</div>
            <div className="text-[10px] text-slate-600 mt-1">margin buffer {(fc.margin * 100).toFixed(0)}%</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard id="admin-cost-per-plan" header={<SectionHeader title="Cost per plan" subtitle="Where the money actually goes" />}>
          <div className="space-y-3">
            {fc.perPlan.map((p) => (
              <div key={p.plan} className="flex items-center gap-4">
                <span className="w-14 text-[11px] text-slate-300">{p.plan}</span>
                <div className="flex-1">
                  <Progress value={(p.cost / fc.currentMonthly) * 100} color="from-blue-500 to-cyan-400" />
                </div>
                <span className="text-[11px] font-mono text-slate-200 w-20 text-right">${p.cost}</span>
                <span className="text-[10px] text-slate-500 w-24 text-right font-mono">${p.costPerUser}/user</span>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard id="admin-cost-per-feature" header={<SectionHeader title="Cost per feature" subtitle="Runs × average operation cost" />}>
          <div className="space-y-3">
            {fc.perFeature.map((f) => (
              <div key={f.feature} className="flex items-center gap-4">
                <span className="w-32 text-[11px] text-slate-300 truncate">{f.feature}</span>
                <div className="flex-1">
                  <Progress value={(f.cost / fc.currentMonthly) * 100} color="from-purple-500 to-fuchsia-400" />
                </div>
                <span className="text-[10px] text-slate-500 w-14 text-right font-mono">{f.runs.toLocaleString()} runs</span>
                <span className="text-[11px] font-mono text-slate-200 w-16 text-right">${f.cost}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="flex items-center gap-2 p-4 rounded-xl bg-amber-500/8 border border-amber-500/20 text-[11px] text-amber-200">
        <TrendingUp className="w-3.5 h-3.5 shrink-0" /> {fc.weeklyTrend} — if it holds, projected hits ${fc.projected.toLocaleString()}.
      </div>
    </div>
  );
}

/* ── SYSTEM HEALTH ────────────────────────────────────────────────────────── */
function HealthPanel() {
  const demo = demoEnabled();
  const events = demo ? ADMIN_EVENTS : [];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {SYSTEM_STATUS.map((s) => (
          <div key={s.name} className="clean-card p-5 flex items-center gap-4">
            <StatusBadge status={s.status} pulse />
            <div>
              <div className="text-xs font-semibold text-white">{s.name}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{s.detail}</div>
            </div>
          </div>
        ))}
      </div>
      <SectionCard id="admin-incidents" header={<SectionHeader title="Recent incidents & signals" subtitle="From the event engine — admin visibility" />}>
        <Timeline
          items={events.slice(0, 6)}
          renderTitle={(e) => (
            <span className="text-slate-200">
              <span className="text-slate-400">{e.type.replace(/\./g, ' ')}</span>
              {e.metadata?.error ? <span className="text-rose-300"> — {e.metadata.error}</span> : null}
            </span>
          )}
          renderMeta={(e) => <span className="flex items-center gap-2"><StatusBadge status={e.status} />{timeAgo(e.timestamp)}</span>}
        />
      </SectionCard>
    </div>
  );
}

/* ── AUDIT LOG ────────────────────────────────────────────────────────────── */
function AuditPanel() {
  const demo = demoEnabled();
  return (
    <SectionCard id="admin-audit-log" header={<SectionHeader title="Audit log" subtitle="Every admin action, forever. Append-only." />}>
      {!demo || AUDIT_LOG.length === 0 ? <EmptyState title="No audit entries" /> : (
        <div className="space-y-1.5">
          {AUDIT_LOG.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-950/40 border border-white/6 text-[11px]">
              <span className="text-slate-300 font-semibold w-20 truncate shrink-0">{a.actor}</span>
              <span className="text-slate-200 flex-1">{a.action}</span>
              <span className="text-slate-500 font-mono text-[10px] hidden md:block">{a.target}</span>
              <span className="text-slate-600 text-[10px] shrink-0">{timeAgo(a.at)}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ── BROADCAST CENTER ─────────────────────────────────────────────────────── */
function BroadcastPanel() {
  const [subject, setSubject] = useState('Scheduled maintenance tonight 02:00–02:15');
  const [body, setBody] = useState('Helpotron will be briefly unavailable for scheduled maintenance tonight between 02:00 and 02:15. Your in-progress work is safe.');
  const [audience, setAudience] = useState('Everyone');
  const [sent, setSent] = useState(false);
  return (
    <SectionCard id="admin-broadcast" header={<SectionHeader title="Broadcast center" subtitle="One message, everyone who matters" />}>
      <div>
        <label className="block text-[10px] font-medium text-slate-400 mb-1.5">Audience</label>
        <div className="flex flex-wrap gap-1.5">
          {['Everyone', 'Elite plan', 'Pro plan', 'Beta testers', 'Flagged users'].map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAudience(a)}
              className={`px-3 py-1.5 rounded-lg text-[11px] transition cursor-pointer border ${
                audience === a ? 'bg-blue-600/20 text-blue-300 border-blue-500/40 font-semibold' : 'bg-white/4 text-slate-400 border-white/8 hover:text-slate-200'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-medium text-slate-400 mb-1.5">Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className="block text-[10px] font-medium text-slate-400 mb-1.5">Message</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={inputCls + ' resize-none'} />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => { setSent(true); setTimeout(() => setSent(false), 2500); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" /> Send broadcast
        </button>
        {sent && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[11px] text-emerald-300">✓ Queued for {audience} — estimated 1,284 recipients (demo)</motion.span>}
      </div>
      <div className="text-[9px] text-slate-600">Broadcasts are logged in the audit trail and appear in the notification center for every recipient.</div>
    </SectionCard>
  );
}

/* ── MAINTENANCE ──────────────────────────────────────────────────────────── */
function MaintenancePanel() {
  const [mode, setMode] = useState(MAINTENANCE.mode);
  const MODES = [
    ['normal', 'Normal', 'All systems serving traffic.', 'green'],
    ['maintenance', 'Maintenance', 'Users see a friendly banner; writes are paused.', 'amber'],
    ['read_only', 'Read only', 'Reads served, writes rejected.', 'amber'],
    ['degraded', 'Degraded', 'Fast tier only — heavy work is queued.', 'red'],
    ['emergency', 'Emergency', 'Everything off except status page.', 'red'],
  ];
  const [armed, setArmed] = useState(false);
  return (
    <SectionCard id="admin-maintenance" header={<SectionHeader title="Maintenance mode" subtitle="Control the platform's front door" />}>
      <div className="space-y-2">
        {MODES.map(([key, label, desc, tone]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`w-full text-left px-4 py-3 rounded-xl border transition cursor-pointer ${
              mode === key ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/6 bg-slate-950/40 hover:border-white/15'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${key === 'normal' ? 'bg-emerald-400' : key === 'emergency' ? 'bg-rose-500 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-xs font-semibold text-white">{label}</span>
              {mode === key && <Badge color="blue">selected</Badge>}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">{desc}</div>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        {mode !== 'normal' && !armed ? (
          <>
            <button type="button" onClick={() => setArmed(true)} className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold transition cursor-pointer">
              Enter {mode.replace('_', ' ')} mode
            </button>
            <span className="text-[10px] text-rose-300">This will disrupt users — confirm to continue.</span>
          </>
        ) : mode !== 'normal' && armed ? (
          <>
            <button type="button" onClick={() => { setMode('normal'); setArmed(false); }} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition cursor-pointer">
              Back to normal
            </button>
            <span className="text-[10px] text-emerald-300">Live — users are seeing the banner (demo).</span>
          </>
        ) : (
          <span className="text-[10px] text-slate-500">All clear — platform in normal mode.</span>
        )}
      </div>
    </SectionCard>
  );
}

/* ── SYSTEM MAP ───────────────────────────────────────────────────────────── */
function LiveSystemMap() {
  const demo = demoEnabled();
  const [active, setActive] = useState(null);
  const [mode, setMode] = useState('architecture'); // architecture | live | traffic | dependencies | errors | ai | data
  const [running, setRunning] = useState(demo ? ADMIN_EVENTS.filter((e) => e.status === 'running').length : 0);
  const statusColor = { operational: 'bg-emerald-400', warning: 'bg-amber-400', down: 'bg-rose-500', degraded: 'bg-amber-400' };
  const nodeTone = { operational: 'border-emerald-500/40 shadow-emerald-500/20', warning: 'border-amber-500/50 shadow-amber-500/25', down: 'border-rose-500/60 shadow-rose-500/30' };
  const levels = [0, 1, 2];
  return (
    <div className="space-y-5">
      <SectionCard id="admin-system-map" header={<SectionHeader title="Live system map" subtitle="The platform, one hop at a time. Click a node." />}>
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/40 p-1 rounded-lg border border-white/6 w-fit mb-4">
          {['architecture', 'live', 'traffic', 'dependencies', 'errors', 'ai', 'data'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`text-[10px] px-2.5 py-1 rounded-md capitalize transition-colors cursor-pointer ${
                mode === m ? 'bg-blue-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="mb-4 px-3 py-2 rounded-lg bg-blue-500/8 border border-blue-500/20 text-[10px] text-slate-400">
          {mode === 'architecture' && '7 operational layers — client, gateway, auth, orchestration, AI routing, data & storage, delivery. Click a node to inspect telemetry.'}
          {mode === 'traffic' && 'Request flow: SPA → gateway → auth → orchestrator → router → engine → storage. Traffic flows through the router to a tier, then to the queue.'}
          {mode === 'dependencies' && 'Runtime dependencies: SQLite (WAL), FSRS v5 engine, encrypted secret store. No external hard failures in the last 24h.'}
          {mode === 'errors' && 'Error surface: 0 5xx in the last hour, 2 failed automations, 1 flagged session awaiting review.'}
          {mode === 'ai' && 'AI routing: 5 effort tiers, policy-allowlisted engines only — deepseek-v4 flash/pro, gemini flash, NVIDIA cheap tier.'}
          {mode === 'data' && 'Data layer: 1,284 users, 18.2k assignments, 4.1k study materials, WAL checkpoint every 5 min.'}
          {mode === 'live' && 'Live telemetry refreshes each navigation — statuses below are the current snapshot.'}
        </div>
        {!demo ? <EmptyState title="Map unavailable" /> : (
          <div className="space-y-6">
            {levels.map((lv) => (
              <div key={lv} className="flex flex-wrap justify-center gap-4">
                {SYSTEM_MAP.filter((n) => n.level === lv).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setActive(active?.id === n.id ? null : n)}
                    className={`relative px-5 py-4 rounded-2xl border bg-slate-950/60 transition cursor-pointer animate-pulse-soft ${nodeTone[n.status] || nodeTone.operational}`}
                  >
                    <span className={`absolute top-2 right-2 w-2 h-2 rounded-full ${statusColor[n.status] || 'bg-slate-500'}`} />
                    <div className="text-xs font-bold text-white">{n.label}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">{Object.values(n.metrics).join(' · ')}</div>
                  </button>
                ))}
              </div>
            ))}
            <AnimatePresence>
              {active && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="p-4 rounded-xl bg-blue-500/8 border border-blue-500/25"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-white">
                    {active.label} <StatusBadge status={active.status} /> <span className="ml-auto text-[10px] text-slate-500 font-mono">{active.id}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    {Object.entries(active.metrics).map(([k, v]) => (
                      <div key={k} className="px-3 py-2 rounded-lg bg-slate-950/40 border border-white/6">
                        <div className="text-[9px] uppercase tracking-wider text-slate-600">{k}</div>
                        <div className="text-[11px] font-mono text-slate-200 mt-0.5">{v}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </SectionCard>
      <div className="flex items-center gap-2 text-[10px] text-slate-500 px-2">
        <span className={`w-2 h-2 rounded-full ${running ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'}`} />
        {running} jobs running right now · traffic flows through the router to a tier, then to the queue
      </div>
    </div>
  );
}

/* ── AI ADMIN ANALYST ─────────────────────────────────────────────────────── */
const ANALYST_ANSWERS = {
  'why did costs increase': 'Flagship tier usage is up 17% week-over-week — mostly longer research sessions on Elite users (8 more this week). Draft generation alone is 28% of platform cost. A spend simulator is available in the AI Control Room if you want to model moving research to a balanced default.',
  'what should i look at': 'Three things: (1) the 3 failed automations from the last hour — check the audit log, (2) GhostWriterX is flagged for possible academic abuse — review their sessions, (3) storage is at 82% — archive old transcriptions this week.',
  'how many users': '1,284 users today, 382 active right now. 130 on Elite, 342 on Pro, 812 on Basic. Elite users generate 40% of AI spend.',
  'are we making money': 'Today: $2,481 revenue against roughly $81 in direct AI spend — healthy margin. Watch the per-user cost: Elite averages $6.75/month, so 8,000-credit users can still lose money if they draft heavily.',
};

function AnalystPanel() {
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'I can read the platform — costs, users, incidents, experiments. Ask me anything, like “why did costs increase?”' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setBusy(true);
    setTimeout(() => {
      const q = text.toLowerCase();
      let reply = null;
      for (const [k, v] of Object.entries(ANALYST_ANSWERS)) if (q.includes(k)) { reply = v; break; }
      setMessages((m) => [...m, { role: 'ai', text: reply || 'I found no direct answer in the current data. Try “why did costs increase”, “what should i look at”, or “how many users”.' }]);
      setBusy(false);
    }, 1200);
  };

  return (
    <div style={{ height: 480 }}>
      <SectionCard id="admin-analyst" padding="p-0" className="flex flex-col overflow-hidden h-full" header={
        <div className="px-5 py-3.5 border-b border-white/8 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-semibold text-white">AI Admin Analyst</span>
          <Badge color="purple" className="ml-2">reads everything</Badge>
        </div>
      }>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-slate-950/60 border border-white/8 text-slate-200 rounded-bl-md'
            }`}>
              {m.role === 'ai' && <div className="text-[9px] text-slate-500 mb-1 font-semibold uppercase tracking-wider">✨ Analyst</div>}
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-slate-950/60 border border-white/8 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2 text-xs text-slate-400">
              <MessageSquare className="w-3.5 h-3.5 animate-pulse text-purple-400" /> Reading dashboards…
            </div>
          </div>
        )}
      </div>
      <div className="p-4 border-t border-white/8">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Ask about costs, users, incidents…"
            className="flex-1 clean-input px-4 py-2.5 text-xs outline-none"
            aria-label="Ask the AI admin analyst"
          />
          <button
            type="button"
            onClick={send}
            disabled={!input.trim() || busy}
            className="w-10 h-10 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 flex items-center justify-center transition cursor-pointer disabled:cursor-not-allowed"
            aria-label="Send"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    </SectionCard>
    </div>
  );
}

/* ── SHELL ────────────────────────────────────────────────────────────────── */
const PANELS = [
  { key: 'overview', label: 'Overview' },
  { key: 'agent', label: 'Admin Agent' },
  { key: 'flags', label: 'Flags' },
  { key: 'experiments', label: 'Experiments' },
  { key: 'airoom', label: 'AI Room' },
  { key: 'cost', label: 'Cost' },
  { key: 'health', label: 'Health' },
  { key: 'audit', label: 'Audit' },
  { key: 'broadcast', label: 'Broadcast' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'map', label: 'System Map' },
  { key: 'analyst', label: 'AI Analyst' },
];

export default function AdminPanels({ initialTab }) {
  const [tab, setTab] = useState(initialTab || 'overview');
  const setTabSafe = (t) => setTab(t);
  return (
    <div className="space-y-5">
      <Tabs tabs={PANELS} active={tab} onChange={setTabSafe} wrap />
      {tab === 'overview' && <AdminConsole onOpenPanel={setTabSafe} />}
      {tab === 'agent' && <AdminAgentChat />}
      {tab === 'flags' && <FlagsPanel />}
      {tab === 'experiments' && <ExperimentsPanel />}
      {tab === 'airoom' && <AIRoomPanel />}
      {tab === 'cost' && <CostPanel />}
      {tab === 'health' && <HealthPanel />}
      {tab === 'audit' && <AuditPanel />}
      {tab === 'broadcast' && <BroadcastPanel />}
      {tab === 'maintenance' && <MaintenancePanel />}
      {tab === 'map' && <LiveSystemMap />}
      {tab === 'analyst' && <AnalystPanel />}
      <div className="flex items-center gap-2 text-[9px] text-slate-600 px-1">
        <AlertTriangle className="w-3 h-3 text-amber-500/60" /> Admin mode is fully audited — every action lands in the audit log. Demo data only.
      </div>
    </div>
  );
}
