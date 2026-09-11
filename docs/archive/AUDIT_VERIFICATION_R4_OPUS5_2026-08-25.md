I've completed the sweep. Everything below is grounded in files I opened; two framework behaviors were empirically confirmed with standalone probes (not by running the app).

---

**VERDICT: BLOCKER**

---

# Helpotron final single-operator audit — 8761a10 + worktree

Scope covered: full `server/` route surface, `web/src` (App/AppShell/AuthModal/SettingsApp/api.js + new `ExtensionInstallView.jsx`), `extension/` (manifest 2.0.1, background/content/popup), Dockerfile/compose, datalake/credits/export/GDPR paths. Audit history read (R2/R3/consolidated) — confirmed fixes are listed at the end so you don't re-audit them.

---

## CRITICAL

### C1 — `/ws/agent/{id}` raises `TypeError` on **every** connection (browser-agent feature is 100% dead)

`server/main.py:1128` uses `Depends(get_current_user)`, but `get_current_user` is annotated `request: Request` (`server/security.py:332`). In a WebSocket route FastAPI only fills `request_param_name` when `isinstance(conn, Request)` (`fastapi/dependencies/utils.py:125-128`) — in a WS it's a `WebSocket`, so the param is never supplied.

Probed on the installed FastAPI 0.141.1 with a standalone replica: `FAILED: TypeError get_current_user() missing 1 required positional argument: 'request'`.

```python
# server/security.py — BEFORE
async def get_current_user(request: Request):
    from .database import SessionLocal, User
    token = request.cookies.get(SESSION_COOKIE_NAME)
    ...
```
```python
# server/security.py — AFTER
from starlette.websockets import WebSocket

async def get_current_user(request: Request = None, websocket: WebSocket = None):
    """Works for both HTTP and WS routes: FastAPI fills whichever matches."""
    conn = request or websocket
    if conn is None:
        raise HTTPException(401, "Not authenticated: valid session token required")
    from .database import SessionLocal, User
    token = conn.cookies.get(SESSION_COOKIE_NAME)
    ...                      # rest unchanged, replace every `request.` with `conn.`
    auth_header = conn.headers.get("Authorization")
```
And close the socket cleanly instead of 500-ing:
```python
# server/main.py:1127 — AFTER
@app.websocket("/ws/agent/{session_id}")
async def agent_ws(websocket: WebSocket, session_id: str):
    try:
        current_user = await get_current_user(websocket=websocket)
    except HTTPException:
        await websocket.close(code=1008)
        return
    session = agent_manager.get(session_id)
    ...
```

---

### C2 — The browser extension has **no authentication path at all**; every call 401s

`extension/background.js:20-24, 95-99, 261-272, 289-300, 309` issue plain `fetch(...)` — no `credentials`, no `Authorization`. `fetch` defaults to `credentials: 'same-origin'`, and an extension-origin request to `http://localhost:8000` is cross-origin, so no session cookie is sent. Server-side, `X-Public-ID` is explicitly rejected as identity (`server/security.py:12,334`; `routes_features.py:22,83`), and `/api/assignments` (`main.py:715`), `/api/agent/start` (`:1069`), `/api/agent/{id}` (`:1120`) all require `get_current_user`.

Net: **Quick Scrape, Activate Agent, and status polling all fail with 401** — while the brand-new `ExtensionInstallView.jsx` is the headline demo feature telling friends to install it.

`/api/login` (`main.py:463-520`) returns **no bearer token**, so there is nothing for the extension to hold. Minimal fix — issue a JWT on login and let the popup log in:

