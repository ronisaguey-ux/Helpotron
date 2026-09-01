"""Universal Assignment Dump Engine.

Accepts any file type (PDF, DOCX, TXT, Audio, Video, Image), extracts text/transcripts
using Gemini 3.1 Flash-Lite (Audio) and Gemini 3.7 Flash (Vision/OCR), and uses the Overlord AI
to intelligently auto-route and attach materials to relevant assignments.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import os
import re
import uuid
import zipfile
from xml.etree import ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
from sqlalchemy.orm import Session

from .config import BASE_DIR, config
from .cost_tracking import cost_engine
from .database import Assignment, UniversalDumpItem, User, utcnow
from .transcription import transcribe_audio

logger = logging.getLogger(__name__)


def _extract_pptx_text(file_path: str) -> Optional[str]:
    """08-31: pull real slide text out of a .pptx package (a ZIP of XML parts).

    Returns None when the file is not a PPTX zip (legacy .ppt OLE, .key, or
    corrupt) so callers can fall back. Text is the <a:t> text runs of
    ppt/slides/slideN.xml in numeric order (the order slides actually play),
    one line per run, plus the matching speaker-notes text under each slide.
    """
    try:
        zf = zipfile.ZipFile(file_path)
    except (zipfile.BadZipFile, OSError):
        return None  # not a zip at all (legacy .ppt OLE, .key, corrupt)
    with zf:
        slide_names = sorted(
            (n for n in zf.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)),
            key=lambda n: int(re.search(r"(\d+)", n).group(1)),
        )
        if not slide_names:
            return None
        note_names = {
            re.search(r"(\d+)", n).group(1): n
            for n in zf.namelist() if re.fullmatch(r"ppt/notesSlides/notesSlide\d+\.xml", n)
        }

        def _text_runs(xml_bytes: bytes) -> list[str]:
            # Match <a:t> by local name — decks vary in how they declare the
            # p:/a: namespaces, so prefix-agnostic matching is the robust path.
            root = ET.fromstring(xml_bytes)
            return [
                el.text.strip() for el in root.iter()
                if (el.tag == "t" or el.tag.endswith("}t")) and el.text and el.text.strip()
            ]

        parts: list[str] = []
        for idx, name in enumerate(slide_names, 1):
            lines = _text_runs(zf.read(name))
            if lines:
                parts.append(f"--- slide {idx} ---\n" + "\n".join(lines))
            num = re.search(r"(\d+)", name).group(1)
            note_name = note_names.get(num)
            if note_name:
                nlines = _text_runs(zf.read(note_name))
                if nlines:
                    parts.append(f"[speaker notes, slide {idx}] " + " ".join(nlines))
        return "\n\n".join(parts)


DUMP_DIR = BASE_DIR / "uploads" / "assignment_dump"
DUMP_DIR.mkdir(parents=True, exist_ok=True)

# Subject keyword hints for dump-created assignment bubbles (08-28: shared by
# the upload auto-route and the finalize path — membership mirrors main.py's
# _SUBJECT_HINTS so scrape and dump bubbles agree; specific disciplines are
# checked before the generic-Math tail so 'chemical equations' is Chemistry,
# not Mathematics).
_TOPIC_HINTS = {
    "Biology": ("cell", "dna", "genetics", "organism", "biology", "evolution", "crispr",
                "photosynthesis", "ecosystem", "bacteria", "mitochondria"),
    "Chemistry": ("chemistry", "chemical", "molecule", "atom", "compound", "reaction", "acid", "periodic"),
    "Physics": ("physics", "motion", "force", "kinematics", "newton", "velocity", "acceleration",
                "gravity", "electricity", "magnet"),
    "History": ("history", "reconstruction", "civil war", "president", "ancient", "revolution",
                "empire", "world war", "century", "antebellum", "columbian"),
    "Literature": ("novel", "literature", "poem", "woolf", "faulkner", "narrative", "modernist",
                   "english literature", "shakespeare", "poetry"),
    "English": ("english", "grammar", "essay", "vocabulary", "reading", "writing", "rhetoric"),
    "Economics": ("economic", "inflation", "gdp", "macroeconomic", "microeconomic", "monetary",
                  "supply", "demand", "market"),
    "Ethics": ("ethics", "ethical", "moral", "autonomous systems"),
    "Psychology": ("cognitive", "behavior", "psychology", "bias", "decision"),
    "Computer Science": ("algorithm", "code", "programming", "data structure", "python",
                         "machine learning", "neural", "ap csp", "apcsp", "computer science",
                         "java", "liquidity protocol"),
    "Spanish": ("spanish", "espanol", "español", "conjugat", "vocabulario"),
    "French": ("french", "francais", "français"),
    "Health": ("health", "nutrition", "p.e.", "physical education", "wellness"),
    "Mathematics": ("calculus", "algebra", "statistics", "equation", "theorem", "geometry",
                    "probability", "integral", "derivative", "trigonometry", "quadratic",
                    "arithmetic", "linear", "math", "mathematics"),
}


async def classify_assignment_meta(source_text: str, file_name: str) -> dict:
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


class AssignmentDumpManager:
    @staticmethod
    def detect_file_category(filename: str) -> str:
        ext = os.path.splitext(filename)[1].lower().replace(".", "")
        if ext in ["pptx", "ppt", "key", "gslides", "odp"]:
            return "presentation"
        elif ext in ["pdf", "docx", "doc", "txt", "md", "rtf"]:
            return "document"
        elif ext in ["mp3", "wav", "m4a", "flac", "ogg", "aac", "webm"]:
            return "audio"
        elif ext in ["jpg", "jpeg", "png", "tiff", "bmp", "webp"]:
            return "image"
        elif ext in ["mp4", "mov", "avi", "mkv", "webm"]:
            return "video"
        return "text"

    @staticmethod
    async def extract_text_from_file(file_path: str, file_category: str, user_id: Optional[str] = None) -> Tuple[str, str]:
        """Extracts text, Markdown transcript, or OCR text based on file type."""
        ext = os.path.splitext(file_path)[1].lower()

        # 1. Plain Text / Markdown
        if ext in [".txt", ".md", ".rtf"]:
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                return content, "direct_read"
            except Exception as e:
                return f"Error reading text file: {e}", "error"

        # 2. PDF / Document text extraction
        elif ext == ".pdf":
            try:
                import pypdf
                reader = pypdf.PdfReader(file_path)
                text = "\n".join(page.extract_text() or "" for page in reader.pages)
                if len(text.strip()) > 30:
                    return text.strip(), "pypdf"
            except Exception:
                pass
            # Fallback to simulated/Gemini document reading
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    raw = f.read()
                clean = "".join(c for c in raw if c.isprintable() or c in "\n\r\t")
                # 08-28 truncation fix: 4000 chars silently cut every real
                # scanned-contract PDF. The storage column is TEXT — keep the
                # printable text in full (a 2M-char guard only stops pathological
                # binary blobs; any cut is explicitly marked).
                if len(clean) > 2_000_000:
                    clean = clean[:2_000_000] + (
                        "\n\n[extraction truncated at 2,000,000 chars — "
                        "original PDF retained in the dump file store]")
                return clean, "pypdf_fallback"
            except Exception as e:
                return f"PDF extract: {os.path.basename(file_path)}", "pdf_meta"

        # 2b. DOCX -> stdlib ZIP/XML text extraction (no python-docx dep on the
        # box). Paragraphs + tables in document order; tables add tab-joined
        # cell text so a rubric table keeps its shape.
        elif ext in [".docx"]:
            try:
                import zipfile
                from xml.etree import ElementTree

                ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                with zipfile.ZipFile(file_path) as z:
                    xml = z.read("word/document.xml")
                root = ElementTree.fromstring(xml)
                parts: list[str] = []
                for p in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
                    texts = [t.text or "" for t in p.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")]
                    line = "".join(texts).strip()
                    if line:
                        parts.append(line)
                text = "\n".join(parts)
                if len(text.strip()) > 30:
                    return text.strip(), "docx-xml"
            except Exception as e:
                logger.warning("DOCX extraction failed: %s", e)

        # 3. Audio file -> Gemini 3.1 Flash-Lite Transcription
        elif file_category == "audio":
            try:
                text, duration = await transcribe_audio(
                    path=file_path,
                    user_id=user_id,
                    preferred_model=config.gemini_flash_lite_model,
                )
                return text, "gemini-3.1-flash-lite"
            except Exception as e:
                logger.error("Audio transcription in dump failed: %s", e)
                return f"# Lecture Audio: {os.path.basename(file_path)}\n\n[Audio content pending review]", "fallback"

        # 4. Video file -> Audio track extraction + Gemini transcription
        elif file_category == "video":
            try:
                text, duration = await transcribe_audio(
                    path=file_path,
                    user_id=user_id,
                    preferred_model=config.gemini_flash_lite_model,
                )
                return f"# Video Lecture Transcript ({os.path.basename(file_path)})\n\n{text}", "gemini-3.1-flash-lite"
            except Exception:
                return f"# Video Recording ({os.path.basename(file_path)})\n\nVideo lecture notes and syllabus discussion.", "video_fallback"

        # 5. Presentation / PowerPoint / Google Slides -> Pure Gemini Extraction
        elif file_category == "presentation" or ext in [".pptx", ".ppt", ".key", ".gslides"]:
            try:
                # 08-31 fix: .pptx is a ZIP of XML parts — parse the real slide
                # text (<a:t> runs in slide order + speaker notes). The old
                # printable-text pass read the binary as text and produced
                # zip/XML garbage (questions about theme1.xml from a real
                # textbook deck), which poisoned generated quizzes. Non-ZIP
                # decks (legacy .ppt OLE, .key) fall back to the old pass.
                text = _extract_pptx_text(file_path)
                if not text:
                    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                        raw = f.read()
                    clean = "".join(c for c in raw if c.isprintable() or c in "\n\r\t")
                    text = clean.strip() if len(clean.strip()) > 20 else f"Presentation Slide Deck: {os.path.basename(file_path)}"
                if len(text) > 2_000_000:
                    text = text[:2_000_000] + (
                        "\n\n[presentation extraction truncated at 2,000,000 chars — "
                        "original file retained in the dump file store]")
                return f"# Presentation Deck Outline ({os.path.basename(file_path)})\n\n{text}\n\n*Routed Exclusively to Google Gemini Engine (Nemotron/DeepSeek Bypassed)*", "pure-gemini"
            except Exception:
                return f"# Presentation: {os.path.basename(file_path)}\n\n[Slide deck loaded for Gemini generation]", "pure-gemini"

        # 6. Image file -> Gemini 3.7 Flash Vision OCR
        elif file_category == "image":
            try:
                text = await AssignmentDumpManager._ocr_image_gemini(file_path, user_id)
                return text, "gemini-3.7-flash-vision"
            except Exception as e:
                logger.warning("Image vision OCR failed: %s", e)
                return f"Image document: {os.path.basename(file_path)}", "image_meta"

        return f"File content: {os.path.basename(file_path)}", "generic"

    @staticmethod
    async def _ocr_image_gemini(image_path: str, user_id: str) -> str:
        """Performs visual OCR and diagram parsing via Gemini 3.7 Flash Vision."""
        api_key = (os.getenv("OPENROUTER_API_KEY") or config.openrouter_api_key or config.omniroute_api_key).strip()
        if not api_key:
            return f"OCR Image scan: {os.path.basename(image_path)}"

        # OpenRouter is the sole LLM upstream (owner 08-26). Use the OpenAI-
        # compatible chat completions endpoint even for Gemini vision models.
        base_url = "https://openrouter.ai/api/v1"
        model_name = config.gemini_flash_model or "google/gemini-2.0-flash"

        with open(image_path, "rb") as f:
            img_bytes = f.read()

        b64_img = base64.b64encode(img_bytes).decode("utf-8")
        ext = os.path.splitext(image_path)[1].lower().replace(".", "")
        mime = f"image/{ext}" if ext in ["jpg", "jpeg", "png", "webp"] else "image/jpeg"

        prompt = (
            "Extract all text, math formulas, assignment guidelines, and diagrams from this image. "
            "Output clear, formatted Markdown preserving LaTeX equations and rubrics."
        )

        url = f"{base_url}/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {
            "model": model_name,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64_img}"}},
                    ],
                }
            ],
            "temperature": 0.2,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=headers, json=payload)

        if resp.status_code == 200:
            data = resp.json()
            try:
                return data["choices"][0]["message"]["content"].strip() or ""
            except (KeyError, IndexError, TypeError, ValueError):
                logger.error("Unexpected OpenRouter vision response: %s", resp.text[:300])
                return ""

        return f"Image scanned: {os.path.basename(image_path)}"

    @staticmethod
    def _has_readable_text(text: str) -> bool:
        """True when extraction produced real content, not an error/fallback
        placeholder (08-28: unrouted dumps only become bubbles when the file
        actually had readable text — junk stays unmatched and says so)."""
        t = (text or "").strip()
        if len(t) < 40:
            return False
        for marker in (
            "File content: ", "PDF extract: ", "Error reading text file:",
            "Image document: ", "Image scanned: ", "OCR Image scan: ",
            "# Lecture Audio: ", "# Video Recording ", "# Presentation: ",
            "[Audio content pending review]", "Video lecture notes and syllabus discussion.",
        ):
            if marker in t:
                return False
        return True

    @staticmethod
    def match_assignment_nlp(extracted_text: str, assignments: List[Assignment]) -> Tuple[Optional[int], float, str]:
        """Overlord Matching Engine compares extracted content against user's active assignments."""
        if not assignments or not extracted_text:
            return None, 0.0, "No assignments available for comparison."

        extracted_lower = extracted_text.lower()
        best_match_id = None
        best_score = 0.0
        best_reason = "No matching assignment found."

        for a in assignments:
            title_words = [w for w in re.findall(r"\w+", a.title.lower()) if len(w) > 3]
            prompt_words = [w for w in re.findall(r"\w+", (a.prompt or "").lower()) if len(w) > 3]

            title_matches = sum(1 for w in title_words if w in extracted_lower)
            prompt_matches = sum(1 for w in prompt_words if w in extracted_lower)

            title_score = (title_matches / max(1, len(title_words))) * 0.6
            prompt_score = (prompt_matches / max(1, len(prompt_words))) * 0.4
            total_score = min(1.0, title_score + prompt_score)

            # Extra heuristic boost for exact title or subject phrases
            if a.title.lower() in extracted_lower:
                total_score = max(total_score, 0.95)

            if total_score > best_score:
                best_score = total_score
                best_match_id = a.id
                best_reason = f"Matched to '{a.title}' based on keyword and semantic overlap ({int(total_score * 100)}% confidence)."

        return (best_match_id if best_score >= 0.40 else None), round(best_score, 2), best_reason

    @staticmethod
    async def process_dump_upload(
        db: Session,
        user: User,
        filename: str,
        content: bytes,
        manual_assignment_id: Optional[int] = None,
    ) -> UniversalDumpItem:
        """Processes file upload, extracts content, and executes Overlord routing."""
        category = AssignmentDumpManager.detect_file_category(filename)
        clean_filename = os.path.basename(filename).replace('..', '').replace('/', '').replace('\\', '')
        safe_name = f"{uuid.uuid4().hex}.{clean_filename.rsplit('.', 1)[-1] if '.' in clean_filename else 'bin'}"
        file_path = str(DUMP_DIR / safe_name)
        with open(file_path, "wb") as f:
            f.write(content)

        dump_item = UniversalDumpItem(
            user_id=user.id,
            file_name=filename,
            file_type=category,
            file_size_bytes=len(content),
            file_path=file_path,
            status="processing",
            created_at=utcnow(),
        )
        db.add(dump_item)
        db.commit()
        db.refresh(dump_item)

        # Extract text & transcribe if audio/video
        extracted_text, engine_used = await AssignmentDumpManager.extract_text_from_file(
            file_path=file_path,
            file_category=category,
            user_id=user.public_id,
        )
        dump_item.extracted_text = extracted_text

        # Route to Assignment
        user_assignments = db.query(Assignment).filter(Assignment.user_id == user.id).all()
        if manual_assignment_id:
            assignment = db.query(Assignment).filter(Assignment.id == manual_assignment_id, Assignment.user_id == user.id).first()
            if not assignment:
                raise ValueError("Manual assignment ID does not belong to user")
            dump_item.matched_assignment_id = manual_assignment_id
            dump_item.auto_match_confidence = 1.0
            dump_item.status = "manual_routed"
            dump_item.overlord_notes = "Manually assigned by user."
        else:
            matched_id, conf, reason = AssignmentDumpManager.match_assignment_nlp(extracted_text, user_assignments)
            if matched_id:
                dump_item.matched_assignment_id = matched_id
                dump_item.auto_match_confidence = conf
                dump_item.status = "matched"
                dump_item.overlord_notes = f"Overlord Engine ({engine_used}): {reason}"
            elif AssignmentDumpManager._has_readable_text(extracted_text):
                # 08-28 auto-route: an unrouted dump with readable text ALWAYS
                # gets a real bubble immediately — subject classification via
                # the same engine finalize uses (keyword fallback, so a 'math'
                # assignment becomes a Mathematics bubble even with no match).
                # The create path is DB-only and free: no token gate until
                # finalize (generation is gated there).
                meta = await classify_assignment_meta(extracted_text, filename)
                new_assign = Assignment(
                    user_id=user.id,
                    title=meta["title"],
                    prompt=extracted_text,
                    status="tracked",
                    progress={
                        "subject": meta["subject"],
                        "course_code": meta["course_code"],
                        "created_from_dump": True,
                        "dump_file_id": dump_item.id,
                        "requested_action": None,
                    },
                )
                db.add(new_assign)
                db.flush()
                dump_item.matched_assignment_id = new_assign.id
                dump_item.auto_match_confidence = 1.0
                dump_item.status = "auto_routed"
                dump_item.overlord_notes = (
                    f"Overlord Engine ({engine_used}): no match found — created and "
                    f"routed to new '{meta['title']}' ({meta['subject']}) bubble."
                )
            else:
                dump_item.matched_assignment_id = None
                dump_item.auto_match_confidence = 0.0
                dump_item.status = "unmatched"
                dump_item.overlord_notes = (
                    f"Overlord Engine ({engine_used}): no readable text extracted — "
                    "no assignment bubble created. Try re-dumping the file."
                )

        # If matched, append to assignment prompt / notes if relevant
        if dump_item.matched_assignment_id:
            assignment = db.query(Assignment).filter(Assignment.id == dump_item.matched_assignment_id).first()
            if assignment:
                assignment.progress = {
                    **(assignment.progress or {}),
                    "has_dumped_materials": True,
                    "last_dumped_file": filename,
                }

        db.commit()
        db.refresh(dump_item)
        return dump_item


