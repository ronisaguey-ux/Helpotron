/* ────────────────────────────────────────────────────────────────────────────
 * AgentConfigsSidebar.jsx — Comprehensive Agent Configuration Manager (v3 M3 Tokens)
 * Provides full ADD, DELETE, and SELECT / ACTIVATE controls for:
 *   1. Identities & Personas (Presets + Custom created personas)
 *   2. Skills & Capabilities (Presets + Custom prompt templates + Uploads)
 *   3. Permanent Memories (Facts, study goals, deadlines)
 *   4. Rules & Automations (Uploaded rule files, automated triggers)
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useRef } from "react";
import {
  SlidersHorizontal, User as UserIcon, Database, FileText, Send, Trash2, Plus,
  Upload, ChevronDown, ChevronRight, Check, Cpu, Edit3, X,
} from "lucide-react";
import { timeAgo } from "./ui/os.jsx";

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
  memoryText = "",
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
  const [activeTab, setActiveTab] = useState("identities"); // "identities" | "skills" | "memories" | "files"

  const [agentNameInput, setAgentNameInput] = useState(ai.aiName || "Atlas");
  const [nameSavedFeedback, setNameSavedFeedback] = useState(false);
  const [expandedIds, setExpandedIds] = useState({});

  // Editing state for existing items
  const [editingIdentity, setEditingIdentity] = useState(null);
  const [editingSkill, setEditingSkill] = useState(null);
  const [editingMemoryId, setEditingMemoryId] = useState(null);
  const [editingMemoryText, setEditingMemoryText] = useState("");

  const toggleExpand = (id) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Modal states
  const [showNewIdentityModal, setShowNewIdentityModal] = useState(false);
  const [newIdName, setNewIdName] = useState("");
  const [newIdIcon, setNewIdIcon] = useState("🧠");
  const [newIdInstructions, setNewIdInstructions] = useState("");

  const [showNewSkillModal, setShowNewSkillModal] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillIcon, setNewSkillIcon] = useState("⚡");
  const [newSkillTemplate, setNewSkillTemplate] = useState("");

  const fileInputRef = useRef(null);
  const [uploadKind, setUploadKind] = useState("skill");

  const handleCreateIdentity = (e) => {
    e?.preventDefault();
    if (!newIdName.trim()) return;
    const newId = {
      id: `custom_id_${Date.now()}`,
      name: newIdName.trim(),
      icon: newIdIcon || "🧠",
      persona: newIdName.trim(),
      instructions: newIdInstructions.trim() || "Provide helpful and customized assistance.",
      isBuiltin: false,
    };
    onAddIdentity(newId);
    setNewIdName("");
    setNewIdInstructions("");
    setShowNewIdentityModal(false);
  };

  const handleSaveEditIdentity = (e) => {
    e?.preventDefault();
    if (!editingIdentity?.id || !editingIdentity.name.trim()) return;
    onUpdateIdentity({
      ...editingIdentity,
      name: editingIdentity.name.trim(),
      icon: editingIdentity.icon || "🧠",
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
      icon: newSkillIcon || "⚡",
      category: "skill",
      description: newSkillName.trim(),
      promptTemplate: newSkillTemplate.trim() || `${newSkillName}:\n`,
      isBuiltin: false,
    };
    onAddSkill(newSk);
    setNewSkillName("");
    setNewSkillTemplate("");
    setShowNewSkillModal(false);
  };

  const handleSaveEditSkill = (e) => {
    e?.preventDefault();
    if (!editingSkill?.id || !editingSkill.name.trim()) return;
    onUpdateSkill({
      ...editingSkill,
      name: editingSkill.name.trim(),
      icon: editingSkill.icon || "⚡",
      description: editingSkill.name.trim(),
      promptTemplate: editingSkill.promptTemplate.trim(),
    });
    setEditingSkill(null);
  };

  const allIdentities = identities || [];
  const allSkills = skills || [];

  return (
    <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl h-full flex flex-col overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-outline-variant/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-primary" />
          <h2 className="font-label-caps text-label-caps text-on-surface uppercase tracking-wider font-bold">
            Agent Configurations
          </h2>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition cursor-pointer"
          title="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Agent configuration sections"
        className="flex items-center border-b border-outline-variant/30 bg-surface-container-low px-2 pt-1 gap-1 shrink-0 overflow-x-auto"
      >
        {[
          { key: "identities", label: "Identities", Icon: UserIcon, count: allIdentities.length },
          { key: "skills", label: "Skills", Icon: Cpu, count: allSkills.length },
          { key: "memories", label: "Memories", Icon: Database, count: memory.length },
          { key: "files", label: "Rules & Files", Icon: FileText, count: files.length },
        ].map((t) => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              aria-selected={isActive}
              role="tab"
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-label-caps uppercase tracking-wider rounded-t-xl transition cursor-pointer whitespace-nowrap min-h-[44px] ${
                isActive
                  ? "bg-surface-container-lowest text-primary font-semibold border-b-2 border-primary shadow-xs"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-b-2 border-transparent"
              }`}
            >
              <t.Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t.label}</span>
              {t.count > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-mono">
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* ── TAB 1: IDENTITIES ─────────────────────────────────────────── */}
        {activeTab === "identities" && (
          <div className="space-y-4">
            {/* Customize Agent Display Name */}
            <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/20 space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-label-caps text-xs font-bold text-on-surface flex items-center gap-1.5 uppercase tracking-wider">
                  <span>🏷️</span> Agent Display Name
                </label>
                {nameSavedFeedback && (
                  <span className="text-[10px] text-sem-green font-semibold flex items-center gap-1">
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
                    if (e.key === "Enter") {
                      onSaveAgentName(agentNameInput.trim() || "Atlas");
                      setNameSavedFeedback(true);
                      setTimeout(() => setNameSavedFeedback(false), 2000);
                    }
                  }}
                  placeholder="e.g. Atlas, Socrates, JARVIS"
                  className="bg-surface-container border border-outline-variant/30 rounded-xl px-3 py-2 text-xs text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary flex-1 min-w-0"
                />
                <button
                  type="button"
                  onClick={() => {
                    onSaveAgentName(agentNameInput.trim() || "Atlas");
                    setNameSavedFeedback(true);
                    setTimeout(() => setNameSavedFeedback(false), 2000);
                  }}
                  className="bg-primary text-on-primary rounded-xl px-4 py-2 font-label-caps text-xs font-semibold hover:opacity-90 transition shadow-sm shrink-0 min-h-[44px]"
                >
                  Save Name
                </button>
              </div>
            </div>

            <div className="flex items-start justify-between gap-3 pt-1">
              <div className="min-w-0">
                <h3 className="font-label-caps text-xs font-bold text-on-surface uppercase tracking-wider">Agent Identities</h3>
                <p className="font-body-sm text-[11px] text-on-surface-variant">Select an active persona or expand to view details.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewIdentityModal(true)}
                className="bg-primary text-on-primary rounded-xl px-3 py-2 font-label-caps text-xs font-semibold hover:opacity-90 transition shadow-sm flex items-center gap-1.5 shrink-0 min-h-[44px]"
              >
                <Plus className="w-4 h-4" /> Add Identity
              </button>
            </div>

            <div className="space-y-2">
              {allIdentities.length === 0 && (
                <div className="p-8 text-center border border-dashed border-outline-variant/30 rounded-xl space-y-2">
                  <div className="text-2xl">🎭</div>
                  <div className="font-headline-lg text-xs font-semibold text-on-surface">No custom identities yet</div>
                  <p className="font-body-sm text-[11px] text-on-surface-variant max-w-xs mx-auto">
                    Create your own agent persona with custom instructions, tone, and traits.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowNewIdentityModal(true)}
                    className="mt-2 px-4 py-2 rounded-xl bg-primary text-on-primary font-label-caps text-xs font-semibold hover:opacity-90 transition min-h-[44px]"
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
                    className={`rounded-xl border transition overflow-hidden ${
                      isActive
                        ? "border-primary/40 bg-surface-container-lowest shadow-sm"
                        : "border-outline-variant/20 bg-surface-container-lowest hover:border-outline-variant/50"
                    }`}
                  >
                    {/* Compact Header Row */}
                    <div className="p-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.id)}
                        className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer min-h-[44px]"
                      >
                        <span className="text-on-surface-variant hover:text-on-surface transition">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </span>
                        <span className="text-lg">{item.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-title-md text-xs font-bold text-on-surface truncate">{item.name}</h4>
                            {isActive && (
                              <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[9px] font-label-caps font-bold flex items-center gap-1">
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
                          className={`px-3 py-1.5 rounded-xl font-label-caps text-xs font-semibold transition cursor-pointer min-h-[44px] ${
                            isActive
                              ? "bg-primary text-on-primary opacity-80 cursor-default"
                              : "bg-surface-container hover:bg-primary hover:text-on-primary text-on-surface border border-outline-variant/30"
                          }`}
                        >
                          {isActive ? "Active" : "Select"}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditingIdentity({ ...item }); }}
                          className="p-2 rounded-xl text-on-surface-variant hover:text-primary hover:bg-surface-container transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Edit identity"
                          aria-label={`Edit ${item.name}`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDeleteIdentity(item.id); }}
                          className="p-2 rounded-xl text-on-surface-variant hover:text-error hover:bg-error-container/20 transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Delete identity"
                          aria-label={`Delete ${item.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Expandable Details */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-outline-variant/10 bg-surface-container-low text-xs">
                        {item.instructions && (
                          <div>
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-0.5">System Instructions</span>
                            <div className="p-2.5 rounded-xl bg-surface-container border border-outline-variant/20 text-[11px] text-on-surface font-mono whitespace-pre-wrap">
                              {item.instructions}
                            </div>
                          </div>
                        )}
                        <div className="pt-1 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingIdentity({ ...item })}
                            className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium transition cursor-pointer flex items-center gap-1.5 border border-outline-variant/30 min-h-[44px]"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Edit Identity
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
        {activeTab === "skills" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-label-caps text-xs font-bold text-on-surface uppercase tracking-wider">Skills & Capabilities</h3>
                <p className="font-body-sm text-[11px] text-on-surface-variant">Select, apply to prompt, or expand to edit blueprint.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewSkillModal(true)}
                className="bg-primary text-on-primary rounded-xl px-3 py-2 font-label-caps text-xs font-semibold hover:opacity-90 transition shadow-sm flex items-center gap-1.5 min-h-[44px]"
              >
                <Plus className="w-4 h-4" /> Add Skill
              </button>
            </div>

            <div className="space-y-2">
              {allSkills.length === 0 && (
                <div className="p-8 text-center border border-dashed border-outline-variant/30 rounded-xl space-y-2">
                  <div className="text-2xl">⚡</div>
                  <div className="font-headline-lg text-xs font-semibold text-on-surface">No custom skills yet</div>
                  <p className="font-body-sm text-[11px] text-on-surface-variant max-w-xs mx-auto">
                    Build prompt blueprints and automated capabilities tailored to your workflow.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowNewSkillModal(true)}
                    className="mt-2 px-4 py-2 rounded-xl bg-primary text-on-primary font-label-caps text-xs font-semibold hover:opacity-90 transition min-h-[44px]"
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
                    className={`rounded-xl border transition overflow-hidden ${
                      isSelected
                        ? "border-primary/40 bg-surface-container-lowest shadow-sm"
                        : "border-outline-variant/20 bg-surface-container-lowest hover:border-outline-variant/50"
                    }`}
                  >
                    {/* Compact Header Row */}
                    <div className="p-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleExpand(sk.id)}
                        className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer min-h-[44px]"
                      >
                        <span className="text-on-surface-variant hover:text-on-surface transition">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </span>
                        <span className="text-lg">{sk.icon}</span>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-title-md text-xs font-bold text-on-surface truncate">{sk.name}</h4>
                        </div>
                      </button>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onSelectSkill(sk)}
                          className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-primary hover:text-on-primary text-on-surface border border-outline-variant/30 font-label-caps text-xs font-semibold transition cursor-pointer flex items-center gap-1 min-h-[44px]"
                          title="Inject this skill into the prompt box"
                        >
                          <Send className="w-3 h-3" /> Select
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleSkill(sk.id)}
                          className={`px-3 py-1.5 rounded-xl font-label-caps text-xs font-semibold transition cursor-pointer min-h-[44px] ${
                            isSelected
                              ? "bg-primary text-on-primary"
                              : "bg-surface-container text-on-surface-variant border border-outline-variant/30 hover:text-on-surface"
                          }`}
                          title={isSelected ? "Disable skill" : "Enable skill"}
                        >
                          {isSelected ? "Enabled" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditingSkill({ ...sk }); }}
                          className="p-2 rounded-xl text-on-surface-variant hover:text-primary hover:bg-surface-container transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Edit skill"
                          aria-label={`Edit ${sk.name}`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDeleteSkill(sk.id); }}
                          className="p-2 rounded-xl text-on-surface-variant hover:text-error hover:bg-error-container/20 transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Delete skill"
                          aria-label={`Delete ${sk.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Expandable Details */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-outline-variant/10 bg-surface-container-low text-xs">
                        {sk.promptTemplate && (
                          <div>
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-0.5">Prompt Blueprint</span>
                            <div className="p-2.5 rounded-xl bg-surface-container border border-outline-variant/20 text-[11px] text-on-surface font-mono whitespace-pre-wrap">
                              {sk.promptTemplate}
                            </div>
                          </div>
                        )}
                        <div className="pt-1 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingSkill({ ...sk })}
                            className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium transition cursor-pointer flex items-center gap-1.5 border border-outline-variant/30 min-h-[44px]"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Edit Blueprint
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
        {activeTab === "memories" && (
          <div className="space-y-4">
            <div>
              <h3 className="font-label-caps text-xs font-bold text-on-surface uppercase tracking-wider">Permanent Memories</h3>
              <p className="font-body-sm text-[11px] text-on-surface-variant">Facts, preferences, and deadlines your agent always remembers.</p>
            </div>

            {/* Add memory form */}
            <div className="flex gap-2">
              <input
                value={memoryText}
                onChange={(e) => setMemoryText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMemory()}
                placeholder="Add a new memory or fact…"
                aria-label="New memory entry"
                className="bg-surface-container border border-outline-variant/30 rounded-xl px-3 py-2 text-xs text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary flex-1 min-w-0"
              />
              <button
                type="button"
                onClick={addMemory}
                disabled={!memoryText.trim()}
                className="bg-primary text-on-primary rounded-xl px-4 py-2 font-label-caps text-xs font-semibold hover:opacity-90 transition shadow-sm disabled:opacity-40 min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {memory.length === 0 && (
                <div className="p-6 text-center text-xs text-on-surface-variant border border-dashed border-outline-variant/30 rounded-xl">
                  No memories yet. Add facts about your courses, style, or preferences.
                </div>
              )}

              {memory.map((m) => {
                const isEditing = editingMemoryId === m.id;
                const isExpanded = !!expandedIds[m.id];
                return (
                  <div
                    key={m.id}
                    className="rounded-xl bg-surface-container-lowest border border-outline-variant/20 hover:border-outline-variant/50 transition overflow-hidden"
                  >
                    {isEditing ? (
                      <div className="p-3 space-y-2.5 bg-surface-container-low">
                        <textarea
                          rows={2}
                          value={editingMemoryText}
                          onChange={(e) => setEditingMemoryText(e.target.value)}
                          placeholder="Edit memory content..."
                          className="w-full p-2.5 text-xs bg-surface-container border border-outline-variant/30 rounded-xl resize-none text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary leading-relaxed"
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingMemoryId(null)}
                            className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface transition cursor-pointer min-h-[44px]"
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
                            className="bg-primary text-on-primary rounded-xl px-4 py-2 font-label-caps text-xs font-semibold hover:opacity-90 transition cursor-pointer disabled:opacity-40 min-h-[44px]"
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
                            className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer min-h-[44px]"
                          >
                            <span className="text-on-surface-variant hover:text-on-surface transition">
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </span>
                            <span className="text-base">🧠</span>
                            <div className="min-w-0 flex-1">
                              <p className="font-body-md text-xs text-on-surface truncate">{m.text}</p>
                              <span className="text-[10px] text-on-surface-variant">{timeAgo(m.created_at)}</span>
                            </div>
                          </button>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => useMemory(m)}
                              className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-primary hover:text-on-primary text-on-surface border border-outline-variant/30 font-label-caps text-xs font-semibold transition cursor-pointer flex items-center gap-1 min-h-[44px]"
                              title="Load memory into prompt box"
                            >
                              <Send className="w-3 h-3" /> Select
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingMemoryId(m.id); setEditingMemoryText(m.text); }}
                              className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded-xl transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                              title="Edit memory"
                              aria-label="Edit memory"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); deleteMemory(m.id); }}
                              className="p-2 text-on-surface-variant hover:text-error hover:bg-error-container/20 rounded-xl transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                              title="Delete memory"
                              aria-label="Delete memory"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Expanded view */}
                        {isExpanded && (
                          <div className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-outline-variant/10 bg-surface-container-low text-xs">
                            <div>
                              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Full Memory</span>
                              <p className="text-xs text-on-surface leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>
                            </div>
                            <div className="pt-1 flex items-center justify-end">
                              <button
                                type="button"
                                onClick={() => { setEditingMemoryId(m.id); setEditingMemoryText(m.text); }}
                                className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium transition cursor-pointer flex items-center gap-1.5 border border-outline-variant/30 min-h-[44px]"
                              >
                                <Edit3 className="w-3.5 h-3.5" /> Edit Memory
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
        {activeTab === "files" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-label-caps text-xs font-bold text-on-surface uppercase tracking-wider">Rules, Automations & Files</h3>
                <p className="font-body-sm text-[11px] text-on-surface-variant">Upload custom `.md`, `.txt`, `.json` rule files.</p>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={uploadKind}
                  onChange={(e) => setUploadKind(e.target.value)}
                  className="bg-surface-container border border-outline-variant/30 rounded-xl text-xs px-2.5 py-1.5 text-on-surface outline-none cursor-pointer"
                >
                  <option value="rule" className="bg-surface text-on-surface">Rule</option>
                  <option value="skill" className="bg-surface text-on-surface">Skill</option>
                  <option value="automation" className="bg-surface text-on-surface">Automation</option>
                  <option value="personality" className="bg-surface text-on-surface">Personality</option>
                </select>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-primary text-on-primary rounded-xl px-3 py-2 font-label-caps text-xs font-semibold hover:opacity-90 transition shadow-sm flex items-center gap-1.5 min-h-[44px]"
                >
                  <Upload className="w-4 h-4" /> Upload
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
                <div className="p-6 text-center text-xs text-on-surface-variant border border-dashed border-outline-variant/30 rounded-xl">
                  No files uploaded yet. Upload custom `.md` rule or capability files.
                </div>
              )}

              {files.map((f) => {
                const isExpanded = !!expandedIds[f.id];
                return (
                  <div
                    key={f.id}
                    className="rounded-xl bg-surface-container-lowest border border-outline-variant/20 hover:border-outline-variant/50 transition overflow-hidden"
                  >
                    {/* Compact Header Row */}
                    <div className="p-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleExpand(f.id)}
                        className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer min-h-[44px]"
                      >
                        <span className="text-on-surface-variant hover:text-on-surface transition">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </span>
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-on-surface truncate">{f.file_name}</span>
                            <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant text-[9px] uppercase font-mono">
                              {f.kind}
                            </span>
                          </div>
                          <span className="text-[10px] text-on-surface-variant">{fmt(f.size_bytes)} bytes</span>
                        </div>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openFile(f)}
                          className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium border border-outline-variant/30 transition cursor-pointer min-h-[44px]"
                          title="Read file contents"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => useFileInPrompt(f)}
                          className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-primary hover:text-on-primary text-on-surface border border-outline-variant/30 font-label-caps text-xs font-semibold transition cursor-pointer flex items-center gap-1 min-h-[44px]"
                          title="Load file into prompt"
                        >
                          <Send className="w-3 h-3" /> Select
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteFile(f.id); }}
                          className="p-2 rounded-xl text-on-surface-variant hover:text-error hover:bg-error-container/20 transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Delete file"
                          aria-label={`Delete ${f.file_name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Info */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-outline-variant/10 bg-surface-container-low text-xs">
                        <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
                          <span>Kind: <strong className="text-on-surface uppercase">{f.kind}</strong></span>
                          <span>Size: <strong className="text-on-surface">{fmt(f.size_bytes)} bytes</strong></span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openFile(f)}
                          className="w-full py-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-xs text-on-surface font-medium transition cursor-pointer text-center min-h-[44px]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-surface-container-lowest rounded-2xl p-5 space-y-4 shadow-2xl border border-outline-variant/30 w-full max-w-md">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎭</span>
                <h3 className="font-title-md text-sm font-bold text-on-surface">Create Custom Identity</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewIdentityModal(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateIdentity} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Identity Title</label>
                <div className="flex gap-2">
                  <input
                    value={newIdIcon}
                    onChange={(e) => setNewIdIcon(e.target.value)}
                    className="w-12 text-center text-base py-2 bg-surface-container border border-outline-variant/30 rounded-xl outline-none text-on-surface"
                    title="Emoji Icon"
                  />
                  <input
                    value={newIdName}
                    onChange={(e) => setNewIdName(e.target.value)}
                    placeholder="e.g. History Professor"
                    required
                    className="flex-1 px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-xl text-xs text-on-surface outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Custom System Instructions</label>
                <textarea
                  rows={4}
                  value={newIdInstructions}
                  onChange={(e) => setNewIdInstructions(e.target.value)}
                  placeholder="Specific rules for how this identity must behave and answer coursework..."
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-xl text-xs text-on-surface outline-none focus:border-primary resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setShowNewIdentityModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:text-on-surface bg-surface-container hover:bg-surface-container-high transition cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newIdName.trim()}
                  className="bg-primary text-on-primary rounded-xl px-4 py-2 font-label-caps text-xs font-semibold hover:opacity-90 transition cursor-pointer disabled:opacity-40 min-h-[44px]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-surface-container-lowest rounded-2xl p-5 space-y-4 shadow-2xl border border-outline-variant/30 w-full max-w-md">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚡</span>
                <h3 className="font-title-md text-sm font-bold text-on-surface">Create Custom Skill</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewSkillModal(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSkill} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Skill Title</label>
                <div className="flex gap-2">
                  <input
                    value={newSkillIcon}
                    onChange={(e) => setNewSkillIcon(e.target.value)}
                    className="w-12 text-center text-base py-2 bg-surface-container border border-outline-variant/30 rounded-xl outline-none text-on-surface"
                    title="Emoji Icon"
                  />
                  <input
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    placeholder="e.g. Lab Report Formatter"
                    required
                    className="flex-1 px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-xl text-xs text-on-surface outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Prompt Blueprint / Template</label>
                <textarea
                  rows={4}
                  value={newSkillTemplate}
                  onChange={(e) => setNewSkillTemplate(e.target.value)}
                  placeholder="Please format this lab report into Hypothesis, Methodology, Data Table, and Error Analysis:\n\n"
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-xl text-xs text-on-surface outline-none focus:border-primary resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setShowNewSkillModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:text-on-surface bg-surface-container hover:bg-surface-container-high transition cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newSkillName.trim()}
                  className="bg-primary text-on-primary rounded-xl px-4 py-2 font-label-caps text-xs font-semibold hover:opacity-90 transition cursor-pointer disabled:opacity-40 min-h-[44px]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-surface-container-lowest rounded-2xl p-5 space-y-4 shadow-2xl border border-outline-variant/30 w-full max-w-md">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="text-xl">✏️</span>
                <h3 className="font-title-md text-sm font-bold text-on-surface">Edit Identity</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingIdentity(null)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditIdentity} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Identity Title</label>
                <div className="flex gap-2">
                  <input
                    value={editingIdentity.icon || "🧠"}
                    onChange={(e) => setEditingIdentity({ ...editingIdentity, icon: e.target.value })}
                    className="w-12 text-center text-base py-2 bg-surface-container border border-outline-variant/30 rounded-xl outline-none text-on-surface"
                    title="Emoji Icon"
                  />
                  <input
                    value={editingIdentity.name || ""}
                    onChange={(e) => setEditingIdentity({ ...editingIdentity, name: e.target.value })}
                    placeholder="e.g. History Professor"
                    required
                    className="flex-1 px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-xl text-xs text-on-surface outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Custom System Instructions</label>
                <textarea
                  rows={4}
                  value={editingIdentity.instructions || ""}
                  onChange={(e) => setEditingIdentity({ ...editingIdentity, instructions: e.target.value })}
                  placeholder="Specific rules for how this identity must behave and answer coursework..."
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-xl text-xs text-on-surface outline-none focus:border-primary resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setEditingIdentity(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:text-on-surface bg-surface-container hover:bg-surface-container-high transition cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!editingIdentity.name?.trim()}
                  className="bg-primary text-on-primary rounded-xl px-4 py-2 font-label-caps text-xs font-semibold hover:opacity-90 transition cursor-pointer disabled:opacity-40 min-h-[44px]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-surface-container-lowest rounded-2xl p-5 space-y-4 shadow-2xl border border-outline-variant/30 w-full max-w-md">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="text-xl">✏️</span>
                <h3 className="font-title-md text-sm font-bold text-on-surface">Edit Skill</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSkill(null)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditSkill} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Skill Title</label>
                <div className="flex gap-2">
                  <input
                    value={editingSkill.icon || "⚡"}
                    onChange={(e) => setEditingSkill({ ...editingSkill, icon: e.target.value })}
                    className="w-12 text-center text-base py-2 bg-surface-container border border-outline-variant/30 rounded-xl outline-none text-on-surface"
                    title="Emoji Icon"
                  />
                  <input
                    value={editingSkill.name || ""}
                    onChange={(e) => setEditingSkill({ ...editingSkill, name: e.target.value })}
                    placeholder="e.g. Lab Report Formatter"
                    required
                    className="flex-1 px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-xl text-xs text-on-surface outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Prompt Blueprint / Template</label>
                <textarea
                  rows={4}
                  value={editingSkill.promptTemplate || ""}
                  onChange={(e) => setEditingSkill({ ...editingSkill, promptTemplate: e.target.value })}
                  placeholder="Please format this lab report into Hypothesis, Methodology, Data Table, and Error Analysis:\n\n"
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-xl text-xs text-on-surface outline-none focus:border-primary resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setEditingSkill(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:text-on-surface bg-surface-container hover:bg-surface-container-high transition cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!editingSkill.name?.trim()}
                  className="bg-primary text-on-primary rounded-xl px-4 py-2 font-label-caps text-xs font-semibold hover:opacity-90 transition cursor-pointer disabled:opacity-40 min-h-[44px]"
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
