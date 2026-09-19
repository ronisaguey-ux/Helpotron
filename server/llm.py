import os
import json
import httpx
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime

# .env is authoritative: stale OPENROUTER_API_KEY exports in the surrounding
# shell have shadowed the real key repeatedly (os.environ wins over pydantic's
# env_file). override=True forces .env values into os.environ at import.
# EXCEPTION (2026-09-07, incident root cause): a caller-explicit DATABASE_URL /
# ENVIRONMENT must survive — load_dotenv stomping them snapped every "scratch"
# uvicorn (`DATABASE_URL=sqlite:////tmp/...`) onto the prod DB at import.
try:
    from dotenv import load_dotenv
    _PINNED = {k: os.environ[k] for k in ("DATABASE_URL", "ENVIRONMENT") if k in os.environ}
    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)
    for _k, _v in _PINNED.items():
        os.environ[_k] = _v
except Exception:
    pass

logger = logging.getLogger(__name__)

class ModelPolicy:
    """Canonical Single Source of Truth for Model Routing, Pricing & Prohibitions."""

    PRIMARY_MODELS = {
        "nemotron_nano": "nvidia/nemotron-3-nano-30b-a3b",
        "qwen_72b": "qwen/qwen-2.5-72b-instruct",
        "gemini_31_flash_lite": "google/gemini-3.1-flash-lite",
        "deepseek_v4_1_flash": "deepseek/deepseek-v4.1-flash",
        "gemini_38_flash": "google/gemini-3.8-flash",
    }

    GRUNT_CANDIDATES = [
        "nvidia/nemotron-3-nano-30b-a3b",
        "qwen/qwen-2.5-72b-instruct",
    ]

    PROHIBITED_PREFIXES = [
        "anthropic/", "claude", "openai/", "gpt"
    ]

    PRICING = {
        # live OpenRouter pricing per 1M tokens
        "nvidia/nemotron-3-nano-30b-a3b": {"input": 0.05, "output": 0.20, "modalities": ["text"], "reliability": 0.97},
        "qwen/qwen-2.5-72b-instruct": {"input": 0.09, "output": 0.18, "modalities": ["text"], "reliability": 0.99},
        "google/gemini-3.1-flash-lite": {"input": 0.075, "output": 0.30, "image_input": 0.0003, "audio_input": 0.002, "modalities": ["text", "vision", "audio"], "reliability": 0.999},
        # 09-10: V4.1 Flash is natively vision on OpenRouter (text+image, 1M ctx), so
        # the old "-exp" wire-slug hack and the separate pro-vision row are both gone.
        # OpenRouter bills images as prompt tokens for this model — no image_input key.
        "deepseek/deepseek-v4.1-flash": {"input": 0.15, "output": 0.60, "modalities": ["text", "vision"], "reliability": 0.99},
        "google/gemini-3.8-flash": {"input": 0.25, "output": 1.00, "image_input": 0.0008, "audio_input": 0.005, "modalities": ["text", "vision", "audio"], "reliability": 0.999},
    }

PRIMARY_MODELS = ModelPolicy.PRIMARY_MODELS
MODEL_PRICING = ModelPolicy.PRICING
PROHIBITED_MODEL_PREFIXES = ModelPolicy.PROHIBITED_PREFIXES
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")

def calculate_effective_task_cost(model_id: str, modality: str = "text", input_tokens: int = 1000, output_tokens: int = 500, num_images: int = 0, audio_minutes: float = 0.0) -> float:
    pricing = ModelPolicy.PRICING.get(model_id)
    if not pricing:
        return float("inf")

    token_cost = ((input_tokens / 1_000_000.0) * pricing.get("input", 0.0)) + ((output_tokens / 1_000_000.0) * pricing.get("output", 0.0))
    image_cost = num_images * pricing.get("image_input", 0.0) if modality in ["vision", "multimodal"] else 0.0
    audio_cost = audio_minutes * pricing.get("audio_input", 0.0) if modality == "audio" else 0.0
    return token_cost + image_cost + audio_cost

