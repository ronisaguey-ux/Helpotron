"""Multi-engine AI detection evasion, Kimhons Humanize 38-pattern scrubbing,
statistical burstiness modulation, and style/book voice calibration pipeline.
"""
from __future__ import annotations

import asyncio
import logging
import math
import random
import re
import statistics
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from .default_styles import DEFAULT_STYLES, SELECTED_BOOK_STYLES, get_default_style
from .detectors import DetectorRegistry, DetectorResult, score_text

logger = logging.getLogger("helpotron.humanizer")


# ─── High-Frequency Function Words for Burstiness Analysis ────────────────────
FUNCTION_WORDS: Set[str] = frozenset([
    "the", "and", "of", "to", "in", "a", "is", "for", "on", "with",
    "as", "by", "at", "this", "that", "be", "it", "from", "or", "are",
    "which", "an", "but", "not", "have", "has", "had", "was", "were",
    "been", "being", "do", "does", "did", "so", "if", "then", "than",
    "them", "their", "these", "those", "there", "here", "we", "he", "she",
    "you", "i", "me", "my", "our", "your", "his", "her", "its"
])


# ─── 38 Kimhons / Blader AI Writing Patterns ──────────────────────────────────
@dataclass
class HumanizePattern:
    pid: int
    name: str
    regex: re.Pattern[str]
    weight: float = 1.0
    category: str = "style"
    replacement_hint: str = ""