```python
# server/main.py:519 — BEFORE
    return {"message": "Logged in", "public_id": user.public_id, "plan": user.plan, "credits": user.credits, "csrf_token": csrf_token}
```
```python
# server/main.py:519 — AFTER
    return {"message": "Logged in", "public_id": user.public_id, "plan": user.plan,
            "credits": user.credits, "csrf_token": csrf_token,
            "token": create_jwt_token(user.id)}          # extension / API clients
```
```javascript
// extension/background.js:12 — BEFORE
async function getPublicId() {
  const { public_id } = await chrome.storage.local.get('public_id');
  return public_id || '';
}
```
```javascript
// extension/background.js:12 — AFTER
async function getPublicId() {
  const { public_id } = await chrome.storage.local.get('public_id');
  return public_id || '';
}
async function authHeaders() {
  const { token } = await chrome.storage.local.get('token');
  return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
               : { 'Content-Type': 'application/json' };
}
```
Then every `headers: { 'Content-Type': 'application/json' }` in background.js becomes `headers: await authHeaders()`, and `agentStatus()`'s bare `fetch(...)` gets `{ headers: await authHeaders() }`. Add a username/password pair to `popup.html` + a `saveSettings` handler that POSTs `/api/login` and stores `resp.token`. (Bearer skips CSRF — `csrf.py:60-62` only enforces when a session cookie is present.)

The WS in `connectAgentSocket` (`background.js:107`) also can't send a header; pass the token as a query param and accept it in `agent_ws`:
```javascript
// extension/background.js:108 — AFTER
const { token } = await chrome.storage.local.get('token');
const wsUrl = server.replace(/^http/, 'ws') + `/ws/agent/${sessionId}?token=${encodeURIComponent(token || '')}`;
```

---

### C3 — `docker compose up` runs production mode on a **JWT secret published in this repo**

`docker-compose.yml:10` sets `JWT_SECRET=${JWT_SECRET:-helpotron_super_secret_jwt_signing_key_for_docker_local_32chars}`, and `Dockerfile:17` sets `ENV PRODUCTION_MODE=true`. The startup guard (`server/security.py:43-54`) blocks only the six strings in `KNOWN_INSECURE_SECRETS`, `len<32`, `dev-*`, and `change_me` — this default matches none of them, so the app boots happily. Anyone with the repo can mint `{"sub": <admin id>, "role": "admin"}` and walk into `/api/admin/*` (`admin.py:27-49` accepts Bearer JWT).

```yaml
# docker-compose.yml:10 — BEFORE
      - JWT_SECRET=${JWT_SECRET:-helpotron_super_secret_jwt_signing_key_for_docker_local_32chars}
```
```yaml
# docker-compose.yml:10 — AFTER  (no default: compose fails loudly if unset)
      - JWT_SECRET=${JWT_SECRET:?JWT_SECRET must be set (openssl rand -hex 32)}
      - SESSION_SECRET=${SESSION_SECRET:?SESSION_SECRET must be set}
```
Belt-and-braces in the guard:
```python
# server/security.py:43 — AFTER
KNOWN_INSECURE_SECRETS = {
    'dev-insecure-secret-key-change-in-prod-32bytesmin',
    'helpotron_jwt_secret_dev_key_32chars',
    'helpotron_super_secret_jwt_signing_key_min_32_chars',
    'helpotron_super_secret_jwt_signing_key_for_docker_local_32chars',  # compose default
    'helpotron_super_secret_session_key_min_32_characters',
    'secret', 'changeme',
}
```

---

### C4 — Server **crashes at import** on any clean checkout or container: `./uploads` doesn't exist

`server/main.py:1357`: `app.mount("/uploads", StaticFiles(directory="./uploads"), name="uploads")`. `uploads/` is gitignored (`.gitignore:26`) and `git ls-files uploads` returns nothing; the Dockerfile creates `/app/exports /app/datalake_storage /app/data_lake` but **not** `/app/uploads`. Probed: `StaticFiles(directory=<missing>)` → `RuntimeError: Directory './uploads' does not exist`. It also silently resolves against the process CWD, so launching from anywhere but the repo root serves the wrong tree.

```python
# server/main.py:1357 — BEFORE
app.mount("/uploads", StaticFiles(directory="./uploads"), name="uploads")
```
```python
# server/main.py:1357 — AFTER
_UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_UPLOADS_DIR)), name="uploads")
```

---

### C5 — The new Download button 404s in any container build (`extension/` is never shipped)

