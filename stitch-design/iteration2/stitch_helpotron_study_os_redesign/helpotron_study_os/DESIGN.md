---
name: Helpotron Study OS
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3d4947'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#6d7a77'
  outline-variant: '#bcc9c6'
  surface-tint: '#006a61'
  primary: '#00685f'
  on-primary: '#ffffff'
  primary-container: '#008378'
  on-primary-container: '#f4fffc'
  inverse-primary: '#6bd8cb'
  secondary: '#4648d4'
  on-secondary: '#ffffff'
  secondary-container: '#6063ee'
  on-secondary-container: '#fffbff'
  tertiary: '#924628'
  on-tertiary: '#ffffff'
  tertiary-container: '#b05e3d'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#89f5e7'
  primary-fixed-dim: '#6bd8cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#005049'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#07006c'
  on-secondary-fixed-variant: '#2f2ebe'
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#ffb59a'
  on-tertiary-fixed: '#370e00'
  on-tertiary-fixed-variant: '#773215'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-xl:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  tabular-stat:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 24px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style
The design system for this academic "Study OS" is built on the philosophy of **Cognitive Calm**. It serves as a premium, unobtrusive co-pilot for high-stakes learning. The aesthetic is **Corporate Modern** with a focus on organizational clarity and systematic precision.

The UI avoids visual noise to minimize cognitive load, employing generous whitespace and a "content-first" hierarchy. It balances the rigor of academia with the fluidity of modern AI tools, ensuring the environment feels like a focused digital sanctuary rather than a cluttered dashboard.

**Key Settings Keys:**
- `appearance.uiStyle`: Defaults to "refined-academic" (clean lines, subtle depth).
- `appearance.animation`: Controlled transitions to maintain focus without distraction.

## Colors
The palette is rooted in a neutral surface system to provide a stable foundation for long study sessions. The primary accent is a sophisticated **Teal (#0D9488)**, chosen for its balance of energy and tranquility. 

- **Neutral Base:** Uses a slate-scale for the light mode and a deep charcoal-slate for dark mode to reduce eye strain.
- **Dynamic Accent:** Users can toggle `appearance.accent` between the default Teal and an Indigo (#6366F1) through the `display.custom_color` setting.
- **Status Semantic Palette:** 
    - **Amber:** Pending/Attention needed.
    - **Blue:** Active/In progress.
    - **Green:** Success/Completed milestones.
    - **Gray:** Archived/Legacy content.

All color combinations must pass **WCAG AA** contrast ratios.

## Typography
This design system utilizes a highly legible, 4-step type scale designed for dense information. 

- **Primary Sans:** **Hanken Grotesk** is used for headings to provide a sharp, contemporary academic feel.
- **Interface/Body:** **Inter** is the workhorse for all UI elements and body copy, ensuring maximum readability.
- **Technical/Utility:** **JetBrains Mono** is used for labels, metadata, and status indicators where **tabular numbers** are required for alignment in study logs and timers.

**Accessibility Overrides:**
- `accessibility.dyslexiaFriendly`: When enabled, global font-family switches to `lexend` or `openSans` with increased character tracking.
- `display.font_size` / `appearance.fontScale`: Adjusts the base 16px value while maintaining the modular scale ratios.

## Layout & Spacing
The system employs a **Fluid Grid** model with strict 4px/8px increments. 

- **Desktop:** 12-column grid with a maximum content width of 1440px. 
- **Tablet:** 8-column grid.
- **Mobile:** 4-column grid with 16px side margins.

**Density Modes:**
- `appearance.density` / `display.compact_mode`: Toggles between "Standard" (16px padding on cards) and "Compact" (8px padding, reduced typography line-height) for data-heavy research views.
- **Whitespace:** Emphasize vertical rhythm. Study sessions (reading mode) should have a focused 680px center column with wide margins to aid concentration.

## Elevation & Depth
Depth is conveyed through **Tonal Layers** rather than heavy shadows. This maintains the "OS" feel where the interface feels like a single, cohesive surface.

- **Level 0 (Base):** Neutral background color (`#F8FAFC` in light mode).
- **Level 1 (Cards/Sidebar):** Pure white or high-contrast surfaces with a **1px subtle border** (#E2E8F0) and no shadow.
- **Level 2 (Modals/Popovers):** Surface with a **Soft Restrained Shadow**: `0px 4px 20px rgba(0, 0, 0, 0.05)`.
- **Level 3 (Active AI Chat):** Uses a subtle backdrop blur (12px) to differentiate the "co-pilot" overlay from the static academic content.

## Shapes
The shape language is sophisticated and approachable. All primary interactive elements (buttons, input fields, cards) follow a consistent corner radius.

- **Standard Radius:** 12px (rounded-lg).
- **Large Container Radius:** 16px (rounded-xl).
- **Selection/Tag Radius:** 6px (rounded-md).

These radii should be consistent across both light and dark modes to maintain the "Study OS" identity.

## Components

### Buttons & Inputs
- **Primary Action:** Solid fill with the chosen accent color. 12px radius. 44px minimum height for `accessibility.largeText`.
- **Input Fields:** Ghost style with 1px border. Focused state uses a 2px accent ring. Label text always persists above the field.

### Academic Cards
- Used for "Study Sets" or "Flashcards." These must feature a clear header, progress bar (using status colors), and a 16px radius.
- Shadows are restrained; hover states should utilize a subtle 2px vertical lift and a slight border-color darken rather than a heavy shadow.

### Status Chips
- Pills (fully rounded) with low-opacity background tints of the semantic colors (e.g., 10% Blue for "In Progress") and high-contrast text.

### AI Interface
- The AI "Study Co-pilot" component should use a distinctive "Glassmorphism" effect or a subtle gradient border to distinguish machine-generated assistance from user-owned content.

### Accessibility Standards
- `accessibility.reducedMotion`: Disable all parallax or non-essential scaling transitions.
- `accessibility.highContrast`: Increase border weights to 2px and use pure black/white for text contrast.