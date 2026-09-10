# Audit 1 of 3 — Manifest/CWS readiness
**Repo:** /home/roni/Roni_workspace/helpotron · **Branch:** timing-model-gptzero
**Scope:** `extension/manifest.json`, `server/routes_extension.py` (PRESET_RELEASE_NOTES), handover doc + CWS_APPROVAL_REVIEW cross-check.
**Date:** 2026-09-08

---

## Per-item verdicts

### ITEM 1 — Manifest version / manifest_version / valid JSON / referenced files exist
**PASS**

| Check | Result | Evidence |
|---|---|---|
| version == 2.7.0 | PASS | `extension/manifest.json:4` → `"version": "2.7.0"` |
| manifest_version == 3 | PASS | `extension/manifest.json:2` → `"manifest_version": 3` |
| Valid JSON (no trailing commas) | PASS | `python3 -c json.load(...)` → `JSON VALID`; parses clean |
| All referenced files exist on disk | PASS | see file table below |

File-reference existence table (`ls extension/` confirms each on disk):

| Referenced in manifest | Line | Exists |
|---|---|---|
| `popup.html` | :46 (default_popup) | ✅ `popup.html` |
| `icon16.png` / `icon32.png` / `icon48.png` / `icon128.png` | :48–51 | ✅ all 4 present |
| `options.html` | :58 (options_ui.page) | ✅ `options.html` |
| `background.js` | :62,:64 (service_worker + scripts) | ✅ `background.js` |
| `content.js` | :86 (content_scripts.js) | ✅ `content.js` |

### ITEM 2 — background.service_worker present and points to existing file
**PASS** — `extension/manifest.json:62` → `"service_worker": "background.js"`; file `extension/background.js` exists on disk. (A redundant `scripts:["background.js"]` block sits at :63–65; harmless — Chrome ignores it with a non-fatal MV2 warning, Firefox requires it. CWS_APPROVAL_REVIEW.md:28 already accepts this.)

### ITEM 3 — `debugger` permission in `permissions` (NOT optional_permissions)
**PASS** — `extension/manifest.json:21` → `"debugger"` is inside the `permissions` array (:12–23). Grep for `optional_permissions` returned **0 hits** (no `optional_permissions` key exists at all).
> DECISION-ITEM 1 note: matches owner directive recorded in `extension/CWS_APPROVAL_REVIEW.md:142` (§3 DECISION-ITEM 1, re-decided 2026-09-06): `debugger` is REQUIRED (no runtime permission prompt). This is **intentional** and **NOT a blocker** — verified elsewhere (agent actions still gated by Execute switch + permission mode). The stale "debugger in optional_permissions" lines at `CWS_APPROVAL_REVIEW.md:169–170,187` are legacy text only (acknowledged in the doc at :161–162).

### ITEM 4 — PRESET_RELEASE_NOTES contains a `2.7.0` key
**PASS** — `server/routes_extension.py:143` → `"2.7.0": [` (list :143–148). Confirmed present via grep.

### ITEM 5 — host_permissions vs handover doc claim
**PASS** — `extension/manifest.json:24–41` `host_permissions` array contains:
- `https://classroom.google.com/*` :26 ✅
- `https://docs.google.com/*` :32 ✅
- `https://mail.google.com/*` :33 ✅
- **No** `https://*.google.com/*` wildcard ✅

Handover doc `opencode_context_handover_9_8.md:35` claim ("host_permissions = classroom.google.com / docs.google.com / mail.google.com (no `*.google.com` wildcard)") → holds exactly on all three named domains + no wildcard.
> Observation (not a diff/FAIL): manifest `host_permissions` also contains **additional** education/host domains beyond the three Google ones — `*.instructure.com`(:25), `*.blackboard.com`(:27), `*.brightspace.com`(:28), `*.d2l.com`(:29), `*.moodle.com`(:30), `*.schoology.com`(:31), `*.notion.so`(:34), `*.notion.site`(:35), `*.office.com`(:36), `*.live.com`(:37), `helpotron.dpdns.org`(:38), `http://localhost/*`(:39), `http://127.0.0.1/*`(:40). The handover line is a Google-subset statement, not exhaustive, so nothing conflicts. These extra entries are consistent with `content_scripts.matches` (:67–89) and are expected for the multi-LMS product. CWS_APPROVAL_REVIEW.md:52 confirms `*.google.com` was intentionally removed.

### ITEM 6 — No `downloads` permission present
**PASS** — grep `downloads` in `extension/manifest.json` → **0 hits**; not in `permissions`. Consistent with CWS_APPROVAL_REVIEW.md:39 (`downloads` REMOVED, DECISION-ITEM 2 resolved).

---

## DECISION-ITEM notes
- **DECISION-ITEM 1 (debugger = required):** Intentional per owner directive (CWS_APPROVAL_REVIEW.md §3 #1, 2026-09-06). **Not a blocker.** Confirmed `debugger` is in required `permissions` (:21), not `optional_permissions`.
- Legacy text in `CWS_APPROVAL_REVIEW.md:169–170,187` still describes `debugger` as optional — docs-only remnant, explicitly superseded by the :161–162 note. No action needed for this audit.

---

## Final overall verdict
**OVERALL: PASS**
