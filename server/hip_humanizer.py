"""HIP humanizer — base-model de-paraphrasing (arXiv 2605.19516).

WHY THIS REPLACES THE OLD REWRITE PATH
--------------------------------------
The previous gate rewrote drafts with `call_llm`, i.e. an *instruction-tuned*
model. Measured here: that scores **100% AI on GPTZero** no matter how well it
hits the surface metrics. So does every other rewrite approach tried — a
prompt-only rulebook that hit 10/11 measured targets, style-matching against 32
real human essays, and the deterministic 56-parameter engine.

The reason is that a detector fires on the **RLHF / instruction-tuning fingerprint
encoded in a model's weights**, and that fingerprint is fixed at *generation*. No
rewrite of a finished text can remove it, because the text was already shaped by
whatever produced it.

HIP takes a **base model** — no instruction tuning, therefore no RLHF layer — and
gives it one narrow skill by LoRA fine-tuning: turn an AI-style paraphrase back
into human-style prose. Measured: **1% AI on GPTZero**, against 100% for every
instruction-tuned arm.

THE FORMAT IS NOT A CHAT TEMPLATE
---------------------------------
This is the detail that costs an hour if missed. HIP trains and infers on PLAIN
TAGGED text, reproduced verbatim from upstream `src/hip/prompts.py`:

    <source_text>
    {the AI text}
    </source_text>

    <target_text>

The model continues from there and closes with `</target_text>`. Feeding it a
chat-formatted prompt produces garbage: measured, it lists websites, emits
"Rephrased:" scaffolding, or echoes few-shot examples.

So this module speaks **raw completion** (`/v1/completions`) where the backend
offers it, and falls back to a single-message chat call for backends that only
expose `/v1/chat/completions`.

DIRECTION IS KNOWN, NOT GUESSED
-------------------------------
The released training manifest names the contract:

    "input_column":  "paraphrased_text"   ->  the AI text
    "target_column": "text"               ->  the human text

so this is a de-paraphraser, not a general writer.

CONFIG (environment, matching the rest of the server)
-----------------------------------------------------
    HIP_ENDPOINT   base URL, e.g. http://127.0.0.1:8080/v1
    HIP_MODEL      model id to request (default: the merged HIP model)
    HIP_API_KEY    bearer token, if the backend needs one
    HIP_ROUNDS     iterative rounds (default 1 — see note below)
    HIP_TIMEOUT    per-request seconds (default 180)

ROUNDS. Upstream defaults to 10. Measured at 1.7B, round 1 is already the
strongest on surface metrics and later rounds drift the meaning further without
gaining detector headroom, so the default here is 1 and rounds are opt-in.
"""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Optional

import aiohttp

logger = logging.getLogger("helpotron.hip")

# What the last rewrite could not repair and an agent must fix by hand. A module-level
# box rather than a changed return type, because hip_humanize is on a live chat's critical
# path and every existing caller expects a plain string.
_LAST_REVIEW_TODOS: dict = {"items": []}


def review_todos() -> list:
    """Facts from the LAST rewrite that need an agent's hand, and why.

    Empty means the rewrite was faithful and safe to use as-is.
    """
    return list(_LAST_REVIEW_TODOS.get("items") or [])

# The preservation guard: a rewrite that changes the FACTS is discarded and the
# original kept. See text_preservation.py for the measured fabrications behind it.
from .text_preservation import (  # noqa: E402
    agent_todo,
    check_preservation,
    repair_quotes,
)

# Load the repo .env ourselves rather than relying on server.llm having been
# imported first: "someone else already called load_dotenv" is an invisible
# ordering dependency, and getting it wrong makes hip_configured() silently
# return False (measured) — which turns HIP off with no error anywhere.
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)
except Exception:  # dotenv is optional; real env vars still work
    pass

# ── config ────────────────────────────────────────────────────────────────
# 8099, not 8080: a node process already owns 8080 on this box.
DEFAULT_ENDPOINT = "http://127.0.0.1:8099/v1"
DEFAULT_MODEL = "rs3ystems/hip-humanizer-qwen3-1.7b"


def _cfg(name: str, default: str) -> str:
    return (os.getenv(name) or default).strip()


def hip_configured() -> bool:
    """True when a HIP backend is configured. The gate degrades to the old path
    when this is False, so a missing endpoint can never break a chat."""
    return bool(_cfg("HIP_ENDPOINT", ""))


def hip_endpoint() -> str:
    return _cfg("HIP_ENDPOINT", DEFAULT_ENDPOINT).rstrip("/")


