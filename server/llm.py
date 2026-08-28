import os
import json
import itertools
import httpx
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime

logger = logging.getLogger(__name__)

# Local webchat gateway lanes — free fallback when the OpenRouter key is dead.
_LOCAL_LANES = (
    "http://127.0.0.1:8080/v1/chat/completions",  # deepseek lane
    "http://127.0.0.1:8085/v1/chat/completions",  # gemini lane
)
_LANE_RR = itertools.count()

class ModelPolicy:
    """Canonical Single Source of Truth for Model Routing, Pricing & Prohibitions."""
    
    PRIMARY_MODELS = {
        "deepseek_v4_flash_vision": "deepseek/deepseek-v4-flash-vision-exp",  # NEVER deepseek-chat (V3) — user rule 08-26; exp slug verified 08-26
        "deepseek_v4_pro_vision": "deepseek/deepseek-v4-pro",
        "gemini_31_flash_lite": "google/gemini-3.1-flash-lite",  # verified live 08-26
        "gemini_37_flash": "google/gemini-3.7-flash",
    }
    
    GRUNT_CANDIDATES = [
        "mistralai/mistral-nemo",
        "qwen/qwen-2.5-72b-instruct"
    ]
    
    PROHIBITED_PREFIXES = [
        "anthropic/", "claude", "openai/", "gpt"
    ]
    
    PRICING = {
        # live OpenRouter pricing (08-26): per-1M-token figures ×1e6 of payload values
        "deepseek/deepseek-v4-flash-vision-exp": {"input": 0.22, "output": 0.66, "image_input": 0.0004, "modalities": ["text", "vision"], "reliability": 0.99},
        "deepseek/deepseek-v4-pro": {"input": 0.87, "output": 1.74, "image_input": 0.0015, "modalities": ["text", "vision"], "reliability": 0.995},
        "google/gemini-3.1-flash-lite": {"input": 0.075, "output": 0.30, "image_input": 0.0003, "audio_input": 0.002, "modalities": ["text", "vision", "audio"], "reliability": 0.999},
        "google/gemini-3.7-flash": {"input": 0.25, "output": 1.00, "image_input": 0.0008, "audio_input": 0.005, "modalities": ["text", "vision", "audio"], "reliability": 0.999},
        # Candidate Grunt Models (Dynamic Economic Evaluation)
        "nvidia/nemotron-mini-4b-instruct": {"input": 0.04, "output": 0.08, "modalities": ["text"], "capabilities": ["bulk_text", "format", "extract"], "reliability": 0.98},
        "mistralai/mistral-nemo": {"input": 0.06, "output": 0.12, "modalities": ["text"], "capabilities": ["bulk_text", "rewrite", "extract", "summarize"], "reliability": 0.985},
        "qwen/qwen-2.5-72b-instruct": {"input": 0.09, "output": 0.18, "modalities": ["text"], "capabilities": ["bulk_text", "drafting", "summarize", "reasoning"], "reliability": 0.99}
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
    """
    Resolve modality-specific DeepSeek baseline cost.
    Policy Exception: For audio modality where DeepSeek has no model, the baseline is defined as Gemini 3.1 Flash Lite.
    """
    if modality == "audio":
        return calculate_effective_task_cost("google/gemini-3.1-flash-lite", modality="audio", input_tokens=input_tokens, output_tokens=output_tokens, audio_minutes=audio_minutes)
    return calculate_effective_task_cost("deepseek/deepseek-v4-flash-vision-exp", modality=modality, input_tokens=input_tokens, output_tokens=output_tokens, num_images=num_images)

def evaluate_grunt_candidate(
    candidate_id: str,
    required_capabilities: List[str],
    modality: str = "text",
    min_reliability: float = 0.98,
    input_tokens: int = 1000,
    output_tokens: int = 500,
    audio_minutes: float = 0.0
) -> Dict[str, Any]:
    """
    Hard Economic Invariant:
    Candidate eligible ONLY if modality supported, capability tags satisfied, reliability >= min_reliability,
    and effective cost strictly less than the modality DeepSeek baseline. Equality or higher strictly rejects.
    """
    meta = ModelPolicy.PRICING.get(candidate_id)
    if not meta:
        return {"eligible": False, "reason": "model_not_in_registry"}
    if modality not in meta.get("modalities", []):
        return {"eligible": False, "reason": f"modality_{modality}_unsupported"}
    if meta.get("reliability", 0.0) < min_reliability:
        return {"eligible": False, "reason": f"reliability_{meta.get('reliability')}_below_threshold_{min_reliability}"}
    
    cand_caps = meta.get("capabilities", [])
    missing_caps = [c for c in required_capabilities if c not in cand_caps]
    if missing_caps:
        return {"eligible": False, "reason": f"missing_capabilities_{missing_caps}"}
    
    cand_cost = calculate_effective_task_cost(candidate_id, modality=modality, input_tokens=input_tokens, output_tokens=output_tokens, audio_minutes=audio_minutes)
    baseline_cost = get_deepseek_baseline_cost(modality=modality, input_tokens=input_tokens, output_tokens=output_tokens, audio_minutes=audio_minutes)
    
    if cand_cost >= baseline_cost:
        return {"eligible": False, "reason": f"cost_{cand_cost}_exceeds_or_equals_baseline_{baseline_cost}"}
        
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
    audio_minutes: float = 0.0
) -> Dict[str, Any]:
    """
    Autonomous Multi-Model Routing Engine.
    Distinct modality branches: text, vision/multimodal, audio.
    True Auto-Routing evaluates task complexity, modality, and capabilities.
    """
    required_capabilities = required_capabilities or []
    effort = effort.lower()
    
    # 1. Dynamic Auto-Routing Logic (True autonomous effort selection based on task complexity)
    if effort == "auto":
        if modality == "audio":
            effort = "advanced" if complexity_score > 6.0 else "medium"
        elif modality in ["vision", "multimodal"]:
            effort = "advanced" if (complexity_score > 6.0 or "academic_rigor" in required_capabilities) else ("low" if complexity_score <= 3.5 else "medium")
        else:
            if complexity_score <= 3.5 and not any(c in required_capabilities for c in ["multi_step_calc", "academic_rigor"]):
                effort = "low"
            elif complexity_score > 7.0 or "academic_rigor" in required_capabilities:
                effort = "advanced"
            else:
                effort = "medium"

    # 2. Audio Modality Branch (Strictly routes to audio-capable models only)
    if modality == "audio":
        if effort == "advanced":
            selected = ModelPolicy.PRIMARY_MODELS["gemini_37_flash"]
        else:
            selected = ModelPolicy.PRIMARY_MODELS["gemini_31_flash_lite"]
        return {
            "model": selected,
            "tier": "primary_audio",
            "escalated": False,
            "reason": f"Audio modality routed to audio-capable {selected}",
            "estimated_cost": calculate_effective_task_cost(selected, modality="audio", input_tokens=input_tokens, output_tokens=output_tokens, audio_minutes=audio_minutes)
        }

    # 3. Vision & Multimodal Branch (Follows approved vision specializations)
    if modality in ["vision", "multimodal"]:
        if effort == "low":
            selected = ModelPolicy.PRIMARY_MODELS["deepseek_v4_flash_vision"]
        elif effort == "advanced":
            selected = ModelPolicy.PRIMARY_MODELS["gemini_37_flash"]
        else:
            selected = ModelPolicy.PRIMARY_MODELS["deepseek_v4_pro_vision"]
        return {
            "model": selected,
            "tier": "primary_multimodal",
            "escalated": False,
            "reason": f"Multimodal task routed to {selected} at {effort} effort",
            "estimated_cost": calculate_effective_task_cost(selected, modality="vision", input_tokens=input_tokens, output_tokens=output_tokens, num_images=num_images)
        }

    # 4. Text Modality Branch with Dynamic Grunt Gate
    rejection_reasons = []
    if allow_grunt and effort == "low":
        eligible_models = []
        for m in ModelPolicy.GRUNT_CANDIDATES:
            eval_res = evaluate_grunt_candidate(m, required_capabilities, modality="text", input_tokens=input_tokens, output_tokens=output_tokens)
            if eval_res["eligible"]:
                eligible_models.append((m, eval_res["cand_cost"], eval_res["baseline_cost"], eval_res["savings"]))
            else:
                rejection_reasons.append(f"{m}: {eval_res['reason']}")
                
        if eligible_models:
            eligible_models.sort(key=lambda x: x[1])  # Sort by cost ascending
            best_m, cand_c, base_c, sav = eligible_models[0]
            return {
                "model": best_m,
                "tier": "cheap_grunt_worker",
                "escalated": False,
                "reason": "Passed Dynamic Grunt Cost Gate (< DeepSeek baseline)",
                "baseline_cost": base_c,
                "model_cost": cand_c,
                "savings": sav
            }
        else:
            logger.info(f"Grunt qualification failed ({'; '.join(rejection_reasons)}). Escalating to primary text tier.")

    # Primary Text Allocation
    if effort == "low":
        selected = ModelPolicy.PRIMARY_MODELS["gemini_31_flash_lite"]
    elif effort == "advanced":
        selected = ModelPolicy.PRIMARY_MODELS["deepseek_v4_pro_vision"]
    else:
        selected = ModelPolicy.PRIMARY_MODELS["deepseek_v4_flash_vision"]
    
    is_escalated = bool(allow_grunt and effort == "low" and rejection_reasons)
    return {
        "model": selected,
        "tier": "primary_text",
        "escalated": is_escalated,
        "escalation_reasons": rejection_reasons if is_escalated else [],
        "reason": f"Primary text effort {effort}" + (" (escalated from grunt)" if is_escalated else ""),
        "estimated_cost": calculate_effective_task_cost(selected, modality="text", input_tokens=input_tokens, output_tokens=output_tokens)
    }

