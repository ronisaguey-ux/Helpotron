import React, { useState, useEffect } from "react";
import {
  FileText,
  FileAudio,
  Image as ImageIcon,
  Video,
  BookOpen,
  Bookmark,
  Calendar as CalendarIcon,
  UploadCloud,
  ChevronDown,
  ChevronUp,
  RotateCw,
  Sparkles,
  Award,
  Trash2,
  BookmarkCheck,
  Play,
  Layers,
  Loader2,
  AlertCircle,
} from "lucide-react";
import api from "../api.js";
import FlashcardsPlayer from "./study/FlashcardsPlayer.jsx";
import QuizPlayer from "./study/QuizPlayer.jsx";
import AcademicCalendar from "./study/AcademicCalendar.jsx";
import AssignmentHistoryView from "./AssignmentHistoryView.jsx";
import { StreakBadge, MasteryRing } from "./study/MasteryRing.jsx";

function getTileIcon(kind = "") {
  const k = String(kind).toLowerCase();
  if (k.includes("audio") || k.includes("lecture") || k.includes("voice")) {
    return { Icon: FileAudio, tint: "text-sem-cyan bg-sem-cyan/10 border-sem-cyan/20" };
  }
  if (k.includes("image") || k.includes("photo") || k.includes("diagram")) {
    return { Icon: ImageIcon, tint: "text-secondary bg-secondary/10 border-secondary/20" };
  }
  if (k.includes("video") || k.includes("stream")) {
    return { Icon: Video, tint: "text-sem-indigo bg-sem-indigo/10 border-sem-indigo/20" };
  }
  if (k.includes("flashcard") || k.includes("deck")) {
    return { Icon: Layers, tint: "text-primary bg-primary/10 border-primary/20" };
  }
  if (k.includes("test") || k.includes("quiz")) {
    return { Icon: BookOpen, tint: "text-sem-amber bg-sem-amber/10 border-sem-amber/20" };
  }
  return { Icon: FileText, tint: "text-on-surface-variant bg-surface-container border-outline-variant/30" };
}