PATTERNS_38: List[HumanizePattern] = [
    # 1. Significance inflation
    HumanizePattern(
        1, "significance_inflation",
        re.compile(r"\b(stands? as|serves? as|is a testament|marking a pivotal moment|underscoring (its )?(importance|significance)|reflects? (a )?broader|setting the stage for|indelible mark|deeply rooted|evolving landscape|focal point|key turning point|represents? a shift)\b", re.I),
        weight=1.5, category="content", replacement_hint="State the fact plainly without grandiose significance claims."
    ),
    # 2. Notability name-dropping
    HumanizePattern(
        2, "notability_name_dropping",
        re.compile(r"\b(cited in|featured in|covered by|written by a leading expert|active social media presence|widely acknowledged by)\b", re.I),
        weight=1.0, category="content", replacement_hint="Cite specific author or remove vague prestige drop."
    ),
    # 3. Superficial -ing analyses
    HumanizePattern(
        3, "superficial_ing",
        re.compile(r"\b(highlighting|underscoring|emphasizing|symbolizing|reflecting|contributing to|cultivating|fostering|encompassing|showcasing)\s+", re.I),
        weight=1.2, category="language", replacement_hint="Use direct active verbs instead of dangling participial clauses."
    ),
    # 4. Promotional buzzwords
    HumanizePattern(
        4, "promotional_language",
        re.compile(r"\b(nestled|breathtaking|stunning|vibrant|boasts?|in the heart of|renowned for|must[- ]visit|profound|groundbreaking|exemplifies|a commitment to)\b", re.I),
        weight=1.5, category="content", replacement_hint="Replace flowery marketing adjectives with concrete factual descriptions."
    ),
    # 5. Vague attribution
    HumanizePattern(
        5, "vague_attribution",
        re.compile(r"\b(experts (believe|say|argue)|critics (argue|point out)|observers note|it is widely believed|many consider|scholars suggest)\b", re.I),
        weight=1.2, category="content", replacement_hint="Name specific scholars or remove ungrounded consensus claims."
    ),
    # 6. Formulaic challenges section
    HumanizePattern(
        6, "formulaic_challenges",
        re.compile(r"\b(despite (these|the) challenges|faced with numerous obstacles|nevertheless continues to thrive|navigating complex)\b", re.I),
        weight=1.3, category="content", replacement_hint="Present real nuanced friction without Hollywood obstacle framing."
    ),
    # 7. Overused AI vocabulary
    HumanizePattern(
        7, "overused_ai_vocabulary",
        re.compile(r"\b(testament|landscape|tapestry|delve|delving|intricate|intricacies|pivotal|beacon|interplay|myriad|multifaceted|cornerstone|paradigm shift)\b", re.I),
        weight=1.8, category="language", replacement_hint="Replace dead AI buzzwords with natural colloquial or standard academic nouns."
    ),
    # 8. Copula avoidance
    HumanizePattern(
        8, "copula_avoidance",
        re.compile(r"\b(functions? as|serves? to provide|acts? as a|stands? as an?)\b", re.I),
        weight=1.1, category="language", replacement_hint="Use simple copulas ('is', 'are') instead of bureaucratic circumlocutions."
    ),
    # 9. Negative parallelisms
    HumanizePattern(
        9, "negative_parallelisms",
        re.compile(r"\b(it('s| is) not (just|merely|only) [^,.;]+,\s*(it('s| is)|but) (also )?|not only [^,]+ but also)\b", re.I),
        weight=1.4, category="style", replacement_hint="Express ideas directly rather than relying on clichéd binary negation."
    ),
    # 10. Rule of three
    HumanizePattern(
        10, "rule_of_three",
        re.compile(r"\b([a-z]+ing, [a-z]+ing, and [a-z]+ing|[a-z]+, [a-z]+, and [a-z]+ (advancement|innovation|success|impact))\b", re.I),
        weight=1.3, category="style", replacement_hint="Vary list lengths; avoid rhythmic triples."
    ),
    # 11. Synonym cycling
    HumanizePattern(
        11, "synonym_cycling",
        re.compile(r"\b(the protagonist|the central figure|the main character|the subject in question)\b", re.I),
        weight=1.0, category="style", replacement_hint="Use the character/author's name consistently."
    ),
    # 12. False ranges
    HumanizePattern(
        12, "false_ranges",
        re.compile(r"\bfrom (the )?[a-z]+ to (the )?[a-z]+, (and )?everything in between\b", re.I),
        weight=1.5, category="style", replacement_hint="Name specific items rather than generic rhetorical poles."
    ),
    # 13. Passive voice / subjectless fragments
    HumanizePattern(
        13, "subjectless_fragments",
        re.compile(r"\b(no (prior )?knowledge required|easily accessible to all|designed with the user in mind)\b", re.I),
        weight=1.0, category="grammar", replacement_hint="Clarify the agent or actor."
    ),
    # 14. Em-dash overuse
    HumanizePattern(
        14, "em_dash_overuse",
        re.compile(r"(\s*—\s*|\s*--\s*)", re.I),
        weight=0.8, category="style", replacement_hint="Replace excessive dashes with standard commas, periods, or parentheses."
    ),
    # 15. Boldface overuse
    HumanizePattern(
        15, "boldface_overuse",
        re.compile(r"\*\*[a-zA-Z0-9\s]{3,40}\*\*", re.I),
        weight=1.0, category="formatting", replacement_hint="Remove unnecessary bold keywords in continuous prose."
    ),
    # 16. Inline-header lists
    HumanizePattern(
        16, "inline_header_lists",
        re.compile(r"(^|\n)\s*[-*]\s*\*\*[A-Z][a-zA-Z\s]+:\*\*\s+", re.I),
        weight=1.2, category="formatting", replacement_hint="Convert list items into natural flowing paragraphs."
    ),
    # 17. Title Case Headings
    HumanizePattern(
        17, "title_case_headings",
        re.compile(r"^#+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){3,}", re.M),
        weight=0.9, category="formatting", replacement_hint="Use sentence case for subheadings."
    ),
    # 18. Emojis as bullets / decorations
    HumanizePattern(
        18, "emoji_decorations",
        re.compile(r"[🚀💡✅🔥✨🎯📌🧠⚡🎉]", re.I),
        weight=1.5, category="formatting", replacement_hint="Strip decorative emojis from academic and formal text."
    ),
    # 19. Curly quote conversions
    HumanizePattern(
        19, "curly_quotes",
        re.compile(r"[“”‘’]", re.I),
        weight=0.5, category="formatting", replacement_hint="Use standard ASCII quotes."
    ),
    # 20. Chatbot conversational artifacts
    HumanizePattern(
        20, "chatbot_artifacts",
        re.compile(r"\b(great question|i hope this helps|let me know if you|in this essay, i will|as an ai language model|certainly!)\b", re.I),
        weight=2.5, category="communication", replacement_hint="Completely purge conversational AI metadata."
    ),
    # 21. Knowledge-cutoff disclaimers
    HumanizePattern(
        21, "knowledge_cutoff",
        re.compile(r"\b(as of (my )?(last|current) (training|update)|up to 2024|at the time of writing)\b", re.I),
        weight=2.0, category="communication", replacement_hint="State current temporal context directly."
    ),
    # 22. Sycophantic tone
    HumanizePattern(
        22, "sycophantic_tone",
        re.compile(r"\b(you('re| are) absolutely right|an excellent observation|as you rightly pointed out)\b", re.I),
        weight=2.0, category="communication", replacement_hint="Adopt an objective, independent academic voice."
    ),
    # 23. Bureaucratic filler phrases
    HumanizePattern(
        23, "filler_phrases",
        re.compile(r"\b(in order to|due to the fact that|at this point in time|it is important to note that|it goes without saying that)\b", re.I),
        weight=1.2, category="filler", replacement_hint="Trim to 'to', 'because', 'now', or delete entirely."
    ),
    # 24. Excessive hedging
    HumanizePattern(
        24, "excessive_hedging",
        re.compile(r"\b(could (potentially|possibly)|might (seem to )?suggest that|it may be argued that perhaps)\b", re.I),
        weight=1.3, category="hedging", replacement_hint="State claims with measured, direct confidence."
    ),
    # 25. Generic positive conclusions
    HumanizePattern(
        25, "generic_conclusions",
        re.compile(r"\b(the future (looks|remains) bright|only time will tell|a step in the right direction|poised for (further )?growth)\b", re.I),
        weight=1.4, category="content", replacement_hint="Conclude with substantive synthesis of primary arguments."
    ),
    # 26. Hyphenated buzzword overuse
    HumanizePattern(
        26, "hyphenated_buzzwords",
        re.compile(r"\b(data-driven|cross-functional|user-centric|value-added|cutting-edge|next-generation)\b", re.I),
        weight=1.1, category="style", replacement_hint="Use clear, unhyphenated descriptive language."
    ),
    # 27. Persuasive authority tropes
    HumanizePattern(
        27, "persuasive_authority",
        re.compile(r"\b(at its core, what really matters|the key takeaway here is|simply put,)\b", re.I),
        weight=1.2, category="style", replacement_hint="Present the insight without preaching to the reader."
    ),
    # 28. Signposting announcements
    HumanizePattern(
        28, "signposting_announcements",
        re.compile(r"\b(let's dive (in|deeper)|here's what you need to know|without further ado)\b", re.I),
        weight=1.6, category="style", replacement_hint="Remove oral presentation signposts."
    ),
    # 29. Header restatements
    HumanizePattern(
        29, "header_restatements",
        re.compile(r"(^#+\s+([^\n]+)\n\n\2)", re.M),
        weight=1.5, category="structure", replacement_hint="Begin paragraph directly with analysis, not repeating the title."
    ),
    # 30. Citation laundering
    HumanizePattern(
        30, "citation_laundering",
        re.compile(r"\b(studies (show|demonstrate|prove)|research suggests|literature indicates)\b(?!\s*\[|\s*\()", re.I),
        weight=1.4, category="academic", replacement_hint="Add explicit parenthetical citation or name the researchers."
    ),
    # 31. Manuscript boilerplate
    HumanizePattern(
        31, "manuscript_boilerplate",
        re.compile(r"\b(the remainder of this paper is organized as follows|section \d+ presents|this paper is structured as)\b", re.I),
        weight=1.3, category="academic", replacement_hint="Integrate roadmap into narrative or delete if brief."
    ),
    # 32. Stat parade without effect size
    HumanizePattern(
        32, "stat_parade",
        re.compile(r"\b(p\s*<\s*0\.0[0-9]+)\b(?![^.\n]*?(Cohen|d\s*=|η|r\s*=))", re.I),
        weight=1.0, category="academic", replacement_hint="Include effect size alongside statistical significance."
    ),
    # 33. Methodology pseudo-precision
    HumanizePattern(
        33, "pseudo_precision",
        re.compile(r"\b(rigorous(ly)? analyzed|meticulously examined|carefully selected methodology)\b", re.I),
        weight=1.3, category="academic", replacement_hint="Describe the exact analytical procedure without flattering adverbs."
    ),
    # 34. Dissertation hedging
    HumanizePattern(
        34, "dissertation_hedging",
        re.compile(r"\b(it is beyond the scope of this (paper|study) to|further research is needed to fully understand)\b", re.I),
        weight=1.1, category="academic", replacement_hint="Focus on what was demonstrated; specify concrete future experiments."
    ),
    # 35. Over-structured transition adverbs
    HumanizePattern(
        35, "overstructured_transitions",
        re.compile(r"(^|\.\s+)(Furthermore|Moreover|Additionally|In conclusion|Consequently|Henceforth),\s+", re.I),
        weight=1.2, category="style", replacement_hint="Vary transition positions or connect thoughts through causal clauses."
    ),
    # 36. Rule-of-Thumb clichés
    HumanizePattern(
        36, "rule_of_thumb",
        re.compile(r"\b(as a rule of thumb|a double-edged sword|tip of the iceberg|in a nutshell)\b", re.I),
        weight=1.3, category="cliche", replacement_hint="Replace stale idioms with exact conceptual vocabulary."
    ),
    # 37. Perfect symmetry sentences
    HumanizePattern(
        37, "perfect_symmetry",
        re.compile(r"\bWhile [^,]+ (provides|offers|ensures) [^,]+,\s*it also (creates|introduces|presents) [^.]+\b", re.I),
        weight=1.2, category="style", replacement_hint="Break predictable balanced antithesis into organic sentence progression."
    ),
    # 38. Robotic summary wrap-ups
    HumanizePattern(
        38, "robotic_summary_wrapup",
        re.compile(r"\b(all in all|in summary|to sum up|in essence|ultimately, the)\b", re.I),
        weight=1.4, category="content", replacement_hint="End with a final analytical conclusion rather than announcing a summary."
    ),
]


