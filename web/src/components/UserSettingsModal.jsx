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
  Video,
  Image as ImageIcon,
  FolderPlus,
  Compass,
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

const DEFAULT_SUBJECTS = [
  { id: 'subj_math', name: 'Mathematics', description: 'Calculus, linear algebra, statistics, discrete mathematics, and formal proofs', color: 'blue' },
  { id: 'subj_english', name: 'English & Literature', description: 'Literary analysis, rhetorical essays, creative writing, and close textual reading', color: 'purple' },
  { id: 'subj_history', name: 'History & Social Studies', description: 'Historiography, source evaluation, archival synthesis, and political science', color: 'amber' },
  { id: 'subj_cs', name: 'Computer Science', description: 'Algorithms, data structures, system architecture, and software engineering', color: 'emerald' },
  { id: 'subj_biology', name: 'Biology & Life Sciences', description: 'Cellular biology, genetics, ecology, physiology, and laboratory reports', color: 'teal' },
  { id: 'subj_psychology', name: 'Psychology & Cognitive Sciences', description: 'Empirical methodology, cognitive biases, behavioral neuroscience, and case studies', color: 'indigo' },
];

function getEffortInfo(score) {
  const s = Math.max(1, Math.min(1000, Number(score || 500)));
  if (s <= 350) {
    return {
      tier: 'Low Effort (1–350)',
      label: '🚀 Cost-Optimized & High-Throughput',
      color: 'text-amber-400',
      badgeColor: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
      description: 'Bulk lecture summaries, flashcard generation, and keyword extractions are heavily offloaded to ultra-efficient high-speed utility tiers.',
    };
  } else if (s <= 750) {
    return {
      tier: 'Medium Effort (351–750)',
      label: '⚖️ Balanced Rigor & Evasion',
      color: 'text-blue-400',
      badgeColor: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
      description: 'Balanced multi-agent orchestration pairing rubric parsing engines with structured drafting and multi-pass evasion synthesis.',
    };
  } else {
    return {
      tier: 'High Effort (751–1000)',
      label: '🧠 Flagship Cognitive Depth',
      color: 'text-emerald-400',
      badgeColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
      description: 'Maximum cognitive depth, rigorous multi-pass research, and deep reasoning passes offloaded to flagship cognitive synthesis tiers.',
    };
  }
}

/**
 * Universal Multi-Scoped Subsetting Control Component
 * Allows adding multiple distinct subsetting overrides (e.g. English: 300, Math: 850)
 * with individual value controls, target selectors, and delete buttons.
 */
