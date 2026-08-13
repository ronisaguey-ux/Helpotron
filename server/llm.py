"""LLM client wrapper for DeepSeek and OmniRoute."""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

import requests

from .config import config


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
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")
    except Exception as e:
        return f"[Error generating response: {e}]"


def generate_with_deepseek_v4(prompt: str, system: str = "You are a helpful assistant.") -> str:
    """Alias for generate_with_deepseek."""
    return generate_with_deepseek(prompt, system)