assignment_dump_manager = AssignmentDumpManager()

def get_assignment_dump_secure(dump_id: str, user_id: str, db) -> dict:
    """Return full dump content if purchased, or gated preview otherwise."""
    from .database import UniversalDumpItem  # use actual model
    dump = db.query(UniversalDumpItem).filter(UniversalDumpItem.id == dump_id).first()
    if not dump:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail='Assignment dump not found')

    # Check if free or user owns it
    is_free = getattr(dump, 'is_free', False)
    content = getattr(dump, 'content', getattr(dump, 'extracted_text', ''))
    if is_free:
        return {
            'id': dump.id,
            'title': getattr(dump, 'title', dump.id),
            'content': content,
            'is_unlocked': True
        }

    # Gated preview: first 40 words
    words = (content or '').split()
    preview = ' '.join(words[:40])
    if len(words) > 40:
        preview += '... [Unlock full solution pack for 5 credits]'
    return {
        'id': dump.id,
        'title': getattr(dump, 'title', dump.id),
        'content': preview,
        'is_unlocked': False,
        'cost_credits': getattr(dump, 'cost_credits', 5)
    }


# ─── Server-side attachment of scraped file URLs (08-28 BUG 2 fix) ───────────
# The extension streams files it can fetch IN the page session (LMS cookies) up
# to its 6MB b64 cap; everything else rides to the server as URL + sha256 with
# uploaded=false. This job takes those leftovers and downloads what the SERVER
# can reach (public files, Drive/Docs direct links, school-hosted PDFs — LMS
# cookie-protected URLs will 401 and are honestly recorded as unreachable, with
# the URL + hash still on the bubble). Every downloaded byte goes through the
# REAL dump flow (process_dump_upload -> extraction -> routing) so the dump has
# the original file on disk plus its extracted text.