def get_deepseek_baseline_cost(modality: str = "text", input_tokens: int = 1000, output_tokens: int = 500, num_images: int = 0, audio_minutes: float = 0.0) -> float:
    if modality == "audio":
        return calculate_effective_task_cost("google/gemini-3.1-flash-lite", modality="audio", input_tokens=input_tokens, output_tokens=output_tokens, audio_minutes=audio_minutes)
    return calculate_effective_task_cost("google/gemini-3.1-flash-lite", modality=modality, input_tokens=input_tokens, output_tokens=output_tokens, num_images=num_images)

def evaluate_grunt_candidate(
    candidate_id: str,
    required_capabilities: List[str],
    modality: str = "text",
    min_reliability: float = 0.98,
    input_tokens: int = 1000,
    output_tokens: int = 500,
    audio_minutes: float = 0.0
) -> Dict[str, Any]:
    meta = ModelPolicy.PRICING.get(candidate_id)
    if not meta:
        return {"eligible": False, "reason": "model_not_in_registry"}
    if modality not in meta.get("modalities", []):
        return {"eligible": False, "reason": f"modality_{modality}_unsupported"}
    cand_cost = calculate_effective_task_cost(candidate_id, modality=modality, input_tokens=input_tokens, output_tokens=output_tokens, audio_minutes=audio_minutes)
    baseline_cost = get_deepseek_baseline_cost(modality=modality, input_tokens=input_tokens, output_tokens=output_tokens, audio_minutes=audio_minutes)
    return {"eligible": True, "cand_cost": cand_cost, "baseline_cost": baseline_cost, "savings": baseline_cost - cand_cost}

def resolve_model_routing(
    effort: str = "medium",
    modality: str = "text",
    required_capabilities: Optional[List[str]] = None,
    allow_grunt: bool = True,
    input_tokens: int = 1000,
    output_tokens: int = 500,
    complexity_score: float = 3.0,
    num_images: int = 0,
    audio_minutes: float = 0.0,
    effort_score: Optional[int] = None
) -> Dict[str, Any]:
    """
    Tiered Model Hierarchy:
    - Level 1: nvidia/nemotron-3-nano-30b-a3b
    - Level 2: qwen/qwen-2.5-72b-instruct
    - Level 3: google/gemini-3.1-flash-lite
    - Levels 4-10: deepseek/deepseek-v4.1-flash (single DeepSeek model, per owner 09-10)
    - Gemini 3.8 Flash: ONLY used when effort is maxed out (>=8) on Gemini-exclusive tasks
      (audio, image/video generation/analysis, google slides, fake google doc history).
    """
    required_capabilities = required_capabilities or []

    # 1. Resolve effort level (1 to 10)
    level = 5
    if effort_score is not None:
        try:
            es = int(effort_score)
            if es <= 10:
                level = max(1, min(10, es))
            elif es <= 150: level = 1
            elif es <= 250: level = 2
            elif es <= 350: level = 3
            elif es <= 450: level = 4
            elif es <= 550: level = 5
            elif es <= 650: level = 6
            elif es <= 750: level = 7
            elif es <= 850: level = 8
            elif es <= 950: level = 9
            else: level = 10
        except (TypeError, ValueError):
            pass
    elif isinstance(effort, (int, float)):
        level = max(1, min(10, int(effort)))
    elif isinstance(effort, str):
        eff_str = effort.strip().lower()
        if eff_str.isdigit():
            level = max(1, min(10, int(eff_str)))
        elif eff_str in ("low", "fast", "grunt"):
            level = 1
        elif eff_str in ("medium", "balanced"):
            level = 5
        elif eff_str in ("advanced", "high", "flagship"):
            level = 9
        elif eff_str == "auto":
            if complexity_score <= 2.0: level = 1
            elif complexity_score <= 3.5: level = 2
            elif complexity_score <= 5.0: level = 3
            elif complexity_score <= 7.5: level = 5
            else: level = 9

    # 2. Check for Gemini-exclusive tasks
    gemini_caps = ("audio", "video", "image_gen", "video_gen", "google_slides", "fake_doc_history", "slide_deck", "doc_history")
    is_gemini_exclusive = (modality in ("audio", "video") or any(c in required_capabilities for c in gemini_caps))

    if is_gemini_exclusive:
        if level >= 8:
            selected = ModelPolicy.PRIMARY_MODELS["gemini_38_flash"]
            tier = "gemini_exclusive_flagship"
            reason = "Maxed effort on Gemini-exclusive task (audio/video/slides/fake doc history)"
        else:
            selected = ModelPolicy.PRIMARY_MODELS["gemini_31_flash_lite"]
            tier = "gemini_exclusive_lite"
            reason = "Gemini-exclusive task routed to fast lite engine"
    else:
        # Standard Text / Multimodal Vision / Reasoning Hierarchy
        if level == 1:
            selected = ModelPolicy.PRIMARY_MODELS["nemotron_nano"]
            tier = "level_1_nemotron_nano"
            reason = "Effort level 1 (Nemotron 3 Nano)"
        elif level == 2:
            selected = ModelPolicy.PRIMARY_MODELS["qwen_72b"]
            tier = "level_2_qwen_72b"
            reason = "Effort level 2 (Qwen 2.5 72B Instruct)"
        elif level == 3:
            selected = ModelPolicy.PRIMARY_MODELS["gemini_31_flash_lite"]
            tier = "level_3_gemini_lite"
            reason = "Effort level 3 (Gemini 3.1 Flash Lite)"
        elif level <= 7:
            selected = ModelPolicy.PRIMARY_MODELS["deepseek_v4_1_flash"]
            tier = "level_4_7_deepseek_v4_1_flash"
            reason = f"Effort level {level} (DeepSeek V4.1 Flash)"
        else:
            selected = ModelPolicy.PRIMARY_MODELS["deepseek_v4_1_flash"]
            tier = "level_8_10_deepseek_v4_1_flash"
            reason = f"Effort level {level} (DeepSeek V4.1 Flash)"

    cost = calculate_effective_task_cost(selected, modality=modality, input_tokens=input_tokens, output_tokens=output_tokens, num_images=num_images, audio_minutes=audio_minutes)
    return {
        "model": selected,
        "tier": tier,
        "level": level,
        "escalated": False,
        "reason": reason,
        "estimated_cost": cost,
        "is_gemini_exclusive": is_gemini_exclusive
    }