`routes_extension.py:19` resolves `EXTENSION_DIR = BASE_DIR/"extension"` (else `BASE_DIR.parent/"extension"`), with `BASE_DIR = /app`. The Dockerfile copies only `server/` and `web/dist/` → neither `/app/extension` nor `/extension` exists → `routes_extension.py:84-85` raises 404, and `ExtensionInstallView.jsx:19-28` produces a browser error page instead of a zip.

```dockerfile
# Dockerfile:11 — BEFORE
# Copy backend
COPY server/ /app/server/
```
```dockerfile
# Dockerfile:11 — AFTER
# Copy backend + the companion extension (served by /api/extension/download)
COPY server/ /app/server/
COPY extension/ /app/extension/
RUN mkdir -p /app/exports /app/datalake_storage /app/data_lake /app/uploads
```
(Also drop the now-redundant `mkdir` at `Dockerfile:20`.)

---

### C6 — The new `gecko` manifest block promises Firefox, but MV3 `background.service_worker` doesn't run there

`extension/manifest.json:5-10` (new) adds `browser_specific_settings.gecko` with `strict_min_version: "121.0"`, and `ExtensionInstallView.jsx:60` states *"Same zip works for Chrome/Edge/Brave (Chromium) and Firefox"* (repeated at `:115`). Firefox implements MV3 background as **event pages** (`background.scripts`); `background.service_worker` is not enabled by default, so Firefox loads the add-on with **no background context at all**. Every popup button in `popup.js` (`:46,69,84,120,126`) messages the background — all become silent no-ops. Content-script scraping via `window.__helpotron_*` also never reaches the server, because the upload path lives in `background.js:261`.

```json
// extension/manifest.json:35 — BEFORE
  "background": {
    "service_worker": "background.js"
  },
```
```json
// extension/manifest.json:35 — AFTER  (Chrome uses service_worker; Firefox uses scripts)
  "background": {
    "service_worker": "background.js",
    "scripts": ["background.js"]
  },
```
If you'd rather not ship a cross-browser build for the demo, delete the `gecko` block and cut the Firefox card at `ExtensionInstallView.jsx:77-87` plus the two claims at `:60` and `:115` — right now the doc is confidently wrong.

---

## HIGH

### H1 — Every fresh extension install identifies as `RoniDev`

```javascript
// extension/popup.js:25 — BEFORE
  publicIdInput.value = public_id || 'RoniDev';
```
```javascript
// extension/popup.js:25 — AFTER
  publicIdInput.value = public_id || '';
  publicIdInput.placeholder = 'your Helpotron username';
```
Same leftover in the new view: `ExtensionInstallView.jsx:12` computes `const publicId = getUserId() || 'RoniDev';` — and the variable is then **never used**. Delete the line outright.

---

### H2 — The update badge is permanently stuck on "NEW" after the 2.0.1 bump

`extension/background.js:316` hardcodes `CURRENT_VERSION = '2.0.0'` while the uncommitted manifest is `2.0.1`. `checkForExtensionUpdate` (`:326`) compares against the server's manifest-derived version (`routes_extension.py:42`) → mismatch forever → green "NEW" badge on a freshly installed, up-to-date extension.

```javascript
// extension/background.js:316 — BEFORE
const CURRENT_VERSION = '2.0.0';
```
```javascript
// extension/background.js:316 — AFTER
const CURRENT_VERSION = chrome.runtime.getManifest().version;
```

---

### H3 — `GET /api/feedback/list` returns every user's feedback text, unauthenticated

`server/routes_datalake.py:60-74` has no dependency; `router` prefix is `/api` (`:14`). Anyone can read the whole feedback corpus (free-text, user-submitted). `PATCH /api/feedback/{id}` (`:76`) likewise mutates status with no auth, and `POST /api/feedback/submit` (`:47`) is both unauthenticated **and** CSRF-exempt (`csrf.py:26`) with a client-supplied `user_id`.

