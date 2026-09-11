# Helpotron Academic Companion — Chrome Extension Setup & Update Guide

**Version:** `v2.5.1`
**Compatibility:** Google Chrome, Brave, Microsoft Edge, Opera, Arc, and other Chromium browsers (Manifest V3)
**Supported Sites:** Canvas, Google Classroom, Blackboard, Brightspace/D2L, Moodle, Schoology, Google Docs, Gmail, Notion, Microsoft 365 (Word Online), the Helpotron web app, and any page you choose to capture.

---

## Quick 4-Step Installation

### Step 1: Get the extension files
- **Download the packaged zip** from your Helpotron account: open the web app and click **"Download Extension (.zip)"** in the install view, or fetch `/api/extension/download` directly.
- **Or use the local folder** (repo checkout): the extension lives in `extension/` (the directory containing `manifest.json`, `background.js`, `content.js`, and `popup.html`).

### Step 2: Enable Developer Mode and load it
1. Extract the zip to a permanent folder (e.g. `Documents/helpotron-extension`).
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the extracted folder.
5. **Helpotron Academic Companion v2.5.1** appears in your extensions list.

### Step 3: Pin it and sign in
1. Click the puzzle-piece icon in your toolbar and pin the Helpotron icon.
2. Click the Helpotron icon to open the popup.
3. Click the **account chip** (top-right, shows "Guest"), set the **Server** field (default `https://helpotron.dpdns.org`; use `http://localhost:8000` for a local dev server), enter your **Public ID** and **Password**, then click **Save & Connect**.
4. If your account is flagged for an extra security check, sign in once on the Helpotron website first — the session then syncs to the extension automatically.

---

## Features

| Feature | How to use | What happens |
| :--- | :--- | :--- |
| **Scrape current thing** | Open an assignment, rubric, or course page, then click *Scrape current thing only* in the popup. | Reads the page you chose (title, URL, prompt/rubric text, course and platform metadata, and listed file links with size and SHA-256 where available) and saves it to your Helpotron account. Unparseable pages are reported with the reason. |
| **Scrape everything on the tab (site crawl)** | Click *Scrape everything on the tab* to capture a course site. | A throttled crawl of the current course's page tree. The extension reads the course `robots.txt` first and refuses the crawl if the course path is disallowed. Progress and per-page results are shown in the popup; you can click **Stop** at any time. |
| **Chat with the screen agent** | In the Chat section, toggle **See screen** to attach a screenshot of the selected tab to each message, then click *Open agent chat*. | The agent sees the page and replies in the chat window. The conversation is stored in your Helpotron account and mirrored locally in the extension. |
| **Agent actions (execute)** | Turn on **Execute** and pick a permission mode: *Manual* (asks before every action), *Automatic* (acts on its own, asking only for risky actions), or *YOLO* (never asks — reserved for trusted pages; the password, OTP, card-number, and download hard-blocks still apply). Switching Execute on takes effect immediately — there is no extra prompt to approve. (Chrome lists the extension's "debugger" permission in the install warning; it is only used while Execute is on.) If the browser refuses to attach — usually because DevTools is open on that tab — the popup offers a one-click **Retry**. | The agent can move the mouse, click, type, and scroll in the selected tab. A **Stop** button, moving the mouse, or pressing **Esc** ends the session. The agent **never touches signing-in fields, one-time codes, or card numbers**, and **never downloads anything**. On learning platforms the agent is read-only; approval prompts (Allow / Deny) appear in the popup, and the agent only acts with your chosen permission level. |
| **Open Data Lake** | Click *Open Data Lake* when a page is marked unparseable. | Opens the Helpotron website account area so you can review or see how the page was handled. |

---

## Updates

- **Version check:** the extension polls `/api/extension/version` on a 30-minute schedule.
- **Update badge:** when a newer version is published, the toolbar badge turns green with **NEW** and the popup shows an *update available* banner.
- **What's new:** release notes are fetched from `/api/extension/releases`; the popup shows a *What's New* banner for unread releases (dismiss with **Got it**, which marks it read on the server).
- **Install an update:** click **Get** on the update banner (downloads the latest zip from `/api/extension/download`), extract over your existing folder, then hit **Reload** on the extension card at `chrome://extensions`.

---

## Troubleshooting

**"Failed to connect" / popup says offline**
- Check the **Server** field in the account panel matches your running server (`https://helpotron.dpdns.org`, or `http://localhost:8000` for local development).
- For local development, make sure the server is up:
  ```bash
  .venv/bin/uvicorn server.main:app --host 127.0.0.1 --port 8000 --reload
  ```

**A page says it is unparseable**
- The page may sit inside a protected LMS iframe or a login wall. Try the Chat agent with **See screen** on, or open the page directly in the Helpotron import flow from the website.

---

See the [Privacy Policy](/privacy-policy) for details on what the extension sends and stores. Data is only sent after you act — the extension never reads or transmits page content on its own.