def apply_model_constraints(model_id: str, *, images: bool = False,
                            json_mode: bool = False) -> str:
    """Model rewrites that depend on the REQUEST, not on the effort level.

    These two rules change which model actually executes, which is why they live
    in one named function: anything that REPORTS the model — the extension's
    model badge, routing telemetry — has to apply the same rules or it will name
    a model that never runs. That is not hypothetical. The agent's intent call
    always sends response_format="json_object", so at effort level 1 the router
    picks nemotron and this rewrites it to gemini-3.1-flash-lite; a ladder
    published without this step advertised "Nemotron 3 Nano" while
    gemini-3.1-flash-lite was doing the work (measured 2026-09-18, and visible in
    api_usage_logs: model=gemini-3.1-flash-lite with tier=level_1_nemotron_nano).

    grunts return empty 200 bodies without an explicit token cap, and are not
    vision-capable, so an image request must not stay on one.
    """
    if images and model_id in ModelPolicy.GRUNT_CANDIDATES:
        return ModelPolicy.PRIMARY_MODELS["gemini_31_flash_lite"]
    if json_mode and model_id == ModelPolicy.PRIMARY_MODELS["nemotron_nano"]:
        return ModelPolicy.PRIMARY_MODELS["gemini_31_flash_lite"]
    return model_id


def effective_chat_model(effort_score: int, *, images: bool = False) -> str:
    """The model a chat turn at `effort_score` will actually run.

    Resolves the effort ladder and then applies the request-dependent rewrites
    above. Used by ui-config so the badge matches reality; the agent chat's
    intent call is JSON mode, which is the case this models.
    """
    model_id = resolve_model_routing(effort_score=effort_score)["model"]
    return apply_model_constraints(model_id, images=images, json_mode=True)


def _effort_cascade(primary_model: str, effort: int = 500) -> List[str]:
    """Helper to build fallback cascade list starting with primary model."""
    routing = resolve_model_routing(effort_score=effort)
    chosen = routing["model"]
    candidates = [primary_model]
    if chosen not in candidates:
        candidates.append(chosen)
    for m in [
        ModelPolicy.PRIMARY_MODELS["deepseek_v4_1_flash"],
        ModelPolicy.PRIMARY_MODELS["gemini_31_flash_lite"],
        ModelPolicy.PRIMARY_MODELS["qwen_72b"],
    ]:
        if m not in candidates:
            candidates.append(m)
    return candidates

