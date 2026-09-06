import React, { useState, useEffect, useCallback } from "react";
import {
  RotateCw,
  Shuffle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Volume2,
  Sparkles,
  Award,
  Flame,
  ArrowRight,
} from "lucide-react";
import { MasteryRing, StreakBadge, DifficultySelector } from "./MasteryRing.jsx";

export default function FlashcardsPlayer({
  deckId,
  deckTitle = "Flashcards Study Deck",
  cards = [],
  streakDays = 0,
  onReviewCard,
  onCompleteSession,
}) {
  const [deck, setDeck] = useState(cards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [difficulty, setDifficulty] = useState("medium");
  const [sessionResults, setSessionResults] = useState({}); // index -> rating
  const [isFinished, setIsFinished] = useState(false);
  const [speechActive, setSpeechActive] = useState(false);

  // Synchronize incoming cards
  useEffect(() => {
    if (cards && cards.length > 0) {
      setDeck(cards);
      setCurrentIndex(0);
      setIsFlipped(false);
      setSessionResults({});
      setIsFinished(false);
    }
  }, [cards]);

  const currentCard = deck[currentIndex];

  // Handle Flip
  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept typing in inputs
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;

      if (e.code === "Space") {
        e.preventDefault();
        handleFlip();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "1") {
        handleRateCard(1);
      } else if (e.key === "2") {
        handleRateCard(2);
      } else if (e.key === "3") {
        handleRateCard(3);
      } else if (e.key === "4") {
        handleRateCard(4);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFlip, currentIndex, deck.length]);

  // Handle Next / Prev
  const handleNext = () => {
    if (currentIndex < deck.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
    } else {
      setIsFinished(true);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setIsFlipped(false);
    }
  };

  // Handle Shuffle
  const handleToggleShuffle = () => {
    if (!isShuffled) {
      const shuffled = [...deck].sort(() => Math.random() - 0.5);
      setDeck(shuffled);
      setIsShuffled(true);
      setCurrentIndex(0);
      setIsFlipped(false);
    } else {
      setDeck(cards);
      setIsShuffled(false);
      setCurrentIndex(0);
      setIsFlipped(false);
    }
  };

  // Handle Rating (FSRS scale 1: Again, 2: Hard, 3: Good, 4: Easy)
  const handleRateCard = async (rating) => {
    setSessionResults((prev) => ({ ...prev, [currentIndex]: rating }));

    if (onReviewCard) {
      try {
        await onReviewCard({
          cardIndex: currentIndex,
          rating,
          difficulty,
        });
      } catch (err) {
        console.warn("Could not dispatch card review:", err);
      }
    }

    // Auto advance
    handleNext();
  };

  // Text-to-speech audio pronunciation
  const handleSpeak = (text) => {
    if ("speechSynthesis" in window) {
      setSpeechActive(true);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setSpeechActive(false);
      utterance.onerror = () => setSpeechActive(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  // Restart Deck
  const handleRestart = () => {
    setDeck(cards);
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionResults({});
    setIsFinished(false);
  };

  if (!deck || deck.length === 0) {
    return (
      <div className="p-8 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 text-center space-y-3">
        <HelpCircle className="w-8 h-8 text-primary mx-auto" />
        <h3 className="font-title-md text-sm font-semibold text-on-surface">
          No flashcards available in this deck
        </h3>
        <p className="font-body-sm text-xs text-on-surface-variant max-w-sm mx-auto">
          Generate flashcards from your assignments or notes in the Study Tools creator.
        </p>
      </div>
    );
  }

  // End of Deck Summary State
  if (isFinished) {
    const totalCount = deck.length;
    const answeredCount = Object.keys(sessionResults).length;
    const masteredCount = Object.values(sessionResults).filter((r) => r >= 3).length;
    const accuracyPct = Math.round((masteredCount / Math.max(1, answeredCount)) * 100);

    return (
      <div className="p-8 rounded-3xl bg-surface-container-lowest/90 backdrop-blur-2xl border border-outline-variant/30 shadow-xl text-center space-y-6 animate-fadeIn">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto">
          <Award className="w-8 h-8" />
        </div>

        <div>
          <span className="font-label-caps text-xs text-primary uppercase tracking-wider font-semibold">
            Deck Complete · Spaced Repetition Updated
          </span>
          <h2 className="font-headline-lg text-2xl text-on-surface font-semibold mt-1">
            Outstanding Recall Session!
          </h2>
          <p className="font-body-sm text-xs text-on-surface-variant mt-1 max-w-md mx-auto">
            {masteredCount} out of {totalCount} terms marked as Good or Easy. Intervals have been calculated by the FSRS scheduler.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
          <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20">
            <span className="font-code-sm text-[10px] text-outline uppercase block">Accuracy</span>
            <span className="font-tabular-stat text-xl font-bold text-primary block mt-1">
              {accuracyPct}%
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20">
            <span className="font-code-sm text-[10px] text-outline uppercase block">Cards Reviewed</span>
            <span className="font-tabular-stat text-xl font-bold text-on-surface block mt-1">
              {answeredCount}/{totalCount}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20">
            <span className="font-code-sm text-[10px] text-outline uppercase block">Mastered</span>
            <span className="font-tabular-stat text-xl font-bold text-sem-green block mt-1">
              {masteredCount}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            type="button"
            onClick={handleRestart}
            className="h-11 px-6 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-xs uppercase flex items-center gap-2 transition cursor-pointer"
          >
            <RotateCw className="w-4 h-4 text-primary" />
            <span>Practice Again</span>
          </button>
          {onCompleteSession && (
            <button
              type="button"
              onClick={onCompleteSession}
              className="h-11 px-6 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase flex items-center gap-2 shadow-[0_0_20px_rgba(89,216,201,0.25)] transition cursor-pointer"
            >
              <span>Back to Library</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Card Content Extraction
  const frontText =
    currentCard?.front ||
    currentCard?.question ||
    currentCard?.term ||
    (Array.isArray(currentCard) ? currentCard[0] : "Question not available");

  const backText =
    currentCard?.back ||
    currentCard?.answer ||
    currentCard?.definition ||
    (Array.isArray(currentCard) ? currentCard[1] : "Answer not available");

  const subPrompt = currentCard?.sub_prompt || currentCard?.hint || "";
  const progressPct = Math.round(((currentIndex + 1) / deck.length) * 100);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Deck Header & Telemetry Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-2 h-6 rounded-full bg-primary shrink-0" />
          <div className="min-w-0">
            <h2 className="font-title-md text-base font-semibold text-on-surface truncate">
              {deckTitle}
            </h2>
            <span className="font-code-sm text-xs text-on-surface-variant">
              Active Recall · FSRS Adaptive Intervals
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <StreakBadge streakDays={streakDays} />
          <DifficultySelector difficulty={difficulty} onChange={setDifficulty} />
        </div>
      </div>

      {/* Progress Counter Strip */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-code-sm">
          <span className="text-on-surface-variant uppercase tracking-wider">
            Card <strong className="text-primary font-tabular-stat">{currentIndex + 1}</strong> of {deck.length}
          </span>
          <span className="text-outline font-tabular-stat">{progressPct}% Completed</span>
        </div>
        <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* 3D Flashcard Container with Reduced-Motion Fallback */}
      <div
        className="perspective-1000 w-full min-h-[380px] sm:min-h-[420px] cursor-pointer select-none"
        onClick={handleFlip}
        role="button"
        tabIndex={0}
        aria-label="Flashcard. Click or press Space to flip."
        onKeyDown={(e) => {
          if (e.code === "Space" || e.code === "Enter") {
            e.preventDefault();
            handleFlip();
          }
        }}
      >
        <div
          className={`relative w-full h-full min-h-[380px] sm:min-h-[420px] rounded-3xl p-6 sm:p-8 bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-xl transition-all duration-500 hover:border-primary/40 flex flex-col justify-between ${
            isFlipped ? "border-primary/50 shadow-[0_0_30px_rgba(89,216,201,0.15)]" : ""
          }`}
        >
          {/* Top Meta Bar inside Card */}
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-outline-variant/15">
            <div className="flex items-center gap-2">
              <span className="font-label-caps text-[10px] uppercase font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {isFlipped ? "Answer & Resolution" : "Recall Prompt"}
              </span>
              <span className="font-chip-status text-[10px] uppercase px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-code-sm">
                {difficulty.toUpperCase()}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSpeak(isFlipped ? backText : frontText);
                }}
                className="w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary flex items-center justify-center transition cursor-pointer"
                title="Listen to text pronunciation"
              >
                <Volume2 className={`w-4 h-4 ${speechActive ? "text-primary animate-pulse" : ""}`} />
              </button>
              <kbd className="hidden sm:inline-block px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-code-sm text-[10px] text-outline">
                ␣ Space to Flip
              </kbd>
            </div>
          </div>

          {/* Central Card Text Content */}
          <div className="py-6 sm:py-8 my-auto space-y-4">
            {!isFlipped ? (
              <div className="space-y-3">
                <span className="font-code-sm text-[11px] text-primary tracking-widest uppercase block">
                  // QUESTION {currentIndex + 1}
                </span>
                <h3 className="font-headline-lg text-xl sm:text-2xl md:text-3xl text-on-surface font-medium leading-relaxed">
                  {frontText}
                </h3>
                {subPrompt && difficulty !== "hard" && (
                  <p className="font-code-sm text-xs text-on-surface-variant bg-surface-container-low/60 p-3 rounded-xl border border-outline-variant/20">
                    <span className="text-primary font-medium">&gt; Hint:</span> {subPrompt}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3 animate-fadeIn">
                <div className="flex items-center gap-1.5 text-sem-green font-code-sm text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="uppercase tracking-wider font-semibold">Answer Resolution</span>
                </div>
                <div className="p-4 sm:p-5 rounded-2xl bg-surface-container-low/70 border border-outline-variant/20 font-body-md text-sm sm:text-base text-on-surface leading-relaxed">
                  {backText}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Card Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-outline-variant/15 text-xs text-on-surface-variant">
            <span className="font-code-sm text-[11px] text-outline">
              Helpotron Neural Spaced Repetition
            </span>
            <span className="font-code-sm text-[11px] text-primary hover:underline">
              {isFlipped ? "Click to see prompt ↻" : "Click to reveal answer ↻"}
            </span>
          </div>
        </div>
      </div>

      {/* Control Toolbar: FSRS Ratings & Navigation */}
      <div className="p-4 rounded-2xl bg-surface-container-lowest/90 backdrop-blur-xl border border-outline-variant/30 shadow-xl flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Flip Trigger & Shuffle Buttons */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={handleFlip}
            className="h-11 px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-xs flex items-center justify-center gap-1.5 transition cursor-pointer flex-1 md:flex-initial"
          >
            <RotateCw className="w-3.5 h-3.5 text-primary" />
            <span>{isFlipped ? "Show Prompt" : "Flip Card"}</span>
          </button>
          <button
            type="button"
            onClick={handleToggleShuffle}
            aria-pressed={isShuffled}
            className={`h-11 px-3 rounded-xl border font-code-sm text-xs flex items-center gap-1.5 transition cursor-pointer ${
              isShuffled
                ? "bg-primary/10 border-primary text-primary"
                : "bg-surface-container border-outline-variant/30 text-on-surface-variant hover:text-on-surface"
            }`}
            title="Shuffle cards"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Shuffle</span>
          </button>
        </div>

        {/* FSRS Rating Buttons (1..4) */}
        <div className="grid grid-cols-4 gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={() => handleRateCard(1)}
            className="h-11 px-3 rounded-xl bg-error/15 hover:bg-error/25 border border-error/30 text-error font-label-caps text-[11px] flex flex-col items-center justify-center transition active:scale-[0.97] cursor-pointer"
          >
            <span className="font-bold">AGAIN</span>
            <span className="font-code-sm text-[9px] opacity-80">&lt;10m [1]</span>
          </button>
          <button
            type="button"
            onClick={() => handleRateCard(2)}
            className="h-11 px-3 rounded-xl bg-surface-container-high hover:bg-surface-bright border border-outline-variant/30 text-on-surface font-label-caps text-[11px] flex flex-col items-center justify-center transition active:scale-[0.97] cursor-pointer"
          >
            <span className="font-bold">HARD</span>
            <span className="font-code-sm text-[9px] opacity-80">1d [2]</span>
          </button>
          <button
            type="button"
            onClick={() => handleRateCard(3)}
            className="h-11 px-3 rounded-xl bg-sem-blue/15 hover:bg-sem-blue/25 border border-sem-blue/30 text-sem-blue font-label-caps text-[11px] flex flex-col items-center justify-center transition active:scale-[0.97] cursor-pointer"
          >
            <span className="font-bold">GOOD</span>
            <span className="font-code-sm text-[9px] opacity-80">3d [3]</span>
          </button>
          <button
            type="button"
            onClick={() => handleRateCard(4)}
            className="h-11 px-4 rounded-xl bg-primary hover:bg-primary-fixed-dim text-on-primary font-label-caps text-[11px] flex flex-col items-center justify-center shadow-[0_0_20px_rgba(89,216,201,0.25)] transition active:scale-[0.97] cursor-pointer"
          >
            <span className="font-bold">EASY</span>
            <span className="font-code-sm text-[9px] opacity-90">7d [4]</span>
          </button>
        </div>

        {/* Step Navigation */}
        <div className="flex items-center gap-1 w-full md:w-auto justify-between md:justify-end">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={handlePrev}
            className="h-11 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container disabled:opacity-40 text-on-surface font-label-caps text-xs flex items-center gap-1 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev</span>
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="h-11 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-label-caps text-xs flex items-center gap-1 cursor-pointer"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
