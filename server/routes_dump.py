"""FastAPI routes for Universal Assignment Dump and Overlord AI Routing."""
from __future__ import annotations

import json
import math
import os
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .assignment_dump import assignment_dump_manager, classify_assignment_meta
from .database import Assignment, Draft, StudyMaterial, Transcript, UniversalDumpItem, User, get_db, utcnow
from .routes_features import get_current_authenticated_user
from .security import is_admin_user
from .credits import debit_tokens_atomic, is_unmetered, task_tokens_to_usd, TOKENS_PER_USD

router = APIRouter(prefix="/api/dump", tags=["assignment_dump"])

# Finalize actions the subagent pipeline consumrs (Assignment Dump → study kinds).
FINALIZE_ACTIONS = ("flashcards", "practice_quiz", "study_guide", "summary", "do_it")

# Subject classification (auto-route + finalize) lives in assignment_dump.py.
# Which actions generate a StudyMaterial, and which material kind they map to
# (practice_quiz maps to the existing "practice_test" material kind; do_it
# maps to "solution" — the real completed work, never a fake handoff).
GENERATING_ACTIONS = {
    "flashcards": "flashcards",
    "practice_quiz": "practice_test",
    "study_guide": "study_guide",
    "summary": "summary",
    "do_it": "solution",
}
ALL_MATERIAL_KINDS = ("study_guide", "flashcards", "practice_test", "summary", "solution")