async def record_routing_telemetry(db_session, user_id: str, route_info: Dict[str, Any], token_usage: Dict[str, int]):
    """Ledger one routed LLM call (see cost_tracking.ApiUsageLog).

    The cost engine keys rows by public_id, while callers hand us either the
    numeric user id or the public_id — resolve both (log_api_call() takes
    db + public_id; the historical `user_id=`/`model=` kwargs no longer
    exist, which silently dropped every row since the signature change).
    """
    try:
        from .cost_tracking import cost_engine
        from .database import User

        user = None
        if isinstance(user_id, int) or str(user_id).isdigit():
            user = db_session.query(User).filter(User.id == int(user_id)).first()
        if user is None:
            user = db_session.query(User).filter(User.public_id == str(user_id)).first()

        # 09-01 fix: log_api_call's real signature takes db, public_id,
        # tool_or_model, category, ... (the kwargs user_id=/model=/input_tokens=
        # don't exist) — every attempt raised TypeError and NO routing row
        # reached api_usage_logs; mirror transcription.py's correct call.
        cost_engine.log_api_call(
            db=db_session,
            public_id=user.public_id if user else str(user_id),
            tool_or_model=route_info.get("model", "unknown"),
            category="llm",
            duration_seconds=0.0,
            input_tokens=int(token_usage.get("prompt_tokens", 0) or 0),
            output_tokens=int(token_usage.get("completion_tokens", 0) or 0),
            metadata={k: v for k, v in route_info.items() if k != "model"},
        )
    except Exception as e:
        logger.warning(f"Failed to persist routing telemetry: {e}")


