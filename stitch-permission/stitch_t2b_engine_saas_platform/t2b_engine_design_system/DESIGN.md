---
name: T2B Engine Design System
colors:
  surface: '#131314'
  surface-dim: '#131314'
  surface-bright: '#39393a'
  surface-container-lowest: '#0d0e0f'
  surface-container-low: '#1b1c1c'
  surface-container: '#1f2020'
  surface-container-high: '#292a2b'
  surface-container-highest: '#343536'
  on-surface: '#e4e2e3'
  on-surface-variant: '#c3c7cb'
  inverse-surface: '#e4e2e3'
  inverse-on-surface: '#303031'
  outline: '#8d9195'
  outline-variant: '#43474b'
  surface-tint: '#b5c9d8'
  primary: '#b5c9d8'
  on-primary: '#20333e'
  primary-container: '#0b1f2a'
  on-primary-container: '#748895'
  inverse-primary: '#4e616e'
  secondary: '#41e575'
  on-secondary: '#003915'
  secondary-container: '#06c85d'
  on-secondary-container: '#004d1f'
  tertiary: '#e3c0a4'
  on-tertiary: '#422c18'
  tertiary-container: '#2c1907'
  on-tertiary-container: '#9e7f66'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d1e5f5'
  primary-fixed-dim: '#b5c9d8'
  on-primary-fixed: '#091e29'
  on-primary-fixed-variant: '#364955'
  secondary-fixed: '#66ff8e'
  secondary-fixed-dim: '#3de273'
  on-secondary-fixed: '#002109'
  on-secondary-fixed-variant: '#005322'
  tertiary-fixed: '#ffdcc1'
  tertiary-fixed-dim: '#e3c0a4'
  on-tertiary-fixed: '#2a1706'
  on-tertiary-fixed-variant: '#5a422c'
  background: '#131314'
  on-background: '#e4e2e3'
  surface-variant: '#343536'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
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
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-margin: 40px
  gutter: 16px
---

## Brand & Style
This design system embodies "Utility-Chic"—a high-performance, developer-centric aesthetic tailored for B2B SaaS. It draws inspiration from the precision of technical tools and the refined minimalism of modern enterprise platforms.

The brand personality is authoritative, technical, and hyper-efficient. It evokes an emotional response of absolute reliability and industrial-grade power. The visual style is characterized by a "dark-mode first" philosophy, utilizing high-contrast accents and sharp geometry. Elevation is communicated through tonal layering rather than physical shadows, creating a sophisticated, flat-depth interface that prioritizes information density and clarity.

## Colors
The palette is rooted in a deep, professional foundation of Slate and Navy. 

- **Primary Background (#0B1F2A):** The terminal-like base for the entire application.
- **Electric Teal (#14B8A6):** Used for primary actions, success states, and critical paths. It acts as the "active" pulse of the UI.
- **Warm Amber (#F59E0B):** A technical motif used for warnings, highlights, and status indicators that require immediate but non-urgent attention.
- **WhatsApp Green (#25D366):** Reserved exclusively for integration touchpoints and real-time connectivity indicators.

**Layered Greys (Surfaces):**
Depth is achieved through incremental lightness. `surface-low` is for the main content area, `surface-mid` for cards and navigation sidebars, and `surface-high` for hovered states or modal overlays.

## Typography
The typography system pairs the technical, geometric flair of **Space Grotesk** with the utilitarian precision of **Inter**.

- **Headlines:** Use Space Grotesk for all headings. The ink-trap inspired details provide a "engineered" feel at larger sizes.
- **Body:** Use Inter for all reading passages and data-heavy tables to ensure maximum legibility at high densities.
- **Data & Labels:** A monospaced font (JetBrains Mono) is introduced for technical labels, ID tags, and code snippets to reinforce the "utility" aspect of the platform.

## Layout & Spacing
The layout relies on a strict 4px baseline grid to maintain mathematical harmony.

- **Grid System:** Use a 12-column fluid grid for main dashboards. Gutters are fixed at 16px to maintain a compact, data-rich environment.
- **Density:** High density is preferred. Vertical spacing between related items should default to `sm` (8px), while distinct sections use `lg` (24px).
- **Responsive Behavior:** On mobile, margins reduce to 16px and the 12-column grid collapses to a single column. Sidebars transition to full-screen overlays.

## Elevation & Depth
In this design system, elevation is conveyed through **chromatic stacking** rather than drop shadows.

- **Level 0 (Background):** `#0B1F2A` (Primary base).
- **Level 1 (Cards/Sidebar):** `#112936` (Surface-low).
- **Level 2 (Popovers/Tooltips):** `#1A3644` (Surface-mid).
- **Borders:** Surfaces are separated by 1px solid borders using `#244352` (Surface-high). This creates a "blueprint" or "schematic" feel.
- **Teal Glow:** Reserved for primary focus states or active indicators. This is the only exception to the "no shadow" rule, used as a subtle outer bloom to highlight key interactions.

## Shapes
The shape language is strictly **Sharp (0px)**. All containers, buttons, inputs, and tabs must have 90-degree corners. This evokes a sense of technical precision and structural integrity. 

Avoid all rounded corners to differentiate the product from consumer-facing SaaS. The only exception is the "WhatsApp Green" connectivity dot, which remains a perfect circle to denote a live status.

## Components

### Buttons
- **Primary:** Background: Electric Teal; Text: Primary Background; Shape: Sharp.
- **Secondary:** Border: 1px Solid Surface-high; Background: Transparent; Text: White.
- **Ghost:** Background: Transparent; Text: Electric Teal.

### Input Fields
Inputs use a `surface-low` background with a 1px `surface-high` border. On focus, the border changes to Electric Teal with a subtle `teal-glow`. Label text should be `label-caps` in a muted grey.

### Cards
Cards are flat containers with a `surface-low` background and `surface-high` border. Headers within cards use Space Grotesk `headline-md` and are separated by a 1px horizontal rule.

### Chips / Tags
Tags use a dark fill (`surface-mid`) with a high-contrast label. For warning states, use the Amber-highlight for the left-hand border (2px width) to draw the eye without overwhelming the content.

### Lists & Data Tables
Tables should have no outer border, only horizontal separators in `surface-high`. Row hover states use `surface-mid` to indicate selection. Use JetBrains Mono for all numeric data.