function MultiScopedSettingControl({
  settingKey,
  settingLabel,
  valueType = 'number', // 'number' | 'select' | 'boolean'
  selectOptions = [],
  min = 1,
  max = 1000,
  defaultValue = 500,
  unitLabel = '',
  subSettings = [],
  customSubjects = [],
  onApplyToAll,
  onRemoveAll,
  onAddSubSetting,
  onDeleteSubSetting,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [targetType, setTargetType] = useState('subject');
  const [targetValue, setTargetValue] = useState('');
  const [customTargetText, setCustomTargetText] = useState('');
  const [overrideValue, setOverrideValue] = useState(defaultValue);

  const allSubjects = customSubjects.length > 0 ? customSubjects : DEFAULT_SUBJECTS;

  const handleAdd = (e) => {
    e.preventDefault();
    const finalTarget = targetType === 'subject'
      ? (targetValue || allSubjects[0]?.name || 'Mathematics')
      : customTargetText.trim();

    if (!finalTarget) return;

    onAddSubSetting(settingKey, {
      id: `subsetting_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      target_type: targetType,
      target_value: finalTarget,
      value: overrideValue,
      label: `${finalTarget}: ${overrideValue}${unitLabel}`,
    });

    setCustomTargetText('');
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
          <span>Subsetting Overrides ({subSettings.length}):</span>
          {subSettings.length === 0 ? (
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
              🌐 Universal Default Active
            </span>
          ) : (
            <span className="text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono">
              🎯 {subSettings.length} Distinct Subsetting{subSettings.length > 1 ? 's' : ''} Configured
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
        <div className="mt-3 p-4 rounded-xl bg-slate-950/70 border border-white/10 space-y-3.5 animate-fadeIn text-xs">
          {/* Active Subsettings List */}
          {subSettings.length > 0 && (
            <div className="space-y-2 pb-2 border-b border-white/5">
              <div className="text-[11px] font-semibold text-slate-400">Configured Subsettings:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {subSettings.map((sub) => (
                  <div
                    key={sub.id}
                    className="p-2.5 rounded-xl bg-slate-900 border border-blue-500/30 flex items-center justify-between gap-2"
                  >
                    <div className="truncate">
                      <span className="text-[10px] text-blue-400 uppercase font-mono mr-1.5 font-bold">
                        [{sub.target_type}]
                      </span>
                      <strong className="text-white text-xs">{sub.target_value}</strong>
                      <div className="text-[11px] text-emerald-400 font-mono mt-0.5 font-semibold">
                        Value: {String(sub.value)} {unitLabel}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteSubSetting(settingKey, sub.id)}
                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer shrink-0"
                      title="Delete Subsetting"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add New Subsetting Form */}
          <form onSubmit={handleAdd} className="space-y-2.5">
            <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>+ Add a New Subsetting Override</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Target Type Picker */}
              <select
                value={targetType}
                onChange={(e) => {
                  setTargetType(e.target.value);
                  if (e.target.value === 'subject' && allSubjects.length > 0) {
                    setTargetValue(allSubjects[0].name);
                  }
                }}
                className="bg-slate-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-white text-xs"
              >
                <option value="subject">Subject / Course</option>
                <option value="teacher">Specific Teacher</option>
                <option value="class">Class Code</option>
                <option value="assignment">Assignment Name</option>
              </select>

              {/* Target Value Input or Subject Dropdown */}
              {targetType === 'subject' ? (
                <select
                  value={targetValue || allSubjects[0]?.name}
                  onChange={(e) => setTargetValue(e.target.value)}
                  className="bg-slate-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-white text-xs sm:col-span-2"
                >
                  {allSubjects.map((s) => (
                    <option key={s.id || s.name} value={s.name}>
                      {s.name} {s.is_custom ? '(Custom)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder={`Enter ${targetType} (e.g. Dr. Miller)...`}
                  value={customTargetText}
                  onChange={(e) => setCustomTargetText(e.target.value)}
                  className="sm:col-span-2 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white text-xs placeholder:text-slate-600"
                />
              )}
            </div>

            {/* Value Selector for this specific Subsetting */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 pt-1">
              <span className="text-slate-400 text-xs shrink-0 font-medium">Subsetting Value:</span>

              {valueType === 'number' && (
                <div className="flex-1 flex items-center gap-3">
                  <input
                    type="range"
                    min={min}
                    max={max}
                    value={overrideValue}
                    onChange={(e) => setOverrideValue(Number(e.target.value))}
                    className="flex-1 accent-blue-500 cursor-pointer"
                  />
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={overrideValue}
                    onChange={(e) => setOverrideValue(Number(e.target.value))}
                    className="w-20 bg-slate-900 border border-white/10 rounded-xl px-2 py-1 text-white text-xs font-mono"
                  />
                  <span className="text-slate-400 text-[11px] font-mono">{unitLabel}</span>
                </div>
              )}

              {valueType === 'select' && (
                <select
                  value={overrideValue}
                  onChange={(e) => setOverrideValue(e.target.value)}
                  className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white text-xs"
                >
                  {selectOptions.map((opt) => (
                    <option key={opt.key || opt.value} value={opt.key || opt.value}>
                      {opt.label || opt.name}
                    </option>
                  ))}
                </select>
              )}

              {valueType === 'boolean' && (
                <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(overrideValue)}
                    onChange={(e) => setOverrideValue(e.target.checked)}
                    className="rounded accent-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="font-semibold">{overrideValue ? 'Enabled (ON)' : 'Disabled (OFF)'}</span>
                </label>
              )}

              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shrink-0 transition cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Subsetting</span>
              </button>
            </div>
          </form>
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
  const [customSubjects, setCustomSubjects] = useState(DEFAULT_SUBJECTS);

  // Custom Subject Form
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjDesc, setNewSubjDesc] = useState('');
  const [newSubjColor, setNewSubjColor] = useState('blue');
  const [addingSubj, setAddingSubj] = useState(false);

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
      fetchCustomSubjects();
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
    } catch (e) {}
  }

  async function fetchCustomSubjects() {
    try {
      const data = await api.getCustomSubjects();
      if (data?.subjects) setCustomSubjects(data.subjects);
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

  // Multi-Scoped Subsettings Handlers
  const getSubSettings = (settingKey) => {
    return settings?.scoped_subsettings?.[settingKey] || [];
  };

  const handleAddSubSetting = (settingKey, subEntry) => {
    const currentMap = { ...(settings?.scoped_subsettings || {}) };
    const list = [...(currentMap[settingKey] || []), subEntry];
    currentMap[settingKey] = list;
    handleSaveSettings({ scoped_subsettings: currentMap });
  };

  const handleDeleteSubSetting = (settingKey, subId) => {
    const currentMap = { ...(settings?.scoped_subsettings || {}) };
    currentMap[settingKey] = (currentMap[settingKey] || []).filter((s) => s.id !== subId);
    handleSaveSettings({ scoped_subsettings: currentMap });
  };

  const handleApplyToAll = (settingKey) => {
    const currentMap = { ...(settings?.scoped_subsettings || {}) };
    currentMap[settingKey] = [];
    handleSaveSettings({ scoped_subsettings: currentMap });
  };

  const handleRemoveAll = (settingKey) => {
    const currentMap = { ...(settings?.scoped_subsettings || {}) };
    currentMap[settingKey] = [];
    handleSaveSettings({ scoped_subsettings: currentMap });
  };

  // Add Custom Subject
  const handleAddCustomSubject = async (e) => {
    e.preventDefault();
    if (!newSubjName.trim() || !newSubjDesc.trim()) return;
    setAddingSubj(true);
    try {
      const res = await api.addCustomSubject({
        name: newSubjName.trim(),
        description: newSubjDesc.trim(),
        color: newSubjColor,
      });
      if (res?.subject) {
        setCustomSubjects((prev) => [...prev, res.subject]);
        setNewSubjName('');
        setNewSubjDesc('');
        setSaveStatus('✅ Custom subject added to global taxonomy');
        setTimeout(() => setSaveStatus(''), 2500);
      }
    } catch (e) {
      alert('Failed to add custom subject.');
    } finally {
      setAddingSubj(false);
    }
  };

  const handleDeleteCustomSubject = async (subjectId) => {
    try {
      await api.deleteCustomSubject(subjectId);
      setCustomSubjects((prev) => prev.filter((s) => s.id !== subjectId));
    } catch (e) {}
  };

  // Target Grade & Score Mapping
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

  // Add Style Sample
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

  // Data Lake
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

  // Permissions Rule
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

  // Connection & GDPR
  const handleSaveConnection = () => {
    setUserId(localUser.trim());
    setServer(localServer.trim());
    setSaveStatus('✅ Account connection updated');
    setTimeout(() => setSaveStatus(''), 2500);
  };

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
            <h2 className="text-base font-bold text-white">Personalization & Personal Settings Engine</h2>
            <p className="text-xs text-slate-400">Multi-scoped subsettings, Gemini 3.7 Flash studio, custom taxonomy, and auto-start pipeline</p>
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
            { key: 'gemini', label: 'Gemini 3.7 Flash Studio', icon: Video, badge: 'Multimodal' },
            { key: 'subjects', label: 'Custom Subjects Taxonomy', icon: FolderPlus, badge: `${customSubjects.length}` },
            { key: 'writing', label: 'Custom Writing Styles', icon: FileText },
            { key: 'detectors', label: 'AI Detector Toggles', icon: Shield },
            { key: 'datalake', label: 'Data Lake & Micro-Credits', icon: Tag, badge: `${settings?.micro_credits_balance || 0} cr` },
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

                    {/* Multi-Scoped Subsetting Overrides */}
                    <MultiScopedSettingControl
                      settingKey="academic_level"
                      settingLabel="Academic Level"
                      valueType="select"
                      selectOptions={academicLevels}
                      subSettings={getSubSettings('academic_level')}
                      customSubjects={customSubjects}
                      onApplyToAll={handleApplyToAll}
                      onRemoveAll={handleRemoveAll}
                      onAddSubSetting={handleAddSubSetting}
                      onDeleteSubSetting={handleDeleteSubSetting}
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

                    {/* Multi-Scoped Subsetting Overrides */}
                    <MultiScopedSettingControl
                      settingKey="target_score"
                      settingLabel="Target Score"
                      valueType="number"
                      min={0}
                      max={100}
                      defaultValue={88}
                      unitLabel="pts"
                      subSettings={getSubSettings('target_score')}
                      customSubjects={customSubjects}
                      onApplyToAll={handleApplyToAll}
                      onRemoveAll={handleRemoveAll}
                      onAddSubSetting={handleAddSubSetting}
                      onDeleteSubSetting={handleDeleteSubSetting}
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
                          <span><strong>Staged Approval Mode (Recommended):</strong> Scraped assignments wait in staging for user approval, rubric modifications, or custom source attachments before running.</span>
                        </div>
                      )}
                    </div>

                    {/* Multi-Scoped Subsetting Overrides for Auto-Start */}
                    <MultiScopedSettingControl
                      settingKey="auto_start"
                      settingLabel="Auto-Start Sub-Agents"
                      valueType="boolean"
                      defaultValue={false}
                      subSettings={getSubSettings('auto_start')}
                      customSubjects={customSubjects}
                      onApplyToAll={handleApplyToAll}
                      onRemoveAll={handleRemoveAll}
                      onAddSubSetting={handleAddSubSetting}
                      onDeleteSubSetting={handleDeleteSubSetting}
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
                          Lower scores offload bulk tasks to high-speed utility tiers. Higher scores route heavy synthesis to flagship cognitive deep reasoning tiers.
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

                    {/* Slider */}
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                        <span>1 (High-Speed Utility)</span>
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

                    {/* Multi-Scoped Subsetting Overrides (e.g. Math: 850, English: 300) */}
                    <MultiScopedSettingControl
                      settingKey="effort_score"
                      settingLabel="Effort Score"
                      valueType="number"
                      min={1}
                      max={1000}
                      defaultValue={500}
                      unitLabel="/1000"
                      subSettings={getSubSettings('effort_score')}
                      customSubjects={customSubjects}
                      onApplyToAll={handleApplyToAll}
                      onRemoveAll={handleRemoveAll}
                      onAddSubSetting={handleAddSubSetting}
                      onDeleteSubSetting={handleDeleteSubSetting}
                    />
                  </div>
                </div>
              )}

              {/* ─── 3. GEMINI 3.7 FLASH MULTIMODAL STUDIO ─── */}
              {activeTab === 'gemini' && (
                <div className="space-y-6">
                  <div className="clean-card p-6 space-y-4 border border-blue-500/30 bg-gradient-to-r from-blue-950/20 to-indigo-950/20">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                          <Video className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            Gemini 3.7 Flash Multimodal Sub-Agent
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Image & Video Generation, Visual Diagramming, and Video Assignment Interpretation.
                          </p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={settings.gemini_multimodal?.enabled !== false}
                          onChange={(e) =>
                            handleSaveSettings({
                              gemini_multimodal: {
                                ...(settings.gemini_multimodal || {}),
                                enabled: e.target.checked,
                              },
                            })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                      </label>
                    </div>

                    {/* Credit Usage Warning Banner */}
                    <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        <strong>Credit Consumption Notice:</strong> Multimodal video generation, image rendering, and high-resolution video prompt interpretation with Gemini 3.7 Flash consumes dynamic compute credits based on resolution and media duration.
                      </div>
                    </div>

                    {/* Auto-Spawn Sub-Agent Feature */}
                    <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-white">Auto-Spawn on Assignment Media</div>
                          <div className="text-[11px] text-slate-400">
                            When an assignment has video lectures, diagrams, or image attachments, automatically spawn Gemini 3.7 Flash into that assignment's sub-agent team bubble.
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.gemini_multimodal?.auto_spawn_on_media !== false}
                          onChange={(e) =>
                            handleSaveSettings({
                              gemini_multimodal: {
                                ...(settings.gemini_multimodal || {}),
                                auto_spawn_on_media: e.target.checked,
                              },
                            })
                          }
                          className="rounded accent-blue-500 w-4 h-4 cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Multi-Scoped Subsetting Overrides for Gemini */}
                    <MultiScopedSettingControl
                      settingKey="gemini_multimodal"
                      settingLabel="Gemini 3.7 Flash Auto-Spawn"
                      valueType="boolean"
                      defaultValue={true}
                      subSettings={getSubSettings('gemini_multimodal')}
                      customSubjects={customSubjects}
                      onApplyToAll={handleApplyToAll}
                      onRemoveAll={handleRemoveAll}
                      onAddSubSetting={handleAddSubSetting}
                      onDeleteSubSetting={handleDeleteSubSetting}
                    />
                  </div>
                </div>
              )}

              {/* ─── 4. CUSTOM SUBJECTS & TAXONOMY MANAGER ─── */}
              {activeTab === 'subjects' && (
                <div className="space-y-6">
                  <div className="clean-card p-5 space-y-4">
                    <div>
                      <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                        <FolderPlus className="w-4 h-4 text-blue-400" />
                        Custom Subjects & Curriculum Taxonomy
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Add custom subjects with specific descriptions. Once added, they are rendered everywhere across the website, assignment cards, filters, and team assignment bubbles.
                      </p>
                    </div>

                    {/* Add Subject Form */}
                    <form onSubmit={handleAddCustomSubject} className="p-4 rounded-xl bg-slate-950/60 border border-white/10 space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="Subject Name (e.g. Organic Chemistry, Macroeconomics)"
                          value={newSubjName}
                          onChange={(e) => setNewSubjName(e.target.value)}
                          className="sm:col-span-2 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white placeholder:text-slate-600"
                        />
                        <select
                          value={newSubjColor}
                          onChange={(e) => setNewSubjColor(e.target.value)}
                          className="bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white"
                        >
                          <option value="blue">Blue Badge</option>
                          <option value="purple">Purple Badge</option>
                          <option value="emerald">Emerald Badge</option>
                          <option value="amber">Amber Badge</option>
                          <option value="teal">Teal Badge</option>
                          <option value="rose">Rose Badge</option>
                        </select>
                      </div>

                      <textarea
                        rows={2}
                        placeholder="Subject Description (e.g. Molecular reaction mechanisms, laboratory write-ups, and synthesis pathways)..."
                        value={newSubjDesc}
                        onChange={(e) => setNewSubjDesc(e.target.value)}
                        className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-white placeholder:text-slate-600"
                      />

                      <button
                        type="submit"
                        disabled={addingSubj || !newSubjName.trim() || !newSubjDesc.trim()}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{addingSubj ? 'Registering Subject...' : 'Register Custom Subject'}</span>
                      </button>
                    </form>

                    {/* Active Subjects List */}
                    <div className="space-y-2 pt-2">
                      <h4 className="text-xs font-semibold text-slate-300">Active Curriculum Subjects ({customSubjects.length})</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {customSubjects.map((subj) => (
                          <div
                            key={subj.id || subj.name}
                            className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5 flex flex-col justify-between space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-semibold text-white">{subj.name}</span>
                                {subj.is_custom && (
                                  <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono ml-2">
                                    Custom
                                  </span>
                                )}
                              </div>
                              {subj.is_custom && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCustomSubject(subj.id)}
                                  className="text-slate-500 hover:text-rose-400 transition cursor-pointer"
                                  title="Delete Custom Subject"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">{subj.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── 5. CUSTOM WRITING STYLES (MULTI-SAMPLE DROPZONE) ─── */}
              {activeTab === 'writing' && (
                <div className="space-y-6">
                  <div className="clean-card p-5 space-y-4">
                    <div>
                      <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-400" />
                        Custom Writing Style Samples (Private Per User)
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Upload your past essays or writing samples. The AI emulates your exact authentic tone, lexical diversity, and cadence.
                      </p>
                    </div>

                    {/* Add Sample Form */}
                    <form onSubmit={handleAddStyleSample} className="p-4 rounded-xl bg-slate-950/60 border border-white/10 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <input
                          type="text"
                          placeholder="Sample Title (e.g. History Term Paper)"
                          value={sampleTitle}
                          onChange={(e) => setSampleTitle(e.target.value)}
                          className="bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white placeholder:text-slate-600"
                        />
                        <select
                          value={sampleSubject}
                          onChange={(e) => setSampleSubject(e.target.value)}
                          className="bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white"
                        >
                          <option value="All Subjects">All Subjects</option>
                          {customSubjects.map((s) => (
                            <option key={s.id || s.name} value={s.name}>{s.name}</option>
                          ))}
                        </select>
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
                  </div>
                </div>
              )}

              {/* ─── 6. AI DETECTOR TOGGLES ─── */}
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
                </div>
              )}

              {/* ─── 7. DATA LAKE & MICRO-CREDITS ─── */}
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
                    <div>
                      <h3 className="text-xs font-semibold text-white">Submit Training Data to Earn Micro-Credits</h3>
                      <p className="text-[11px] text-slate-400">
                        A dedicated AI sub-agent evaluates your submission on Relevance, Uniqueness, and Actionability (1–25 cr).
                      </p>
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
