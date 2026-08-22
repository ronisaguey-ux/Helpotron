"""Grade management for incremental average improvement."""
from __future__ import annotations

from sqlalchemy.orm import Session

from .database import User

GRADE_POINTS = {
    "F": 0,
    "D": 1,
    "D+": 2,
    "C": 3,
    "C+": 4,
    "B": 5,
    "B+": 6,
    "A": 7,
    "A+": 8,
}
GRADE_NAMES = ["F", "D", "D+", "C", "C+", "B", "B+", "A", "A+"]


def grade_to_points(grade: str) -> int:
    return GRADE_POINTS.get(grade, 0)


def points_to_grade(points: int) -> str:
    idx = min(range(len(GRADE_NAMES)), key=lambda i: abs(GRADE_POINTS[GRADE_NAMES[i]] - points))
    return GRADE_NAMES[idx]


def update_average_grade(user: User, target_grade: str, db: Session) -> None:
    """Update the user's average grade incrementally towards the target."""
    if target_grade not in GRADE_POINTS:
        return
    target_points = GRADE_POINTS[target_grade]
    current_grade = user.settings.get("average_grade", "F")
    current_points = GRADE_POINTS.get(current_grade, 0)
    total_points = user.settings.get("_total_grade_points", current_points)
    count = user.settings.get("_grade_count", 0)
    total_points += target_points
    count += 1
    new_avg_points = total_points / count
    new_grade = points_to_grade(int(round(new_avg_points)))
    user.settings["average_grade"] = new_grade
    user.settings["_total_grade_points"] = total_points
    user.settings["_grade_count"] = count
    db.commit()
