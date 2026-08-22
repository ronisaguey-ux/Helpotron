"""
Free Spaced Repetition Scheduler (FSRS v4.5 Algorithm Implementation)
Helpotron Academic Memory Engine (OSR-007)

Computes optimal review intervals using the DSR (Difficulty, Stability, Retrievability) model:
- Stability (S): Days until memory retrievability drops to 90%.
- Difficulty (D): Inherent complexity of the academic concept (1.0 to 10.0).
- Retrievability (R): Current recall probability at time delta t.
"""

import math
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Tuple


# Default FSRS v4.5 Optimized Weights for STEM / Academic Coursework
DEFAULT_WEIGHTS = [
    0.40255, 1.18385, 3.173, 15.69105,
    7.1949, 0.5345, 1.4604, 0.0046,
    1.54575, 0.1192, 1.01925, 1.9395,
    0.11, 0.29605, 0.22695, 0.5698,
    2.85535
]

REQUESTED_RETENTION = 0.90  # Target 90% recall on exam day


class FSRSScheduler:
    """Spaced Repetition Scheduler computing adaptive intervals for student flashcards."""

    def __init__(self, target_retention: float = REQUESTED_RETENTION):
        self.w = DEFAULT_WEIGHTS
        self.target_retention = target_retention

    def initial_stability(self, rating: int) -> float:
        """Rating: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)"""
        rating_idx = max(0, min(3, rating - 1))
        return max(0.1, self.w[rating_idx])

    def initial_difficulty(self, rating: int) -> float:
        """Computes initial D (1.0 = easiest, 10.0 = hardest)"""
        d0 = self.w[4] - (rating - 3) * self.w[5]
        return max(1.0, min(10.0, d0))

    def retrievability(self, days_elapsed: float, stability: float) -> float:
        """Calculates current recall probability R(t) = (1 + 19/81 * t / S)^(-0.5)"""
        if stability <= 0:
            return 0.0
        decay_factor = 19.0 / 81.0
        return math.pow(1.0 + decay_factor * (days_elapsed / stability), -0.5)

    def next_difficulty(self, current_d: float, rating: int) -> float:
        """Mean reversion update for difficulty."""
        d_delta = -self.w[6] * (rating - 3)
        next_d = current_d + d_delta
        # Mean reversion towards initial default
        reverted_d = self.w[7] * self.initial_difficulty(4) + (1 - self.w[7]) * next_d
        return max(1.0, min(10.0, reverted_d))

    def next_stability_recall(self, d: float, s: float, r: float, rating: int) -> float:
        """Computes increased stability after a successful recall (Good/Easy)."""
        hard_penalty = self.w[15] if rating == 2 else 1.0
        easy_bonus = self.w[16] if rating == 4 else 1.0
        
        factor = (
            math.exp(self.w[8]) *
            (11.0 - d) *
            math.pow(s, -self.w[9]) *
            (math.exp((1.0 - r) * self.w[10]) - 1.0) *
            hard_penalty *
            easy_bonus
        )
        return max(0.1, s * (1.0 + factor))

    def next_stability_forget(self, d: float, s: float, r: float) -> float:
        """Computes reduced stability after a lapse (Again)."""
        new_s = (
            self.w[11] *
            math.pow(d, -self.w[12]) *
            (math.pow(s + 1.0, self.w[13]) - 1.0) *
            math.exp((1.0 - r) * self.w[14])
        )
        return max(0.1, min(s, new_s))

    def calculate_interval(self, stability: float) -> int:
        """Calculates review interval in days to achieve target retention."""
        factor = (math.pow(self.target_retention, -2.0) - 1.0) / (19.0 / 81.0)
        interval = math.ceil(stability * factor)
        return max(1, interval)

    def schedule_review(
        self,
        rating: int,
        current_stability: float = None,
        current_difficulty: float = None,
        last_review_time: datetime = None
    ) -> Dict[str, Any]:
        """
        Executes a full state transition for a card review.
        Rating: 1 (Again / Forget), 2 (Hard), 3 (Good), 4 (Easy)
        """
        now = datetime.now(timezone.utc)
        
        # New card initialization
        if current_stability is None or current_difficulty is None or last_review_time is None:
            new_s = self.initial_stability(rating)
            new_d = self.initial_difficulty(rating)
            interval_days = self.calculate_interval(new_s)
            next_due = now + timedelta(days=interval_days)
            return {
                "stability": round(new_s, 3),
                "difficulty": round(new_d, 3),
                "retrievability": 1.0,
                "interval_days": interval_days,
                "next_due_date": next_due.isoformat(),
                "review_state": "learning" if rating == 1 else "review"
            }

        # Existing card update
        days_elapsed = max(0.01, (now - last_review_time).total_seconds() / 86400.0)
        current_r = self.retrievability(days_elapsed, current_stability)
        new_d = self.next_difficulty(current_difficulty, rating)

        if rating == 1:
            new_s = self.next_stability_forget(new_d, current_stability, current_r)
            interval_days = 1
            review_state = "relearning"
        else:
            new_s = self.next_stability_recall(new_d, current_stability, current_r, rating)
            interval_days = self.calculate_interval(new_s)
            review_state = "review"

        next_due = now + timedelta(days=interval_days)

        return {
            "stability": round(new_s, 3),
            "difficulty": round(new_d, 3),
            "retrievability": round(current_r, 4),
            "interval_days": interval_days,
            "next_due_date": next_due.isoformat(),
            "review_state": review_state
        }
