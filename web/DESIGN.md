# Helpotron Web — Design Token Reference

Source of truth: `src/index.css` (CSS custom properties) + the Tailwind v4 utility
classes the components actually ship. The two layers run in parallel and must
never drift apart. Every value below was extracted from shipped code, not invented.

---

## 1. Design philosophy

- **Dark academic OS.** Near-black canvas (`#0E1113`, the Luminous Glass base),
  quiet slate surfaces, restrained decoration. Dark-first, and a light theme
  DOES exist (`[data-theme="light"]`, `index.css:191`); dark remains the default.
- **One interaction accent: M3 Electric Teal.** `#78F5E5` (`--st-primary`,
  `index.css:41`) is the only color for buttons, active states, focus rings,
  selected tabs, links. `--accent` aliases it (`index.css:151`, `:276`), so the
  legacy blue tokens below resolve to teal in the shipped app — the live site is
  teal. Nothing else is interactive-anything.
- **Emerald = live / active / working.** Emerald signals status only: the agent
  avatar's ready/working ring, the "Saved" flash, running indicators. Never
  decorative, never used for buttons.
- **Slate text scale** (white → slate-600) with a documented contrast floor
  (see §9). Meta text is muted on purpose.
- **Motion is scarce.** Animation belongs to brand (logo) and status (avatar,
  live nodes) — never decoration on content.
- **Two token layers**: CSS custom properties (canonical values, consumed in
  `index.css` itself) and Tailwind utilities (consumed in JSX). When you change a
  color, update BOTH the token and its Tailwind twin.

---

## 2. Core tokens — CSS custom properties (`index.css :root`)

| Token | Value | Usage | Tailwind twin |
|---|---|---|---|
| `--bg-base` | `#090d16` | page canvas, `body` bg, `.app-background`, sticky header `bg-[#090d16]/85` | `bg-[#090d16]` |
| `--bg-surface` | `#0f172a` | cards (`.clean-card`, `.glass-panel`), range-slider thumb border | `bg-slate-900` |
| `--bg-surface-elevated` | `#182238` | raised surfaces above cards | `bg-slate-800` |
| `--border-subtle` | `rgba(255,255,255,0.07)` | default 1px card/input borders | `border-white/8` |
| `--border-hover` | `rgba(255,255,255,0.15)` | card border on hover | `border-white/10`+ |
| `--accent` | `var(--st-primary)` → `#78F5E5` | primary buttons, focus rings, active states, slider thumbs, scrollbar | `bg-primary` / `text-primary` |
| `--accent-hover` | `var(--st-primary-container)` → `#59D8C9` | accent on hover / pressed | `bg-primary-container` |
| `--accent-subtle` | teal at low alpha | soft teal fills (active nav items) | `bg-primary/15` |
| `--text-primary` | `#f8fafc` | headings and body (slate-50) | `text-white` |
| `--text-secondary` | `#cbd5e1` | secondary text, 5.8:1 contrast (slate-300) | `text-slate-300` |
| `--text-muted` | `#94a3b8` | meta text, WCAG AA 4.5:1 (slate-400) | `text-slate-400` / `text-slate-500` |
| `--radius-sm` | `8px` | small chips, buttons, tabs | `rounded-lg` |
| `--radius-md` | `12px` | inputs (`.clean-input`), small cards | `rounded-xl` |
| `--radius-lg` | `16px` | cards (`.clean-card`) | `rounded-2xl` |

**WCAG AA interaction set** (same `:root`, oklch):

| Token | Value | Role |
|---|---|---|
| `--color-primary` / `-hover` / `-active` | `oklch(0.62/0.56/0.5 0.16-0.17 230)` | accessible primary action scale |
| `--color-primary-foreground` | `oklch(0.99 0.005 240)` | text on primary |
| `--color-focus-ring` | `oklch(0.7 0.19 235)` | focus-visible rings |
| `--color-surface` / `-raised` | `oklch(0.16/0.21 …260)` | surface pair |
| `--color-border-soft` | `oklch(0.32 0.03 255)` | soft borders |
| `--chart-1…5`, `--chart-*` | oklch set (14 tokens) | chart series, axes, crosshair, tooltip, markers; dark-mode overrides in `.dark` |

---

## 3. Tailwind palette — what JSX actually uses

### Surfaces
| Class | Use |
|---|---|
| `bg-[#090d16]` | root shell, sticky header (`/85 backdrop-blur-xl`) |
| `bg-slate-950` | progress track, deep wells |
| `bg-slate-900` / `bg-slate-800` | raised panels, timeline dots (`bg-slate-800 border-white/10`) |
| `bg-slate-700` | toggle track (off state) |
| `bg-white/4` / `bg-white/5` | ghost buttons, chips, hover fills (hover `bg-white/5`, `hover:bg-white/6`) |
| `bg-white/8` | section dividers, subtle fills |

