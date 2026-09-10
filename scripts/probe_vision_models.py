#!/usr/bin/env python3
"""Call each candidate vision model once with a real page screenshot.

Reports, per model: reachable / empty / HTTP error, and whether the analysis
actually names pixel coordinates (the thing the drive chain needs). Used to
pick working slugs for the four screen-vision tiers.

    DATABASE_URL=sqlite:////tmp/probe_$$.db python3 scripts/probe_vision_models.py
"""
from __future__ import annotations

import asyncio
import base64
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/probe_vision_models.db")

# The three wire slugs the screen-vision tiers actually call (see
# screen_vision.VISION_MODEL_TIERS). No other model belongs here: gemini is
# pinned to 3.1-flash-lite + 3.8-flash, and openai/anthropic are barred
# outright by llm.ModelPolicy.PROHIBITED_PREFIXES.
CANDIDATES = [
    "google/gemini-3.1-flash-lite",
    "deepseek/deepseek-v4.1-flash",
    "google/gemini-3.8-flash",
]

IMAGE = ROOT / "verify-artifacts" / "typefix-drive-target.png"
PROMPT = ("Describe this browser tab faithfully: text, layout, buttons, fields, "
          "and where things are (estimated pixel coordinates). "
          "(Image is a 1280x800 pixel screen capture.)")


async def probe(client, headers, model: str, data_url: str) -> str:
    payload = {
        "model": model,
        "temperature": 0.2,
        "max_tokens": 700,
        "messages": [
            {"role": "system", "content": "You are a screen-vision analyst."},
            {"role": "user", "content": [
                {"type": "text", "text": PROMPT},
                {"type": "image_url", "image_url": {"url": data_url}},
            ]},
        ],
    }
    try:
        r = await client.post("https://openrouter.ai/api/v1/chat/completions",
                              headers=headers, json=payload)
    except Exception as e:
        return f"TRANSPORT  {type(e).__name__}: {e}"
    if r.status_code != 200:
        return f"HTTP {r.status_code}  {r.text[:160]}"
    content = (r.json().get("choices") or [{}])[0].get("message", {}).get("content")
    if not isinstance(content, str) or not content.strip():
        return "EMPTY      model returned no content"
    coords = len(re.findall(r"\[?\b\d{2,4}\s*,\s*\d{2,4}\b\]?", content))
    return f"OK         {len(content)} chars, {coords} coordinate pairs\n           {content.strip()[:220]}"


async def main() -> int:
    import httpx
    from server.config import config

    api_key = os.getenv("OPENROUTER_API_KEY") or getattr(config, "openrouter_api_key", "")
    if not api_key:
        print("no OPENROUTER_API_KEY")
        return 2
    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://helpotron.app",
        "X-Title": "Helpotron Study OS",
    }
    data_url = "data:image/png;base64," + base64.b64encode(IMAGE.read_bytes()).decode()

    async with httpx.AsyncClient(timeout=90.0) as client:
        for m in CANDIDATES:
            res = await probe(client, headers, m, data_url)
            print(f"{m:42s} {res}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
