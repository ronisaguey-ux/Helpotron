/* ────────────────────────────────────────────────────────────────────────────
 * TodayView.jsx — the new home. Daily briefing, "what needs you" attention
 * list (assignment lifecycle), stat cards, recommendations and live activity.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useMemo } from 'react';
import { motion } from 'motion';
import { ArrowRight, CalendarClock, Sparkles } from 'lucide-react';
import {
  EVENTS, RECOMMENDATIONS, WEEK_STATS, SUBJECT_PROGRESS, demoEnabled,
  loadSettings, CALENDAR,
} from '../demoData.js';
import { StatCard, Badge, Progress, SectionHeader, Timeline, eventIcon, timeAgo, EmptyState } from './ui/os.jsx';
import SectionCard from './SectionCard.jsx';

const LIFECYCLE = ['CAPTURED', 'ANALYZING', 'MATERIALS FOUND', 'DRAFTING', 'REVIEW', 'READY', 'COMPLETED'];
const LIFECYCLE_STAGE = {
  tracked: 0, analyzing: 1, materials_ready: 2, drafting: 3, draft_ready: 4, draft_risky: 4, completed: 6,
};

function LifecycleStepper({ status }) {
  const stage = LIFECYCLE_STAGE[status] ?? 1;
  return (
    <div className="flex items-center gap-1 flex-wrap" aria-label={`Lifecycle stage: ${LIFECYCLE[stage]}`}>
      {LIFECYCLE.map((label, i) => (
        <React.Fragment key={label}>
          <span
            className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-wide ${
              i < stage ? 'bg-emerald-500/15 text-emerald-300'
                : i === stage ? 'bg-blue-500/20 text-blue-300'
                : 'bg-white/4 text-slate-600'
            }`}
          >
            {label}
          </span>
          {i < LIFECYCLE.length - 1 && <span className="text-slate-700 text-[8px]">›</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

const ATTENTION = [
  { id: 'a-1', title: 'Biology Lab Report', course: 'BIO 201', due: 'Today', status: 'draft_ready', progress: 87, hint: 'Draft ready for review' },
  { id: 'a-2', title: 'Calculus Problem Set', course: 'MATH 152', due: 'Tomorrow', status: 'tracked', progress: 30, hint: 'Materials missing — upload textbook excerpts' },
  { id: 'a-3', title: 'English Essay', course: 'ENG 210', due: 'Friday', status: 'drafting', progress: 42, hint: 'Draft in progress' },
];

export default function TodayView({ onGoTo, user }) {
  const settings = useMemo(() => loadSettings(), []);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = settings.profile.displayName || user?.public_id || 'there';
  const demo = demoEnabled();

  const attention = demo ? ATTENTION : [];
  const events = demo ? EVENTS.slice(0, 6) : [];
  const recs = demo ? RECOMMENDATIONS.slice(0, 3) : [];
  const stats = demo ? WEEK_STATS : [];
  const subjects = demo ? SUBJECT_PROGRESS : [];
  const dueToday = CALENDAR.filter((c) => c.kind === 'due' && !c.status?.startsWith('completed') && new Date(c.date).toDateString() === new Date().toDateString()).length;

  return (
    <div className="space-y-5">
      {/* ── Daily briefing ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <SectionCard
          id="today-briefing"
          header={
            <div className="relative z-10">
              <div className="text-2xl font-bold text-white">
                {greeting}, {name}.
              </div>
              <p className="text-sm text-slate-400 mt-1.5">
                Here’s what needs your attention.
              </p>
            </div>
          }
        >
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none" aria-hidden>
          <img src="/assets/hero_aurora.webp" alt="" className="w-full h-full object-cover opacity-35" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#090d16]/90 via-[#090d16]/30 to-transparent" />
        </div>
        <div className="absolute -top-24 -right-16 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="relative">
          {demo && (
            <ul className="mt-4 space-y-1.5 text-[13px]">
              <li className="text-slate-300">
                You have <strong className="text-white">{attention.length} assignments</strong> requiring attention
                {dueToday > 0 && <span className="text-slate-500"> — <strong className="text-amber-300">{dueToday} due today</strong></span>}.
              </li>
              <li className="text-slate-300">
                Your <strong className="text-white">Biology lab is 87% complete</strong> and the draft is ready to review.
              </li>
              <li className="text-slate-300">
                Your <strong className="text-white">English work</strong> is trending on schedule.
              </li>
              <li className="text-slate-300">
                You have <strong className="text-blue-300">{Number(user.credits ?? 10029).toLocaleString()} credits</strong> remaining.
              </li>
              <li className="text-amber-200/90">
                You haven’t studied <strong>Calculus in 4 days</strong>.
              </li>
            </ul>
          )}
        </div>
        </SectionCard>
      </motion.div>

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.length > 0 && stats.map((s, i) => (
          <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} delay={i * 0.05} />
        ))}
      </div>

      {/* ── Attention + Recommendations ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <SectionCard id="today-attention" className="xl:col-span-2" header={
          <SectionHeader
            title="Needs your attention"
            subtitle="Things that are waiting on you"
            right={<button type="button" onClick={() => onGoTo('history')} className="flex items-center gap-1 text-[11px] text-blue-300 hover:text-blue-200 transition cursor-pointer">All assignments <ArrowRight className="w-3 h-3" /></button>}
          />
        }>
          {attention.length === 0 ? (
            <EmptyState
              title="Your workspace is clear"
              body="No assignments need your attention right now."
              actionLabel="Create Assignment"
              onAction={() => onGoTo('history')}
            />
          ) : (
            <div className="space-y-3">
              {attention.map((a) => (
                <div key={a.id} className="p-4 rounded-xl bg-slate-950/40 border border-white/6 hover:border-blue-500/25 transition group">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white group-hover:text-blue-200 transition">{a.title}</span>
                        <Badge color="blue">{a.course}</Badge>
                        <Badge color="amber"><CalendarClock className="w-3 h-3 mr-1 inline" />{a.due}</Badge>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">{a.hint}</div>
                    </div>
                    <Badge color={a.status === 'draft_ready' ? 'green' : 'slate'}>{a.progress}%</Badge>
                  </div>
                  <div className="mt-3">
                    <LifecycleStepper status={a.status} />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Progress value={a.progress} className="flex-1" pulse={a.status === 'draft_ready'} />
                    <button
                      type="button"
                      onClick={() => onGoTo('ai-workspace')}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition cursor-pointer"
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Recommendations */}
        <SectionCard id="today-recommendations" header={
          <SectionHeader
            title="What should I do?"
            subtitle="Decided for you, based on your progress"
            right={<Sparkles className="w-4 h-4 text-purple-400" />}
          />
        }>
          {recs.length === 0 ? (
            <EmptyState
              title="No recommendations yet"
              body="Complete an assignment to start getting recommendations."
              actionLabel="Browse library"
              onAction={() => onGoTo('library')}
            />
          ) : (
            <div className="space-y-3">
              {recs.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="p-3.5 rounded-xl bg-slate-950/40 border border-white/6 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{r.icon}</span>
                    <span className="text-xs font-semibold text-white">{r.title}</span>
                    <Badge color={r.priority === 'high' ? 'red' : 'amber'} className="ml-auto">{r.priority}</Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{r.body}</p>
                  <button
                    type="button"
                    onClick={() => onGoTo(r.target)}
                    className="text-[11px] font-semibold text-blue-300 hover:text-blue-200 transition cursor-pointer"
                  >
                    {r.action} →
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Subject snapshot + Recent activity ──────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <SectionCard id="today-subject-snapshot" header={
          <SectionHeader
            title="Subject snapshot"
            subtitle="Strength across your courses"
            right={<button type="button" onClick={() => onGoTo('progress')} className="flex items-center gap-1 text-[11px] text-blue-300 hover:text-blue-200 transition cursor-pointer">Full progress <ArrowRight className="w-3 h-3" /></button>}
          />
        }>
          {subjects.length === 0 ? (
            <EmptyState title="No subject data yet" />
          ) : (
            <div className="space-y-4">
              {subjects.map((s) => (
                <div key={s.subject}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-300 font-medium">{s.subject}</span>
                    <span className="text-slate-500 font-mono">
                      {s.score}% <span className={s.trend.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}>{s.trend}</span>
                    </span>
                  </div>
                  <Progress value={s.score} color={s.score >= 80 ? 'from-emerald-500 to-teal-500' : s.score >= 70 ? 'from-amber-500 to-orange-500' : 'from-rose-500 to-red-500'} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard id="today-activity" header={
          <SectionHeader
            title="Recent activity"
            subtitle="Latest events across your workspace"
            right={<button type="button" onClick={() => onGoTo('activity')} className="flex items-center gap-1 text-[11px] text-blue-300 hover:text-blue-200 transition cursor-pointer">All activity <ArrowRight className="w-3 h-3" /></button>}
          />
        }>
          <Timeline
            items={events}
            renderIcon={(e) => {
              const { icon, cls } = eventIcon(e.type);
              return <span className={`w-[18px] h-[18px] rounded-full border flex items-center justify-center text-[9px] ${cls}`}>{icon}</span>;
            }}
            renderTitle={(e) => (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-200 font-medium">{e.metadata?.title || e.type}</span>
                <span className="text-[10px] text-slate-600">{timeAgo(e.timestamp)}</span>
              </div>
            )}
            renderMeta={(e) => <div className="text-[10px] text-slate-500 mt-0.5">{e.type.replace('.', ' · ')}</div>}
          />
        </SectionCard>
      </div>
    </div>
  );
}
