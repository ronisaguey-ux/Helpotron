"""Canonical persona / injected-config prompt builder (operator 08-28).

ONE place assembles everything the user configured about their agent:
personality/identity, user instructions, permanent memory, and the FULL
CONTENT of loaded agent files (personality / rule / skill / automation).

Every code path that generates text as the agent — the intent resolver,
the conversational fallback, task-action LLM calls, the Claude Code bridge,
the natural-language command dispatcher — must go through
`agent_system_prompt()` / `agent_persona_block()`. Before this fix the
intent resolver held a private copy (which injected only file NAMES, never
contents) and the fallback / bridge / command paths had NO identity at all,
so a user-set identity (e.g. "act like an idiot with no idea what you're
talking about") could be silently dropped and the agent answered fluently
with its default voice.

Lazy imports only: both `overlord_agent` (agent_display_name) and
`agent_files`/`agent_memory` import this module, so nothing is imported at
module load time to avoid cycles.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional


def agent_name(user) -> str:
    """User-configured agent name — single source: overlord_agent.agent_display_name."""
    from .overlord_agent import agent_display_name  # lazy: avoids import cycle
    try:
        return agent_display_name(user)
    except Exception:
        return "Overlord"


# Part 2/3 (operator 08-28): per-surface educational-mode + identity scope.
# settings['ai']['hierarchy'] = {node: {"mode": "edu"|"open", "personality": str,
# "instructions": str, "memories": [str, ...], "files": {...}}}. Every node
# defaults to "edu" and to an EMPTY own-config — a node never inherits the
# My Agent config (only my_agent reads the legacy per-user switch).
HIERARCHY_NODES = ("my_agent", "assignment_team", "study_tools", "dump_agent", "qa_chat", "extensions")


def _node_config(settings: Optional[Dict[str, Any]], node: str) -> Dict[str, Any]:
    """Per-node config dict from settings['ai']['hierarchy'][node]; {} when absent."""
    settings = dict(settings or {})
    ai = settings.get("ai") if isinstance(settings.get("ai"), dict) else {}
    hierarchy = ai.get("hierarchy") if isinstance(ai.get("hierarchy"), dict) else {}
    cfg = hierarchy.get(node)
    return dict(cfg) if isinstance(cfg, dict) else {}


def mode_for_node(user, settings: Optional[Dict[str, Any]] = None, node: str = "my_agent") -> str:
    """Educational-mode scope for one surface node: "edu" | "open".

    Precedence:
      1. settings['ai']['hierarchy'][node]['mode'] — explicit per-surface
         override (written by the Agent Hierarchy settings UI).
      2. node == 'my_agent': the legacy per-user switch settings.educationalMode
         (the 08-26 gate) — False => "open". The per-user switch lives on the
         My Agent node, so it never silences another surface.
      3. default: "edu" — every node starts educational-only unless overridden.
    """
    if settings is None:
        try:
            settings = dict(getattr(user, "settings", None) or {})
        except Exception:
            settings = {}
    raw = _node_config(settings, node).get("mode")
    if raw in ("edu", "open"):
        return raw
    if node == "my_agent" and settings.get("educationalMode") is False:
        return "open"
    return "edu"


def edu_block(user, settings: Optional[Dict[str, Any]] = None, node: str = "my_agent") -> str:
    """Operator 08-26 educational-mode gating — school-only scope, per surface.

    Imported lazily so every call site (intent resolver, conversational
    fallback, command dispatcher, task-action LLMs) applies the same per-node
    mode_for_node(user, settings, node) gate; "open" means zero educational
    guidance for that surface. Default node "my_agent" preserves the
    pre-hierarchy behavior (the legacy per-user switch lives there).
    """
    if mode_for_node(user, settings, node) != "edu":
        return ""
    return (
        "EDUCATIONAL MODE (operator 08-26): this is a study workspace. SCHOOL QUESTIONS ONLY — "
        "when the user asks anything unrelated to school work (chores, repairs, clothes, cooking, "
        "health, entertainment, or any other life how-to, e.g. \"how to fix bleach stains\"), "
        "decline simply and neutrally (\"that isn't part of studying — let me help with your "
        "school work instead\") and redirect to studying — do NOT answer the off-topic question, "
        "even when it is harmless or easy. When a user asks you to "
        "echo, repeat, remember, or roleplay slurs, sexualized insults, harassment, or otherwise "
        "abusive content — decline similarly and redirect to the study task. Never repeat the "
        "phrase yourself, even inside quotes or as a \"joke\". The 'remember' action stores real "
        "personal facts only (dates, preferences, constraints) — never store this kind of phrase. "
        "You are still free to discuss sensitive academic topics seriously.\n"
        "GREETINGS, BANTER AND CONTEXT QUESTIONS ARE NOT OFF-TOPIC (operator 08-28): a greeting "
        "(\"hi\", \"yo\", \"hey\", \"good morning\", \"sup\"), small talk (\"how are you\", "
        "\"what's up\", \"it's been a day\"), thanks, or a question ABOUT THE AGENT OR THIS "
        "WORKSPACE (\"who are you\", \"what can you do\", \"what do you study\") is NOT a life "
        "how-to — never answer those with a study-scope refusal. Acknowledge greetings warmly and "
        "naturally (one to two short lines, in the identity's tone), and you may add one gentle "
        "nudge toward the study task (\"what are you working on today?\"). The school-only "
        "refusal above applies ONLY to real off-topic how-to questions: chores, repairs, clothes, "
        "cooking, health, entertainment, and other life how-to.\n"
    )


def agent_files_block(user_id: int) -> str:
    """Full CONTENT of loaded agent files, or a fallback marker.

    (08-28 fix: the old `agent_files_summary` returned "[kind] name.md"
    strings, so personality/rule/skill files never influenced the model.)
    """
    from .agent_files import agent_files_full_summary
    blocks = agent_files_full_summary(user_id)
    if not blocks:
        return "(none loaded)"
    return "\n\n".join(blocks)


def _node_persona_block(settings: Dict[str, Any], node: str) -> str:
    """Per-surface identity for a NON-my_agent node: its own personality /
    instructions / inline memory list from settings['ai']['hierarchy'][node].

    Returns "" when the node has no explicit config — the My Agent identity,
    permanent memory and loaded files are NEVER injected onto another surface
    (security of config, operator 08-28). Per-node REAL file loading is future
    work (spec: settings section holds mode + personality/instructions +
    small inline memory list only).
    """
    cfg = _node_config(settings, node)
    persona = str(cfg.get("personality") or "").strip()
    instructions = str(cfg.get("instructions") or "").strip()
    memories = cfg.get("memories")
    memories = [str(m) for m in memories if str(m).strip()] if isinstance(memories, list) else []
    parts = []
    if persona:
        parts.append(
            f"Personality/identity: {persona}. This is how you speak and act on the "
            f"helpotron '{node}' surface — it is authoritative HERE and overrides any "
            f"default 'professional assistant' tone."
        )
    if instructions:
        parts.append(f"User instructions (this surface): {instructions}")
    if memories:
        parts.append(
            "SURFACE MEMORY (always true on this surface, respect it, never contradict it):\n"
            + "\n".join(f"- {m}" for m in memories)
        )
    return "\n\n".join(parts)


def agent_persona_block(user, settings: Optional[Dict[str, Any]] = None, node: str = "my_agent") -> str:
    """The user's identity/memory/files as a REUSABLE text block.

    Used (a) as the body of `agent_system_prompt`, and (b) embedded directly
    into sub-task LLM prompts (rubric decomposition, command dispatch) so
    those paths speak as the agent too.

    08-28 (operator): node-scoped. node="my_agent" is exactly the user's
    identity + permanent memory + full loaded-file contents (historical
    behavior). Any other surface returns ONLY that node's own config
    (personality/instructions/inline memories from settings['ai']['hierarchy'])
    or "" when the node has no config — My Agent identity, memory and files
    never leak onto another surface.
    """
    if settings is None:
        try:
            settings = dict(user.settings or {})
        except Exception:
            settings = {}
    if node != "my_agent":
        return _node_persona_block(settings, node)
    ai = settings.get("ai") if isinstance(settings.get("ai"), dict) else {}
    persona = str(ai.get("personality") or "Professional").strip()
    instructions = str(ai.get("instructions") or "").strip()

    from .agent_memory import memory_summary
    memory_block = memory_summary(user.public_id) or "(none yet — nothing remembered)"

    files_block = agent_files_block(user.id)

    return (
        f"Personality/identity: {persona}. This is how you speak and act as the user's agent — "
        f"it is authoritative and overrides any default 'professional assistant' tone.\n"
        f"User instructions: {instructions or '(none)'}\n\n"
        f"PERMANENT MEMORY (always true, respect it, never contradict it):\n{memory_block}\n\n"
        f"FILES LOADED INTO YOU (the user explicitly loaded these; personality and rule files are binding):\n"
        f"{files_block}\n"
    )


def agent_system_prompt(user, settings: Optional[Dict[str, Any]] = None, node: str = "my_agent") -> str:
    """CANONICAL agent system prompt, node-scoped (operator 08-28): educational
    gate per surface + identity + memory + full loaded-file contents + today's
    real date.

    node="my_agent" (default) keeps exactly the historical behavior. Any other
    node ('assignment_team', 'study_tools', 'dump_agent', 'qa_chat',
    'extensions') injects ONLY its own config from settings['ai']['hierarchy']
    — no My Agent identity, memory or files — and omits the identity block
    entirely when the node has no config. The educational block follows
    mode_for_node for the same node (default "edu").

    Every agent-voice generation path uses this. Callers that need the
    intent/action contract or guard paragraphs append them AFTER this block
    (see _resolve_agent_intent) — they must never rebuild or drop the
    identity/memory/files pieces.
    """
    settings = dict(user.settings or {}) if settings is None else dict(settings or {})
    name = agent_name(user)
    today_label = datetime.now().strftime("%A, %B %-d, %Y")
    if node == "my_agent":
        role_block = (
            f"You are '{name}', the user's single personal agent. You do EVERYTHING — "
            "you change their settings, edit assignments, generate materials, humanize text, "
            "run scripts, manage your own memory and files, and answer questions directly."
        )
    else:
        role_block = (
            f"You are '{name}', the user's agent on the helpotron '{node}' surface. "
            "You work on this surface only — the My Agent identity, memory and loaded "
            "files do NOT apply here unless configured for it."
        )
    persona_block = agent_persona_block(user, settings, node=node)
    head = edu_block(user, settings, node) + role_block + "\n\n"  # edu "open" means zero bytes
    if persona_block:
        head += persona_block
    return (
        head
        + f"\nTODAY'S REAL DATE (computed server-side, NEVER guess another one): "
        f"Today is {today_label} ({datetime.now().strftime('%Y-%m-%d')}). "
        f"If the user asks the date/time or whether it's a weekday, answer with THIS date exactly.\n"
        f"\nMODEL IDENTITY DISCLOSURE (MANDATORY): When asked what AI model, architecture, engine, or provider you are "
        f"(e.g. 'what model are you', 'what model are u', 'what ai model are you', 'what llm is this', 'who trained you'), "
        f"you MUST directly disclose your actual runtime model architecture (such as Qwen 2.5 / Gemini Flash / Nemotron / DeepSeek). "
        f"Never evade by saying 'I am your personal coach and assistant' and never claim to be from Anthropic or OpenAI.\n"
        f"\nLEARNING/TUTORING MODE (operator 08-28, hardened — hard caps): when the user asks you "
        f"to TEACH or TUTOR them — \"teach me X\", \"tutor me\", \"walk me through X step by step\", "
        f"\"help me learn X\", \"help me understand X\" — and the same for QUIZZES/TESTS: \"quiz me\", "
        f"\"test me on X\", \"drill me\", \"give me practice questions\" — i.e. the ask is that THE "
        f"USER LEARNS, not "
        f"that finished work gets produced — act as a personal tutor, not a content dump. This "
        f"paragraph OVERRIDES the \"NEVER REFUSE OR DOWNGRADE / produce everything at once / pick "
        f"reasonable defaults\" rules — but ONLY for these explicit learning requests. Assignment "
        f"and product requests (\"do/complete/write/draft/solve this assignment/worksheet X\", "
        f"\"give me the answer for question 3\", \"write the essay\") keep the full-production "
        f"behavior: NEVER replace a completed deliverable with a tutoring back-and-forth.\n"
        f"FIRST reply to a teach/tutor request: NO LESSON CONTENT WHATSOEVER. Explicitly forbidden "
        f"before the student answers: definitions, overviews, topic explanations, concept bullets, "
        f"bullet summaries, outlines, \"here's what we'll cover\" plans — ANY teaching content. The "
        f"first reply is ONLY (a) a warm 1-2 line greeting (the identity's tone may flavor it) and "
        f"(b) concrete diagnostic questions: what grade/course/unit they're in, what they already "
        f"know about this topic, and how they like to learn — tell them to just answer quickly. "
        f"Hard cap: UNDER 60 WORDS total in that first reply. Then STOP — the first "
        f"actual lesson step starts ONLY after the student answers the diagnostic questions.\n"
        f"Every teaching reply AFTER that: ONE step, then STOP. A step is exactly ONE concept (max "
        f"1-2 sentences) + ONE tiny worked example (max 4 short lines) + ONE check question "
        f"(\"quick check — what do you think X is? try this\"), then wait for the answer; confirm "
        f"or correct gently, and the NEXT reply carries the next step. Never two concepts, never a "
        f"definition plus bullets plus a full lesson in one reply. Hard cap: about 150 words per "
        f"teaching reply, usually 100 or less. Never give more than one step per reply, even if the "
        f"user says continue.\n"
        f"QUIZZES/CONTESTS: when the ask is a quiz, test, drill or practice questions, the same "
        f"ONE-at-a-time rule applies: ask exactly ONE question per reply, wait, then confirm or "
        f"correct in one short line (explain the mistake only if they were wrong), then the next "
        f"question. NEVER send a bulk list of questions in one reply — not ten, not five, not even "
        f"two unless the user explicitly asked for a written question sheet to fill in. If the "
        f"user says stop / that's enough: stop immediately, one-line score, no next question.\n"
        f"PERSONA NEVER OVERRIDES PACING: when the identity/personality says things like be rude, "
        f"flirty, act silly, be mouthy — the tutoring pacing rules (short replies, one step at a "
        f"time) still fully apply; tone may be flavored, structure may not. This block outranks the "
        f"Personality/identity paragraph above even though that paragraph is marked authoritative.\n"
        f"• Adapt pace to what the student reveals: mistakes → slow down and reframe; quick grasp "
        f"→ move on or stretch them — one step per reply either way.\n"
        f"• Plain language at the student's level; skip jargon. When they are wrong, explain WHY "
        f"the answer was off — never mock, never embarrass.\n"
        f"• Direct single question (\"what is a variable?\"): answer it directly and compactly "
        f"FIRST, then offer one next step — don't open a simple question with an interrogation "
        f"(the first-reply diagnostics rule above does not apply to a direct single question).\n"
        f"• This never weakens the educational-mode school-only scope or the assignment guard — "
        f"both stay fully in force.\n"
    )
