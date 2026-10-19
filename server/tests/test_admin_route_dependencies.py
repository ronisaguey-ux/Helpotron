"""HT-004: Ensure every /api/admin/* route declared in the application
has `require_admin` declared as a route dependency in its signature.
"""
import pytest
from server.main import app
from server.admin import require_admin


def test_all_admin_routes_have_require_admin_dependency():
    """Assert every path starting with /api/admin/ has require_admin dependency in its signature."""
    admin_routes = []
    for route in app.routes:
        path = getattr(route, "path", None)
        if path and path.startswith("/api/admin/"):
            admin_routes.append(route)

    assert len(admin_routes) >= 14, f"Expected at least 14 /api/admin/ routes, found {len(admin_routes)}"

    missing_dependency = []
    for route in admin_routes:
        dep_callables = [
            d.call for d in getattr(route.dependant, "dependencies", [])
            if hasattr(d, "call")
        ]
        if require_admin not in dep_callables:
            missing_dependency.append((route.path, list(getattr(route, "methods", []))))

    assert not missing_dependency, (
        f"The following /api/admin/ routes lack require_admin dependency in their signature: {missing_dependency}"
    )