class KimhonsHumanizeEngine:
    """Statistical and heuristic pattern humanizer based on kimhons/humanize."""

    @staticmethod
    def split_sentences(text: str) -> List[str]:
        cleaned = re.sub(r"```[\s\S]*?```", "", text)
        raw_sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])", cleaned)
        return [s.strip() for s in raw_sentences if len(s.strip()) > 3]

    @staticmethod
    def calculate_burstiness_metrics(text: str) -> Dict[str, Any]:
        """Calculates burstiness CV, lexical diversity (TTR), function word ratio, and paragraph variation."""
        sentences = KimhonsHumanizeEngine.split_sentences(text)
        paragraphs = [p.strip() for p in text.split("\n\n") if len(p.strip()) > 10]
        
        words = re.findall(r"\b[a-zA-Z'-]+\b", text.lower())
        total_words = max(1, len(words))
        unique_words = len(set(words))
        
        # 1. Sentence length variation (CV = std / mean)
        if len(sentences) >= 2:
            sentence_lens = [len(s.split()) for s in sentences]
            s_mean = statistics.mean(sentence_lens)
            s_stdev = statistics.stdev(sentence_lens) if len(sentence_lens) > 1 else 0.0
            sentence_cv = round(s_stdev / max(1.0, s_mean), 3)
        else:
            sentence_cv = 0.35
            
        # 2. Paragraph length variation
        if len(paragraphs) >= 2:
            p_lens = [len(p.split()) for p in paragraphs]
            p_mean = statistics.mean(p_lens)
            p_stdev = statistics.stdev(p_lens) if len(p_lens) > 1 else 0.0
            paragraph_cv = round(p_stdev / max(1.0, p_mean), 3)
        else:
            paragraph_cv = 0.30
            
        # 3. Lexical Diversity (Type-Token Ratio)
        ttr = round(unique_words / total_words, 3)
        
        # 4. Function Word Ratio
        func_count = sum(1 for w in words if w in FUNCTION_WORDS)
        function_word_ratio = round(func_count / total_words, 3)
        
        # 5. Subordinate clause proxy (commas, semicolons per 100 words)
        subordinate_count = len(re.findall(r"[,;:]", text))
        subordinate_density = round(subordinate_count / max(1, total_words), 3)
        
        # Human burstiness signature check (Target: sentence_cv >= 0.55, ttr in [0.40, 0.65])
        is_bursty = sentence_cv >= 0.50 and (0.35 <= ttr <= 0.70)
        
        return {
            "sentence_cv": sentence_cv,
            "paragraph_cv": paragraph_cv,
            "lexical_diversity_ttr": ttr,
            "function_word_ratio": function_word_ratio,
            "subordinate_density": subordinate_density,
            "is_human_bursty": is_bursty,
            "total_words": total_words,
            "sentence_count": len(sentences),
        }

    @staticmethod
    def audit_38_patterns(text: str) -> Dict[str, Any]:
        """Runs the 38 Kimhons pattern regex checks and scores the text (0-100, lower is more human)."""
        words = len(text.split())
        if words < 10:
            return {"cliche_score": 0.0, "total_hits": 0, "findings": []}

        total_weighted_hits = 0.0
        findings = []

        for p in PATTERNS_38:
            matches = list(p.regex.finditer(text))
            count = len(matches)
            if count > 0:
                weighted = count * p.weight
                total_weighted_hits += weighted
                findings.append({
                    "id": p.pid,
                    "name": p.name,
                    "count": count,
                    "category": p.category,
                    "hint": p.replacement_hint,
                })

        # Calculate 0-100 scale score (hits per 500 words normalized)
        norm_factor = max(1.0, words / 500.0)
        raw_score = (total_weighted_hits / norm_factor) * 12.0
        cliche_score = min(100.0, round(raw_score, 1))

        return {
            "cliche_score": cliche_score,
            "total_hits": len(findings),
            "findings": findings,
            "is_clean": cliche_score < 25.0,
        }

    @staticmethod
    def sanitize_obvious_slop(text: str) -> str:
        """Deterministic pass 1: Cleans em-dashes, bold words in prose, decorative emojis, and obvious buzzwords."""
        # Replace em-dashes with natural commas or periods
        cleaned = re.sub(r"\s*—\s*", ", ", text)
        cleaned = re.sub(r"\s*--\s*", ", ", cleaned)
        
        # Remove decorative emojis
        cleaned = re.sub(r"[🚀💡✅🔥✨🎯📌🧠⚡🎉]", "", cleaned)
        
        # Remove bolding on non-header text
        cleaned = re.sub(r"(?<!^#)\*\*([a-zA-Z0-9\s]{2,30})\*\*", r"\1", cleaned)
        
        # Clean obvious chatbot conversational artifacts
        cleaned = re.sub(r"(?i)\b(in this essay,?\s+i will\s+explore|certainly!|as an ai language model|without further ado,?)\b", "", cleaned)
        
        # Replace copula avoidance
        cleaned = re.sub(r"(?i)\bstands as an? testament to\b", "shows", cleaned)
        cleaned = re.sub(r"(?i)\bserves as an?\b", "is an", cleaned)
        cleaned = re.sub(r"(?i)\bserves to demonstrate\b", "demonstrates", cleaned)
        cleaned = re.sub(r"(?i)\bfunctions as\b", "is", cleaned)
        
        # Normalize double commas and spaces
        cleaned = re.sub(r",\s*,", ",", cleaned)
        cleaned = re.sub(r"\s{2,}", " ", cleaned)
        return cleaned.strip()


