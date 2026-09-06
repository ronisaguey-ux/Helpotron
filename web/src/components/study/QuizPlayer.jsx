import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  RotateCw,
  Award,
  Clock,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { StreakBadge, DifficultySelector } from "./MasteryRing.jsx";

export default function QuizPlayer({
  materialId,
  quizTitle = "Diagnostic Quiz",
  questions = [],
  streakDays = 0,
  onGradeQuiz,
  onComplete,
}) {
  const [currentQuestions, setCurrentQuestions] = useState(questions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({}); // question_index -> answer string
  const [submittedStates, setSubmittedStates] = useState({}); // question_index -> boolean
  const [difficulty, setDifficulty] = useState("medium");
  const [isFinished, setIsFinished] = useState(false);
  const [gradingResult, setGradingResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryOnlyWrong, setRetryOnlyWrong] = useState(false);

  useEffect(() => {
    if (questions && questions.length > 0) {
      setCurrentQuestions(questions);
      setCurrentIndex(0);
      setSelectedAnswers({});
      setSubmittedStates({});
      setIsFinished(false);
      setGradingResult(null);
    }
  }, [questions]);

  const currentQ = currentQuestions[currentIndex];

  // Derive options
  const rawOptions =
    currentQ?.options ||
    currentQ?.choices ||
    (currentQ?.answers ? Object.values(currentQ.answers) : []);

  // Ensure 4 fallback options if not explicitly array
  const options = Array.isArray(rawOptions) && rawOptions.length > 0
    ? rawOptions
    : [
        currentQ?.correct_answer || currentQ?.answer || "Option A",
        "Alternative Hypothesis A",
        "Alternative Hypothesis B",
        "Alternative Hypothesis C",
      ];

  const correctAnswer = String(
    currentQ?.correct_answer || currentQ?.answer || currentQ?.back || options[0] || ""
  ).trim();

  const isCurrentSubmitted = !!submittedStates[currentIndex];
  const currentSelected = selectedAnswers[currentIndex] || "";
  const isCorrect = currentSelected && (
    currentSelected.toLowerCase() === correctAnswer.toLowerCase() ||
    currentSelected.toLowerCase().includes(correctAnswer.toLowerCase()) ||
    correctAnswer.toLowerCase().includes(currentSelected.toLowerCase())
  );

  const handleSelectOption = (opt) => {
    if (isCurrentSubmitted) return;
    setSelectedAnswers((prev) => ({ ...prev, [currentIndex]: opt }));
  };

  const handleSubmitAnswer = () => {
    if (!currentSelected || isCurrentSubmitted) return;
    setSubmittedStates((prev) => ({ ...prev, [currentIndex]: true }));
  };

  const handleNext = async () => {
    if (currentIndex < currentQuestions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Finished all questions — submit to backend
      await submitCompleteQuiz();
    }
  };

  const submitCompleteQuiz = async () => {
    setIsSubmitting(true);
    const answersList = currentQuestions.map((q, idx) => ({
      question_index: idx,
      selected_answer: selectedAnswers[idx] || "",
    }));

    if (onGradeQuiz) {
      try {
        const res = await onGradeQuiz({
          materialId,
          answers: answersList,
        });
        setGradingResult(res);
      } catch (err) {
        console.warn("Could not grade quiz on server:", err);
      }
    }
    setIsSubmitting(false);
    setIsFinished(true);
  };

  const handleRetryWrongOnly = () => {
    if (!gradingResult?.results) return;
    const wrongIndices = gradingResult.results
      .filter((r) => !r.is_correct)
      .map((r) => r.question_index);

    const wrongQuestions = currentQuestions.filter((_, idx) => wrongIndices.includes(idx));
    if (wrongQuestions.length > 0) {
      setCurrentQuestions(wrongQuestions);
      setCurrentIndex(0);
      setSelectedAnswers({});
      setSubmittedStates({});
      setIsFinished(false);
      setGradingResult(null);
      setRetryOnlyWrong(true);
    }
  };

  const handleRestartAll = () => {
    setCurrentQuestions(questions);
    setCurrentIndex(0);
    setSelectedAnswers({});
    setSubmittedStates({});
    setIsFinished(false);
    setGradingResult(null);
    setRetryOnlyWrong(false);
  };

  if (!currentQuestions || currentQuestions.length === 0) {
    return (
      <div className="p-8 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 text-center space-y-3">
        <HelpCircle className="w-8 h-8 text-primary mx-auto" />
        <h3 className="font-title-md text-sm font-semibold text-on-surface">
          No quiz questions available
        </h3>
        <p className="font-body-sm text-xs text-on-surface-variant max-w-sm mx-auto">
          Generate practice quiz questions from study materials in your library.
        </p>
      </div>
    );
  }

  // Summary State
  if (isFinished) {
    const totalQ = currentQuestions.length;
    const results = gradingResult?.results || currentQuestions.map((q, idx) => {
      const sel = selectedAnswers[idx] || "";
      const ans = q.correct_answer || q.answer || "";
      return {
        question_index: idx,
        selected: sel,
        correct_answer: ans,
        is_correct: sel.toLowerCase() === ans.toLowerCase(),
      };
    });

    const correctCount = results.filter((r) => r.is_correct).length;
    const scorePct = Math.round((correctCount / Math.max(1, totalQ)) * 100);

    return (
      <div className="p-8 rounded-3xl bg-surface-container-lowest/90 backdrop-blur-2xl border border-outline-variant/30 shadow-xl space-y-6 max-w-3xl mx-auto animate-fadeIn">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto">
            <Award className="w-7 h-7" />
          </div>
          <h2 className="font-headline-lg text-2xl text-on-surface font-semibold">
            Diagnostic Assessment Complete
          </h2>
          <p className="font-body-sm text-xs text-on-surface-variant max-w-md mx-auto">
            Scored across {totalQ} questions. Adaptive review notes and missed concept items are listed below.
          </p>
        </div>

        {/* Score Bar */}
        <div className="p-5 rounded-2xl bg-surface-container-low border border-outline-variant/20 flex items-center justify-between gap-4">
          <div>
            <span className="font-label-caps text-[10px] uppercase text-on-surface-variant block">
              Final Score
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-tabular-stat text-3xl font-bold text-primary">
                {scorePct}%
              </span>
              <span className="font-code-sm text-xs text-on-surface-variant">
                ({correctCount} / {totalQ} correct)
              </span>
            </div>
          </div>
          <div className="w-48">
            <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  scorePct >= 70 ? "bg-sem-green" : scorePct >= 50 ? "bg-sem-amber" : "bg-error"
                }`}
                style={{ width: `${scorePct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Review List */}
        <div className="space-y-3">
          <h3 className="font-title-md text-xs font-semibold text-on-surface uppercase tracking-wider">
            Item Performance Review
          </h3>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1 font-code-sm text-xs">
            {results.map((r, i) => (
              <div
                key={i}
                className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                  r.is_correct
                    ? "bg-sem-green/10 border-sem-green/20 text-on-surface"
                    : "bg-error/10 border-error/20 text-on-surface"
                }`}
              >
                <div className="min-w-0 space-y-0.5">
                  <span className="font-semibold block">
                    Q{i + 1}: {currentQuestions[i]?.question || currentQuestions[i]?.front || `Question #${i + 1}`}
                  </span>
                  <span className="text-[11px] text-on-surface-variant block">
                    Your answer: <strong className={r.is_correct ? "text-sem-green" : "text-error"}>{r.selected || "(None)"}</strong>
                  </span>
                  {!r.is_correct && (
                    <span className="text-[11px] text-primary block">
                      Correct: {r.correct_answer}
                    </span>
                  )}
                </div>
                {r.is_correct ? (
                  <CheckCircle2 className="w-4 h-4 text-sem-green shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {correctCount < totalQ && (
            <button
              type="button"
              onClick={handleRetryWrongOnly}
              className="h-11 px-5 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary font-label-caps text-xs uppercase flex items-center gap-2 transition cursor-pointer"
            >
              <RotateCw className="w-4 h-4" />
              <span>Retry Missed Questions ({totalQ - correctCount})</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleRestartAll}
            className="h-11 px-5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-xs uppercase transition cursor-pointer"
          >
            <span>Restart Entire Quiz</span>
          </button>
          {onComplete && (
            <button
              type="button"
              onClick={onComplete}
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

  const promptText =
    currentQ?.question ||
    currentQ?.prompt ||
    currentQ?.front ||
    "Select the most accurate response based on course material:";

  const explanation = currentQ?.explanation || currentQ?.hint || "";
  const progressPct = Math.round(((currentIndex + 1) / currentQuestions.length) * 100);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Quiz Header & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-2 h-6 rounded-full bg-primary shrink-0" />
          <div className="min-w-0">
            <h2 className="font-title-md text-base font-semibold text-on-surface truncate">
              {quizTitle}
            </h2>
            <span className="font-code-sm text-xs text-on-surface-variant">
              Diagnostic Engine · Immediate Evaluation
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <StreakBadge streakDays={streakDays} />
          <DifficultySelector difficulty={difficulty} onChange={setDifficulty} />
        </div>
      </div>

      {/* Progress Strip */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-code-sm">
          <span className="text-on-surface-variant uppercase tracking-wider">
            Question <strong className="text-primary font-tabular-stat">{currentIndex + 1}</strong> of {currentQuestions.length}
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

      {/* Main Question Glass Canvas */}
      <div
        className="p-6 sm:p-8 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-xl space-y-6"
        aria-live="polite"
      >
        <div className="space-y-2">
          <span className="font-label-caps text-[10px] uppercase font-semibold text-primary px-2.5 py-0.5 rounded-full bg-primary/10 inline-block">
            Diagnostic Query · {difficulty.toUpperCase()}
          </span>
          <h3 className="font-headline-lg text-xl sm:text-2xl text-on-surface font-medium leading-relaxed">
            {promptText}
          </h3>
        </div>

        {/* Options Selection Group */}
        <div className="space-y-3">
          {options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            const isSelected = currentSelected === opt;
            const isTargetCorrect = opt.toLowerCase() === correctAnswer.toLowerCase();

            let optionStyle = "bg-surface-container-low/50 border-outline-variant/20 text-on-surface hover:bg-surface-container-high/60";
            if (isCurrentSubmitted) {
              if (isTargetCorrect) {
                optionStyle = "bg-sem-green/15 border-sem-green/40 text-sem-green shadow-sm";
              } else if (isSelected && !isTargetCorrect) {
                optionStyle = "bg-error/15 border-error/40 text-error shadow-sm";
              } else {
                optionStyle = "bg-surface-container-low/30 border-outline-variant/10 text-on-surface-variant opacity-60";
              }
            } else if (isSelected) {
              optionStyle = "bg-primary/15 border-primary text-primary shadow-sm";
            }

            return (
              <div
                key={i}
                onClick={() => handleSelectOption(opt)}
                role="button"
                tabIndex={0}
                className={`p-4 rounded-2xl border transition-all flex items-start gap-3.5 cursor-pointer min-h-[52px] ${optionStyle}`}
              >
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-code-sm text-xs font-semibold shrink-0 mt-0.5 ${
                  isCurrentSubmitted && isTargetCorrect
                    ? "bg-sem-green text-surface-container-lowest"
                    : isCurrentSubmitted && isSelected && !isTargetCorrect
                    ? "bg-error text-surface-container-lowest"
                    : isSelected
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container text-on-surface-variant"
                }`}>
                  {isCurrentSubmitted && isTargetCorrect ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : isCurrentSubmitted && isSelected && !isTargetCorrect ? (
                    <XCircle className="w-4 h-4" />
                  ) : (
                    letter
                  )}
                </div>

                <div className="font-body-md text-xs sm:text-sm font-medium leading-relaxed min-w-0">
                  {opt}
                </div>
              </div>
            );
          })}
        </div>

        {/* Explanation Reveal */}
        {isCurrentSubmitted && (
          <div className="p-4 rounded-2xl bg-surface-container-low/70 border border-outline-variant/20 space-y-1.5 animate-fadeIn">
            <div className="flex items-center gap-1.5 font-code-sm text-xs font-semibold">
              {isCorrect ? (
                <span className="text-sem-green flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Correct Resolution
                </span>
              ) : (
                <span className="text-error flex items-center gap-1">
                  <XCircle className="w-4 h-4" /> Incorrect Answer
                </span>
              )}
            </div>
            {explanation && (
              <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
                {explanation}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-surface-container-lowest/90 backdrop-blur-xl border border-outline-variant/30 shadow-xl">
        <div className="text-xs font-code-sm text-on-surface-variant">
          {!isCurrentSubmitted ? "Select an option and verify answer." : "Answer verified."}
        </div>

        <div className="flex items-center gap-2">
          {!isCurrentSubmitted ? (
            <button
              type="button"
              disabled={!currentSelected}
              onClick={handleSubmitAnswer}
              className="h-11 px-6 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase disabled:opacity-40 transition cursor-pointer shadow-sm"
            >
              <span>Submit Answer</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleNext}
              className="h-11 px-6 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase flex items-center gap-2 transition cursor-pointer shadow-[0_0_20px_rgba(89,216,201,0.25)]"
            >
              <span>{currentIndex < currentQuestions.length - 1 ? "Next Question" : "Finish Quiz"}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
