# Helpotron Web Redesign — Follow-up Fix Prompt (agy)

Repo: `/home/roni/Roni_workspace/helpotron` · branch: `design/stitch-redesign` (HEAD = `77e5718`, already pushed)
Verifier (Claude) confirmed: build passes, 46/46 dark tokens + full light sheet match the Stitch sources, no placeholder/TODO garbage, all onClick/onChange/submit handlers preserved, extension/ and server/ untouched. One cosmetic defect found, plus a self-verification pass is required before you're done. DO NOT rewrite already-good views — fix only what this prompt names.

## Fix 1 — duplicate `--st-background` (cosmetic, must fix)

File: `/home/roni/Roni_workspace/helpotron/web/src/index.css`
In the `[data-theme="light"]` block (approx. lines 1479–1526) the `--st-background` custom property is declared twice. Remove the stale/duplicate declaration; keep exactly one, value `#f8f9ff` (must match DESIGN.md `background: '#f8f9ff'`). Nothing else in that block changes.

## Fix 2 — visual QA pass (run it yourself, record results)

1. **Build**: `cd /home/roni/Roni_workspace/helpotron/web && npm run build` — must pass with zero errors.
2. **Dev server**: `npm run dev` (port 5173). Confirm API at `127.0.0.1:8000` responds; do not install anything, do not touch the server.
3. **Screenshots** (headless Chrome, e.g. `google-chrome --headless=new --no-sandbox --window-size=1440,900 --screenshot=/tmp/<view>.png --virtual-time-budget=8000 <url>`). Capture, at minimum, these views + routes, in BOTH `data-theme` states (flip the theme toggle in Settings, and screenshot with `?theme=light` if the app supports it — otherwise capture dark only and note it):
   - `/` landing (must show the REAL HelpoTron logo — never a generic AI "slop" logo)
   - Dashboard (`web/src/components/AppShell.jsx` + `web/src/components/AssignmentCardDashboard.jsx`)
   - Assignment detail (`web/src/components/AssignmentDetailView.jsx`, deep-link `/#assignment=<id>`)
   - History (`web/src/components/AssignmentHistoryView.jsx`) · Settings (`web/src/components/SettingsApp.jsx`) · My Agent (`web/src/components/MyAgentView.jsx`) · Insights (`web/src/components/InsightsView.jsx`) · Library (`web/src/components/LibraryView.jsx`) · Monitors (`web/src/components/MonitorsView.jsx`) · Billing (`web/src/components/BillingView.jsx` + `CreditsView.jsx`) · Data Lake (`web/src/components/DataLakeView.jsx`) · New Assignment modal (`web/src/components/NewAssignmentModal.jsx`) · Auth modal (`web/src/components/AuthModal.jsx` + `AnonymousLanding.jsx`)
4. **Console check**: with `--enable-logging=stderr`, confirm NO JavaScript errors on the dashboard, settings, my agent, and assignment-detail loads. Silent errors = failure.
5. **Contrast sanity**: no white-on-white or teal-on-teal text anywhere in the screenshots; all text readable.

## Constraints (unchanged from the original prompt)

- FULL implementation, no stubs, no placeholder text, no TODO markers.
- No behavior change, no new dependencies, no backend/extension edits. Scope = the two files named above + nothing else.
- WCAG AA contrast; keep real Helpotron branding (logo exists in `extension/assets/logo.jpeg`; never substitute an AI-generated lookalike).
- Commit as `design(stitch): fix duplicate light token + QA pass` with the trailer `Co-Authored-By: Claude Code <noreply@anthropic.com>`. Push ONLY to `origin/design/stitch-redesign` (never master).
- Report: what you fixed, build result, and the list of screenshots taken with any console errors found.
