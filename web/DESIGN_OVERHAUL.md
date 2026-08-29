# Helpotron Design Overhaul — Aurora (2026-08-28)

## Direction (user-selected)
**Bold glassy aurora**: deep-space background, frosted-glass panels, violet→cyan aurora gradients, glow accents. **Full app, one pass.** Plus **information architecture cleanup**: group related features, de-clutter buttons, fewer chunky controls.

## Design language

1. **Background**: deep space (`--bg-base: #05060e`) with 3 aurora orbs (violet top-left, cyan top-right, indigo bottom). Class `.app-background` / default `.app-canvas` already carry them — do not add more backgrounds.
2. **Surfaces**: frosted glass. Already implemented on `.clean-card`, `.glass-panel` (blur 18px saturate 150%, hairline border, top gradient accent line violet→cyan), `.clean-input`/`.glass-input` (blur 8px), `.surface-glass-strong` (modals/drawers, blur 28px).
3. **Accent**: violet `#8b5cf6` (hover `#7c3aed`), secondary cyan `#22d3ee`. `--accent-mix` = violet→indigo→cyan gradient. Use `--accent*` tokens; never hardcode a new hex when one of these fits.
4. **Glow**: signature, not confetti. On: primary CTAs (already in `Button` primary variant), active nav items, hero headline accent. Nowhere else by default.
5. **Gradient text** (`.text-aurora`): logo wordmark and one hero headline per page max.
6. **Chips** (`.aurora-chip`): status/feature pills — already defined.
7. **Typography**: keep the readability floor (html 110%, nothing below 12px). Hierarchy: page title 24–28px/600, section title 16–18px/600, body 14–15px, muted 13–14px. Buttons 500 weight, ≤2 words.
8. **Spacing**: card padding 20–24px, section gap 24px, grid gap 16–20px, consistent 8px baseline rhythm.
9. **Radius**: cards 20 (`--radius-lg`), controls 14 (`--radius-md`), buttons/inputs 10 (`--radius-sm`).

## Information architecture rules (the "de-clunk" half)

1. **Max 1 primary + 2 secondary controls per section.** If a toolbar has 3+ buttons, group: primary CTA stays; secondary actions go into an "⋮ More" menu or icon row with tooltips; never 5 buttons side by side.
2. **Group features**: related cards/sections belong in one container with tabs or a divider, not scattered siblings. Watch for: duplicate action rows, two "Refresh" buttons on one view, stat cards that could be one row.
3. **Buttons**: shorten labels ("Export CSV Ledger" → "Export"), no labels on icon-only buttons without `aria-label` + `title`. Prefer `variant="ghost"` for row-level actions, `secondary` for toolbars, `primary` for the single CTA per view.
4. **Empty states**: one consistent glass empty-state card: icon (large, muted), one-line title, one-line hint, optional one CTA.
5. **Nav**: top nav ≤7 items; admin surfaces live under one "Control Center" entry. No dead links. Nav active state = violet glow chip.
6. **Tables/lists**: zebra off; row hover = subtle `bg-[var(--color-surface-raised)]/50`; one consistent header style.
7. **Never shrink touch targets** below the existing 44px floor.

## Hard rules

- **DO NOT edit `web/src/index.css` or `web/src/components/Button.jsx`** (both already updated to the aurora foundation — consume them). If you need a utility that does not exist, add a small scoped `<style>` or inline `style=` in YOUR component only.
- **No behavior changes**: keep every handler, state machine, prop, data-testid, selector, localStorage key, API call exactly as-is. Restyle and rearrange DOM only. The auth-status machine in App.jsx, the 45s lifecycle poll in MyAgentView, assignmentEvents logic — all untouched.
- **No content/copy changes** except shortening button labels per IA rule 3 and empty-state hint text.
- **Keep it working for the appearance engine**: components must keep reading `var(--…)` tokens or Tailwind stems that the engine remaps (bg-slate-950, text-slate-400 etc. are remapped by `html[data-theme]/[data-accent]` rules). When you need a hardcoded look, prefer `bg-[var(--bg-surface)]`-style vars.
- **Do not run `vite build`** (the orchestrator rebuilds centrally). Validate syntax per file:
  `./node_modules/.bin/esbuild src/components/<File>.jsx --loader:.jsx=jsx --jsx=automatic --outfile=/dev/null`
- **No git push/commit. No pkill. No systemd/uvicorn/cloudflared restarts. No sudo. Stay inside the helpotron repo. Never touch ~/.claude.**

## Verification you should do yourself (read-only)

- Dev UI is NOT rebuilt mid-pass; do not expect your changes to appear at localhost:5173 until the orchestrator rebuilds. Judge your work by reading your diff, not by looking.
- Before/after sanity: `git diff --stat` at the end should list exactly your assigned files.

## Report format

Files changed (list), IA regroupings you made (each with "before → after" one-liner), any component that could not be styled cleanly and why, anything you found that looks like a pre-existing bug (do not fix outside your files — report it).