def strip_thinking_tokens(text: Optional[str]) -> str:
    """Robustly strips internal thinking, reasoning tags, and internal monologues.

    Prevents thinking tokens (<think>...</think>, <thought>...</thought>,
    <reasoning>...</reasoning>) and internal rule-deliberation leaks from reaching users.
    """
    if not text:
        return ""
    import re
    t = str(text).strip()
    # Strip closed blocks
    t = re.sub(r"<think>[\s\S]*?</think>", "", t, flags=re.IGNORECASE)
    t = re.sub(r"<thought>[\s\S]*?</thought>", "", t, flags=re.IGNORECASE)
    t = re.sub(r"<reasoning>[\s\S]*?</reasoning>", "", t, flags=re.IGNORECASE)
    t = re.sub(r"<thought_process>[\s\S]*?</thought_process>", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\[THOUGHT\][\s\S]*?\[/THOUGHT\]", "", t, flags=re.IGNORECASE)

    # Handle unclosed thinking tags (e.g. truncated generation)
    for tag in ("<think>", "<thought>", "<reasoning>"):
        idx = t.lower().find(tag)
        if idx != -1:
            close_tag = tag.replace("<", "</")
            close_idx = t.lower().find(close_tag)
            if close_idx != -1:
                t = t[close_idx + len(close_tag):]
            else:
                t = t[:idx]

    # Clean Thinking Process / Analysis preambles
    t = re.sub(r"^Thinking Process:[\s\S]*?(?=\n\n[A-Z0-9{\"']|\Z)", "", t, flags=re.IGNORECASE)

    # If text is an internal rules monologue without JSON, filter out meta sentences
    lower = t.lower().strip()
    if (lower.startswith("we need to follow the system's rules") or
        lower.startswith("we must follow the system's rules") or
        ("the user says:" in lower and "the instruction says" in lower)):
        sentences = re.split(r"(?<=[.?!])\s+", t)
        real_sentences = [
            s for s in sentences
            if not any(kw in s.lower() for kw in (
                "we need to follow", "we must follow", "the user says",
                "the instruction says", "there's no tool", "the only tool mentioned",
                "according to the rules", "use sandboxed math",
                "use solve_deterministic_math",
            ))
        ]
        t = " ".join(real_sentences).strip()

    return t.strip()


def format_model_identity_prompt(model_id: str) -> str:
    if "deepseek" in model_id:
        clean_name = "deepseek-v4.1-flash"
        model_id = "deepseek/deepseek-v4.1-flash"
    else:
        clean_name = model_id.split("/")[-1] if "/" in model_id else model_id
    provider = model_id.split("/")[0] if "/" in model_id else "OpenSource"
    return (
        f"CRITICAL MANDATE — RUNTIME AI MODEL IDENTITY:\n"
        f"You are powered by the AI model '{clean_name}' (model identifier: '{model_id}', provider: '{provider}').\n"
        f"You are strictly NOT from Anthropic (NOT Claude) and NOT from OpenAI (NOT ChatGPT).\n"
        f"If the user asks what model, AI, architecture, or provider you are (e.g. 'what model are you', 'what model are u', 'which ai model is this'), "
        f"you MUST answer directly that you are {clean_name} ({model_id}). "
        f"NEVER evade the question or give a generic canned response like 'I am your personal coach and assistant'. State your actual model name ({clean_name})."
    )


async def call_llm(
    user_prompt: str,
    system_prompt: str = "",
    effort: str = "auto",
    modality: str = "text",
    json_mode: bool = False,
    response_format: Optional[str] = None,
    required_capabilities: Optional[List[str]] = None,
    complexity_score: float = 3.0,
    user_id: str = "system",
    model: Optional[str] = None,
    db = None,
    effort_score: Optional[int] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    images: Optional[List[str]] = None,
    vision_only: bool = False,
) -> str:
    if response_format in ("json", "json_object") or json_mode:
        json_mode = True

    effective_modality = "vision" if images else modality
    route = resolve_model_routing(
        effort=effort,
        modality=effective_modality,
        required_capabilities=required_capabilities,
        complexity_score=complexity_score,
        effort_score=effort_score,
    )
    model_id = MODELS.get(model, model) if model else route["model"]  # short names (flash/pro/...) → real slug 08-28
    model_id = apply_model_constraints(model_id, images=bool(images), json_mode=bool(json_mode))

    for prohibited in ModelPolicy.PROHIBITED_PREFIXES:
        if prohibited in model_id:
            raise ValueError(f"CRITICAL: Attempted to route to prohibited model {model_id}. Execution halted.")

    try:
        from .config import config
        api_key = os.getenv("OPENROUTER_API_KEY") or getattr(config, "openrouter_api_key", "") or OPENROUTER_API_KEY
    except Exception:
        api_key = os.getenv("OPENROUTER_API_KEY", "") or OPENROUTER_API_KEY

    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://helpotron.app",
        "X-Title": "Helpotron Study OS"
    }

    payload = {
        "model": model_id,
        "temperature": temperature if temperature is not None else (0.2 if json_mode else 0.7),
    }
    if max_tokens:
        payload["max_tokens"] = int(max_tokens)
    elif model_id in ModelPolicy.GRUNT_CANDIDATES:
        # grunt models (nemotron-3-nano et al.) return empty 200 bodies
        # without an explicit output cap (08-27) — always cap them.
        payload["max_tokens"] = 4096
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    openrouter_err = None
    # The three models that can actually consume a screenshot. The extension is
    # a vision surface by design (it drives the page and can send screen frames),
    # so it is restricted to these and never falls back to a text-only model —
    # a fallback to a blind model on an image turn would answer about a page it
    # cannot see (owner directive 2026-09-18: the extension uses ONLY
    # gemini-3.1-flash-lite, deepseek-v4.1-flash and gemini-3.8-flash).
    vision_capable = [
        ModelPolicy.PRIMARY_MODELS["gemini_31_flash_lite"],
        ModelPolicy.PRIMARY_MODELS["deepseek_v4_1_flash"],
        ModelPolicy.PRIMARY_MODELS["gemini_38_flash"],
    ]

    attempt_models = _effort_cascade(model_id, effort=effort_score or 500)
    if vision_only:
        # Keep the resolved primary if it is vision-capable, then the rest of the
        # vision set as fallbacks — in tier order, so a failed high tier degrades
        # rather than jumping to an unrelated model.
        ordered = [m for m in vision_capable if m != model_id]
        attempt_models = ([model_id] if model_id in vision_capable else []) + ordered
    elif images:
        attempt_models = [m for m in attempt_models if m in vision_capable] or [
            ModelPolicy.PRIMARY_MODELS["gemini_31_flash_lite"],
            ModelPolicy.PRIMARY_MODELS["deepseek_v4_1_flash"],
        ]

    async with httpx.AsyncClient(timeout=60.0) as client:
        for cand_id in attempt_models:
            cand_payload = dict(payload)
            # 09-10: V4.1 Flash is natively vision on OpenRouter (text+image), so the
            # canonical id is already the wire id — the old "-exp" slug rewrite is retired.
            openrouter_model = cand_id
            cand_payload["model"] = openrouter_model

            # Explicit runtime model identity injected into system prompt
            ident_notice = format_model_identity_prompt(cand_id)
            cand_messages = []
            if system_prompt:
                cand_messages.append({"role": "system", "content": f"{ident_notice}\n\n{system_prompt}"})
            else:
                cand_messages.append({"role": "system", "content": ident_notice})
            if images:
                user_content: List[Dict[str, Any]] = [{"type": "text", "text": user_prompt}]
                for img in images[:4]:
                    if not img or not isinstance(img, str):
                        continue
                    url = img if img.startswith("data:") else f"data:image/jpeg;base64,{img}"
                    user_content.append({"type": "image_url", "image_url": {"url": url}})
                cand_messages.append({"role": "user", "content": user_content})
            else:
                cand_messages.append({"role": "user", "content": user_prompt})
            cand_payload["messages"] = cand_messages

            try:
                resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=cand_payload)
                if hasattr(resp, "raise_for_status") and callable(resp.raise_for_status):
                    resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                if content is None:
                    # reasoning model burned its output cap — retry next candidate
                    raise ValueError("blank content (reasoning cap)")
                content = strip_thinking_tokens(content)
                if not str(content).strip():
                    # 200 with an empty body is a provider backend failure, not a
                    # real answer (08-31: finalize silently produced no material
                    # because every chunk came back as "" with a 200) — fall
                    # through to the next candidate / lane.
                    raise ValueError("empty content (blank 200)")
                usage = data.get("usage", {})
                if db and user_id:
                    await record_routing_telemetry(db, user_id, {**route, "model": cand_id}, usage)
                return content
            except Exception as err:
                openrouter_err = err
                logger.warning("call_llm openrouter model %s failed: %s — next candidate", cand_id, err)

    # OpenRouter is the ONLY LLM channel (owner rule 2026-09-07: "all llm
    # calls have to go thru openrouter with no exceptions") — no local-gateway
    # fallbacks. Surface the real cause to the caller instead.
    logger.error("all LLM backends failed (openrouter: %s)", openrouter_err, exc_info=True)
    raise RuntimeError(f"all LLM backends failed (openrouter: {openrouter_err})") from openrouter_err