### Borders
| Class | Use |
|---|---|
| `border-white/3` | table row hover fills |
| `border-white/5` | table row separators, progress track border |
| `border-white/8` | panel dividers (`border-b border-white/8`), thead rows, timeline rail (`w-px bg-white/8`) |
| `border-white/10` | kbd, chips, timeline dots, card edges |

### Accent (teal) — interaction only
The shipped JSX uses the semantic names almost exclusively — `bg-primary` (326),
`text-primary` (550), `border-primary` (148) — which all resolve to
`--st-primary` `#78F5E5`. Only a handful of legacy raw blue utilities remain
(`bg-blue-500/600`, `text-blue-300/400`, `border-blue-500`: 11 uses total), and
because `--accent` is aliased to `--st-primary` they render teal anyway. Prefer
the semantic names; the raw blue utilities are migration leftovers.
`bg-primary` (primary buttons, active toggle, active segmented button),
`bg-primary-container` (hover of primary), `bg-primary/15` + `border-primary/30`
(active nav item), `bg-primary/20` (active tab),
`text-primary-container` (active text), `text-primary` (icons, stat accents, live dots).

### Status (emerald / amber / rose / cyan / purple / indigo)
| Color | Status meaning | Canonical combo |
|---|---|---|
| emerald | live, working, saved, completed | `bg-emerald-500/10 text-emerald-300 border-emerald-500/30`, dot `bg-emerald-400`, ring `ring-emerald-500/40` |
| amber | warning, open, flagged | `bg-amber-500/10 text-amber-300 border-amber-500/30` |
| rose | down, failed, error | `bg-rose-500/10 text-rose-300 border-rose-500/30` |
| purple | automation / AI runs | `bg-purple-500/10 …` |
| cyan | study activity | `bg-cyan-500/10 …` |
| indigo | `ai.*` events | `bg-indigo-500/10 …` |
| slate | neutral | `bg-white/5 text-slate-300 border-white/10` |

---

## 4. Spacing scale (verified in use)

| Step | px | Seen in |
|---|---|---|
| 0.5 | 2 | toggle knob inset, timeline dots |
| 1 | 4 | icon gaps, `gap-1` segmented grids |
| 1.5 | 6 | `px-1.5` kbd, chip text, `gap-1.5` tabs, `mt-1.5` hints |
| 2 | 8 | `px-2` display-mode buttons, `py-2` cells |
| 2.5 | 10 | `px-2.5 py-1.5` segmented/status buttons, nav item `gap-2.5`, `mt-2.5` |
| 3 | 12 | `px-3 py-2` inputs, `px-3 py-2.5` nav items, `gap-3` headers |
| 3.5 | 14 | icon sizing `w-3.5 h-3.5`, `px-3.5` |
| 4 | 16 | `px-4 py-2` primary buttons, `gap-4` toggles, `w-4 h-4` icons |
| 5 | 20 | card padding `p-5`, `gap-5` page grids |
| 6 / 10 | 24 / 40 | dense card `p-6`, empty states `p-10` |

Icons: `w-4 h-4` standard, `w-3.5 h-3.5` inline, `w-3 h-3` in badges; icon buttons `w-7 h-7`; toggle `w-9 h-5`. Never reach for a step not on this scale.

## 5. Radius scale

| Class | px | Use |
|---|---|---|
| `rounded-md` | 6 | badges, kbd |
| `rounded-lg` | 8 | buttons, tabs, chips, section toggles |
| `rounded-xl` | 12 | inputs, nav items, small cards |
| `rounded-2xl` | 16 | cards, logo aura |
| `rounded-full` | ∞ | dots, pills, toggles, sliders, scrollbar thumb |

## 6. Typography

| Size | Use |
|---|---|
| `text-[8px]`–`text-[9px]` | logo micro-stats, help captions |
| `text-[10px]` | buttons, labels, meta — the workhorse control size |
| `text-[11px]` | subtitles, descriptions, meta rows |
| `text-xs` (12px) | body text, table cells, toggle labels |
| `text-[13px]` | SectionCard titles |
| `text-sm` (14px) | section headers, card titles |
| `text-lg` / `text-2xl` | StatCard values (`text-2xl font-bold text-white`) |
| `font-mono` | meta readouts: timestamps, effort scores, slider values (`text-[11px] font-mono text-primary-container`) |
| `tracking-wide` / `tracking-wider` | uppercase section labels (`text-[10px] font-bold uppercase tracking-wider text-slate-500`) |
| `tracking-widest` | logo only |

Hierarchy: `font-medium` interactive text, `font-semibold` titles, `font-bold`
card titles, `font-black` logo only. Font family: system stack (`-apple-system,
BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif`).

---

## 7. Component conventions