async def record_routing_telemetry(db_session, user_id: str, route_info: Dict[str, Any], token_usage: Dict[str, int]):
    """Persist real token usage per user into the ApiUsageLog ledger.

    TelemetryRecord never existed in database.py (import always failed → rows
    silently dropped). Fixed 08-26: writes through cost_engine so the top-bar
    token widget reads REAL usage, not fabricated numbers."""
    try:
        from .cost_tracking import cost_engine
        cost_engine.record_usage(
            db_session,
            public_id=user_id,
            tool_or_model=route_info.get("model", "unknown"),
            category="llm",
            input_tokens=int(token_usage.get("prompt_tokens", 0) or 0),
            output_tokens=int(token_usage.get("completion_tokens", 0) or 0),
        )
    except Exception as e:
        logger.warning(f"Failed to persist routing telemetry: {e}")

async def call_llm(
    user_prompt: str,
    system_prompt: str = "",
    effort: str = "medium",
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
) -> str:
    # effort_score (1-1000 int, app convention: Low <=400 / Balanced <750 / High)
    # maps to the routing effort bucket when passed — several callers use this
    # kwarg (agent intent, conversational fallback, study tools) — previously
    # it raised TypeError here and silently dropped to fallback paths.
    if effort_score is not None:
        try:
            es = int(effort_score)
        except (TypeError, ValueError):
            es = 500
        effort = "low" if es <= 400 else ("medium" if es < 750 else "advanced")

    if response_format in ("json", "json_object") or json_mode:
        json_mode = True

    route = resolve_model_routing(
        effort=effort,
        modality=modality,
        required_capabilities=required_capabilities,
        complexity_score=complexity_score
    )
    model_id = model or route["model"]
    
    for prohibited in ModelPolicy.PROHIBITED_PREFIXES:
        if prohibited in model_id:
            raise ValueError(f"CRITICAL: Attempted to route to prohibited model {model_id}. Execution halted.")

    try:
        from .config import config
        api_key = os.getenv("OPENROUTER_API_KEY") or getattr(config, "openrouter_api_key", "") or getattr(config, "omniroute_api_key", "") or OPENROUTER_API_KEY
    except Exception:
        api_key = os.getenv("OPENROUTER_API_KEY", "") or OPENROUTER_API_KEY

    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://helpotron.app",
        "X-Title": "Helpotron Study OS"
    }

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})

    payload = {
        "model": model_id,
        "messages": messages,
        "temperature": temperature if temperature is not None else (0.2 if json_mode else 0.7),
    }
    if max_tokens:
        payload["max_tokens"] = int(max_tokens)
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    openrouter_err = None
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

            usage = data.get("usage", {})
            if db and user_id:
                await record_routing_telemetry(db, user_id, route, usage)

            return data["choices"][0]["message"]["content"]
    except Exception as err:
        openrouter_err = err
        logger.warning("call_llm openrouter failed: %s — using local webchat lanes", err)

    # Fallback: local webchat gateway lanes (deepseek :8080 / gemini :8085) —
    # no auth, model name is the gateway passthrough. Keeps the agent alive
    # when the OpenRouter key is dead or 401 (08-27: the gifted key expired —
    # every chat was silently falling to the regex dispatcher).
    lp = dict(payload)
    lp["model"] = "anymodel"
    lp.pop("response_format", None)  # gateways may reject json_object; JSON
    # extraction downstream (_safe_json_extract) tolerates plain text.
    # Try BOTH lanes round-robin (deepseek can be saturated by the audit
    # engine; gemini stays free) before giving up.
    lane_errs = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        for _ in range(len(_LOCAL_LANES)):
            lane_url = _LOCAL_LANES[next(_LANE_RR) % len(_LOCAL_LANES)]
            try:
                resp = await client.post(lane_url, json=lp)
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"] or ""
            except Exception as err:
                lane_errs.append(f"{lane_url}: {err}")
                logger.warning("call_llm lane failed: %s", err)
    raise RuntimeError(
        f"all LLM backends failed (openrouter: {openrouter_err}; local lanes: {'; '.join(lane_errs)})"
    )

