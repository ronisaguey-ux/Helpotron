# Helpotron extension → thinnest possible wrapper

**Owner's directive (2026-09-14):** every bug fix takes a day of CWS review, so
move as much as possible out of the extension and onto the website/server. The
extension should be a thin, stable shell; capabilities should be computed
server-side and *sent* to the client.

## 1. The one constraint that shapes everything

**Chrome Web Store forbids remotely hosted code.** An MV3 extension may not
`fetch` and execute JavaScript/CSS from a server. It CAN fetch *data* — HTML
strings, JSON, policy, rendered output — and render that data with its own
shipped code. So "serve the popup UI from the server" is **not** allowed; the
extension must always ship its own rendering code and its own `chrome.*` glue.

What this means for the strategy: the extension becomes a **stable, generic
engine** (render server data, capture screens, read DOM, dispatch input). Every
piece of *frequently-changing logic, policy, copy and formatting* becomes
server-served data. Bug fixes land on the server, not in a new extension build.

## 2. What lives where today (the split)

| Concern | Client (extension) | Server | Verdict |
|---|---|---|---|
| Chat/agent LLM routing, prompt, directive | — | `routes_extension.py agent_chat` | ✓ already server |
| Token gate, permission gate, persistence | — | server | ✓ already server |
| Vision (screen → text) | captures frame | `analyze_screen_image` | ✓ already server |
| Action allowlist/clamp/cap (15) | — | `screen_vision.py` | ✓ already server |
| Search-burst / target selection | sends elements | `_search_burst`, `find_input_target` | ✓ already server |
| Launch-to-doc cadence/typing policy | applies plan | `launch_to_doc.py` | ✓ already server |
| Approval request/respond flow | brokers | `/approval/respond` | ✓ already server |
| **Math + formatting rendering** | **KaTeX, 62 files / 2.6 MB** | crude headings-only `_render_markdown_page` | ✗ **migrate** |
| **UI copy / hints / labels** | `MODE_HINTS`, `OP_LABEL`, approval text, effort model | — | ✗ **migrate** |
| **Action risk classification policy** | `RISKY_CORES`, `classifyExpr` regexes | — | ~ split (needs DOM) |
| **Canvas LMS scraping** | `content.js` DOM scrape | Canvas REST API (study tools) | ~ partial |
| Tab management (query/create/focus) | `chrome.tabs` | impossible | ✓ must stay |
| Screen capture | `chrome.tabCapture/desktopCapture` | impossible | ✓ must stay |
| DOM element registry (exact coords) | `element_registry.js` | impossible (no DOM access) | ✓ must stay |
| Click/keystroke dispatch (trusted) | CDP debugger | impossible | ✓ must stay |
| Mic recording | `getUserMedia` | impossible | ✓ must stay |
| Risk inspection at coordinate | `Runtime.evaluate` on live DOM | impossible | ✓ must stay |

## 3. The migration, ranked by value

### M1 — server-side markdown + math rendering (kills 2.6 MB + a bug class)
The server already returns markdown (chat replies, vision notes, rubrics). Both
clients re-render it: the web app via `react-markdown`+`rehype-katex`
(node_modules), the extension via a 62-file vendored KaTeX bundle. Every
formatting/math bug is fixed twice, and an extension-side fix needs re-approval.

**Move rendering server-side:** add a server markdown→HTML renderer (Python
markdown + LaTeX→MathML/HTML) and have `agent_chat` / `vision` return rendered
HTML instead of raw markdown. Both clients inject sanitized HTML. One extension
release switches `formatMessageWithMath` to `innerHTML` (sanitized); after that,
every math/formatting fix is a server deploy.

### M2 — UI copy and policy as server data
`MODE_HINTS`, `OP_LABEL`, the approval-card copy, `effortModelInfo` labels, and
jurisdiction labels are hard-coded in `popup.js`/`agent_mode.js`. A wording
change today = extension rebuild. Serve them from `/api/extension/ui-config`
(a versioned JSON). The extension renders server strings; a copy change is a
server deploy.

### M3 — action risk classification policy as data
The *classification* (inspect the DOM at a coordinate) must stay client-side,
but the *policy* — which cores are "risky", which modes ask for what — can be a
server-served table. Today `RISKY_CORES` + the regex list live in
`agent_mode.js`. Serve the risky-core set and the approval thresholds as data;
the extension runs the server-provided regex list instead of its own.

### M4 — Canvas LMS via server API (partial)
The study tools already authenticate to Canvas REST API server-side
(`test_canvas_sync.py`). The content script's DOM scraping of Canvas could be
supplemented by server-side API calls for fields the API exposes cleanly
(assignment title, due date, description, rubric). Not a full replacement —
Google Classroom and several fields still need the user's DOM — but it shrinks
`content.js` and centralizes Canvas quirks server-side.

### Stays client-side, no way around it
Tab control, screen capture, DOM element registry, CDP input dispatch, mic
capture, and DOM inspection at a coordinate. These are the *irreducible* shell.

## 4. Execution order (what I build now vs what needs one release)

**Build now (server-side, zero re-approval):**
1. M1 renderer — server markdown+math → HTML, wired into the reply path behind
   a request flag so the current markdown contract is untouched until the
   extension release flips.
2. M2 `/api/extension/ui-config` — versioned copy/policy JSON.

**One extension release (owner gates it, publish action):**
- popup/agent-mode consume `ui-config` for all copy/hints/labels.
- `formatMessageWithMath` → sanitized `innerHTML` of server-rendered HTML.
- risky-core set served from server, classification still client-side.
- drop the 62-file KaTeX bundle and the renderer JS.

**After that:** a formatting bug, a wording change, or a risk-policy tweak is a
server deploy — the whole reason for the exercise.