**Buttons — three tiers.**
1. **Primary**: `bg-primary hover:bg-primary-container text-white text-xs font-semibold px-4 py-2 rounded-xl` (or compact `px-2.5 py-1.5 rounded-lg text-[10px] font-medium`).
2. **Ghost**: `bg-white/4 text-slate-400 hover:text-slate-200 hover:bg-white/6` (active variant `bg-primary text-on-primary` — display-mode segmented control).
3. **Tab/segmented**: active `bg-primary/20 text-primary-container border border-primary/30`; inactive `text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent`.

**Chips / badges** (`ui/os.jsx` `<Badge color>`): `inline-block rounded-md px-2 py-0.5 text-[11px] font-medium border` +
`bg-{color}-500/10 text-{color}-300 border-{color}-500/30`. `StatusBadge` maps
status → color (operational=green, warning=amber, down=red, running=primary…).

**Cards** (`clean-card`, `glass-panel`): `bg-surface`, 1px `border-subtle`,
`rounded-lg`→16px, hover raises border to `--border-hover` (0.2s ease).
`SectionCard` wraps any card with a collapsible header; dividers are
`border-b border-white/8`; default padding `p-5`.

**Inputs** (`.clean-input`): `rgba(15,23,42,0.8)` fill, 1px `border-subtle`,
`rounded-md`→12px, focus = `border-accent` + `box-shadow: 0 0 0 3px rgba(59,130,246,0.15)`.

**Section headers** (`SectionHeader`): title `text-sm font-semibold text-white`,
subtitle `text-xs text-slate-500 mt-0.5`; collapsed strips keep title only.

**Controls**: `Toggle` (`--st-primary` on / slate-700 off, white knob), `Slider`
(`os-range` track gradient `#1e293b → #334155`, `--st-primary` thumb), `Tabs`, `Kbd`
(`px-1.5 py-0.5 rounded-md bg-white/5 border-white/10 text-[10px] font-mono`),
`Timeline` (22px `bg-slate-800 border-white/10` dots, `w-px bg-white/8` rail),
`DataTable` (thead `border-white/8 text-slate-500`, rows `border-white/5
text-slate-300`, hover `bg-white/3`), `Progress` (slate-950 track, gradient fill).

**Avatars** (`AgentAvatar`): ready = `ring-1 ring-emerald-500/40`, working =
`ring-2 ring-emerald-400 shadow-[0_0_12px_rgba(34,197,94,0.6)]` + `animate-ping`
halo, status dot `bg-emerald-400` (error = `bg-amber-500`).

---

## 8. Motion

| Keyframe | Class | Duration | Where |
|---|---|---|---|
| `cyber-spin-slow` | `animate-cyber-spin` | 8s linear infinite | logo aura (`from-cyan-500/30 to-emerald-500/30` glow) |
| `visor-scanline` | `animate-visor-scan` | 2.5s ease-in-out infinite | logo / avatar scan sweep |
| `aperture-pulse` | `animate-aperture-pulse` | 2s cubic-bezier(0.4,0,0.6,1) | working avatar (emerald→cyan glow, scale 1→1.04) |
| `pulse-soft` | `animate-pulse-soft` | 2.4s ease-in-out infinite | live system-map nodes (teal halo) |
| `animate-ping` / `animate-pulse` | — | Tailwind | avatar working halo, progress pulse |

**Appropriate only for**: brand (logo) and status (live/working nodes). Never on
cards, text, or content. `prefers-reduced-motion` is globally enforced in
`index.css` (all animation/transition → 0.01ms).

---

## 9. Rules (enforced)

1. **Never invent a color.** Every hex/rgba must trace to §2–§3 or the oklch
   set. If a new color is genuinely needed, add it to the token table with a
   contrast note — that is the process, not a shortcut.
2. **Scale-only geometry.** Spacing from §4, radius from §5. No arbitrary
   margins or `rounded-[xpx]` unless a token exists for it.
3. **Dark-first.** Surfaces are always slate-950-family navy + white-alpha
   borders. Never ship a light surface or a hard white border.
4. **Contrast floor.** Readable text ≥ 4.5:1 (slate-400 `#94a3b8` is the floor;
   secondary ≥ 5.8:1). Below that is meta/disabled only. Teal `#78F5E5` on
   `#0E1113` is the interaction pair; focus rings are 2px `#78F5E5` offset 2.
5. **Semantic color lock.** Teal = interaction, emerald = live/active status.
   Never use emerald for a button, never use teal for a status dot.
6. **Border alphas ≤ 0.15** on surfaces; hover raises to white/10–15.
7. **Motion is budgeted** — new keyframes only via this doc; animate brand and
   status, nothing else.
8. **Accessibility is built-in**: 44×44px touch targets on coarse pointers,
   reduced-motion, 5px scrollbar with `rgba(255,255,255,0.12)` thumb.

---
<!-- Generated 2026-08-23. Values verified against src/index.css and src/components/*.jsx. -->