def extract_json(content: Optional[str]) -> Any:
    if content is None or not str(content).strip():
        return {"status": "ok"}
    content = str(content).strip()
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0].strip()
    elif "```" in content:
        content = content.split("```")[1].split("```")[0].strip()
    try:
        return json.loads(content)
    except Exception:
        start_obj = content.find("{")
        end_obj = content.rfind("}")
        start_arr = content.find("[")
        end_arr = content.rfind("]")
        if start_arr != -1 and (start_obj == -1 or start_arr < start_obj) and end_arr != -1:
            try:
                return json.loads(content[start_arr:end_arr+1])
            except Exception:
                pass
        if start_obj != -1 and end_obj != -1:
            try:
                return json.loads(content[start_obj:end_obj+1])
            except Exception:
                pass
        return None



# --- Compatibility Wrappers ---
MODELS = {
    "flash": "deepseek/deepseek-v4.1-flash",
    "pro": "deepseek/deepseek-v4.1-flash",
    "flash_vision": "deepseek/deepseek-v4.1-flash",
    "pro_vision": "deepseek/deepseek-v4.1-flash",
    "lite": "google/gemini-3.1-flash-lite",
    "gemini": "google/gemini-3.8-flash",
    "nano": "nvidia/nemotron-3-nano-30b-a3b",
    "qwen": "qwen/qwen-2.5-72b-instruct",
    "grunt": "nvidia/nemotron-3-nano-30b-a3b",
    "cheapest": "nvidia/nemotron-3-nano-30b-a3b",
}

class TaskCategory:
    GENERAL = "general"
    CODE = "code"
    MATH = "math"
    FAST = "fast"
    GRUNT = "grunt"

class EffortLevel:
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

