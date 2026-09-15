"""agent mode (09-01, 09-02): screen vision + control-block hardening for the
extension agent-mode feature. Two jobs, both scoped to the extension routes:

1. analyze_screen_image() — real multimodal inference on a captured screen
   frame. 09-02 effort-tiering: the model is resolved from the user's
   ai.effortScore (1–1000) through resolve_vision_model() against the tier
   table below, using only ModelPolicy / llm.py-priced vision models sorted
   cheapest -> most expensive. analyze_screen_image keeps the parent-spec
   contract (image_b64, prompt, width, height -> str) and gains an optional
   model_id override; the tier resolution lives in the routes layer.
   llm.chat_complete stringifies message content, so it cannot carry
   image_url content parts — mirror the established image client path the
   assignment OCR pipeline uses (assignment_dump._ocr_image_gemini): a direct
   httpx POST to OpenRouter's chat/completions with OpenAI-compatible content
   parts. No new key handling: same resolution chain llm.call_llm uses.

2. extract_control_actions() — server-side hardening of the fenced
   ```control ``` block the agent may append to its reply: strict fence
   regex, op allowlist validation, coordinate clamping, caps; on ANY invalid
   action the WHOLE list is dropped (never partial-execute) and the reply
   text is kept.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# Default model (= middle tier) and the effort-score semantic (09-02).
VISION_MODEL: str = "deepseek/deepseek-v4.1-flash"
DEFAULT_EFFORT_SCORE: int = 500
_MIN_EFFORT_SCORE: int = 1
_MAX_EFFORT_SCORE: int = 1000

# The three vision models used for screen vision, ordered cheapest -> most
# expensive. Prices are the llm.ModelPolicy.PRICING input/output per 1M. A
# user's effort level is honored consistently by BOTH the text agent and the
# screen-vision lane.
#
# Owner-pinned set (09-08; deepseek id moved to V4.1 Flash 09-10): low ->
# gemini 3.1-flash-lite, med -> deepseek v4.1 flash, high -> gemini 3.8-flash.
# Nothing else: no 3.5-flash, no pro-preview, and v4-pro-vision was dropped
# (see _VISION_FALLBACK).
VISION_MODEL_TIERS: Dict[str, str] = {
    "google/gemini-3.1-flash-lite": "$0.075 / $0.30",       # cheapest — low
    "deepseek/deepseek-v4.1-flash": "$0.15 / $0.60",        # med (default)
    "google/gemini-3.8-flash": "$0.25 / $1.00",             # most expensive — high
}

# 09-10: V4.1 Flash is natively vision on OpenRouter, so the canonical id IS the
# wire id. The old canonical -> "-exp" rewrite is retired. The map is kept as the
# single place a future tier would go if a rewrite is ever needed again.
_OR_SLUG_MAP: Dict[str, str] = {}

# 09-08 (operator: "some of the vision tiers dont work"). Measured live against
# the OpenRouter catalog + a real tab screenshot: the old deepseek vision slug
# was LISTED as image-capable but ACCEPTED the request and returned EMPTY content
# for an image payload; deepseek-v4-pro was not image-capable at all (HTTP 404).
# That is why a fallback exists, and it is retained for V4.1 Flash until the model
# is re-measured end-to-end: a catalog "text,image" modality claim is NOT proof
# that an image payload comes back non-empty — it lied once already. If V4.1 Flash
# returns empty content the med tier degrades UP to 3.8-flash, so the ladder stays
# monotonic. The fallback is logged, never silent.
_VISION_FALLBACK: Dict[str, str] = {
    "deepseek/deepseek-v4.1-flash": "google/gemini-3.8-flash",
}

MAX_DECODED_BYTES: int = 8 * 1024 * 1024  # ~8MB decoded cap (parent spec)
_MAX_IMAGES_PER_CALL: int = 4

# 09-02 parent spec: cap consecutive control actions per task at 15 (was 25).
_MAX_CONTROL_ACTIONS: int = 15
_MAX_TYPE_TEXT: int = 2000
_DEFAULT_VIEWPORT_MAX: int = 20000

DEFAULT_SCREEN_PROMPT: str = (
    "Describe what is on this screen. Be specific about text, layout, buttons, "
    "and their positions. Keep the prose under 120 words, then give the "
    "INTERACTIVE ELEMENTS section."
)

# 09-08: the analysis is the ONLY thing the text agent gets to aim at, so it
# has to carry real coordinates. Free-form "describe the positions" produced
# prose with zero usable numbers on several models (measured), which left the
# agent guessing and the drive landing on nothing. This forces a machine-
# readable element list at the end of every analysis.
_INTERACTIVE_SECTION_RULE: str = (
    "ALWAYS end your answer with a section headed exactly 'INTERACTIVE ELEMENTS:' "
    "listing every clickable or typable element, one per line, in the form "
    "'<name> (<role>) at x=<int>, y=<int>' using CSS pixel coordinates of the "
    "element's CENTRE inside the given viewport. The coordinate must be the true "
    "centre of the element's visible box — before writing it, re-check it against "
    "where the element actually sits in the image, because a click lands exactly "
    "there. List the element the user is most likely to want FIRST. Estimate only "
    "when genuinely unsure; never omit the section, and never write a coordinate "
    "you did not derive from the image."
)

# Accepted image signatures when Pillow is unavailable (the fallback path;
# .venv has no PIL today, so this is the live path).
_IMAGE_SIGNATURES: Tuple[Tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"RIFF", "image/webp"),  # RIFF....WEBP (4th byte checked in caller)
)

# ── Control-block contract ────────────────────────────────────────────────────
# ALLOWED OPS (only these; the extension executes them via the debugger
# protocol). Coordinates are CSS pixels in the captured tab's viewport.
CONTROL_OPS: Tuple[str, ...] = ("move", "click", "dblclick", "drag", "type", "key", "scroll")
CONTROL_KEYS: Tuple[str, ...] = (
    "Enter", "Escape", "Tab", "Backspace", "ArrowLeft", "ArrowRight",
    "ArrowUp", "ArrowDown", "Home", "End", "Delete", "PageUp", "PageDown",
)
CONTROL_MODIFIERS: Tuple[str, ...] = ("ctrl", "shift", "alt")
CONTROL_BUTTONS: Tuple[str, ...] = ("left", "right")
_DELTA_CAP: int = 5000  # scroll deltas clamped, never trusted raw

# ```control newline ... ``` — the strict fence the agent is told to use.
_CTRL_FENCE_RE = re.compile(r"```\s*control\s*\n(.*?)\n?```", re.DOTALL)


# ── Image validation / decode ─────────────────────────────────────────────────

def _mime_from_raw(raw: bytes) -> Optional[str]:
    for sig, mime in _IMAGE_SIGNATURES:
        if raw.startswith(sig):
            if mime == "image/webp" and raw[8:12] != b"WEBP":
                continue
            return mime
    return None


def validate_image_b64(image_b64: str) -> Tuple[bytes, str, Optional[str]]:
    """Returns (decoded_bytes, mime, None) or (None, '', error_message).

    Accepts a bare base64 string or a `data:image/...;base64,` URL. Rejects
    oversized (>8MB decoded) and obviously non-image payloads. Pillow is used
    to verify when importable; else a magic-header check (the .venv does not
    ship Pillow, so the header path is the live one — fine for a JPEG frame).
    """
    if not isinstance(image_b64, str) or not image_b64.strip():
        return None, "", "empty image payload"
    data = image_b64
    mime_hint = ""
    if data.startswith("data:") and "," in data:
        head, _, data = data.partition(",")
        if ";base64" in head:
            mime_hint = head[len("data:"):].split(";", 1)[0]
    if not data:
        return None, "", "empty image payload"
    try:
        raw = base64.b64decode(data, validate=True)
    except Exception:
        # tolerate whitespace-padded payloads from forgiving clients
        try:
            raw = base64.b64decode(data)
        except Exception:
            return None, "", "image is not valid base64"
    if not raw:
        return None, "", "empty image payload"
    if len(raw) > MAX_DECODED_BYTES:
        return None, "", f"image too large ({len(raw)} bytes decoded; cap {MAX_DECODED_BYTES})"

    mime = mime_hint if (mime_hint and mime_hint.startswith("image/")) else ""
    # Pillow verification first (strict decode), header fallback next.
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(raw))
        img.verify()
        if img.format:
            mime = f"image/{img.format.lower()}"
    except ImportError:
        mime = _mime_from_raw(raw) or mime
    except Exception:
        # Pillow present but this is not a decodable image.
        return None, "", "image failed PIL verification"

    if not mime.startswith("image/"):
        return None, "", "payload is not a recognized image"
    return raw, mime if mime else "image/jpeg", None


# ── Effort -> model tier resolution (09-02) ───────────────────────────────────

def parse_effort_score(value: Any) -> int:
    """Coerce an arbitrary settings value into a 1..1000 effort score.

    Non-numeric / None / absent -> DEFAULT_EFFORT_SCORE (500). Out-of-range
    numbers are clamped (never a 500 error from a hand-edited settings doc).

    **A 1..10 value is a LEVEL and is scaled up to this 1..1000 scale.** The UI
    exposes ten effort levels (the web dial and the extension sliders all write
    1..10), but the vision tiering and the humanizer were written against the
    original 1..1000 score with bands at 333/666. Without this mapping a level of
    1..10 clamps to itself, lands under the first band, and silently pins every
    user to the CHEAPEST vision tier no matter where they drag the slider —
    measured before the fix: levels 1,3,5,7,10 all resolved to
    'gemini-3.1-flash-lite'/'low', while the old scores 300/500/1000 correctly
    resolved low/med/high.

    Scaling by 100 keeps the two scales aligned to the same bands (levels 1-3 ->
    low, 4-6 -> med, 7-10 -> high), which is exactly what the extension already
    advertises in its model label, so the displayed model and the model actually
    used cannot disagree. Values above 10 are a real score and pass through
    untouched. Mirrors the dual-scale handling in llm.py.
    """
    if isinstance(value, bool):
        return DEFAULT_EFFORT_SCORE
    if isinstance(value, (int, float)):
        score = int(value)
    elif isinstance(value, str):
        try:
            score = int(float(value.strip()))
        except (ValueError, TypeError):
            return DEFAULT_EFFORT_SCORE
    else:
        return DEFAULT_EFFORT_SCORE
    if 0 < score <= 10:
        score *= 100  # 1..10 level -> 100..1000 score, same tier bands
    return max(_MIN_EFFORT_SCORE, min(_MAX_EFFORT_SCORE, score))


def resolve_vision_model(effort_score: Any = None) -> Tuple[str, str, int]:
    """Map a user's ai.effortScore to one of the three spec'd vision models.

    Returns (canonical model_id, tier_key, clamped_score). Three even bands
    across 1..1000, cheapest -> most expensive (see VISION_MODEL_TIERS):

        <=333     -> gemini-3.1-flash-lite      (low)
        334..666  -> deepseek-v4.1-flash        (med) [default 500]
        >666      -> gemini-3.8-flash           (high)
    """
    score = parse_effort_score(effort_score)
    if score <= 333:
        return "google/gemini-3.1-flash-lite", "low", score
    if score <= 666:
        return VISION_MODEL, "med", score
    return "google/gemini-3.8-flash", "high", score


# ── Vision inference (effort-tiered multimodal) ───────────────────────────────

async def analyze_screen_image(
    image_b64: str,
    prompt: str = "",
    width: Optional[int] = None,
    height: Optional[int] = None,
    model_id: Optional[str] = None,
) -> str:
    """One screen frame -> text analysis via the effort-tiered vision model.

    model_id is a canonical llm.ModelPolicy id (see resolve_vision_model);
    None -> VISION_MODEL (the middle tier). The called model must be one of
    the four spec'd vision models — anything else falls back to the pinned
    VISION_MODEL (the route layer is the only tier resolver).

    Raises ValueError/httpx errors on transport/model trouble; the CALLERS
    (routes_extension /vision + agent_chat) fail closed on any exception —
    never a 500 on model failure.
    """
    raw, mime, err = validate_image_b64(image_b64)
    if err:
        raise ValueError(err)

    effective_prompt = (prompt or DEFAULT_SCREEN_PROMPT).strip()[:2000]
    if width and height:
        effective_prompt = f"{effective_prompt}\n(Image is a {width}x{height} pixel screen capture.)"

    from .llm import PROHIBITED_MODEL_PREFIXES  # noqa: F401 — keep the pin honest
    # Same key resolution chain llm.call_llm uses (agent mode 09-01: no NEW
    # key handling is introduced).
    try:
        from .config import config
        api_key = (
            os.getenv("OPENROUTER_API_KEY")
            or getattr(config, "openrouter_api_key", "")
        )
    except Exception:
        api_key = os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        raise RuntimeError("no LLM API key configured")

    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://helpotron.app",
        "X-Title": "Helpotron Study OS",
    }

    # Effort-tiered pin — the mapping is the one llm.call_llm applies. The
    # canonical id from the route layer is mapped through _OR_SLUG_MAP exactly
    # as llm.call_llm does; unknown models are refused (never silent-swap to a
    # non-spec model).
    canonical = model_id if model_id in VISION_MODEL_TIERS else VISION_MODEL

    def _payload_for(cid: str) -> Dict[str, Any]:
        return {
            # 09-08: 700 truncated the answer mid-way on the slower-to-the-point
            # models, which cut the INTERACTIVE ELEMENTS section off entirely and
            # left the agent with no coordinates (measured on real screenshots).
            "model": _OR_SLUG_MAP.get(cid, cid),
            "temperature": 0.2,
            "max_tokens": 1100,
            "messages": [
                {"role": "system", "content": (
                    "You are Helpotron's screen-vision analyst. You see a snapshot of a "
                    "browser tab. Describe it faithfully: text, layout, buttons, fields, "
                    "and state changes.\n" + _INTERACTIVE_SECTION_RULE + "\n"
                    "Never invent content that is not visible.")},
                {"role": "user", "content": [
                    {"type": "text", "text": effective_prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64.b64encode(raw).decode('utf-8')}"}},
                ]},
            ],
        }

    # Try the resolved tier, then its fallback (see _VISION_FALLBACK). Only a
    # dead-model signal — non-200 or empty content — triggers the fallback; a
    # transport error still raises so the caller fails closed as before.
    chain = [canonical]
    fallback = _VISION_FALLBACK.get(canonical)
    if fallback and fallback != canonical:
        chain.append(fallback)

    last_err: Optional[str] = None
    async with httpx.AsyncClient(timeout=90.0) as client:
        for attempt, cid in enumerate(chain):
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers, json=_payload_for(cid),
            )
            if resp.status_code != 200:
                last_err = f"{cid} -> HTTP {resp.status_code}"
            else:
                content = (resp.json().get("choices") or [{}])[0].get("message", {}).get("content")
                if isinstance(content, str) and content.strip():
                    if attempt:
                        logger.warning(
                            "screen vision tier %s unusable (%s); answered with fallback %s",
                            canonical, last_err, cid,
                        )
                    # 09-07: this analysis is fed verbatim into the agent's
                    # system prompt (screen state) and back to the user — strip
                    # thinking/deliberation before it reaches either.
                    from .llm import strip_thinking_tokens
                    return strip_thinking_tokens(content.strip())
                last_err = f"{cid} -> empty content"
        raise ValueError(f"vision model returned no usable content ({last_err})")


# ── Control-block extraction + hardening ──────────────────────────────────────

def _as_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value == int(value):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


def _clamp_coords(coords: Any, viewport: Optional[Dict[str, int]]) -> Optional[List[int]]:
    """Validate + clamp the [x, y] pair. Returns None on a bad type."""
    vals = [coords.get(k) for k in ("x", "y")] if isinstance(coords, dict) else None
    if vals is None or any(v is None for v in vals):
        return None
    xs, ys = _as_int(vals[0]), _as_int(vals[1])
    if xs is None or ys is None:
        return None
    if viewport:
        xs = max(0, min(xs, max(0, int(viewport.get("width", 0)) - 1)))
        ys = max(0, min(ys, max(0, int(viewport.get("height", 0)) - 1)))
    return [xs, ys]


def _ref_of(op: Any) -> Optional[int]:
    """The `ref` of a DOM-anchored op, or None when absent/malformed.

    The 09-10 accuracy upgrade tells the model it may answer with
    `{"op":"click","ref":N}` instead of x/y (each line of the LIVE DOM ELEMENTS
    list it is handed carries a ref). Before this existed, `_validate_op`
    required x/y for every click, so a ref-only op came back as `invalid_op`
    and the WHOLE action list was dropped — the model followed the
    instructions and nothing ran. A ref carries no coordinates, so it is not
    clamped here; the extension resolves it against the live DOM at dispatch.
    """
    if not isinstance(op, dict):
        return None
    ref = op.get("ref")
    if isinstance(ref, bool):
        return None
    if isinstance(ref, int):
        n = ref
    elif isinstance(ref, float) and ref == int(ref):
        n = int(ref)
    elif isinstance(ref, str):
        try:
            n = int(ref.strip())
        except ValueError:
            return None
    else:
        return None
    return n if n >= 0 else None


def _target_of(op: Any) -> Optional[str]:
    """The semantic target of an op, or None when absent.

    Stagehand-style semantic grounding (2026-09-14): the model may answer with
    {"op":"click","target":"Search button"} instead of a coordinate or ref. The
    target is a name/label matching the LIVE DOM ELEMENTS list (or a short
    natural-language description the extension resolves against the live DOM at
    dispatch time). This is the most robust form: it survives resize, scroll,
    and scale, because it is resolved against the page at click time rather
    than aimed at a coordinate that may have drifted.
    """
    if not isinstance(op, dict):
        return None
    for key in ("target", "text_target", "name", "selector_hint"):
        val = op.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()[:120]
    return None


def _validate_op(op: Any, viewport: Optional[Dict[str, int]]) -> Optional[Dict[str, Any]]:
    """One action -> normalized dict, or None when invalid (whole list drops)."""
    if not isinstance(op, dict):
        return None
    name = op.get("op")
    if name not in CONTROL_OPS:
        return None
    if name in ("move", "dblclick"):
        # DOM-anchored first: a ref is exact, a semantic target is robust, x/y
        # is a vision estimate.
        ref = _ref_of(op)
        if ref is not None:
            return {"op": name, "ref": ref}
        target = _target_of(op)
        if target is not None:
            return {"op": name, "target": target}
        xy = _clamp_coords(op, viewport)
        return None if xy is None else {"op": name, "x": xy[0], "y": xy[1]}
    if name == "click":
        button = op.get("button", "left")
        if button not in CONTROL_BUTTONS:
            return None
        ref = _ref_of(op)
        if ref is not None:
            return {"op": "click", "ref": ref, "button": button}
        target = _target_of(op)
        if target is not None:
            return {"op": "click", "target": target, "button": button}
        xy = _clamp_coords(op, viewport)
        if xy is None:
            return None
        return {"op": "click", "x": xy[0], "y": xy[1], "button": button}
    if name == "drag":
        if not isinstance(op, dict):
            return None
        f = _clamp_coords({"x": op.get("fromX"), "y": op.get("fromY")}, viewport)
        t = _clamp_coords({"x": op.get("toX"), "y": op.get("toY")}, viewport)
        if f is None or t is None:
            return None
        return {"op": "drag", "fromX": f[0], "fromY": f[1], "toX": t[0], "toY": t[1]}
    if name == "type":
        txt = op.get("text")
        if not isinstance(txt, str) or not txt.strip():
            return None
        txt = txt[: _MAX_TYPE_TEXT]
        return {"op": "type", "text": txt}
    if name == "key":
        key = op.get("key")
        modifiers = op.get("modifiers", [])
        if key not in CONTROL_KEYS:
            return None
        if not isinstance(modifiers, list) or any(m not in CONTROL_MODIFIERS for m in modifiers):
            return None
        return {"op": "key", "key": key, "modifiers": list(modifiers)}
    if name == "scroll":
        xy = _clamp_coords(op, viewport)
        dx, dy = _as_int(op.get("deltaX")), _as_int(op.get("deltaY"))
        if xy is None or dx is None or dy is None:
            return None
        dx = max(-_DELTA_CAP, min(_DELTA_CAP, dx))
        dy = max(-_DELTA_CAP, min(_DELTA_CAP, dy))
        return {"op": "scroll", "x": xy[0], "y": xy[1], "deltaX": dx, "deltaY": dy}
    return None


def _parse_control_block(block: str) -> Any:
    """The fenced block -> parsed JSON, tolerating one layer of over-escaping.

    09-08: the control fence lives INSIDE the "reply" string of the agent's
    JSON envelope. When the envelope decodes normally the block is clean JSON.
    When the envelope parse falls back to raw text (a truncated or malformed
    envelope), the block still carries the envelope's escaping — \\" for every
    quote — and the strict json.loads fails, so the WHOLE action list dropped
    while the fence was still stripped from the reply. The user then read
    confident prose about an action that never ran. Retry once with that one
    layer of escaping removed; anything that survives still goes through the
    full op allowlist below, so this loosens parsing, never validation.
    """
    try:
        return json.loads(block)
    except Exception:
        pass
    if '\\"' not in block and "\\n" not in block:
        return None
    try:
        return json.loads(block.replace('\\"', '"').replace("\\n", "\n"))
    except Exception:
        return None


def extract_control_actions_ex(
    reply_text: str, viewport: Optional[Dict[str, int]]
) -> Tuple[str, Optional[List[Dict[str, Any]]], str]:
    """extract_control_actions plus the reason nothing survived.

    reason is "" on success and one of:
      no_block | malformed_json | wrong_shape | over_cap | invalid_op | empty
    The callers surface it so a dropped list becomes an honest "I could not
    do that" instead of silence behind prose claiming the action happened.
    """
    text = reply_text or ""
    actions: Optional[List[Dict[str, Any]]] = None
    reason = "no_block"

    matches = list(_CTRL_FENCE_RE.finditer(text))
    if matches:
        # Strict: only the LAST ```control block is honored; earlier stray
        # fences are just stripped below.
        block = matches[-1].group(1).strip()
        parsed = _parse_control_block(block)
        if isinstance(parsed, dict) and isinstance(parsed.get("actions"), list):
            parsed = parsed.get("actions")
        if parsed is None:
            reason = "malformed_json"
        elif not isinstance(parsed, list):
            reason = "wrong_shape"
        elif len(parsed) > _MAX_CONTROL_ACTIONS:
            reason = "over_cap"
        else:
            vp = viewport or {"width": 1280, "height": 800}
            normalized: List[Dict[str, Any]] = []
            ok = True
            for op in parsed:
                n = _validate_op(op, vp)
                if n is None:
                    ok = False
                    break
                normalized.append(n)
            if not ok:
                reason = "invalid_op"
            elif not normalized:
                reason = "empty"
            else:
                actions, reason = normalized, ""

    clean = _CTRL_FENCE_RE.sub("", text)
    clean = re.sub(r"\n{3,}", "\n\n", clean).strip()
    return clean, actions, reason


_ELEMENT_RE = re.compile(
    r"\s*(?:[-*\d.]+\s*)?(?P<name>[^()\n]{1,80}?)\s*"
    r"\((?P<role>[^)\n]{1,40})\)\s*"
    r"at\s*x\s*=\s*(?P<x>-?\d{1,5})\s*,\s*y\s*=\s*(?P<y>-?\d{1,5})",
    re.IGNORECASE | re.MULTILINE,
)

# Roles/names that mean "you can type here". Ordered: a real search box beats a
# generic text field, which beats a bare input.
# Sentence scaffolding that shows up when a model inlines an element into prose
# ("I can see a Search bar (textbox) at x=..."). Stripped off the front of a
# captured name so the name is the element, not the sentence around it.
_NAME_PREFIX_NOISE = frozenset("""
i we you it its there here this that these those a an the and also but so then
can could see sees seeing find finds look looks shows showing show displays
display display is are was were has have had contains containing near next
at on in to of top left right bottom centre center page screen view
""".split())

_INPUT_HINTS: Tuple[Tuple[str, int], ...] = (
    ("search", 100), ("query", 90), ("ask", 80), ("prompt", 80),
    ("message", 70), ("chat", 70), ("textbox", 60), ("textarea", 60),
    ("input", 50), ("field", 40), ("combobox", 30), ("url", 30),
)


def parse_interactive_elements(analysis: Optional[str]) -> List[Dict[str, Any]]:
    """Pull the INTERACTIVE ELEMENTS section out of a vision analysis.

    Returns [{"name","role","x","y"}, ...] for every line shaped
    '<name> (<role>) at x=<int>, y=<int>' — the format the vision system prompt
    demands (see _INTERACTIVE_SECTION_RULE). Lines anywhere in the text are
    accepted, not just after the heading: models sometimes inline the list.
    Never raises; an unparseable analysis just yields [].
    """
    if not isinstance(analysis, str) or not analysis.strip():
        return []
    out: List[Dict[str, Any]] = []
    for m in _ELEMENT_RE.finditer(analysis):
        try:
            x, y = int(m.group("x")), int(m.group("y"))
        except (TypeError, ValueError):
            continue
        name = _clean_element_name(m.group("name"))
        role = m.group("role").strip()
        if not name:
            continue
        out.append({"name": name, "role": role, "x": x, "y": y})
    return out


def _clean_element_name(raw: str) -> str:
    """'I can see a Search bar' -> 'Search bar'.

    The element name is whatever sat before the '(role)', which on an inlined
    line is the whole sentence up to that point. Drop the leading scaffolding
    words so the name is the control itself; a name that is nothing but
    scaffolding is left alone rather than emptied.
    """
    words = raw.strip(" \t-*•.:").split()
    kept = list(words)
    while kept and kept[0].strip(",.:;").lower() in _NAME_PREFIX_NOISE:
        kept.pop(0)
    return " ".join(kept or words).strip(" \t-*•.:,")


def find_input_target(
    analysis: Optional[str], hint: str = "", viewport: Optional[Dict[str, int]] = None
) -> Optional[Dict[str, Any]]:
    """Best typable element on the analysed screen, or None.

    09-08: the typing fallback used to click the viewport CENTRE and type into
    whatever happened to have focus. On a page whose centre is not a field (a
    usage dashboard, say) that put a caret nowhere and dropped the text on the
    floor, while the agent's prose claimed the typing had happened. Now the
    fallback aims at a element the vision pass actually saw, and when there is
    no such element it returns None so the caller can say so instead of
    guessing.

    Scoring: the user's own words first, role/name keyword weight second. The
    keyword weights (see _INPUT_HINTS) only rank fields the user said nothing
    about — "send a message" must land in the message box even on a page whose
    search bar scores higher on generic keywords, because the user named it.
    Off-viewport candidates are discarded.
    """
    elements = parse_interactive_elements(analysis)
    if not elements:
        return None
    w = int((viewport or {}).get("width") or 0)
    h = int((viewport or {}).get("height") or 0)
    hint_words = {
        t for t in re.findall(r"[a-z]{3,}", (hint or "").lower())
        if t not in _NAME_PREFIX_NOISE
    }

    best: Optional[Dict[str, Any]] = None
    best_score = 0
    for el in elements:
        if el["x"] < 0 or el["y"] < 0:
            continue
        if (w and el["x"] > w) or (h and el["y"] > h):
            continue
        blob = f"{el['name']} {el['role']}".lower()
        score = 0
        for token, weight in _INPUT_HINTS:
            if token in blob:
                score = max(score, weight)
        if not score:
            continue
        # Outranks every keyword weight on purpose: the user naming a field is
        # better evidence than any guess this function can make about roles.
        if hint_words & set(re.findall(r"[a-z]{3,}", blob)):
            score += 1000
        if score > best_score:
            best, best_score = el, score
    return best


def extract_control_actions(reply_text: str, viewport: Optional[Dict[str, int]]) -> Tuple[str, Optional[List[Dict[str, Any]]]]:
    """Parses + hardens the agent's ```control block from a reply.

    Returns (clean_reply_text, actions):
      * actions = list of normalized, allowlisted, viewport-clamped ops
      * actions = None when no block, when the block is malformed, when ANY
        op fails validation (the whole list drops — never partial execute),
        when the list is empty, when the list exceeds the action cap, or
        when no viewport was supplied (control requires clamped coordinates).

    The fenced block is stripped from the returned reply text either way.
    """
    clean, actions, _reason = extract_control_actions_ex(reply_text, viewport)
    return clean, actions
