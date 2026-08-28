"""FastAPI routes for Universal Assignment Dump and Overlord AI Routing."""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .assignment_dump import assignment_dump_manager
from .database import Assignment, StudyMaterial, UniversalDumpItem, User, get_db
from .routes_features import get_current_authenticated_user
from .security import is_admin_user

router = APIRouter(prefix="/api/dump", tags=["assignment_dump"])

# Finalize actions the subagent pipeline consumrs (Assignment Dump → study kinds).
FINALIZE_ACTIONS = ("flashcards", "practice_quiz", "study_guide", "summary", "do_it")

_TOPIC_HINTS = {
    "History": ("history", "reconstruction", "civil war", "president", "ancient", "revolution", "empire"),
    "Mathematics": ("calculus", "algebra", "statistics", "equation", "theorem", "geometry", "probability"),
    "Biology": ("cell", "dna", "genetics", "organism", "biology", "evolution", "crispr"),
    "Computer Science": ("algorithm", "code", "programming", "data structure", "python", "machine learning", "neural", "liquidity protocol"),
    "Literature": ("novel", "literature", "poem", "woolf", "faulkner", "narrative", "modernist"),
    "Economics": ("economic", "inflation", "gdp", "macroeconomic", "microeconomic", "monetary"),
    "Ethics": ("ethics", "ethical", "moral", "autonomous systems"),
    "Psychology": ("cognitive", "behavior", "psychology", "bias", "decision"),
}


async def _classify_assignment_meta(source_text: str, file_name: str) -> dict:
    """Subject/title detection for dump-created assignment bubbles (08-27).
    LLM first (lanes-backed), keyword heuristic as fallback — a bubble is
    never a bare 'General Academic' when the text says what it is."""
    lines = [l.strip() for l in (source_text or "").splitlines() if l.strip()]
    fallback = {
        "title": (lines[0][:80] if lines else (file_name or "Dumped assignment")),
        "subject": "General Academic",
        "course_code": "GEN-101",
    }
    try:
        from .llm import call_llm, extract_json
        raw = await call_llm(
            user_prompt=(source_text or "The user pasted an assignment.")[:5000],
            system_prompt=(
                "Classify this academic assignment text. Output ONE LINE of JSON only: "
                '{"subject": "<real academic subject, e.g. American History>", '
                '"title": "<short title, max 60 chars>", "course_code": "<e.g. HIST-101 or GEN-101>"}. '
                "The subject must be a concrete academic field, never 'General Academic'."
            ),
            effort_score=25, max_tokens=220, response_format="json_object", model="flash",
        )
        parsed = extract_json(raw or "")
        if isinstance(parsed, dict) and parsed.get("subject"):
            return {
                "title": str(parsed.get("title") or fallback["title"])[:80],
                "subject": str(parsed["subject"])[:48],
                "course_code": str(parsed.get("course_code") or "GEN-101")[:12],
            }
    except Exception:
        pass
    lower = (source_text or "").lower()
    for subj, keys in _TOPIC_HINTS.items():
        if any(k in lower for k in keys):
            fallback["subject"] = subj
            fallback["course_code"] = subj.split()[0][:4].upper() + "-101"
            break
    return fallback
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

