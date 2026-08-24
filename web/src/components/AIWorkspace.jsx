// export target: web/src/components/AIWorkspace.jsx
/* ────────────────────────────────────────────────────────────────────────────
 * AIWorkspace.jsx — the killer interface: one place where AI work happens.
 * Left: materials. Center: conversation/output. Right: context & controls.
 * Includes "Ask Helpotron" (the AI explains the app) and the live AI status.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion';
import { Send, Paperclip, Loader2, Sparkles, ShieldCheck, Bot, Undo2, History, FileText } from 'lucide-react';
import { LIBRARY, demoEnabled, loadSettings, EFFORT_SCORES } from '../demoData.js';
import { Badge, Progress, EmptyState } from './ui/os.jsx';
import SectionCard from './SectionCard.jsx';

const ACTIVE_ASSIGNMENT = { title: 'Biology Lab Report', course: 'BIO 201', status: 'draft_ready', progress: 87 };

const CONTEXT = {
  rubric: 'APA format · ≥6 sources · hypothesis + analysis sections',
  sources: 3,
  documents: 2,
  drafts: 1,
};

const INITIAL_EXCHANGE = [
  {
    role: 'ai',
    text: 'I’ve analyzed your rubric, 3 source documents and your lecture notes. The draft is ready — it argues that mitochondria have a dual role in energy production and apoptosis, grounded in the sources you provided.',
  },
];

const ASK_ANSWERS = {
  'why is this assignment taking so long': 'The system found 3 source documents and is currently comparing citations against your rubric. Estimated completion: 2 minutes.',
  'how does the effort setting work': 'Your AI Effort controls which engine does your work: Low effort routes mechanical tasks (OCR, transcription, flashcards) to the fast, cheap engine; High effort sends complex reasoning and research to the flagship engine. You can change it anytime in Settings → AI & Intelligence.',
  'what is atlas': `${loadSettings().ai.aiName || 'Atlas'} is your personal AI — a coach tuned to your academic profile. You can rename it and set its personality in Settings → AI & Intelligence.`,
  'how many credits does this cost': 'This workspace session is charged per operation. The current draft generation cost 84 credits — open your Credit Wallet and tap the row to see the exact breakdown (engine, tokens, rate).',
};

export function AIWorkspace({ userId, onExecuteAction, onRollbackAction }) {
  const demo = demoEnabled();
  const settings = loadSettings();
  const [messages, setMessages] = useState(INITIAL_EXCHANGE);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(87);
  const [selectedFile, setSelectedFile] = useState(demo ? LIBRARY[0]?.id : null);
  const [askOpen, setAskOpen] = useState(false);
  // Autonomy spectrum: suggestion → ask → routine (trusted) → autonomous
  const [autonomyLevel, setAutonomyLevel] = useState('routine');
  // Action Ledger: every executed agent action lands here for undo.
  const [actionLedger, setActionLedger] = useState([]);
  const [activeArtifacts, setActiveArtifacts] = useState([]);
  const scrollRef = useRef(null);

  const rollbackAction = (id) => {
    if (onRollbackAction) { onRollbackAction(id); return; }
    setActionLedger((l) => l.filter((a) => a.id !== id));
    setMessages((m) => [...m, { role: 'ai', text: 'Action rolled back — the previous state has been restored.' }]);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setBusy(true);

    // Live processing indicator with progress animation, then a canned-but-relevant reply.
    let p = progress;
    const timer = setInterval(() => {
      p = Math.min(98, p + 4 + Math.random() * 6);
      setProgress(p);
    }, 350);

    setTimeout(() => {
      clearInterval(timer);
      const q = text.toLowerCase();
      let reply;
      if (q.startsWith('/ask')) {
        const inner = q.replace('/ask', '').trim();
        reply = ASK_ANSWERS[inner] || 'I can explain anything about Helpotron — try “Why is this assignment taking so long?” or “How does the effort setting work?”';
      } else if (q.includes('draft')) {
        reply = 'Here’s the updated draft section:\n\n**2.1 Dual role of mitochondria**\nMitochondria generate ATP via oxidative phosphorylation while simultaneously orchestrating programmed cell death through cytochrome c release. Both functions are supported by your sources (Krebs 2021; Alvarez 2022) and align with the rubric’s requirement for mechanistic explanation.\n\nWant me to tighten the conclusion next?';
      } else if (q.includes('source') || q.includes('cite')) {
        reply = 'Citation check complete: 6 of 6 rubric-required sources are cited in the draft. Source 4 (Mitochondrial Dynamics Review) is used twice — I can consolidate it if you prefer.';
      } else {
        reply = 'Got it. I’ve incorporated that into the working draft — the next run will regenerate the affected sections and verify them against the rubric.';
      }
      setMessages((m) => [...m, { role: 'ai', text: reply }]);
      setProgress(100);
      // Every executed action is recorded in the Action Ledger (undoable).
      setActionLedger((l) => [
        { id: Date.now(), description: `Updated ${ACTIVE_ASSIGNMENT.title} — ${text.slice(0, 42)}`, role: 'agent' },
        ...l,
      ].slice(0, 8));
      setActiveArtifacts((a) => [{ name: 'draft_section_2.1.md', kind: 'document' }, ...a].slice(0, 6));
      setTimeout(() => setProgress(ACTIVE_ASSIGNMENT.progress), 600);
      setBusy(false);
    }, 2000);
  };

  if (!demo) {
    return (
      <EmptyState
        icon="🧠"
        title="AI Workspace is empty"
        body="Open an assignment with materials to start working in the workspace."
        actionLabel="Open assignments"
      />
    );
  }

  const files = LIBRARY;
  const effortLabel = { low: 'Low effort', balanced: 'Balanced effort', high: 'High effort' }[settings.ai.effort] || 'Balanced effort';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_260px] gap-4" style={{ minHeight: 560 }}>
      {/* ── Left: Materials ─────────────────────────────────────────────── */}
      <SectionCard id="ai-materials" padding="p-4" className="flex flex-col space-y-3" header={<div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Materials</div>}>
        {files.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSelectedFile(f.id)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition cursor-pointer ${
              selectedFile === f.id ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/6 bg-slate-950/40 hover:border-white/15'
            }`}
          >
            <span className="text-base">{f.kind === 'pdf' ? '📕' : f.kind === 'audio' ? '🎧' : f.kind === 'image' ? '🖼️' : '📘'}</span>
            <span className="min-w-0">
              <span className="block text-[11px] text-slate-200 truncate">{f.name}</span>
              <span className="block text-[9px] text-slate-500">{f.size}</span>
            </span>
          </button>
        ))}
        <button type="button" className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-dashed border-white/15 text-[11px] text-slate-400 hover:text-slate-200 hover:border-blue-500/40 transition cursor-pointer mt-auto">
          <Paperclip className="w-3.5 h-3.5" /> Add files
        </button>
      </SectionCard>

      {/* ── Center: Conversation ────────────────────────────────────────── */}
      <SectionCard id="ai-conversation" padding="p-0" className="flex flex-col overflow-hidden" header={
        <div className="px-5 py-3.5 border-b border-white/8 flex items-center gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">{ACTIVE_ASSIGNMENT.title}</div>
            <div className="text-[10px] text-slate-500">{ACTIVE_ASSIGNMENT.course} · draft generation session</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge color={settings.ai.effort === 'low' ? 'green' : settings.ai.effort === 'high' ? 'purple' : 'blue'}>{effortLabel}</Badge>
            <Badge color="slate">✨ {settings.ai.aiName || 'Atlas'}</Badge>
          </div>
        </div>
      }>

        {/* Autonomy Level Spectrum */}
        <div className="px-5 py-2.5 border-b border-white/8 flex items-center gap-2 bg-slate-950/40">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/80" />
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Autonomy:</span>
          {['suggestion', 'ask', 'routine', 'autonomous'].map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setAutonomyLevel(level)}
              className={`text-[10px] px-2.5 py-1 rounded-md capitalize transition-colors cursor-pointer ${
                autonomyLevel === level
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {level === 'routine' ? 'Trusted' : level}
            </button>
          ))}
          <span className="ml-auto text-[9px] text-slate-600">{autonomyLevel === 'autonomous' ? 'Agent executes without asking' : autonomyLevel === 'routine' ? 'Trusted routine actions run automatically' : `Agent ${autonomyLevel}s before acting`}</span>
        </div>

        {/* AI status bar */}
        <div className="px-5 py-3 bg-slate-950/40 border-b border-white/6">
          <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-1.5">
            <span className={`w-2 h-2 rounded-full ${busy ? 'bg-blue-400 animate-pulse' : 'bg-emerald-400'}`} />
            <span>{busy ? `Processing — ${Math.round(progress)}%` : 'Idle — ready when you are'}</span>
            <span className="ml-auto font-mono">{progress}%</span>
          </div>
          <Progress value={progress} pulse={busy} color={busy ? 'from-blue-500 to-cyan-400' : 'from-emerald-500 to-teal-400'} />
          <div className="flex gap-4 mt-2 text-[10px] text-slate-500">
            <span>{CONTEXT.sources} sources found</span>
            <span>{CONTEXT.documents} documents analyzed</span>
            <span>{CONTEXT.drafts} draft generated</span>
          </div>
        </div>

        {/* Action Ledger & Undo Ribbon */}
        {actionLedger.length > 0 && (
          <div className="border-b border-white/8">
            <div className="px-5 py-2.5 bg-slate-950/40 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[10px] min-w-0">
                <History className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="font-semibold text-slate-300 whitespace-nowrap">Action Ledger</span>
                <span className="text-slate-500 truncate">{actionLedger[0].description}</span>
              </div>
              <button
                type="button"
                onClick={() => rollbackAction(actionLedger[0].id)}
                className="flex items-center gap-1 text-[10px] font-medium text-rose-400 hover:text-rose-300 hover:underline whitespace-nowrap cursor-pointer"
              >
                <Undo2 className="w-3 h-3" /> Undo Action
              </button>
            </div>
            {activeArtifacts.length > 0 && (
              <div className="px-5 py-1.5 flex items-center gap-3 overflow-x-auto">
                {activeArtifacts.map((a, i) => (
                  <span key={i} className="flex items-center gap-1 text-[9px] text-slate-500 whitespace-nowrap">
                    <FileText className="w-2.5 h-2.5 text-emerald-400/70" /> {a.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ maxHeight: 420 }}>
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-slate-950/60 border border-white/8 text-slate-200 rounded-bl-md'
                }`}>
                  {m.role === 'ai' && <div className="text-[9px] text-slate-500 mb-1 font-semibold uppercase tracking-wider">✨ {settings.ai.aiName || 'Atlas'}</div>}
                  {m.text}
                </div>
              </motion.div>
            ))}
            {busy && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="bg-slate-950/60 border border-white/8 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                  {settings.ai.aiName || 'Atlas'} is working…
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Composer */}
        <div className="p-4 border-t border-white/8">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Generate a draft, check citations, explain the process…"
              className="flex-1 clean-input px-4 py-2.5 text-xs outline-none"
              aria-label="Message the AI workspace"
            />
            <button
              type="button"
              onClick={send}
              disabled={!input.trim() || busy}
              className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 flex items-center justify-center transition cursor-pointer disabled:cursor-not-allowed"
              aria-label="Send"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 text-[9px] text-slate-600">
            <span>Type <code className="text-slate-400">/ask</code> to ask Helpotron about itself — e.g. <code className="text-slate-400">/ask why is this assignment taking so long</code></span>
            <span className="hidden sm:block">Enter to send</span>
          </div>
        </div>
      </SectionCard>

      {/* ── Right: Context ──────────────────────────────────────────────── */}
      <div className="clean-card p-4 flex flex-col space-y-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Assignment</div>
          <div className="p-3 rounded-xl bg-slate-950/40 border border-white/6 space-y-1.5">
            <div className="text-xs font-semibold text-white">{ACTIVE_ASSIGNMENT.title}</div>
            <div className="text-[10px] text-slate-500">{ACTIVE_ASSIGNMENT.course}</div>
            <Badge color={ACTIVE_ASSIGNMENT.status === 'draft_ready' ? 'green' : 'amber'}>{ACTIVE_ASSIGNMENT.status.replace('_', ' ')}</Badge>
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Rubric</div>
          <div className="p-3 rounded-xl bg-slate-950/40 border border-white/6 text-[10px] text-slate-400 leading-relaxed">
            {CONTEXT.rubric}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Sources</div>
          <div className="space-y-1.5">
            {LIBRARY.slice(0, 3).map((f) => (
              <div key={f.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950/40 border border-white/6">
                <span className="text-xs">📄</span>
                <span className="text-[10px] text-slate-300 truncate flex-1">{f.name}</span>
                <Badge color="green">✓</Badge>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Engine</div>
          <div className="p-3 rounded-xl bg-slate-950/40 border border-white/6 flex items-center justify-between">
            <span className="text-[11px] text-slate-300">{effortLabel}</span>
            <Badge color="blue">auto-routed</Badge>
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Trust</div>
          <button
            type="button"
            onClick={() => setAskOpen(!askOpen)}
            className="w-full p-3 rounded-xl bg-blue-500/10 border border-blue-500/25 text-left transition hover:bg-blue-500/15 cursor-pointer"
          >
            <div className="flex items-center gap-2 text-[11px] font-semibold text-blue-300">
              <Sparkles className="w-3.5 h-3.5" /> Ask Helpotron
            </div>
            <div className="text-[9px] text-slate-500 mt-1 leading-relaxed">Why is this assignment taking so long? How does effort routing work?</div>
          </button>
        </div>

        <div className="mt-auto flex items-center gap-1.5 text-[9px] text-slate-600">
          <ShieldCheck className="w-3 h-3 text-emerald-500/70" />
          Your materials are only used to generate your own study work.
        </div>
      </div>
    </div>
  );
}

export default AIWorkspace;

