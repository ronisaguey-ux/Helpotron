"""Content moderation: screen user-generated text, persist flagged items.

Real rule-based screen (operator 09-01) that replaces the old hardcoded
in-memory moderation queue. No API keys and no mock entries: when user text
hits a safety rule at write time, the hit is appended to the moderation_items
table — the same store the admin Control Center reads and resolves through
POST /api/admin/moderation/{id}/action.

Patterns are deliberately explicit so ordinary bug reports ("password is
wrong", "card payment failed") do NOT trip them: a pattern needs a real secret
value, transfer instruction, or slur, not just mention of the topic.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Optional, Tuple

from sqlalchemy.orm import Session


# ─── Safety rules ────────────────────────────────────────────────────────────
# (name, compiled regex, risk score 0..1). Matches are case-insensitive.

_SAFETY_RULES: list[tuple[str, re.Pattern, float]] = [
    # Credential harvesting — must look like an actual secret being shared,
    # not a support complaint about one.
    ("credential_card",
     re.compile(r"\b(?:my\s+)?(?:credit\s+)?card\s+(?:number|no\.?|#)\s*:?\s*\d{4}[ \d-]{8,19}\b", re.I),
     0.95),
    ("credential_ssn",
     re.compile(r"\b(?:ssn|social\s+security)\s*(?:number|#)?\s*:?\s*\d{3}-?\d{2}-?\d{4}\b", re.I),
     0.95),
    ("credential_password",
     re.compile(
         r"\b(?:my\s+)?(?:password|passcode|pin)\s*(?:is|:|=)\s*"
         r"(?!wrong|incorrect|required|needed|missing|invalid|correct|reset|changed|set|expired|locked)\b"
         r"\S{4,}\b",
         re.I),
     0.90),
    ("credential_bank",
     re.compile(r"\b(?:account\s+number|routing\s+number|iban|swift\s+code)\s*:?\s*[A-Za-z0-9]{8,}\b", re.I),
     0.90),
    ("credential_crypto_seed",
     re.compile(r"\b(?:seed\s+phrase|mnemonic|private\s+key)\b[^.\n]{0,40}\S{12,}", re.I),
     0.95),
    # Payment-fraud shells — an instruction to move money somewhere.
    ("scam_wire",
     re.compile(r"\b(?:wire|send|transfer)\b[^\n]{0,80}\b(?:bitcoin|btc|eth|ether|usdt|crypto)\b[^.\n]{0,60}\b(?:to|into)\b", re.I),
     0.85),
    ("scam_giftcard",
     re.compile(r"\b(?:gift\s?card|western\s+union|moneygram)\b[^\n]{0,80}\b(?:pay|payment|redeem)\b", re.I),
     0.85),
    ("scam_prize",
     re.compile(r"\b(?:claim|collect|unlock)\b[^.\n]{0,60}\b(?:prize|jackpot|winnings)\b[^.\n]{0,50}\b(?:fee|tax|payment)\b", re.I),
     0.80),
    ("scam_urgent_bank",
     re.compile(r"\b(?:urgent|immediately)\b[^.\n]{0,60}\b(?:bank|account)\b[^.\n]{0,60}\b(?:verify|confirm|validate)\b", re.I),
     0.75),
]

# Prohibited slurs — word-boundary exact matches only, 1.0 risk.
_SLURS: frozenset[str] = frozenset({
    "nigger", "nigga", "faggot", "fag", "cunt", "retard", "trannie", "tranny",
    "kike", "spic", "chink", "wetback", "coon", "dyke", "whore", "slut",
    "rape", "raped", "pedophile", "childporn",
})


def screen_content(text: str) -> Tuple[bool, str, float]:
    """Screens user text against the safety rules.

    Returns (flagged, reason, risk_score). The highest-scoring hit wins;
    slurs are the top category. No hit → (False, "", 0.0).
    """
    if not text:
        return False, "", 0.0
    best: Tuple[float, str] = (0.0, "")
    for name, pattern, score in _SAFETY_RULES:
        if pattern.search(text) and score > best[0]:
            best = (score, f"Matched safety rule: {name}")
    for slur in _SLURS:
        if re.search(rf"\b{re.escape(slur)}\w*\b", text, re.I):
            best = (1.0, f"Prohibited slur detected: {slur}")
            break
    if best[0] == 0.0:
        return False, "", 0.0
    return True, best[1], best[0]


def flag_content(
    db: Session,
    *,
    content_type: str,
    content_ref: str,
    user_public_id: str,
    text: str,
    reason: str,
    risk_score: float,
) -> Optional[dict]:
    """Appends one pending moderation item (skips duplicates for the same content).

    Returns the item dict, or None when the item was already queued.
    """
    from .database import ModerationItem

    if not content_ref:
        return None
    existing = (
        db.query(ModerationItem)
        .filter(
            ModerationItem.content_type == content_type,
            ModerationItem.content_ref == content_ref,
            ModerationItem.status == "pending",
        )
        .first()
    )
    if existing:
        return None

    item = ModerationItem(
        public_id=f"mod_{uuid.uuid4().hex[:8]}",
        content_type=content_type,
        content_ref=content_ref,
        user_public_id=str(user_public_id or ""),
        reason=reason[:255],
        snippet=(text or "").strip()[:200],
        risk_score=risk_score,
        status="pending",
        flagged_at=datetime.now(timezone.utc),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "id": item.public_id,
        "content_type": item.content_type,
        "content_ref": item.content_ref,
        "user_public_id": item.user_public_id,
        "reason": item.reason,
        "snippet": item.snippet,
        "risk_score": item.risk_score,
        "status": item.status,
        "flagged_at": item.flagged_at.isoformat(),
    }