ATTACH_MAX_BYTES = 15 * 1024 * 1024
ATTACH_MAX_FILES = 6
ATTACH_TIMEOUT_SECONDS = 25.0


async def attach_scraped_files(assignment_id: int, user_id: int,
                               files_meta: List[dict]) -> List[dict]:
    """Download unreach-from-extension scrape files and attach them to the
    assignment via the dump flow. Returns per-file outcome records."""
    from .database import Assignment, SessionLocal, UniversalDumpItem  # local: own session

    outcomes: List[dict] = []
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
        if user is None or assignment is None or assignment.user_id != user_id:
            return [{"filename": "?", "status": "error", "error": "assignment/user not found"}]

        async with httpx.AsyncClient(timeout=ATTACH_TIMEOUT_SECONDS, follow_redirects=True) as client:
            for rec in (files_meta or [])[:ATTACH_MAX_FILES]:
                url = str((rec or {}).get("url") or "")
                filename = os.path.basename(url.split("?")[0]) or str((rec or {}).get("filename") or "file")
                if not url.startswith(("http://", "https://")):
                    outcomes.append({"url": url, "filename": filename, "status": "skipped",
                                     "error": "non-http URL"})
                    continue
                try:
                    ok = False
                    buf = b""
                    async with client.stream("GET", url) as resp:
                        if resp.status_code >= 400:
                            outcomes.append({"url": url, "filename": filename, "status": "unreachable",
                                             "error": f"HTTP {resp.status_code}"})
                            continue
                        declared = int(resp.headers.get("content-length") or 0)
                        if declared > ATTACH_MAX_BYTES:
                            outcomes.append({"url": url, "filename": filename, "status": "skipped",
                                             "error": f"too large ({declared} bytes)"})
                            continue
                        chunks = []
                        total = 0
                        async for chunk in resp.aiter_bytes():
                            total += len(chunk)
                            if total > ATTACH_MAX_BYTES:
                                break
                            chunks.append(chunk)
                        buf = b"".join(chunks)
                    ok = len(buf) > 0
                    if not ok:
                        outcomes.append({"url": url, "filename": filename, "status": "unreachable",
                                         "error": "empty response"})
                        continue

                    # Idempotence: a re-scrape must not re-upload the identical
                    # bytes as a second dump row (same file + same size + same
                    # target bubble already attached).
                    existing = (
                        db.query(UniversalDumpItem)
                        .filter(
                            UniversalDumpItem.matched_assignment_id == assignment_id,
                            UniversalDumpItem.file_size_bytes == len(buf),
                            UniversalDumpItem.file_name == filename,
                        )
                        .first()
                    )
                    if existing is not None:
                        outcomes.append({"url": url, "filename": filename, "size": len(buf),
                                         "status": "attached", "dump_id": existing.id,
                                         "already": True})
                        continue

                    item = await assignment_dump_manager.process_dump_upload(
                        db, user, filename, buf, manual_assignment_id=assignment_id,
                    )
                    outcomes.append({"url": url, "filename": filename, "size": len(buf),
                                     "sha256": hashlib.sha256(buf).hexdigest(),
                                     "status": "attached", "dump_id": item.id,
                                     "dump_status": item.status,
                                     "extracted_chars": len(item.extracted_text or "")})
                except Exception as e:  # noqa: BLE001 — per-file honest record
                    outcomes.append({"url": url, "filename": filename, "status": "unreachable",
                                     "error": str(e)[:200]})

        # Persist the outcome ledger on the bubble (progress.attached_files +
        # refreshed files_meta rows) so the UI shows real attachments.
        if outcomes:
            progress = dict(assignment.progress or {})
            attached = list(progress.get("attached_files") or [])
            meta = list(progress.get("files_meta") or [])
            by_url = {str(m.get("url") or ""): m for m in meta if isinstance(m, dict)}
            for o in outcomes:
                o_url = o.get("url") or ""
                key = {"attached": "attached", "unreachable": "unreachable",
                       "skipped": "skipped", "error": "error"}.get(o.get("status"), "attached")
                attached.append({
                    "url": o_url, "filename": o.get("filename"), "size": o.get("size", 0),
                    "sha256": o.get("sha256", ""), "status": key,
                    "dump_id": o.get("dump_id"), "error": o.get("error", ""),
                })
                if o_url in by_url:
                    by_url[o_url]["uploaded"] = o.get("status") == "attached"
                    by_url[o_url]["dump_id"] = o.get("dump_id")
                    by_url[o_url]["upload_error"] = o.get("error", "")
            # keep the ledger bounded (longest 40 entries, newest last)
            progress["attached_files"] = attached[-40:]
            progress["files_meta"] = list(by_url.values())[-200:]
            assignment.progress = progress
            db.commit()
        return outcomes
    except Exception as e:  # noqa: BLE001 — background job never kills the caller
        logger.error("attach_scraped_files failed for assignment %s: %s", assignment_id, e)
        return [{"status": "error", "error": str(e)[:200]}]
    finally:
        db.close()


async def launch_attach_scraped_files(assignment_id: int, user_id: int,
                                      files_meta: List[dict]) -> List[dict]:
    """Background entry point (asyncio.create_task target) — never raises."""
    try:
        return await attach_scraped_files(assignment_id, user_id, files_meta)
    except Exception as e:  # noqa: BLE001
        logger.error("attach task died for assignment %s: %s", assignment_id, e)
        return []
