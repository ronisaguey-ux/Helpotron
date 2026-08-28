/* ────────────────────────────────────────────────────────────────────────────
 * AgentConfigsSidebar.jsx — CONFIGS sidebar (operator 08-28): one place to
 * SEE, ADD and SELECT every custom agent config — identity (personality +
 * instructions, editable inline with the same save path as the Identity
 * section), permanent memory entries, and files grouped by kind
 * (Personality / Rules / Skills / Automations).
 *
 * SELECT semantics everywhere: clicking a config (memory, file, identity)
 * loads it into the agent prompt box (via the handlers MyAgentView passes
 * in — useMemory / selectConfig / useFileInPrompt) so the user can
 * immediately talk to the agent about/with it.
 *
 * operator 08-28 (2nd pass):
 *  - header carries a visible Minimize control (onCollapse) that hides the
 *    whole panel — restore via the ⚙ Configs button in the chat header
 *  - each section (Identity / Memories / Files) has its own collapse
 *    header, persisted per section (same storage pattern as SectionCard)
 *
 * Pure presentation — all state and handlers live in MyAgentView
 * (thin integration, minimal risk).
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useRef, useState } from 'react';
import {
  SlidersHorizontal, User as UserIcon, Database, FileText, Send, Trash2, Plus, Upload,
  ChevronDown, ChevronLeft,
} from 'lucide-react';
import { Badge, timeAgo } from './ui/os.jsx';

/* Group display names used for the FILE_KINDS groups (personality stays
 * singular, everything else plural). */
const FILE_GROUP_LABELS = { skill: 'Skills', rule: 'Rules', automation: 'Automations', personality: 'Personality' };

const fmt = (n) => Number(n || 0).toLocaleString();

/* Small uppercase section header with its own collapse toggle — the app's
 * standard clean-card header styling, but collapsible inline. Collapse
 * state persists per section (localStorage, same shape as SectionCard). */
function CollapsibleSection({ name, icon, right, defaultOpen = true, children }) {
  const storageKey = `helpotron.collapse.agentcfg.${name}`;
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved === null ? defaultOpen : saved === '1';
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () => setOpen((o) => {
    const next = !o;
    try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch {}
    return next;
  });
  return (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? `Minimize ${name} section` : `Expand ${name} section`}
        className="w-full flex items-center justify-between gap-2 group cursor-pointer"
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 min-w-0 truncate group-hover:text-slate-300 transition">
          {icon}
          <span className="truncate">{name}</span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {right}
          <ChevronDown
            className={`w-3 h-3 text-slate-600 group-hover:text-slate-300 transition-transform ${open ? '' : '-rotate-90'}`}
          />
        </span>
      </button>
      {open && children}
    </div>
  );
}