```python
# server/routes_datalake.py:60 — BEFORE
@router.get("/feedback/list")
async def list_user_feedback(
    category: Optional[str] = None,
    urgency: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
):
```
```python
# server/routes_datalake.py:60 — AFTER
@router.get("/feedback/list")
async def list_user_feedback(
    category: Optional[str] = None,
    urgency: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_authenticated_user),
):
    if not is_admin_user(current_user):
        raise HTTPException(403, "Admin only")
```
Apply the same dependency to `:76` (`update_feedback_status_route`) and to `:47` (drop `payload.user_id`, take the id from the session).

---

### H4 — Admin GUI is invisible unless the admin literally uses the public_id `RoniDev`

`/api/me` (`server/main.py:576`) returns `public_id, plan, credits, authenticated` — no `is_admin`. `App.jsx:161` does `setIsAdmin(Boolean(data.is_admin))` → always `false`, so `App.jsx:261` falls back to a hardcoded string comparison:

```jsx
// web/src/App.jsx:261 — BEFORE
const effectiveIsAdmin = isAdmin || userId === 'RoniDev' || userId === 'admin';
```
The moment you follow the deploy checklist and set `ADMIN_PUBLIC_ID` to anything else, Control Center disappears for the owner while a *different* account named `RoniDev` becomes registerable and sees a broken admin shell (server still 403s).

```python
# server/main.py:576 — AFTER
            if user:
                return {"public_id": user.public_id, "plan": user.plan, "credits": user.credits,
                        "authenticated": True, "is_admin": is_admin_user(user)}
```
```jsx
// web/src/App.jsx:261 — AFTER
const effectiveIsAdmin = isAdmin;
```
(`is_admin_user` is already exported from `server/security.py:371` and imported in `admin.py:21`.)

---

### H5 — The "universal / any website" scrape is dead everywhere except the 6 matched LMS hosts

`extension/manifest.json:47-56` injects `content.js` only on instructure/canvaslms/classroom/blackboard/moodle. `background.js:245-250` then calls `window.__helpotron_scrape_universal`, which only exists if the content script ran. On any other page it returns `null` → the "unparseable" path (`:251-257`). Meanwhile `content.js:141` implements a full generic scraper and `ExtensionInstallView.jsx:47` advertises *"…Notion & any website"*. `<all_urls>` is already in `host_permissions`, so the fix is free:

```javascript
// extension/background.js:244 — BEFORE
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (window.__helpotron_scrape_universal ? window.__helpotron_scrape_universal() : null),
    });
```
```javascript
// extension/background.js:244 — AFTER
  try {
    // Ensure the scraper exists even on pages outside content_scripts.matches
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (window.__helpotron_scrape_universal ? window.__helpotron_scrape_universal() : null),
    });
```

---

### H6 — GDPR self-service delete endpoint 500s (imports three models that don't exist)

`server/routes_features.py:223` does `from .database import Assignment, StudySet, DraftSubmission, DumpItem`. `grep -n "^class"` over `server/database.py` shows no `StudySet`, `DraftSubmission`, or `DumpItem` anywhere in `server/` — and `:229` filters `Assignment.public_id`, while `Assignment` (`database.py:127-140`) only has `user_id`. Every call is a 500. This is the route `api.deleteAccount()` (`web/src/api.js:380`) points at.

The correct, cascading implementation already exists at `routes_user_settings.py:796` (`DELETE /api/user/account`). Delete the broken one and repoint the client:

```python
# server/routes_features.py:221-235 — AFTER (delete the whole handler)
# GDPR Article 17 erasure lives in routes_user_settings.py:796 (DELETE /api/user/account).
```
```javascript
// web/src/api.js:380 — BEFORE
  deleteAccount: () => request('/api/features/account/delete', { method: 'POST' }),
// AFTER
  deleteAccount: () => request('/api/user/account', { method: 'DELETE' }),
```
Note the only caller is `UserSettingsModal.jsx:934`, which is itself **dead code** (no importer anywhere in `web/src`) and swallows the error: `await api.deleteAccount().catch(() => {}); localStorage.clear(); window.location.reload();` — i.e. it would tell the user their account was erased when nothing happened. See L3.

---

### H7 — Export download: cross-user IDOR, and the file can never be there anyway

