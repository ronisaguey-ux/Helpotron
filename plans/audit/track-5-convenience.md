# Track 5: Convenience & Utility — Partial Audit Findings
> **Status**: PARTIAL — subagent killed due to rate limit. Evidence extracted from reasoning transcript.

---

## CONV-01 (HIGH) — `NewAssignmentModal` Calls Dead Endpoint `/api/import-url` (404 Silent Fail)

**Track**: convenience
**Severity**: high
**Location**: `web/src/components/NewAssignmentModal.jsx` — URL import handler

**Evidence**:
- `NewAssignmentModal` POSTs to `/api/import-url` when source type is `'url'`
- This endpoint does not exist; 404 is silently caught and the modal falls back to a **hardcoded BIO-309 Organic Chemistry rubric**
- The real backend endpoint is `/api/assignments/import-from-url`, and `api.js` has `api.importFromUrl()` that calls the correct path — but the modal uses a raw `api.request` with the wrong path
- File uploads are also silently ignored — rubric tokens are not sent to the backend
- Agent verified: regardless of URL input, users always get the hardcoded BIO-309 assignment

**Impact**: URL-based assignment import is completely inert. Every user who tries to import from a URL silently gets a fake Chemistry assignment. Feature appears to work (no error shown) but does nothing.

**Fix**: In `NewAssignmentModal`, replace `api.request('/api/import-url', ...)` with `api.importFromUrl(url)`.

**Verification**: `"unverified": false` — agent traced the 404 path and confirmed hardcoded fallback.

---

## CONV-02 (HIGH) — 5 Study Material Export Endpoints Have Zero Frontend Callers

**Track**: convenience
**Severity**: high
**Location**: `server/routes_dump.py` (Quizlet CSV, Anki CSV, JSON practice test, Markdown, plain text summary endpoints)

**Evidence**:
- Backend exposes full export suite for study materials (5+ format endpoints)
- Graph `affected` traversal: none of these endpoints appear in any frontend component or `api.js` caller
- Endpoints appear only in test files
- These exports are completely invisible to users — no UI surface

**Impact**: Entire export feature suite is dead from the user's perspective. Real work done, zero discoverability.

**Status**: `"unverified": false` — graph traversal confirmed zero frontend call sites.

---

## CONV-03 (HIGH) — `AssignmentDumpView` Triage/Matching Workflow Has No Routing Button

**Track**: convenience
**Severity**: high
**Location**: `web/src/components/AssignmentDumpView.jsx`

**Evidence**:
- Backend routing implementation exists for triage/matching workflow
- Dedicated modal component exists
- `AssignmentDumpView` itself has no button that opens or triggers the triage modal
- The workflow is backend-complete + modal-complete but unreachable from the view

**Impact**: Triage/matching workflow is implemented but user cannot access it.

**Status**: `"unverified": false` — agent traced view and confirmed no trigger button.

---

## CONV-04 (MEDIUM) — Several Components Fully Orphaned (Zero Import Graph Edges)

**Track**: convenience
**Severity**: medium
**Location**: Various `web/src/components/`

**Evidence** (from graph traversal, files with zero inbound edges):
- `AdminAgentChat` component — not imported anywhere
- `PrivacyPolicy.jsx` — superseded by `PrivacyPolicyView.jsx` and `PrivacyPolicyModal.jsx`, the original is unreferenced
- Additional orphaned files identified but agent was killed before full enumeration

**Note**: Track 4 also identified 5 orphaned admin components (AdminAdvancedDashboard.jsx, AdminPanels.jsx, AssignmentTurnInView.jsx, PermissionModal.jsx, RouteModal.jsx). Cross-reference with UI-07.

**Status**: `"unverified": false` for named files; full enumeration incomplete.

---

## Open Items (not reached before kill)
- Props-passed-but-never-read audit — NOT completed
- Backend endpoints with zero API client — full enumeration NOT completed
