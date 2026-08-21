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
    if not content:
        return None
    content = content.strip()
    match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', content)
    if match:
        content = match.group(1).strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        try:
            start_bracket = content.find('[')
            end_bracket = content.rfind(']')
            if start_bracket != -1 and end_bracket != -1 and end_bracket > start_bracket:
                return json.loads(content[start_bracket : end_bracket + 1])
            start_brace = content.find('{')
            end_brace = content.rfind('}')
            if start_brace != -1 and end_brace != -1 and end_brace > start_brace:
                return json.loads(content[start_brace : end_brace + 1])
        except Exception:
            pass
    return None

async def call_llm(
    system_prompt: str,
    user_prompt: str,
    model: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,
    response_format: Optional[str] = None
) -> str:
    """Async robust LLM caller with multi-model fallback cascade and exponential backoff."""
    api_key = getattr(config, 'OPENROUTER_API_KEY', None) or getattr(config, 'DEEPSEEK_API_KEY', None)
    base_url = getattr(config, 'OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1')
    
    models_cascade = [
        model or getattr(config, 'DEFAULT_MODEL', 'anthropic/claude-3.5-sonnet'),
        'openai/gpt-4o-mini',
        'deepseek/deepseek-chat'
    ]
    
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://helpotron.com',
        'X-Title': 'Helpotron Automator'
    }
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        for target_model in models_cascade:
            for attempt in range(3):
                try:
                    payload = {
                        'model': target_model,
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
