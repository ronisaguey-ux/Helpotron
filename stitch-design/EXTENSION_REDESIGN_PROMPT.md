# Stitch — Helpotron browser extension redesign ("Capture" experience)

**You are the design partner for Helpotron — an AI academic study copilot for students 16–30 ("Premium Co-pilot"). Calm, trustworthy, premium. This chat covers ONE surface: the browser extension that captures assignments from course websites into the app. Deliver a complete, self-contained design package in the SAME design system described below (this is a separate chat — you do not see the app package; the DNA is fully specified here).**

**Product flow the extension serves:** a student is on any course page — Canvas, Blackboard, a professor's site — opens the extension, it reads the assignment (title, course, due date, instructions), suggests the subject bubble, and sends it to Helpotron where it auto-routes into the dashboard ("Added to Biology 101 — In Progress"). The extension is the INPUT side of the product: quick, calm, zero-friction.

**Brand asset (mandatory):** the real Helpotron logo — metallic dark rounded-square badge, glowing neon-green "H" with an energy swirl (reference image: `HelpoTron_logo.jpeg`). Use it as-is on dark surfaces; on light surfaces put it on a dark container chip or use the glowing-H mark. NEVER invent a substitute, never redraw it, never use a generic robot/flat "H"/clip-art mark. Reference it as `<img src="HelpoTron_logo.jpeg">` — we wire the asset in the build.

---

## 1. DESIGN DNA (token-compatible with the app — keep these names/values exactly)

**Colors — light (default surfaces):** `surface #f8f9ff`, `surface-container-lowest #ffffff`, `surface-container-low #eff4ff`, `surface-container #e5eeff`, `surface-container-high #dce9ff`, `surface-container-highest #d3e4fe`, `on-surface #0b1c30`, `on-surface-variant #3d4947`, `outline #6d7a77`, `outline-variant #bcc9c6`, `primary #00685f`, `on-primary #ffffff`, `primary-container #008378`, `on-primary-container #f4fffc`, `secondary #4648d4`, `on-secondary #ffffff`, `secondary-container #6063ee`, `on-secondary-container #fffbff`, `tertiary #924628`, `error #ba1a1a`, `on-error #ffffff`, `error-container #ffdad6`, `on-error-container #93000a`.
**Colors — dark (the product default — extension ships dark-first):** `background #0e1113`, `surface #1a1c1e`, `surface-container-lowest #0b0e0f`, `surface-container-low #1d2024`, `surface-container #212428`, `surface-container-high #2b2f33`, `surface-container-highest #363a3f`, `on-surface #e6e9ec`, `on-surface-variant #c0c7cd`, `outline #8e9a94`, `outline-variant #3f4a45`, `primary #59d8c9`, `on-primary #00382f`, `primary-container #005049`, `on-primary-container #76f5e5`, `secondary #c0c1ff`, `on-secondary #2f2ebe`, `secondary-container #6063ee`, `on-secondary-container #fffbff`, `tertiary #ffb59a`, `error #ffb4ab`, `on-error #690005`, `error-container #93000a`, `on-error-container #ffdad6`.
**Status semantic palette (chips):** amber = pending/attention, blue = active/in-progress, green = success/completed, gray = archived/legacy; overdue due-dates use error roles. The 9-status product vocabulary: `pending_approval`, `in_progress`, `completed`, `archived`, `paused`, `not_started`, `tracked`, `submitted`, `graded`.

**Typography:** Hanken Grotesk (`font-headline-lg text-headline-lg` 32/40/600, `font-headline-lg-mobile text-headline-lg-mobile` 24/32/600) for headings; Inter (`font-body-md text-body-md` 16/24, `font-body-sm text-body-sm` 14/20, `font-title-md text-title-md` 20/28/600) for UI/body; JetBrains Mono (`font-label-caps text-label-caps` 12/16/500/+0.05em uppercase, `font-tabular-stat text-tabular-stat` 14/20) for labels, keys, metadata, numbers. **Class vocabulary is contract** — the app adopts these exact class names: `font-label-caps text-label-caps`, `font-tabular-stat text-tabular-stat`, `bg-surface-container-lowest`, `bg-surface-container-low`, `bg-surface/80 backdrop-blur-md`, `text-on-surface-variant`, `border-outline-variant/20`, `bg-primary-container/10`, `card-lift` (hover: translateY(-2px), border-color darken, 0 4px 12px rgba(0,0,0,0.03)).

