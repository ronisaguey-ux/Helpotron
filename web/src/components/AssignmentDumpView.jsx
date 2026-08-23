import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Mic,
  MicOff,
  Video,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowRight,
  FolderPlus,
  RefreshCw,
  Trash2,
  ExternalLink,
  Bot,
  Layers,
  Search,
} from 'lucide-react';
import api from '../api';
import SectionCard from './SectionCard.jsx';

export default function AssignmentDumpView({ userId = 'RoniDev', onSelectAssignment }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // all, matched, unmatched, audio
  const [selectedItem, setSelectedItem] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [selectedAssignId, setSelectedAssignId] = useState('');
  const [newAssignTitle, setNewAssignTitle] = useState('');
  const [createNew, setCreateNew] = useState(false);
  const [routing, setRouting] = useState(false);

  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const fetchItems = async () => {
    try {
      const res = await api.getDumpList(userId);
      if (res && res.status === 'success') {
        setItems(res.items || []);
      }
      const assignRes = await api.dashboard(50, 0);
      if (assignRes && assignRes.assignments) {
        setAssignments(assignRes.assignments);
      }
    } catch (e) {
      console.warn('Failed fetching dump items:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [userId]);

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('user_id', userId);
        await api.uploadDumpFile(formData);
      }
      await fetchItems();
    } catch (e) {
      alert(e.message || 'Error uploading file to Assignment Dump');
    } finally {
      setUploading(false);
    }
  };

  // Direct Audio Recording via Web Audio API
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `lecture_recording_${Date.now()}.webm`, { type: 'audio/webm' });
        await handleFileUpload([audioFile]);
      };

      mediaRecorderRef.current.start();
      setRecording(true);
    } catch (err) {
      alert('Microphone access denied or unsupported.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const handleManualRoute = async (e) => {
    e.preventDefault();
    if (!selectedItem) return;
    setRouting(true);
    try {
      await api.routeDumpItem(selectedItem.id, {
        assignment_id: createNew ? null : (Number(selectedAssignId) || null),
        create_new: createNew,
        new_assignment_title: newAssignTitle,
      }, userId);
      setRouteModalOpen(false);
      setSelectedItem(null);
      await fetchItems();
    } catch (e) {
      alert(e.message || 'Routing failed');
    } finally {
      setRouting(false);
    }
  };

  const handleDelete = async (dumpId) => {
    if (!confirm('Are you sure you want to delete this dumped item?')) return;
    try {
      await api.deleteDumpItem(dumpId);
      await fetchItems();
    } catch (e) {
      alert('Failed to delete item.');
    }
  };

  const filteredItems = items.filter((item) => {
    if (activeTab === 'matched') return item.status === 'matched' || item.status === 'manual_routed';
    if (activeTab === 'unmatched') return item.status === 'unmatched';
    if (activeTab === 'audio') return item.file_type === 'audio' || item.file_type === 'video';
    return true;
  });

  return (
    <div className="space-y-6 text-slate-100 max-w-6xl mx-auto animate-fadeIn">
      {/* Header Banner */}
      <SectionCard id="dump-header" className="rounded-3xl bg-slate-950/80 border border-blue-500/30 flex flex-col md:flex-row md:items-center justify-between gap-6" header={
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 text-2xl font-bold shrink-0">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] font-semibold mb-1">
              <Bot className="w-3.5 h-3.5" /> Overlord AI Auto-Routing
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Universal Assignment Dump</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Dump any document (PDF, Word), lecture audio (AI transcription), image, or video. Overlord AI auto-pairs it to the right assignment.
            </p>
          </div>
        </div>
      }>

        {/* Live Audio Record Button */}
        <div className="flex items-center gap-3 shrink-0">
          {!recording ? (
            <button
              type="button"
              onClick={startRecording}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-lg shadow-rose-600/20"
            >
              <Mic className="w-4 h-4" />
              <span>Record Lecture Live</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer animate-pulse"
            >
              <MicOff className="w-4 h-4" />
              <span>Stop & Transcribe (AI)</span>
            </button>
          )}
        </div>
      </SectionCard>

      {/* Universal Upload Dropzone */}
      <div className="clean-card rounded-3xl p-6 sm:p-8 bg-slate-950/60 border border-white/10 space-y-4">
        <input
          type="file"
          ref={fileInputRef}
          multiple
          onChange={(e) => handleFileUpload(Array.from(e.target.files || []))}
          className="hidden"
        />

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFileUpload(Array.from(e.dataTransfer.files || []));
          }}
          onClick={() => fileInputRef.current?.click()}
          className="p-8 border-2 border-dashed border-white/15 hover:border-blue-500/60 rounded-2xl bg-slate-900/60 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition"
        >
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">
              Drop any files here, or <span className="text-blue-400 underline">browse</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Supports PDF, DOCX, TXT, MP3, WAV, M4A, FLAC, JPG, PNG, TIFF, MP4, MOV
            </p>
          </div>
          {uploading && (
            <div className="flex items-center gap-2 text-xs text-blue-400 font-mono mt-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Overlord is parsing & transcribing with AI…</span>
            </div>
          )}
        </div>
      </div>

      {/* Filter Tabs & Content Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {['all', 'matched', 'unmatched', 'audio'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition cursor-pointer ${
                  activeTab === tab
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white bg-slate-900 border border-white/5'
                }`}
              >
                {tab === 'audio' ? '🎙️ Audio & Video' : tab}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400 font-mono">{filteredItems.length} dumped items</span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="clean-card rounded-3xl p-10 text-center text-xs text-slate-500">
            No items in this category. Dump a syllabus, lecture recording, or assignment doc above.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredItems.map((item) => {
              const isMatched = item.status === 'matched' || item.status === 'manual_routed';
              const confPct = Math.round((item.auto_match_confidence || 0) * 100);

              return (
                <SectionCard
                  id={`dump-item-${item.id}`}
                  className="rounded-2xl bg-slate-950/70 border border-white/10 flex flex-col justify-between gap-4 hover:border-blue-500/30 transition"
                  header={
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-slate-900 border border-white/10 text-blue-400 shrink-0">
                          {item.file_type === 'audio' && <Mic className="w-4 h-4 text-rose-400" />}
                          {item.file_type === 'video' && <Video className="w-4 h-4 text-amber-400" />}
                          {item.file_type === 'image' && <ImageIcon className="w-4 h-4 text-emerald-400" />}
                          {item.file_type === 'document' && <FileText className="w-4 h-4 text-blue-400" />}
                          {item.file_type === 'text' && <FileText className="w-4 h-4 text-slate-400" />}
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-white truncate max-w-[220px] sm:max-w-[280px]">
                            {item.file_name}
                          </h3>
                          <span className="text-[10px] text-slate-400 uppercase font-mono">
                            {item.file_type} • {(item.file_size_bytes / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold border ${
                          isMatched
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                        }`}
                      >
                        {isMatched ? `Auto-Paired (${confPct}%)` : 'Unmatched'}
                      </span>
                    </div>
                  }
                >
                  <div className="space-y-3">
                    {/* Extracted Preview / Markdown Snippet */}
                    <div className="p-3 bg-slate-900/80 rounded-xl border border-white/5 text-[11px] text-slate-300 font-mono max-h-24 overflow-y-auto leading-relaxed">
                      {item.extracted_text || 'No textual content extracted.'}
                    </div>

                    {/* Overlord Routing Note */}
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="truncate">{item.overlord_notes}</span>
                    </div>
                  </div>

                  {/* Action Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    {item.matched_assignment_id ? (
                      <div className="text-xs text-emerald-400 font-semibold truncate flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="truncate">{item.matched_assignment_title || `Assignment #${item.matched_assignment_id}`}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-amber-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Select Assignment
                      </span>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedItem(item);
                          setSelectedAssignId(item.matched_assignment_id || '');
                          setNewAssignTitle(item.file_name.replace(/\.[^/.]+$/, ''));
                          setRouteModalOpen(true);
                        }}
                        className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 rounded-lg text-xs font-semibold transition cursor-pointer"
                      >
                        {isMatched ? 'Re-Route' : 'Route Item'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition cursor-pointer"
                        title="Delete dump item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </SectionCard>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual Routing Modal */}
      {routeModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="clean-card w-full max-w-md p-6 bg-slate-950 border border-white/20 rounded-3xl space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-blue-400" />
                Route Dumped Material
              </h3>
              <button
                type="button"
                onClick={() => setRouteModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Attach <strong>{selectedItem.file_name}</strong> to an existing assignment or generate a brand new assignment from its contents.
            </p>

            <form onSubmit={handleManualRoute} className="space-y-3 text-xs">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCreateNew(false)}
                  className={`flex-1 py-2 rounded-xl font-semibold transition cursor-pointer ${
                    !createNew
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-900 text-slate-400 border border-white/10'
                  }`}
                >
                  Existing Assignment
                </button>
                <button
                  type="button"
                  onClick={() => setCreateNew(true)}
                  className={`flex-1 py-2 rounded-xl font-semibold transition cursor-pointer ${
                    createNew
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-900 text-slate-400 border border-white/10'
                  }`}
                >
                  Create New
                </button>
              </div>

              {!createNew ? (
                <div>
                  <label className="text-slate-400 block mb-1 text-[11px] font-semibold">Select Assignment</label>
                  <select
                    value={selectedAssignId}
                    onChange={(e) => setSelectedAssignId(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white text-xs"
                    required
                  >
                    <option value="">-- Select from your assignments --</option>
                    {assignments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} ({a.status})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-slate-400 block mb-1 text-[11px] font-semibold">New Assignment Title</label>
                  <input
                    type="text"
                    value={newAssignTitle}
                    onChange={(e) => setNewAssignTitle(e.target.value)}
                    placeholder="e.g. Calculus Lecture & Homework 4"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white text-xs"
                    required
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRouteModalOpen(false)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={routing}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition cursor-pointer"
                >
                  {routing ? 'Saving…' : 'Save Routing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
