"""LLM client — DeepSeek V4 Flash (free) via the local OmniRoute proxy, with
fallback rotation on failure. Mirrors the oculus parallel_agents pattern:
OpenRouter-compatible /chat/completions, per-model cooldown on failure,
JSON extraction helpers.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional

import httpx
import requests

from .config import config

logger = logging.getLogger(__name__)

# per-model failure cooldown (seconds)
_cooldowns: dict[str, float] = {}
# per-model consecutive failure counter
_health: dict[str, int] = {}

MAX_MODEL_HEALTH = 4
COOLDOWN_SECONDS = 300  # 5 min


def _candidates() -> list[str]:
    chain = [config.primary_model, *getattr(config, "fallback_models", ["mimo-v2.5-free", "nemotron-3-ultra-free"])]
    live = [m for m in chain if _health.get(m, 0) < MAX_MODEL_HEALTH]
    return live or chain[:1]


def _mark_failed(model: str) -> None:
    _health[model] = _health.get(model, 0) + 1
    _cooldowns[model] = time.time()
    logger.warning("LLM model %s marked failed (health=%d)", model, _health[model])


def _in_cooldown(model: str) -> bool:
    return time.time() - _cooldowns.get(model, 0.0) < COOLDOWN_SECONDS


async def call_llm(system_prompt: str, user_prompt: str, max_tokens: int | None = None) -> tuple[str, str]:
    """Returns (content, model_used). Rotates through the fallback chain.

    NOTE: the local OmniRoute proxy returns EMPTY content when max_tokens is
    set small (< ~256); omit it entirely unless a real cap is needed.
    """
    headers = {}
    if config.omniroute_api_key:
        headers["Authorization"] = f"Bearer {config.omniroute_api_key}"

    candidates = [m for m in _candidates() if not _in_cooldown(m)] or _candidates()[:1]
    last_error = ""

    for attempt, model in enumerate(candidates[:3]):
        payload: dict = {
            "model": model,
            "stream": False,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        try:
            timeout = getattr(config, "chat_timeout_seconds", 60)
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    f"{config.omniroute_api_base}/chat/completions",
                    json=payload,
                    headers=headers,
                )
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                actual = data.get("model", model)
                logger.info("LLM ok via %s (-> %s), %d chars", model, actual, len(content))
                return content, actual
            last_error = f"HTTP {resp.status_code}"
            _mark_failed(model)
            if resp.status_code == 429:
                await asyncio.sleep(min(20 + attempt * 10, 45))
        except Exception as e:  # timeout, connection refused, etc.
            last_error = str(e)
            _mark_failed(model)
        if attempt < 2:
            await asyncio.sleep(1.5 * (2 ** attempt))

    raise RuntimeError(f"LLM exhausted fallbacks: {last_error}")


def extract_json(text: str) -> dict | None:
    """Lenient JSON extraction (fenced blocks, pythonic literals, bare objects)."""
    text = text.strip().replace("True", "true").replace("False", "false").replace("None", "null")
    if (text.startswith("{") and text.endswith("}")) or (text.startswith("[") and text.endswith("]")):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
    # Handle ```json ... ``` and ``` ... ``` fenced blocks
    for pattern in (r"```json\s*\n?([\s\S]*?)\n?\s*```", r"```\s*\n?([\s\S]*?)\n?\s*```"):
        m = re.search(pattern, text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(1).strip())
            except json.JSONDecodeError:
                continue
    m = re.search(r"\[.*\]", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return None


def generate_with_deepseek(
    prompt: str,
    system: str = "You are a helpful assistant.",
    max_tokens: int = 2000,
    temperature: float = 0.7,
) -> str:
    """Generate text using DeepSeek via OmniRoute."""
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
    content, _ = await call_llm(system_prompt.strip(), user_prompt.strip(), max_tokens=max_tokens)
    return content

