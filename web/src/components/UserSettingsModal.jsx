import React, { useState, useEffect } from 'react';
import api, { getServer, setServer, setUserId } from '../api';
import {
  X,
  User,
  Sparkles,
  Shield,
  Sliders,
  Bell,
  Globe,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  Layers,
  BookOpen,
  GraduationCap,
  FileText,
  Tag,
  Cpu,
  RefreshCw,
  Send,
  DollarSign,
  TrendingUp,
  Lock,
  ListOrdered,
  FileCheck,
  Flame,
  Award,
  Download,
  ShieldCheck,
  ChevronRight,
  Gauge,
  PlayCircle,
  PauseCircle,
  Bot,
} from 'lucide-react';

const GRADE_LETTER_MAP = [
  { letter: 'F', min: 0, max: 59, default_num: 50 },
  { letter: 'F+', min: 60, max: 62, default_num: 61 },
  { letter: 'D', min: 63, max: 66, default_num: 65 },
  { letter: 'D+', min: 67, max: 69, default_num: 68 },
  { letter: 'C', min: 70, max: 73, default_num: 72 },
  { letter: 'C+', min: 74, max: 76, default_num: 75 },
  { letter: 'B', min: 77, max: 82, default_num: 80 },
  { letter: 'B+', min: 83, max: 86, default_num: 85 },
  { letter: 'A', min: 87, max: 92, default_num: 90 },
  { letter: 'A+', min: 93, max: 100, default_num: 98 },
];

function scoreToLetter(score) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  for (let i = GRADE_LETTER_MAP.length - 1; i >= 0; i--) {
    if (s >= GRADE_LETTER_MAP[i].min) {
      return GRADE_LETTER_MAP[i].letter;
    }
  }
  return 'F';
}

function letterToScore(letter) {
  const g = GRADE_LETTER_MAP.find((item) => item.letter.toUpperCase() === (letter || '').toUpperCase());
  return g ? g.default_num : 85;
}

const ACADEMIC_LEVELS = [
  { key: '3rd_grade', label: '3rd Grade (Elementary)' },
  { key: '4th_grade', label: '4th Grade (Elementary)' },
  { key: '5th_grade', label: '5th Grade (Elementary)' },
  { key: '6th_grade', label: '6th Grade (Middle School)' },
  { key: '7th_grade', label: '7th Grade (Middle School)' },
  { key: '8th_grade', label: '8th Grade (Middle School)' },
  { key: 'high_school', label: 'High School (Default)' },
  { key: 'undergrad_freshman', label: 'Undergraduate (Freshman/Sophomore)' },
  { key: 'undergrad_senior', label: 'Undergraduate (Junior/Senior)' },
  { key: 'masters', label: "Master's Graduate Scholar" },
  { key: 'phd_candidate', label: 'PhD Candidate / Researcher' },
  { key: 'phd_professor', label: 'PhD Professor / Principal Investigator' },
];

const MODEL_CATALOG = [
  {
    id: 'nemotron_3_super',
    name: 'Nemotron 3 Super (120B-A12B MoE)',
    pricing: '$0.085 – $0.10 / $0.40 – $0.50',
    context_window: '1,000,000 tokens',
    recommended_use: 'Bulk Lecture Summaries & Long Transcripts',
    description: 'Active-12B MoE architecture gives high throughput and low pricing with massive context.',
    tag: 'MoE High-Throughput',
  },
  {
    id: 'nemotron_nano_9b',
    name: 'Nemotron Nano (9B v2)',
    pricing: '$0.04 / $0.16',
    context_window: '131,072 tokens',
    recommended_use: 'Fast Flashcards & Term Extraction',
    description: 'Ultra-cheap, low-latency utility worker for repetitive keyword extraction.',
    tag: 'Ultra-Fast Utility',
  },
  {
    id: 'llama_nemotron_70b',
    name: 'Llama 3.1 Nemotron 70B Instruct',
    pricing: '$0.20 – $0.35 / $0.40 – $0.80',
    context_window: '131,072 tokens',
    recommended_use: 'Grading Rubrics & Practice Test Generation',
    description: 'Exceptionally strong instruction following from HelpSteer2 post-training.',
    tag: 'HelpSteer2 Precision',
  },
  {
    id: 'deepseek_r1_v3',
    name: 'DeepSeek R1 / V3 Thinking',
    pricing: '$0.14 / $0.55',
    context_window: '128,000 tokens',
    recommended_use: 'Cognitive Deep Reasoning & Academic Research',
    description: 'Flagship multi-step reasoning model with chain-of-thought verification.',
    tag: 'Deep Reasoning',
  },
  {
    id: 'pro',
    name: 'Pro Model Tier (Gemini / Claude Pro)',
    pricing: '$1.25 / $5.00',
    context_window: '200,000 tokens',
    recommended_use: 'High-Stakes Multi-Pass Evasion & Complex Synthesis',
    description: 'Elite synthesis and style replication engine.',
    tag: 'Elite Synthesis',
  },
  {
    id: 'flash',
    name: 'Flash Model Tier',
    pricing: '$0.075 / $0.30',
    context_window: '1,000,000 tokens',
    recommended_use: 'Sub-Second Outline Drafting',
    description: 'Ultra high-speed execution tier.',
    tag: 'Speed & Scale',
  },
];

function getEffortInfo(score) {
  const s = Math.max(1, Math.min(1000, Number(score || 500)));
  if (s <= 350) {
    return {
      tier: 'Low Effort (1–350)',
      label: '🚀 Cost-Optimized & High-Throughput',
      color: 'text-amber-400',
      badgeColor: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
      description: 'Bulk lecture summaries, flashcard generation, and term extraction are heavily offloaded to ultra-cheap utility models (Nemotron Nano 9B & Nemotron 3 Super MoE).',
    };
  } else if (s <= 750) {
    return {
      tier: 'Medium Effort (351–750)',
      label: '⚖️ Balanced Rigor & Evasion',
      color: 'text-blue-400',
      badgeColor: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
      description: 'Balanced orchestration pairing Llama 3.1 Nemotron 70B for rubrics with Flash & Pro synthesis passes.',
    };
  } else {
    return {
      tier: 'High Effort (751–1000)',
      label: '🧠 Flagship Cognitive Depth',
      color: 'text-emerald-400',
      badgeColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
      description: 'Maximum cognitive depth, rigorous multi-pass research, and deep reasoning passes offloaded to flagship models like DeepSeek R1/V3 and Pro Tier.',
    };
  }
}

/**
 * Reusable Scope Control Component
 * Every setting has a collapsible menu where users choose where that setting applies
 * (Subject, Teacher, Class, Assignment) with "Apply to All" and "Remove All".
 */