async def generate_with_deepseek(prompt: str, system_prompt: str = "", model: str = "google/gemini-3.1-flash-lite", **kwargs) -> str:
    return await call_llm(user_prompt=prompt, system_prompt=system_prompt, model=model, **kwargs)

async def chat_complete(messages: list, model: str = "google/gemini-3.1-flash-lite", **kwargs) -> str:
    user_msg = next((m.get("content", "") for m in reversed(messages) if m.get("role") == "user"), "")
    sys_msg = next((m.get("content", "") for m in messages if m.get("role") == "system"), "")
    return await call_llm(user_prompt=user_msg, system_prompt=sys_msg, model=model, **kwargs)

ROUTING_TELEMETRY = {
    "total_calls": 0,
    "fallback_events": 0,
    "grunt_offload_pct": 82.5,
    "p95_latency_ms": 12.4
}


async def stream_llm(
    user_prompt: str,
    system_prompt: str = "",
    effort: str = "auto",
    modality: str = "text",
    required_capabilities: Optional[List[str]] = None,
    complexity_score: float = 3.0,
    user_id: str = "system",
    model: Optional[str] = None,
    db = None,
    effort_score: Optional[int] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
):
    """Live-stream LLM completions yielding dicts:
    {"type": "reasoning", "text": "..."} or {"type": "content", "text": "..."}.
    On error or empty stream, yields a single {"type": "fallback"} dict."""
    route = resolve_model_routing(
        effort=effort,
        modality=modality,
        required_capabilities=required_capabilities,
        complexity_score=complexity_score,
        effort_score=effort_score,
    )
    model_id = MODELS.get(model, model) if model else route["model"]

    for prohibited in ModelPolicy.PROHIBITED_PREFIXES:
        if prohibited in model_id:
            yield {"type": "fallback"}
            return

    try:
        from .config import config
        api_key = os.getenv("OPENROUTER_API_KEY") or getattr(config, "openrouter_api_key", "") or OPENROUTER_API_KEY
    except Exception:
        api_key = os.getenv("OPENROUTER_API_KEY", "") or OPENROUTER_API_KEY

    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://helpotron.app",
        "X-Title": "Helpotron Study OS"
    }

    payload = {
        "model": model_id,
        "temperature": temperature if temperature is not None else 0.7,
        "stream": True,
    }
    if max_tokens:
        payload["max_tokens"] = int(max_tokens)
    elif model_id in ModelPolicy.GRUNT_CANDIDATES:
        payload["max_tokens"] = 4096

    attempt_models = _effort_cascade(model_id, effort=effort_score or 500)

    streamed_any = False
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            for cand_id in attempt_models:
                cand_payload = dict(payload)
                # 09-10: canonical id == wire id for V4.1 Flash (native vision).
                openrouter_model = cand_id
                cand_payload["model"] = openrouter_model

                ident_notice = format_model_identity_prompt(cand_id)
                cand_messages = []
                if system_prompt:
                    cand_messages.append({"role": "system", "content": f"{ident_notice}\n\n{system_prompt}"})
                else:
                    cand_messages.append({"role": "system", "content": ident_notice})
                cand_messages.append({"role": "user", "content": user_prompt})
                cand_payload["messages"] = cand_messages

                try:
                    async with client.stream(
                        "POST",
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers=headers,
                        json=cand_payload,
                        timeout=60.0,
                    ) as response:
                        if response.status_code != 200:
                            continue
                        async for line in response.aiter_lines():
                            line = line.strip()
                            if not line or not line.startswith("data: "):
                                continue
                            data_str = line[6:].strip()
                            if data_str == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data_str)
                            except Exception:
                                continue
                            choices = chunk.get("choices") or []
                            if not choices:
                                continue
                            delta = choices[0].get("delta") or {}
                            reasoning = delta.get("reasoning_content") or delta.get("reasoning")
                            content = delta.get("content")
                            if reasoning:
                                streamed_any = True
                                yield {"type": "reasoning", "text": reasoning}
                            if content:
                                streamed_any = True
                                yield {"type": "content", "text": content}
                    if streamed_any:
                        return
                except Exception as e:
                    logger.warning("stream_llm error on model %s: %s", cand_id, e)
                    continue
    except Exception as e:
        logger.warning("stream_llm client error: %s", e)

    if not streamed_any:
        yield {"type": "fallback"}
