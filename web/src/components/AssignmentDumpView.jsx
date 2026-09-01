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
  Sparkles,
  FolderPlus,
  RefreshCw,
  Trash2,
  Bot,
} from 'lucide-react';
import api from '../api';
import SectionCard from './SectionCard.jsx';
import { loadSettings } from '../demoData.js';

/* Aurora semantic chip tints (scoped): .aurora-chip keeps its glass pill
   base from index.css; these modifiers recolor it for status semantics. */
const AURORA_CHIP_TINTS = `
.aurora-chip.ok    { background: rgba(16,185,129,0.14); border-color: rgba(16,185,129,0.32); color: #6ee7b7; }
.aurora-chip.warn  { background: rgba(245,158,11,0.14); border-color: rgba(245,158,11,0.32); color: #fcd34d; }
.aurora-chip.tight { padding: 0.15rem 0.6rem; font-size: 0.75rem; }
`;

// Assignment type choices shown when a dumped item is finalized (user flow:
// "what typa assignment the user wants to do, like a flashcard, practice quiz,
// or just actually do it"). Cost is computed from content length (A3/A14 rule: 1 token = 1 cent).
const FINALIZE_OPTIONS = [
  { action: 'do_it', label: 'Complete the Assignment (Do It For Me)', icon: '✍️', subagent: 'Researched Synthesis', desc: 'Generates full finished essay, problem set solutions, or paper according to rubric.' },
  { action: 'study_guide', label: 'Exam Study Guide', icon: '📖', subagent: 'Semantic Condenser', desc: 'Summarizes key terms, critical dates, formulas, and concepts into a clean guide.' },
  { action: 'practice_quiz', label: 'Practice Exam & Quiz', icon: '🧠', subagent: 'Psychometric Evaluation', desc: 'Creates 10 multiple-choice questions with full answer keys and explanations.' },
  { action: 'flashcards', label: 'Spaced Flashcard Deck', icon: '🗂️', subagent: 'Anki / Leitner Engine', desc: 'Builds interactive review cards ready for active-recall memorization.' },
];

function estimateContentTokens(item) {
  const textLen = (item?.extracted_text || '').length;
  if (!textLen) return 'Est. ~1 Token ($0.01)';
  const inputTokens = Math.max(100, Math.round(textLen / 4));
  const estOutputTokens = Math.max(250, Math.min(4000, Math.round(inputTokens * 0.6)));
  const estTokens = Math.max(1, Math.ceil((inputTokens + estOutputTokens * 1.5) / 1000));
  return `Est. ~${estTokens} ${estTokens === 1 ? 'Token' : 'Tokens'} ($${(estTokens * 0.01).toFixed(2)})`;
}
const FINALIZE_BADGE = {
  do_it: '✍️ Do It For Me',
  study_guide: '📖 Study Guide',
  practice_quiz: '🧠 Practice Quiz',
  flashcards: '🗂️ Flashcards',
  summary: '📄 Summary',
};

