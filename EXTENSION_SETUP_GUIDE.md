# 🧩 Helpotron Universal Chrome Extension Setup & Update Guide

**Version:** `v2.0.0`  
**Compatibility:** Google Chrome, Brave, Microsoft Edge, Opera, Arc, and all Chromium browsers  
**Supported Platforms:** Canvas LMS, Blackboard, Google Classroom, Moodle, Brightspace/D2L, and arbitrary web pages  

---

## 🚀 Quick 4-Step Installation Walkthrough

### Step 1: Download or Locate the Extension Files
You have two easy ways to get the extension files:

- **Option A (Instant 1-Click Download):**
  Download the packaged `.zip` directly from your running Helpotron web dashboard:
  ```
  GET /api/extension/download
  ```
  or by clicking the **"Download Extension (.zip)"** button in the top navigation bar.

- **Option B (Direct Local Folder):**
  If you are running the Helpotron repository locally, the extension files are in:
  ```
  /home/roni/Roni_workspace/helpotron/extension
  ```

---

### Step 2: Extract & Enable Chrome Developer Mode
1. If you downloaded the `.zip` file, extract it to a permanent directory on your computer (e.g. `Documents/helpotron-extension`).
2. Open your Chromium browser and navigate to:
   ```
   chrome://extensions
   ```
3. In the top-right corner of the page, toggle the **Developer mode** switch to **ON**.

---

### Step 3: Load the Unpacked Extension
1. Click the **Load unpacked** button in the top-left corner of `chrome://extensions`.
2. Browse to and select the extracted `extension/` folder (the folder containing `manifest.json`, `background.js`, `content.js`, and `popup.html`).
3. **Helpotron Universal Automator v2.0.0** will now appear in your active extensions list!

---

### Step 4: Pin to Toolbar & Connect Your Account
1. Click the Chrome **Puzzle Piece 🧩** icon in your browser toolbar and click the **Pin 📌** icon next to Helpotron.
2. Click the Helpotron icon in your toolbar to open the popup.
3. Open the **Connection Settings** collapsible section and verify:
   - **Server URL:** `http://localhost:8000` (or your production domain `https://helpotron.com`)
   - **User Public ID:** `RoniDev` (or your registered student handle)
4. Click **Save Settings**.

---

## 🔔 Real-Time Update Alerts & How to Update

Helpotron includes an automated version check system:

### How Updates Work:
1. **Background Version Sync:** The extension automatically polls `GET /api/extension/version` on startup and every 30 minutes.
2. **Visual Notification Badge:** When a new version is published to the Helpotron server, the extension badge turns green and displays **`NEW`**.
3. **Web Dashboard Banner:** A persistent top alert banner appears in your Helpotron Web Dashboard with the new release highlights and a 1-click **"Download Update (.zip)"** button.

### How to Apply an Update:
1. Download the new `helpotron-extension-vX.X.X.zip` from your dashboard.
2. Unzip and replace the files in your existing extension directory.
3. Go to `chrome://extensions` and click the **Reload 🔄** icon on the Helpotron extension card.

---

## 🎙️ Core Extension Features

| Feature | How to Use | Output in Helpotron |
| :--- | :--- | :--- |
| **🤖 Spawn AI Subagent** | Open any assignment or rubric tab, select it in the popup, and click *Spawn AI Subagent*. | Methodically scans the DOM, rubrics, due dates, and attached files; auto-ingests clean coursework. |
| **📄 Quick Scrape** | Select any tab and click *Quick Scrape Selected Tab*. | Instant regex extraction for standard Canvas and Blackboard modules. |
| **🎙️ Record Lecture Audio** | Click *Record Lecture Audio* during lectures or discussions. | Chunked streaming upload to Gemini 3.1 Flash-Lite; creates structured Markdown notes with speaker tags. |
| **📥 Submit to Data Lake** | If a page is marked *Unparseable*, click *Submit to Data Lake*. | Sends page structure to the Data Lake and awards you bonus micro-credits upon review. |

---

## 🛠️ Troubleshooting & FAQ

#### 1. "Failed to connect to backend server"
- Ensure your FastAPI server is running on `http://localhost:8000` or that your `Server URL` in the extension popup matches your backend.
- Start backend:
  ```bash
  .venv/bin/uvicorn server.main:app --host 127.0.0.1 --port 8000 --reload
  ```

#### 2. Microphone Permissions for Lecture Recording
- Chrome will prompt you for microphone permission the first time you click *Record Lecture Audio*. Click **Allow**.

#### 3. Unparseable Webpage Warning
- If a protected school LMS iframe blocks scraping, use the **AI Subagent** mode or click **Submit to Data Lake** to submit the DOM structure for training and earn compute credits.
