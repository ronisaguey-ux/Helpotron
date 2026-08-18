import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function UserSettingsModal({ isOpen, onClose, userId }) {
  const [activeTab, setActiveTab] = useState('personas');
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Persona State
  const [newPersona, setNewPersona] = useState({
    name: '',
    tone: 'academic',
    vocabulary: 'standard_collegiate',
    sentence_length: 'varied',
    formality: 75,
  });

  // Citation & Plagiarism State
  const [origContent, setOrigContent] = useState('');
  const [autoRewrite, setAutoRewrite] = useState(false);
  const [origResult, setOrigResult] = useState(null);
  const [citForm, setCitForm] = useState({
    style: 'APA',
    source_type: 'journal_article',
    title: '',
    authors: '',
    year: '2026',
    url_or_doi: '',
    publisher: '',
  });
  const [citResult, setCitResult] = useState(null);
  const [library, setLibrary] = useState([]);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
      fetchLibrary();
    }
  }, [isOpen, userId]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/settings', {
        headers: { 'X-Public-ID': userId },
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
      }
    } catch (e) {
      console.error('Error loading settings', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchLibrary = async () => {
    try {
      const res = await fetch('/api/user/citations/library', {
        headers: { 'X-Public-ID': userId },
      });
      if (res.ok) {
        const data = await res.json();
        setLibrary(data.library || []);
      }
    } catch (e) {
      console.error('Error loading citations library', e);
    }
  };

  const saveSettings = async (partialUpdates) => {
    setSaving(true);
    setSaveStatus('');
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Public-ID': userId,
        },
        body: JSON.stringify(partialUpdates),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setSaveStatus('✅ Settings saved!');
        setTimeout(() => setSaveStatus(''), 2500);
      }
    } catch (e) {
      setSaveStatus('❌ Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePersona = async () => {
    if (!newPersona.name.trim()) return;
    try {
      const res = await fetch('/api/user/personas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Public-ID': userId,
        },
        body: JSON.stringify(newPersona),
      });
      if (res.ok) {
        fetchSettings();
        setNewPersona({
          name: '',
          tone: 'academic',
          vocabulary: 'standard_collegiate',
          sentence_length: 'varied',
          formality: 75,
        });
      }
    } catch (e) {
      console.error('Error creating persona', e);
    }
  };

  const handleSwitchPersona = async (personaId) => {
    try {
      await fetch('/api/user/personas/switch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Public-ID': userId,
        },
        body: JSON.stringify({ persona_id: personaId }),
      });
      fetchSettings();
    } catch (e) {
      console.error('Error switching persona', e);
    }
  };

  const handleDeletePersona = async (personaId) => {
    try {
      await fetch(`/api/user/personas/${personaId}`, {
        method: 'DELETE',
        headers: { 'X-Public-ID': userId },
      });
      fetchSettings();
    } catch (e) {
      console.error('Error deleting persona', e);
    }
  };

  const handleCheckOriginality = async () => {
    if (!origContent.trim()) return;
    try {
      const res = await fetch('/api/user/originality/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Public-ID': userId,
        },
        body: JSON.stringify({ content: origContent, auto_rewrite: autoRewrite }),
      });
      if (res.ok) {
        const data = await res.json();
        setOrigResult(data);
      }
    } catch (e) {
      console.error('Error checking originality', e);
    }
  };

  const handleGenerateCitation = async () => {
    if (!citForm.title.trim()) return;
    try {
      const payload = {
        ...citForm,
        authors: citForm.authors.split(',').map((a) => a.trim()).filter(Boolean),
      };
      const res = await fetch('/api/user/citations/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Public-ID': userId,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setCitResult(data.citation);
        // Save to library
        await fetch('/api/user/citations/library', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Public-ID': userId,
          },
          body: JSON.stringify(data.citation),
        });
        fetchLibrary();
      }
    } catch (e) {
      console.error('Error generating citation', e);
    }
  };

  const handleExportData = async () => {
    try {
      const res = await fetch('/api/user/data-export', {
        headers: { 'X-Public-ID': userId },
      });
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `helpotron_data_export_${userId}.json`;
        a.click();
      }
    } catch (e) {
      console.error('Error exporting data', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 text-slate-100 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <h2 className="text-lg font-bold text-white">User Settings & Preferences</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl font-bold px-2 py-1 rounded-lg hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 overflow-x-auto text-sm font-medium px-4">
          {[
            ['personas', '🎭 Personas'],
            ['context_digestion', '⚡ Context & Digestion'],
            ['goals', '🎯 Goals & Streaks'],
            ['display', '🎨 Display & Theme'],
            ['toggles', '👁️ Feature Toggles'],
            ['notifications', '🔔 Notifications'],
            ['privacy', '🔒 Privacy & GDPR'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-3 border-b-2 whitespace-nowrap transition-colors ${
                activeTab === key
                  ? 'border-blue-500 text-blue-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="py-12 text-center text-slate-400">Loading settings...</div>
          ) : !settings ? (
            <div className="py-12 text-center text-red-400">Failed to load settings.</div>
          ) : (
            <>
              {/* TAB 1: PERSONAS */}
              {activeTab === 'personas' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-white">Writing Persona Profiles</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Customize and switch writing cadence, formality, and vocabulary styles for AI generation.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {settings.personas?.map((p) => {
                      const isActive = settings.active_persona_id === p.id;
                      return (
                        <div
                          key={p.id}
                          className={`p-4 rounded-xl border transition-all ${
                            isActive
                              ? 'border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500'
                              : 'border-slate-800 bg-slate-800/40 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-sm text-white flex items-center gap-2">
                              {p.name}
                              {isActive && (
                                <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-bold">
                                  ACTIVE
                                </span>
                              )}
                            </h4>
                            {!isActive && (
                              <button
                                onClick={() => handleSwitchPersona(p.id)}
                                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-md transition"
                              >
                                Activate
                              </button>
                            )}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
                            <div><span className="text-slate-500">Tone:</span> {p.tone}</div>
                            <div><span className="text-slate-500">Formality:</span> {p.formality}%</div>
                            <div><span className="text-slate-500">Vocab:</span> {p.vocabulary}</div>
                            <div><span className="text-slate-500">Length:</span> {p.sentence_length}</div>
                          </div>
                          {!p.is_default && (
                            <button
                              onClick={() => handleDeletePersona(p.id)}
                              className="mt-3 text-xs text-red-400 hover:text-red-300"
                            >
                              Delete Persona
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Persona Form */}
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 space-y-3">
                    <h4 className="font-semibold text-sm text-slate-200">➕ Create New Persona Profile</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="text-slate-400 block mb-1">Persona Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Rigorous Scientific"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                          value={newPersona.name}
                          onChange={(e) => setNewPersona({ ...newPersona, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Tone</label>
                        <select
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                          value={newPersona.tone}
                          onChange={(e) => setNewPersona({ ...newPersona, tone: e.target.value })}
                        >
                          <option value="academic">Academic & Objective</option>
                          <option value="business">Business & Professional</option>
                          <option value="creative">Creative & Engaging</option>
                          <option value="technical">Deep Technical & Code</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Vocabulary Style</label>
                        <select
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                          value={newPersona.vocabulary}
                          onChange={(e) => setNewPersona({ ...newPersona, vocabulary: e.target.value })}
                        >
                          <option value="standard_collegiate">Standard Collegiate</option>
                          <option value="advanced_academic">Advanced Academic / Scholarly</option>
                          <option value="accessible">Accessible & Clear</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Formality Level ({newPersona.formality}%)</label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          className="w-full mt-2 accent-indigo-500"
                          value={newPersona.formality}
                          onChange={(e) => setNewPersona({ ...newPersona, formality: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleCreatePersona}
                      className="bg-slate-800 hover:bg-slate-700 text-white text-xs px-4 py-2 rounded-lg font-medium transition"
                    >
                      Save Persona Profile
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: GOALS & STREAKS */}
              {activeTab === 'goals' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                      <div className="text-xs text-slate-400">🔥 Current Submission Streak</div>
                      <div className="text-3xl font-extrabold text-amber-400 mt-1">
                        {settings.goals?.current_streak_days || 0} Days
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Keep completing assignments daily to preserve your multiplier.</p>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                      <div className="text-xs text-slate-400">🎯 Weekly Goal Target</div>
                      <div className="flex items-center gap-3 mt-2">
                        <input
                          type="number"
                          min="1"
                          max="30"
                          className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm"
                          value={settings.goals?.weekly_target_assignments || 5}
                          onChange={(e) =>
                            saveSettings({
                              goals: {
                                ...settings.goals,
                                weekly_target_assignments: Number(e.target.value),
                              },
                            })
                          }
                        />
                        <span className="text-xs text-slate-400">assignments / week</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/30">
                    <h4 className="font-semibold text-sm text-white mb-3">🏆 Badges & Achievements</h4>
                    <div className="flex flex-wrap gap-2">
                      {settings.goals?.badges_earned?.map((badge, idx) => (
                        <span
                          key={idx}
                          className="bg-indigo-950/60 border border-indigo-500/40 text-indigo-300 text-xs px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5"
                        >
                          🏅 {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: DISPLAY & THEME */}
              {activeTab === 'display' && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-slate-400 block mb-1">Theme Mode</label>
                      <select
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                        value={settings.display?.theme || 'dark'}
                        onChange={(e) =>
                          saveSettings({ display: { ...settings.display, theme: e.target.value } })
                        }
                      >
                        <option value="dark">Dark Theme (Default)</option>
                        <option value="light">Light Theme</option>
                        <option value="auto">System Match</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">Font Size</label>
                      <select
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                        value={settings.display?.font_size || 'medium'}
                        onChange={(e) =>
                          saveSettings({ display: { ...settings.display, font_size: e.target.value } })
                        }
                      >
                        <option value="small">Small</option>
                        <option value="medium">Medium (Standard)</option>
                        <option value="large">Large</option>
                        <option value="xlarge">Extra Large</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">Font Family</label>
                      <select
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                        value={settings.display?.font_family || 'sans-serif'}
                        onChange={(e) =>
                          saveSettings({ display: { ...settings.display, font_family: e.target.value } })
                        }
                      >
                        <option value="sans-serif">Sans-Serif (Modern)</option>
                        <option value="serif">Serif (Editorial)</option>
                        <option value="monospace">Monospace (Code Focus)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">Animation Level</label>
                      <select
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                        value={settings.display?.animation_level || 'full'}
                        onChange={(e) =>
                          saveSettings({ display: { ...settings.display, animation_level: e.target.value } })
                        }
                      >
                        <option value="full">Full Animations</option>
                        <option value="reduced">Reduced Motion</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={settings.display?.compact_mode || false}
                        onChange={(e) =>
                          saveSettings({ display: { ...settings.display, compact_mode: e.target.checked } })
                        }
                        className="rounded accent-indigo-500"
                      />
                      Compact Density Mode (Reduces padding for information density)
                    </label>
                  </div>
                </div>
              )}

              {/* TAB 5: FEATURE TOGGLES */}
              {activeTab === 'toggles' && (
                <div className="space-y-3 text-xs">
                  <p className="text-slate-400 mb-2">Toggle visibility of interface modules to reduce screen clutter:</p>
                  {Object.entries(settings.feature_toggles || {}).map(([key, val]) => (
                    <label key={key} className="flex items-center justify-between p-3 rounded-lg bg-slate-950/40 border border-slate-800 text-slate-200 cursor-pointer">
                      <span className="capitalize font-medium">{key.replace('_', ' ')}</span>
                      <input
                        type="checkbox"
                        checked={val}
                        onChange={(e) =>
                          saveSettings({
                            feature_toggles: {
                              ...settings.feature_toggles,
                              [key]: e.target.checked,
                            },
                          })
                        }
                        className="rounded accent-indigo-500"
                      />
                    </label>
                  ))}
                </div>
              )}

              {/* TAB 6: NOTIFICATIONS */}
              {activeTab === 'notifications' && (
                <div className="space-y-4 text-xs">
                  <div className="space-y-2">
                    {[
                      ['email_assignment_completion', 'Assignment Completion Alerts'],
                      ['email_feedback_updates', 'Feedback & Originality Updates'],
                      ['email_announcements', 'System Announcements & Features'],
                      ['email_security_alerts', 'Security & New Login Alerts'],
                      ['inapp_notifications', 'In-App Notification Banner'],
                    ].map(([k, label]) => (
                      <label key={k} className="flex items-center justify-between p-3 rounded-lg bg-slate-950/40 border border-slate-800 text-slate-200 cursor-pointer">
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={settings.notifications?.[k] || false}
                          onChange={(e) =>
                            saveSettings({
                              notifications: {
                                ...settings.notifications,
                                [k]: e.target.checked,
                              },
                            })
                          }
                          className="rounded accent-indigo-500"
                        />
                      </label>
                    ))}
                  </div>

                  {/* Quiet Hours */}
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-semibold">
                      <input
                        type="checkbox"
                        checked={settings.notifications?.quiet_hours_enabled || false}
                        onChange={(e) =>
                          saveSettings({
                            notifications: {
                              ...settings.notifications,
                              quiet_hours_enabled: e.target.checked,
                            },
                          })
                        }
                        className="rounded accent-indigo-500"
                      />
                      Enable Quiet Hours (Pause all alerts during sleep)
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-slate-400 block mb-1">Start Time</span>
                        <input
                          type="time"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                          value={settings.notifications?.quiet_hours_start || '22:00'}
                          onChange={(e) =>
                            saveSettings({
                              notifications: {
                                ...settings.notifications,
                                quiet_hours_start: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">End Time</span>
                        <input
                          type="time"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                          value={settings.notifications?.quiet_hours_end || '08:00'}
                          onChange={(e) =>
                            saveSettings({
                              notifications: {
                                ...settings.notifications,
                                quiet_hours_end: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 7: PRIVACY & GDPR */}
              {activeTab === 'privacy' && (
                <div className="space-y-4 text-xs">
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 space-y-2">
                    <h4 className="font-semibold text-white">Data Lake Participation</h4>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={settings.privacy?.datalake_opt_in ?? true}
                        onChange={(e) =>
                          saveSettings({
                            privacy: {
                              ...settings.privacy,
                              datalake_opt_in: e.target.checked,
                            },
                          })
                        }
                        className="rounded accent-indigo-500"
                      />
                      Share anonymized heuristic telemetry with the Training Data Lake to earn monthly discounts
                    </label>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-white">GDPR Data Export</h4>
                      <p className="text-slate-400 text-[11px]">Download all your assignments, transcripts, and account telemetry in JSON format.</p>
                    </div>
                    <button
                      onClick={handleExportData}
                      className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg font-medium transition"
                    >
                      Export Data (JSON)
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 8: CONTEXT & DIGESTION CONTROLS */}
              {activeTab === 'context_digestion' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold text-white">Advanced Context Controls</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Configure parameters for automated document digestion and background tasks.
                    </p>
                  </div>

                  <div className="space-y-5 border-t border-slate-800 pt-4">
                    {/* Token Budget Constraint Slider */}
                    <div className="space-y-2 p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                      <div className="flex justify-between items-center text-xs">
                        <label className="text-slate-300 font-medium">Context Window Allocation Limit</label>
                        <span className="text-blue-400 font-mono font-bold">
                          {(settings.context_controls?.token_budget ?? 250000).toLocaleString()} tokens
                        </span>
                      </div>
                      <input
                        type="range"
                        min={50000}
                        max={1000000}
                        step={50000}
                        value={settings.context_controls?.token_budget ?? 250000}
                        onChange={(e) =>
                          saveSettings({
                            context_controls: {
                              ...settings.context_controls,
                              token_budget: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full accent-blue-500 bg-slate-950 rounded-lg h-2 cursor-pointer"
                      />
                      <p className="text-[11px] text-slate-500">Maximum context tokens ingested during active assignment analysis and code synthesis.</p>
                    </div>

                    {/* Typing Export Speed Selection Dropdown */}
                    <div className="space-y-2 p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                      <label className="text-xs text-slate-300 block font-medium">Cloud Export Playback Vector Speed</label>
                      <select
                        value={settings.context_controls?.stream_speed ?? 'natural'}
                        onChange={(e) =>
                          saveSettings({
                            context_controls: {
                              ...settings.context_controls,
                              stream_speed: e.target.value,
                            },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="stealth">Stealth (Variable Delay 120-350ms per token)</option>
                        <option value="natural">Natural (Variable Delay 45-110ms per character)</option>
                        <option value="burst">Burst Continuous (Unchecked Pipeline Ingestion)</option>
                      </select>
                      <p className="text-[11px] text-slate-500">Controls typing simulation speed when synchronizing formatted drafts with LMS inputs.</p>
                    </div>

                    {/* DOM Document Scraping Depth Mode Toggle */}
                    <div className="space-y-2 p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                      <label className="text-xs text-slate-300 block font-medium">LMS/Canvas Document Digestion Depth</label>
                      <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                        {['surface', 'standard', 'deep'].map((depth) => {
                          const currentDepth = settings.context_controls?.parsing_depth ?? 'standard';
                          const isSelected = currentDepth === depth;
                          return (
                            <button
                              key={depth}
                              type="button"
                              onClick={() =>
                                saveSettings({
                                  context_controls: {
                                    ...settings.context_controls,
                                    parsing_depth: depth,
                                  },
                                })
                              }
                              className={`py-2 rounded-xl border capitalize transition font-medium ${
                                isSelected
                                  ? 'bg-blue-600/10 border-blue-500 text-blue-400'
                                  : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {depth}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-slate-500">Surface captures prompts only; Deep parses all nested rubric criteria, attachments, and sub-pages.</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
          <span className="text-xs text-slate-400">{saveStatus}</span>
          <button
            onClick={onClose}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-5 py-2 rounded-lg font-semibold transition shadow-lg shadow-indigo-500/20"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
