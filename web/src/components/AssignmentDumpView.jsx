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
  PenLine,
  BookOpen,
  Brain,
  Layers,
  Check,
  X,
  Lock,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import api from '../api.js';

// Finalize options with Lucide icons (no raw emojis)
const FINALIZE_OPTIONS = [
  { action: 'do_it', label: 'Complete the Assignment (Do It For Me)', icon: PenLine, subagent: 'Researched Synthesis', desc: 'Generates full finished essay, problem set solutions, or paper according to rubric.' },
  { action: 'study_guide', label: 'Exam Study Guide', icon: BookOpen, subagent: 'Semantic Condenser', desc: 'Summarizes key terms, critical dates, formulas, and concepts into a clean guide.' },
  { action: 'practice_quiz', label: 'Practice Exam & Quiz', icon: Brain, subagent: 'Psychometric Evaluation', desc: 'Creates 10 multiple-choice questions with full answer keys and explanations.' },
  { action: 'flashcards', label: 'Spaced Flashcard Deck', icon: Layers, subagent: 'Anki / Leitner Engine', desc: 'Builds interactive review cards ready for active-recall memorization.' },
];

function estimateContentTokens(item) {
  const textLen = (item?.extracted_text || '').length;
  if (!textLen) return 'Est. ~1 Token';
  const inputTokens = Math.max(100, Math.round(textLen / 4));
  const estOutputTokens = Math.max(250, Math.min(4000, Math.round(inputTokens * 0.6)));
  const estTokens = Math.max(1, Math.ceil((inputTokens + estOutputTokens * 1.5) / 1000));
  return `Est. ~${estTokens} ${estTokens === 1 ? 'Token' : 'Tokens'}`;
}