export default function AgentConfigsSidebar({
  ai,
  memory,
  memoryText,
  setMemoryText,
  addMemory,
  deleteMemory,
  useMemory,
  files,
  fileKinds,
  handleUploadFile,
  openFile,
  deleteFile,
  useFileInPrompt,
  selectConfig,
  savePersonality,
  saveInstructions,
  onCollapse = () => {},
}) {
  /* Draft editors for identity — saved explicitly via the Save button
   * (same save path as the Identity section: set('ai.personality', …)).
   * Drafts re-sync whenever the saved value changes elsewhere. */
  const [personalityDraft, setPersonalityDraft] = useState(ai.personality || '');
  const [instructionsDraft, setInstructionsDraft] = useState(ai.instructions || '');
  useEffect(() => { setPersonalityDraft(ai.personality || ''); }, [ai.personality]);
  useEffect(() => { setInstructionsDraft(ai.instructions || ''); }, [ai.instructions]);

  const personalityActive = (personalityDraft || '') === (ai.personality || '');
  const instructionsActive = (instructionsDraft || '') === (ai.instructions || '');
  const identityActive = personalityActive && instructionsActive;

  /* One hidden file input per kind group — Add uploads AS that group's kind
   * (kindOverride), independent of the main Files section's kind selector. */
  const addFileRefs = useRef({});

  const totalConfigs = memory.length + files.length + 2; // + personality + instructions

  return (
    <div className="clean-card rounded-3xl border border-white/10 h-full flex flex-col overflow-hidden">
      {/* Header (sticky — body scrolls below) */}
      <div className="px-4 py-3.5 border-b border-white/8 flex items-center justify-between shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <SlidersHorizontal className="w-3 h-3 text-blue-400" /> Configs
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <Badge color="blue">{totalConfigs} items</Badge>
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Minimize configs panel"
            title="Minimize configs panel"
            className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/6 transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-6">

        {/* ── IDENTITY (personality + instructions) ─────────────────────── */}
        <CollapsibleSection
          name="Identity"
          icon={<UserIcon className="w-3 h-3 shrink-0" />}
          right={identityActive
            ? <span className="text-[9px] text-emerald-400 flex items-center gap-1 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active</span>
            : <Badge color="amber">Unsaved</Badge>}
        >

          {/* Readable rows — click = SELECT (load into the prompt box) */}
          <button
            type="button"
            onClick={() => selectConfig(ai.personality)}
            title="Load personality into the prompt box"
            className="w-full group flex items-start gap-2 p-2.5 rounded-xl bg-slate-950/40 border border-white/6 hover:border-blue-500/40 hover:bg-slate-950/70 transition cursor-pointer text-left"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-[9px] uppercase tracking-wider text-slate-600">Personality</span>
              <span className="block text-[11px] text-slate-200 leading-relaxed truncate">{ai.personality || '(none set)'}</span>
            </span>
            <Send className="w-3 h-3 self-center shrink-0 text-slate-500 group-hover:text-blue-400 transition" />
          </button>
          <button
            type="button"
            onClick={() => selectConfig(ai.instructions ? `instructions: ${ai.instructions}` : '')}
            title="Load instructions into the prompt box"
            className="w-full group flex items-start gap-2 p-2.5 rounded-xl bg-slate-950/40 border border-white/6 hover:border-blue-500/40 hover:bg-slate-950/70 transition cursor-pointer text-left"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-[9px] uppercase tracking-wider text-slate-600">Instructions</span>
              <span className="block text-[11px] text-slate-200 leading-relaxed truncate">{ai.instructions ? `instructions: ${ai.instructions}` : '(none set)'}</span>
            </span>
            <Send className="w-3 h-3 self-center shrink-0 text-slate-500 group-hover:text-blue-400 transition" />
          </button>

          {/* Inline editor — small textareas + Save (mirrors the Identity section path) */}
          <div className="space-y-3 pt-1">
            <div>
              <textarea
                rows={2}
                value={personalityDraft}
                onChange={(e) => setPersonalityDraft(e.target.value)}
                placeholder='Type it — e.g. "Calm tutor who checks understanding" or "Sarcastic"'
                aria-label="Agent personality (editable)"
                className="clean-input w-full px-3 py-2 text-[11px] outline-none resize-none"
              />
              <div className="flex items-center justify-end mt-1.5">
                {personalityActive ? (
                  <span className="text-[9px] text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Live</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => savePersonality(personalityDraft)}
                    className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-semibold transition cursor-pointer"
                  >
                    Save personality
                  </button>
                )}
              </div>
            </div>
            <div>
              <textarea
                rows={3}
                value={instructionsDraft}
                onChange={(e) => setInstructionsDraft(e.target.value)}
                placeholder="How should the agent behave? What should it always remember about how you work?"
                aria-label="Agent instructions (editable)"
                className="clean-input w-full px-3 py-2 text-[11px] outline-none resize-none"
              />
              <div className="flex items-center justify-end mt-1.5">
                {instructionsActive ? (
                  <span className="text-[9px] text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Live</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => saveInstructions(instructionsDraft)}
                    className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-semibold transition cursor-pointer"
                  >
                    Save instructions
                  </button>
                )}
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* ── MEMORIES ───────────────────────────────────────────────────── */}
        <CollapsibleSection
          name="Memories"
          icon={<Database className="w-3 h-3 shrink-0" />}
          right={<Badge color={memory.length ? 'blue' : 'slate'}>{memory.length}</Badge>}
        >
          <p className="text-[10px] text-slate-600 leading-relaxed">
            The agent always reads this. Click an entry to load it into your prompt box.
          </p>
          <div className="space-y-2">
            {memory.length === 0 && <div className="text-[11px] text-slate-600 py-2">No memories yet — teach your agent something.</div>}
            {memory.map((m) => (
              <div
                key={m.id}
                onClick={() => useMemory(m)}
                title="Select this memory — loads into your prompt"
                className="group flex items-start gap-2 p-3 rounded-xl bg-slate-950/40 border border-white/6 hover:border-blue-500/40 hover:bg-slate-950/70 transition cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-300 leading-relaxed">{m.text}</p>
                  <div className="text-[9px] text-slate-600 mt-1">{timeAgo(m.created_at)}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); useMemory(m); }}
                  aria-label="Load this memory into the prompt"
                  title="Load into prompt box"
                  className="p-1 text-slate-500 hover:text-blue-400 transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteMemory(m.id); }}
                  aria-label="Delete memory entry"
                  className="p-1 text-slate-600 hover:text-rose-400 transition cursor-pointer opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          {/* Add box (same as the permanent-memory card) */}
          <div className="flex gap-2">
            <input
              value={memoryText}
              onChange={(e) => setMemoryText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMemory()}
              placeholder="Add a memory…"
              aria-label="New memory entry"
              className="clean-input flex-1 px-3 py-2 text-[11px] outline-none"
            />
            <button
              type="button"
              onClick={addMemory}
              aria-label="Save memory"
              className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </CollapsibleSection>

        {/* ── FILES, grouped by kind (Personality / Rules / Skills / Automations) */}
        <CollapsibleSection
          name="Files"
          icon={<FileText className="w-3 h-3 shrink-0" />}
          right={<Badge color={files.length ? 'green' : 'slate'}>{files.length}</Badge>}
        >
          {fileKinds.map((k) => {
            const kindFiles = files.filter((f) => f.kind === k.key);
            const empty = kindFiles.length === 0;
            return (
              <div key={k.key} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-slate-300 flex items-center gap-1.5 min-w-0 truncate">
                    <span className="text-xs leading-none">{k.icon}</span>
                    <span className="truncate">{FILE_GROUP_LABELS[k.key] || `${k.label}s`}</span>
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge color={kindFiles.length ? 'blue' : 'slate'}>{kindFiles.length}</Badge>
                    <button
                      type="button"
                      onClick={() => addFileRefs.current[k.key]?.click()}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/4 border border-white/8 text-[9px] text-slate-400 hover:text-white hover:bg-white/8 transition cursor-pointer"
                      title={`Upload a ${k.label.toLowerCase()} file (.md/.txt/.json)`}
                    >
                      <Upload className="w-2.5 h-2.5" /> Add
                    </button>
                  </div>
                </div>
                <input
                  ref={(el) => { addFileRefs.current[k.key] = el; }}
                  type="file"
                  className="hidden"
                  onChange={(e) => handleUploadFile(e, k.key)}
                />
                {empty ? (
                  <div className="text-[10px] text-slate-600 py-1.5 leading-relaxed">{k.hint}</div>
                ) : (
                  <div className="space-y-1.5">
                    {kindFiles.map((f) => (
                      <div key={f.id} className="group flex items-center gap-1.5 p-2 rounded-xl bg-slate-950/40 border border-white/6 hover:border-blue-500/40 transition">
                        <button
                          type="button"
                          onClick={() => openFile(f)}
                          className="flex-1 min-w-0 text-left cursor-pointer"
                          title={`Read ${f.file_name}`}
                        >
                          <div className="text-[10px] text-slate-200 truncate hover:text-blue-300 transition">{f.file_name}</div>
                          <div className="text-[9px] text-slate-600">{fmt(f.size_bytes)} B · tap to read</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => useFileInPrompt(f)}
                          aria-label={`Load ${f.file_name} into the prompt`}
                          title="Load this file into the prompt box (SELECT)"
                          className="p-1 text-slate-500 hover:text-blue-400 transition cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteFile(f.id)}
                          aria-label={`Delete file ${f.file_name}`}
                          className="p-1 text-slate-600 hover:text-rose-400 transition cursor-pointer opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CollapsibleSection>

      </div>
    </div>
  );
}
