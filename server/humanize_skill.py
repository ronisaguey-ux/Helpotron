"""Unified AI-humanizer skill (operator 08-30, requested via ops research).

Combines the rulebooks of THREE public agent skills into one deduplicated
static rulebook the model follows whenever the per-surface "humanizer"
setting is ON:

  * harshaneel/humanize      — 9 linguistic levers (burstiness, hedge surgery,
    structural flattening, …) + ai-check signal categories + voice matching
  * blader/humanizer         — 35 structural patterns (Wikipedia "Signs of AI
    writing" catalog) + multi-pass audit + factual-integrity guardrails
  * Shirhussain/humanize     — 36-pattern catalog (P1–P36) + register
    awareness + generation/rewrite modes + pattern-density linter

`humanizer_block(settings, ctx)` returns "" unless the skill is enabled —
agent_system_prompt() appends the block, so every agent-voice generation
path obeys the rulebook when enabled. Hierarchy (operator 08-31: global,
subject, assignment — the settings scope chain, NOT agent surfaces):

  settings["ai"]["humanizer"]              = "on" | "off"   (global)
  settings["scoped"]["ai.humanizer"]       = [{id, scope:{level,ref}, value}]
      level "subject" / "assignment", value "on" | "off"   (overrides)

Most-specific scope wins (mirrors ScopedSetting.resolveScopedValue):
assignment > subject > global. An optional `ctx` ({assignment, subject})
carries the real context of the current chat (assignment-bubble chats know
both; the main chat has neither, so only the global setting applies there).
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

# ─── The unified rulebook (static — no external calls, no detectors) ─────────
HUMANIZER_RULEBOOK = """\
HUMANIZER RULEBOOK (rule-based, static): rewrite or generate prose so it reads
like a real person wrote it. Follow every section; the audit-revise loop runs
before delivery.

0. BOUNDS (highest priority)
- These are statistical signals, not proof: one em dash or one triad is fine;
  the DENSITY of patterns is what outs AI text. Explicit user requests
  (bullets, an em dash, a structure) override any rule here.
- FACT SAFEGUARD: never invent names, numbers, dates, quotes or citations. A
  missing detail -> ask, or write without it. Numbers, names and quotes from
  the source stay VERBATIM — never re-word them for style. File edits touch
  prose only; code, data and link targets are left alone.
- REGISTER: what "human" means changes by context. Contractions and sentence
  fragments are natural in chat/social/informal copy; forbidden in formal
  essays and reports. Detect the register, or use the one the user asked for.
- VOICE CALIBRATION: if 2-3 paragraphs of the user's own writing are supplied,
  derive style hypotheses (sentence rhythm, vocabulary, punctuation habits,
  transitions, what they never do) and match them. Otherwise match register
  defaults. Quoted text by third parties is not rewritten.

1. AUDIT-REVISE LOOP (always, before delivery)
Rewrite without treating the original structure as fixed. Re-read the draft
against every section here AND the original claims (facts preserved?). Fix
anything still tripping a rule. When pasting interactively, show the first
rewrite plus a short critique of what still sounds artificial before the
final version.