export default function AssignmentDumpView({ userId = '', onSelectAssignment }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [isDragOver, setIsDragOver] = useState(false);
  const [recording, setRecording] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // all, pending, finalized, audio
  const [selectedItem, setSelectedItem] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [pasteText, setPasteText] = useState('');
  const [toast, setToast] = useState(null);
  const [inlineError, setInlineError] = useState('');
  const [resultView, setResultView] = useState(null);

  // Single Item Finalize Modal State
  const [finalizeModalItem, setFinalizeModalItem] = useState(null);
  const [finalizingId, setFinalizingId] = useState(null);

  // 2-Step Batch Finalize Modal State
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchEstimate, setBatchEstimate] = useState(null);
  const [batchSkipIds, setBatchSkipIds] = useState(new Set());
  const [batchAction, setBatchAction] = useState('flashcards');
  const [userTokenBalance, setUserTokenBalance] = useState(1000);
  const [executingBatch, setExecutingBatch] = useState(false);

  // Inline Delete State
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

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
    setLoading(true);
    setInlineError('');
    try {
      const res = await api.getDumpList(userId);
      if (res && res.status === 'success') {
        setItems(res.items || []);
      }
      const dash = await api.dashboard(userId).catch(() => null);
      if (dash?.assignments) setAssignments(dash.assignments);
      if (dash?.settings?.token_balance !== undefined) {
        setUserTokenBalance(Number(dash.settings.token_balance));
      }
    } catch (e) {
      setInlineError(e.message || 'Failed to fetch dumped items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [userId]);

  const handleUploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setInlineError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('user_id', userId);

      const res = await api.uploadDumpFile(formData);
      showToast(`Uploaded ${file.name} successfully!`);
      await fetchItems();
    } catch (e) {
      setInlineError(e.message || 'Error uploading file to Assignment Dump');
    } finally {
      setUploading(false);
    }
  };

  const handlePasteSubmit = async (e) => {
    e.preventDefault();
    if (!pasteText.trim()) return;

    setUploading(true);
    setInlineError('');
    try {
      const blob = new Blob([pasteText.trim()], { type: 'text/plain' });
      const file = new File([blob], 'Pasted_Assignment_Text.txt', { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('user_id', userId);

      await api.uploadDumpFile(formData);
      setPasteText('');
      showToast('Pasted assignment text uploaded!');
      await fetchItems();
    } catch (e) {
      setInlineError(e.message || 'Error processing pasted text');
    } finally {
      setUploading(false);
    }
  };

  const startAudioRecording = async () => {
    try {
      setInlineError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `Lecture_Recording_${Date.now()}.webm`, { type: 'audio/webm' });
        await handleUploadFile(audioFile);
        stream.getTracks().forEach((track) => track.stop());
      };

      mr.start();
      setRecording(true);
    } catch (err) {
      setInlineError('Microphone access denied or audio recording unsupported.');
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const handleDeleteItem = async (itemId) => {
    setInlineError('');
    setDeletingId(itemId);
    try {
      await api.deleteDumpItem(itemId);
      setDeleteConfirmId(null);
      showToast('Dumped item removed');
      await fetchItems();
    } catch (e) {
      setInlineError(e.message || 'Failed to delete dump item');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSingleFinalize = async (item, action) => {
    setFinalizingId(item.id);
    setInlineError('');
    try {
      const res = await api.finalizeDumpItem(item.id, action);
      if (res.status === 'insufficient_tokens') {
        setInlineError(res.detail || 'Insufficient token balance');
      } else if (res.status === 'success' || res.status === 'finalized_no_content') {
        showToast(
          res.generated
            ? `Generated study material (+${res.tokens_charged} tokens charged)`
            : 'Assignment finalized (no work generated)'
        );
        if (res.work) {
          setResultView({ title: item.file_name || 'Assignment Work', work: res.work });
        }
        setFinalizeModalItem(null);
        await fetchItems();
      }
    } catch (e) {
      setInlineError(e.message || 'Finalization failed');
    } finally {
      setFinalizingId(null);
    }
  };

  // Open 2-Step Dump All Modal & Fetch Estimate
  const openBatchModal = async () => {
    const pending = items.filter((i) => i.status !== 'finalized');
    if (pending.length === 0) {
      showToast('No pending items to dump. All items are already finalized.', false);
      return;
    }

    setBatchModalOpen(true);
    setBatchLoading(true);
    setBatchSkipIds(new Set());
    setInlineError('');

    try {
      const pendingIds = pending.map((i) => i.id).join(',');
      const est = await api.batchEstimateDumpItems(pendingIds);
      setBatchEstimate(est);
    } catch (err) {
      setInlineError(err.message || 'Failed to estimate batch costs');
    } finally {
      setBatchLoading(false);
    }
  };

  const toggleSkipItem = (itemId) => {
    setBatchSkipIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleExecuteBatch = async () => {
    setExecutingBatch(true);
    setInlineError('');
    try {
      const allPendingIds = (batchEstimate?.items || []).map((i) => i.id);
      const skipList = Array.from(batchSkipIds);

      const res = await api.batchFinalizeDumpItems({
        ids: allPendingIds,
        skip: skipList,
        action: batchAction,
      });

      if (res.status === 'success') {
        showToast(`Batch finalized: ${res.succeeded} completed, ${res.failed} failed. (${res.total_charged_tokens} tokens)`);
        setBatchModalOpen(false);
        await fetchItems();
      } else {
        setInlineError('Batch finalization incomplete');
      }
    } catch (err) {
      setInlineError(err.message || 'Error processing batch finalization');
    } finally {
      setExecutingBatch(false);
    }
  };

  // Filter items
  const filteredItems = items.filter((i) => {
    if (activeTab === 'pending') return i.status !== 'finalized';
    if (activeTab === 'finalized') return i.status === 'finalized';
    if (activeTab === 'audio') return (i.file_name || '').match(/\.(mp3|wav|m4a|webm|ogg)$/i);
    return true;
  });

  const pendingCount = items.filter((i) => i.status !== 'finalized').length;

  // Active batch calculations
  const activeBatchItems = (batchEstimate?.items || []).filter((i) => !batchSkipIds.has(i.id));
  const activeBatchTokens = activeBatchItems.reduce((acc, i) => acc + (i.est_tokens || 0), 0);
  const activeBatchCostUsd = activeBatchItems.reduce((acc, i) => acc + (i.est_cost || 0), 0);
  const remainingTokensAfter = Math.max(0, userTokenBalance - activeBatchTokens);

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-2 sm:p-4 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-code-sm text-xs text-on-surface-variant uppercase tracking-wider mb-1">
            <span>Workspace Core</span>
            <span>/</span>
            <span className="text-primary font-medium">Assignment Dump</span>
            <span>/</span>
            <span className="font-chip-status text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              MATERIALS INTAKE
            </span>
          </div>
          <h1 className="font-headline-lg-mobile md:font-headline-lg text-title-md md:text-headline-lg text-on-surface font-semibold tracking-tight">
            Universal Assignment Dump
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-1">
            The front door for your assignments: drag &amp; drop PDFs, paste rubrics, or record lectures.
          </p>
        </div>

        {/* 2-Step Dump All Trigger Button */}
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={openBatchModal}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider font-semibold shadow-[0_0_24px_rgba(120,245,229,0.25)] hover:brightness-105 active:scale-[0.98] transition flex items-center gap-2 shrink-0 self-start sm:self-center"
          >
            <Sparkles className="w-4 h-4 text-on-primary" />
            <span>Dump All ({pendingCount} pending)</span>
          </button>
        )}
      </div>

      {/* Inline Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`p-4 rounded-2xl text-xs flex items-center justify-between shadow-sm transition-all ${
            toast.ok
              ? 'bg-sem-green/15 border border-sem-green/30 text-sem-green'
              : 'bg-error-container/20 border border-error/30 text-error'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{toast.msg}</span>
          </div>
          <button type="button" onClick={() => setToast(null)} className="p-1 hover:text-on-surface">
            &times;
          </button>
        </div>
      )}

      {/* Inline Error Strip */}
      {inlineError && (
        <div className="p-4 rounded-2xl bg-error-container/20 border border-error/30 text-error text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{inlineError}</span>
          </div>
          <button
            type="button"
            onClick={fetchItems}
            disabled={loading}
            className="px-2.5 py-1 rounded-lg bg-surface-container text-on-surface font-label-caps text-[10px] hover:bg-surface-container-high transition disabled:opacity-60"
          >
            {loading ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {/* SECTION 1: SIGNATURE HERO DROPZONE CARD */}
      <section className="rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 p-6 sm:p-8 shadow-xl space-y-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const files = Array.from(e.dataTransfer.files || []);
            if (files[0]) handleUploadFile(files[0]);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`p-8 sm:p-12 rounded-2xl border-2 border-dashed transition cursor-pointer flex flex-col items-center justify-center text-center gap-3 relative overflow-hidden ${
            isDragOver
              ? 'border-primary ring-4 ring-primary/20 bg-primary/10'
              : 'border-outline-variant/30 hover:border-primary/50 bg-surface-container-low/40 hover:bg-surface-container-low/80'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
            <UploadCloud className="w-7 h-7" />
          </div>

          <div className="space-y-1">
            <h3 className="font-title-md text-base sm:text-lg text-on-surface font-semibold">
              {isDragOver ? 'Drop file to upload instantly' : 'Drop assignment files here or click to browse'}
            </h3>
            <p className="font-body-sm text-xs text-on-surface-variant max-w-md">
              Supports PDF, DOCX, TXT, images, and audio. Intelligent OCR &amp; lecture chunking will extract curriculum contents automatically.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUploadFile(f);
            }}
          />

          {uploading && (
            <div className="w-full max-w-xs mt-2 space-y-1">
              {/* Indeterminate on purpose. This was a bar animated 20 -> 60 -> 100
                  by the CODE, not by upload progress, so it reached 100% while
                  nothing had been processed — a promise the app could not keep.
                  There is no progress channel to wire it to (a single POST), and a
                  sweeping bar is the honest signal for a wait with no percentage. */}
              <div
                role="progressbar"
                aria-label="Uploading and processing"
                aria-valuetext="Processing"
                className="h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden"
              >
                <div className="h-full w-1/3 rounded-full bg-primary animate-dump-indeterminate" />
              </div>
              <span className="font-code-sm text-[10px] text-primary">Processing OCR &amp; audio extraction... this can take a moment for long files.</span>
            </div>
          )}
        </div>

        {/* Lower Intake Tools: Paste Text & Audio Record */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Paste Rubric / Text Area */}
          <form onSubmit={handlePasteSubmit} className="p-4 rounded-2xl bg-surface-container-low/70 border border-outline-variant/15 space-y-3">
            <div className="flex items-center gap-2 text-xs font-label-caps text-on-surface uppercase">
              <FileText className="w-4 h-4 text-primary" />
              <span>Paste Assignment Prompt / Rubric</span>
            </div>
            <textarea
              id="dump-paste-textarea"
              rows={pasteText.length > 80 || pasteText.includes('\n') ? Math.min(12, Math.max(5, pasteText.split('\n').length + 1)) : 2}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste assignment description or instructions..."
              className="w-full p-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary transition resize-y font-body-sm leading-relaxed"
            />
            <button
              type="submit"
              disabled={uploading || !pasteText.trim()}
              className="min-h-[40px] px-4 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-xs tracking-wider transition active:scale-[0.98] disabled:opacity-50"
            >
              Upload Text
            </button>
          </form>

          {/* Record Lecture Audio */}
          <div className="p-4 rounded-2xl bg-surface-container-low/70 border border-outline-variant/15 flex flex-col justify-between space-y-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-label-caps text-on-surface uppercase">
                <Mic className="w-4 h-4 text-primary" />
                <span>Live Lecture Audio Intake</span>
              </div>
              <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
                Record classroom discussions or lectures directly. Extracted audio is transcribed into modular study decks.
              </p>
            </div>
            <div>
              {recording ? (
                <button
                  type="button"
                  onClick={stopAudioRecording}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-error text-on-error font-label-caps text-xs uppercase tracking-wider font-semibold animate-pulse flex items-center gap-2"
                >
                  <MicOff className="w-4 h-4" />
                  <span>Stop Recording &amp; Transcribe</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startAudioRecording}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-xs uppercase tracking-wider font-semibold transition flex items-center gap-2"
                >
                  <Mic className="w-4 h-4 text-primary" />
                  <span>Record Lecture Audio</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Filter Tabs & Queue Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1 p-1 bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-x-auto">
          {['all', 'pending', 'finalized', 'audio'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl font-label-caps text-xs capitalize tracking-wider transition ${
                activeTab === tab
                  ? 'bg-surface-container text-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <span className="font-code-sm text-xs text-on-surface-variant self-start sm:self-auto">
          Showing {filteredItems.length} of {items.length} items
        </span>
      </div>

      {/* Deliverable Queue Cards */}
      {loading ? (
        <div className="space-y-3 py-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-surface-container-low/50 animate-pulse" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-surface-container-lowest/80 border border-outline-variant/20 space-y-3">
          <UploadCloud className="w-10 h-10 text-on-surface-variant/40 mx-auto" />
          <h4 className="font-title-md text-base text-on-surface font-medium">No assignment items in queue</h4>
          <p className="font-body-sm text-xs text-on-surface-variant max-w-sm mx-auto">
            Upload a file or paste assignment instructions above to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const isFinalized = item.status === 'finalized';
            return (
              <div
                key={item.id}
                className="p-5 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 hover:border-primary/50 transition-all shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-title-md text-sm font-semibold text-on-surface truncate">
                      {item.file_name || `Item #${item.id}`}
                    </span>
                    <span
                      className={`font-chip-status text-[9px] px-2 py-0.5 rounded-full uppercase ${
                        isFinalized
                          ? 'bg-sem-green/15 text-sem-green font-semibold'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <p className="font-code-sm text-xs text-on-surface-variant line-clamp-1">
                    {item.extracted_text
                      ? item.extracted_text.slice(0, 140) + '…'
                      : 'No text extracted yet'}
                  </p>

                  <div className="flex items-center gap-3 font-code-sm text-[10px] text-on-surface-variant pt-1">
                    <span>{estimateContentTokens(item)}</span>
                    <span>·</span>
                    <span>{item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Recent'}</span>
                  </div>
                </div>

                {/* Card Action Sheet */}
                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  {isFinalized ? (
                    <span className="font-label-caps text-xs text-sem-green font-semibold px-3 py-1.5 rounded-xl bg-sem-green/10 flex items-center gap-1.5">
                      <Check className="w-4 h-4" />
                      Finalized
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setFinalizeModalItem(item)}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-xs uppercase tracking-wider font-semibold transition active:scale-[0.98]"
                    >
                      Choose Action
                    </button>
                  )}

                  {deleteConfirmId === item.id ? (
                    <div className="flex items-center gap-1 bg-surface-container-high p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        disabled={deletingId === item.id}
                        className="px-2.5 py-1 bg-error text-on-error rounded-lg text-[10px] font-label-caps disabled:opacity-60"
                      >
                        {deletingId === item.id ? 'Deleting…' : 'Delete Item'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(null)}
                        className="px-2 py-1 text-on-surface-variant text-[10px]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(item.id)}
                      className="p-2 min-h-[36px] min-w-[36px] rounded-xl text-on-surface-variant hover:text-error hover:bg-error-container/20 transition flex items-center justify-center"
                      title="Delete dumped item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 2-STEP DUMP ALL SPEND CONFIRMATION MODAL (§3.13.1) */}
      {batchModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-modal-title"
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
        >
          <div className="w-full max-w-2xl rounded-3xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl p-6 sm:p-8 space-y-6 relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-chip-status text-[10px] uppercase">
                  <ShieldCheck className="w-3 h-3 text-primary" />
                  2-Step Spend Confirmation
                </div>
                <h3 id="batch-modal-title" className="font-title-md text-xl text-on-surface font-semibold">
                  Batch Finalize Deliverables
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBatchModalOpen(false)}
                className="p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 3-Column Tabular Stats Shelf */}
            <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/15 grid grid-cols-3 gap-3 divide-x divide-outline-variant/20 text-left">
              <div className="pr-2">
                <div className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider mb-0.5">
                  Deliverables
                </div>
                <div className="font-tabular-stat text-xl text-on-surface font-bold">
                  {activeBatchItems.length} Files
                </div>
                <div className="font-code-sm text-[10px] text-on-surface-variant mt-0.5">
                  {batchSkipIds.size} skipped
                </div>
              </div>

              <div className="px-3">
                <div className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider mb-0.5">
                  Est. Tokens
                </div>
                <div className="font-tabular-stat text-xl text-primary font-bold">
                  {activeBatchTokens.toLocaleString()}
                </div>
                <div className="font-code-sm text-[10px] text-outline mt-0.5">Deterministic rate</div>
              </div>

              <div className="pl-3">
                <div className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider mb-0.5">
                  Est. Cost
                </div>
                <div className="font-tabular-stat text-xl text-on-surface font-bold">
                  ~{activeBatchTokens.toLocaleString()} tokens
                </div>
                <div className="font-code-sm text-[10px] text-outline mt-0.5">Metered by task content</div>
              </div>
            </div>

            {/* Token Balance Notice */}
            <div className="flex items-center justify-between text-xs font-code-sm p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/10">
              <span className="text-on-surface-variant">
                Current Balance: <strong className="text-on-surface font-tabular-stat">{userTokenBalance.toLocaleString()} Tokens</strong>
              </span>
              <span className="text-on-surface-variant">
                Remaining After: <strong className="text-primary font-tabular-stat">{remainingTokensAfter.toLocaleString()} Tokens</strong>
              </span>
            </div>

            {/* Action Strategy Selector */}
            <div className="space-y-1.5">
              <label className="font-label-caps text-xs text-on-surface-variant uppercase">
                Generation Type for All Deliverables
              </label>
              <select
                value={batchAction}
                onChange={(e) => setBatchAction(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary transition"
              >
                <option value="flashcards">🗂️ Flashcards (Spaced Repetition Decks)</option>
                <option value="practice_quiz">🧠 Practice Quiz (10 Questions + Answer Key)</option>
                <option value="study_guide">📖 Exam Study Guide (Concepts &amp; Summary)</option>
                <option value="summary">📄 Concise Summary</option>
                <option value="do_it">✍️ Do It For Me (Complete Solutions)</option>
              </select>
            </div>

            {/* Per-Item Skip Checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-label-caps text-on-surface-variant uppercase tracking-wider">
                  Deliverable Checklist (Uncheck to Skip)
                </span>
                <span className="font-code-sm text-primary">Zero-spend on deselected files</span>
              </div>

              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {(batchEstimate?.items || []).map((item) => {
                  const isSkipped = batchSkipIds.has(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer select-none ${
                        isSkipped
                          ? 'bg-surface-container-low/20 border-outline-variant/15 opacity-60'
                          : 'bg-surface-container-low/60 border-outline-variant/25 hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={!isSkipped}
                          onChange={() => toggleSkipItem(item.id)}
                          className="rounded bg-surface-container border-outline-variant text-primary focus:ring-primary h-4 w-4"
                        />
                        <span className={`font-body-sm text-xs truncate ${isSkipped ? 'line-through text-on-surface-variant' : 'text-on-surface font-medium'}`}>
                          {item.file_name}
                        </span>
                      </div>
                      <span className="font-tabular-stat text-xs text-primary shrink-0">
                        {isSkipped ? 'SKIPPED · $0.00' : `+$${item.est_cost.toFixed(2)}`}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setBatchModalOpen(false)}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-xs uppercase tracking-wider transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={executingBatch || activeBatchItems.length === 0}
                onClick={handleExecuteBatch}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider font-semibold shadow-[0_0_24px_rgba(120,245,229,0.3)] hover:brightness-105 active:scale-[0.98] transition disabled:opacity-50"
              >
                {executingBatch ? 'Finalizing...' : `Confirm & Finalize (${activeBatchItems.length} items · ~$${activeBatchCostUsd})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SINGLE ITEM ACTION MODAL */}
      {finalizeModalItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
        >
          <div className="w-full max-w-lg rounded-3xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl p-6 sm:p-8 space-y-6 relative">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <span className="font-label-caps text-xs text-primary uppercase tracking-wider">Select Material Kind</span>
                <h3 className="font-title-md text-lg text-on-surface font-semibold truncate max-w-sm">
                  {finalizeModalItem.file_name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFinalizeModalItem(null)}
                className="p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {FINALIZE_OPTIONS.map((opt) => {
                const IconComponent = opt.icon;
                return (
                  <button
                    key={opt.action}
                    type="button"
                    disabled={finalizingId === finalizeModalItem.id}
                    onClick={() => handleSingleFinalize(finalizeModalItem, opt.action)}
                    className="w-full p-4 rounded-2xl bg-surface-container-low/70 hover:bg-surface-container border border-outline-variant/15 hover:border-primary/40 transition text-left flex items-start gap-3.5 group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 group-hover:scale-105 transition">
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <span className="font-title-md text-xs font-semibold text-on-surface block">
                        {opt.label}
                      </span>
                      <p className="font-body-sm text-[11px] text-on-surface-variant leading-relaxed">
                        {opt.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* FINALIZED WORK DRAWER / PREVIEW */}
      {resultView && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
        >
          <div className="w-full max-w-3xl rounded-3xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl p-6 sm:p-8 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="font-title-md text-lg text-on-surface font-semibold">{resultView.title}</h3>
              <button
                type="button"
                onClick={() => setResultView(null)}
                className="p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 rounded-2xl bg-surface-container-low font-body-sm text-xs text-on-surface leading-relaxed whitespace-pre-wrap">
              {resultView.work}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