`server/routes_export.py:139-154` is auth'd but does **no per-user scoping** — any logged-in friend can `GET /api/export/download/assignment_<n>_bundle.pdf` for every sequential `n`. Worse, bundles are written to `/tmp/helpotron_exports` (`server/export.py:44,57`) while downloads resolve under `BASE_DIR/exports` (`routes_export.py:135`), so the route 404s on its own output.

```python
# server/export.py:44 — BEFORE
ALLOWED_EXPORT_DIR = "/tmp/helpotron_exports"
```
```python
# server/export.py:44 — AFTER
from .config import BASE_DIR
ALLOWED_EXPORT_DIR = str(BASE_DIR / "exports")
```
```python
# server/export.py:60 — BEFORE
    target_filename = f"assignment_{int(assignment_id)}_bundle.{clean_fmt}"
```
```python
# server/export.py:60 — AFTER  (per-user subdir kills the enumeration)
    safe_base = safe_base / sanitize_filename(str(getattr(user, "public_id", "anon")))
    safe_base.mkdir(parents=True, exist_ok=True)
    target_filename = f"assignment_{int(assignment_id)}_bundle.{clean_fmt}"
```
```python
# server/routes_export.py:145 — AFTER
    safe_path = (EXPORT_DIR / user.public_id / filename).resolve()
    user_root = (EXPORT_DIR / user.public_id).resolve()
    if not safe_path.is_relative_to(user_root) or not safe_path.is_file():
        raise HTTPException(404, "File not found or access denied.")
```

---

### H8 — The 6-theme Appearance picker still changes nothing

`SettingsApp.jsx:222-227` writes `appearance.theme/accent/density/background/uiStyle`; `AppShell.jsx:141` writes `appearance.theme` too. Grepping `web/src` for `data-theme`, `documentElement.classList`, `applyTheme` returns **zero** hits, and `index.css:10-27` hardcodes one dark palette on `:root`. `SettingsApp.jsx:139-185` only recolors an in-panel preview card. This remains the most visible broken promise in the product.

Minimal honest fix — apply theme + accent as CSS variables, exactly like `applyFontScale` already does (`SettingsApp.jsx:428-432`):

```jsx
// web/src/components/SettingsApp.jsx:428 — ADD
const THEME_VARS = {
  dark:     { '--bg-base': '#090d16', '--bg-surface': '#0f172a', '--text-primary': '#f8fafc', '--text-secondary': '#cbd5e1' },
  midnight: { '--bg-base': '#05070d', '--bg-surface': '#0b1120', '--text-primary': '#f8fafc', '--text-secondary': '#cbd5e1' },
  light:    { '--bg-base': '#f8fafc', '--bg-surface': '#ffffff', '--text-primary': '#0f172a', '--text-secondary': '#334155' },
};
const ACCENT_HEX = { blue: '#3b82f6', purple: '#a855f7', emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e', cyan: '#06b6d4' };

export function applyAppearance(a = {}) {
  const root = document.documentElement;
  root.setAttribute('data-theme', a.theme || 'dark');
  Object.entries(THEME_VARS[a.theme] || THEME_VARS.dark).forEach(([k, v]) => root.style.setProperty(k, v));
  root.style.setProperty('--accent', ACCENT_HEX[a.accent] || ACCENT_HEX.blue);
}
```
```jsx
// web/src/components/SettingsApp.jsx:442 — BEFORE
    applyFontScale(settings.appearance?.fontScale);
  }, [settings.appearance?.fontScale]);
// AFTER
    applyFontScale(settings.appearance?.fontScale);
    applyAppearance(settings.appearance);
  }, [settings.appearance]);
```
Then swap the two hardcoded surfaces to the vars: `index.css:47` `.app-background { background-color: var(--bg-base); }` and `App.jsx:267`'s literal background class. **If you'd rather not touch CSS before the demo, the honest alternative is to delete the Theme/Background/UI-style chip rows** (`SettingsApp.jsx:222,226,227`) and the AppShell pill (`AppShell.jsx:141`) and ship dark-only.