# Per-kind generation system prompts (Assignment Dump finalize).
FINALIZE_PROMPTS = {
    "flashcards": (
        "Return ONLY a JSON array of 12-20 objects {\"front\": term, \"back\": definition} "
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


@router.post("/upload")
async def upload_dump_file(
    file: UploadFile = File(...),
    assignment_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Universal upload endpoint for any file (PDF, DOCX, TXT, Audio, Video, Image).

    Extracts content via Gemini 3.1 Flash-Lite (Audio) / Gemini 3.7 Flash (Vision/OCR),
    and uses the Overlord AI to automatically route to the correct assignment.
    """
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    dump_item = await assignment_dump_manager.process_dump_upload(
        db=db,
        user=current_user,
        filename=file.filename or "uploaded_file.bin",
        content=content,
        manual_assignment_id=assignment_id,
    )

    return {
        "status": "success",
        "dump_id": dump_item.id,
        "file_name": dump_item.file_name,
        "file_type": dump_item.file_type,
        "item_status": dump_item.status,
        "auto_match_confidence": dump_item.auto_match_confidence,
        "matched_assignment_id": dump_item.matched_assignment_id,
        "overlord_notes": dump_item.overlord_notes,
        "snippet": (dump_item.extracted_text or "")[:250],
    }


@router.get("/list")
async def list_dump_items(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Retrieves all universal dumped items for user with Overlord assignment match details."""
    query = db.query(UniversalDumpItem).filter(UniversalDumpItem.user_id == current_user.id)
    if status:
        query = query.filter(UniversalDumpItem.status == status)

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

    if payload.create_new:
        title = payload.new_assignment_title or f"Assignment from {item.file_name}"
        new_assign = Assignment(
            user_id=item.user_id,
            title=title,
            prompt=item.extracted_text or f"Generated from dumped file {item.file_name}",
            status="tracked",
            progress={"created_from_dump": True, "dump_file_id": item.id},
        )
        db.add(new_assign)
        db.commit()
        db.refresh(new_assign)

        item.matched_assignment_id = new_assign.id
        item.auto_match_confidence = 1.0
        item.status = "manual_routed"
        item.overlord_notes = f"Manually created and routed to new assignment '{new_assign.title}'."
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
    else:
        raise HTTPException(status_code=400, detail="Must provide assignment_id or create_new=True")

    db.commit()
    db.refresh(item)
    return {"status": "success", "item_id": item.id, "matched_assignment_id": item.matched_assignment_id}


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
    action = (payload.action or "").strip()
    if action not in FINALIZE_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"action must be one of: {', '.join(FINALIZE_ACTIONS)}",
        )

    item = db.query(UniversalDumpItem).filter(UniversalDumpItem.id == dump_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Dump item not found.")
    if item.user_id != current_user.id and not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Cannot finalize dump items owned by another user")

    # Token gate (operator 08-26): generation costs tokens; nothing runs on zero.
    if not is_admin_user(current_user) and current_user.plan != "elite":
        token_bal = float((current_user.settings or {}).get("token_balance", 0) or 0)
        if token_bal < 5:
            return {
                "status": "insufficient_tokens",
                "detail": "⚠️ Insufficient tokens — the operator hasn't granted you any tokens yet. "
                          "Ask them to grant you tokens (or upgrade) to generate assignment work.",
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
            status="tracked",
            progress={"created_from_dump": True, "dump_file_id": item.id, "requested_action": action},
        )
        db.add(assignment)
        db.flush()
        # Subject detection (08-27): the bubble gets a real academic topic +
        # readable title, not a bare filename / 'General Academic'.
        meta = await _classify_assignment_meta(item.extracted_text or "", item.file_name or "")
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
        user_prompt = source_text[:8000] if source_text else "No read text — see the original file."
        kind = GENERATING_ACTIONS[action]
        sys_prompt = FINALIZE_PROMPTS[action]
        content: str | None = None
        try:
            raw = await call_llm(
                user_prompt=user_prompt,
                system_prompt=sys_prompt,
                effort="medium",
                effort_score=25,  # good-token bucket: cheap summary-grade generation
            )
            raw = (raw or "").strip()
            if raw:
                if kind in ("flashcards", "practice_test"):
                    parsed = extract_json(raw)
                    if isinstance(parsed, list) and all(isinstance(c, dict) for c in parsed):
                        # Store plain JSON (strip any ```json fence) so consumers
                        # can json.loads the content directly.
                        content = json.dumps(parsed, ensure_ascii=False)
                    else:
                        note_parts.append("Generation returned unexpected JSON shape — no material saved.")
                else:
                    content = raw
                generated = bool(content)
        except Exception as e:  # noqa: BLE001 — finalize must still succeed
            note_parts.append(f"Generation failed ({type(e).__name__}).")

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
                # do_it: this is the actual completed work. Mark the assignment
                # in progress and push the answer into its bubble chat so it is
                # visible (no fake handoff — it IS done).
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
        # Defensive only: every FINALIZE_ACTIONS value is now generating.
        assignment.progress = {**(assignment.progress or {}), "requested_action": action}
        if assignment.status not in ("tracked", "in_progress"):
            assignment.status = "tracked"
        note_parts.append(f"Recorded finalize request '{action}'.")

    # 3. Persist finalization state.
    item.requested_action = action
    item.status = "finalized"
    item.overlord_notes = " ".join(note_parts)
    db.commit()
    db.refresh(item)
    db.refresh(assignment)

    response_status = "success" if generated or action == "do_it" else "finalized_no_content"

    # Charge tokens for the generation work (operator 08-26: tokens = usage).
    if not is_admin_user(current_user) and current_user.plan != "elite":
        settings = dict(current_user.settings or {})
        bal = float(settings.get("token_balance", 0) or 0)
        settings["token_balance"] = max(0.0, bal - 5)
        current_user.settings = settings
        db.commit()

    return {
        "status": response_status,
        "item_id": item.id,
        "assignment_id": assignment.id,
        "material_id": material_id,
        "generated": generated,
        # Only present when generated: the actual content (solution/study
        # material) so the client can show the work without a second fetch.
        "work": (content[:40000] if generated and content else None),
    }


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
            db.query(StudyMaterial).filter(StudyMaterial.assignment_id == assignment.id).delete()
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
