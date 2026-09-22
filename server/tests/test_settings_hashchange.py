"""Test proving UI-10: hashchange listener in SettingsApp.jsx for direct section linking."""
import pytest


def test_settings_app_hashchange_listener():
    with open("web/src/components/SettingsApp.jsx", "r", encoding="utf-8") as f:
        content = f.read()
    assert "addEventListener('hashchange'" in content or 'addEventListener("hashchange"' in content, (
        "Missing hashchange listener in SettingsApp.jsx"
    )
