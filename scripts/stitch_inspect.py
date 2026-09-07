#!/usr/bin/env python3
"""Inspect the current Stitch project page (login state, controls, DOM markers).

Single-shot diagnostic. Usage:
  /home/roni/Roni_workspace/helpotron/scrape_sidecar/.venv/bin/python \
    /home/roni/Roni_workspace/helpotron/scripts/stitch_inspect.py
"""
import json
import sys
import time

from playwright.sync_api import sync_playwright

CDP = "http://127.0.0.1:9226"
PROJECT_URL = "https://stitch.withgoogle.com/projects/9220072169627594278"


def main() -> None:
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(CDP)
        ctx = browser.contexts[0]
        page = None
        for p in ctx.pages:
            if "stitch.withgoogle.com" in p.url:
                page = p
                break
        if page is None:
            page = ctx.new_page()
            page.goto(PROJECT_URL, wait_until="domcontentloaded", timeout=60000)

        page.wait_for_timeout(4000)
        print("TITLE:", page.title()[:100])
        print("URL:", page.url[:120])
        print("LOGGED_OUT_HINT:", bool(page.locator('text="Sign in"').count()))
        body = page.evaluate("document.body.innerText.slice(0, 1500)")
        print("---BODY-TEXT (first 1500)---")
        print(body)
        # common interactive markers
        markers = {
            "input_or_textarea": page.locator("textarea, input[type='text']").count(),
            "buttons": page.locator("button").count(),
            "send_buttons": page.evaluate(
                """() => [...document.querySelectorAll('button, [role=button]')]
                   .map(b => (b.innerText || b.getAttribute('aria-label') || '').trim())
                   .filter(t => /send|generate|continue|stop/i.test(t)).slice(0, 12)"""),
        }
        print("---MARKERS---")
        print(json.dumps(markers, indent=1))
        page.screenshot(path="/tmp/stitch_state.png", full_page=False)
        print("SCREENSHOT: /tmp/stitch_state.png")


if __name__ == "__main__":
    sys.exit(main())