export default function LibraryView({ userId = "", onGoTo, onSelectAssignment, initialTab = null }) {
  // Owner 2026-09-19: History and Library were two views of the same material, so
  // History is now a tab here rather than a destination of its own.
  // `initialTab` is how a deep-link (/history) lands on the completed-work
  // list. Unknown values fall back to files rather than rendering nothing.
  const [activeTab, setActiveTab] = useState(
    ["files", "saved", "study", "calendar", "completed"].includes(initialTab)
      ? initialTab
      : "files",
  ); // "files" | "saved" | "study" | "calendar" | "completed"
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [streakDays, setStreakDays] = useState(0);
  const [expandedMap, setExpandedMap] = useState({});
  const [feedbackNotice, setFeedbackNotice] = useState("");
  const [busyId, setBusyId] = useState(null);

  // Active Study Tool Session State
  const [activeStudyTool, setActiveStudyTool] = useState(null); // { type: "flashcards" | "quiz", material }

  const fetchLibrary = async () => {
    setLoading(true);
    setFetchError("");
    try {
      const matRes = await api.request("/api/library/materials", { method: "GET" });
      const streakRes = await fetch("/api/study/streak")
        .then((r) => (r.ok ? r.json() : { streak_days: 0 }))
        .catch(() => ({ streak_days: 0 }));

      const list = Array.isArray(matRes?.materials) ? matRes.materials : [];
      setMaterials(list);
      setStreakDays(streakRes?.streak_days || 0);
    } catch (err) {
      setFetchError(err?.message || "Failed to load study materials.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [userId]);

  const triggerNotice = (msg) => {
    setFeedbackNotice(msg);
    setTimeout(() => setFeedbackNotice(""), 3500);
  };

  // Delete — recoverable. The server moves it to the trash rather than
  // destroying it, so the copy says so and the button warns before acting.
  const handleDelete = async (m) => {
    if (!window.confirm('Move this to the trash? You can restore it from Settings → Trash for 10 days.')) return;
    setBusyId(m.id);
    try {
      await api.deleteLibraryMaterial(m.id);
      setMaterials((prev) => prev.filter((item) => item.id !== m.id));
      triggerNotice('Moved to trash — restore it from Settings → Trash.');
    } catch (e) {
      triggerNotice(e?.message || 'Delete failed.');
    } finally {
      setBusyId(null);
    }
  };

  // Save / Unsave
  const handleToggleSave = async (m) => {
    setBusyId(m.id);
    try {
      if (m.saved_at) {
        await fetch(`/api/library/materials/${m.id}/unsave`, { method: "DELETE" });
        setMaterials((prev) =>
          prev.map((item) => (item.id === m.id ? { ...item, saved_at: null } : item))
        );
        triggerNotice("Removed from saved library.");
      } else {
        const res = await fetch(`/api/library/materials/${m.id}/save`, { method: "POST" });
        const data = await res.json();
        setMaterials((prev) =>
          prev.map((item) => (item.id === m.id ? { ...item, saved_at: data.saved_at } : item))
        );
        triggerNotice("Saved to your personal collection!");
      }
    } catch (e) {
      triggerNotice("Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReviewCardDispatch = async (reviewPayload) => {
    if (!activeStudyTool?.material?.id) return;
    try {
      await fetch(`/api/study/decks/${activeStudyTool.material.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card_index: reviewPayload.cardIndex,
          rating: reviewPayload.rating,
          difficulty: reviewPayload.difficulty,
        }),
      });
    } catch (e) {
      console.warn("Could not record review:", e);
    }
  };

  const handleGradeQuizDispatch = async (gradePayload) => {
    const mId = gradePayload.materialId || activeStudyTool?.material?.id;
    if (!mId) return null;
    try {
      const res = await fetch(`/api/study/quiz/${mId}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: gradePayload.answers,
        }),
      });
      return await res.json();
    } catch (e) {
      console.warn("Could not grade quiz:", e);
      return null;
    }
  };

  const savedMaterials = materials.filter((m) => !!m.saved_at);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-label-caps text-[10px] text-primary uppercase tracking-widest">
              Study Materials &amp; Spaced Repetition
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-outline-variant" />
            <span className="font-code-sm text-xs text-on-surface-variant">
              Active Recall Library
            </span>
          </div>
          <h1 className="font-headline-lg text-2xl md:text-3xl text-on-surface font-semibold tracking-tight">
            Library &amp; Study Tools
          </h1>
          <p className="font-body-sm text-xs text-on-surface-variant mt-1 max-w-2xl">
            Generated flashcards, practice test diagnostics, saved materials, and real academic due dates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <StreakBadge streakDays={streakDays} />
          <button
            type="button"
            onClick={() => onGoTo?.("dump")}
            className="h-10 px-4 rounded-xl bg-primary text-on-primary font-label-caps text-xs flex items-center gap-2 shadow-[0_0_20px_rgba(89,216,201,0.25)] transition cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload to Assignment Dump</span>
          </button>
        </div>
      </div>

      {feedbackNotice && (
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs font-code-sm text-primary">
          {feedbackNotice}
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 p-1 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 overflow-x-auto">
        {[
          { key: "files", label: "Files & Materials", count: materials.length },
          { key: "saved", label: "Saved Collection", count: savedMaterials.length },
          { key: "study", label: "Active Recall Player" },
          { key: "calendar", label: "Academic Deadlines" },
          { key: "completed", label: "Completed Work" },
        ].map(({ key, label, count }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveTab(key);
                if (key !== "study") setActiveStudyTool(null);
              }}
              className={`h-10 px-5 rounded-xl font-label-caps text-xs flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
                isActive
                  ? "bg-surface-container text-on-surface shadow-sm font-semibold"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container/40"
              }`}
            >
              <span>{label}</span>
              {count != null && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-code-sm">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: FILES & MATERIALS (2-col mobile, 3-col md, 4-col lg per spec) */}
      {activeTab === "files" && (
        <div className="space-y-6">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-pulse">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="rounded-3xl bg-surface-container-lowest/80 border border-outline-variant/20 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-surface-container-high" />
                    <div className="w-16 h-4 bg-surface-container-high rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-3/4 bg-surface-container-high rounded" />
                    <div className="h-3 w-1/2 bg-surface-container rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : fetchError ? (
            <div className="p-6 rounded-3xl bg-error-container/20 border border-error/30 text-error text-xs flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{fetchError}</span>
              </div>
              <button
                type="button"
                onClick={fetchLibrary}
                className="px-3 py-1.5 rounded-xl bg-surface-container text-on-surface font-label-caps text-xs hover:bg-surface-container-high transition cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : materials.length === 0 ? (
            <div className="p-12 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="font-title-md text-base font-semibold text-on-surface">
                No study materials yet
              </h3>
              <p className="font-body-sm text-xs text-on-surface-variant max-w-md mx-auto">
                Generate study guides, flashcard decks, and practice tests from any assignment or uploaded lecture note.
              </p>
              <button
                type="button"
                onClick={() => onGoTo?.("dump")}
                className="h-10 px-5 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase inline-flex items-center gap-2 cursor-pointer shadow-sm mx-auto"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Upload First Material</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {materials.map((m) => {
                const { Icon, tint } = getTileIcon(m.kind);
                const isSaved = !!m.saved_at;
                const isExpanded = !!expandedMap[m.id];
                const contentStr = typeof m.content === "string" ? m.content : JSON.stringify(m.content, null, 2);

                return (
                  <div
                    key={m.id}
                    className="p-4 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm flex flex-col justify-between gap-3 hover:border-primary/40 transition"
                  >
                    <div>
                      {/* Tile Header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${tint}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleSave(m)}
                          disabled={busyId === m.id}
                          className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-primary transition cursor-pointer disabled:opacity-60"
                          title={isSaved ? "Remove from saved" : "Save to collection"}
                        >
                          {busyId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : isSaved ? <BookmarkCheck className="w-4 h-4 text-primary" /> : <Bookmark className="w-4 h-4" />}
                        </button>
                      </div>

                      {/* Title & Metadata */}
                      <div className="mt-3 space-y-1">
                        <span className="font-chip-status text-[10px] uppercase font-semibold text-primary block">
                          {m.kind.replace("_", " ")}
                        </span>
                        <h3 className="font-title-md text-xs font-semibold text-on-surface line-clamp-1">
                          Material #{m.id}
                        </h3>
                        {m.model_used && (
                          <span className="font-code-sm text-[10px] text-outline block">
                            Model: {m.model_used}
                          </span>
                        )}
                      </div>

                      {/* Clamped Preview (4 lines with expand per 3.10.6) */}
                      <div className="mt-2 pt-2 border-t border-outline-variant/15">
                        <p className={`font-body-sm text-[11px] text-on-surface-variant leading-relaxed ${isExpanded ? "" : "line-clamp-4"}`}>
                          {contentStr}
                        </p>
                        {contentStr.length > 120 && (
                          <button
                            type="button"
                            onClick={() => setExpandedMap((prev) => ({ ...prev, [m.id]: !prev[m.id] }))}
                            className="text-primary hover:underline font-code-sm text-[10px] mt-1 flex items-center gap-0.5"
                          >
                            <span>{isExpanded ? "Show less" : "Expand preview"}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Launch Study Mode CTA */}
                    <div className="pt-2 border-t border-outline-variant/15 flex items-center gap-2">
                      {m.kind === "flashcards" || m.kind === "deck" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveStudyTool({ type: "flashcards", material: m });
                            setActiveTab("study");
                          }}
                          className="w-full h-9 rounded-xl bg-primary text-on-primary font-label-caps text-[11px] uppercase flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Practice Cards</span>
                        </button>
                      ) : m.kind === "practice_test" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveStudyTool({ type: "quiz", material: m });
                            setActiveTab("study");
                          }}
                          className="w-full h-9 rounded-xl bg-surface-container-high hover:bg-surface-bright text-primary font-label-caps text-[11px] uppercase flex items-center justify-center gap-1.5 active:scale-[0.98] cursor-pointer"
                        >
                          <BookOpen className="w-3 h-3" />
                          <span>Take Quiz</span>
                        </button>
                      ) : (
                        <span className="font-code-sm text-[10px] text-outline">
                          Synthesized Reference Document
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SAVED COLLECTION */}
      {activeTab === "saved" && (
        <div className="space-y-6">
          {savedMaterials.length === 0 ? (
            <div className="p-12 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 text-center space-y-3">
              <Bookmark className="w-8 h-8 text-outline mx-auto" />
              <h3 className="font-title-md text-sm font-semibold text-on-surface">
                No saved study materials yet
              </h3>
              <p className="font-body-sm text-xs text-on-surface-variant max-w-sm mx-auto">
                Bookmark flashcard sets or summary notes to keep them pinned here for quick review.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className="h-9 px-4 rounded-xl bg-surface-container text-on-surface hover:bg-surface-container-high text-xs font-semibold cursor-pointer transition mx-auto inline-flex items-center gap-1.5"
              >
                Browse all materials
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {savedMaterials.map((m) => {
                const { Icon, tint } = getTileIcon(m.kind);
                return (
                  <div
                    key={m.id}
                    className="p-4 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${tint}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex items-center gap-0.5">
                          {/* 44px Unsave Button (Spec Requirement) */}
                          <button
                            type="button"
                            onClick={() => handleToggleSave(m)}
                            disabled={busyId === m.id}
                            className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-error transition cursor-pointer disabled:opacity-60"
                            title="Unsave material"
                          >
                            {busyId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkCheck className="w-4 h-4 text-primary hover:text-error" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(m)}
                            disabled={busyId === m.id}
                            className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-error/15 flex items-center justify-center text-on-surface-variant hover:text-error transition cursor-pointer disabled:opacity-60"
                            title="Move to trash (recoverable for 10 days)"
                            aria-label={`Delete ${m.kind || 'material'} #${m.id}`}
                          >
                            {busyId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 space-y-1">
                        <span className="font-chip-status text-[10px] uppercase font-semibold text-primary block">
                          {m.kind.replace("_", " ")}
                        </span>
                        <h3 className="font-title-md text-xs font-semibold text-on-surface">
                          Material #{m.id}
                        </h3>
                        {/* saved-date mono per 3.10.2 */}
                        <span className="font-code-sm text-[10px] text-outline block">
                          Saved {m.saved_at ? new Date(m.saved_at).toLocaleDateString() : "Recently"}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveStudyTool({
                          type: m.kind === "practice_test" ? "quiz" : "flashcards",
                          material: m,
                        });
                        setActiveTab("study");
                      }}
                      className="w-full h-9 rounded-xl bg-surface-container-high hover:bg-surface-bright text-primary font-label-caps text-[11px] uppercase flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Review Now</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ACTIVE RECALL PLAYER (FLASHCARDS & QUIZ) */}
      {activeTab === "study" && (
        <div>
          {activeStudyTool ? (
            <div>
              {activeStudyTool.type === "flashcards" ? (
                <FlashcardsPlayer
                  deckId={activeStudyTool.material.id}
                  deckTitle={`Material #${activeStudyTool.material.id} · Flashcard Deck`}
                  cards={
                    Array.isArray(activeStudyTool.material.content)
                      ? activeStudyTool.material.content
                      : []
                  }
                  streakDays={streakDays}
                  onReviewCard={handleReviewCardDispatch}
                  onCompleteSession={() => setActiveTab("files")}
                />
              ) : (
                <QuizPlayer
                  materialId={activeStudyTool.material.id}
                  quizTitle={`Material #${activeStudyTool.material.id} · Diagnostic Quiz`}
                  questions={
                    Array.isArray(activeStudyTool.material.content)
                      ? activeStudyTool.material.content
                      : []
                  }
                  streakDays={streakDays}
                  onGradeQuiz={handleGradeQuizDispatch}
                  onComplete={() => setActiveTab("files")}
                />
              )}
            </div>
          ) : (
            <div className="p-8 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 text-center space-y-4">
              <Layers className="w-10 h-10 text-primary mx-auto" />
              <h3 className="font-title-md text-base font-semibold text-on-surface">
                Select a deck or quiz to begin active recall
              </h3>
              <p className="font-body-sm text-xs text-on-surface-variant max-w-sm mx-auto">
                Choose any flashcard set or quiz from your files to launch the adaptive spaced repetition player.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("files")}
                className="h-10 px-5 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary font-label-caps text-xs uppercase inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>Browse Materials</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ACADEMIC CALENDAR */}
      {activeTab === "calendar" && (
        <AcademicCalendar onSelectAssignment={onSelectAssignment} />
      )}
      {/* TAB 5: COMPLETED WORK (the merged-in History view) */}
      {activeTab === "completed" && (
        <AssignmentHistoryView userId={userId} onSelectAssignment={onSelectAssignment} />
      )}
    </div>
  );
}
