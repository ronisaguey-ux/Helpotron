"""assignment_team.py — per-assignment sub-agent team dispatch engine (09-01, Bob).

When the user picks a direction for an assignment bubble —
do it for me / study guide / quiz / flashcards / summary / custom — this module
ACTUALLY does the work: the chosen direction is executed for real (a real
first draft, a real study guide, a real practice quiz, a real flashcard deck,
a real summary), the activity lands in the assignment's progress map so the
Subagent Team ribbon shows it the moment the team starts, and a one-line human
summary is returned to the caller (stored into progress.dispatch_note).

Contract (shared with the assignment-direction picker landing route):
    async def dispatch_direction(db, user, assignment, direction: str,
                                 custom_text: str = "") -> str

Returns a one-line human summary on success and an honest '⚠️ ...' message on
failure — dispatch NEVER raises; the caller owns the credit/token gate.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

logger = logging.getLogger("helpotron.assignment_team")

# One durable step entry — shaped like the Subagent Team ribbon consumes it
# (the ribbon maps {agent, status, progress}; note/ts are extra truth).
def _step(agent: str, status: str = "completed", progress: int = 100,
          note: str = "", ts: Optional[str] = None) -> dict:
    return {
        "agent": agent,
        "status": status,
        "progress": progress,
        "note": note,
        "ts": ts or datetime.now(timezone.utc).isoformat(),
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _assignment_source_text(db: Session, assignment) -> str:
    """The REAL material behind this assignment: newest transcript first, else
    the stored prompt (the dump flow keeps pasted/uploaded content there)."""
    if assignment is None:
        return ""
    try:
        from .database import Transcript
        t = (db.query(Transcript)
             .filter(Transcript.user_id == assignment.user_id,
                     Transcript.assignment_id == assignment.id)
             .order_by(Transcript.id.desc()).first())
        if t and (t.text or "").strip():
            return t.text.strip()
    except Exception as e:  # noqa: BLE001 — honest degrade, never raise
        logger.warning("transcript lookup failed for assignment %s: %s",
                       getattr(assignment, "id", "?"), e)
    try:
        return str(getattr(assignment, "prompt", "") or "").strip()
    except Exception:
        return ""


def _effort(user) -> int:
    try:
        raw = (user.settings or {}).get("effort_score")
        return 500 if raw is None else max(100, min(1000, int(raw)))
    except (TypeError, ValueError):
        return 500


def _store_material(db: Session, user, assignment, kind: str, content: str,
                    model_used: Optional[str] = None):
    from .database import StudyMaterial
    mat = StudyMaterial(
        user_id=user.id,
        assignment_id=getattr(assignment, "id", None),
        kind=kind,
        content=content,
        model_used=model_used,
    )
    db.add(mat)
    db.commit()
    db.refresh(mat)
    return mat


def _progress_record(db: Session, assignment, step: dict, **progress_keys) -> dict:
    """Merge one real step (plus optional keys) into assignment.progress and
    persist. Always returns the updated progress dict."""
    progress = dict(getattr(assignment, "progress", None) or {})
    steps = list(progress.get("subagent_steps") or [])
    steps.append(step)
    progress["subagent_steps"] = steps
    progress.update(progress_keys)
    assignment.progress = progress
    db.commit()
    return progress


def _team_chat(assignment_id: int, sender: str, text: str, user_id: int) -> None:
    """Reuse the assignment-chat message machinery (overlord_agent.py ~906)."""
    try:
        from .overlord_agent import overlord_agent
        overlord_agent.add_chat_message(assignment_id, sender, text, user_id=user_id)
    except Exception as e:  # noqa: BLE001 — chat glue never breaks dispatch
        logger.warning("team chat post failed for assignment %s: %s", assignment_id, e)


def _ledger(db: Session, user, action_type: str, summary: str,
            assignment_id: Optional[int] = None, payload: Optional[dict] = None) -> None:
    try:
        from .agent_actions import record_agent_action
        record_agent_action(db, user, action_type, summary,
                            assignment_id=assignment_id,
                            payload=payload or {}, undo_payload={})
    except Exception as e:  # noqa: BLE001
        logger.warning("agent-action ledger failed: %s", e)


# ─── direction implementations — each performs REAL work ─────────────────────

async def _do_it_for_me(db: Session, user, assignment, custom_text: str = "") -> str:
    """The team does the assignment: announcement + ONE substantive first
    draft section built from the real material (draft.generate_draft reuse)."""
    source = _assignment_source_text(db, assignment)
    prompt = str(getattr(assignment, "prompt", "") or "")
    if not (source or prompt):
        _team_chat(assignment.id, "overlord",
                   "🤖 I wanted to start drafting, but the bubble has no material "
                   "yet — paste or upload the assignment content first.",
                   user.id)
        _progress_record(db, assignment, _step("Team Coordinator", note="no source material"))
        return "⚠️ No material in this assignment yet — the team can't draft until you paste or upload it."

    _team_chat(assignment.id, "overlord",
               "🤖 Sub-agent team taking over this assignment — drafting the "
               "first section now.\n\n"
               "💡 You can steer it: reply here with things like \"make it more "
               "academic\", \"use APA\" or \"full draft, 5 sections\".",
               user.id)
    _first = _step("Team Coordinator", status="in_progress", progress=40,
                   note="team briefed on the assignment")
    _progress_record(db, assignment, _first,
                     dispatch_note="Team is drafting the assignment…",
                     dispatch_direction="do_it_for_me")

    draft_text, model_used = None, None
    try:
        from . import draft as draft_mod
        style_text = None
        try:
            style_text = draft_mod.get_style(user.id, db)
        except Exception:  # noqa: BLE001
            style_text = None
        try:
            target_grade = (user.settings or {}).get("target_score_letter")
        except Exception:
            target_grade = None
        draft_text, model_used = await draft_mod.generate_draft(
            user_id=user.id,
            assignment_id=assignment.id,
            transcript_text=source,
            assignment_prompt=prompt,
            style_text=style_text,
            reading_level=None,
            target_grade=target_grade,
        )
    except Exception as e:  # noqa: BLE001 — LLM offline/failure: honest degrade
        logger.warning("draft generation failed for assignment %s: %s", assignment.id, e)
        _progress_record(db, assignment,
                         _step("Draft Synthesizer", status="failed", progress=0,
                               note=f"LLM unavailable: {str(e)[:120]}"),
                         dispatch_note="Draft failed — the model is unavailable right now.")
        _team_chat(assignment.id, "overlord",
                   "⚠️ I couldn't produce the draft right now — the generation "
                   "model is unavailable. Try again in a moment.", user.id)
        return "⚠️ Draft failed: generation model unavailable — try again in a moment."

    draft_text = (draft_text or "").strip()
    if not draft_text:
        _progress_record(db, assignment,
                         _step("Draft Synthesizer", status="failed", progress=0),
                         dispatch_note="Draft generation returned nothing.")
        return "⚠️ Draft generation returned empty — try again in a moment."

    # One substantive section/draft stored on the bubble (cap keeps the JSON sane).
    stored_draft = draft_text[:60000]
    progress = dict(getattr(assignment, "progress", None) or {})
    progress["first_draft"] = {
        "section": "Initial draft",
        "content": stored_draft,
        "model_used": model_used,
        "generated_at": _now(),
        "word_count": len(stored_draft.split()),
    }
    _progress_record(db, assignment,
                     _step("Draft Synthesizer", progress=100, note="first draft done"),
                     **{"first_draft": progress["first_draft"]},
                     dispatch_note=f"First draft ready — {len(stored_draft.split())} words.")
    snippet = stored_draft[:2500]
    if len(stored_draft) > 2500:
        snippet += f"\n\n… (+{len(stored_draft) - 2500} more characters — read or export the full draft)"
    _team_chat(assignment.id, "overlord",
               f"✍️ First draft done. Here's the opening:\n\n{snippet}", user.id)
    _ledger(db, user, "dispatch_direction_do_it_for_me",
            f"Drafted assignment #{assignment.id}", assignment.id,
            {"direction": "do_it_for_me"})
    return f"✅ First draft of \"{assignment.title}\" is ready ({len(stored_draft.split())} words) — see the bubble chat and progress map."


async def _study_guide(db: Session, user, assignment) -> str:
    from .study_tools import generate_study_guide
    source = _assignment_source_text(db, assignment)
    if not source:
        return _no_source("a study guide", db, user, assignment)
    _progress_record(db, assignment,
                     _step("Study Guide Agent", status="in_progress", progress=30,
                           note="parsing the material"),
                     dispatch_note="Generating study guide…",
                     dispatch_direction="study_guide")
    try:
        content, model_used = await generate_study_guide(
            source,
            assignment_prompt=str(getattr(assignment, "prompt", "") or ""),
            effort_score=_effort(user),
        )
    except Exception as e:  # noqa: BLE001 — LLM offline (raise honest msg, not 500)
        return _gen_failed("study guide", e, db, user, assignment, "Study Guide Agent")
    content = (content or "").strip()
    if not content:
        return _gen_failed("study guide", RuntimeError("empty generation"),
                           db, user, assignment, "Study Guide Agent")
    mat = _store_material(db, user, assignment, "study_guide", content, model_used)
    _progress_record(db, assignment,
                     _step("Study Guide Agent", progress=100, note="guide saved to library"),
                     dispatch_note=f"Study guide ready — material #{mat.id}.")
    _team_chat(assignment.id, "overlord",
               f"📗 Study guide generated for \"{assignment.title}\" — filed in "
               f"your library (material #{mat.id}).", user.id)
    _ledger(db, user, "dispatch_direction_study_guide",
            f"Study guide for #{assignment.id} (material {mat.id})", assignment.id,
            {"direction": "study_guide", "material_id": mat.id})
    return f"✅ Study guide for \"{assignment.title}\" is ready — saved to your library (material #{mat.id})."


async def _quiz(db: Session, user, assignment) -> str:
    from .study_tools import generate_practice_quiz
    source = _assignment_source_text(db, assignment)
    if not source:
        return _no_source("a practice quiz", db, user, assignment)
    _progress_record(db, assignment,
                     _step("Practice-Test Builder", status="in_progress", progress=30,
                           note="generating questions"),
                     dispatch_note="Building the practice quiz…",
                     dispatch_direction="quiz")
    try:
        parsed, model_used = await generate_practice_quiz(
            source,
            mc_count=10,
            short_answer_count=5,
            effort_score=_effort(user),
        )
    except Exception as e:  # noqa: BLE001
        return _gen_failed("practice quiz", e, db, user, assignment, "Practice-Test Builder")
    if not isinstance(parsed, dict) or not ("multiple_choice" in parsed or "short_answer" in parsed):
        return _gen_failed("practice quiz", RuntimeError("bad shape"),
                           db, user, assignment, "Practice-Test Builder")
    # Library reads the 'practice_test' kind (MAT_META) — store under that name.
    mat = _store_material(db, user, assignment, "practice_test",
                          json.dumps(parsed, ensure_ascii=False), model_used)
    mc = len(parsed.get("multiple_choice") or [])
    sa = len(parsed.get("short_answer") or [])
    _progress_record(db, assignment,
                     _step("Practice-Test Builder", progress=100,
                           note=f"{mc} MC + {sa} short-answer questions"),
                     dispatch_note=f"Practice quiz ready — {mc} MC + {sa} short answer (material #{mat.id}).")
    _team_chat(assignment.id, "overlord",
               f"📝 Practice quiz generated — {mc} multiple-choice + {sa} "
               f"short-answer questions (material #{mat.id}).", user.id)
    _ledger(db, user, "dispatch_direction_quiz",
            f"Practice quiz for #{assignment.id} (material {mat.id})", assignment.id,
            {"direction": "quiz", "material_id": mat.id})
    return f"✅ Practice quiz on \"{assignment.title}\" is ready — {mc} MC + {sa} short-answer (material #{mat.id})."


async def _flashcards(db: Session, user, assignment) -> str:
    from .overlord_agent import _build_flashcard_deck
    source = _assignment_source_text(db, assignment)
    if not (source or str(getattr(assignment, "prompt", "") or "")):
        return _no_source("flashcards", db, user, assignment)
    _progress_record(db, assignment,
                     _step("Flashcard Builder", status="in_progress", progress=30,
                           note="building the deck"),
                     dispatch_note="Building flashcard deck…",
                     dispatch_direction="flashcards")
    try:
        mat, items = await _build_flashcard_deck(
            db, user,
            source=source,
            count_hint=20,
            assignment_id=getattr(assignment, "id", None),
        )
    except Exception as e:  # noqa: BLE001
        return _gen_failed("flashcards", e, db, user, assignment, "Flashcard Builder")
    _progress_record(db, assignment,
                     _step("Flashcard Builder", progress=100,
                           note=f"{len(items)} cards in the deck"),
                     dispatch_note=f"Flashcard deck ready — {len(items)} cards (material #{mat.id}).")
    _team_chat(assignment.id, "overlord",
               f"🃏 Flashcard deck generated — {len(items)} cards (material #{mat.id}).", user.id)
    _ledger(db, user, "dispatch_direction_flashcards",
            f"Flashcards for #{assignment.id} (material {mat.id})", assignment.id,
            {"direction": "flashcards", "material_id": mat.id})
    return f"✅ Flashcard deck on \"{assignment.title}\" is ready — {len(items)} cards (material #{mat.id})."


async def _summary(db: Session, user, assignment) -> str:
    from .study_tools import generate_summary
    source = _assignment_source_text(db, assignment)
    if not source:
        return _no_source("a 2-minute summary", db, user, assignment)
    _progress_record(db, assignment,
                     _step("Lecture Summarizer", status="in_progress", progress=30,
                           note="summarizing the material"),
                     dispatch_note="Writing the 2-minute summary…",
                     dispatch_direction="summary")
    try:
        content, model_used = await generate_summary(
            source, effort_score=_effort(user))
    except Exception as e:  # noqa: BLE001
        return _gen_failed("summary", e, db, user, assignment, "Lecture Summarizer")
    content = (content or "").strip()
    if not content:
        return _gen_failed("summary", RuntimeError("empty generation"),
                           db, user, assignment, "Lecture Summarizer")
    mat = _store_material(db, user, assignment, "summary", content, model_used)
    _progress_record(db, assignment,
                     _step("Lecture Summarizer", progress=100, note="summary saved to library"),
                     dispatch_note=f"2-minute summary ready — material #{mat.id}.")
    _team_chat(assignment.id, "overlord",
               f"📄 2-minute summary of \"{assignment.title}\" done — material "
               f"#{mat.id} in your library.", user.id)
    _ledger(db, user, "dispatch_direction_summary",
            f"Summary for #{assignment.id} (material {mat.id})", assignment.id,
            {"direction": "summary", "material_id": mat.id})
    return f"✅ 2-minute summary of \"{assignment.title}\" is ready — saved to your library (material #{mat.id})."


# ─── failure helpers: honest in-band messages, never a raise ─────────────────

def _no_source(what: str, db: Session, user, assignment) -> str:
    _team_chat(assignment.id, "overlord",
               f"⚠️ I can't build {what} yet — the bubble has no material. "
               "Paste or upload the assignment content first, or point the dump at it.",
               user.id)
    _progress_record(db, assignment, _step("Team Coordinator", note="no source material"))
    return (f"⚠️ Nothing to build {what} from — paste or upload the assignment "
            "material into this bubble first.")


def _gen_failed(what: str, err: Exception, db: Session, user, assignment, agent_name: str) -> str:
    logger.warning("%s generation failed for assignment %s: %s",
                   what, getattr(assignment, "id", "?"), err)
    _progress_record(db, assignment,
                     _step(agent_name, status="failed", progress=0,
                           note=f"failed: {str(err)[:140]}"),
                     dispatch_note=f"{what.title()} failed — the generation model is unavailable.")
    _team_chat(assignment.id, "overlord",
               f"⚠️ I couldn't generate the {what} right now — the generation "
               "model is unavailable. Try again in a moment.", user.id)
    return f"⚠️ {what.title()} failed: generation model unavailable — try again in a moment."


# ─── the dispatch contract ────────────────────────────────────────────────────

async def dispatch_direction(db: Session, user, assignment, direction: str,
                             custom_text: str = "") -> str:
    """Run the assignment direction for real. Returns a one-line human summary
    (caller stores it into progress.dispatch_note). NEVER raises."""
    direction = (direction or "").strip().lower()
    try:
        if assignment is None:
            return "⚠️ No assignment found to run that direction on."

        # Custom: only run when the direction module can vouch for it; the
        # Data Lake entry (feature request) is the caller's job.
        if direction == "custom":
            try:
                # 09-01: the direction module is authoritative — custom is only
                # runnable when its free text names a real capability.
                from .assignment_direction import is_direction_achievable
                if is_direction_achievable("custom", custom_text or ""):
                    text_l = (custom_text or "").strip().lower()
                    known = {
                        "do_it_for_me": ("do it for me", "do it", "solve",
                                         "solution", "done for me"),
                        "study_guide": ("study guide", "cheat sheet", "notes",
                                        "outline", "explain", "explanation"),
                        "quiz": ("quiz", "practice test", "test me",
                                 "questions", "question bank"),
                        "flashcards": ("flashcard", "flash card", "anki",
                                       "spaced repetition"),
                        "summary": ("summary", "summarize", "summarise",
                                    "synopsis"),
                    }
                    for d, needles in known.items():
                        if any(n in text_l for n in needles):
                            return await dispatch_direction(db, user, assignment,
                                                            d, custom_text)
                return "Not something I can do yet — already requested from the team (Data Lake)"
            except (ImportError, AttributeError, TypeError):
                return "Not something I can do yet — already requested from the team (Data Lake)"

        if direction == "do_it_for_me":
            return await _do_it_for_me(db, user, assignment, custom_text)
        if direction in ("study_guide", "studyguide"):
            return await _study_guide(db, user, assignment)
        if direction in ("quiz", "practice_quiz", "practice_test", "test"):
            return await _quiz(db, user, assignment)
        if direction in ("flashcards",):
            return await _flashcards(db, user, assignment)
        if direction == "summary":
            return await _summary(db, user, assignment)

        # Unknown direction — validate against the contract when available so
        # typos get a real answer, otherwise honest fallback.
        try:
            from .assignment_direction import DIRECTIONS
            listed = ", ".join(DIRECTIONS) if isinstance(DIRECTIONS, (list, tuple, dict, set)) else str(DIRECTIONS)
            return f"⚠️ Unknown direction '{direction}' — pick one of: {listed}"
        except Exception:  # noqa: BLE001
            return (f"⚠️ Unknown direction '{direction}' — pick do_it_for_me, "
                    "study_guide, quiz, flashcards, summary or custom.")
    except Exception as e:  # noqa: BLE001 — the contract never raises
        logger.exception("dispatch_direction failed: %s", e)
        return (f"⚠️ That team run hit a snag: {str(e)[:120]} — try again in a moment.")