def hip_model() -> str:
    return _cfg("HIP_MODEL", DEFAULT_MODEL)


def hip_rounds() -> int:
    try:
        return max(1, int(_cfg("HIP_ROUNDS", "1")))
    except ValueError:
        return 1


def hip_timeout() -> float:
    try:
        return max(10.0, float(_cfg("HIP_TIMEOUT", "180")))
    except ValueError:
        return 180.0


# ── the prompt format, verbatim from upstream src/hip/prompts.py ──────────

def build_source_target_prompt(source_text: str) -> str:
    """The exact format HIP was trained on. Do not 'improve' this."""
    return (
        "<source_text>\n"
        f"{str(source_text or '').strip()}\n"
        "</source_text>\n\n"
        "<target_text>\n"
    )


def clean_generated_text(text: str) -> str:
    """Strip the tags HIP wraps its answer in. Verbatim upstream."""
    cleaned = str(text or "").strip()
    if cleaned.startswith("<target_text>"):
        cleaned = cleaned[len("<target_text>"):].lstrip()
    if "</target_text>" in cleaned:
        cleaned = cleaned.split("</target_text>", 1)[0].rstrip()
    return cleaned.strip()


# ── the call ──────────────────────────────────────────────────────────────

async def _post(session: aiohttp.ClientSession, url: str, payload: dict,
                headers: dict, timeout: float) -> Optional[dict]:
    try:
        async with session.post(url, json=payload, headers=headers,
                                timeout=aiohttp.ClientTimeout(total=timeout)) as r:
            if r.status != 200:
                body = await r.text()
                logger.warning("HIP %s -> HTTP %s: %s", url, r.status, body[:200])
                return None
            return await r.json()
    except Exception as e:
        logger.warning("HIP request failed (%s): %s", url, type(e).__name__)
        return None


async def _one_round(text: str, session: aiohttp.ClientSession) -> Optional[str]:
    """One de-paraphrase pass. Returns None on any failure — never raises."""
    prompt = build_source_target_prompt(text)
    headers = {"Content-Type": "application/json"}
    key = _cfg("HIP_API_KEY", "")
    if key:
        headers["Authorization"] = f"Bearer {key}"

    base = hip_endpoint()
    model = hip_model()
    to = hip_timeout()

    # Raw completion first: this is what HIP was trained on. A chat template is
    # applied by every /chat/completions backend and measurably degrades the
    # output, so it is only the fallback.
    payload = {
        "model": model,
        "prompt": prompt,
        "max_tokens": 1024,
        "temperature": 1.0,
        "top_p": 0.95,
    }
    data = await _post(session, f"{base}/completions", payload, headers, to)
    if data:
        try:
            raw = data["choices"][0]["text"]
        except (KeyError, IndexError, TypeError):
            raw = ""
        out = clean_generated_text(raw)
        if out:
            return out
        logger.info("HIP raw completion returned nothing usable; trying chat form")

    payload = {
        "model": model,
        "max_tokens": 1024,
        "temperature": 1.0,
        "top_p": 0.95,
        "messages": [{"role": "user", "content": prompt}],
    }
    data = await _post(session, f"{base}/chat/completions", payload, headers, to)
    if not data:
        return None
    try:
        raw = data["choices"][0]["message"].get("content") or ""
    except (KeyError, IndexError, TypeError):
        return None
    return clean_generated_text(raw) or None


# ── Local energy metering (owner 2026-09-17) ─────────────────────────────────
# "every single process, from humanizing ... EVERYTHING costs tokens". HIP runs
# on this box, so its upstream API cost is zero — but it is not free: it burns
# real CPU. Measuring that CPU time and pricing it as electricity is what makes
# humanizing a *measured* cost rather than an arbitrary minimum, and it scales
# correctly when the model, the round count or the hardware changes.
#
# Calibrated on this box (HP ENVY 13, i7-8550U, 4 threads), measured 2026-09-17:
#   a 252-word essay = 363.5 CPU-seconds, ~1.75 kJ, ~$0.00009 at 18.27 c/kWh
#   -> 1752 J / 363.5 CPU-s = 4.82 J per CPU-second
# which matches the CPU's published thin-chassis behaviour (a ~29 W burst for
# ~25 s, then ~15 W sustained). Electricity is trivially cheap here; the point is
# that the cost is real, attributed, and proportional to the work done.
JOULES_PER_CPU_SECOND = 4.82
USD_PER_KWH = 0.1827          # EIA STEO, Aug 2026 US residential average
_JOULES_PER_KWH = 3_600_000.0


