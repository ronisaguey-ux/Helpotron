#!/usr/bin/env python3
"""Generate an AI essay with a real LLM, for testing the humanizer end to end.

Deliberately an ordinary prompt with no instructions to sound human — the point is
to produce the kind of essay an AI detector flags at 100%, because that is the
input the engine has to be judged on.

Key comes from $OPENROUTER_API_KEY, or helpotron's .env if that is absent. Never
printed.
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "deepseek/deepseek-v4.1-flash"


def api_key() -> str:
    k = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if k:
        return k
    env = pathlib.Path(os.environ.get("OPENROUTER_ENV", "/home/roni/Roni_workspace/helpotron/.env"))
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if line.startswith("OPENROUTER_API_KEY"):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no OpenRouter key found")


PROMPT = (
    "Write a 500-word argumentative essay answering this exam question:\n\n"
    "  'Is social media making us less able to hold a real conversation? "
    "Argue your case.'\n\n"
    "Write it as a finished exam answer. Do not add a title, headings, notes or "
    "commentary. Return only the essay text."
)


def main() -> int:
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "ai_essay.txt"
    body = json.dumps({
        "model": MODEL,
        # Generous: this model spends output tokens on `reasoning` first, and a
        # tight cap gets consumed entirely by thinking, leaving content null with
        # finish_reason "length" (measured: 1200 tokens, all reasoning_tokens,
        # zero essay). The budget has to cover the thinking AND the answer.
        "max_tokens": 8000,
        "temperature": 0.7,
        "messages": [{"role": "user", "content": PROMPT}],
    }).encode()
    req = urllib.request.Request(
        ENDPOINT,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key()}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        d = json.load(r)
    msg = d["choices"][0]["message"]
    text = (msg.get("content") or "").strip()
    if not text:
        finish = d["choices"][0].get("finish_reason")
        raise SystemExit(
            f"model returned no content (finish_reason={finish}); "
            "raise max_tokens — the budget went to reasoning"
        )
    out.write_text(text + "\n")
    words = len(text.split())
    print(f"wrote {out}  ({words} words)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