class AIHumanizerPipeline:
    """Comprehensive Helpotron Humanizer Stack: Voice/Book Calibration -> 38-Pattern Scrubbing -> Burstiness -> Multi-Detector Verification."""

    def __init__(self, human_score_threshold: float = 85.0, max_passes: int = 4):
        self.threshold = human_score_threshold
        self.max_passes = max_passes

    async def calculate_burstiness_perplexity(self, text: str) -> Dict[str, float]:
        """Calculates burstiness and perplexity proxy metrics for compliance checks."""
        meta = KimhonsHumanizeEngine.calculate_burstiness_metrics(text)
        burstiness_score = min(100.0, max(25.0, meta["sentence_cv"] * 100.0))
        lexical_diversity = meta["lexical_diversity_ttr"] * 100.0
        return {
            "burstiness": round(burstiness_score, 2),
            "perplexity_proxy": round(lexical_diversity, 2),
            "sentence_cv": meta["sentence_cv"],
            "ttr": meta["lexical_diversity_ttr"],
        }

    async def evaluate_multi_checkers(self, text: str) -> Dict[str, Any]:
        """Evaluates text against multi-detector suite and Kimhons 38-pattern audit."""
        avg_ai_score, results, passed = await score_text(text, threshold=100.0 - self.threshold)
        metrics = await self.calculate_burstiness_perplexity(text)
        pattern_audit = KimhonsHumanizeEngine.audit_38_patterns(text)
        human_score = max(0.0, 100.0 - avg_ai_score)
        is_stealth_ready = human_score >= self.threshold and metrics["burstiness"] >= 20.0 and pattern_audit["is_clean"]
        return {
            "human_confidence_score": round(human_score, 2),
            "burstiness": metrics["burstiness"],
            "lexical_diversity": metrics["perplexity_proxy"],
            "cliche_score": pattern_audit["cliche_score"],
            "detector_details": [r.to_dict() for r in results],
            "is_stealth_ready": is_stealth_ready,
        }

    @staticmethod
    def resolve_style_reference(
        style_sample: Optional[str] = None,
        book_style_id: Optional[str] = None,
        reading_level: Optional[str] = None,
    ) -> Tuple[str, str]:
        """Resolves target writing reference from user custom sample, selected literature book, or academic grade level."""
        # 1. Direct user custom writing sample
        if style_sample and len(style_sample.strip()) > 30:
            return style_sample.strip(), "User Custom Style Vault"

        # 2. Selected literature book style
        if book_style_id:
            for book in SELECTED_BOOK_STYLES:
                if book["id"] == book_style_id or book_style_id in book["title"].lower():
                    return book["sample"], f"Classic Literature ({book['title']} by {book['author']})"

        # 3. Default academic level fallback
        level_style = get_default_style(reading_level or "10th_grade")
        return level_style, f"Academic Benchmark ({reading_level or '10th Grade'})"

    async def humanize_loop(
        self,
        draft_text: str,
        style_sample: Optional[str] = None,
        book_style_id: Optional[str] = None,
        reading_level: Optional[str] = None,
        effort_level: int = 500,
    ) -> Tuple[str, Dict[str, Any]]:
        """Executes full humanization loop with Kimhons 38-pattern scrubbing, burstiness injection, and multi-detector scoring."""
        target_ref_text, target_ref_source = self.resolve_style_reference(
            style_sample=style_sample,
            book_style_id=book_style_id,
            reading_level=reading_level,
        )

        current_text = draft_text

        # Pass 1: Deterministic pattern scrubbing (Kimhons 38 patterns)
        current_text = KimhonsHumanizeEngine.sanitize_obvious_slop(current_text)

        # Audit initial burstiness & cliché metrics
        burstiness_meta = KimhonsHumanizeEngine.calculate_burstiness_metrics(current_text)
        pattern_audit = KimhonsHumanizeEngine.audit_38_patterns(current_text)

        # Pass 2: If effort >= 500 or patterns detected, perform LLM voice calibration pass
        if pattern_audit["cliche_score"] > 20.0 or not burstiness_meta["is_human_bursty"]:
            try:
                from .llm import call_llm
                system_instruction = f"""You are the Helpotron Master Humanizer Engine.
Transform the student's assignment draft to eliminate all statistical AI markers, robotic cadence, and uniform sentence lengths.

Target Voice Reference:
\"\"\"{target_ref_text[:1800]}\"\"\"

Strict Editorial Constraints:
1. Sentence Length Variance (Burstiness): Alternate short punchy sentences (4-9 words) with rich, complex compound sentences (25-38 words). Target a sentence CV >= 0.55.
2. Kimhons 38-Pattern Rules: Eliminate significance inflation ('stands as a testament'), superficial -ing clauses ('underscoring/highlighting'), robotic transitions ('Furthermore/Moreover'), and rule-of-three list tropes.
3. Authentic Human Cadence: Preserve the student's core arguments, evidence, and citations, but write in the distinct style and natural human rhythm of the target reference.
4. Output ONLY the rewritten assignment prose. No conversational preamble or meta-commentary."""

                user_instruction = f"Rewrite and humanize this draft now:\n\n{current_text}"
                rewritten_text, _ = await call_llm(system_instruction, user_instruction)
                if rewritten_text and len(rewritten_text.split()) >= len(current_text.split()) * 0.7:
                    current_text = KimhonsHumanizeEngine.sanitize_obvious_slop(rewritten_text)
            except Exception as e:
                logger.warning("Humanizer LLM rewrite pass failed, using heuristic cleaned text: %s", e)

        # Final Step: Multi-Detector Verification Suite (Pangram, Sapling, Originality, Copyleaks, Winston)
        avg_ai_score, results, passed = await score_text(current_text, threshold=100.0 - self.threshold)
        final_burstiness = KimhonsHumanizeEngine.calculate_burstiness_metrics(current_text)
        final_pattern_audit = KimhonsHumanizeEngine.audit_38_patterns(current_text)

        human_confidence = max(0.0, 100.0 - avg_ai_score)
        is_stealth_ready = human_confidence >= self.threshold and final_burstiness["is_human_bursty"] and final_pattern_audit["is_clean"]

        eval_summary = {
            "human_confidence_score": round(human_confidence, 2),
            "cliche_score": final_pattern_audit["cliche_score"],
            "sentence_cv": final_burstiness["sentence_cv"],
            "lexical_diversity_ttr": final_burstiness["lexical_diversity_ttr"],
            "burstiness": round(final_burstiness["sentence_cv"] * 100.0, 1),
            "lexical_diversity": round(final_burstiness["lexical_diversity_ttr"] * 100.0, 1),
            "target_style_source": target_ref_source,
            "detector_details": [r.to_dict() for r in results],
            "is_stealth_ready": is_stealth_ready,
            "patterns_flagged_count": final_pattern_audit["total_hits"],
        }

        # Log event to Research Data Lake if opted in
        try:
            from .datalake import datalake_manager
            datalake_manager.log_assignment_evasion_event(
                user_id=None,
                word_count=len(current_text.split()),
                initial_ai_score=round(avg_ai_score, 2),
                final_ai_score=round(avg_ai_score, 2),
                burstiness=eval_summary["burstiness"],
                lexical_diversity=eval_summary["lexical_diversity"],
                passes_used=1,
                passed=is_stealth_ready,
                detector_breakdown=eval_summary["detector_details"],
            )
        except Exception:
            pass

        return current_text, eval_summary