---

## MEDIUM

### M1 — MV3 update checker never fires again after the worker sleeps
`extension/background.js:354` `setInterval(checkForExtensionUpdate, 30*60*1000)` — MV3 service workers are evicted after ~30s idle, so this timer never survives to fire.
```javascript
// extension/background.js:353 — BEFORE
checkForExtensionUpdate();
setInterval(checkForExtensionUpdate, 30 * 60 * 1000);
// AFTER  (+ add "alarms" to manifest.permissions)
checkForExtensionUpdate();
chrome.alarms.create('helpotron_update_check', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'helpotron_update_check') checkForExtensionUpdate(); });
```

### M2 — CSRF cookie is hardcoded non-Secure
`server/csrf.py:42` `secure=False` with a `# Set to True in production` comment, while the session cookie correctly uses `secure=config.production_mode` (`main.py:511`).
```python
# server/csrf.py:42 — AFTER
        secure=getattr(__import__('server.config', fromlist=['config']).config, 'production_mode', False),
```
Cleaner: `from .config import config` at the top of `csrf.py`, then `secure=config.production_mode`.

### M3 — Compose publishes Postgres to `0.0.0.0` with a repo-default password, and persists nothing but the DB
`docker-compose.yml:28-29` maps `5432:5432`; the password default is `helpotron_secure_pg_pass_2026` (`:12,22`). Only `postgres_data` has a volume — `uploads/`, `exports/`, `data_lake/` are ephemeral, so every restart wipes user files.
```yaml
# docker-compose.yml — AFTER
  postgres:
    # (remove the `ports:` block entirely — only helpotron-api needs it, over the compose network)
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}
  helpotron-api:
    volumes:
      - helpotron_uploads:/app/uploads
      - helpotron_exports:/app/exports
      - helpotron_lake:/app/data_lake
volumes:
  postgres_data:
  helpotron_uploads:
  helpotron_exports:
  helpotron_lake:
```

### M4 — Transcription writes audio **outside the repo root**
`server/transcription.py:29` `UPLOAD_DIR = BASE_DIR.parent / "uploads"` — `BASE_DIR` is already the repo root (`config.py:10`), so this lands one level above (in Docker: `/uploads`, outside every volume), while `/uploads` is served from `<repo>/uploads`.
```python
# server/transcription.py:29 — AFTER
UPLOAD_DIR = BASE_DIR / "uploads"  # repo-root/uploads (same root the app mounts)
```

### M5 — Dump routing accepts another user's assignment id
`server/routes_dump.py:130-133`: ownership is checked on the dump item but not on `payload.assignment_id`, so you can attach your dump to someone else's assignment.
```python
# server/routes_dump.py:131 — AFTER
    elif payload.assignment_id:
        target = db.query(Assignment).filter(Assignment.id == payload.assignment_id,
                                             Assignment.user_id == current_user.id).first()
        if not target:
            raise HTTPException(status_code=404, detail="Assignment not found")
        item.matched_assignment_id = target.id
```