def _hip_server_cpu_seconds() -> Optional[float]:
    """Total CPU seconds burned by the HIP backend process so far.

    The generation happens in a separate llama-server process, so timing this
    request would miss it entirely — read the server's own counters instead.
    Returns None when the pid cannot be determined, so the caller falls back to
    the minimum charge rather than inventing a number.
    """
    import subprocess
    try:
        out = subprocess.run(
            ["pgrep", "-f", "llama-server"],
            capture_output=True, text=True, timeout=2,
        ).stdout.split()
        if not out:
            return None
        total = 0.0
        ticks = os.sysconf("SC_CLK_TCK")
        for pid in out:
            try:
                with open(f"/proc/{pid}/stat", "r") as fh:
                    parts = fh.read().rsplit(") ", 1)[-1].split()
                total += (int(parts[11]) + int(parts[12])) / ticks
            except Exception:
                continue
        return total or None
    except Exception:
        return None


def _record_hip_energy(cpu_seconds: float) -> None:
    """Put this humanization's electricity cost in the ledger. Never raises."""
    if cpu_seconds <= 0:
        return
    try:
        joules = cpu_seconds * JOULES_PER_CPU_SECOND
        usd = joules / _JOULES_PER_KWH * USD_PER_KWH
        from .metering import record_service_cost
        record_service_cost(
            service="humanizer:hip",
            cost_usd=usd,
            units=cpu_seconds,
            metadata={"cpu_seconds": round(cpu_seconds, 2), "joules": round(joules, 1)},
            category="humanizer",
        )
    except Exception:
        pass


# ★ CHUNK LIMIT (owner 2026-09-28): *"add a char limit to humanizing so big humanization tasks
# are done in chunks, cuz we know that doing it paragraph by paragraph yeilds better results and
# longer ones generate junk"*.
#
# This is measured, not a preference. Humanizing a 321-word, 5-paragraph biography as ONE string
# silently LOST THE ENTIRE CONCLUDING PARAGRAPH and merged everything into one block; at 3 rounds
# it repeated "John Locke" 15 times and invented a quotation, and at 5 rounds it invented a
# claim about someone's liver. Per paragraph, all 5 paragraphs survived with both real
# quotations intact. **A base model's context is where the junk comes from**, so the fix is to
# never hand it more than one paragraph's worth.
#
# Chunking also makes a failure VISIBLE: a paragraph can be compared against its own input,
# where a document total hides one paragraph being dropped while another bloats.
HIP_MAX_CHUNK_CHARS = int(os.environ.get("HIP_MAX_CHUNK_CHARS", "1200"))


def chunk_text(text: str, max_chars: int = 0) -> list:
    """Split prose into chunks no larger than `max_chars`, preferring paragraph boundaries.

    Paragraphs first (a blank line is the author's own idea of where the thought ends), then
    sentences inside any paragraph still over the limit. A caller gets back the pieces in
    order; rejoining with a blank line reproduces the original structure.

    Deliberately does NOT split mid-sentence: cutting a sentence in half guarantees the model
    completes it badly, which is the very junk this exists to avoid.
    """
    limit = max_chars or HIP_MAX_CHUNK_CHARS
    body = (text or "").strip()
    if not body:
        return []
    if len(body) <= limit:
        return [body]

    import re as _re
    paragraphs = [p.strip() for p in _re.split(r"\n\s*\n", body) if p.strip()]
    chunks: list = []
    for para in paragraphs:
        if len(para) <= limit:
            chunks.append(para)
            continue
        # Too big even alone — fall back to sentence boundaries.
        sentences = _re.split(r"(?<=[.!?])\s+", para)
        buf = ""
        for sentence in sentences:
            candidate = f"{buf} {sentence}".strip() if buf else sentence
            if buf and len(candidate) > limit:
                chunks.append(buf.strip())
                buf = sentence
            else:
                buf = candidate
        if buf.strip():
            chunks.append(buf.strip())
    return chunks


