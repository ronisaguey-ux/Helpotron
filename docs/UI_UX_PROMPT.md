# The prompt — paste into the Claude Code worker

> Run from `/home/roni/Roni_workspace/helpotron` so `CLAUDE.md` and `.mcp.json` load.
> Before starting: `export STITCH_API_KEY="$(cat ~/stitch_api.env)"`.

---

You are now the design engineer for Helpotron, a live product with real students and real payments.
Your mandate, in one sentence: **eliminate user friction, then increase appeal** — in that order.

Read `docs/UI_UX_SWEEP.md`, `CLAUDE.md` and `docs/design/LIBRARIES.md` in this repository before you do
anything else. They hold the environment, the hard rules, the defects a previous manual sweep already
confirmed, and the library decisions. Treat the "already fixed" list as settled.

## THE SHAPE OF THIS JOB

This is a two-stage job with a hard stop in the middle, and the stop is not negotiable.

**Stage 1 — READ-ONLY sweep.** Audit everything and come back with a plan and questions.
**Stage 2 — Execution.** Only after I answer your questions do you change a single file.

During Stage 1 you may: read any file, run the app, drive it with Playwright, run Lighthouse / axe / pa11y,
query Stitch and better-design.
During Stage 1 you may **not**: edit, create, delete, or move any file in the app; install or upgrade a
dependency; commit; build-and-deploy; or "quickly fix" something you noticed. Not even a typo. If you break
this, the audit is worthless — I need to see the product as it actually is, with your findings uncontaminated
by half-finished edits.

---

## STAGE 1 — the read-only sweep

### 1. Walk it as a real user

Create a QA account, accept the consent gate, and go through the product in the order a student would:
signup → consent → empty dashboard → create a subject → dump an assignment → generate a draft → history →
library → insights → credits → settings → API keys → export → browser extension install path.

For every screen record:

- route, and whether the URL is real and shareable;
- time to interactive, and what renders during that window;
- console errors and failed network requests;
- horizontal overflow at 1440 / 1024 / 768 / 390;
- every interactive element under 32px (touch: 44px);
- body-text contrast;
- the four async states — empty, loading, error, success — and which ones are undesigned;
- a screenshot, saved under `reports/ui-audit/shots/before/`.

Test the ugly paths deliberately, not just the happy one: API down, slow 3G, session expired mid-flow,
zero credits, a subject with no assignments, a 40-assignment list, a 4,000-word dump.

### 2. Read the code behind every finding

No finding may rest on a screenshot alone. Cite `path/file.jsx:line`. `web/src/App.jsx` holds the auth and
consent state machine — that is where the worst defects live (landing page on API failure, 1.5–3s landing
flash, consent gate blocking the shell). If the code disagrees with the screenshot, the code wins.

### 3. Numbers, not opinions

`lighthouse`, `axe`, `pa11y` against `/`, `/dashboard`, `/signup`, `/settings`, `/credits`. Save JSON into
`reports/ui-audit/metrics/before/`. Also count: console errors per route, axe critical/serious violations,
tap targets under size, routes missing an `h1`, routes sharing one document title.

### 4. Direction, not decoration

Use Stitch to test the two or three screens where the layout itself is the question — one screen per prompt,
with real content, and this sentence verbatim in every prompt: *"No AI-generated imagery: no stock photos,
no illustration, no hero art, no emoji as iconography. Every visual must be coded CSS and inline SVG."*
Use better-design to test whether the primary action is findable and the spacing survives scrutiny.
You are not producing final designs yet. You are answering: what should this screen look like, and why.

### 5. Write two documents

**`reports/ui-audit/AUDIT.md`** — what is broken, ranked by what it costs the user (lost signup, stuck flow,
perceived jank, wasted click), each entry with: the user-visible symptom, the cause (`path/file.jsx:line`),
the reproduction, the evidence (screenshot + metric), and the fix you propose.

**`reports/ui-audit/PLAN.md`** — the execution plan, in the order you would do it:
the shell first (renders before data, skeleton, real error state, consent inside the shell), then the first
five minutes, then the core loop, then supporting surfaces, then route craft. Per item: what changes, which
files, what "done" looks like, what could break, and how you will verify it — screenshots at 1440 and 390,
four async states, diffed metrics.

---

## STAGE 1 ENDS HERE — the hard stop

When both documents are written, **stop and talk to me.** Do not begin fixing. Do not "start on the obvious
one while I read". Send me:

1. **Five lines**: the three most expensive problems, and what you believe is causing each.
2. **The plan**, compressed to the decisions I actually own — not a task list.
3. **A numbered list of questions.** Rules for the questions:
   - maximum 12, and each one must be a decision I can answer in a word or a sentence;
   - each carries a **marked recommendation**, first, labelled `(recommended)`, plus one or two
     alternatives and the consequence of each;
   - no question whose answer you could have found by reading the code, the docs, or the running product;
   - no "shall I proceed?" filler — I decide the substance, not the permission;
   - group them: [scope] [behaviour] [visual direction] [risk].
4. **What you will NOT touch**, stated up front, so I can correct you before you start.

Then wait. I will answer every question. Your next turn begins execution.

---

## STAGE 2 — execution, after my answers

Work the plan in the order I confirm, honouring every answer I gave — including the ones that override your
recommendation. Where I answered "your call", your recommendation stands.

### Non-negotiables while building

- **No AI-generated imagery.** No stock photos, no illustration, no hero art, no emoji as icons. Coded CSS
  and inline SVG only.
- **Never break a JS hook.** `id` and `data-*` attributes are a contract with the SPA, `popup.js` and tests.
- **Never weaken** checkout, credits, trial, 2FA or CSRF. Restyle freely; restructure carefully.
- **Keep the vocabulary**: subject bubble, assignment, Data Lake, Library, Insights, credits, Study Buddy.
- **No production deploy** without my explicit yes in that turn. Local commits, builds and staging are fine.
- **No secrets** in the repo or in screenshots.

### Quality bar

Every async surface has four designed states. No layout shift on load. No horizontal scroll at 390px.
Hit targets ≥44px touch / ≥32px desktop. Body text ≥4.5:1. Motion ≤200ms, honours `prefers-reduced-motion`.
One primary action per screen. If a control can be inferred, delete it.

### Verify like a user, not like a suite

For every screen you touch: drive it with Playwright, screenshot at 1440 and 390 into
`reports/ui-audit/shots/after/`, confirm the four states, re-run axe and Lighthouse, and diff the numbers
against the "before" baseline. If a number did not move, say so — do not dress a repaint as progress.

### Finish with

`reports/ui-audit/REPORT.md`: what was broken (evidence), what changed (file by file), the before/after
metrics table, what you deliberately left alone and why, and a plain list of what is still bad. A staging
build smoke-tested end to end: signup → first generated artifact. A statement of state, not of effort.

---

## Tone

My words are the acceptance criterion: *eliminating user friction and increasing website appeal.*
Appeal that costs a click is a regression. Friction that looks tidy is still friction.
When the two conflict, remove the step.
