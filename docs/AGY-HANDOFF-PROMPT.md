# Prompt for AGY — continue the Helpotron redesign

> Run `agy` from `/home/roni/Roni_workspace/helpotron`, then paste everything below the line.
> Your MCP servers and skills are already wired (see `docs/HANDOFF.md` §0).

---

You are picking up a live redesign of Helpotron, a product with real students and real payments. The
previous agent did the audit and shipped six fixes to production; the remaining work is defined, decided and
documented. Your job is to continue it without re-litigating what is already settled.

**Read, in this order:** `docs/HANDOFF.md` (environment, deploy, traps, what shipped, what is next) →
`docs/design/DIRECTION.md` (the owner's 31 decisions, the settled seven-step flow, the three screens he drew,
the banned vocabulary) → `reports/ui-audit/findings.json` (`summary` first, then `open_ids` by severity).

Then state, in five lines, what you believe the three most expensive problems are, and which finding IDs you
will close first. Do not start editing before you have done that.

## What is already decided — do not reopen

The owner answered twenty questions in one sitting so this phase could run without stopping him. All 31
decisions are in `DIRECTION.md` §1. The order is decided too: **cheap global fixes first, then the new flow
behind a flag only his account sees.** If a decision looks wrong to you, implement it and say so in your
report — do not stop to re-ask.

## How to work

1. **Measure before and after, every time.** `axe <url> --save out.json --exit` and `lighthouse` on the real
   pages; Playwright for screenshots at 1440 and 390. `pa11y` is broken on this box — don't fight it.
2. **Verify against the deployed page, not the diff.** The previous agent regressed the landing page's `<main>`
   landmark by reasoning from a correct-looking change, and only caught it by re-running axe live. Read
   `HANDOFF.md` §3 before your first commit; each trap there cost a deploy cycle.
3. **Commit with the hook in mind:** ≤2 files, ≤400 changed lines, `type: imperative subject` ≤72 chars, no
   `--no-verify`. Ask the `commit-condom` MCP to `plan` a split when a change is bigger than one commit.
4. **Batch by surface, not by file type.** One screen finished end to end — four async states, one filled CTA,
   its own `<title>`, axe clean at 1440 and 390 — beats five screens half-done.
5. **Delete before you add.** The thesis is that the product is too complex: if a control can be inferred, or
   the server can decide it, it should not exist in the UI.

## Use the tools you have

- `stitch` — one screen per prompt when the layout itself is the question. Put this sentence in every prompt
  verbatim: *"No AI-generated imagery: no stock photos, no illustration, no hero art, no emoji as iconography.
  Every visual must be coded CSS and inline SVG."*
- `better-design` — critique the rendered page, not the mock: spacing, hierarchy, whether a stranger finds the
  primary action.
- `impeccable` — run its critique on a screen before you redesign it, then polish per screen.
- `design-taste-frontend` — direction for a composition; skip it for a fix.
- `playwright` + `chrome-devtools` — drive and inspect the real site; `browser_run_code_unsafe` for multi-route
  sweeps.
- `context7` — current React 19 / Tailwind v4 / motion APIs instead of guessing.
- `penpot` — only if the owner has the stack up (`penpot status`); the stack is normally stopped to save RAM.

## Non-negotiables

- **No AI-generated imagery.** Coded CSS and inline SVG only.
- **Keep every JS hook.** `id` and `data-*` are a contract with `App.jsx`, `popup.js` and the tests.
- **Never weaken** checkout, credits, trial, 2FA or CSRF while restyling.
- **Keep the vocabulary** in `DIRECTION.md` §3; purge the banned list everywhere.
- **No production deploy without the owner's explicit yes in that session** — his earlier consent does not
  roll forward.
- **No secrets** in the repo or in screenshots.
- **`tele-report "<text>"`** is how you reach him; he does not read this session's text.

## Finish with

`reports/ui-audit/REPORT.md` updated: what you closed (finding IDs), what you changed file by file, the metric
delta (axe violations, tap targets, overflow at 390, console errors), what you deliberately did not touch, and
what still needs his decision. Plus the two loose ends the previous agent left: **a real generation run** on
assignment id 65 (2000 tokens ready on the QA account) and **deleting `qadesign1`** when the audit is done.
Report state, not effort.
