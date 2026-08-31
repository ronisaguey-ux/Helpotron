/* ────────────────────────────────────────────────────────────────────────────
 * AgentConfigsSidebar.jsx — Comprehensive Agent Configuration Manager
 * Provides full ADD, DELETE, and SELECT / ACTIVATE controls for:
 *   1. Identities & Personas (Presets + Custom created personas)
 *   2. Skills & Capabilities (Presets + Custom prompt templates + Uploads)
 *   3. Permanent Memories (Facts, study goals, deadlines)
 *   4. Rules & Automations (Uploaded rule files, automated triggers)
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useRef } from 'react';
import {
  SlidersHorizontal, User as UserIcon, Database, FileText, Send, Trash2, Plus,
  Upload, ChevronDown, ChevronRight, ChevronLeft, Sparkles, Check, BookOpen, Cpu, Wand2, Edit3,
  Layers, Bot, X
} from 'lucide-react';
import { Badge, timeAgo } from './ui/os.jsx';

export const DEFAULT_IDENTITIES = [];
export const DEFAULT_SKILLS = [];

const fmt = (n) => Number(n || 0).toLocaleString();

export default function AgentConfigsSidebar({
  ai = {},
  identities = [],
  activeIdentityId = null,
  onSelectIdentity = () => {},
  onAddIdentity = () => {},
  onUpdateIdentity = () => {},
  onDeleteIdentity = () => {},
  onSaveAgentName = () => {},
  skills = [],
  activeSkillIds = [],
  onToggleSkill = () => {},
  onAddSkill = () => {},
  onUpdateSkill = () => {},
  onDeleteSkill = () => {},
  onSelectSkill = () => {},
  memory = [],
  memoryText = '',
  setMemoryText = () => {},
  addMemory = () => {},
  onUpdateMemory = () => {},
  deleteMemory = () => {},
  useMemory = () => {},
  files = [],
  fileKinds = [],
  handleUploadFile = () => {},
  openFile = () => {},
  deleteFile = () => {},
  useFileInPrompt = () => {},
  selectConfig = () => {},
  savePersonality = () => {},
  saveInstructions = () => {},
  onCollapse = () => {},
}) {
  const [activeTab, setActiveTab] = useState('identities'); // 'identities' | 'skills' | 'memories' | 'files'

  const [agentNameInput, setAgentNameInput] = useState(ai.aiName || 'Atlas');
  const [nameSavedFeedback, setNameSavedFeedback] = useState(false);
  const [expandedIds, setExpandedIds] = useState({});

  // Editing state for existing items
  const [editingIdentity, setEditingIdentity] = useState(null); // { id, name, icon, persona, instructions }
  const [editingSkill, setEditingSkill] = useState(null); // { id, name, icon, category, description, promptTemplate }
  const [editingMemoryId, setEditingMemoryId] = useState(null);
  const [editingMemoryText, setEditingMemoryText] = useState('');

  const toggleExpand = (id) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Modal / Inline creator states
  const [showNewIdentityModal, setShowNewIdentityModal] = useState(false);
  const [newIdName, setNewIdName] = useState('');
  const [newIdIcon, setNewIdIcon] = useState('🧠');
  const [newIdInstructions, setNewIdInstructions] = useState('');

  const [showNewSkillModal, setShowNewSkillModal] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillIcon, setNewSkillIcon] = useState('⚡');
  const [newSkillTemplate, setNewSkillTemplate] = useState('');

  const fileInputRef = useRef(null);
  const [uploadKind, setUploadKind] = useState('skill');

  const handleCreateIdentity = (e) => {
    e?.preventDefault();
    if (!newIdName.trim()) return;
    const newId = {
      id: `custom_id_${Date.now()}`,
      name: newIdName.trim(),
      icon: newIdIcon || '🧠',
      persona: newIdName.trim(),
      instructions: newIdInstructions.trim() || 'Provide helpful and customized assistance.',
      isBuiltin: false,
    };
    onAddIdentity(newId);
    setNewIdName('');
    setNewIdInstructions('');
    setShowNewIdentityModal(false);
  };

  const handleSaveEditIdentity = (e) => {
    e?.preventDefault();
    if (!editingIdentity?.id || !editingIdentity.name.trim()) return;
    onUpdateIdentity({
      ...editingIdentity,
      name: editingIdentity.name.trim(),
      icon: editingIdentity.icon || '🧠',
      persona: editingIdentity.name.trim(),
      instructions: editingIdentity.instructions.trim(),
    });
    setEditingIdentity(null);
  };

  const handleCreateSkill = (e) => {
    e?.preventDefault();
    if (!newSkillName.trim()) return;
    const newSk = {
      id: `custom_sk_${Date.now()}`,
      name: newSkillName.trim(),
      icon: newSkillIcon || '⚡',
      category: 'skill',
      description: newSkillName.trim(),
      promptTemplate: newSkillTemplate.trim() || `${newSkillName}:\n`,
      isBuiltin: false,
    };
    onAddSkill(newSk);
    setNewSkillName('');
    setNewSkillTemplate('');
    setShowNewSkillModal(false);
  };

  const handleSaveEditSkill = (e) => {
    e?.preventDefault();
    if (!editingSkill?.id || !editingSkill.name.trim()) return;
    onUpdateSkill({
      ...editingSkill,
      name: editingSkill.name.trim(),
      icon: editingSkill.icon || '⚡',
      description: editingSkill.name.trim(),
      promptTemplate: editingSkill.promptTemplate.trim(),
    });
    setEditingSkill(null);
  };

  const allIdentities = identities || [];
  const allSkills = skills || [];

  return (
    <div className="panel h-full flex flex-col overflow-hidden bg-[var(--bg-base)]">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[var(--accent)]" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-white">Agent Configurations</h2>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="p-1 rounded-md text-[var(--text-muted)] hover:text-white hover:bg-white/5 transition cursor-pointer"
          title="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Agent configuration sections"
        className="flex items-center border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 pt-1 gap-1 shrink-0 overflow-x-auto"
      >
        {/* Real icons rather than emoji: emoji render at inconsistent widths
         * across platforms (which is part of why this row overflowed) and
         * carry no accessible meaning. */}
        {[
          { key: 'identities', label: 'Identities', Icon: UserIcon, count: allIdentities.length },
          { key: 'skills', label: 'Skills', Icon: Cpu, count: allSkills.length },
          { key: 'memories', label: 'Memories', Icon: Database, count: memory.length },
          { key: 'files', label: 'Rules & Files', Icon: FileText, count: files.length },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            aria-selected={activeTab === t.key}
            role="tab"
            className={`flex items-center gap-1.5 px-2 py-2 text-xs font-medium border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === t.key
                ? 'border-[var(--accent)] text-white font-semibold'
                : 'border-transparent text-[var(--text-muted)] hover:text-slate-200'
            }`}
          >
            <t.Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{t.label}</span>
            {/* A "0" badge is noise on every empty tab, and four of them are
             * what pushed this row past the panel width. Show a count only
             * when there is something to count. */}
            {t.count > 0 && (
              <span className="text-[10px] opacity-70 px-1 rounded-full bg-white/5 font-mono">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* ── TAB 1: IDENTITIES ─────────────────────────────────────────── */}
        {activeTab === 'identities' && (
          <div className="space-y-4">
            {/* Customize Agent Display Name */}
            <div className="p-3.5 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>🏷️</span> Agent Display Name
                </label>
                {nameSavedFeedback && (
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 animate-fadeIn">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={agentNameInput}
                  onChange={(e) => setAgentNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onSaveAgentName(agentNameInput.trim() || 'Atlas');
                      setNameSavedFeedback(true);
                      setTimeout(() => setNameSavedFeedback(false), 2000);
                    }
                  }}
                  placeholder="e.g. Atlas, Socrates, JARVIS"
                  /* min-w-0: without it the input keeps its intrinsic
                   * placeholder width and shoves Save Name out of the panel
                   * once this renders in the narrower docked column. */
                  className="clean-input flex-1 min-w-0 px-3 py-1.5 text-xs text-white outline-none rounded-[var(--radius-sm)]"
                />
                <button
                  type="button"
                  onClick={() => {
                    onSaveAgentName(agentNameInput.trim() || 'Atlas');
                    setNameSavedFeedback(true);
                    setTimeout(() => setNameSavedFeedback(false), 2000);
                  }}
                  className="px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition cursor-pointer shrink-0"
                >
                  Save Name
                </button>
              </div>
            </div>

            <div className="flex items-start justify-between gap-3 pt-1">
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-white">Agent Identities</h3>
                <p className="text-[11px] text-[var(--text-muted)]">Select an active persona or expand to view details.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewIdentityModal(true)}
                className="shrink-0 whitespace-nowrap px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] text-xs font-semibold flex items-center gap-1 transition cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Add Identity
              </button>
            </div>

            <div className="space-y-2">
              {allIdentities.length === 0 && (
                <div className="p-8 text-center border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-md)] space-y-2">
                  <div className="text-2xl">🎭</div>
                  <div className="text-xs font-semibold text-white">No custom identities yet</div>
                  <p className="text-[11px] text-[var(--text-muted)] max-w-xs mx-auto">
                    Create your own agent persona with custom instructions, tone, and traits.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowNewIdentityModal(true)}
                    className="mt-2 px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] transition cursor-pointer"
                  >
                    + Create Persona
                  </button>
                </div>
              )}
              {allIdentities.map((item) => {
                const isActive = activeIdentityId === item.id || (ai.personality === item.persona && ai.instructions === item.instructions);
                const isExpanded = !!expandedIds[item.id];
                return (
                  <div
                    key={item.id}
                    className={`rounded-[var(--radius-md)] border transition overflow-hidden ${
                      isActive
                        ? 'border-[rgba(139,92,246,0.5)] bg-[var(--accent-subtle)] shadow-sm'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-white/20'
                    }`}
                  >
                    {/* Compact Header Row */}
                    <div className="p-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.id)}
                        className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer"
                      >
                        <span className="text-[var(--text-muted)] hover:text-white transition">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </span>
                        <span className="text-lg">{item.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-white truncate">{item.name}</h4>
                            {isActive && (
                              <span className="chip chip-accent text-[9px] flex items-center gap-1 font-bold">
                                <Check className="w-2.5 h-2.5" /> Active
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onSelectIdentity(item)}
                          disabled={isActive}
                          className={`px-2.5 py-1 rounded-[var(--radius-sm)] text-[11px] font-semibold transition cursor-pointer ${
                            isActive
                              ? 'bg-[var(--accent)] text-white opacity-80 cursor-default'
                              : 'bg-white/5 hover:bg-[var(--accent)] hover:text-white text-slate-200 border border-white/10'
                          }`}
                        >
                          {isActive ? 'Active' : 'Select'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditingIdentity({ ...item }); }}
                          className="p-1.5 rounded text-[var(--text-muted)] hover:text-amber-300 hover:bg-amber-500/10 transition cursor-pointer border border-transparent hover:border-amber-500/20"
                          title="Edit identity"
                          aria-label={`Edit ${item.name}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDeleteIdentity(item.id); }}
                          className="p-1.5 rounded text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer border border-transparent hover:border-rose-500/20"
                          title="Delete identity"
                          aria-label={`Delete ${item.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        </button>
                      </div>
                    </div>

                    {/* Expandable Details */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-white/5 bg-black/20 text-xs animate-fadeIn">
                        {item.instructions && (
                          <div>
                            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-0.5">System Instructions</span>
                            <div className="p-2 rounded bg-black/30 border border-white/5 text-[10px] text-slate-300 font-mono whitespace-pre-wrap">
                              {item.instructions}
                            </div>
                          </div>
                        )}
                        <div className="pt-1 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingIdentity({ ...item })}
                            className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-200 text-[11px] font-medium transition cursor-pointer flex items-center gap-1 border border-white/10"
                          >
                            <Edit3 className="w-3 h-3" /> Edit Identity
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB 2: SKILLS ─────────────────────────────────────────────── */}
        {activeTab === 'skills' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-white">Skills & Capabilities</h3>
                <p className="text-[11px] text-[var(--text-muted)]">Select, apply to prompt, or expand to edit blueprint.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewSkillModal(true)}
                  className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Skill
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {allSkills.length === 0 && (
                <div className="p-8 text-center border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-md)] space-y-2">
                  <div className="text-2xl">⚡</div>
                  <div className="text-xs font-semibold text-white">No custom skills yet</div>
                  <p className="text-[11px] text-[var(--text-muted)] max-w-xs mx-auto">
                    Build prompt blueprints and automated capabilities tailored to your workflow.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowNewSkillModal(true)}
                    className="mt-2 px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] transition cursor-pointer"
                  >
                    + Create Skill
                  </button>
                </div>
              )}
              {allSkills.map((sk) => {
                const isSelected = activeSkillIds.includes(sk.id);
                const isExpanded = !!expandedIds[sk.id];
                return (
                  <div
                    key={sk.id}
                    className={`rounded-[var(--radius-md)] border transition overflow-hidden ${
                      isSelected
                        ? 'border-[rgba(139,92,246,0.4)] bg-[var(--accent-subtle)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-white/20'
                    }`}
                  >
                    {/* Compact Header Row */}
                    <div className="p-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleExpand(sk.id)}
                        className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer"
                      >
                        <span className="text-[var(--text-muted)] hover:text-white transition">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </span>
                        <span className="text-lg">{sk.icon}</span>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-white truncate">{sk.name}</h4>
                        </div>
                      </button>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onSelectSkill(sk)}
                          className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-white/5 hover:bg-[var(--accent)] hover:text-white text-slate-200 border border-white/10 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1"
                          title="Inject this skill into the prompt box"
                        >
                          <Send className="w-3 h-3" /> Select
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleSkill(sk.id)}
                          className={`px-2 py-1 rounded-[var(--radius-sm)] text-[10px] font-semibold transition cursor-pointer border ${
                            isSelected
                              ? 'bg-[var(--accent)] text-white border-transparent'
                              : 'bg-black/20 text-[var(--text-muted)] border-white/5 hover:text-white'
                          }`}
                          title={isSelected ? 'Disable skill' : 'Enable skill'}
                        >
                          {isSelected ? 'Enabled' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditingSkill({ ...sk }); }}
                          className="p-1.5 rounded text-[var(--text-muted)] hover:text-amber-300 hover:bg-amber-500/10 transition cursor-pointer border border-transparent hover:border-amber-500/20"
                          title="Edit skill"
                          aria-label={`Edit ${sk.name}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDeleteSkill(sk.id); }}
                          className="p-1.5 rounded text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer border border-transparent hover:border-rose-500/20"
                          title="Delete skill"
                          aria-label={`Delete ${sk.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        </button>
                      </div>
                    </div>

                    {/* Expandable Details */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-white/5 bg-black/20 text-xs animate-fadeIn">
                        {sk.promptTemplate && (
                          <div>
                            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-0.5">Prompt Blueprint</span>
                            <div className="p-2 rounded bg-black/30 border border-white/5 text-[10px] text-slate-300 font-mono whitespace-pre-wrap">
                              {sk.promptTemplate}
                            </div>
                          </div>
                        )}
                        <div className="pt-1 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingSkill({ ...sk })}
                            className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-200 text-[11px] font-medium transition cursor-pointer flex items-center gap-1 border border-white/10"
                          >
                            <Edit3 className="w-3 h-3" /> Edit Blueprint
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB 3: MEMORIES ───────────────────────────────────────────── */}
        {activeTab === 'memories' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-white">Permanent Memories</h3>
              <p className="text-[11px] text-[var(--text-muted)]">Facts, preferences, and deadlines your agent always remembers.</p>
            </div>

            {/* Add memory form */}
            <div className="flex gap-2">
              <input
                value={memoryText}
                onChange={(e) => setMemoryText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMemory()}
                placeholder="Add a new memory or fact…"
                aria-label="New memory entry"
                className="clean-input flex-1 px-3 py-2 text-xs outline-none rounded-[var(--radius-sm)]"
              />
              <button
                type="button"
                onClick={addMemory}
                disabled={!memoryText.trim()}
                className="px-3.5 py-2 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition cursor-pointer disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {memory.length === 0 && (
                <div className="p-6 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-md)]">
                  No memories yet. Add facts about your courses, style, or preferences.
                </div>
              )}

              {memory.map((m) => {
                const isEditing = editingMemoryId === m.id;
                const isExpanded = !!expandedIds[m.id];
                return (
                  <div
                    key={m.id}
                    className="rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-white/20 transition overflow-hidden"
                  >
                    {isEditing ? (
                      <div className="p-3 space-y-2.5 bg-black/30">
                        <textarea
                          rows={2}
                          value={editingMemoryText}
                          onChange={(e) => setEditingMemoryText(e.target.value)}
                          placeholder="Edit memory content..."
                          className="clean-input w-full p-2.5 text-xs outline-none rounded-[var(--radius-sm)] resize-none text-white leading-relaxed"
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingMemoryId(null)}
                            className="px-3 py-1 text-xs text-[var(--text-muted)] hover:text-white transition cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateMemory(m.id, editingMemoryText);
                              setEditingMemoryId(null);
                            }}
                            disabled={!editingMemoryText.trim()}
                            className="px-3.5 py-1 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] transition cursor-pointer disabled:opacity-40"
                          >
                            Save Memory
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Compact Header Row */}
                        <div className="p-3 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => toggleExpand(m.id)}
                            className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer"
                          >
                            <span className="text-[var(--text-muted)] hover:text-white transition">
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </span>
                            <span className="text-base">🧠</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-slate-200 truncate">{m.text}</p>
                              <span className="text-[10px] text-[var(--text-muted)]">{timeAgo(m.created_at)}</span>
                            </div>
                          </button>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => useMemory(m)}
                              className="px-2 py-1 rounded-[var(--radius-sm)] bg-white/5 hover:bg-[var(--accent)] hover:text-white text-slate-200 text-[10px] font-semibold border border-white/10 transition cursor-pointer flex items-center gap-1"
                              title="Load memory into prompt box"
                            >
                              <Send className="w-3 h-3" /> Select
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingMemoryId(m.id); setEditingMemoryText(m.text); }}
                              className="p-1.5 text-[var(--text-muted)] hover:text-amber-300 hover:bg-amber-500/10 rounded transition cursor-pointer border border-transparent hover:border-amber-500/20"
                              title="Edit memory"
                              aria-label="Edit memory"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); deleteMemory(m.id); }}
                              className="p-1.5 text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 rounded transition cursor-pointer border border-transparent hover:border-rose-500/20"
                              title="Delete memory"
                              aria-label="Delete memory"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                            </button>
                          </div>
                        </div>

                        {/* Expanded view */}
                        {isExpanded && (
                          <div className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-white/5 bg-black/20 text-xs animate-fadeIn">
                            <div>
                              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1">Full Memory</span>
                              <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>
                            </div>
                            <div className="pt-1 flex items-center justify-end">
                              <button
                                type="button"
                                onClick={() => { setEditingMemoryId(m.id); setEditingMemoryText(m.text); }}
                                className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-200 text-[11px] font-medium transition cursor-pointer flex items-center gap-1 border border-white/10"
                              >
                                <Edit3 className="w-3 h-3" /> Edit Memory
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB 4: RULES & FILES ──────────────────────────────────────── */}
        {activeTab === 'files' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-white">Rules, Automations & Files</h3>
                <p className="text-[11px] text-[var(--text-muted)]">Upload custom `.md`, `.txt`, `.json` rule files.</p>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={uploadKind}
                  onChange={(e) => setUploadKind(e.target.value)}
                  className="clean-input text-[11px] px-2 py-1 outline-none rounded-[var(--radius-sm)]"
                >
                  <option value="rule">Rule</option>
                  <option value="skill">Skill</option>
                  <option value="automation">Automation</option>
                  <option value="personality">Personality</option>
                </select>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload
                </button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => handleUploadFile(e, uploadKind)}
            />

            <div className="space-y-2">
              {files.length === 0 && (
                <div className="p-6 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-md)]">
                  No files uploaded yet. Upload custom `.md` rule or capability files.
                </div>
              )}

              {files.map((f) => {
                const isExpanded = !!expandedIds[f.id];
                return (
                  <div
                    key={f.id}
                    className="rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-white/20 transition overflow-hidden"
                  >
                    {/* Compact Header Row */}
                    <div className="p-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleExpand(f.id)}
                        className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer"
                      >
                        <span className="text-[var(--text-muted)] hover:text-white transition">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </span>
                        <FileText className="w-4 h-4 text-[var(--accent)] shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-white truncate">{f.file_name}</span>
                            <span className="chip chip-neutral text-[9px] uppercase">{f.kind}</span>
                          </div>
                          <span className="text-[10px] text-[var(--text-muted)]">{fmt(f.size_bytes)} bytes</span>
                        </div>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openFile(f)}
                          className="px-2 py-1 rounded-[var(--radius-sm)] bg-white/5 hover:bg-white/10 text-slate-200 text-[10px] font-medium border border-white/10 transition cursor-pointer"
                          title="Read file contents"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => useFileInPrompt(f)}
                          className="px-2 py-1 rounded-[var(--radius-sm)] bg-white/5 hover:bg-[var(--accent)] hover:text-white text-slate-200 border border-white/10 text-[10px] font-semibold transition cursor-pointer flex items-center gap-1"
                          title="Load file into prompt"
                        >
                          <Send className="w-3 h-3" /> Select
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteFile(f.id); }}
                          className="p-1.5 rounded text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer border border-transparent hover:border-rose-500/20"
                          title="Delete file"
                          aria-label={`Delete ${f.file_name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Info */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-white/5 bg-black/20 text-xs animate-fadeIn">
                        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                          <span>Kind: <strong className="text-white uppercase">{f.kind}</strong></span>
                          <span>Size: <strong className="text-white">{fmt(f.size_bytes)} bytes</strong></span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openFile(f)}
                          className="w-full py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 font-medium transition cursor-pointer text-center"
                        >
                          Open Full Viewer
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Add Identity Modal ────────────────────────────────────────── */}
      {showNewIdentityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="panel w-full max-w-md bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl border border-[var(--border-subtle)]">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎭</span>
                <h3 className="text-sm font-bold text-white">Create Custom Identity</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewIdentityModal(false)}
                className="text-[var(--text-muted)] hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateIdentity} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">Identity Title</label>
                <div className="flex gap-2">
                  <input
                    value={newIdIcon}
                    onChange={(e) => setNewIdIcon(e.target.value)}
                    className="clean-input w-12 text-center text-base py-1.5 outline-none rounded-[var(--radius-sm)]"
                    title="Emoji Icon"
                  />
                  <input
                    value={newIdName}
                    onChange={(e) => setNewIdName(e.target.value)}
                    placeholder="e.g. History Professor"
                    required
                    className="clean-input flex-1 px-3 py-1.5 text-xs outline-none rounded-[var(--radius-sm)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">Custom System Instructions</label>
                <textarea
                  rows={4}
                  value={newIdInstructions}
                  onChange={(e) => setNewIdInstructions(e.target.value)}
                  placeholder="Specific rules for how this identity must behave and answer coursework..."
                  className="clean-input w-full px-3 py-2 text-xs outline-none rounded-[var(--radius-sm)] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowNewIdentityModal(false)}
                  className="px-3.5 py-1.5 rounded-[var(--radius-sm)] text-xs text-[var(--text-muted)] hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newIdName.trim()}
                  className="px-4 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] text-xs font-semibold transition cursor-pointer disabled:opacity-40"
                >
                  Save & Add Identity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Skill Modal ───────────────────────────────────────────── */}
      {showNewSkillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="panel w-full max-w-md bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl border border-[var(--border-subtle)]">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚡</span>
                <h3 className="text-sm font-bold text-white">Create Custom Skill</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewSkillModal(false)}
                className="text-[var(--text-muted)] hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSkill} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">Skill Title</label>
                <div className="flex gap-2">
                  <input
                    value={newSkillIcon}
                    onChange={(e) => setNewSkillIcon(e.target.value)}
                    className="clean-input w-12 text-center text-base py-1.5 outline-none rounded-[var(--radius-sm)]"
                    title="Emoji Icon"
                  />
                  <input
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    placeholder="e.g. Lab Report Formatter"
                    required
                    className="clean-input flex-1 px-3 py-1.5 text-xs outline-none rounded-[var(--radius-sm)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">Prompt Blueprint / Template</label>
                <textarea
                  rows={4}
                  value={newSkillTemplate}
                  onChange={(e) => setNewSkillTemplate(e.target.value)}
                  placeholder="Please format this lab report into Hypothesis, Methodology, Data Table, and Error Analysis:\n\n"
                  className="clean-input w-full px-3 py-2 text-xs outline-none rounded-[var(--radius-sm)] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowNewSkillModal(false)}
                  className="px-3.5 py-1.5 rounded-[var(--radius-sm)] text-xs text-[var(--text-muted)] hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newSkillName.trim()}
                  className="px-4 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] text-xs font-semibold transition cursor-pointer disabled:opacity-40"
                >
                  Save & Add Skill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Identity Modal ───────────────────────────────────────── */}
      {editingIdentity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="panel w-full max-w-md bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl border border-[var(--border-subtle)]">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <span className="text-xl">✏️</span>
                <h3 className="text-sm font-bold text-white">Edit Identity</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingIdentity(null)}
                className="text-[var(--text-muted)] hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditIdentity} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">Identity Title</label>
                <div className="flex gap-2">
                  <input
                    value={editingIdentity.icon || '🧠'}
                    onChange={(e) => setEditingIdentity({ ...editingIdentity, icon: e.target.value })}
                    className="clean-input w-12 text-center text-base py-1.5 outline-none rounded-[var(--radius-sm)]"
                    title="Emoji Icon"
                  />
                  <input
                    value={editingIdentity.name || ''}
                    onChange={(e) => setEditingIdentity({ ...editingIdentity, name: e.target.value })}
                    placeholder="e.g. History Professor"
                    required
                    className="clean-input flex-1 px-3 py-1.5 text-xs outline-none rounded-[var(--radius-sm)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">Custom System Instructions</label>
                <textarea
                  rows={4}
                  value={editingIdentity.instructions || ''}
                  onChange={(e) => setEditingIdentity({ ...editingIdentity, instructions: e.target.value })}
                  placeholder="Specific rules for how this identity must behave and answer coursework..."
                  className="clean-input w-full px-3 py-2 text-xs outline-none rounded-[var(--radius-sm)] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setEditingIdentity(null)}
                  className="px-3.5 py-1.5 rounded-[var(--radius-sm)] text-xs text-[var(--text-muted)] hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!editingIdentity.name?.trim()}
                  className="px-4 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] text-xs font-semibold transition cursor-pointer disabled:opacity-40"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Skill Modal ──────────────────────────────────────────── */}
      {editingSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="panel w-full max-w-md bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl border border-[var(--border-subtle)]">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <span className="text-xl">✏️</span>
                <h3 className="text-sm font-bold text-white">Edit Skill</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSkill(null)}
                className="text-[var(--text-muted)] hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditSkill} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">Skill Title</label>
                <div className="flex gap-2">
                  <input
                    value={editingSkill.icon || '⚡'}
                    onChange={(e) => setEditingSkill({ ...editingSkill, icon: e.target.value })}
                    className="clean-input w-12 text-center text-base py-1.5 outline-none rounded-[var(--radius-sm)]"
                    title="Emoji Icon"
                  />
                  <input
                    value={editingSkill.name || ''}
                    onChange={(e) => setEditingSkill({ ...editingSkill, name: e.target.value })}
                    placeholder="e.g. Lab Report Formatter"
                    required
                    className="clean-input flex-1 px-3 py-1.5 text-xs outline-none rounded-[var(--radius-sm)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">Prompt Blueprint / Template</label>
                <textarea
                  rows={4}
                  value={editingSkill.promptTemplate || ''}
                  onChange={(e) => setEditingSkill({ ...editingSkill, promptTemplate: e.target.value })}
                  placeholder="Please format this lab report into Hypothesis, Methodology, Data Table, and Error Analysis:\n\n"
                  className="clean-input w-full px-3 py-2 text-xs outline-none rounded-[var(--radius-sm)] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setEditingSkill(null)}
                  className="px-3.5 py-1.5 rounded-[var(--radius-sm)] text-xs text-[var(--text-muted)] hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!editingSkill.name?.trim()}
                  className="px-4 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] text-xs font-semibold transition cursor-pointer disabled:opacity-40"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
