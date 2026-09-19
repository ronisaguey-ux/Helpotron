/**
 * AgentConfigsSidebar.jsx — Agent Configuration Manager (Stitch v6 / §3.6.5).
 * 4 Tabs: Identities (Active) | Skills | Memories | Rules & Files.
 * LUMINOUS GLASS M3 design tokens throughout.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  SlidersHorizontal, User as UserIcon, Database, FileText, Send, Trash2, Plus,
  Upload, ChevronDown, ChevronRight, Check, Cpu, Edit3, X, Sparkles, BookOpen,
  PenTool, HelpCircle, GraduationCap, FileCode, Shield, CheckCircle2
} from 'lucide-react';
import { PRESET_PERSONAS, DEFAULT_IDENTITIES, DEFAULT_SKILLS } from '../lib/agentPresets.js';
import { timeAgo } from './ui/os.jsx';

export { DEFAULT_IDENTITIES, DEFAULT_SKILLS };

function getPersonaIcon(type, className = 'w-5 h-5') {
  switch (type) {
    case 'scholar':
      return <BookOpen className={className} />;
    case 'editor':
      return <PenTool className={className} />;
    case 'coach':
      return <HelpCircle className={className} />;
    default:
      return <GraduationCap className={className} />;
  }
}

export default function AgentConfigsSidebar({
  ai = {},
  identities = [],
  activeIdentityId = 'none',
  onSelectIdentity = () => {},
  onAddIdentity = () => {},
  onUpdateIdentity = () => {},
  onDeleteIdentity = () => {},
  onSaveAgentName = () => {},
  skills = DEFAULT_SKILLS,
  // No stock skills, none enabled — a blank slate (owner 2026-09-19).
  activeSkillIds = [],
  onToggleSkill = () => {},
  onAddSkill = () => {},
  onDeleteSkill = () => {},
  memory = [],
  memoryText = '',
  setMemoryText = () => {},
  addMemory = () => {},
  deleteMemory = () => {},
  useMemory = () => {},
  files = [],
  fileKinds = [],
  handleUploadFile = () => {},
  openFile = () => {},
  deleteFile = () => {},
  useFileInPrompt = () => {},
  onCollapse = () => {},
  // Educational mode moved here from the chat header (owner 2026-09-19): it is a
  // preference you set once, not a per-message control.
  educationalMode = true,
  onToggleEducationalMode = () => {},
}) {
  const [activeTab, setActiveTab] = useState('identities'); // 'identities' | 'skills' | 'memories' | 'files' | 'behaviour'

  // Modal states
  const [showNewIdentityModal, setShowNewIdentityModal] = useState(false);
  const [newIdName, setNewIdName] = useState('');
  const [newIdInstructions, setNewIdInstructions] = useState('');
  const [newIdTagline, setNewIdTagline] = useState('');

  const [showNewSkillModal, setShowNewSkillModal] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');

  const fileInputRef = useRef(null);
  const [uploadKind, setUploadKind] = useState('skill');

  // Editable agent-name draft. Kept in local state so typing does not fire a
  // settings PATCH per keystroke; committed on blur / Enter.
  const [agentNameDraft, setAgentNameDraft] = useState(ai?.aiName || '');
  // Re-sync when the value arrives or changes from elsewhere (the panel can mount
  // before settings have loaded, and the agent may rename itself).
  useEffect(() => {
    setAgentNameDraft((prev) => (prev === (ai?.aiName || '') ? prev : (ai?.aiName || '')));
  }, [ai?.aiName]);

  const commitAgentName = () => {
    const next = String(agentNameDraft || '').trim().slice(0, 40);
    if (next === (ai?.aiName || '')) return;   // nothing changed — no write
    setAgentNameDraft(next);
    onSaveAgentName(next);
  };

  // Merged persona list. PRESET_PERSONAS is empty now (blank slate), so this is
  // the user's own identities unless presets are ever added back.
  //
  // `hidden_identities` is why a deleted preset STAYS deleted. Presets live in
  // the bundle, not in the user's settings, so filtering the merged list once
  // would bring the card straight back on the next render — which is exactly the
  // "I deleted it and it didn't last" report. The removal is a durable list of
  // ids, and every render honours it.
  const hiddenIdentities = Array.isArray(ai?.hidden_identities) ? ai.hidden_identities : [];
  const allIdentities = [
    ...PRESET_PERSONAS,
    ...identities.filter((idItem) => !PRESET_PERSONAS.some((p) => p.id === idItem.id)),
  ].filter((p) => !hiddenIdentities.includes(p.id));

  const handleCreateIdentity = (e) => {
    e?.preventDefault();
    if (!newIdName.trim()) return;
    const newId = {
      id: `custom_id_${Date.now()}`,
      name: newIdName.trim(),
      title: newIdName.trim(),
      tagline: newIdTagline.trim() || 'Custom Academic Persona',
      description: newIdInstructions.trim() || 'Custom instructions for agent reasoning.',
      instructions: newIdInstructions.trim() || 'Provide helpful and customized assistance.',
      isBuiltin: false,
      badge: 'Custom',
      badgeVariant: 'primary',
      reasoningDepth: 'Custom',
      writingStyle: 'User Defined',
      detectorStealth: 'Humanizer ready',
      iconType: 'custom',
    };
    onAddIdentity(newId);
    setNewIdName('');
    setNewIdTagline('');
    setNewIdInstructions('');
    setShowNewIdentityModal(false);
  };

  const handleCreateSkill = (e) => {
    e?.preventDefault();
    if (!newSkillName.trim()) return;
    const skill = {
      id: `custom_skill_${Date.now()}`,
      name: newSkillName.trim(),
      description: newSkillDesc.trim() || 'Custom capability for the agent.',
      category: 'Custom',
      icon: 'Cpu',
      enabled: true,
    };
    onAddSkill(skill);
    setNewSkillName('');
    setNewSkillDesc('');
    setShowNewSkillModal(false);
  };

  return (
    <div className="flex flex-col h-full bg-surface-container-lowest/80 backdrop-blur-xl border-l border-outline-variant/30 text-on-surface w-full max-w-md">
      {/* Header */}
      <div className="flex items-center justify-between p-unit-4 border-b border-outline-variant/20">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-primary" />
          <h2 className="font-title-md text-title-md font-semibold text-on-surface">
            Agent Configs
          </h2>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
          title="Close Sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

        {/* Agent name. `ai.aiName` is what the greeting reads
            ("<name> Agent online", overlord_agent.py:544) — and until now there
            was NO input anywhere in the app that wrote it, so the operator could
            never change the name of their own agent. onSaveAgentName existed as a
            declared-but-unrendered prop.
            Saved on blur and on Enter, not on every keystroke: each save is a
            settings PATCH, and a per-character write would fire one per letter. */}
        <div className="px-unit-4 py-unit-3 border-b border-outline-variant/20">
          <label
            htmlFor="agentNameInput"
            className="font-label-caps text-label-caps text-outline uppercase tracking-wider block mb-1.5"
          >
            Agent Name
          </label>
          <div className="flex items-center gap-2">
            <input
              id="agentNameInput"
              type="text"
              value={agentNameDraft}
              maxLength={40}
              placeholder="Name your agent…"
              onChange={(e) => setAgentNameDraft(e.target.value)}
              onBlur={() => commitAgentName()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setAgentNameDraft(ai?.aiName || '');
                  e.currentTarget.blur();
                }
              }}
              className="flex-1 min-w-0 bg-surface-container-lowest border border-outline-variant/25 rounded-xl px-3 py-2 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="font-code-sm text-[10px] text-outline tabular-nums shrink-0">
              {agentNameDraft.length}/40
            </span>
          </div>
          <p className="font-code-sm text-[10px] text-outline mt-1">
            Shown in the chat greeting. Saved when you click away or press Enter.
          </p>
        </div>

        {/* 4 Segmented Tabs */}
      <div className="flex items-center p-1.5 mx-unit-3 mt-unit-3 rounded-xl bg-surface-container-low border border-outline-variant/25 gap-1">
        {[
          { key: 'identities', label: 'Identities' },
          { key: 'skills', label: 'Skills' },
          { key: 'memories', label: 'Memories' },
          { key: 'files', label: 'Files' },
          { key: 'behaviour', label: 'Behaviour' },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-1.5 px-2 rounded-lg font-label-caps text-[11px] uppercase transition-all cursor-pointer truncate ${
                isActive
                  ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-unit-4 flex flex-col gap-unit-4">
        {/* ================= TAB 1: IDENTITIES ================= */}
        {activeTab === 'identities' && (
          <div className="flex flex-col gap-unit-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-label-caps text-label-caps text-on-surface uppercase tracking-wider">
                  Persona Presets
                </span>
                <span className="font-code-sm text-code-sm text-outline">
                  ({allIdentities.length} total)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowNewIdentityModal(true)}
                className="px-unit-3 py-1.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/25 text-on-surface transition-colors flex items-center gap-1.5 font-label-caps text-label-caps cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 text-primary" />
                <span>Create New</span>
              </button>
            </div>

            {/* Persona Preset Cards */}
            <div className="flex flex-col gap-unit-3">
              {allIdentities.length === 0 && (
                <div className="rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container-low/40 p-unit-4 text-center">
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    No identities yet. An identity is a personality and instruction set you
                    give your agent — its tone, its rigour, how it writes. Add one when you
                    want the agent to behave differently from a plain assistant.
                  </p>
                </div>
              )}
              {allIdentities.map((persona) => {
                const isActive = persona.id === activeIdentityId;
                return (
                  <div
                    key={persona.id}
                    className={`group relative rounded-2xl p-unit-4 border transition-all duration-200 cursor-pointer shadow-sm ${
                      isActive
                        ? 'bg-surface-container border-primary/40 shadow-md'
                        : 'bg-surface-container-low/70 hover:bg-surface-container-low border-outline-variant/20'
                    }`}
                    onClick={() => onSelectIdentity(persona.id)}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-3 bottom-3 w-1 bg-primary rounded-r-full" />
                    )}

                    <div className="flex flex-col gap-unit-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-unit-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isActive
                                ? 'bg-primary/15 text-primary border border-primary/30'
                                : 'bg-surface-container-high text-on-surface-variant'
                            }`}
                          >
                            {getPersonaIcon(persona.iconType || persona.id, 'w-5 h-5')}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-headline-lg text-body-md font-semibold text-on-surface truncate">
                                {persona.title || persona.name}
                              </h3>
                              {persona.badge && (
                                <span className="font-chip-status text-[10px] text-sem-cyan bg-sem-cyan/10 border border-sem-cyan/20 px-1.5 py-0.5 rounded-md uppercase">
                                  {persona.badge}
                                </span>
                              )}
                            </div>
                            <p className="font-code-sm text-code-sm text-outline truncate mt-0.5">
                              {persona.tagline || 'Academic persona'}
                            </p>
                          </div>
                        </div>

                        {/* Status + delete. The delete control was wired here
                            once, then removed with its handler during the
                            09-06 workspace redesign — leaving no way to remove
                            an identity at all. Restored, and this time the
                            handler is actually passed by the parent. */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteIdentity(persona.id);
                            }}
                            className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
                            title={`Delete ${persona.title || persona.name}`}
                            aria-label={`Delete ${persona.title || persona.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectIdentity(persona.id);
                            }}
                            className={`px-unit-3 py-1 rounded-xl font-label-caps text-label-caps shrink-0 transition-all cursor-pointer ${
                              isActive
                                ? 'bg-primary text-on-primary font-semibold shadow-sm'
                                : 'bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant/30'
                            }`}
                          >
                            {isActive ? 'Active' : 'Switch'}
                          </button>
                        </div>
                      </div>

                      <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                        {persona.description}
                      </p>

                      {/* Telemetry Metrics Grid */}
                      <div className="grid grid-cols-3 gap-unit-2 pt-1">
                        <div className="bg-surface-container-lowest/70 border border-outline-variant/15 rounded-xl p-2 flex flex-col">
                          <span className="font-label-caps text-[9px] text-outline uppercase">
                            Reasoning Depth
                          </span>
                          <span className="font-tabular-stat-md text-[11px] text-primary font-medium mt-0.5 truncate">
                            {persona.reasoningDepth || 'Standard'}
                          </span>
                        </div>
                        <div className="bg-surface-container-lowest/70 border border-outline-variant/15 rounded-xl p-2 flex flex-col">
                          <span className="font-label-caps text-[9px] text-outline uppercase">
                            Writing Style
                          </span>
                          <span className="font-tabular-stat-md text-[11px] text-on-surface font-medium mt-0.5 truncate">
                            {persona.writingStyle || 'Formal'}
                          </span>
                        </div>
                        <div className="bg-surface-container-lowest/70 border border-outline-variant/15 rounded-xl p-2 flex flex-col">
                          <span className="font-label-caps text-[9px] text-outline uppercase">
                            Humanizer
                          </span>
                          <span className="font-tabular-stat-md text-[11px] text-sem-green font-medium mt-0.5 truncate">
                            {persona.detectorStealth || 'Standard'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 2: SKILLS ================= */}
        {activeTab === 'skills' && (
          <div className="flex flex-col gap-unit-4">
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-label-caps text-on-surface uppercase tracking-wider">
                Autonomous Capabilities
              </span>
              <button
                type="button"
                onClick={() => setShowNewSkillModal(true)}
                className="px-unit-3 py-1.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/25 text-on-surface transition-colors flex items-center gap-1.5 font-label-caps text-label-caps cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 text-primary" />
                <span>Add Skill</span>
              </button>
            </div>

            <div className="flex flex-col gap-unit-2">
                {skills.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container-low/40 p-unit-4 text-center">
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      No skills yet. A skill is a standing instruction your agent keeps —
                      always verify arithmetic, always cite sources, always check for
                      plagiarism. None are on by default.
                    </p>
                  </div>
                )}
              {skills.map((skill) => {
                const isEnabled = activeSkillIds.includes(skill.id) || skill.enabled;
                return (
                  <div
                    key={skill.id}
                    className="flex items-center justify-between p-unit-3 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 hover:border-outline-variant/35 transition-all"
                  >
                    <div className="flex items-center gap-unit-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-surface-container-high text-primary flex items-center justify-center shrink-0">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-body-sm text-body-sm font-semibold text-on-surface truncate">
                            {skill.name}
                          </p>
                          {skill.category && (
                            <span className="font-chip-status text-[9px] text-outline px-1.5 py-0.5 rounded bg-surface-container-highest">
                              {skill.category}
                            </span>
                          )}
                        </div>
                        <p className="font-code-sm text-code-sm text-on-surface-variant truncate">
                          {skill.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-3">
                      <button
                        type="button"
                        onClick={() => onDeleteSkill(skill.id)}
                        className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
                        title={`Delete ${skill.name}`}
                        aria-label={`Delete ${skill.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isEnabled}
                        onClick={() => onToggleSkill(skill.id)}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                          isEnabled ? 'bg-primary' : 'bg-surface-container-highest'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-surface-container-lowest shadow-sm transition-transform ${
                            isEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 3: MEMORIES ================= */}
        {activeTab === 'memories' && (
          <div className="flex flex-col gap-unit-4">
            <span className="font-label-caps text-label-caps text-on-surface uppercase tracking-wider">
              Permanent Knowledge Base
            </span>

            {/* Add Memory Box */}
            <div className="flex flex-col gap-2 p-unit-3 rounded-xl bg-surface-container-low border border-outline-variant/25">
              <textarea
                value={memoryText}
                onChange={(e) => setMemoryText(e.target.value)}
                placeholder="Teach your agent a permanent fact, style preference, or course guideline..."
                rows={2}
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-2.5 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={!memoryText.trim()}
                  onClick={() => {
                    if (memoryText.trim()) {
                      addMemory(memoryText.trim());
                      setMemoryText('');
                    }
                  }}
                  className="px-unit-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-caps text-label-caps font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save Memory</span>
                </button>
              </div>
            </div>

            {/* Memory List */}
            <div className="flex flex-col gap-unit-2">
              {memory.length === 0 ? (
                <div className="p-unit-4 text-center rounded-xl bg-surface-container-low/40 border border-outline-variant/15 text-outline font-body-sm">
                  No memories stored yet.
                </div>
              ) : (
                memory.map((item) => (
                  <div
                    key={item.id}
                    className="p-unit-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 flex items-start justify-between gap-unit-2 group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-body-sm text-body-sm text-on-surface leading-relaxed">
                        {item.text || item.content}
                      </p>
                      {item.created_at && (
                        <span className="font-code-sm text-[10px] text-outline mt-1 block">
                          {timeAgo(item.created_at)}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteMemory(item.id)}
                      className="p-1 rounded text-outline hover:text-error hover:bg-error-container/20 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                      title="Delete memory"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 4: RULES & FILES ================= */}
        {activeTab === 'files' && (
          <div className="flex flex-col gap-unit-4">
            <span className="font-label-caps text-label-caps text-on-surface uppercase tracking-wider">
              Uploaded Directives &amp; Files
            </span>

            {/* File Upload Button */}
            <div className="p-unit-4 rounded-xl bg-surface-container-low border border-dashed border-outline-variant/40 flex flex-col items-center justify-center text-center gap-2">
              <Upload className="w-6 h-6 text-primary" />
              <p className="font-body-sm text-body-sm text-on-surface font-medium">
                Upload prompt rules, syllabus files, or rubrics
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadFile(f, uploadKind);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 px-unit-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-primary border border-outline-variant/25 font-label-caps text-label-caps transition-colors cursor-pointer"
              >
                Choose File
              </button>
            </div>

            {/* Files List */}
            <div className="flex flex-col gap-unit-2">
              {files.length === 0 ? (
                <div className="p-unit-4 text-center rounded-xl bg-surface-container-low/40 border border-outline-variant/15 text-outline font-body-sm">
                  No custom directive files uploaded.
                </div>
              ) : (
                files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-unit-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 group"
                  >
                    <div className="flex items-center gap-unit-2 min-w-0">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="font-body-sm text-body-sm text-on-surface truncate">
                          {file.filename || file.name}
                        </p>
                        <span className="font-code-sm text-[10px] text-outline">
                          {file.kind || 'rule'} • {file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'file'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteFile(file.id)}
                      className="p-1 rounded text-outline hover:text-error hover:bg-error-container/20 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                      title="Delete file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {activeTab === 'behaviour' && (
          <div className="flex flex-col gap-unit-4">
            <div className="flex flex-col gap-1">
              <span className="font-label-caps text-label-caps text-on-surface uppercase tracking-wider">
                Educational mode
              </span>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {educationalMode
                  ? 'On — help is scoped to schoolwork. The agent keeps everything academic.'
                  : 'Off — the agent will chat about anything.'}
              </p>
            </div>

            <button
              type="button"
              id="educationalToggle"
              onClick={onToggleEducationalMode}
              aria-pressed={educationalMode}
              className={`h-11 px-unit-3 rounded-xl border flex items-center justify-between gap-micro-2 transition-all cursor-pointer ${
                educationalMode
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span className="font-label-caps text-label-caps uppercase">
                {educationalMode ? 'Educational mode ON' : 'Educational mode OFF'}
              </span>
              {/* A real switch, so the state reads at a glance. */}
              <span
                className={`w-10 h-6 rounded-full border flex items-center px-0.5 transition-all ${
                  educationalMode
                    ? 'bg-primary/30 border-primary/50 justify-end'
                    : 'bg-surface-container-high border-outline-variant/30 justify-start'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full ${
                    educationalMode ? 'bg-primary' : 'bg-on-surface-variant/50'
                  }`}
                />
              </span>
            </button>

            <p className="font-code-sm text-[11px] text-outline">
              This is sent with every agent request, so it applies to the site chat and the
              browser extension alike.
            </p>
          </div>
        )}
      </div>

      {/* Modal: Create Identity */}
      {showNewIdentityModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest border border-outline-variant/30 p-unit-5 flex flex-col gap-unit-4">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-lg text-title-md font-semibold text-on-surface">
                Create New Identity
              </h3>
              <button
                type="button"
                onClick={() => setShowNewIdentityModal(false)}
                className="p-1 text-outline hover:text-on-surface"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateIdentity} className="flex flex-col gap-unit-3">
              <div>
                <label className="font-label-caps text-xs text-outline uppercase block mb-1">
                  Persona Name
                </label>
                <input
                  type="text"
                  required
                  value={newIdName}
                  onChange={(e) => setNewIdName(e.target.value)}
                  placeholder="e.g. The Mathematician"
                  className="w-full rounded-lg bg-surface-container-low border border-outline-variant/20 p-2.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="font-label-caps text-xs text-outline uppercase block mb-1">
                  Tagline / Specialization
                </label>
                <input
                  type="text"
                  value={newIdTagline}
                  onChange={(e) => setNewIdTagline(e.target.value)}
                  placeholder="e.g. Algebraic Topology & Group Theory"
                  className="w-full rounded-lg bg-surface-container-low border border-outline-variant/20 p-2.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="font-label-caps text-xs text-outline uppercase block mb-1">
                  Core Instructions
                </label>
                <textarea
                  rows={3}
                  value={newIdInstructions}
                  onChange={(e) => setNewIdInstructions(e.target.value)}
                  placeholder="Describe reasoning style, tone, and verification standards..."
                  className="w-full rounded-lg bg-surface-container-low border border-outline-variant/20 p-2.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowNewIdentityModal(false)}
                  className="px-4 py-2 rounded-lg bg-surface-container text-on-surface text-xs font-label-caps uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-label-caps uppercase font-semibold"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Skill */}
      {showNewSkillModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest border border-outline-variant/30 p-unit-5 flex flex-col gap-unit-4">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-lg text-title-md font-semibold text-on-surface">
                Add Custom Skill
              </h3>
              <button
                type="button"
                onClick={() => setShowNewSkillModal(false)}
                className="p-1 text-outline hover:text-on-surface"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSkill} className="flex flex-col gap-unit-3">
              <div>
                <label className="font-label-caps text-xs text-outline uppercase block mb-1">
                  Skill Name
                </label>
                <input
                  type="text"
                  required
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  placeholder="e.g. Statistical Power Analysis"
                  className="w-full rounded-lg bg-surface-container-low border border-outline-variant/20 p-2.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="font-label-caps text-xs text-outline uppercase block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={newSkillDesc}
                  onChange={(e) => setNewSkillDesc(e.target.value)}
                  placeholder="Describe when and how this capability should activate..."
                  className="w-full rounded-lg bg-surface-container-low border border-outline-variant/20 p-2.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowNewSkillModal(false)}
                  className="px-4 py-2 rounded-lg bg-surface-container text-on-surface text-xs font-label-caps uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-label-caps uppercase font-semibold"
                >
                  Save Skill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