def _split_generation_chunks(text: Optional[str], size: int = 8000) -> list[str]:
    """Split source text into prompt-sized chunks on paragraph/sentence
    boundaries so finalize generation covers the FULL source (08-28 BUG-1)."""
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]
    chunks: list[str] = []
    start, total = 0, len(text)
    while start < total:
        end = min(start + size, total)
        if end < total:
            # Prefer a paragraph break, then a line break — both within the
            # second half so one chunk is never just a few words long.
            gap = text.rfind("\n\n", start + size // 2, end)
            if gap == -1:
                gap = text.rfind("\n", start + size // 2, end)
            if gap != -1 and gap > start + size // 4:
                end = gap + 1
        chunks.append(text[start:end].strip())
        start = end
    return [c for c in chunks if c]


def _is_untouched_auto_bubble(assignment: Optional[Assignment]) -> bool:
    """Auto-created dump bubble with no work yet (created_from_dump, no finalize
    request, no generated materials): re-routing reuses/removes it instead of
    leaving a duplicate bubble behind (08-28)."""
    if assignment is None or not (assignment.progress or {}).get("created_from_dump"):
        return False
    progress = assignment.progress or {}
    if progress.get("requested_action"):
        return False
    return not any(progress.get(k) for k in ALL_MATERIAL_KINDS) and not progress.get("do_it_work")

# Per-kind generation system prompts (Assignment Dump finalize).
FINALIZE_PROMPTS = {
    "flashcards": (
        "Return ONLY a JSON array of 12-20 objects {\"q\": term, \"a\": definition} "
        "built from the assignment text. Plain JSON, no markdown."
    ),
    "practice_quiz": (
        "Return ONLY a JSON array of 8-12 objects {\"q\": question, \"options\": [a,b,c,d], "
        "\"answer\": one of the options, \"explain\": short} built from the assignment text. "
        "Plain JSON, no markdown."
    ),
    "study_guide": (
        "Write a structured study guide in markdown (key concepts, formulas, terms, practice "
        "prompts) from this assignment text, under 800 words."
    ),
    "summary": (
        "Write a concise summary under 400 words in markdown."
    ),
    "do_it": (
        "You are completing an assignment for a student from the material below. "
        "Produce the actual finished work the assignment asks for (essay, response, "
        "solution, timeline, etc.) — full answer, no meta-commentary, no 'here is a "
        "plan', no questions. Use markdown headings matching the assignment's own "
        "rubric. If the assignment is a question set, answer every question directly."
    ),
}


class ManualRoutePayload(BaseModel):
    assignment_id: Optional[int] = None
    create_new: bool = False
    new_assignment_title: Optional[str] = None
    new_assignment_subject: Optional[str] = None


class FinalizePayload(BaseModel):
    action: str = Field(..., max_length=32)


class BatchFinalizePayload(BaseModel):
    ids: Optional[List[int]] = None
    skip: Optional[List[int]] = None
    action: Optional[str] = None


@router.post("/upload")
async def upload_dump_file(
    file: UploadFile = File(...),
    assignment_id: Optional[int] = Form(None),
    subject: Optional[str] = Form(None),
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Universal upload endpoint for any file (PDF, DOCX, TXT, Audio, Video, Image).

    Extracts content via Gemini 3.1 Flash-Lite (Audio) / Gemini 3.8 Flash (Vision/OCR),
    and uses the Overlord AI to automatically route to the correct assignment.
    """
    filename = file.filename or "uploaded_file.bin"
    ext = os.path.splitext(filename)[1].lower()
    disallowed_exts = {".exe", ".bat", ".sh", ".cmd", ".ps1", ".msi", ".py", ".js", ".php", ".cgi", ".bin", ".dll", ".so", ".elf"}
    if ext in disallowed_exts:
        raise HTTPException(status_code=400, detail="Executable and script file uploads are not permitted.")

    max_dump_bytes = 100 * 1024 * 1024  # 100MB limit
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")
    if len(content) > max_dump_bytes:
        raise HTTPException(status_code=413, detail="Uploaded file exceeds 100MB limit.")

    dump_item = await assignment_dump_manager.process_dump_upload(
        db=db,
        user=current_user,
        filename=filename,
        content=content,
        manual_assignment_id=assignment_id,
        subject=subject,
    )
    # Falling back to the matched assignment's own subject keeps a dump filed under
    # the same bubble as the assignment it landed on, rather than showing up unfiled.
    if not dump_item.subject and dump_item.matched_assignment_id:
        _matched = db.query(Assignment).filter(Assignment.id == dump_item.matched_assignment_id).first()
        if _matched:
            dump_item.subject = (_matched.progress or {}).get("subject") or None
            db.commit()

    matched_title = None
    match_subject = None
    if dump_item.matched_assignment_id:
        matched_assign = db.query(Assignment).filter(Assignment.id == dump_item.matched_assignment_id).first()
        if matched_assign:
            matched_title = matched_assign.title
            match_subject = (matched_assign.progress or {}).get("subject")

    return {
        "status": "success",
        "dump_id": dump_item.id,
        "file_name": dump_item.file_name,
        "file_type": dump_item.file_type,
        "item_status": dump_item.status,
        "auto_match_confidence": dump_item.auto_match_confidence,
        "matched_assignment_id": dump_item.matched_assignment_id,
        "matched_assignment_title": matched_title,
        "subject": dump_item.subject or match_subject,
        "overlord_notes": dump_item.overlord_notes,
        "snippet": (dump_item.extracted_text or "")[:250],
    }


class TextDumpPayload(BaseModel):
    """Raw pasted text filed under a subject — no file, no upload."""

    text: str = Field(..., min_length=1, max_length=200_000)
    title: Optional[str] = Field(None, max_length=512)
    subject: Optional[str] = Field(None, max_length=256)
    assignment_id: Optional[int] = None


@router.post("/upload-text")
async def upload_dump_text(
    payload: TextDumpPayload,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Dump pasted text into a subject.

    The file path needs an upload; a pasted syllabus, a teacher's email, a set of
    notes does not, and requiring a file for those meant the only way to give the
    agent raw material was to save it to disk first. Same dump record, same
    routing, `file_type="text"` and no file on disk.
    """
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Nothing to dump — the text was empty.")

    title = (payload.title or "").strip()[:512]
    if not title:
        # A dump always has a name so it is identifiable in the list and the agent
        # has something to refer to; derive one from the first line of the text.
        first_line = next((ln.strip() for ln in text.splitlines() if ln.strip()), "")
        title = (first_line[:120] or "Pasted note")

    # Route to an explicit assignment when given, but verify ownership — an
    # assignment_id from the request body is a claim, not a permission.
    assignment = None
    if payload.assignment_id is not None:
        assignment = (
            db.query(Assignment)
            .filter(Assignment.id == payload.assignment_id, Assignment.user_id == current_user.id)
            .first()
        )
        if assignment is None:
            raise HTTPException(status_code=404, detail="Assignment not found for this user.")

    subject = (payload.subject or "").strip()[:256] or None
    if not subject and assignment is not None:
        subject = (assignment.progress or {}).get("subject") or None

    status = "manual_routed" if assignment is not None else "pending_analysis"
    notes = "Pasted text filed manually by user."
    if assignment is not None:
        notes = f"Pasted text routed to '{assignment.title}' by the user."
    elif subject:
        notes = f"Pasted text filed under subject '{subject}'; awaiting agent triage."

    dump_item = UniversalDumpItem(
        user_id=current_user.id,
        file_name=title,
        file_type="text",
        file_size_bytes=len(text.encode("utf-8")),
        file_path=None,
        status=status,
        extracted_text=text,
        subject=subject,
        matched_assignment_id=assignment.id if assignment is not None else None,
        auto_match_confidence=1.0 if assignment is not None else None,
        overlord_notes=notes,
        created_at=utcnow(),
    )
    db.add(dump_item)
    db.commit()
    db.refresh(dump_item)

    return {
        "status": "success",
        "dump_id": dump_item.id,
        "file_name": dump_item.file_name,
        "file_type": dump_item.file_type,
        "item_status": dump_item.status,
        "subject": dump_item.subject,
        "matched_assignment_id": dump_item.matched_assignment_id,
        "matched_assignment_title": assignment.title if assignment is not None else None,
        "overlord_notes": dump_item.overlord_notes,
        "snippet": text[:250],
    }


@router.get("/list")
async def list_dump_items(
    status: Optional[str] = Query(None),
    subject: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Retrieves all universal dumped items for user with Overlord assignment match details."""
    query = db.query(UniversalDumpItem).filter(UniversalDumpItem.user_id == current_user.id)
    if status:
        query = query.filter(UniversalDumpItem.status == status)
    if subject:
        # Case-insensitive exact match: a subject name originates from the user (a
        # custom bubble), so two spellings of one subject must not split the list.
        query = query.filter(func.lower(UniversalDumpItem.subject) == subject.strip().lower())

    items = query.order_by(UniversalDumpItem.created_at.desc()).limit(limit).all()

    result = []
    for item in items:
        matched_title = None
        if item.matched_assignment_id:
            assign = db.query(Assignment).filter(Assignment.id == item.matched_assignment_id).first()
            if assign:
                matched_title = assign.title

        result.append({
            "id": item.id,
            "file_name": item.file_name,
            "file_type": item.file_type,
            "file_size_bytes": item.file_size_bytes,
            "status": item.status,
            "extracted_text": item.extracted_text,
            "matched_assignment_id": item.matched_assignment_id,
            "matched_assignment_title": matched_title,
            "subject": item.subject,
            "auto_match_confidence": item.auto_match_confidence,
            "overlord_notes": item.overlord_notes,
            "requested_action": item.requested_action,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        })

    return {
        "status": "success",
        "count": len(result),
        "items": result,
    }


@router.post("/{dump_id}/route")
async def manual_route_dump_item(
    dump_id: int,
    payload: ManualRoutePayload,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Manual override for assignment routing (auth + ownership enforced — BATCH-04 IDOR)."""
    item = db.query(UniversalDumpItem).filter(UniversalDumpItem.id == dump_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Dump item not found.")
    if item.user_id != current_user.id and not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Cannot route dump items owned by another user")

    prev_assignment = None
    if item.matched_assignment_id:
        prev_assignment = db.query(Assignment).filter(
            Assignment.id == item.matched_assignment_id,
            Assignment.user_id == item.user_id,
        ).first()

    if payload.create_new:
        title = payload.new_assignment_title or f"Assignment from {item.file_name}"
        if _is_untouched_auto_bubble(prev_assignment):
            new_assign = prev_assignment
            new_assign.title = title
            db.flush()
        else:
            new_assign = Assignment(
                user_id=item.user_id,
                title=title,
                prompt=item.extracted_text or f"Generated from dumped file {item.file_name}",
                # 09-01 lifecycle: new assignments await the user's direction.
                status="pending_approval",
                progress={"created_from_dump": True, "dump_file_id": item.id},
            )
            db.add(new_assign)
            db.commit()
            db.refresh(new_assign)

        item.matched_assignment_id = new_assign.id
        item.auto_match_confidence = 1.0
        item.status = "manual_routed"
        item.overlord_notes = (
            f"Re-routed to bubble '{new_assign.title}' (auto-created bubble reused)."
            if new_assign is prev_assignment
            else f"Manually created and routed to new assignment '{new_assign.title}'."
        )
    elif payload.assignment_id:
        target = db.query(Assignment).filter(
            Assignment.id == payload.assignment_id,
            Assignment.user_id == current_user.id,
        ).first()
        if not target:
            raise HTTPException(status_code=404, detail="Assignment not found")
        item.matched_assignment_id = target.id
        item.auto_match_confidence = 1.0
        item.status = "manual_routed"
        item.overlord_notes = "Manually assigned to existing assignment."
        if _is_untouched_auto_bubble(prev_assignment):
            db.query(StudyMaterial).filter(StudyMaterial.assignment_id == prev_assignment.id).delete()
            db.delete(prev_assignment)
            item.overlord_notes = (
                f"Manually assigned to '{target.title}' (unused auto-created bubble removed)."
            )
    else:
        raise HTTPException(status_code=400, detail="Must provide assignment_id or create_new=True")

    db.commit()
    db.refresh(item)
    return {"status": "success", "item_id": item.id, "matched_assignment_id": item.matched_assignment_id}


def _calculate_dump_item_cost(item: UniversalDumpItem) -> tuple[int, int, int, float]:
    """Returns (est_input_tokens, est_output_tokens, est_cost_tokens, est_cost_usd)."""
    from .credits import calculate_task_token_cost
    from .cost_tracking import _rates_for

    source_text = (item.extracted_text or "").strip()
    est_input_tokens = max(100, int(len(source_text) / 4))
    est_output_tokens = max(250, min(4000, int(est_input_tokens * 0.6)))
    rates = _rates_for("deepseek/deepseek-v4.1-flash")
    raw_usd = (est_input_tokens / 1000.0) * rates["input"] + (est_output_tokens / 1000.0) * rates["output"]
    est_cost_usd = raw_usd * 5.0
    est_cost_tokens = max(1, calculate_task_token_cost(raw_usd) * 5)
    return est_input_tokens, est_output_tokens, est_cost_tokens, round(est_cost_usd, 6)


async def _execute_finalize(
    item: UniversalDumpItem,
    action: str,
    current_user: User,
    db: Session,
) -> dict[str, Any]:
    """Core finalization logic shared between single-item finalize and batch finalize.
    Ensures identical cost calculation, idempotency, study material generation, and assignment association."""
    if action not in FINALIZE_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"action must be one of: {', '.join(FINALIZE_ACTIONS)}",
        )

    # Token gate (owner A3/A14 rule): cost determined by task CONTENT (1 token = 1 cent), never flat task-type.
    source_text = (item.extracted_text or "").strip()
    est_input_tokens, est_output_tokens, est_cost_tokens, _ = _calculate_dump_item_cost(item)

    # is_unmetered() is the single authority on who is exempt, and it is operator-only.
    # An Elite subscription has a monthly allowance, not unlimited free dump work.
    if not is_unmetered(current_user):
        token_bal = float((current_user.settings or {}).get("token_balance", 0) or 0)
        if token_bal < est_cost_tokens:
            return {
                "status": "insufficient_tokens",
                "item_id": item.id,
                "detail": f"⚠️ Insufficient tokens (Estimated cost: {est_cost_tokens} tokens based on content length, balance: {int(token_bal)} tokens). "
                          "Ask the operator to grant you tokens (or upgrade) to generate assignment work.",
            }

    # 1. Ensure the item has an assignment (create one from the dump if not routed).
    assignment = None
    if item.matched_assignment_id:
        assignment = db.query(Assignment).filter(Assignment.id == item.matched_assignment_id).first()
    if assignment is None:
        title = item.file_name or "Dumped assignment"
        assignment = Assignment(
            user_id=item.user_id,
            title=title,
            prompt=item.extracted_text or f"Generated from dumped file {title}",
            # 09-01 lifecycle: new assignments await the user's direction.
            status="pending_approval",
            progress={"created_from_dump": True, "dump_file_id": item.id, "requested_action": action},
        )
        db.add(assignment)
        db.flush()
        # Subject detection (08-27): the bubble gets a real academic topic +
        # readable title, not a bare filename / 'General Academic'.
        meta = await classify_assignment_meta(item.extracted_text or "", item.file_name or "")
        assignment.title = meta["title"]
        assignment.progress = {
            "subject": meta["subject"],
            "course_code": meta["course_code"],
            "created_from_dump": True, "dump_file_id": item.id, "requested_action": action,
        }
        item.matched_assignment_id = assignment.id
        item.auto_match_confidence = 1.0

    material_id = None
    generated = False
    note_parts = [
        f"Finalized as '{action}'.",
        f"Attached to assignment '{assignment.title}'.",
    ]

    # 2. Generate real content for study kinds via OpenRouter.
    if action in GENERATING_ACTIONS:
        from .llm import call_llm, extract_json

        source_text = (item.extracted_text or "").strip()
        kind = GENERATING_ACTIONS[action]
        sys_prompt = FINALIZE_PROMPTS[action]

        FINALIZE_CHUNK_CHARS = 8000
        FINALIZE_MAX_CHUNKS = 12
        chunks = _split_generation_chunks(source_text, FINALIZE_CHUNK_CHARS)
        if not chunks:
            chunks = ["No read text — see the original file."]
        chunk_limited = len(chunks) > FINALIZE_MAX_CHUNKS
        if chunk_limited:
            chunks = chunks[:FINALIZE_MAX_CHUNKS]

        content: str | None = None
        pieces: list[str] = []
        errors = 0
        for idx, chunk in enumerate(chunks):
            try:
                raw = await call_llm(
                    user_prompt=chunk,
                    system_prompt=sys_prompt,
                    effort="medium",
                    effort_score=25,
                )
                raw = (raw or "").strip()
                if raw:
                    pieces.append(raw)
                else:
                    errors += 1
                    note_parts.append(f"Part {idx + 1} returned an empty response.")
            except Exception as e:  # noqa: BLE001 — finalize must still succeed
                errors += 1
                note_parts.append(f"Part {idx + 1} generation failed ({type(e).__name__}).")

        if pieces:
            if kind in ("flashcards", "practice_test"):
                combined: list[dict] = []
                seen: set[str] = set()
                for piece in pieces:
                    parsed = extract_json(piece)
                    if kind == "flashcards":
                        if isinstance(parsed, dict) and isinstance(parsed.get("flashcards"), list):
                            parsed = parsed["flashcards"]
                    if isinstance(parsed, list) and all(isinstance(c, dict) for c in parsed):
                        for c in parsed:
                            q = str(c.get("q") if c.get("q") is not None else c.get("front") or "").strip()
                            if kind == "practice_test":
                                a = str(
                                    c.get("answer") if c.get("answer") is not None
                                    else c.get("a") if c.get("a") is not None
                                    else c.get("back") or ""
                                ).strip()
                                key = q[:80].lower()
                                if q and a and key not in seen:
                                    seen.add(key)
                                    combined.append({
                                        "q": q,
                                        "options": c.get("options") or [],
                                        "answer": a,
                                        "explain": c.get("explain") or "",
                                    })
                            else:
                                a = str(c.get("a") if c.get("a") is not None else c.get("back") or "").strip()
                                key = q[:80].lower()
                                if q and a and key not in seen:
                                    seen.add(key)
                                    combined.append({"q": q, "a": a})
                    else:
                        note_parts.append("Generation returned unexpected JSON shape — no material saved.")
                if combined:
                    content = json.dumps(combined, ensure_ascii=False)
            else:
                if len(pieces) == 1:
                    content = pieces[0]
                else:
                    content = "\n\n".join(
                        f"———— Part {i}/{len(pieces)} ————\n{piece}"
                        for i, piece in enumerate(pieces, 1)
                    )
            generated = bool(content)

        if chunk_limited:
            covered = FINALIZE_CHUNK_CHARS * FINALIZE_MAX_CHUNKS
            note_parts.append(
                f"Source was {len(source_text):,} chars — generation covered the first "
                f"{covered:,} (12 parts); the full source remains in the dumped file."
            )
        if errors and pieces:
            note_parts.append(f"{errors} generation part(s) returned nothing.")

        if generated and content:
            material = StudyMaterial(
                user_id=item.user_id,
                assignment_id=assignment.id,
                kind=kind,
                content=content,
                model_used="openrouter",
            )
            db.add(material)
            db.flush()
            material_id = material.id
            assignment.progress = {**(assignment.progress or {}), kind: True}
            if kind == "solution":
                assignment.progress["do_it_work"] = content
                if assignment.status in ("tracked", "not_started"):
                    assignment.status = "in_progress"
                try:
                    from .overlord_agent import overlord_agent
                    overlord_agent.add_chat_message(
                        assignment.id,
                        sender="overlord",
                        text=f"✅ Assignment \"{assignment.title}\" — done (from your dumped assignment):\n\n{content[:12000]}",
                        user_id=current_user.id,
                    )
                except Exception:  # noqa: BLE001 — chat is best-effort
                    pass
            elif all(assignment.progress.get(k) for k in ALL_MATERIAL_KINDS):
                assignment.status = "materials_ready"
            note_parts.append(f"Generated {kind} material (id {material_id}).")
        elif not source_text:
            note_parts.append("No read text — see the original file.")
        else:
            note_parts.append("No content could be generated from this file.")
    else:
        assignment.progress = {**(assignment.progress or {}), "requested_action": action}
        if assignment.status not in ("tracked", "in_progress"):
            assignment.status = "tracked"
        note_parts.append(f"Recorded finalize request '{action}'.")

    # 3. AI detection scoring
    try:
        from . import detectors

        if generated and content:
            avg, results, passed = await detectors.score_text(content, threshold=80.0)
            assignment.progress = {
                **(assignment.progress or {}),
                "detector_risk": round(max(0.0, min(1.0, avg / 100.0)), 4),
                "ai_score": round(avg, 2),
                "detector_passed": bool(passed),
                "detector_scored_chars": len(content or ""),
                "detector_details": [
                    {"detector": r.name, "score": round(r.score, 2)} for r in results
                ][:12],
                "detector_at": utcnow().isoformat(),
            }
        else:
            src = (item.extracted_text or "").strip()
            if src:
                risk = await detectors.check_ai_detection_cached(src)
                assignment.progress = {
                    **(assignment.progress or {}),
                    "detector_risk": risk,
                    "detector_at": utcnow().isoformat(),
                }
    except Exception as e:  # noqa: BLE001 — best-effort, never blocks finalize
        note_parts.append(f"AI detection skipped ({type(e).__name__}).")

    # 4. Persist finalization state.
    item.requested_action = action
    item.status = "finalized"
    item.overlord_notes = " ".join(note_parts)
    db.commit()
    db.refresh(item)
    db.refresh(assignment)

    response_status = "success" if generated or action == "do_it" else "finalized_no_content"

    # Charge tokens strictly based on actual content consumed and produced (owner A3/A14 rule: 1 token = 1/100 cent)
    from .cost_tracking import _rates_for
    from .credits import calculate_task_token_cost

    actual_input_tokens = max(1, int(len(source_text) / 4))
    actual_output_tokens = max(1, int(len(content or "") / 4)) if content else est_output_tokens
    rates = _rates_for("deepseek/deepseek-v4.1-flash")
    actual_cost_usd = (actual_input_tokens / 1000.0) * rates["input"] + (actual_output_tokens / 1000.0) * rates["output"]
    actual_token_cost = max(1, calculate_task_token_cost(actual_cost_usd))
    reported_cost_usd = task_tokens_to_usd(actual_token_cost)

    if not is_unmetered(current_user):
        new_bal = debit_tokens_atomic(db, current_user.id, actual_token_cost, allow_negative=True)
        if hasattr(current_user, "settings"):
            s = dict(getattr(current_user, "settings", None) or {})
            s["token_balance"] = new_bal
            current_user.settings = s

    assignment.progress = {
        **(assignment.progress or {}),
        "tokens_charged": actual_token_cost,
        "cost_usd": reported_cost_usd,
        "input_tokens": actual_input_tokens,
        "output_tokens": actual_output_tokens,
    }
    db.commit()

    return {
        "status": response_status,
        "item_id": item.id,
        "assignment_id": assignment.id,
        "material_id": material_id,
        "generated": generated,
        "tokens_charged": actual_token_cost,
        "cost_usd": reported_cost_usd,
        "work": (content[:400_000] if generated and content else None),
    }


@router.get("/batch/estimate")
async def batch_estimate_dump_items(
    ids: Optional[str] = Query(None, description="Comma-separated dump item IDs (empty = all pending)"),
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Calculates real batch finalization estimates for pending dump items.
    Reuses the exact same per-item token math as finalize to ensure ~$X.XX preview is completely honest."""
    query = db.query(UniversalDumpItem)
    if not is_admin_user(current_user):
        query = query.filter(UniversalDumpItem.user_id == current_user.id)
    if ids:
        id_list = [int(i.strip()) for i in ids.split(",") if i.strip().isdigit()]
        query = query.filter(UniversalDumpItem.id.in_(id_list))
    else:
        query = query.filter(UniversalDumpItem.status.in_(["pending", "routed", "unrouted", "uploaded"]))

    items = query.all()
    item_summaries = []
    total_tokens = 0
    total_cost = 0.0

    for item in items:
        _, _, tokens, cost = _calculate_dump_item_cost(item)
        total_tokens += tokens
        total_cost += cost
        item_summaries.append({
            "id": item.id,
            "file_name": item.file_name or f"Dump #{item.id}",
            "action": item.requested_action or "flashcards",
            "matched_assignment_id": item.matched_assignment_id,
            "status": item.status,
            "est_tokens": tokens,
            "est_cost": round(cost, 6),
        })

    return {
        "status": "success",
        "count": len(item_summaries),
        "total_cost": round(total_cost, 6),
        "total_tokens": total_tokens,
        "items": item_summaries,
    }


@router.post("/batch/finalize")
async def batch_finalize_dump_items(
    payload: BatchFinalizePayload,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Batch finalizes multiple dump items with individual per-item processing and skip list support.
    Charges tokens per item using the honest content-based rate."""
    skip_set = set(payload.skip or [])
    query = db.query(UniversalDumpItem)
    if not is_admin_user(current_user):
        query = query.filter(UniversalDumpItem.user_id == current_user.id)
    if payload.ids:
        query = query.filter(UniversalDumpItem.id.in_(payload.ids))
    else:
        query = query.filter(UniversalDumpItem.status.in_(["pending", "routed", "unrouted", "uploaded"]))

    items = [it for it in query.all() if it.id not in skip_set and it.status != "finalized"]

    results = []
    total_charged_tokens = 0
    succeeded = 0
    failed = 0

    for item in items:
        item_action = payload.action or item.requested_action or "flashcards"
        if item_action not in FINALIZE_ACTIONS:
            item_action = "flashcards"
        try:
            res = await _execute_finalize(item, item_action, current_user, db)
            if res.get("status") in ("success", "finalized_no_content"):
                succeeded += 1
                total_charged_tokens += res.get("tokens_charged", 0)
            else:
                failed += 1
            results.append(res)
        except HTTPException as he:
            failed += 1
            results.append({
                "status": "error",
                "item_id": item.id,
                "error": he.detail,
            })
        except Exception as e:
            failed += 1
            results.append({
                "status": "error",
                "item_id": item.id,
                "error": str(e),
            })

    return {
        "status": "success",
        "processed": len(results),
        "succeeded": succeeded,
        "failed": failed,
        "total_charged_tokens": total_charged_tokens,
        "total_charged_usd": task_tokens_to_usd(total_charged_tokens),
        "results": results,
    }


@router.post("/{dump_id}/finalize")
async def finalize_dump_item(
    dump_id: int,
    payload: FinalizePayload,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Assignment Dump finalize: ask the user what kind of assignment work they
    want (flashcards / practice quiz / study guide / summary / just do it),
    then materialize it: create the assignment if not yet routed, generate real
    study-materials content via OpenRouter for the study kinds, and leave
    do_it for the subagent pipeline to execute (no fake completion).

    Auth + ownership enforced (BATCH-04 IDOR pattern).
    """
    item = db.query(UniversalDumpItem).filter(UniversalDumpItem.id == dump_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Dump item not found.")
    if item.user_id != current_user.id and not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Cannot finalize dump items owned by another user")

    action = (payload.action or "").strip()
    return await _execute_finalize(item, action, current_user, db)


@router.delete("/{dump_id}")
async def delete_dump_item(
    dump_id: int,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Deletes a dump item (auth + ownership enforced — remediation BATCH-04 IDOR)."""
    item = db.query(UniversalDumpItem).filter(UniversalDumpItem.id == dump_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Dump item not found.")
    if item.user_id != current_user.id and not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Cannot delete dump items owned by another user")
    # Operator 08-26: deleting a dumped item must also remove the assignment
    # it created — otherwise the "in progress" bubble lingers forever. Only
    # cascade assignments the dump itself created (progress.created_from_dump).
    cascaded = None
    if item.matched_assignment_id:
        assignment = db.query(Assignment).filter(Assignment.id == item.matched_assignment_id).first()
        if assignment and (assignment.progress or {}).get("created_from_dump"):
            # 08-28: SQLite runs PRAGMA foreign_keys=ON, so the assignment
            # cannot be deleted while any row still references it. The item
            # being removed goes first (it is queued for delete), but sibling
            # dump items routed/finalized onto the same bubble would raise
            # "FOREIGN KEY constraint failed" on the assignment delete and
            # turn the whole request into a 500 — detach them (and any
            # transcripts/drafts) before cascading.
            db.query(UniversalDumpItem).filter(
                UniversalDumpItem.matched_assignment_id == assignment.id,
                UniversalDumpItem.id != item.id,
            ).update({UniversalDumpItem.matched_assignment_id: None}, synchronize_session=False)
            db.query(StudyMaterial).filter(StudyMaterial.assignment_id == assignment.id).delete(synchronize_session=False)
            db.query(Transcript).filter(Transcript.assignment_id == assignment.id).delete(synchronize_session=False)
            db.query(Draft).filter(Draft.assignment_id == assignment.id).delete(synchronize_session=False)
            cascaded = assignment.title
            db.delete(assignment)
    db.delete(item)
    db.commit()
    return {
        "status": "success",
        "message": f"Dump item {dump_id} deleted." + (f" (linked assignment '{cascaded}' removed too)" if cascaded else ""),
    }


# ── Remediation BATCH-04: IDOR-guarded single-item dump access ──────────────
@router.get("/{dump_id}")
def get_assignment_dump(
    dump_id: int,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Returns one dump item with a strict IDOR ownership check."""
    dump = db.query(UniversalDumpItem).filter(UniversalDumpItem.id == dump_id).first()
    if not dump:
        raise HTTPException(status_code=404, detail="Dump record not found")
    if dump.user_id != current_user.id and not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Cannot access dump items owned by another user")
    return {
        "id": dump.id,
        "file_name": dump.file_name,
        "file_type": dump.file_type,
        "file_size_bytes": dump.file_size_bytes,
        "status": dump.status,
        "extracted_text": dump.extracted_text,
        "matched_assignment_id": dump.matched_assignment_id,
        "auto_match_confidence": dump.auto_match_confidence,
        "overlord_notes": dump.overlord_notes,
        "requested_action": dump.requested_action,
        "created_at": dump.created_at.isoformat() if dump.created_at else None,
    }