function SettingScopeControl({
  settingKey,
  settingLabel,
  scopes = [],
  onApplyToAll,
  onRemoveAll,
  onAddScope,
  onDeleteScope,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [targetType, setTargetType] = useState('subject');
  const [targetValue, setTargetValue] = useState('');

  const isGlobal = scopes.some((s) => s.apply_to_all) || scopes.length === 0;

  const handleAdd = (e) => {
    e.preventDefault();
    if (!targetValue.trim()) return;
    onAddScope(settingKey, targetType, targetValue.trim());
    setTargetValue('');
  };

  return (
    <div className="mt-3 pt-3 border-t border-white/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
        >
          <Layers className="w-3.5 h-3.5 text-blue-400" />
          <span>Scope:</span>
          {isGlobal ? (
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
              🌐 Applied to All (Universal)
            </span>
          ) : (
            <span className="text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono">
              🎯 Scoped to {scopes.length} Target{scopes.length > 1 ? 's' : ''}
            </span>
          )}
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </button>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onApplyToAll(settingKey)}
            className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-[11px] font-semibold transition cursor-pointer"
          >
            Apply to All
          </button>
          <button
            type="button"
            onClick={() => onRemoveAll(settingKey)}
            className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-[11px] font-semibold transition cursor-pointer"
          >
            Remove All
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 p-3 rounded-xl bg-slate-950/60 border border-white/10 space-y-2.5 animate-fadeIn text-xs">
          <form onSubmit={handleAdd} className="flex flex-wrap sm:flex-nowrap gap-2">
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs"
            >
              <option value="subject">Subject</option>
              <option value="teacher">Teacher</option>
              <option value="class">Class / Course Code</option>
              <option value="assignment">Specific Assignment</option>
            </select>
            <input
              type="text"
              placeholder={`Enter ${targetType} name (e.g. History 101, Dr. Miller)...`}
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="flex-1 bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs placeholder:text-slate-600"
            />
            <button
              type="submit"
              disabled={!targetValue.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded-lg text-xs font-semibold shrink-0 cursor-pointer"
            >
              + Add Target Scope
            </button>
          </form>

          {/* Active Target Scope Badges */}
          {scopes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {scopes.map((s, idx) => (
                <span
                  key={s.id || idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px]"
                >
                  <span className="font-semibold capitalize text-slate-300">{s.type}:</span>
                  <span className="font-mono text-white">{s.value}</span>
                  <button
                    type="button"
                    onClick={() => onDeleteScope(settingKey, s.id || idx)}
                    className="text-slate-400 hover:text-rose-400 ml-1 transition"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function UserSettingsModal({
  isOpen = true,
  isModal = false,
  onClose = () => {},
  userId = 'RoniDev',
  onOpenPrivacy = () => {},
}) {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const [academicLevels, setAcademicLevels] = useState(ACADEMIC_LEVELS);
  const [defaultStyles, setDefaultStyles] = useState({});
  const [modelsList, setModelsList] = useState(MODEL_CATALOG);

  // Style Sample Form State
  const [sampleTitle, setSampleTitle] = useState('');
  const [sampleContent, setSampleContent] = useState('');
  const [sampleSubject, setSampleSubject] = useState('All Subjects');
  const [sampleTeacher, setSampleTeacher] = useState('All Teachers');
  const [addingSample, setAddingSample] = useState(false);

  // Data Lake Submission Form State
  const [dataLakeType, setDataLakeType] = useState('teacher_quirk');
  const [dataLakeTitle, setDataLakeTitle] = useState('');
  const [dataLakeContent, setDataLakeContent] = useState('');
  const [submittingData, setSubmittingData] = useState(false);
  const [valuationResult, setValuationResult] = useState(null);
  const [dataLakeHistory, setDataLakeHistory] = useState([]);
  const [redeemAmount, setRedeemAmount] = useState(20);
  const [redeemMethod, setRedeemMethod] = useState('compute_credits');
  const [redeemMsg, setRedeemMsg] = useState('');

  // TRIO Rule Form State
  const [trioName, setTrioName] = useState('');
  const [trioTargetType, setTrioTargetType] = useState('subject');
  const [trioTargetValue, setTrioTargetValue] = useState('');
  const [trioRestriction, setTrioRestriction] = useState('');
  const [trioInclusion, setTrioInclusion] = useState('');
  const [trioApplyAll, setTrioApplyAll] = useState(false);
  const [trioOverrideGrade, setTrioOverrideGrade] = useState('A');
  const [addingTrio, setAddingTrio] = useState(false);

  // Auto-approved rules state
  const [newRuleInput, setNewRuleInput] = useState('');

  // Account & Connection state
  const [localUser, setLocalUser] = useState(userId);
  const [localServer, setLocalServer] = useState(getServer());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exportNotice, setExportNotice] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
      fetchAcademicLevels();
      fetchModels();
      fetchDataLakeHistory();
    }
  }, [isOpen, userId]);

  async function fetchSettings() {
    setLoading(true);
    try {
      const data = await api.getUserSettings();
      if (data?.settings) {
        setSettings(data.settings);
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAcademicLevels() {
    try {
      const data = await api.getAcademicLevels();
      if (data?.levels) setAcademicLevels(data.levels);
      if (data?.default_styles) setDefaultStyles(data.default_styles);
    } catch (e) {}
  }

  async function fetchModels() {
    try {
      const data = await api.getAvailableModels();
      if (data?.models) setModelsList(data.models);
    } catch (e) {}
  }

  async function fetchDataLakeHistory() {
    try {
      const data = await api.getMicrocreditsHistory(userId);
      if (data?.history) setDataLakeHistory(data.history);
    } catch (e) {}
  }

  async function handleSaveSettings(newPartial) {
    const updated = { ...settings, ...newPartial };
    setSettings(updated);
    try {
      await api.updateSettings(newPartial);
      setSaveStatus('✅ Settings saved');
      setTimeout(() => setSaveStatus(''), 2500);
    } catch (e) {
      setSaveStatus('⚠️ Failed to save changes');
      setTimeout(() => setSaveStatus(''), 2500);
    }
  }

  // Handle Scope Actions for any setting
  const getSettingScopes = (settingKey) => {
    return settings?.setting_scopes?.[settingKey] || [];
  };

  const handleApplyToAll = (settingKey) => {
    const currentScopes = { ...(settings?.setting_scopes || {}) };
    currentScopes[settingKey] = [{ id: 'global', type: 'global', value: 'All Scopes', apply_to_all: true }];
    handleSaveSettings({ setting_scopes: currentScopes });
  };

  const handleRemoveAll = (settingKey) => {
    const currentScopes = { ...(settings?.setting_scopes || {}) };
    currentScopes[settingKey] = [];
    handleSaveSettings({ setting_scopes: currentScopes });
  };

  const handleAddScope = (settingKey, type, value) => {
    const currentScopes = { ...(settings?.setting_scopes || {}) };
    const list = (currentScopes[settingKey] || []).filter((s) => !s.apply_to_all);
    list.push({ id: `scope_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`, type, value, apply_to_all: false });
    currentScopes[settingKey] = list;
    handleSaveSettings({ setting_scopes: currentScopes });
  };

  const handleDeleteScope = (settingKey, scopeId) => {
    const currentScopes = { ...(settings?.setting_scopes || {}) };
    currentScopes[settingKey] = (currentScopes[settingKey] || []).filter((s, idx) => s.id !== scopeId && idx !== scopeId);
    handleSaveSettings({ setting_scopes: currentScopes });
  };

  // Handle Target Grade & Score Mapping
  const handleScoreSliderChange = (num) => {
    const score = Number(num);
    const letter = scoreToLetter(score);
    handleSaveSettings({
      target_score_numeric: score,
      target_score_letter: letter,
    });
  };

  const handleLetterSelect = (letter) => {
    const score = letterToScore(letter);
    handleSaveSettings({
      target_score_letter: letter,
      target_score_numeric: score,
    });
  };

  // Add Custom Writing Style Sample
  const handleAddStyleSample = async (e) => {
    e.preventDefault();
    if (!sampleTitle.trim() || !sampleContent.trim()) return;
    setAddingSample(true);
    try {
      const res = await api.addStyleSample({
        title: sampleTitle.trim(),
        content: sampleContent.trim(),
        target_subject: sampleSubject,
        target_teacher: sampleTeacher,
      });
      if (res?.sample) {
        setSettings((prev) => ({
          ...prev,
          custom_style_samples: [...(prev.custom_style_samples || []), res.sample],
        }));
        setSampleTitle('');
        setSampleContent('');
        setSaveStatus('✅ Custom writing style sample added & analyzed');
        setTimeout(() => setSaveStatus(''), 2500);
      }
    } catch (e) {
      setSaveStatus('⚠️ Failed to add writing sample');
    } finally {
      setAddingSample(false);
    }
  };

  const handleDeleteStyleSample = async (sampleId) => {
    try {
      await api.deleteStyleSample(sampleId);
      setSettings((prev) => ({
        ...prev,
        custom_style_samples: (prev.custom_style_samples || []).filter((s) => s.id !== sampleId),
      }));
    } catch (e) {}
  };

  // Submit Data Lake Entry for Micro-Credits
  const handleSubmitDataLake = async (e) => {
    e.preventDefault();
    if (!dataLakeTitle.trim() || !dataLakeContent.trim()) return;
    setSubmittingData(true);
    setValuationResult(null);
    try {
      const res = await api.submitDataLakeMicrocredits({
        data_type: dataLakeType,
        title: dataLakeTitle.trim(),
        data_content: dataLakeContent.trim(),
        user_id: userId,
      });
      if (res?.submission) {
        setValuationResult(res.submission);
        setSettings((prev) => ({
          ...prev,
          micro_credits_balance: res.submission.new_total_balance,
        }));
        setDataLakeTitle('');
        setDataLakeContent('');
        fetchDataLakeHistory();
      }
    } catch (e) {
      alert('Failed to evaluate submission.');
    } finally {
      setSubmittingData(false);
    }
  };

  const handleRedeemMicrocredits = async () => {
    if (redeemAmount > (settings?.micro_credits_balance || 0)) {
      alert('Insufficient Micro-Credits balance.');
      return;
    }
    try {
      const res = await api.redeemMicrocredits({
        amount_credits: Number(redeemAmount),
        redemption_method: redeemMethod,
        user_id: userId,
      });
      setRedeemMsg(res?.message || '✅ Redemption processed successfully.');
      setSettings((prev) => ({
        ...prev,
        micro_credits_balance: Math.max(0, (prev.micro_credits_balance || 0) - Number(redeemAmount)),
      }));
      setTimeout(() => setRedeemMsg(''), 4000);
    } catch (e) {
      alert('Redemption failed.');
    }
  };

  // Add TRIO Rule
  const handleAddTrioRule = async (e) => {
    e.preventDefault();
    if (!trioApplyAll && !trioTargetValue.trim()) return;
    setAddingTrio(true);
    try {
      const rulePayload = {
        name: trioName.trim() || `${trioTargetType}: ${trioTargetValue}`,
        target: { type: trioTargetType, value: trioTargetValue.trim() },
        restriction: trioRestriction.trim() || null,
        inclusion: trioInclusion.trim() || null,
        apply_to_all: trioApplyAll,
        overrides: {
          target_score_letter: trioOverrideGrade,
          target_score_numeric: letterToScore(trioOverrideGrade),
        },
      };
      const res = await api.saveTrioRule(rulePayload);
      if (res?.rule) {
        setSettings((prev) => ({
          ...prev,
          trio_rules: [...(prev.trio_rules || []), res.rule],
        }));
        setTrioName('');
        setTrioTargetValue('');
        setTrioRestriction('');
        setTrioInclusion('');
      }
    } catch (e) {} finally {
      setAddingTrio(false);
    }
  };

  const handleDeleteTrioRule = async (ruleId) => {
    try {
      await api.deleteTrioRule(ruleId);
      setSettings((prev) => ({
        ...prev,
        trio_rules: (prev.trio_rules || []).filter((r) => r.id !== ruleId),
      }));
    } catch (e) {}
  };

  // Add Auto-Approved Action Rule
  const handleAddPermRule = () => {
    if (!newRuleInput.trim()) return;
    const rule = newRuleInput.trim();
    const existing = settings?.permissions?.auto_approved_rules || [];
    if (!existing.includes(rule)) {
      const updated = [...existing, rule];
      handleSaveSettings({
        permissions: { ...settings.permissions, auto_approved_rules: updated },
      });
    }
    setNewRuleInput('');
  };

  const handleDeletePermRule = (rule) => {
    const existing = settings?.permissions?.auto_approved_rules || [];
    const updated = existing.filter((r) => r !== rule);
    handleSaveSettings({
      permissions: { ...settings.permissions, auto_approved_rules: updated },
    });
  };

  // Save Account Connection
  const handleSaveConnection = () => {
    setUserId(localUser.trim());
    setServer(localServer.trim());
    setSaveStatus('✅ Account connection updated');
    setTimeout(() => setSaveStatus(''), 2500);
  };

  // Export Data Archive
  const handleExportData = async () => {
    try {
      const data = await api.dashboard(userId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `helpotron_data_export_${userId || 'student'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportNotice('✅ Data archive exported successfully');
      setTimeout(() => setExportNotice(''), 3000);
    } catch (e) {
      setExportNotice('❌ Failed to export data');
    }
  };

  const handleDeleteAccount = () => {
    try {
      localStorage.clear();
    } catch (e) {}
    window.location.reload();
  };

  if (!isOpen) return null;

  const currentEffortInfo = getEffortInfo(settings?.effort_score || 500);

  const content = (
    <div className={`clean-card rounded-3xl w-full flex flex-col shadow-2xl border border-white/10 overflow-hidden text-slate-100 ${isModal ? 'max-w-5xl max-h-[92vh]' : 'min-h-[750px]'}`}>
      
      {/* Header */}
      <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-950/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Personalization & Settings Engine</h2>
            <p className="text-xs text-slate-400">Academic level, effort score routing, Nemotron models, auto-start, and universal scopes</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus && <span className="text-xs font-mono text-emerald-400">{saveStatus}</span>}
          {isModal && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Layout: Side Menu + Active Tab Stage */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        
        {/* Side Menu */}
        <nav className="w-full md:w-64 border-r border-white/10 bg-slate-950/40 p-3 space-y-1 overflow-y-auto shrink-0 text-xs">
          {[
            { key: 'general', label: 'General & Target Grade', icon: GraduationCap },
            { key: 'effort_autostart', label: 'Effort & Auto-Start', icon: Gauge },
            { key: 'models', label: 'AI Models & Task Routing', icon: Cpu },
            { key: 'writing', label: 'Custom Writing Styles', icon: FileText },
            { key: 'detectors', label: 'AI Detector Toggles', icon: Shield },
            { key: 'datalake', label: 'Data Lake & Micro-Credits', icon: Tag, badge: `${settings?.micro_credits_balance || 0} cr` },
            { key: 'trio', label: 'Context & TRIO Scopes', icon: Layers },
            { key: 'permissions', label: 'Auto-Approved Actions', icon: CheckCircle2 },
            { key: 'notifications', label: 'Notifications', icon: Bell },
            { key: 'account', label: 'Account & Data Compliance', icon: Lock },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`} />
                  <span className="truncate">{tab.label}</span>
                </div>
                {tab.badge && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Tab Content Stage */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-xs">Loading personalization engine...</div>
          ) : !settings ? (
            <div className="py-16 text-center text-rose-400 text-xs">Failed to load user settings profile.</div>
          ) : (
            <>
              {/* ─── 1. GENERAL & TARGET GRADE ─── */}
              {activeTab === 'general' && (
                <div className="space-y-6">
                  {/* Target Academic Level */}
                  <div className="clean-card p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-white flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-blue-400" />
                        Target Academic Level (3rd Grade → PhD Professor)
                      </label>
                      <span className="text-[11px] text-blue-300 font-mono">
                        {academicLevels.find((l) => l.key === settings.academic_level)?.label || 'High School'}
                      </span>
                    </div>
                    <select
                      value={settings.academic_level || 'high_school'}
                      onChange={(e) => handleSaveSettings({ academic_level: e.target.value })}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      {academicLevels.map((l) => (
                        <option key={l.key} value={l.key}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-400">
                      The AI adapts writing style, vocabulary, sentence depth, and argument rigor to the selected academic level.
                    </p>

                    <SettingScopeControl
                      settingKey="academic_level"
                      settingLabel="Academic Level"
                      scopes={getSettingScopes('academic_level')}
                      onApplyToAll={handleApplyToAll}
                      onRemoveAll={handleRemoveAll}
                      onAddScope={handleAddScope}
                      onDeleteScope={handleDeleteScope}
                    />
                  </div>

                  {/* Dual Input Target Score System */}
                  <div className="clean-card p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-white">Default Target Grade & Score</h3>
                        <p className="text-[11px] text-slate-400">Baseline target score automatically applied to newly synthesized assignments.</p>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-blue-400 font-mono">{settings.target_score_letter || 'A'}</span>
                        <span className="text-xs text-slate-400 font-mono">({settings.target_score_numeric || 88}/100)</span>
                      </div>
                    </div>

                    {/* Letter Grade Buttons */}
                    <div className="flex flex-wrap gap-1.5">
                      {GRADE_LETTER_MAP.map((g) => {
                        const isSel = (settings.target_score_letter || 'A').toUpperCase() === g.letter;
                        return (
                          <button
                            key={g.letter}
                            type="button"
                            onClick={() => handleLetterSelect(g.letter)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                              isSel
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-slate-950 border border-white/10 text-slate-400 hover:text-white'
                            }`}
                          >
                            {g.letter}
                          </button>
                        );
                      })}
                    </div>

                    {/* Numeric 0-100 Slider */}
                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                        <span>0 (F)</span>
                        <span>Score: {settings.target_score_numeric || 88}</span>
                        <span>100 (A+)</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={settings.target_score_numeric || 88}
                        onChange={(e) => handleScoreSliderChange(e.target.value)}
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                    </div>

                    <SettingScopeControl
                      settingKey="target_score"
                      settingLabel="Target Grade & Score"
                      scopes={getSettingScopes('target_score')}
                      onApplyToAll={handleApplyToAll}
                      onRemoveAll={handleRemoveAll}
                      onAddScope={handleAddScope}
                      onDeleteScope={handleDeleteScope}
                    />
                  </div>

                  {/* Grade Scheduling Engine */}
                  <div className="clean-card p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-emerald-400" />
                          Grade Scheduling & Incremental Improvement Trajectory
                        </h3>
                        <p className="text-[11px] text-slate-400">Gradually ramps writing quality over time to mimic natural student progress.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.grade_scheduling?.enabled || false}
                        onChange={(e) =>
                          handleSaveSettings({
                            grade_scheduling: {
                              ...(settings.grade_scheduling || {}),
                              enabled: e.target.checked,
                            },
                          })
                        }
                        className="rounded accent-blue-500 w-4 h-4 cursor-pointer"
                      />
                    </div>

                    {settings.grade_scheduling?.enabled && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs border-t border-white/5">
                        <div>
                          <label className="text-slate-400 block mb-1">Starting Grade Score</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={settings.grade_scheduling?.start_score || 75}
                            onChange={(e) =>
                              handleSaveSettings({
                                grade_scheduling: {
                                  ...settings.grade_scheduling,
                                  start_score: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-white"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 block mb-1">Target End Goal</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={settings.grade_scheduling?.target_score || 92}
                            onChange={(e) =>
                              handleSaveSettings({
                                grade_scheduling: {
                                  ...settings.grade_scheduling,
                                  target_score: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-white"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 block mb-1">Increment Rate</label>
                          <div className="flex gap-1.5">
                            <input
                              type="number"
                              min="1"
                              max="20"
                              value={settings.grade_scheduling?.increment_points || 3}
                              onChange={(e) =>
                                handleSaveSettings({
                                  grade_scheduling: {
                                    ...settings.grade_scheduling,
                                    increment_points: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-16 bg-slate-950 border border-white/10 rounded-xl px-2 py-1.5 text-white"
                            />
                            <span className="self-center text-slate-400 text-[11px]">pts every 7 days</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <SettingScopeControl
                      settingKey="grade_scheduling"
                      settingLabel="Grade Scheduling"
                      scopes={getSettingScopes('grade_scheduling')}
                      onApplyToAll={handleApplyToAll}
                      onRemoveAll={handleRemoveAll}
                      onAddScope={handleAddScope}
                      onDeleteScope={handleDeleteScope}
                    />
                  </div>
                </div>
              )}

              {/* ─── 2. EFFORT & AUTO-START PIPELINE CONFIGURATION ─── */}
              {activeTab === 'effort_autostart' && (
                <div className="space-y-6">
                  {/* Auto-Start Setting */}
                  <div className="clean-card p-5 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                          <PlayCircle className="w-4 h-4 text-emerald-400" />
                          Auto-Start Assignment Sub-Agent Execution
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-1">
                          When assignments are scraped from LMS and organized into topic bubbles with sub-agent teams, choose whether they start automatically or pause in staging for review.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={settings.auto_start || false}
                          onChange={(e) => handleSaveSettings({ auto_start: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
                      </label>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 text-xs text-slate-300">
                      {settings.auto_start ? (
                        <div className="flex items-center gap-2 text-emerald-300">
                          <PlayCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                          <span><strong>Autonomous Mode Active:</strong> Newly scraped & organized assignments automatically trigger sub-agent team execution without manual staging.</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-amber-300">
                          <PauseCircle className="w-4 h-4 shrink-0 text-amber-400" />
                          <span><strong>Staged Approval Mode (Recommended):</strong> Scraped assignments wait in your inbox for approval, rubric modifications, or custom source attachments before running.</span>
                        </div>
                      )}
                    </div>

                    <SettingScopeControl
                      settingKey="auto_start"
                      settingLabel="Auto-Start Sub-Agents"
                      scopes={getSettingScopes('auto_start')}
                      onApplyToAll={handleApplyToAll}
                      onRemoveAll={handleRemoveAll}
                      onAddScope={handleAddScope}
                      onDeleteScope={handleDeleteScope}
                    />
                  </div>

                  {/* Effort Score Slider (1 - 1000) */}
                  <div className="clean-card p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                          <Gauge className="w-4 h-4 text-blue-400" />
                          AI Execution Effort Score (1 – 1000)
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Lower scores offload bulk tasks to cheap utility models (Nemotron Nano / 3 Super). Higher scores route heavy synthesis to flagship deep reasoning models (DeepSeek R1/V3 & Pro).
                        </p>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-blue-400 font-mono">{settings.effort_score || 500}</span>
                        <span className="text-xs text-slate-400 font-mono">/ 1000</span>
                      </div>
                    </div>

                    {/* Live Effort Tier Badge */}
                    <div className={`p-3 rounded-xl border text-xs space-y-1 ${currentEffortInfo.badgeColor}`}>
                      <div className="flex items-center justify-between font-bold">
                        <span>{currentEffortInfo.label}</span>
                        <span className="font-mono text-[11px]">{currentEffortInfo.tier}</span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">{currentEffortInfo.description}</p>
                    </div>

                    {/* Slider & Presets */}
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                        <span>1 (Cheapest / Ultra-Fast)</span>
                        <span>500 (Balanced Synthesis)</span>
                        <span>1000 (Maximum Cognitive Depth)</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="1000"
                        value={settings.effort_score || 500}
                        onChange={(e) => handleSaveSettings({ effort_score: Number(e.target.value) })}
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                    </div>

                    {/* Preset Buttons */}
                    <div className="flex flex-wrap gap-2 pt-1 text-xs">
                      {[
                        { label: '🚀 Cost-Saver (150)', val: 150 },
                        { label: '⚖️ Balanced (500)', val: 500 },
                        { label: '🧠 Deep Research (850)', val: 850 },
                        { label: '🏆 Maximum Rigor (1000)', val: 1000 },
                      ].map((p) => (
                        <button
                          key={p.val}
                          type="button"
                          onClick={() => handleSaveSettings({ effort_score: p.val })}
                          className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
                            settings.effort_score === p.val
                              ? 'bg-blue-600 text-white border-blue-500'
                              : 'bg-slate-950 border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    <SettingScopeControl
                      settingKey="effort_score"
                      settingLabel="Effort Score"
                      scopes={getSettingScopes('effort_score')}
                      onApplyToAll={handleApplyToAll}
                      onRemoveAll={handleRemoveAll}
                      onAddScope={handleAddScope}
                      onDeleteScope={handleDeleteScope}
                    />
                  </div>
                </div>
              )}

              {/* ─── 3. AI MODELS & TASK ROUTING ─── */}
              {activeTab === 'models' && (
                <div className="space-y-6">
                  {/* Model Catalog Transparency */}
                  <div className="clean-card p-5 space-y-4">
                    <div>
                      <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-blue-400" />
                        Integrated AI Model Catalog
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Transparent specs, pricing, context windows, and recommended task allocations.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {modelsList.map((m) => (
                        <div key={m.id} className="p-4 rounded-xl bg-slate-950/60 border border-white/5 space-y-2 flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-bold text-white text-xs">{m.name}</span>
                              <span className="text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded font-mono shrink-0">
                                {m.tag || 'Model'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{m.description}</p>
                          </div>
                          <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between text-[10px] font-mono text-slate-400">
                            <span>Price: <strong className="text-emerald-400">{m.pricing}</strong></span>
                            <span>Context: <strong className="text-slate-200">{m.context_window}</strong></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Granular Task Assignment Matrix */}
                  <div className="clean-card p-5 space-y-4 text-xs">
                    <h3 className="text-xs font-semibold text-white">Granular Task Model Routing</h3>
                    <p className="text-[11px] text-slate-400">
                      Override model assignments for specific sub-agent pipeline jobs.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Lecture Summaries */}
                      <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5 space-y-2">
                        <label className="font-semibold text-white flex items-center justify-between">
                          <span>📑 Bulk Summaries & Transcripts</span>
                          <span className="text-[10px] text-emerald-400 font-mono">1M Context</span>
                        </label>
                        <select
                          value={settings.model_selection?.summary_model || 'nemotron_3_super'}
                          onChange={(e) =>
                            handleSaveSettings({
                              model_selection: {
                                ...(settings.model_selection || {}),
                                summary_model: e.target.value,
                              },
                            })
                          }
                          className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white"
                        >
                          <option value="nemotron_3_super">Nemotron 3 Super (120B-A12B MoE) [Recommended]</option>
                          <option value="flash">Flash Model Tier</option>
                          <option value="deepseek_r1_v3">DeepSeek R1 / V3 Thinking</option>
                        </select>
                      </div>

                      {/* Flashcards */}
                      <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5 space-y-2">
                        <label className="font-semibold text-white flex items-center justify-between">
                          <span>🃏 Flashcards & Keywords</span>
                          <span className="text-[10px] text-blue-400 font-mono">Ultra-Cheap</span>
                        </label>
                        <select
                          value={settings.model_selection?.flashcard_model || 'nemotron_nano_9b'}
                          onChange={(e) =>
                            handleSaveSettings({
                              model_selection: {
                                ...(settings.model_selection || {}),
                                flashcard_model: e.target.value,
                              },
                            })
                          }
                          className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white"
                        >
                          <option value="nemotron_nano_9b">Nemotron Nano (9B v2) [Recommended]</option>
                          <option value="flash">Flash Model Tier</option>
                          <option value="llama_nemotron_70b">Llama 3.1 Nemotron 70B</option>
                        </select>
                      </div>

                      {/* Rubrics & Practice Tests */}
                      <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5 space-y-2">
                        <label className="font-semibold text-white flex items-center justify-between">
                          <span>📋 Rubrics & Practice Tests</span>
                          <span className="text-[10px] text-purple-400 font-mono">HelpSteer2</span>
                        </label>
                        <select
                          value={settings.model_selection?.rubric_model || 'llama_nemotron_70b'}
                          onChange={(e) =>
                            handleSaveSettings({
                              model_selection: {
                                ...(settings.model_selection || {}),
                                rubric_model: e.target.value,
                              },
                            })
                          }
                          className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white"
                        >
                          <option value="llama_nemotron_70b">Llama 3.1 Nemotron 70B Instruct [Recommended]</option>
                          <option value="deepseek_r1_v3">DeepSeek R1 / V3 Thinking</option>
                          <option value="pro">Pro Model Tier</option>
                        </select>
                      </div>

                      {/* Humanization & Evasion */}
                      <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5 space-y-2">
                        <label className="font-semibold text-white flex items-center justify-between">
                          <span>🛡️ Humanization & Polish</span>
                          <span className="text-[10px] text-rose-400 font-mono">High Variance</span>
                        </label>
                        <select
                          value={settings.model_selection?.humanizer_model || 'pro'}
                          onChange={(e) =>
                            handleSaveSettings({
                              model_selection: {
                                ...(settings.model_selection || {}),
                                humanizer_model: e.target.value,
                              },
                            })
                          }
                          className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white"
                        >
                          <option value="pro">Pro Model Tier (Gemini / Claude Pro) [Recommended]</option>
                          <option value="deepseek_r1_v3">DeepSeek R1 / V3 Thinking</option>
                          <option value="llama_nemotron_70b">Llama 3.1 Nemotron 70B</option>
                        </select>
                      </div>
                    </div>

                    <SettingScopeControl
                      settingKey="model_selection"
                      settingLabel="Model Tier Selection"
                      scopes={getSettingScopes('model_selection')}
                      onApplyToAll={handleApplyToAll}
                      onRemoveAll={handleRemoveAll}
                      onAddScope={handleAddScope}
                      onDeleteScope={handleDeleteScope}
                    />
                  </div>
                </div>
              )}

              {/* ─── 4. CUSTOM WRITING STYLES (MULTI-SAMPLE DROPZONE) ─── */}
              {activeTab === 'writing' && (
                <div className="space-y-6">
                  <div className="clean-card p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-400" />
                          Custom Writing Style Samples (Private Per User)
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Upload your past essays or writing samples. The AI emulates your exact authentic tone and rhythm.
                        </p>
                      </div>
                    </div>

                    {/* Add Sample Form */}
                    <form onSubmit={handleAddStyleSample} className="p-4 rounded-xl bg-slate-950/60 border border-white/10 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <input
                          type="text"
                          placeholder="Sample Title (e.g. My History Term Paper)"
                          value={sampleTitle}
                          onChange={(e) => setSampleTitle(e.target.value)}
                          className="sm:col-span-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white placeholder:text-slate-600"
                        />
                        <input
                          type="text"
                          placeholder="Target Subject (e.g. History)"
                          value={sampleSubject}
                          onChange={(e) => setSampleSubject(e.target.value)}
                          className="bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white placeholder:text-slate-600"
                        />
                        <input
                          type="text"
                          placeholder="Target Teacher (e.g. Dr. Miller)"
                          value={sampleTeacher}
                          onChange={(e) => setSampleTeacher(e.target.value)}
                          className="bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white placeholder:text-slate-600"
                        />
                      </div>
                      <textarea
                        rows={3}
                        placeholder="Paste writing excerpt or essay paragraph here for automated style extraction..."
                        value={sampleContent}
                        onChange={(e) => setSampleContent(e.target.value)}
                        className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-slate-600"
                      />
                      <button
                        type="submit"
                        disabled={addingSample || !sampleTitle.trim() || !sampleContent.trim()}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{addingSample ? 'Analyzing Style Traits...' : 'Extract & Save Style Sample'}</span>
                      </button>
                    </form>

                    {/* Saved Style Samples List */}
                    {settings.custom_style_samples?.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <h4 className="text-xs font-semibold text-slate-300">Saved Style Profiles ({settings.custom_style_samples.length})</h4>
                        {settings.custom_style_samples.map((sample) => (
                          <div key={sample.id} className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                            <div>
                              <div className="font-semibold text-white flex items-center gap-2">
                                <span>{sample.title}</span>
                                <span className="text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded font-mono">
                                  {sample.target_subject}
                                </span>
                              </div>
                              <div className="flex gap-3 text-[11px] text-slate-400 mt-1 font-mono">
                                <span>Avg Sentence: {sample.extracted_style?.avg_sentence_length} words</span>
                                <span>Lexical Diversity: {sample.extracted_style?.lexical_diversity}</span>
                                <span>Cadence: {sample.extracted_style?.cadence}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteStyleSample(sample.id)}
                              className="text-slate-500 hover:text-rose-400 transition self-start sm:self-center cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <SettingScopeControl
                      settingKey="custom_styles"
                      settingLabel="Custom Writing Styles"
                      scopes={getSettingScopes('custom_styles')}
                      onApplyToAll={handleApplyToAll}
                      onRemoveAll={handleRemoveAll}
                      onAddScope={handleAddScope}
                      onDeleteScope={handleDeleteScope}
                    />
                  </div>
                </div>
              )}

              {/* ─── 5. AI DETECTOR TOGGLES ─── */}
              {activeTab === 'detectors' && (
                <div className="clean-card p-6 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-400" />
                      Autonomous AI Detector Defense Toggles
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Enable or disable specific institutional AI evasion benchmarks for pre-submission scans.
                    </p>
                  </div>

                  <div className="space-y-3 pt-2">
                    {[
                      { key: 'pangram', name: 'Pangram Detector', desc: 'Institutional semantic entropy analyzer' },
                      { key: 'sapling', name: 'Sapling AI', desc: 'Syntactic consistency & n-gram predictive model' },
                      { key: 'originality_ai', name: 'Originality.ai', desc: 'Deep multi-layer neural classifier' },
                      { key: 'copyleaks', name: 'Copyleaks', desc: 'LMS-integrated pattern comparison' },
                      { key: 'winston_ai', name: 'Winston AI', desc: 'Educational and OCR content verification' },
                      { key: 'perplexity_cadence', name: 'Perplexity Cadence Gate', desc: 'Internal predictive uncertainty check' },
                      { key: 'statistical_burstiness', name: 'Statistical Burstiness Analyzer', desc: 'Variance across paragraph structure' },
                    ].map((det) => {
                      const isChecked = (settings.ai_detectors || {})[det.key] !== false;
                      return (
                        <label
                          key={det.key}
                          className={`flex items-center justify-between p-3.5 rounded-xl border transition cursor-pointer ${
                            isChecked
                              ? 'bg-blue-600/10 border-blue-500/30 text-white'
                              : 'bg-slate-950/30 border-white/5 text-slate-400'
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-xs text-white">{det.name}</div>
                            <div className="text-[11px] text-slate-400">{det.desc}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              handleSaveSettings({
                                ai_detectors: {
                                  ...(settings.ai_detectors || {}),
                                  [det.key]: e.target.checked,
                                },
                              })
                            }
                            className="rounded accent-blue-500 w-4 h-4 cursor-pointer"
                          />
                        </label>
                      );
                    })}
                  </div>

                  <SettingScopeControl
                    settingKey="ai_detectors"
                    settingLabel="AI Detector Defense Gates"
                    scopes={getSettingScopes('ai_detectors')}
                    onApplyToAll={handleApplyToAll}
                    onRemoveAll={handleRemoveAll}
                    onAddScope={handleAddScope}
                    onDeleteScope={handleDeleteScope}
                  />
                </div>
              )}

              {/* ─── 6. DATA LAKE & MICRO-CREDITS ─── */}
              {activeTab === 'datalake' && (
                <div className="space-y-6">
                  {/* Micro-Credits Balance Header */}
                  <div className="clean-card p-5 flex items-center justify-between bg-emerald-950/10 border border-emerald-500/20">
                    <div>
                      <div className="text-xs font-semibold text-emerald-300">My Training Data Lake Balance</div>
                      <div className="text-2xl font-black text-emerald-400 font-mono">
                        {settings.micro_credits_balance || 0} Micro-Credits
                      </div>
                      <p className="text-[11px] text-slate-400">100 Micro-Credits = $1.00 USD value</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={redeemMethod}
                        onChange={(e) => setRedeemMethod(e.target.value)}
                        className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        <option value="compute_credits">Redeem for Compute Credits</option>
                        <option value="stripe">Cash Out via Stripe</option>
                        <option value="cashapp">Cash Out via Cash App</option>
                        <option value="paypal">Cash Out via PayPal</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleRedeemMicrocredits}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                      >
                        Redeem 20 cr ($0.20)
                      </button>
                    </div>
                  </div>

                  {redeemMsg && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-mono">
                      {redeemMsg}
                    </div>
                  )}

                  {/* Data Submission Box with Sub-Agent Valuation */}
                  <div className="clean-card p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-white">Submit Training Data to Earn Micro-Credits</h3>
                        <p className="text-[11px] text-slate-400">
                          A dedicated AI sub-agent evaluates your submission on Relevance, Uniqueness, and Actionability (1–25 cr).
                        </p>
                      </div>
                    </div>

                    <form onSubmit={handleSubmitDataLake} className="space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <select
                          value={dataLakeType}
                          onChange={(e) => setDataLakeType(e.target.value)}
                          className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white"
                        >
                          <option value="assignment_score">Assignment Score: predicted vs actual (1–5 cr)</option>
                          <option value="teacher_quirk">Teacher Grading Quirks & Patterns (5–15 cr)</option>
                          <option value="lecture_notes">Lecture Notes & Transcripts (5–25 cr)</option>
                          <option value="instructor_feedback">Instructor Rubric Feedback (10–25 cr)</option>
                          <option value="feedback_sample">Detection & Evasion Feedback (10–25 cr)</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Title (e.g., Prof. Miller's grading criteria)"
                          value={dataLakeTitle}
                          onChange={(e) => setDataLakeTitle(e.target.value)}
                          className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-slate-600"
                        />
                      </div>

                      <textarea
                        rows={3}
                        placeholder="Provide empirical details, quotes, grading patterns, or lecture excerpts..."
                        value={dataLakeContent}
                        onChange={(e) => setDataLakeContent(e.target.value)}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-white placeholder:text-slate-600"
                      />

                      <button
                        type="submit"
                        disabled={submittingData || !dataLakeTitle.trim() || !dataLakeContent.trim()}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{submittingData ? 'Sub-Agent Ranking in Progress...' : 'Submit to Data Lake & Earn Credits'}</span>
                      </button>
                    </form>

                    {/* Live Valuation Breakdown Card */}
                    {valuationResult && (
                      <div className="p-4 rounded-xl bg-slate-950/80 border border-emerald-500/30 text-xs space-y-2 animate-fadeIn">
                        <div className="flex items-center justify-between text-emerald-400 font-bold">
                          <span>✅ Awarded +{valuationResult.credits_awarded} Micro-Credits</span>
                          <span className="font-mono">${valuationResult.usd_value} USD</span>
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">{valuationResult.valuation?.reasoning}</p>
                        <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[10px] text-slate-400">
                          <div>Relevance: {valuationResult.valuation?.relevance}/10</div>
                          <div>Uniqueness: {valuationResult.valuation?.uniqueness}/10</div>
                          <div>Actionability: {valuationResult.valuation?.actionability}/10</div>
                        </div>
                      </div>
                    )}

                    <SettingScopeControl
                      settingKey="data_lake"
                      settingLabel="Data Lake Contribution"
                      scopes={getSettingScopes('data_lake')}
                      onApplyToAll={handleApplyToAll}
                      onRemoveAll={handleRemoveAll}
                      onAddScope={handleAddScope}
                      onDeleteScope={handleDeleteScope}
                    />
                  </div>

                  {/* Submission History */}
                  {dataLakeHistory.length > 0 && (
                    <div className="clean-card p-5 space-y-3">
                      <h4 className="text-xs font-semibold text-white">Recent Data Lake Submissions</h4>
                      <div className="space-y-2">
                        {dataLakeHistory.map((sub, i) => (
                          <div key={i} className="p-3 rounded-xl bg-slate-950/40 border border-white/5 flex items-center justify-between text-xs">
                            <div>
                              <span className="font-semibold text-white">{sub.title}</span>
                              <span className="text-[10px] text-slate-500 ml-2 font-mono">{sub.data_type}</span>
                            </div>
                            <span className="text-emerald-400 font-mono font-bold">+{sub.credits_awarded} cr</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─── 7. CONTEXT & TRIO SCOPES ─── */}
              {activeTab === 'trio' && (
                <div className="space-y-6">
                  <div className="clean-card p-5 space-y-4">
                    <div>
                      <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                        <Layers className="w-4 h-4 text-blue-400" />
                        Context-Aware TRIO Overrides (Target, Restriction, Inclusion, Override)
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Settings cascade: <strong>Global → Subject → Class → Teacher → Assignment</strong>.
                      </p>
                    </div>

                    {/* Add TRIO Rule Form */}
                    <form onSubmit={handleAddTrioRule} className="p-4 rounded-xl bg-slate-950/60 border border-white/10 space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="Rule Name (e.g. History Essays Only)"
                          value={trioName}
                          onChange={(e) => setTrioName(e.target.value)}
                          className="bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white placeholder:text-slate-600"
                        />
                        <select
                          value={trioTargetType}
                          onChange={(e) => setTrioTargetType(e.target.value)}
                          className="bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white"
                        >
                          <option value="subject">Target: Specific Subject</option>
                          <option value="teacher">Target: Specific Teacher</option>
                          <option value="class">Target: Course Code</option>
                          <option value="assignment">Target: Specific Assignment</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Target Value (e.g. History 101 / Dr. Smith)"
                          value={trioTargetValue}
                          onChange={(e) => setTrioTargetValue(e.target.value)}
                          disabled={trioApplyAll}
                          className="bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white placeholder:text-slate-600 disabled:opacity-40"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Optional Restriction (e.g. Only for essays)"
                          value={trioRestriction}
                          onChange={(e) => setTrioRestriction(e.target.value)}
                          className="bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white placeholder:text-slate-600"
                        />
                        <input
                          type="text"
                          placeholder="Optional Inclusion Exception (e.g. Except Lab Reports)"
                          value={trioInclusion}
                          onChange={(e) => setTrioInclusion(e.target.value)}
                          className="bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white placeholder:text-slate-600"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={trioApplyAll}
                            onChange={(e) => setTrioApplyAll(e.target.checked)}
                            className="rounded accent-blue-500"
                          />
                          <span className="text-xs font-semibold text-blue-300">Apply to All (Universal Override)</span>
                        </label>

                        <button
                          type="submit"
                          disabled={addingTrio || (!trioApplyAll && !trioTargetValue.trim())}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Save TRIO Scope Rule</span>
                        </button>
                      </div>
                    </form>

                    {/* Active TRIO Rules List */}
                    {settings.trio_rules?.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <h4 className="text-xs font-semibold text-slate-300">Active TRIO Scope Rules</h4>
                        {settings.trio_rules.map((rule) => (
                          <div key={rule.id} className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5 flex items-center justify-between text-xs">
                            <div>
                              <span className="font-semibold text-white">{rule.name}</span>
                              <span className="text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded font-mono ml-2">
                                {rule.apply_to_all ? 'UNIVERSAL' : `${rule.target?.type}: ${rule.target?.value}`}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteTrioRule(rule.id)}
                              className="text-slate-500 hover:text-rose-400 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─── 8. AUTO-APPROVED ACTIONS (PERMISSIONS) ─── */}
              {activeTab === 'permissions' && (
                <div className="clean-card p-6 space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Auto-Approved Actions & Rules Manager
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Actions matching these rules bypass confirmation prompts in Manual and Auto modes.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. generate_flashcards, audit_rubric, summarize_lecture"
                      value={newRuleInput}
                      onChange={(e) => setNewRuleInput(e.target.value)}
                      className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddPermRule}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                    >
                      + Add Rule
                    </button>
                  </div>

                  <div className="space-y-2 pt-2">
                    {(settings.permissions?.auto_approved_rules || []).map((rule) => (
                      <div key={rule} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-white/5 text-xs">
                        <span className="font-mono text-emerald-400 font-semibold">✅ {rule}</span>
                        <button
                          type="button"
                          onClick={() => handleDeletePermRule(rule)}
                          className="text-xs text-slate-500 hover:text-rose-400 transition cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  <SettingScopeControl
                    settingKey="auto_approved_rules"
                    settingLabel="Auto-Approved Rules"
                    scopes={getSettingScopes('auto_approved_rules')}
                    onApplyToAll={handleApplyToAll}
                    onRemoveAll={handleRemoveAll}
                    onAddScope={handleAddScope}
                    onDeleteScope={handleDeleteScope}
                  />
                </div>
              )}

              {/* ─── 9. NOTIFICATIONS ─── */}
              {activeTab === 'notifications' && (
                <div className="clean-card p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Bell className="w-4 h-4 text-blue-400" />
                    Alerts & Multi-Channel Notifications
                  </h3>

                  <div className="space-y-3 pt-2 text-xs">
                    {[
                      { key: 'email_assignment_completion', label: 'Email upon assignment completion' },
                      { key: 'inapp_notifications', label: 'In-App real-time toast alerts' },
                      { key: 'telegram_notifications', label: 'Telegram Agent status notifications' },
                    ].map((notif) => {
                      const isChecked = (settings.notifications || {})[notif.key] !== false;
                      return (
                        <label key={notif.key} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-white/5 cursor-pointer">
                          <span className="text-slate-300">{notif.label}</span>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              handleSaveSettings({
                                notifications: {
                                  ...(settings.notifications || {}),
                                  [notif.key]: e.target.checked,
                                },
                              })
                            }
                            className="rounded accent-blue-500 w-4 h-4 cursor-pointer"
                          />
                        </label>
                      );
                    })}
                  </div>

                  <SettingScopeControl
                    settingKey="notifications"
                    settingLabel="Notifications"
                    scopes={getSettingScopes('notifications')}
                    onApplyToAll={handleApplyToAll}
                    onRemoveAll={handleRemoveAll}
                    onAddScope={handleAddScope}
                    onDeleteScope={handleDeleteScope}
                  />
                </div>
              )}

              {/* ─── 10. ACCOUNT CONNECTION & DATA COMPLIANCE ─── */}
              {activeTab === 'account' && (
                <div className="space-y-6">
                  {/* Account Connection */}
                  <div className="clean-card p-5 space-y-3 text-xs">
                    <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                      <Lock className="w-4 h-4 text-blue-400" />
                      Account Connection & Storage
                    </h3>
                    <div>
                      <label className="text-slate-400 block mb-1">Server Endpoint URL</label>
                      <input
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono"
                        value={localServer}
                        onChange={(e) => setLocalServer(e.target.value)}
                        placeholder="Auto-detected origin"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">User Account ID (Public Token)</label>
                      <input
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono"
                        value={localUser}
                        onChange={(e) => setLocalUser(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveConnection}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition cursor-pointer"
                    >
                      Save Account Connection
                    </button>
                  </div>

                  {/* Privacy & Data Compliance */}
                  <div className="clean-card p-5 space-y-3 text-xs">
                    <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      Privacy & Data Compliance
                    </h3>

                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={onOpenPrivacy}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-950/40 hover:bg-white/5 border border-white/5 text-slate-300 transition cursor-pointer"
                      >
                        <span>Read Complete Privacy & Compliance Policy</span>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>

                      <button
                        type="button"
                        onClick={handleExportData}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-950/40 hover:bg-white/5 border border-white/5 text-blue-300 transition cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <Download className="w-4 h-4" /> Export Study Data (.json archive)
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>

                      {exportNotice && (
                        <div className="text-emerald-400 text-xs px-2 py-1 font-mono">{exportNotice}</div>
                      )}

                      <button
                        type="button"
                        onClick={() => setConfirmDelete(!confirmDelete)}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-rose-950/20 hover:bg-rose-950/40 border border-rose-500/20 text-rose-300 transition cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <Trash2 className="w-4 h-4" /> Delete Account & Wipe Cache
                        </span>
                        <ChevronRight className="w-4 h-4 text-rose-400" />
                      </button>

                      {confirmDelete && (
                        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 space-y-3">
                          <p className="text-xs text-rose-200">
                            Are you sure? This will purge all cached study sessions and reset settings.
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleDeleteAccount}
                              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold cursor-pointer"
                            >
                              Confirm & Wipe
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(false)}
                              className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (!isModal) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      {content}
    </div>
  );
}
