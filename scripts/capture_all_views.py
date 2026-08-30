#!/usr/bin/env python3
"""
Comprehensive CDP automated visual walkthrough for Helpotron Design Audit.
Captures high-resolution before screenshots across all viewports and views.
"""

import asyncio
import json
import base64
import os
import subprocess
import time
import httpx
import websockets

OUTPUT_DIR = "/home/roni/Roni_workspace/helpotron/helpotron_audit/design_pass/screenshots/after"
os.makedirs(OUTPUT_DIR, exist_ok=True)

VIEWPORTS = {
    "desktop": {"width": 1440, "height": 900, "mobile": False},
    "tablet": {"width": 768, "height": 1024, "mobile": True},
    "mobile_390": {"width": 390, "height": 844, "mobile": True},
    "mobile_360": {"width": 360, "height": 800, "mobile": True},
    "mobile_320": {"width": 320, "height": 568, "mobile": True},
}

class CDPController:
    def __init__(self, port=9222):
        self.port = port
        self.proc = None
        self.ws = None
        self.msg_id = 0

    async def start(self):
        cmd = [
            "/usr/bin/google-chrome",
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            f"--remote-debugging-port={self.port}",
            "--remote-allow-origins=*",
        ]
        self.proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        await asyncio.sleep(1.0)

        async with httpx.AsyncClient() as c:
            r = await c.put(f"http://127.0.0.1:{self.port}/json/new?http://127.0.0.1:5173")
            target = r.json()
            self.ws_url = target["webSocketDebuggerUrl"]

        self.ws = await websockets.connect(self.ws_url, max_size=50 * 1024 * 1024)
        await self.send("Page.enable")
        await self.send("DOM.enable")
        await self.send("Runtime.enable")

    async def send(self, method, params=None):
        self.msg_id += 1
        msg = {"id": self.msg_id, "method": method, "params": params or {}}
        await self.ws.send(json.dumps(msg))
        while True:
            resp_str = await self.ws.recv()
            data = json.loads(resp_str)
            if data.get("id") == self.msg_id:
                return data.get("result", {})

    async def set_viewport(self, width, height, is_mobile=False):
        await self.send("Emulation.setDeviceMetricsOverride", {
            "width": width,
            "height": height,
            "deviceScaleFactor": 1,
            "mobile": is_mobile,
        })
        await asyncio.sleep(0.3)

    async def eval_js(self, expression):
        res = await self.send("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True,
        })
        return res.get("result", {}).get("value")

    async def screenshot(self, filename):
        res = await self.send("Page.captureScreenshot", {"format": "png"})
        data = base64.b64decode(res["data"])
        filepath = os.path.join(OUTPUT_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(data)
        print(f"  [SAVED] {filename} ({len(data):,} B)")

    async def close(self):
        if self.ws:
            await self.ws.close()
        if self.proc:
            self.proc.terminate()
            self.proc.wait()

async def main():
    cdp = CDPController()
    await cdp.start()
    try:
        base_url = "http://127.0.0.1:5173"

        # ── 1. SIGNED-OUT LANDING PAGE ─────────────────────────────────────────
        print("\n=== Phase 1: Signed-out Landing & Auth Modals ===")
        for vname, vp in VIEWPORTS.items():
            await cdp.set_viewport(vp["width"], vp["height"], vp["mobile"])
            await cdp.eval_js(f"window.location.href = '{base_url}'")
            await asyncio.sleep(1.0)
            await cdp.screenshot(f"1_landing_{vname}.png")

        # Landing Pricing & Features
        for vname, vp in [("desktop", VIEWPORTS["desktop"]), ("mobile_390", VIEWPORTS["mobile_390"])]:
            await cdp.set_viewport(vp["width"], vp["height"], vp["mobile"])
            await cdp.eval_js("window.scrollTo(0, 1000)")
            await asyncio.sleep(0.4)
            await cdp.screenshot(f"1_landing_pricing_{vname}.png")
            await cdp.eval_js("window.scrollTo(0, 2200)")
            await asyncio.sleep(0.4)
            await cdp.screenshot(f"1_landing_features_{vname}.png")

        # Auth Modals
        for vname, vp in [("desktop", VIEWPORTS["desktop"]), ("mobile_390", VIEWPORTS["mobile_390"])]:
            await cdp.set_viewport(vp["width"], vp["height"], vp["mobile"])
            # Sign in modal
            await cdp.eval_js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('Sign In')); if(b) b.click(); })()")
            await asyncio.sleep(0.5)
            await cdp.screenshot(f"1_auth_signin_{vname}.png")

            # Sign up modal
            await cdp.eval_js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('Sign Up') || x.textContent.includes('Create Account')); if(b) b.click(); })()")
            await asyncio.sleep(0.5)
            await cdp.screenshot(f"1_auth_signup_{vname}.png")

            # Recovery modal
            await cdp.eval_js("(() => { const b = Array.from(document.querySelectorAll('button, a')).find(x => x.textContent.includes('Forgot') || x.textContent.includes('Reset') || x.textContent.includes('Recover')); if(b) b.click(); })()")
            await asyncio.sleep(0.5)
            await cdp.screenshot(f"1_auth_recovery_{vname}.png")

            # Close modal
            await cdp.eval_js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('✕') || x.getAttribute('aria-label') === 'Close'); if(b) b.click(); })()")
            await asyncio.sleep(0.4)

        # ── 2. CONSUMER APP VIEWS (Throwaway QA Account) ───────────────────────
        print("\n=== Phase 2: Consumer App Views (Throwaway Account) ===")
        qa_user = f"qa_audit_{int(time.time())}"
        qa_pass = "AuditSecurePass999!"
        async with httpx.AsyncClient() as client:
            await client.post("http://127.0.0.1:8000/api/users", json={"public_id": qa_user, "password": qa_pass, "role": "student"})
            login_resp = await client.post("http://127.0.0.1:8000/api/login", json={"public_id": qa_user, "password": qa_pass})
            login_data = login_resp.json()
            qa_token = login_data.get("token") or login_data.get("access_token")

        # Set auth session
        await cdp.eval_js(f"""
            localStorage.setItem('helpotron_public_id', '{qa_user}');
            localStorage.setItem('public_id', '{qa_user}');
            localStorage.setItem('token', '{qa_token}');
            localStorage.setItem('helpotron_terms_accepted_v2', 'true');
        """)
        await cdp.eval_js("window.location.reload()")
        await asyncio.sleep(1.8)

        consumer_views = [
            ("dashboard", "overview"),
            ("activity", "activity"),
            ("extension", "extension"),
            ("my_agent", "agent"),
            ("library", "library"),
            ("assignment_dump", "dump"),
            ("data_lake", "datalake"),
            ("insights", "insights"),
            ("credits", "credits"),
            ("settings", "settings"),
            ("privacy_policy", "privacy"),
            ("terms_of_service", "terms"),
        ]

        for label, view_key in consumer_views:
            print(f"\nCapturing Consumer: {label} ({view_key})")
            await cdp.eval_js(f"window.__helpotron_nav('{view_key}')")
            await asyncio.sleep(0.8)

            for vname in ["desktop", "tablet", "mobile_390", "mobile_360", "mobile_320"]:
                vp = VIEWPORTS[vname]
                await cdp.set_viewport(vp["width"], vp["height"], vp["mobile"])
                await asyncio.sleep(0.3)
                await cdp.screenshot(f"2_consumer_{label}_{vname}.png")

            # Insights Tabs: Academic Progress & Recommendations
            if view_key == "insights":
                for tab_id, tab_label in [("progress", "Academic Progress"), ("recommendations", "Recommendations")]:
                    print(f"  Insights Tab: {tab_label}")
                    await cdp.eval_js(f"window.__helpotron_nav('insights', '{tab_id}')")
                    await asyncio.sleep(0.6)
                    for vname in ["desktop", "mobile_390"]:
                        vp = VIEWPORTS[vname]
                        await cdp.set_viewport(vp["width"], vp["height"], vp["mobile"])
                        await cdp.screenshot(f"2_consumer_insights_{tab_id}_{vname}.png")

            # Credits Tabs: Receipts & Activity
            if view_key == "credits":
                for tab_id, tab_label in [("receipts", "Receipts"), ("plans", "Plans"), ("earn", "Earn Discounts")]:
                    print(f"  Credits Tab: {tab_label}")
                    await cdp.eval_js(f"window.__helpotron_nav('credits', '{tab_id}')")
                    await asyncio.sleep(0.6)
                    for vname in ["desktop", "mobile_390"]:
                        vp = VIEWPORTS[vname]
                        await cdp.set_viewport(vp["width"], vp["height"], vp["mobile"])
                        await cdp.screenshot(f"2_consumer_credits_{tab_id}_{vname}.png")

            # Settings Tabs
            if view_key == "settings":
                for tab_id in ["billing", "ai", "appearance", "accessibility", "danger"]:
                    print(f"  Settings Section: {tab_id}")
                    await cdp.eval_js(f"(() => {{ const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.toLowerCase().includes('{tab_id}')); if(b) b.click(); }})()")
                    await asyncio.sleep(0.5)
                    for vname in ["desktop", "mobile_390"]:
                        vp = VIEWPORTS[vname]
                        await cdp.set_viewport(vp["width"], vp["height"], vp["mobile"])
                        await cdp.screenshot(f"2_consumer_settings_{tab_id}_{vname}.png")

        # Clean up QA throwaway user
        async with httpx.AsyncClient() as client:
            await client.delete("http://127.0.0.1:8000/api/user/account", headers={"Authorization": f"Bearer {qa_token}", "X-Public-ID": qa_user})
            print(f"\n[OK] Purged QA throwaway user: {qa_user}")

        # ── 3. ADMIN APP VIEWS (RoniDev) ───────────────────────────────────────
        print("\n=== Phase 3: Admin App Views (RoniDev) ===")
        async with httpx.AsyncClient() as client:
            admin_resp = await client.post("http://127.0.0.1:8000/api/login", json={"public_id": "RoniDev", "password": "<REDACTED-DEV-PASSWORD>"})
            admin_data = admin_resp.json()
            admin_token = admin_data.get("token") or admin_data.get("access_token")

        await cdp.eval_js(f"""
            localStorage.setItem('helpotron_public_id', 'RoniDev');
            localStorage.setItem('public_id', 'RoniDev');
            localStorage.setItem('token', '{admin_token}');
            localStorage.setItem('helpotron_terms_accepted_v2', 'true');
        """)
        await cdp.eval_js("window.location.reload()")
        await asyncio.sleep(1.8)

        admin_views = [
            ("control_center", "admin"),
            ("monitors", "monitors"),
        ]

        for label, view_key in admin_views:
            print(f"\nCapturing Admin: {label} ({view_key})")
            await cdp.eval_js(f"window.__helpotron_nav('{view_key}')")
            await asyncio.sleep(1.0)

            for vname in ["desktop", "tablet", "mobile_390", "mobile_360", "mobile_320"]:
                vp = VIEWPORTS[vname]
                await cdp.set_viewport(vp["width"], vp["height"], vp["mobile"])
                await asyncio.sleep(0.3)
                await cdp.screenshot(f"3_admin_{label}_{vname}.png")

            if view_key == "admin":
                # Check Advanced Dashboard tabs in Admin
                for subtab in ["users", "costs", "models", "security"]:
                    print(f"  Admin Tab: {subtab}")
                    await cdp.eval_js(f"(() => {{ const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.toLowerCase().includes('{subtab}')); if(b) b.click(); }})()")
                    await asyncio.sleep(0.6)
                    for vname in ["desktop", "mobile_390"]:
                        vp = VIEWPORTS[vname]
                        await cdp.set_viewport(vp["width"], vp["height"], vp["mobile"])
                        await cdp.screenshot(f"3_admin_advanced_{subtab}_{vname}.png")

        print("\n=== ALL BEFORE AUDIT SCREENSHOTS COMPLETE ===")

    finally:
        await cdp.close()

if __name__ == "__main__":
    asyncio.run(main())
