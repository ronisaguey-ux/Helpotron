"""
Canvas LMS Hybrid REST Sync Engine (OSR-001)
Helpotron Academic Ingestion Subsystem

Provides robust synchronization with Canvas instances using:
- RFC 5988 Link header pagination parsing
- Course enrollment filtering
- Assignment schema normalization (due dates, submission types, rubrics)
- Token validation via /api/v1/users/self
"""

import re
from urllib.parse import urlparse
import httpx
from typing import List, Dict, Any, Optional
from .ssrf import validate_safe_url, create_ssrf_safe_async_client


class CanvasSyncEngine:
    """Synchronizes student courses, assignments, and rubrics via Canvas REST API."""

    def __init__(self, base_url: str, access_token: str, timeout_seconds: float = 20.0):
        # Normalize base url
        self.base_url = base_url.rstrip("/")
        if not self.base_url.startswith("http"):
            self.base_url = f"https://{self.base_url}"
        validate_safe_url(self.base_url)
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "User-Agent": "HelpotronAcademicCompanion/2.0 (Academic Study Copilot)"
        }
        self.timeout = timeout_seconds

    @staticmethod
    def parse_rfc5988_next_link(link_header: Optional[str]) -> Optional[str]:
        """Parses standard RFC 5988 'Link' header for rel='next' URL."""
        if not link_header:
            return None
        # Example header: <https://canvas.instructure.com/api/v1/courses?page=2>; rel="next"
        matches = re.findall(r'<([^>]+)>;\s*rel="([^"]+)"', link_header)
        for url, rel in matches:
            if rel == "next":
                return url
        return None

    def get_safe_next_link(self, link_header: Optional[str]) -> Optional[str]:
        """Validates next pagination link to ensure same-origin and SSRF compliance."""
        next_url = self.parse_rfc5988_next_link(link_header)
        if not next_url:
            return None

        base_parsed = urlparse(self.base_url)
        next_parsed = urlparse(next_url)

        # Cross-origin protection: never send student Canvas tokens to a different host
        if next_parsed.netloc and next_parsed.netloc.lower() != base_parsed.netloc.lower():
            return None

        # SSRF validation on pagination target
        validate_safe_url(next_url)
        return next_url

    async def validate_token(self) -> Dict[str, Any]:
        """Validates student token and retrieves profile."""
        async with create_ssrf_safe_async_client(timeout=self.timeout) as client:
            res = await client.get(f"{self.base_url}/api/v1/users/self", headers=self.headers)
            if res.status_code != 200:
                return {"valid": False, "error": f"Canvas responded with HTTP {res.status_code}"}
            data = res.json()
            return {
                "valid": True,
                "user_id": str(data.get("id")),
                "name": data.get("name", "Canvas Student"),
                "primary_email": data.get("primary_email", "")
            }

    async def fetch_active_courses(self) -> List[Dict[str, Any]]:
        """Fetches all currently active enrolled courses."""
        url = f"{self.base_url}/api/v1/courses?enrollment_state=active&per_page=50"
        courses = []
        pages = 0

        async with create_ssrf_safe_async_client(timeout=self.timeout) as client:
            while url and pages < 50:
                pages += 1
                res = await client.get(url, headers=self.headers)
                if res.status_code != 200:
                    break
                data = res.json()
                if isinstance(data, list):
                    for c in data:
                        if c.get("name") and not c.get("access_restricted_by_date"):
                            courses.append({
                                "course_id": str(c.get("id")),
                                "name": c.get("name"),
                                "course_code": c.get("course_code", c.get("name")),
                                "term": c.get("term", {}).get("name", "Active Term")
                            })
                url = self.get_safe_next_link(res.headers.get("link"))

        return courses

    async def fetch_course_assignments(self, course_id: str) -> List[Dict[str, Any]]:
        """Fetches all assignments for a specific course."""
        url = f"{self.base_url}/api/v1/courses/{course_id}/assignments?per_page=50"
        assignments = []
        pages = 0

        async with create_ssrf_safe_async_client(timeout=self.timeout) as client:
            while url and pages < 50:
                pages += 1
                res = await client.get(url, headers=self.headers)
                if res.status_code != 200:
                    break
                data = res.json()
                if isinstance(data, list):
                    for a in data:
                        assignments.append({
                            "assignment_id": str(a.get("id")),
                            "course_id": str(course_id),
                            "title": a.get("name", "Untitled Assignment"),
                            "description_html": a.get("description", ""),
                            "due_at": a.get("due_at"),
                            "points_possible": a.get("points_possible", 0.0),
                            "submission_types": a.get("submission_types", []),
                            "has_rubric": bool(a.get("rubric"))
                        })
                url = self.get_safe_next_link(res.headers.get("link"))

        return assignments