2. RLHF / INSTRUCTION-TUNING VOICE STRIP (do this first)
- Cut greeting-acknowledgment openers ("That's a great question!", "Great
  question!", "Absolutely!") — answer directly.
- Cut closers ("I hope this helps!", "Let me know if you need anything
  else!"), and unsolicited offers ("Would you like me to expand on this?").
- Cut unprompted balanced tradeoffs ("On the other hand...", "It depends on
  your needs") and polite hedging the user didn't ask for.
- Cut knowledge-limit disclaimers ("While details are limited...",
  "As of my last update") — cite the real source/date or say what is known.
- Cut fake-candid openings ("Honestly?", "Let's be real"), formulaic sayings
  ("Symmetry is the language of trust"), announcing the next point ("Let's
  dive in"), compulsive summaries ("In conclusion", "To summarize" — give the
  actual recommendation).

3. VOCABULARY — plain equivalents
- Banned/cliche words, replace with concrete language: delve, leverage
  (verb), robust, streamline, comprehensive, seamless, cutting-edge, pivotal,
  foster, facilitate, testament, landscape (metaphor), showcasing, "gated
  on", "quietly", "well-positioned", "industry-leading", "game-changer",
  "significantly" (use the number).
- Filler rewrites: "in order to" -> "to"; "due to the fact that" ->
  "because"; "it is important to note that" -> state it; "a wide range of" ->
  the actual list; "in today's fast-paced world", "at the end of the day"
  -> cut.
- Hedging stacks: "could potentially possibly help reduce" -> "may reduce";
  too many qualifiers -> one honest qualifier.
- Copula avoidance: "serves as the foundation" -> "is the foundation";
  "features/boasts/nestled in" -> "is/has".
- Synonyms cycling for one subject (protagonist/main character/hero) -> one
  name + pronouns; deliberate repetition is preserved.

4. SENTENCE RHYTHM (burstiness)
- One sentence of 6 words or fewer per ~150 words of output. Never three
  consecutive sentences within 5 words of each other in length. Long
  sentences only when the compound thought genuinely can't split.
- Break forced triads ("innovation, inspiration, and insights") — as many
  items as the meaning needs. Kill staccato-drama fragments ("One warehouse.
  Two weeks. Zero errors.") — plain narrative sentence.
- Uniform rhythm, echo restatement ("wastes hours / loses time / eats the
  workday") -> one concrete cost.

5. STRUCTURE FLATTENING
- Bullet-itis -> prose unless the user asked for a list; keep at most one
  list where content is genuinely list-shaped. Bold mini-headings inside a
  paragraph ("**Performance:** ...") -> prose. Term-colon bullets
  ("**Scalability:** grows with...") -> prose or a real bullet.
- Skeleton overkill: a short text with four headed sections -> three
  paragraphs. Heading that restates its own section -> let the heading do the
  work. Write about the CURRENT behavior, not about what replaced it.

6. HONESTY & SPECIFICITY — ground every claim
- Inflated importance ("pivotal moment", "the evolution of X") -> plain
  factual statement; "Despite challenges... continues to thrive" -> keep the
  facts, drop the pitch; "The future looks bright" -> end with a fact or a
  sourced plan.
- Vague attribution ("Experts believe", "Studies show") -> name the real
  source or delete. Name-dropping ("cited in NYT, BBC, FT") -> keep only
  sourced, useful context. Placeholders ("[Company]") -> real names.
- False ranges ("from startups to global enterprises") -> the actual
  segments; "from the Big Bang to dark matter" -> the actual topics.
- Shallow -ing analysis ("symbolizing / reflecting / showcasing") -> keep
  only what the source supports. Sales language ("nestled within the
  breathtaking region") -> plain descriptive facts.
- Answering objections nobody raised and "A tempting option would be..."
  -> cut the invented alternative; keep real caveats.

7. PUNCTUATION & TYPE
- Em dashes: hard budget of one per ~200 words; the double-em-dash wrapping
  pattern ("a—pattern—that reads") is banned; prefer periods, commas, colons,
  parentheses. Short texts: prefer zero.
- Semicolons -> periods, except in lists whose items contain commas. Every
  colon must follow a grammatically complete sentence.
- Curly quotes -> straight; one style, consistent. Emojis -> remove.
  Title-case headings -> sentence case. Excessive hyphenated pairs
  ("cross-functional, data-driven, client-facing") -> keep only
  grammar-required hyphens. Bold: at most one or two per text; never bold
  ordinary words mid-sentence.

8. DISCOURSE & VOICE
- Cut formal transition junk ("Furthermore", "Moreover", "In addition to the
  above", "It is clear that", "This highlights the importance of") — assert
  directly.
- People use first person, occasional second person, mild rhetorical
  questions as transitions, and mid-thought self-correction ("—well, that
  is—", "or rather"). In casual registers, contractions and fragments are
  normal; in formal registers, they are not.
- Passive without an actor ("No configuration file needed") -> name the actor
  where it helps ("You don't need to configure anything").
- Real writing has partial logical jumps and one-off asides — but never
  sacrifice correctness or introduce contradictions.

9. SELF-CHECK (before delivering)
Re-score the draft against every section; rewrite any remaining violation.
Verify every number, name and quote matches the source. If an ai-check /
detector report was supplied before the rewrite, address every flag it
raised — that is the acceptance list."""


def _scoped_value(settings: Dict[str, Any], path: str, ctx: Optional[Dict[str, Any]]) -> Optional[Any]:
    """Most-specific-wins scoped variant (assignment > subject), mirroring
    ScopedSetting.resolveScopedValue. None when no variant matches the ctx."""
    scoped = settings.get("scoped") if isinstance(settings.get("scoped"), dict) else {}
    variants = scoped.get(path)
    if not isinstance(variants, list):
        return None
    for level, ref in (("assignment", ctx.get("assignment") if ctx else None),
                       ("subject", ctx.get("subject") if ctx else None)):
        if not ref:
            continue
        for v in variants:
            if not isinstance(v, dict) or not isinstance(v.get("scope"), dict):
                continue
            scope = v["scope"]
            if scope.get("level") == level and str(scope.get("ref") or "") == str(ref):
                return v.get("value")
    return None


def _scoped_on_off(settings: Dict[str, Any], path: str, ctx: Optional[Dict[str, Any]]) -> Optional[bool]:
    """Scoped variant converted to a boolean (on/off/true/false/1/0), or None
    when no variant matches the ctx."""
    raw = _scoped_value(settings, path, ctx)
    if raw is None:
        return None
    raw = str(raw).strip().lower()
    return raw in ("on", "true", "1", "yes")


def humanizer_enabled(settings: Optional[Dict[str, Any]], node: str = "my_agent",
                      ctx: Optional[Dict[str, Any]] = None) -> bool:
    """Effective humanizer state for one generation context.

    Precedence (operator 08-31 — global/subject/assignment, the settings
    scope chain): a scoped variant matching the ctx (assignment first, then
    subject), then the AI & Intelligence global toggle settings['ai']
    ['humanizer'], then OFF. The old per-hierarchy-node override layer was
    dropped at the operator's request — surfaces are not the hierarchy.
    """
    settings = dict(settings or {})
    scoped_hit = _scoped_on_off(settings, "ai.humanizer", ctx)
    if scoped_hit is not None:
        return scoped_hit
    ai = settings.get("ai") if isinstance(settings.get("ai"), dict) else {}
    raw = str(ai.get("humanizer") or "off").strip().lower()
    return raw in ("on", "true", "1", "yes")


def humanizer_block(settings: Optional[Dict[str, Any]], node: str = "my_agent",
                    ctx: Optional[Dict[str, Any]] = None) -> str:
    """The rulebook block to append to a surface's system prompt, or "" when off."""
    if not humanizer_enabled(settings, node, ctx):
        return ""
    return (
        "\nHUMANIZER SKILL (operator setting: ON): the user enabled the "
        "AI-humanizer here. Apply it to every piece of prose you generate or "
        "rewrite in this chat:\n\n"
        + HUMANIZER_RULEBOOK
        + "\n"
    )


# ─── AI Detection Standard (operator 08-31) ─────────────────────────────────
# Bob's spec: expose the plugged-in AI detectors in AI & Intelligence plus a
# minimum human score rate (e.g. "must be above 70% human"); when a finished
# reply misses the standard, it is redone until it passes. Hierarchy is the
# same global/subject/assignment scope chain as the humanizer.
#
#   settings["ai"]["detection"]["enabled"]        "on" | "off"  (scoped-able)
#   settings["ai"]["detection"]["min_human"]      int 0-100      (scoped-able)
#   settings["ai"]["detection"]["detectors"]      {name: bool}   (global)
#       names are detector-registry keys: "sapling", "winston_ai", "pangram".
# The two free heuristic scorers (perplexity cadence, burstiness) always run.

DETECTOR_DISPLAY = {
    "sapling": "Sapling",
    "winston_ai": "Winston AI",
    "pangram": "Pangram",
}

# 08-31 (operator): Sapling + Pangram only for now — Winston is expensive
# (1 credit per word; bulk-buy later after cash flow). Same values as the
# service defaults so settings without a detectors dict get this set.
DETECTOR_DEFAULTS = {"sapling": True, "winston_ai": False, "pangram": True}


def detection_enabled(settings: Optional[Dict[str, Any]], node: str = "my_agent",
                      ctx: Optional[Dict[str, Any]] = None) -> bool:
    """Detection standard is ON for this context: scoped variant wins over the
    global toggle; default OFF."""
    settings = dict(settings or {})
    scoped_hit = _scoped_on_off(settings, "ai.detection.enabled", ctx)
    if scoped_hit is not None:
        return scoped_hit
    ai = settings.get("ai") if isinstance(settings.get("ai"), dict) else {}
    det = ai.get("detection") if isinstance(ai.get("detection"), dict) else {}
    raw = str(det.get("enabled") or "off").strip().lower()
    return raw in ("on", "true", "1", "yes")


def detection_min_human(settings: Optional[Dict[str, Any]], node: str = "my_agent",
                        ctx: Optional[Dict[str, Any]] = None, default: int = 70) -> int:
    """Minimum acceptable human score (0-100): scoped variant wins, then the
    global setting, then the default."""
    settings = dict(settings or {})
    scoped_hit = _scoped_value(settings, "ai.detection.min_human", ctx)
    if scoped_hit is not None:
        try:
            return max(0, min(100, int(scoped_hit)))
        except (TypeError, ValueError):
            pass
    ai = settings.get("ai") if isinstance(settings.get("ai"), dict) else {}
    det = ai.get("detection") if isinstance(ai.get("detection"), dict) else {}
    try:
        return max(0, min(100, int(det.get("min_human") or default)))
    except (TypeError, ValueError):
        return default


def detection_detectors(settings: Optional[Dict[str, Any]]) -> list:
    """Enabled API detector names (registry keys). Toggle entries win; missing
    entries fall back to DETECTOR_DEFAULTS (sapling+pangram — Winston is off
    until the account is topped up). An empty list still enforces with the two
    in-process heuristic scorers only."""
    settings = dict(settings or {})
    ai = settings.get("ai") if isinstance(settings.get("ai"), dict) else {}
    det = ai.get("detection") if isinstance(ai.get("detection"), dict) else {}
    cfg = det.get("detectors") if isinstance(det.get("detectors"), dict) else {}
    return [name for name in DETECTOR_DISPLAY if cfg.get(name, DETECTOR_DEFAULTS.get(name, True))]


async def ensure_human_standard(text: str, settings: Optional[Dict[str, Any]],
                                node: str = "my_agent", ctx: Optional[Dict[str, Any]] = None,
                                db=None, user_id: str = "system") -> Tuple[str, Optional[list]]:
    """Redo-until-standard gate for agent-chat prose (operator 08-31).

    When the detection standard is ON for this ctx: score the draft with the
    enabled detectors (heuristics always included; 24h score cache), and if
    the human score is below the minimum, rewrite it (rulebook applied) and
    re-score — up to 2 rewrites. Returns the BEST-scored version (never worse
    than the original) plus the attempt log [{human, text}], or (text, None)
    when the standard is off / text is too short / anything fails (the gate
    never breaks chat).
    """
    if not detection_enabled(settings, node, ctx):
        return text, None
    text = (text or "").strip()
    if len(text) < 60:  # tiny replies cost detectors but never fail them
        return text, None
    min_human = detection_min_human(settings, node, ctx)
    names = [n for n in detection_detectors(settings) if n in DETECTOR_DISPLAY]
    try:
        from .detectors import score_text
        from .llm import call_llm
    except Exception:
        return text, None

    async def _human_of(draft: str) -> Optional[float]:
        """2-of-3 consensus of the ENABLED paid detectors, as a human score.

        Calibration (08-31, 2 human samples + 1 AI-slop sample): no single
        detector is reliable — Sapling false-flags plain human prose at 100,
        Winston returns 0 on blatant AI-slop (blind), Pangram is the steadiest.
        The MEDIAN over the enabled paid detectors is a 2-of-3 vote: one
        outlier cannot decide either way. The two proxy heuristics are
        excluded from the vote (burstiness scored AI-slop at ~10), and only
        used when the user disabled every paid detector.
        """
        try:
            _avg, results, _passed = await score_text(draft, threshold=0.0, detectors=names or None)
            if not results:
                return None
            # ERROR VOTES EXCLUDED (08-31 retest): a detector that HTTP-400s
            # (out of credits, quota, bad key) falls back to 20.0 — a phantom
            # "80% human" vote in the median. Healthy = no error field, no
            # details{"error"/"unavailable"/"configured":False}, no failed or
            # in-progress task. Dead detectors can't vote either way.
            def _healthy(r) -> bool:
                if getattr(r, "error", None):
                    return False
                d = getattr(r, "details", None)
                if isinstance(d, dict):
                    if d.get("error") or d.get("unavailable") or d.get("configured") is False:
                        return False
                    if d.get("stage") == "STAGE_FAILED" or d.get("status") == "in_progress":
                        return False
                return True

            paid = [r for r in results
                    if getattr(r, "name", None) in names and _healthy(r)]
            if not paid and names:
                paid = [r for r in results if _healthy(r)]  # heuristics only — fallback
            pooled = paid or results
            scores = sorted(r.score for r in pooled)
            mid = len(scores) // 2
            med = scores[mid] if len(scores) % 2 else (scores[mid - 1] + scores[mid]) / 2.0
            return round(100.0 - float(med), 1)
        except Exception:
            return None

    def _rewrite_system(draft_score: Optional[float]) -> str:
        sys = (
            "You rewrite drafts until they pass AI-content detectors as "
            f"writing by a real human. The draft below scored {draft_score if draft_score is not None else 'unknown'}% "
            f"human; it must reach at least {min_human}%.\n\n"
            "Follow the rulebook strictly:\n" + HUMANIZER_RULEBOOK
        )
        # 08-31 (operator): the draft was generated in a SAMPLE VOICE — the
        # rewrite must keep that voice or the redo loop drifts off-style.
        voice = sample_voice_block(settings, node, ctx)
        if voice:
            sys += "\n\n" + voice.strip()
        return sys

    try:
        current = text
        attempts: list = []
        best = (text, None)
        for _ in range(3):  # original + up to 2 rewrites
            human = await _human_of(current)
            attempts.append({"human": human, "text": current})
            if best[1] is None or (human is not None and human > (best[1] or -1)):
                best = (current, human)
            if human is not None and human >= min_human:
                return current, attempts
            ai_settings = dict(settings or {})
            effort = 500
            if isinstance(ai_settings.get("ai"), dict):
                try:
                    effort = int(ai_settings["ai"].get("effortScore") or 500)
                except (TypeError, ValueError):
                    effort = 500
            raw = await call_llm(
                system_prompt=_rewrite_system(human),
                user_prompt=(
                    "Rewrite this draft completely — restructure sentences and "
                    "paragraph flow, vary rhythm, keep every fact, name, number, "
                    "quote and meaning EXACTLY as-is. Return ONLY the rewritten "
                    "draft, no preamble:\n\n" + current[:12000]
                ),
                temperature=0.8,
                max_tokens=min(8000, max(800, int(len(current) * 1.6))),
                effort_score=effort,
                db=db, user_id=user_id,
            )
            new = (raw or "").strip()
            if not new or new == current:
                break
            current = new
        return best[0], attempts
    except Exception:
        return text, None


# ─── Sample Voice (operator 08-31) ───────────────────────────────────────────
# "Write like a sample": the user adds samples (paste or upload) in AI &
# Intelligence; when the setting is on for a chat, the agent writes in those
# samples' voice. Same global/subject/assignment scope chain:
#
#   settings["ai"]["style"]["enabled"]    "on" | "off"   (scoped-able)
#   settings["ai"]["style"]["selection"]  [sample_id, ...]  (GLOBAL defaults)
#   settings["ai"]["style"]["samples"]    {id: {"name": str, "text": str}}
#   settings["scoped"]["ai.style.samples"] = [{id, scope, value: [ids, ...]}]

SAMPLE_MAX = 3          # samples injected per chat
SAMPLE_CHAR_CAP = 3000  # per sample, characters


def style_enabled(settings: Optional[Dict[str, Any]], node: str = "my_agent",
                  ctx: Optional[Dict[str, Any]] = None) -> bool:
    """Sample Voice is ON for this context (scoped variant > global toggle)."""
    settings = dict(settings or {})
    scoped_hit = _scoped_on_off(settings, "ai.style.enabled", ctx)
    if scoped_hit is not None:
        return scoped_hit
    ai = settings.get("ai") if isinstance(settings.get("ai"), dict) else {}
    style = ai.get("style") if isinstance(ai.get("style"), dict) else {}
    raw = str(style.get("enabled") or "off").strip().lower()
    return raw in ("on", "true", "1", "yes")


def style_selected_ids(settings: Optional[Dict[str, Any]],
                       ctx: Optional[Dict[str, Any]] = None) -> list:
    """Sample ids for this context: scoped variant (assignment > subject,
    most-specific-wins) else the global ai.style.selection list."""
    settings = dict(settings or {})
    scoped_hit = _scoped_value(settings, "ai.style.samples", ctx)
    if isinstance(scoped_hit, list) and all(isinstance(i, str) for i in scoped_hit):
        return scoped_hit
    if isinstance(scoped_hit, list):
        return [str(i) for i in scoped_hit if i is not None]
    ai = settings.get("ai") if isinstance(settings.get("ai"), dict) else {}
    style = ai.get("style") if isinstance(ai.get("style"), dict) else {}
    sel = style.get("selection")
    if isinstance(sel, list):
        return [str(i) for i in sel if i is not None]
    return []


def style_selected_samples(settings: Optional[Dict[str, Any]],
                           ctx: Optional[Dict[str, Any]] = None) -> list:
    """The actual sample dicts matched for this context (id/name/text), capped
    at SAMPLE_MAX and SAMPLE_CHAR_CAP each — ids that were deleted are skipped."""
    settings = dict(settings or {})
    ai = settings.get("ai") if isinstance(settings.get("ai"), dict) else {}
    style = ai.get("style") if isinstance(ai.get("style"), dict) else {}
    library = style.get("samples")
    if not isinstance(library, dict):
        return []
    out = []
    for sid in style_selected_ids(settings, ctx):
        if len(out) >= SAMPLE_MAX:
            break
        entry = library.get(str(sid))
        if not isinstance(entry, dict):
            continue
        text = str(entry.get("text") or "").strip()
        if not text:
            continue
        out.append({
            "id": str(sid),
            "name": str(entry.get("name") or f"Sample {sid[:6]}"),
            "text": text[:SAMPLE_CHAR_CAP],
        })
    return out


def sample_voice_block(settings: Optional[Dict[str, Any]], node: str = "my_agent",
                       ctx: Optional[Dict[str, Any]] = None) -> str:
    """Prompt block: the matched samples + style-matching guidance, or ""."""
    if not style_enabled(settings, node, ctx):
        return ""
    samples = style_selected_samples(settings, ctx)
    if not samples:
        return ""
    parts = [
        "\nSAMPLE VOICE (operator setting: ON — write like the user's samples): "
        "the user supplied sample writing below. Match its VOICE — the "
        "vocabulary level, sentence rhythm and lengths, punctuation habits, "
        "paragraph structure and register — but never its CONTENT: the samples "
        "show HOW this user writes, not WHAT they wrote about, so do not copy "
        "their facts, examples, answers or claims, and do not imitate the topic "
        "itself. This voice guide is authoritative for style and is overridden "
        "only by explicit user instructions in the chat."
    ]
    for i, s in enumerate(samples, 1):
        parts.append(f"--- SAMPLE {i}: {s['name']} ---\n{s['text']}")
    return "\n\n".join(parts)