### M6 — Dead duplicate `/api/extension/download` in main.py
`server/main.py:1321-1346` re-declares the route the router already registered at `main.py:257`. FastAPI matches in registration order, so the **router version wins** (this corrects the consolidated audit's C16, which had the shadowing backwards) — but the main.py copy is unreachable dead code with no dotfile filter and an unversioned filename. Delete `main.py:1321-1346`.

### M7 — `credits.charge` writes no ledger row
`server/credits.py:91-104` performs the atomic `UPDATE users SET credits = credits - :cost …` (B10 correctly fixed) but never inserts a `CreditTransaction`, unlike `safe_deduct_with_rollback` (`:55-59`) and `process_payment` (`payments.py:174`). Every spend is invisible in the credits history feed.
```python
# server/credits.py:96 — AFTER
    if result.rowcount == 0:
        return False
    db.add(CreditTransaction(user_id=user_id, delta=-cost,
                             reason=reason or f"charge:{task_name}"))
    if user_obj:
```

### M8 — Unauthenticated data-lake aggregate + analysis endpoints
`routes_datalake.py:225` `/api/datalake/insights`, `:232` `/api/datalake/analyze`, `:239` `/api/datalake/stats` take no dependency. `analyze` re-reads up to 1500 JSONL records per call (`datalake.py:557-560`) — free CPU/disk amplification, and `stats` leaks business volume. Add `current_user: User = Depends(get_current_authenticated_user)` + `is_admin_user` gate to all three (same shape as H3).

### M9 — Scoped-settings split brain, with ~90 lines of unreachable code
`user_settings_service.py:360` and `:397` define `resolve_scoped_setting`/`set_scoped_setting` against the `UserSettingsScope` JSON-blob table; `:1198` and `:1212` redefine both against the `UserSetting` KV table. The tail wins, so the first pair is dead — but readers/writers are now split across two tables, and `get_effective_settings` (`:1126`) still returns hardcoded `effort/tone/humanizer_level` defaults merged over the KV rows. Delete `:360-430` and drop the stub defaults so callers see real values or nothing.

### M10 — New-view papercuts in `ExtensionInstallView.jsx`
- `:12` unused `publicId` with the `RoniDev` default (see H1) — delete the line.
- `:30` `navigator.clipboard.writeText(t)` throws (`clipboard` is `undefined`) on non-secure origins — a plain-HTTP LAN/IP demo makes the Copy URL button crash silently.
```jsx
// web/src/components/ExtensionInstallView.jsx:30 — AFTER
const copy = async (t) => {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(t);
    else { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  } catch { /* clipboard blocked — user can select the URL manually */ }
};
```
- `:22` `link.href = '/api/extension/download'` — correct as-is (vite proxies `/api` at `vite.config.js:18`, prod is single-origin), but it ignores the `serverUrl` shown one line below at `:60`. Use `` link.href = `${serverUrl}/api/extension/download` `` so the two agree.

### M11 — `popup.js` tab list can throw on Firefox
`extension/popup.js:50-53` filters only `chrome://`/`chrome-extension://` and then calls `new URL(t.url)`. Firefox privileged tabs return `undefined`/`""` for `url` → `TypeError` inside the callback kills the whole dropdown.
```javascript
// extension/popup.js:50 — AFTER
        if (t.url && /^https?:/i.test(t.url)) {
          const opt = document.createElement('option');
          opt.value = t.id;
          let host = ''; try { host = new URL(t.url).hostname; } catch {}
          opt.innerText = `${t.active ? '👉 ' : ''}${(t.title || '').slice(0, 38)} (${host})`;
```

---

## LOW

- **L1 — Dead migration trio.** `server/migrations.py` and `server/migrations/002_add_2fa_and_security.py` have **zero** runtime callers (`grep -rn "from .migrations\|run_migrations" server/*.py` → empty); schema comes from `init_db()` inline ALTERs. Either wire one chain at startup or delete both files so the next reader isn't misled.
- **L2 — `server/discounts.py` has no importers** (only two prose mentions in `main.py:5,996`) and references attributes that don't exist on `User`. Delete it.
- **L3 — `web/src/components/UserSettingsModal.jsx` is unreferenced** (~1000 lines, no importer). It contains the broken delete-account call from H6. Delete the file.
- **L4 — `POST /api/refund` is a stub.** `payments.py:189-191` `refund_unused` returns `{"message": ...}` without moving credits, so `main.py:1050` responds `{"refunded_credits": {"message": "Refund of $X processed"}}` — a lie in the response shape. Remove the route for the demo.
- **L5 — Brand naming is three-way inconsistent:** `manifest.json:3` "Helpotron Academic OS Companion" vs `popup.html:5` "Helpotron Universal Automator" vs `ExtensionInstallView.jsx:44` "Helpotron Extension" vs web "Helpotron Academic OS". Pick one string; `popup.html:5` is the cheapest edit.
- **L6 — `AppShell.jsx:428`** `Number(user.credits ?? 10029)` flashes a fabricated 10,029-credit balance before the session resolves (and `:425`'s aria-label renders `NaN`). Use `?? 0` in both.
- **L7 — `background.js:71`** `chrome.tabs.create({url: `${srv}/#datalake`})` — there is no hash routing in `App.jsx`/`main.jsx` (only `LibraryView.jsx:113` touches `location.hash`, to no effect), so "Open Data Lake" always lands on the dashboard. Point it at the real view or add a `hashchange` → `setActiveView` effect.
- **L8 — Extension popup uses a separate design system** (`popup.html:7-80`: 320px fixed, raw hex, 10-12px type) vs the web readability floors in `index.css`. Cosmetic, but friends will see both surfaces in the same session.
- **L9 — `<all_urls>` in `manifest.json:31`** makes the six specific host patterns above it redundant and will trigger review friction if you ever list on AMO/CWS. It *is* required for H5's fallback injection — keep it, but drop the now-dead specific entries.
- **L10 — Email-based 2FA addresses codes to the username.** `routes_auth_2fa.py` uses `current_user.public_id` as the email target (purchase-challenge and disable paths); users aren't keyed by email. TOTP is the only zero-config working method — default the settings panel to it.

---

## Verified fine (do not re-audit)

| Prior finding | State at 8761a10 + worktree |
|---|---|
| A2 JWT default key | **Fixed** — `security.py:39` reads `config.jwt_secret`; prod guard at `:52-54` |
| A3 unauth elite/credit minting | **Fixed** — `routes_auth_2fa.py` purchase routes are `Depends(get_current_authenticated_user)`; `payments.py:161` non-Stripe → `status="pending"`, **no** credits added |
| A4 anonymous 2FA disable | **Fixed** — authed + real TOTP/code verification per method |
| A5 `get_or_create_user` survivors | **Fixed** — `main.py:691,702,714,732` all gated + owner-checked; `"dev-user"` = 0 hits |
| A6 dump upload traversal / unauth | **Fixed** — `routes_dump.py:23,60` authed; `assignment_dump.py:223-224` writes `uuid4().hex` names |
| B2 lake whole-file rewrites | **Fixed** — tmp + `replace` at `datalake.py:297-303, 472-478, 542-545` |
| B3 raw PII in lake | **Fixed** — no `raw_user_id` writer left; salt from `DATALAKE_SALT`/`SECRET_KEY` (`datalake.py:60`) |
| B9 math `Pow` blowup | **Fixed** — `math_executor.py:38-41` bounds exponent at ±4096; routes authed |
| B10 credit double-spend | **Fixed** — atomic conditional UPDATE + rowcount (`credits.py:91-96`) |
| B11 DB session leak in auth | **Fixed** — `SessionLocal()` + `try/finally` (`security.py:341-359`) |
| B12 `require_admin` cookie 401 | **Fixed** — session-store path first, JWT fallback (`admin.py:27-49`) |
| 2FA login UI | **Fixed** — `AuthModal.jsx:49-51` handles `2fa_required`; code branch at `:280-313` |
| Admin advanced GUI | **Fixed** — mounted at `AdminPanels.jsx:74,115` (but see H4 — you may never reach it) |
| Deleted components | **Clean** — zero dangling refs to `ExtensionGuideModal`/`ExtensionUpdateBanner`; `api.getExtensionVersion`, `getServer`, `getUserId` all exist |
| Compose ↔ Postgres wiring | **Fixed** — `DATABASE_URL` set (`docker-compose.yml:10`), `psycopg2-binary`/`asyncpg` in requirements |
| Dev download path | **Fine** — `vite.config.js:17-27` proxies `/api` and `/uploads` to `127.0.0.1:8000`, so the relative download URL works in dev and prod |
| `console.log` in shipped UI | **Clean** — 0 occurrences in `web/src/**/*.jsx` |

---

### Shortest path to a demo you can hand out

C1, C2, C4 and C5 are the four that make the shipped feature set actually work; C3 is the one that matters if the link is public. C6 collapses to a two-line manifest edit (or a doc edit if you drop Firefox). H1/H2/H4 are one-liners. Everything from M1 down can wait until after your friends have clicked around.