export default function AssignmentDumpView({ userId = '', onSelectAssignment }) {
  const agentName = loadSettings().ai?.aiName || 'Overlord';
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
  const [finalizingId, setFinalizingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [resultView, setResultView] = useState(null); // { title, work } for finalized work drawer
  const [pasteText, setPasteText] = useState('');

  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const toastTimerRef = useRef(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const fetchItems = async () => {
    try {
      const res = await api.getDumpList(userId);
      if (res && res.status === 'success') {
        setItems(res.items || []);
      }
      const assignRes = await api.dashboard(userId, 50, 0);
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

  const dumpTargetToast = (res) => {
    if (!res?.matched_assignment_id) return null;
    const target = res.matched_assignment_title || `assignment #${res.matched_assignment_id}`;
    return res.item_status === 'auto_routed'
      ? `Routed to the "${target}" bubble — a new one was created from your dump.`
      : `Routed to the "${target}" bubble.`;
  };

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      let lastRes = null;
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('user_id', userId);
        lastRes = await api.uploadDumpFile(formData);
      }
      await fetchItems();
      const msg = dumpTargetToast(lastRes);
      if (msg) showToast(msg);
    } catch (e) {
      alert(e.message || 'Error uploading file to Assignment Dump');
    } finally {
      setUploading(false);
    }
  };

  // Paste-text dump: wrap the assignment text in a .txt file and run it
  // through the same upload pipeline (engine already extracts txt).
  const handleTextDump = async () => {
    const text = (pasteText || '').trim();
    if (!text) {
      showToast('Paste some assignment text first.', false);
      return;
    }
    // A lone http(s) link goes down the import-from-url lane (#79): the
    // scrape sidecar reads the page and the assignment lands in its subject
    // bubble (server-side flag; 403 surfaces as the toast below).
    if (/^https?:\/\/\S+$/.test(text)) {
      setUploading(true);
      try {
        const res = await api.request('/api/assignments/import-from-url', {
          method: 'POST',
          body: JSON.stringify({ url: text, description: '' }),
        });
        setPasteText('');
        if (res && res.status === 'insufficient_tokens') {
          showToast(res.detail || 'Insufficient tokens to import from a link.', false);
        } else if (res && res.assignment_id) {
          showToast(`✅ Imported — assignment #${res.assignment_id} landed in the ${res.subject || 'assigned'} bubble.`);
        } else {
          showToast('The scrape finished but returned no assignment — try again.', false);
        }
        await fetchItems();
      } catch (e) {
        showToast(e.message || 'Error importing from link', false);
      } finally {
        setUploading(false);
      }
      return;
    }
    setUploading(true);
    try {
      const file = new File([text], `paste_${Date.now()}.txt`, { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('user_id', userId);
      const res = await api.uploadDumpFile(formData);
      setPasteText('');
      await fetchItems();
      showToast(dumpTargetToast(res) || 'Assignment text dumped — AI is pairing it to a bubble.');
    } catch (e) {
      showToast(e.message || 'Error dumping text', false);
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

  // Track in-flight deletes so a double-click can't fire a second DELETE
  // (the second one returns 404 and used to surface as a bogus "Failed to
  // delete item" even though the first request actually succeeded).
  const [deletingIds, setDeletingIds] = useState(new Set());

  const isAlreadyGone = (e) => {
    const msg = (e && e.message) ? e.message : String(e || '');
    return /not found|dump item .*not.*exist|gone|missing/i.test(msg);
  };

  const handleDelete = async (dumpId, item) => {
    const label = item && item.file_name ? item.file_name : `dump item #${dumpId}`;
    if (!confirm(`Are you sure you want to delete "${label}"?`)) return;
    if (deletingIds.has(dumpId)) return;

    // Optimistic remove — the card leaves the list immediately.
    const removedIndex = items.findIndex((it) => it.id === dumpId);
    const removedItem = removedIndex >= 0 ? items[removedIndex] : null;
    setItems((prev) => prev.filter((it) => it.id !== dumpId));
    setDeletingIds((prev) => new Set(prev).add(dumpId));
    try {
      await api.deleteDumpItem(dumpId);
      showToast(`Deleted "${label}".`);
      // Refresh to pick up server-side truth (deleting a dumped item can also
      // remove the assignment bubble the dump itself created).
      await fetchItems();
    } catch (e) {
      if (isAlreadyGone(e)) {
        // Already deleted (double-click, another tab) — not a failure.
        await fetchItems();
        return;
      }
      // Roll the card back and surface the SERVER's message (blind "Failed
      // to delete item" hid real 401/403/500 reasons).
      setItems((prev) => {
        if (removedItem && !prev.some((it) => it.id === dumpId)) {
          const at = Math.min(removedIndex < 0 ? prev.length : removedIndex, prev.length);
          return [...prev.slice(0, at), removedItem, ...prev.slice(at)];
        }
        return prev;
      });
      showToast(e && e.message ? e.message : 'Failed to delete item.', false);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(dumpId);
        return next;
      });
    }
  };

  const needsTypeAsk = (item) =>
    !item.requested_action && ['matched', 'manual_routed', 'auto_routed', 'unmatched'].includes(item.status);

  const handleFinalize = async (item, action) => {
    const opt = FINALIZE_OPTIONS.find((o) => o.action === action);
    setFinalizingId(item.id);
    try {
      const res = await api.finalizeDumpItem(item.id, action);
      if (res.status === 'insufficient_tokens') {
        showToast(res.detail || '⚠️ Insufficient tokens — ask the operator to grant tokens first.', false);
      } else if (res.status === 'success') {
        const costNote = res.tokens_charged ? ` (${res.tokens_charged} tokens charged)` : '';
        if (res.work) {
          setResultView({ title: item.file_name || 'Assignment', work: res.work });
          showToast(`${opt.icon} ${opt.label} done${costNote} — the work is ready.`, true);
        } else {
          showToast(res.generated
            ? `${opt.icon} ${opt.label} ready${costNote} — study material generated.`
            : `${opt.icon} ${opt.label} finalized.`);
        }
      } else {
        showToast('Finalized, but no content could be generated yet (LLM unavailable or file has no text). Try again later.', false);
      }
      await fetchItems();
    } catch (e) {
      showToast(`Failed to finalize: ${e.message || 'unknown error'}`, false);
    } finally {
      setFinalizingId(null);
    }
  };

  // "Dump All" — process every dumped item that hasn't been finalized in one
  // click (operator 08-26): each one gets the do_it treatment (real work) and
  // n/a items short-circuit with a note.
  const [dumpingAll, setDumpingAll] = useState(false);
  const dumpAll = async () => {
    const pending = items.filter((i) => i.status !== 'finalized');
    if (pending.length === 0) {
      showToast('Nothing to dump — every item is already finalized.', false);
      return;
    }
    setDumpingAll(true);
    let ok = 0, fail = 0;
    for (const item of pending) {
      try {
        const res = await api.finalizeDumpItem(item.id, 'do_it');
        if (res.status === 'success') ok += 1;
        else fail += 1;
      } catch {
        fail += 1;
      }
    }
    await fetchItems();
    setDumpingAll(false);
    showToast(`Dump All: ${ok} done, ${fail} failed.`, fail === 0);
  };

  // View the completed work of an already-finalized do_it item (fetched from
  // the assignment's progress where finalize stored do_it_work).
  const openWork = async (item) => {
    if (!item.matched_assignment_id) return;
    try {
      const full = await api.assignmentFullView(item.matched_assignment_id);
      const work = full?.assignment?.do_it_work;
      setResultView({
        title: item.file_name || 'Assignment',
        work: work || 'Work is attached to the assignment bubble — open your agent chat to view it.',
      });
    } catch (e) {
      showToast(`Couldn't load the work: ${e.message || 'unknown error'}`, false);
    }
  };

  const filteredItems = items.filter((item) => {
    if (activeTab === 'matched') return ['matched', 'manual_routed', 'auto_routed', 'finalized'].includes(item.status);
    if (activeTab === 'unmatched') return item.status === 'unmatched';
    if (activeTab === 'audio') return item.file_type === 'audio' || item.file_type === 'video';
    return true;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fadeIn">
      <style>{AURORA_CHIP_TINTS}</style>

      {/* Header Banner */}
      <SectionCard id="dump-header" className="flex flex-col md:flex-row md:items-center justify-between gap-6" header={
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.28)] flex items-center justify-center text-[var(--accent)] shrink-0">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div>
            <div className="aurora-chip mb-1.5">
              <Bot className="w-3.5 h-3.5" /> {agentName} AI Auto-Routing
            </div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Universal Assignment Dump</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Dump any document (PDF, Word), lecture audio (AI transcription), image, or video. {agentName} AI auto-pairs it to the right assignment or creates a bubble for it.
            </p>
          </div>
        </div>
      }>

        {/* Live Audio Record Button */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={dumpAll}
            disabled={dumpingAll}
            className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-3.5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer shadow-[0_0_0_1px_rgba(139,92,246,0.35),0_4px_24px_rgba(99,102,241,0.35)]"
            title="Finalize every dumped item as real work in one click"
          >
            {dumpingAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>Dump All</span>
          </button>
          {!recording ? (
            <button
              type="button"
              onClick={startRecording}
              className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition cursor-pointer"
            >
              <Mic className="w-4 h-4" />
              <span>Record Lecture</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition cursor-pointer animate-pulse"
            >
              <MicOff className="w-4 h-4" />
              <span>Stop</span>
            </button>
          )}
        </div>
      </SectionCard>

      {/* Universal Upload Dropzone */}
      <div className="clean-card p-6 sm:p-8 space-y-4">
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
          className="p-8 border-2 border-dashed border-[rgba(139,92,246,0.30)] hover:border-[rgba(139,92,246,0.60)] rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition"
        >
          <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.25)] flex items-center justify-center text-[var(--accent)]">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              Drop any files here, or <span className="text-[var(--accent)] underline">browse</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Supports PDF, DOCX, TXT, MP3, WAV, M4A, FLAC, JPG, PNG, TIFF, MP4, MOV
            </p>
          </div>
          {uploading && (
            <div className="flex items-center gap-2 text-xs text-[var(--accent)] font-mono mt-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{agentName} is parsing & transcribing with AI…</span>
            </div>
          )}
        </div>

        {/* Paste-text dump */}
        <div className="flex items-center gap-3 pt-4 border-t border-[var(--border-subtle)]">
          <div className="h-px flex-1 bg-[var(--border-subtle)]" />
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">or paste the assignment text</span>
          <div className="h-px flex-1 bg-[var(--border-subtle)]" />
        </div>
        <div className="space-y-2.5">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`Paste the full assignment / rubric / instructions here — or a link to the assignment page (Helpo will scrape it) — ${agentName} will extract the details and match it to an assignment bubble…`}
            rows={5}
            className="clean-input w-full px-3 py-2.5 text-xs rounded-[var(--radius-md)] outline-none resize-y font-mono leading-relaxed"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] text-[var(--text-muted)]">{pasteText.length.toLocaleString()} characters</span>
            <button
              type="button"
              onClick={handleTextDump}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition cursor-pointer"
            >
              {uploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
              <span>Dump text</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Content Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
            {['all', 'matched', 'unmatched', 'audio'].map((tab) => (
              <button
                key={tab}
                type="button"
                aria-pressed={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold capitalize transition cursor-pointer ${
                  activeTab === tab
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-white hover:bg-white/5'
                }`}
              >
                {tab === 'audio' ? 'Audio & Video' : tab}
              </button>
            ))}
          </div>
          <span className="text-xs text-[var(--text-muted)] font-mono">{filteredItems.length} dumped items</span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="clean-card p-10 text-center space-y-2">
            <FileText className="w-10 h-10 text-[var(--text-muted)] mx-auto" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">No items in this category</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Dump a syllabus, lecture recording, or assignment doc above.
            </p>
          </div>
        ) : (
          /* items-start (09-01): without it the 2-col grid's default
             align-items:stretch forces a minimized dump card to the row
             height of an expanded neighbor, leaving a large empty box under
             the collapsed header bar. */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {filteredItems.map((item) => {
              const isMatched = item.status === 'matched' || item.status === 'manual_routed' || item.status === 'auto_routed';
              const isFinalized = item.status === 'finalized';
              const confPct = Math.round((item.auto_match_confidence || 0) * 100);

              return (
                <SectionCard
                  key={`dump-item-${item.id}`}
                  id={`dump-item-${item.id}`}
                  className="flex flex-col justify-between gap-4 hover:border-[rgba(139,92,246,0.35)] transition"
                  header={
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] shrink-0">
                          {item.file_type === 'audio' && <Mic className="w-4 h-4 text-rose-400" />}
                          {item.file_type === 'video' && <Video className="w-4 h-4 text-amber-400" />}
                          {item.file_type === 'image' && <ImageIcon className="w-4 h-4 text-emerald-400" />}
                          {item.file_type === 'document' && <FileText className="w-4 h-4 text-[var(--accent)]" />}
                          {item.file_type === 'text' && <FileText className="w-4 h-4 text-[var(--text-muted)]" />}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-bold text-[var(--text-primary)] truncate max-w-[220px] sm:max-w-[280px]">
                            {item.file_name}
                          </h3>
                          <span className="text-[10px] text-[var(--text-muted)] uppercase font-mono">
                            {item.file_type} • {(item.file_size_bytes / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      </div>

                      <span className={`aurora-chip tight shrink-0 ${isFinalized || isMatched ? 'ok' : 'warn'}`}>
                        {isFinalized ? '✅ Finalized' : item.status === 'auto_routed' ? `Auto-Routed (${confPct}%)` : isMatched ? `Auto-Paired (${confPct}%)` : 'Unmatched'}
                      </span>
                    </div>
                  }
                >
                  <div className="space-y-3">
                    {/* Extracted Preview / Markdown Snippet */}
                    <div className="p-3 bg-[var(--bg-surface-elevated)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] font-mono max-h-24 overflow-y-auto leading-relaxed break-words">
                      {item.extracted_text || 'No textual content extracted.'}
                    </div>

                    {/* Overlord Routing Note */}
                    <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      <span className="truncate">{item.overlord_notes}</span>
                    </div>

                    {/* Assignment Type Ask (finalize): not yet finalized → ask what the user wants */}
                    {needsTypeAsk(item) && (
                      <div className="p-3 rounded-[var(--radius-md)] bg-[rgba(139,92,246,0.10)] border border-[rgba(139,92,246,0.28)] space-y-2">
                        <div className="text-[11px] font-semibold text-[var(--text-primary)]">
                          What do you want to do this assignment as?
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {FINALIZE_OPTIONS.map((opt) => (
                            <button
                              key={opt.action}
                              type="button"
                              onClick={() => handleFinalize(item, opt.action)}
                              disabled={finalizingId === item.id}
                              className="p-3 rounded-xl bg-[var(--bg-surface-elevated)] hover:bg-[var(--accent-subtle)] border border-[var(--border-subtle)] hover:border-purple-500/50 text-left transition cursor-pointer disabled:opacity-50 flex flex-col justify-between gap-2 shadow-sm"
                            >
                              <div className="space-y-1">
                                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                  <span>{opt.icon}</span>
                                  <span>{opt.label}</span>
                                </div>
                                <p className="text-[11px] text-slate-400 leading-snug">{opt.desc}</p>
                              </div>
                              <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] font-mono">
                                <span className="text-purple-300 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-500/20">{opt.subagent}</span>
                                <span className="text-emerald-400 font-bold">{estimateContentTokens(item)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                        {finalizingId === item.id && (
                          <div className="flex items-center gap-1.5 text-[11px] text-[var(--accent)] font-mono">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Generating with {agentName} AI…
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Bar */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
                    {isFinalized ? (
                      <span className="aurora-chip tight ok truncate max-w-[180px]">
                        {FINALIZE_BADGE[item.requested_action] || '✅ Finalized'}
                      </span>
                    ) : item.matched_assignment_id ? (
                      /* (09-01) matched card click: open the assignment's full
                         bubble workspace (same surface the dashboard cards use)
                         instead of leaving the badge inert. onSelectAssignment
                         is provided by App.jsx on the dump view. */
                      <button
                        type="button"
                        onClick={() => onSelectAssignment && onSelectAssignment({
                          id: item.matched_assignment_id,
                          name: item.matched_assignment_title || `Assignment #${item.matched_assignment_id}`,
                        })}
                        title={onSelectAssignment ? 'Open this assignment bubble' : 'Matches an assignment bubble'}
                        className="text-xs text-emerald-400 font-semibold truncate flex items-center gap-1 min-w-0 hover:text-emerald-300 transition cursor-pointer text-left"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate underline decoration-emerald-400/40 underline-offset-2">{item.matched_assignment_title || `Assignment #${item.matched_assignment_id}`}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-amber-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Select Assignment
                      </span>
                    )}

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isFinalized && item.requested_action === 'do_it' && (
                        <button
                          type="button"
                          onClick={() => openWork(item)}
                          className="inline-flex items-center rounded-[var(--radius-sm)] px-2.5 py-1.5 bg-[var(--bg-surface-elevated)] hover:bg-[var(--accent-subtle)] border border-[var(--border-subtle)] hover:border-[rgba(139,92,246,0.4)] text-[var(--text-secondary)] text-xs font-semibold transition cursor-pointer"
                        >
                          📄 View work
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedItem(item);
                          setSelectedAssignId(item.matched_assignment_id || '');
                          setNewAssignTitle(item.file_name.replace(/\.[^/.]+$/, ''));
                          setRouteModalOpen(true);
                        }}
                        className="inline-flex items-center rounded-[var(--radius-sm)] px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold shadow-[0_0_0_1px_rgba(139,92,246,0.35),0_2px_14px_rgba(139,92,246,0.22)] transition cursor-pointer"
                      >
                        {isMatched ? 'Re-Route' : 'Route Item'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id, item)}
                        disabled={deletingIds.has(item.id)}
                        className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[#fda4af] hover:bg-[rgba(244,63,94,0.12)] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title={deletingIds.has(item.id) ? 'Deleting…' : 'Delete dump item'}
                        aria-label="Delete dump item"
                      >
                        {deletingIds.has(item.id)
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="surface-glass-strong w-full max-w-md p-6 rounded-[var(--radius-lg)] space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-[var(--accent)]" />
                Route Dumped Material
              </h3>
              <button
                type="button"
                onClick={() => setRouteModalOpen(false)}
                className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
                aria-label="Close route dialog"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[var(--text-secondary)] break-words">
              Attach <strong>{selectedItem.file_name}</strong> to an existing assignment or generate a brand new assignment from its contents.
            </p>

            <form onSubmit={handleManualRoute} className="space-y-3 text-xs">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCreateNew(false)}
                  className={`flex-1 py-2 rounded-[var(--radius-md)] font-semibold transition cursor-pointer ${
                    !createNew
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                  }`}
                >
                  Existing Assignment
                </button>
                <button
                  type="button"
                  onClick={() => setCreateNew(true)}
                  className={`flex-1 py-2 rounded-[var(--radius-md)] font-semibold transition cursor-pointer ${
                    createNew
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                  }`}
                >
                  Create New
                </button>
              </div>

              {!createNew ? (
                <div>
                  <label className="text-[var(--text-muted)] block mb-1 text-[11px] font-semibold">Select Assignment</label>
                  <select
                    value={selectedAssignId}
                    onChange={(e) => setSelectedAssignId(e.target.value)}
                    className="w-full clean-input rounded-[var(--radius-md)] px-3 py-2 text-white text-xs"
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
                  <label className="text-[var(--text-muted)] block mb-1 text-[11px] font-semibold">New Assignment Title</label>
                  <input
                    type="text"
                    value={newAssignTitle}
                    onChange={(e) => setNewAssignTitle(e.target.value)}
                    placeholder="e.g. Calculus Lecture & Homework 4"
                    className="w-full clean-input rounded-[var(--radius-md)] px-3 py-2 text-white text-xs"
                    required
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRouteModalOpen(false)}
                  className="flex-1 py-2 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--accent-subtle)] text-[var(--text-secondary)] font-semibold border border-[var(--border-subtle)] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={routing}
                  className="flex-1 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition cursor-pointer"
                >
                  {routing ? 'Saving…' : 'Save Routing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Finalize Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-16 md:bottom-6 right-6 z-[70] max-w-[min(320px,calc(100vw-3rem))] px-4 py-2.5 rounded-[var(--radius-md)] text-xs font-semibold shadow-2xl border animate-fadeIn surface-glass-strong ${
            toast.ok
              ? 'border-emerald-400/40 text-white'
              : 'border-rose-400/40 text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Finalized work drawer — shows the actual generated work right away */}
      {resultView && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={() => setResultView(null)}>
          <div
            className="surface-glass-strong w-full max-w-2xl max-h-[80vh] flex flex-col rounded-[var(--radius-lg)] shadow-2xl border-emerald-500/30"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Work ready — {resultView.title}
              </div>
              <button
                type="button"
                onClick={() => setResultView(null)}
                className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
                aria-label="Close work drawer"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap break-words font-sans">
              {resultView.work}
            </div>
            <div className="px-5 py-3 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)]">
              Also saved to your assignment bubble — open your agent → {agentName} to chat about it.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
