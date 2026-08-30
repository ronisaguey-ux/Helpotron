#!/usr/bin/env python3
"""
Chrome CDP automation script for Helpotron Design Audit.
Walks the entire product across Consumer and Admin flows at multiple resolutions.
Captures screenshots to helpotron_audit/design_pass/screenshots/before/.
"""

import asyncio
import json
import os
import subprocess
import time
import httpx
import websockets

SCREENSHOT_DIR = "/home/roni/Roni_workspace/helpotron/helpotron_audit/design_pass/screenshots/before"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

RESOLUTIONS = {
    "desktop": {"width": 1440, "height": 900, "mobile": False},
    "tablet": {"width": 768, "height": 1024, "mobile": True},
    "mobile_390": {"width": 390, "height": 844, "mobile": True},
    "mobile_360": {"width": 360, "height": 800, "mobile": True},
    "mobile_320": {"width": 320, "height": 568, "mobile": True},
}

class ChromeClient:
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
            "about:blank"
        ]
        self.proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        await asyncio.sleep(1.5)

        # Get WebSocket debugger URL
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"http://127.0.0.1:{self.port}/json")
            pages = resp.json()
            ws_url = pages[0]["webSocketDebuggerUrl"]

        self.ws = await websockets.connect(ws_url, max_size=50 * 1024 * 1024)
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

    async def navigate(self, url):
        await self.send("Page.navigate", {"url": url})
        await asyncio.sleep(2.0)

    async def eval_js(self, expression):
        res = await self.send("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True,
        })
        return res.get("result", {}).get("value")

    async def screenshot(self, filename, width=None, height=None, is_mobile=False):
        if width and height:
            await self.set_viewport(width, height, is_mobile)
            await asyncio.sleep(0.5)
        res = await self.send("Page.captureScreenshot", {"format": "png"})
        import base64
        data = base64.b64decode(res["data"])
        filepath = os.path.join(SCREENSHOT_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(data)
        print(f"[OK] Saved {filepath} ({len(data)} bytes)")
        return filepath

    async def close(self):
        if self.ws:
            await self.ws.close()
        if self.proc:
            self.proc.terminate()
            self.proc.wait()

async def run_audit_walkthrough():
    chrome = ChromeClient()
    await chrome.start()
    try:
        base_url = "http://127.0.0.1:5173"

        # 1. SIGNED-OUT LANDING PAGE at all resolutions
        print("\n--- 1. Capturing Signed-Out Landing Page ---")
        for res_name, dim in RESOLUTIONS.items():
            await chrome.set_viewport(dim["width"], dim["height"], dim["mobile"])
            await chrome.navigate(base_url)
            await chrome.screenshot(f"landing_{res_name}.png")

        # Capture landing page scroll sections at desktop & mobile 390
        for res_name, dim in [("desktop", RESOLUTIONS["desktop"]), ("mobile_390", RESOLUTIONS["mobile_390"])]:
            await chrome.set_viewport(dim["width"], dim["height"], dim["mobile"])
            await chrome.navigate(base_url)
            await chrome.eval_js("window.scrollTo(0, 1200)")
            await asyncio.sleep(0.5)
            await chrome.screenshot(f"landing_pricing_{res_name}.png")
            await chrome.eval_js("window.scrollTo(0, 2400)")
            await asyncio.sleep(0.5)
            await chrome.screenshot(f"landing_features_{res_name}.png")

        # 2. AUTH MODAL (Sign In, Sign Up, Recovery, Consent)
        print("\n--- 2. Capturing Auth Modals ---")
        for res_name, dim in [("desktop", RESOLUTIONS["desktop"]), ("mobile_390", RESOLUTIONS["mobile_390"])]:
            await chrome.set_viewport(dim["width"], dim["height"], dim["mobile"])
            await chrome.navigate(base_url)
            # Open Sign In
            await chrome.eval_js("document.querySelector('button[aria-label=\"Sign In\"], button:has-text(\"Sign In\"), button')?.click() || (() => { const btns = Array.from(document.querySelectorAll('button')); const b = btns.find(x => x.textContent.includes('Sign In')); if(b) b.click(); })()")
            await asyncio.sleep(0.8)
            await chrome.screenshot(f"auth_signin_{res_name}.png")

            # Switch to Sign Up
            await chrome.eval_js("(() => { const btns = Array.from(document.querySelectorAll('button')); const b = btns.find(x => x.textContent.includes('Sign Up') || x.textContent.includes('Create Account')); if(b) b.click(); })()")
            await asyncio.sleep(0.8)
            await chrome.screenshot(f"auth_signup_{res_name}.png")

            # Switch to Recovery Flow
            await chrome.eval_js("(() => { const btns = Array.from(document.querySelectorAll('button, a')); const b = btns.find(x => x.textContent.includes('Forgot') || x.textContent.includes('Reset') || x.textContent.includes('Recover')); if(b) b.click(); })()")
            await asyncio.sleep(0.8)
            await chrome.screenshot(f"auth_recovery_{res_name}.png")

        # 3. CONSUMER APP VIEWS (Login with QA Throwaway User)
        print("\n--- 3. Capturing Consumer App Views ---")
        # Create throwaway user via API
        qa_user = f"qa_audit_{int(time.time())}"
        qa_pass = "TestAuditPass123!"
        async with httpx.AsyncClient() as client:
            reg_resp = await client.post("http://127.0.0.1:8000/api/users", json={"public_id": qa_user, "password": qa_pass, "role": "student"})
            login_resp = await client.post("http://127.0.0.1:8000/api/login", json={"public_id": qa_user, "password": qa_pass})
            login_data = login_resp.json()
            token = login_data.get("token") or login_data.get("access_token")

        # Inject session into browser localStorage
        await chrome.navigate(base_url)
        await chrome.eval_js(f"""
            localStorage.setItem('helpotron_auth_token', '{token}');
            localStorage.setItem('helpotron_user', JSON.stringify({json.dumps(login_data)}));
            localStorage.setItem('helpotron_legal_accepted', 'true');
            localStorage.setItem('helpotron_academic_honor_accepted', 'true');
        """)
        await chrome.navigate(base_url)
        await asyncio.sleep(1.5)

        consumer_views = [
            ("dashboard", "Dashboard"),
            ("activity", "Activity"),
            ("assignments", "Assignments"),
            ("extension", "Extension"),
            ("agent", "My Agent"),
            ("library", "Library"),
            ("dump", "Assignment Dump"),
            ("datalake", "Data Lake"),
            ("insights", "Insights"),
            ("credits", "Credits"),
            ("settings", "Settings"),
            ("privacy", "Privacy Policy"),
            ("terms", "Terms of Service"),
        ]

        for view_id, view_title in consumer_views:
            print(f"Capturing Consumer View: {view_title} ({view_id})")
            # Navigate to view via UI state setter
            await chrome.eval_js(f"window.dispatchEvent(new CustomEvent('helpotron_nav', {{ detail: '{view_id}' }}))")
            await chrome.eval_js(f"(() => {{ const b = Array.from(document.querySelectorAll('button, a')).find(x => x.getAttribute('data-view') === '{view_id}' || x.textContent.trim().toLowerCase() === '{view_title.lower()}'); if(b) b.click(); }})()")
            await asyncio.sleep(1.0)

            for res_name, dim in RESOLUTIONS.items():
                await chrome.set_viewport(dim["width"], dim["height"], dim["mobile"])
                await asyncio.sleep(0.4)
                await chrome.screenshot(f"consumer_{view_id}_{res_name}.png")

            # Special case for Insights: Test each tab
            if view_id == "insights":
                for tab_name in ["Academic Progress", "Recommendations"]:
                    await chrome.eval_js(f"(() => {{ const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('{tab_name}')); if(b) b.click(); }})()")
                    await asyncio.sleep(0.6)
                    for res_name in ["desktop", "mobile_390"]:
                        dim = RESOLUTIONS[res_name]
                        await chrome.set_viewport(dim["width"], dim["height"], dim["mobile"])
                        await chrome.screenshot(f"consumer_insights_{tab_name.lower().replace(' ', '_')}_{res_name}.png")

            # Special case for Credits: Receipts tab
            if view_id == "credits":
                await chrome.eval_js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('Receipts') || x.textContent.includes('Activity')); if(b) b.click(); })()")
                await asyncio.sleep(0.6)
                for res_name in ["desktop", "mobile_390"]:
                    dim = RESOLUTIONS[res_name]
                    await chrome.set_viewport(dim["width"], dim["height"], dim["mobile"])
                    await chrome.screenshot(f"consumer_credits_receipts_{res_name}.png")

        # Clean up QA throwaway user
        async with httpx.AsyncClient() as client:
            await client.delete(f"http://127.0.0.1:8000/api/user/account", headers={"Authorization": f"Bearer {token}"})
            print(f"[OK] Cleaned up QA user: {qa_user}")

        # 4. ADMIN APP VIEWS (Login as RoniDev)
        print("\n--- 4. Capturing Admin Views (RoniDev) ---")
        async with httpx.AsyncClient() as client:
            admin_login = await client.post("http://127.0.0.1:8000/api/login", json={"public_id": "RoniDev", "password": "<REDACTED-DEV-PASSWORD>"})
            admin_data = admin_login.json()
            admin_token = admin_data.get("token") or admin_data.get("access_token")

        await chrome.navigate(base_url)
        await chrome.eval_js(f"""
            localStorage.setItem('helpotron_auth_token', '{admin_token}');
            localStorage.setItem('helpotron_user', JSON.stringify({json.dumps(admin_data)}));
            localStorage.setItem('helpotron_legal_accepted', 'true');
            localStorage.setItem('helpotron_academic_honor_accepted', 'true');
        """)
        await chrome.navigate(base_url)
        await asyncio.sleep(1.5)

        admin_views = [
            ("admin_control", "Control Center"),
            ("admin_advanced", "Advanced Admin Dashboard"),
            ("monitors", "Monitors & Observability"),
            ("admin_notices", "System Notices"),
        ]

        for view_id, view_title in admin_views:
            print(f"Capturing Admin View: {view_title} ({view_id})")
            await chrome.eval_js(f"window.dispatchEvent(new CustomEvent('helpotron_nav', {{ detail: '{view_id}' }}))")
            await chrome.eval_js(f"(() => {{ const b = Array.from(document.querySelectorAll('button, a')).find(x => x.getAttribute('data-view') === '{view_id}' || x.textContent.trim().toLowerCase().includes('{view_title.lower()}')); if(b) b.click(); }})()")
            await asyncio.sleep(1.2)

            for res_name, dim in RESOLUTIONS.items():
                await chrome.set_viewport(dim["width"], dim["height"], dim["mobile"])
                await asyncio.sleep(0.4)
                await chrome.screenshot(f"admin_{view_id}_{res_name}.png")

        print("\n[ALL SCREENSHOTS CAPTURED SUCCESSFULLY]")

    finally:
        await chrome.close()

if __name__ == "__main__":
    asyncio.run(run_audit_walkthrough())