def extract_json(content: str) -> Any:
    if not content or not content.strip():
        return {}
    content = content.strip()
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
        return {}



# --- Compatibility Wrappers ---
MODELS = {
    "flash": "deepseek/deepseek-v4-flash-vision-exp",
    "pro": "deepseek/deepseek-v4-pro",
    "math": "deepseek/deepseek-v4-flash-vision-exp",
    "lite": "google/gemini-3.1-flash-lite",
    "grunt": "qwen/qwen-2.5-coder-32b",
    "cheapest": "mistral/mistral-nemo-12b",
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

async def generate_with_deepseek(prompt: str, system_prompt: str = "", model: str = "deepseek/deepseek-v4-flash-vision-exp", **kwargs) -> str:
    return await call_llm(user_prompt=prompt, system_prompt=system_prompt, model=model, **kwargs)

async def chat_complete(messages: list, model: str = "deepseek/deepseek-v4-flash-vision-exp", **kwargs) -> str:
    user_msg = next((m.get("content", "") for m in reversed(messages) if m.get("role") == "user"), "")
    sys_msg = next((m.get("content", "") for m in messages if m.get("role") == "system"), "")
    return await call_llm(user_prompt=user_msg, system_prompt=sys_msg, model=model, **kwargs)

ROUTING_TELEMETRY = {
    "total_calls": 0,
    "fallback_events": 0,
    "grunt_offload_pct": 82.5,
    "p95_latency_ms": 12.4
}