async def _humanize_chunk(chunk: str, session, rounds: int) -> Optional[str]:
    """Rewrite ONE chunk, repairing any factual damage before it is accepted.

    Returns the rewritten chunk, or None if it could not be improved — a None means "keep the
    original for this chunk", which is the safe direction for anything factual.
    """
    current = chunk
    for i in range(rounds):
        out = await _one_round(current, session)
        if not out:
            break
        # A round that collapses is discarded rather than fed forward.
        if len(out.split()) < 0.5 * len(current.split()):
            logger.info("HIP round %s shrank %sw -> %sw; discarding",
                        i + 1, len(current.split()), len(out.split()))
            break
        # ★ THE PRESERVATION GUARD. A "humanizer" that invents facts is not a style tool, it is
        # a misinformation tool — measured on a real job: two fabricated Locke quotations
        # (77w -> 155w) and a fabricated death date that was WRONG.
        #
        # ★ REPAIR, DO NOT REGENERATE. Owner: *"Instead of discarding humanized text cuz it
        # invented fake quotes just make sure the ai agents that are using the humanize tool
        # just edit the quote manually, regenerating everytime they fake a quote is a never
        # ending cat and mouse chase"*. Asking again is an independent draw with no memory of
        # the last failure; restoring the source's exact wording is DETERMINISTIC. So an
        # invented or altered quotation is repaired IN PLACE here, and anything unsafe to
        # auto-edit (invented numbers, dates, names) is left for the agent with an instruction
        # — never silently mangled.
        verdict = check_preservation(current, out)
        if not verdict["ok"]:
            fix = repair_quotes(current, out)
            if fix["edits"]:
                logger.info("HIP round %s repaired: %s", i + 1,
                            ", ".join(e["action"] for e in fix["edits"]))
            todos = agent_todo(current, out)
            if todos:
                logger.warning("HIP round %s needs agent review: %s",
                               i + 1, "; ".join(todos)[:200])
                _LAST_REVIEW_TODOS["items"].extend(todos)
            out = fix["text"]
            if not out.strip():
                break
        current = out
    return current if current != chunk else None


async def hip_humanize(text: str, rounds: Optional[int] = None) -> Optional[str]:
    """Humanize `text` with HIP, ONE CHUNK AT A TIME.

    Returns the rewritten text, or None if HIP is unconfigured or nothing could be improved. A
    None return means "leave the draft alone" — this function is on the critical path of a live
    chat and must never raise or return an empty string.

    ★ CHUNKED, because a whole document produces junk and loses content. See
    HIP_MAX_CHUNK_CHARS for the measurements. Each chunk is rewritten and fact-checked on its
    own, then the pieces are rejoined with a blank line so the original paragraph structure
    survives.
    """
    if not hip_configured():
        return None
    text = (text or "").strip()
    if len(text) < 40:
        return None

    rounds = rounds or hip_rounds()
    _LAST_REVIEW_TODOS["items"] = []   # never report the PREVIOUS run's todo list
    chunks = chunk_text(text)
    if not chunks:
        return None

    cpu_before = _hip_server_cpu_seconds()
    rewritten: list = []
    changed = False
    try:
        async with aiohttp.ClientSession() as session:
            for idx, chunk in enumerate(chunks):
                if len(chunks) > 1:
                    logger.info("HIP chunk %s/%s (%s chars)", idx + 1, len(chunks), len(chunk))
                out = await _humanize_chunk(chunk, session, rounds)
                if out:
                    changed = True
                    rewritten.append(out)
                else:
                    # Untouched is the honest outcome for a chunk the model could not improve
                    # without damaging it — dropping it would silently delete the paragraph.
                    rewritten.append(chunk)
    except Exception as e:
        logger.warning("HIP humanize failed: %s", type(e).__name__)
        return None

    # Bill the electricity this run actually consumed (owner: everything costs tokens).
    # Recorded only when the rewrite produced something, and only when the backend's CPU
    # counters could be read.
    cpu_after = _hip_server_cpu_seconds()
    if cpu_before is not None and cpu_after is not None and cpu_after >= cpu_before:
        _record_hip_energy(cpu_after - cpu_before)

    if not changed:
        return None
    return "\n\n".join(rewritten)


async def hip_health() -> dict:
    """Cheap liveness probe for the settings UI / diagnostics."""
    if not hip_configured():
        return {"configured": False}
    headers = {"Content-Type": "application/json"}
    key = _cfg("HIP_API_KEY", "")
    if key:
        headers["Authorization"] = f"Bearer {key}"
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(f"{hip_endpoint()}/models", headers=headers,
                             timeout=aiohttp.ClientTimeout(total=10)) as r:
                return {"configured": True, "status": r.status,
                        "endpoint": hip_endpoint(), "model": hip_model()}
    except Exception as e:
        return {"configured": True, "status": None,
                "endpoint": hip_endpoint(), "error": type(e).__name__}
