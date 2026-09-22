"""Test proving UI-01 and UI-02: public paths and view aliases are mapped in web/src/App.jsx."""
import re
import pytest


def test_app_routes_coverage():
    with open("web/src/App.jsx", "r", encoding="utf-8") as f:
        content = f.read()

    # Required paths in VIEW_PATH_MAP
    for path in ["/guide", "/terms", "/privacy", "/pricing", "/study"]:
        assert f"'{path}':" in content or f'"{path}":' in content, f"Missing path mapping for {path} in VIEW_PATH_MAP"

    # Required legacy view aliases in LEGACY_VIEWS
    for view in ["pricing", "study", "guide", "terms", "privacy"]:
        assert re.search(rf"\b{view}\s*:", content), f"Missing view alias for {view} in LEGACY_VIEWS"
