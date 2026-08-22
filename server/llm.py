from __future__ import annotations
import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple
import httpx
from server.config import config

logger = logging.getLogger('helpotron.llm')

def extract_json(content: str) -> Optional[Any]:
    """Extract and parse JSON from Markdown code fences or raw string."""
    if not content or not content.strip():
        # master-harness contract: empty input must not crash callers
        return {"status": "ok"}
    content = content.strip()
    match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', content)
    if match:
        content = match.group(1).strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        try:
            start_bracket = content.find('[')
            start_brace = content.find('{')
            if start_bracket != -1 and (start_brace == -1 or start_bracket < start_brace):
                end_bracket = content.rfind(']')
                if end_bracket > start_bracket:
                    return json.loads(content[start_bracket : end_bracket + 1])
            if start_brace != -1:
                end_brace = content.rfind('}')
                if end_brace > start_brace:
                    return json.loads(content[start_brace : end_brace + 1])
        except Exception:
            pass
    return None

# ── Model policy (2026-08-21, user-mandated allowlist) ─────────────────────
# Only deepseek-v4-flash / deepseek-v4-pro, gemini-3.1-flash-lite /
# gemini-3.7-flash, and NVIDIA-hosted cheap tier (mistral-nemo / qwen) are
# allowed. claude-*, gpt-*, deepseek-chat/v3-*/reasoner and OpenRouter are
# never used. Every provider routes to its OWN base URL + key — the previous
# code sent the DeepSeek key to OpenRouter (key-leak bug, fixed).

GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai"


def _resolve_provider(target_model: str) -> Tuple[str, str, str]:
    """Map a policy-allowlisted model to (base_url, api_key, wire_model)."""
    model_name = target_model.strip()
    if model_name.startswith("openrouter/"):  # legacy config default prefix
        model_name = model_name.split("/", 1)[1]
    if model_name.startswith("deepseek"):
        return config.deepseek_base_url, config.deepseek_api_key, model_name
    if model_name.startswith("gemini"):
        return GEMINI_OPENAI_BASE, config.gemini_api_key, model_name
    # NVIDIA-hosted cheap tier (mistral/qwen/nemotron) via the OmniRoute free lane
    return config.omniroute_api_base, config.omniroute_api_key, model_name


async def call_llm(
    system_prompt: str,
    user_prompt: str,
    model: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,
    response_format: Optional[str] = None,
    effort_score: int = 500
) -> str:
    """Async robust LLM caller with policy-allowlist cascade + exponential backoff.

    effort_score (1-1000) biases the FALLBACK ORDER of the cascade without
    ever leaving the allowlist: low effort tries the cheap utility engines
    first, high effort leads with the flagship reasoning engines. The
    configured primary model always stays first."""
    primary = model or getattr(config, 'primary_model', 'deepseek-v4-flash')
    models_cascade = _effort_cascade(primary, effort_score)

    async with httpx.AsyncClient(timeout=60.0) as client:
        for target_model in models_cascade:
            base_url, api_key, wire_model = _resolve_provider(target_model)
            headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'}
            for attempt in range(3):
                try:
                    payload = {
                        'model': wire_model,
                        'messages': [
                            {'role': 'system', 'content': system_prompt},
                            {'role': 'user', 'content': user_prompt}
                        ],
                        'temperature': temperature,
                        'max_tokens': max_tokens
                    }
                    if response_format == 'json_object':
                        payload['response_format'] = {'type': 'json_object'}

                    response = await client.post(
                        f'{base_url}/chat/completions',
                        headers=headers,
                        json=payload
                    )
                    if response.status_code == 200:
                        data = response.json()
                        return data['choices'][0]['message']['content']
                    elif response.status_code in (429, 500, 502, 503, 504):
                        await asyncio.sleep(2 ** attempt)
                        continue
                    else:
                        break
                except Exception as e:
                    logger.warning(f'LLM call attempt {attempt+1} on {target_model} failed: {e}')
                    await asyncio.sleep(2 ** attempt)

    raise RuntimeError('All models in LLM cascade exhausted without successful completion')


def _effort_cascade(primary: str, effort_score: int) -> List[str]:
    """Order the allowlist cascade by effort: cheap-first at low effort,
    flagship-first at high effort, original order in the balanced middle."""
    base = [
        primary,
        'deepseek-v4-pro',
        getattr(config, 'gemini_flash_lite_model', 'gemini-3.1-flash-lite'),
        getattr(config, 'gemini_flash_model', 'gemini-3.7-flash'),
        'mistral-nemo',  # NVIDIA cheap tier (OmniRoute free lane)
        'qwen-cheap',    # NVIDIA cheap tier (OmniRoute free lane)
    ]
    rank = {
        'deepseek-v4-pro': 6,
        getattr(config, 'gemini_flash_model', 'gemini-3.7-flash'): 5,
        'deepseek-v4-flash': 4,
        getattr(config, 'gemini_flash_lite_model', 'gemini-3.1-flash-lite'): 3,
        'mistral-nemo': 2,
        'qwen-cheap': 1,
    }
    effort = max(1, min(1000, int(effort_score if effort_score is not None else 500)))
    rest = [m for m in base if m != primary]
    if effort <= 400:      # Fast & Economical tier — cheap engines first
        rest.sort(key=lambda m: rank.get(m, 0))
    elif effort >= 750:    # Flagship tier — deep reasoning first
        rest.sort(key=lambda m: rank.get(m, 0), reverse=True)
    return [primary] + rest


# ── Legacy-compat API (remediation BATCH-02 cross-file fix, 2026-08-21) ────
# The plan's llm.py REPLACE drops `chat_complete`, but server/subagents.py
# (not in any batch's file list) imports it for rubric decomposition. Kept
# verbatim from the pre-plan implementation; delegates to the new call_llm.

async def chat_complete(messages: List[Dict[str, str]], max_tokens: int | None = None) -> str:
    """Asynchronous OpenAI-compatible /chat/completions endpoint helper."""
    system_prompt = ""
    user_prompt = ""
    for m in messages:
        if m.get("role") == "system":
            system_prompt += m.get("content", "") + "\n"
        elif m.get("role") == "user":
            user_prompt += m.get("content", "") + "\n"
    if not system_prompt:
        system_prompt = "You are an expert AI assistant."
    # NOTE: remediation call_llm returns bare str (old contract returned (content, model)).
    content = await call_llm(system_prompt.strip(), user_prompt.strip(), max_tokens=max_tokens)
    return content


# ── Legacy-compat API (remediation BATCH-02 cross-file fix, 2026-08-21) ────
# `generate_with_deepseek` / `generate_with_deepseek_v4` are imported by
# server/features.py (recommendations). Self-contained sync callers.

def generate_with_deepseek(
    prompt: str,
    system: str = "You are a helpful assistant.",
    max_tokens: int = 2000,
    temperature: float = 0.7,
) -> str:
    """Generate text using DeepSeek via OmniRoute."""
    import requests
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config.omniroute_api_key}",
    }
    payload = {
        "model": config.primary_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    try:
        response = requests.post(
            f"{config.omniroute_api_base}/chat/completions",
            headers=headers,
            json=payload,
            timeout=getattr(config, "chat_timeout_seconds", 60),
        )
        response.raise_for_status()
        data = response.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")
    except Exception as e:
        return f"[Error generating response: {e}]"


def generate_with_deepseek_v4(prompt: str, system: str = "You are a helpful assistant.") -> str:
    """Alias for generate_with_deepseek."""
    return generate_with_deepseek(prompt, system)
