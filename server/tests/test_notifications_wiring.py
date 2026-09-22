"""Test proving UI-06: forward onNavigate and user props to NotificationsView in ActivityView and App.jsx."""
import pytest


def test_notifications_view_props():
    with open("web/src/components/ActivityView.jsx", "r", encoding="utf-8") as f:
        content = f.read()
    assert "onNavigate={onNavigate}" in content, "ActivityView does not forward onNavigate to NotificationsView"
    assert "user={user}" in content, "ActivityView does not forward user to NotificationsView"

    with open("web/src/App.jsx", "r", encoding="utf-8") as f:
        app_content = f.read()
    assert "<ActivityView" in app_content
    activity_block = app_content.split("<ActivityView")[1].split("/>")[0]
    assert "onNavigate=" in activity_block, "App.jsx does not pass onNavigate to ActivityView"
    assert "user=" in activity_block, "App.jsx does not pass user to ActivityView"