**Radius scale (strict):** `rounded-3xl` hero/container surfaces → `rounded-2xl` inner cards/icon tiles → `rounded-xl` buttons/inputs → `rounded-lg` chips/pills → `rounded-full` avatars/badges. **Spacing:** 4px unit; 16px side margins (popup), 24px container padding, 32px desktop margins; max content 720px (options page). **Density:** standard; compact variant allowed for dense lists.

**Motion (with `prefers-reduced-motion` fallbacks):** fast 120ms ease-out, medium 180ms ease-out, standard 240ms emphasized `cubic-bezier(0.2,0,0,1)`. Micro-interactions: button press scale 0.98 (120ms), card hover lift (180ms), status-chip color transition (180ms), badge pulse (subtle, 1–2 pulses), credits number tick-up, skeleton shimmer, nav item press.

**A11y (contract):** WCAG AA everywhere; 2px accent focus ring + 2px offset on every interactive element; aria-label on icon-only buttons; aria-live for status changes and capture progress; ≥44px touch targets; keyboard-operable; `accessibility.reducedMotion` and `accessibility.highContrast` honored. **Icons:** Material Symbols (one system) labeled by intent (`icon:add`, `icon:capture`, `icon:scan`, `icon:check`, `icon:send`, `icon:link`); never emoji as icons.

---

## 2. SURFACES TO DESIGN (3 files, each with `screen_light.png` AND `screen_dark.png` + `code.html`)

1. **`helpotron_ext_popup`** — the browser-action popup (~380px wide, max ~600px tall). Include ALL states on one screen as a state map + the main states rendered:
   - **Header:** logo badge + "Helpotron" (headline-lg-mobile, primary) + account chip (`font-tabular-stat`, "Credits: 1,240") + settings gear (`icon:settings`, on-surface-variant).
   - **Detected state** (default on a course page): "assignment detected" card (`bg-surface-container-lowest rounded-3xl border-outline-variant/20`): status chip (`In Progress` style), title (body-md semibold), course + due row (`font-tabular-stat text-tabular-stat`, due in error roles if overdue), instructions collapsed 2 lines with expand; subject row with auto-route chip ("Auto-routed: Biology 101", editable subject dropdown); primary button **"Capture Assignment"** (`icon:capture`) → while capturing: skeleton rows + sequential status lines ("Reading page… / Found title, due date…", subtle pulse) → **success state**: "Added to Biology 101 — In Progress" (`icon:check`, green) + "View in Helpotron" link.
   - **No-assignment-found state:** calm empty card (rounded-2xl dashed border) "Nothing assignment-shaped on this page" + secondary "Capture page as notes" fallback.
   - **Error state:** error roles card + Retry.
   - **Logged-out state:** "Sign in to Helpotron" (primary) + one-line privacy note.
   - **Footer:** recent captures mini-list (last 3, each with status chip) + credits chip.
2. **`helpotron_ext_options`** — new-tab page (720px content): Account (connection status, "Connected: @student × × Last synced", Disconnect), Capture behavior (default subject + fallback "Ask every time" toggle, auto-capture on visited assignments toggle), Appearance (theme: System/Light/Dark — mirrors the app; accent: teal/indigo/swatches), Privacy (what's captured list, "Capture only assignment-structured data", links: Privacy Policy / Terms), shortcuts (mono `label-caps` keyboard row). Every row: mono key label + control, exactly the app's setting shape.
3. **`helpotron_ext_onboarding`** — first-run 3 steps, one screen: (1) what it does ("Turn any course page into a study session" + the logo), (2) Connect (account status + Sign in), (3) "Try it on any assignment page" with a mini illustration of the detected-card (no emoji. no generic robot).

## 3. SPEC DOCS (with the screens)

- **`state-maps.md`** — per surface: default / detected / capturing / success / empty / error / logged-out / offline, plus per-status chip example.
- **`component-variants.md`** — buttons (primary/secondary/ghost, sizes), status chips (9-status set with dot + semantic colors), skeleton variants, empty/error cards — each with exact class recipes so the React/extension build is mechanical.

## 4. SELF-CHECK BEFORE SHIPPING (acceptance gate)

- Every surface dark-rendered AND light-rendered; no surface left light-only; html root `class="h-full antialiased dark"` on every file.
- Zero hex-literal classes (`bg-[#…]` etc.) — everything from the token vocabulary above; no invented token names.
- All 9 statuses present in component-variants.md with dot + color + state map.
- Real logo used (not redrawn); zero generic marks; zero emoji icons.
- Focus rings visible in renders; 44px targets; aria-live regions marked.
- File names exactly as specified; no `-v2`/`_final` variants — one canonical set.

Deliver: 3 code.html + 6 PNGs (light+dark each) + state-maps.md + component-variants.md.
