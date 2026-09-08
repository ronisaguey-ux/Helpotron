#!/usr/bin/env python3
"""Probe the screen-drive chain end to end, offline, without the running server.

Answers one question: when the user says "type X in the search bar", does the
chain actually produce executable control actions, and if not, WHICH link
breaks?

Links checked, in order:
  1. vision  — analyze_screen_image on a real page screenshot; does it come
     back at all, and does it name coordinates a model could act on?
  2. agent   — the AGENT_MODE_DIRECTIVE + that screen state through the text
     model; does the reply carry a fenced ```control``` block?
  3. harden  — extract_control_actions on that reply; do the ops survive
     validation, or does the whole list drop silently?

Read-only. Touches no database and no running service.

    DATABASE_URL=sqlite:////tmp/probe_$$.db python3 scripts/probe_drive_chain.py [image.png]
"""
from __future__ import annotations

import asyncio
import base64
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/probe_drive_chain.db")

DEFAULT_IMAGE = ROOT / "verify-artifacts" / "typefix-drive-target.png"
USER_TEXT = "type applejack cereal in the search bar"


def rule(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


async def main() -> int:
    img_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_IMAGE
    if not img_path.exists():
        print(f"image not found: {img_path}")
        return 2

    from server.screen_vision import (
        analyze_screen_image,
        extract_control_actions,
        resolve_vision_model,
    )
    from server.routes_extension import AGENT_MODE_DIRECTIVE

    b64 = base64.b64encode(img_path.read_bytes()).decode()
    viewport = {"width": 1280, "height": 800}

    for effort in (100, 500, 800):
        model_id, tier, score = resolve_vision_model(effort)
        rule(f"EFFORT {effort} -> vision model {model_id} (tier {tier})")

        # 1. vision
        try:
            analysis = await analyze_screen_image(
                b64, width=viewport["width"], height=viewport["height"], model_id=model_id
            )
            vision_ok = bool(analysis and analysis.strip())
        except Exception as e:  # same fail-closed contract as agent_chat
            analysis, vision_ok = f"<EXCEPTION> {type(e).__name__}: {e}", False

        print(f"[1 vision] ok={vision_ok} chars={len(analysis or '')}")
        print((analysis or "")[:1200])
        if not vision_ok:
            print("[1 vision] BROKEN LINK — agent_chat would say 'Vision analysis "
                  "unavailable this turn' and the model would have no coordinates.")
            continue

        # 2. agent: exactly what agent_chat puts on the system prompt.
        system = (
            AGENT_MODE_DIRECTIVE
            + "\n\nCURRENT SCREEN (this exact turn — the frames the extension just captured):\n"
            + f"[Screen state] {analysis.strip()} (viewport 1280x800)"
        )
        from server.llm import call_llm

        try:
            reply = await call_llm(
                USER_TEXT, system_prompt=system, effort="auto",
                effort_score=effort, user_id="probe",
            )
        except Exception as e:
            print(f"[2 agent] BROKEN LINK — call_llm raised {type(e).__name__}: {e}")
            continue

        has_fence = "```control" in (reply or "")
        print(f"[2 agent] chars={len(reply or '')} control_fence_present={has_fence}")
        print((reply or "")[:1500])

        # 3. harden
        clean, actions = extract_control_actions(reply or "", viewport)
        print(f"[3 harden] actions={'None (WHOLE LIST DROPPED)' if actions is None else len(actions)}")
        if actions:
            for a in actions:
                print(f"           {a}")
        else:
            print("[3 harden] BROKEN LINK — nothing executes, yet the fence is "
                  "stripped from the reply, so the user still reads the prose "
                  "claiming the action happened.")
        print(f"[3 harden] reply shown to user: {clean[:300]!r}")

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
