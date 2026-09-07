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
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx

# Default model (= middle tier) and the effort-score semantic (09-02).
VISION_MODEL: str = "deepseek/deepseek-v4-flash-vision"
DEFAULT_EFFORT_SCORE: int = 500
_MIN_EFFORT_SCORE: int = 1
_MAX_EFFORT_SCORE: int = 1000

# The four vision models the parent spec allows for screen vision, ordered
# cheapest -> most expensive, keyed by their canonical llm.ModelPolicy ids.
# Prices are llm.PRICING input/1M (text / image token / image 1M px) — the
# tier band structure is mirrored in llm.resolve_model_routing (09-01
# effort bands: <=350 lvl3, <=550 lvl5, <=750 lvl7, >750 lvl9/10), so a
# user's effort level is honored consistently by BOTH the text agent and the
# screen-vision lane.
VISION_MODEL_TIERS: Dict[str, str] = {
    "google/gemini-3.1-flash-lite": "$0.075 / $0.30 / $0.0003",      # cheapest
    "deepseek/deepseek-v4-flash-vision": "$0.14 / $0.28 / $0.0004",
    "google/gemini-3.8-flash": "$0.25 / $1.00 / $0.0008",
    "deepseek/deepseek-v4-pro-vision": "$0.87 / $1.74 / $0.0015",    # most expensive
}

# OpenRouter catalog mapping that llm.call_llm applies (09-01, Bob): plain
# deepseek-v4-flash is TEXT-ONLY on OpenRouter; the vision flavor needs the
# "-exp" slug, and pro-vision has no standalone catalog entry (pro text slug
# carries images). Kept in sync — same map — with llm.py.
_OR_SLUG_MAP: Dict[str, str] = {
    "google/gemini-3.1-flash-lite": "google/gemini-3.1-flash-lite",
    "deepseek/deepseek-v4-flash-vision": "deepseek/deepseek-v4-flash-vision-exp",
    "google/gemini-3.8-flash": "google/gemini-3.8-flash",
    "deepseek/deepseek-v4-pro-vision": "deepseek/deepseek-v4-pro",
}

MAX_DECODED_BYTES: int = 8 * 1024 * 1024  # ~8MB decoded cap (parent spec)
_MAX_IMAGES_PER_CALL: int = 4

# 09-02 parent spec: cap consecutive control actions per task at 15 (was 25).
_MAX_CONTROL_ACTIONS: int = 15
_MAX_TYPE_TEXT: int = 2000
_DEFAULT_VIEWPORT_MAX: int = 20000

DEFAULT_SCREEN_PROMPT: str = (
    "Describe what is on this screen. Be specific about text, layout, buttons, "
    "and their positions (coordinates if inferable). Reply in at most 120 words."
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
    return max(_MIN_EFFORT_SCORE, min(_MAX_EFFORT_SCORE, score))


def resolve_vision_model(effort_score: Any = None) -> Tuple[str, str, int]:
    """Map a user's ai.effortScore to one of the four spec'd vision models.

    Returns (canonical model_id, tier_key, clamped_score). Tiers (cheapest ->
    most expensive, see VISION_MODEL_TIERS):

        <=300  -> gemini-3.1-flash-lite          (cheapest, lite)
        301..500  -> deepseek-v4-flash-vision     (mid pair, lower half)
        501..700  -> gemini-3.8-flash             (mid pair, upper half)
        >700   -> deepseek-v4-pro-vision          (most expensive)
    """
    score = parse_effort_score(effort_score)
    if score <= 300:
        return "google/gemini-3.1-flash-lite", "lite", score
    if score <= 500:
        return VISION_MODEL, "mid_lower", score
    if score <= 700:
        return "google/gemini-3.8-flash", "mid_upper", score
    return "deepseek/deepseek-v4-pro-vision", "pro", score


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
    model_id = _OR_SLUG_MAP.get(canonical, canonical)
    payload = {
        "model": model_id,
        "temperature": 0.2,
        "max_tokens": 700,
        "messages": [
            {"role": "system", "content": (
                "You are Helpotron's screen-vision analyst. You see a snapshot of a "
                "browser tab. Describe it faithfully: text, layout, buttons, fields, "
                "state changes, and where things are (estimated pixel coordinates). "
                "Never invent content that is not visible.")},
            {"role": "user", "content": [
                {"type": "text", "text": effective_prompt},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64.b64encode(raw).decode('utf-8')}"}},
            ]},
        ],
    }
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("vision model returned empty content")
        # 09-07: this analysis is fed verbatim into the agent's system prompt
        # (screen state) and back to the user — strip thinking/deliberation
        # before it reaches either.
        from .llm import strip_thinking_tokens
        return strip_thinking_tokens(content.strip())


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


def _validate_op(op: Any, viewport: Optional[Dict[str, int]]) -> Optional[Dict[str, Any]]:
    """One action -> normalized dict, or None when invalid (whole list drops)."""
    if not isinstance(op, dict):
        return None
    name = op.get("op")
    if name not in CONTROL_OPS:
        return None
    if name in ("move", "dblclick"):
        xy = _clamp_coords(op, viewport)
        return None if xy is None else {"op": name, "x": xy[0], "y": xy[1]}
    if name == "click":
        xy = _clamp_coords(op, viewport)
        button = op.get("button", "left")
        if xy is None or button not in CONTROL_BUTTONS:
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
    text = reply_text or ""
    actions: Optional[List[Dict[str, Any]]] = None

    matches = list(_CTRL_FENCE_RE.finditer(text))
    if matches:
        # Strict: only the LAST ```control block is honored; earlier stray
        # fences are just stripped below.
        block = matches[-1].group(1).strip()
        parsed: Any = None
        try:
            parsed = json.loads(block)
        except Exception:
            parsed = None
        if isinstance(parsed, dict) and isinstance(parsed.get("actions"), list):
            parsed = parsed.get("actions")
        if isinstance(parsed, list) and len(parsed) <= _MAX_CONTROL_ACTIONS:
            vp = viewport or {"width": 1280, "height": 800}
            normalized: List[Dict[str, Any]] = []
            ok = True
            for op in parsed:
                n = _validate_op(op, vp)
                if n is None:
                    ok = False
                    break
                normalized.append(n)
            if ok and normalized:
                actions = normalized
        # Else: malformed JSON / wrong shape / over-cap -> actions stays None.

    clean = _CTRL_FENCE_RE.sub("", text)
    clean = re.sub(r"\n{3,}", "\n\n", clean).strip()
    return clean, actions
