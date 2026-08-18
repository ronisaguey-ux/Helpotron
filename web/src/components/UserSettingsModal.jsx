import React, { useState, useEffect } from 'react';
import api from '../api';
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

export default function UserSettingsModal({ isOpen, onClose, userId = 'RoniDev' }) {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const [academicLevels, setAcademicLevels] = useState(ACADEMIC_LEVELS);
  const [defaultStyles, setDefaultStyles] = useState({});

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
  const [trioOverrideTone, setTrioOverrideTone] = useState('formal');
  const [trioOverrideGrade, setTrioOverrideGrade] = useState('A');
  const [addingTrio, setAddingTrio] = useState(false);

  // Auto-approved rules state
  const [newRuleInput, setNewRuleInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
      fetchAcademicLevels();
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
          tone: trioOverrideTone,
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="clean-card rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-white/10 overflow-hidden animate-fadeIn text-slate-100">
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Context-Aware Personalization Engine</h2>
              <p className="text-xs text-slate-400">Granular academic levels, styles, detector toggles, and TRIO scopes</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saveStatus && <span className="text-xs font-mono text-emerald-400">{saveStatus}</span>}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Layout: Side Menu + Active Tab Stage */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          
          {/* Side Menu */}
          <nav className="w-full md:w-64 border-r border-white/10 bg-slate-950/40 p-3 space-y-1 overflow-y-auto shrink-0 text-xs">
            {[
              { key: 'general', label: 'General & Target Grade', icon: GraduationCap },
              { key: 'writing', label: 'Writing & Humanization', icon: FileText },
              { key: 'detectors', label: 'AI Detector Toggles', icon: Shield },
              { key: 'models', label: 'Model Selection', icon: Cpu },
              { key: 'datalake', label: 'Data Lake & Micro-Credits', icon: Tag, badge: `${settings?.micro_credits_balance || 0} cr` },
              { key: 'trio', label: 'Context & TRIO Scopes', icon: Layers },
              { key: 'permissions', label: 'Auto-Approved Actions', icon: CheckCircle2 },
              { key: 'notifications', label: 'Notifications', icon: Bell },
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

                {/* ─── 2. WRITING CUSTOMIZATION & HUMANIZATION ─── */}
                {activeTab === 'writing' && (
                  <div className="space-y-6">
                    {/* Custom Writing Style Multi-Sample Dropzone */}
                    <div className="clean-card p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-400" />
                            Custom Writing Style Samples (Private Per User)
                          </h3>
                          <p className="text-[11px] text-slate-400">
                            Upload your past essays or writing samples to emulate your exact tone and sentence rhythm.
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
                                className="text-slate-500 hover:text-rose-400 transition self-start sm:self-center"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Tone, Vocab, Sentence Length, Creativity Sliders */}
                    <div className="clean-card p-5 space-y-4">
                      <h3 className="text-xs font-semibold text-white">Writing Style Nuances & Dialect</h3>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div>
                          <label className="text-slate-400 block mb-1">Tone</label>
                          <select
                            value={settings.tone || 'formal'}
                            onChange={(e) => handleSaveSettings({ tone: e.target.value })}
                            className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white"
                          >
                            <option value="formal">Formal Academic</option>
                            <option value="semi_formal">Semi-Formal Analytical</option>
                            <option value="conversational">Conversational & Engaging</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-slate-400 block mb-1">Vocabulary Level</label>
                          <select
                            value={settings.vocabulary_level || 'advanced'}
                            onChange={(e) => handleSaveSettings({ vocabulary_level: e.target.value })}
                            className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white"
                          >
                            <option value="basic">Basic & Direct</option>
                            <option value="intermediate">Intermediate Collegiate</option>
                            <option value="advanced">Advanced Academic</option>
                            <option value="expert">Expert Scholarly</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-slate-400 block mb-1">Sentence Length Preference</label>
                          <select
                            value={settings.sentence_length || 'mixed'}
                            onChange={(e) => handleSaveSettings({ sentence_length: e.target.value })}
                            className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white"
                          >
                            <option value="short">Short & Concise</option>
                            <option value="medium">Medium Balanced</option>
                            <option value="long">Long & Complex</option>
                            <option value="mixed">Mixed Humanized (Recommended)</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-slate-400 block mb-1">Creativity Level</label>
                          <select
                            value={settings.creativity_level || 'balanced'}
                            onChange={(e) => handleSaveSettings({ creativity_level: e.target.value })}
                            className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white"
                          >
                            <option value="conservative">Conservative (Safe & Strict)</option>
                            <option value="balanced">Balanced</option>
                            <option value="creative">Creative (Unconventional)</option>
                          </select>
                        </div>
                      </div>

                      {/* Burstiness & Perplexity Sliders */}
                      <div className="pt-2 border-t border-white/5 space-y-4">
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-semibold text-slate-300">Burstiness Variance ({settings.burstiness || 88}%)</span>
                            <span className="text-slate-500 text-[11px]">Human sentence length fluctuation</span>
                          </div>
                          <input
                            type="range"
                            min="40"
                            max="100"
                            value={settings.burstiness || 88}
                            onChange={(e) => handleSaveSettings({ burstiness: Number(e.target.value) })}
                            className="w-full accent-blue-500 cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-semibold text-slate-300">Perplexity Depth ({settings.perplexity || 92}%)</span>
                            <span className="text-slate-500 text-[11px]">Cognitive lexical unpredictability</span>
                          </div>
                          <input
                            type="range"
                            min="40"
                            max="100"
                            value={settings.perplexity || 92}
                            onChange={(e) => handleSaveSettings({ perplexity: Number(e.target.value) })}
                            className="w-full accent-blue-500 cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── 3. AI DETECTOR TOGGLES ─── */}
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

                {/* ─── 4. MODEL SELECTION ─── */}
                {activeTab === 'models' && (
                  <div className="clean-card p-6 space-y-5">
                    <div>
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-blue-400" />
                        AI Execution Model Tier Selection
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Configure model tiers across initial drafts and final humanization passes.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      {/* Draft Model */}
                      <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5 space-y-3">
                        <div className="font-semibold text-white">Draft Generation Model</div>
                        <p className="text-[11px] text-slate-400">Used for fast outline generation and initial task structuring.</p>
                        <select
                          value={settings.model_selection?.draft_model || 'flash'}
                          onChange={(e) =>
                            handleSaveSettings({
                              model_selection: {
                                ...(settings.model_selection || {}),
                                draft_model: e.target.value,
                              },
                            })
                          }
                          className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white"
                        >
                          <option value="flash">⚡ Flash Model (Fast & Efficient)</option>
                          <option value="pro">🧠 Pro Model (Deep Synthesis)</option>
                        </select>
                      </div>

                      {/* Humanizer Model */}
                      <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5 space-y-3">
                        <div className="font-semibold text-white">Humanization & Final Polish Model</div>
                        <p className="text-[11px] text-slate-400">Used for deep stylistic variation and institutional evasion.</p>
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
                          <option value="flash">⚡ Flash Model (Fast Pass)</option>
                          <option value="pro">🧠 Pro Model (Highest Quality & Variance)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── 5. DATA LAKE & MICRO-CREDITS ─── */}
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

                {/* ─── 6. CONTEXT & TRIO SCOPES ─── */}
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

                {/* ─── 7. AUTO-APPROVED ACTIONS (PERMISSIONS) ─── */}
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

                {/* ─── 8. NOTIFICATIONS ─── */}
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
