# B2 — Landing / Auth / Consent teardown + regeneration spec

Agent B2, read-only. Sources: `/home/roni/Roni_workspace/helpotron/web/src/components/AnonymousLanding.jsx`, `AuthModal.jsx`, `CookieBanner.jsx`, `PrivacyPolicyModal.jsx`, `GuideView.jsx`, `RecoveryFlowModal.jsx`, `App.jsx` wiring, `index.css` tokens, and the Stitch export `helpotron_landing_page_1/3`, `helpotron_sign_in` (screen.png), `helpotron_2fa_security_1/2` (code.html).

**Scale note on the Stitch exports**: `helpotron_landing_page_1/3` are token-shell exports (empty `body` div + full tailwind color/token config; landing_3 adds a logo header row referencing a Google-hosted image — do NOT use that image; the repo's real logo is `/HelpoTron_logo.jpeg` via `AnimatedLogo`). `helpotron_2fa_security_1/2` are full markup with js (segmented OTP + shake error state). `helpotron_sign_in` is screenshot-only and shows the reference two-pane sign-in. The ported `AnonymousLanding.jsx` is the authoritative v2 implementation.

---

## 1. AnonymousLanding.jsx (516 lines) — current anatomy

Rendered whenever `authStatus === 'signedOut'` (App.jsx ~line 653). Contains no authed data by design (auth-gate audit 08-28) — verified, passes.

### Sections (top → bottom)
1. **Fixed header** (h-16, `bg-surface/80 backdrop-blur-md`, border-b `outline-variant/30`, max-w-1440, px `container-padding`): AnimatedLogo (md, wordmark hidden) + "Helpotron" wordmark (22px bold, primary). Desktop nav: Features / Guide / Pricing (label-caps, on-surface-variant → primary hover). Desktop actions: "Sign in" (primary text) + "Get Started" (primary pill, px-6 py-2.5). Mobile: Menu/X icon button → dropdown panel with nav items + 2 stacked full-width auth buttons. Menu closes on Escape / outside tap / link tap; body scroll locked while open.
2. **Hero** (pt-28 pb-16 / md:pt-36): two absolute blurred tone blobs (`bg-primary-container/10`, `bg-secondary-container/10`, blur-[80-100]px); lg 12-col split (6/6). Left: badge pill "Academic Co-pilot 2.0" w/ pulsing dot; H1 `clamp(2.2rem,5vw,3.25rem)` "Your Academic **Co-pilot,** **Redefined**" (gradient primary→secondary span, textWrap balance); body copy 18px; CTAs "Start Free Trial →" (BTN_PRIMARY, ArrowRight) + "Read the Guide" (BTN_SECONDARY, BookOpen); trust chips (3× ShieldCheck green): "No credit card" / "No email required" / "Nothing personal before sign-in". Right: `ProductPreview` — pure-CSS/token static workspace mock in a mac-chrome frame (3 stat cards 12/7/3, subject-bubble rows with tone dots, agent thread skeleton w/ "drafting…" pulse, completed-ledger row "Essay draft — completed 14:02"), `aria-hidden`, generic course names (deliberate — no real student data). All copy checks out as honest (no fake stats, no avatars, no AI images; logo is the real asset).
3. **Features** — "What you actually get", 3 cards (`card-lift`, `bg-surface-container-lowest`, 40px icon chip `bg-primary/15 border-primary/25`): Subject bubbles / An agent per assignment / An honest completion ledger. All three are real product features.
4. **Pricing** — live `GET /api/plans` (`credentials:'omit'`; renders `null` on ANY failure — by design, no stale quotes). Cards: name + "Most popular"/"SMS verified" badges painted INSIDE the header row; price baseline-aligned under name; tagline; token allowance row (`font-tabular-stat`, mt-auto); CTA (popular → BTN_PRIMARY, trial → custom `bg-sem-deepgreen`, else BTN_SECONDARY). Footnote: "1 task token = $0.01 … Credits apply as $1.00 off at checkout." Capabilities list from `plans[0].capabilities`.
5. **How it works band** (`rounded-3xl bg-surface-container-low`): "Three steps to a self-driving coursework pipeline", numbered 01–03 (Create account / Bring coursework / Work and mark complete), CTA "Start free". Brand-flavored copy ("self-driving … pipeline") but factual.
6. **Footer** (`bg-surface-dim`): brand + © 2026; buttons: Privacy Policy, Terms of Service (both → `onOpenPrivacy` = PrivacyPolicyModal w/ tabs), Help Center (→ guide modal), static chip "extension + web".
7. **Guide modal** (far, in-page, not lazy): overlay `rgba(0,0,0,0.55)`, max-w-3xl, sticky header (BookOpen "Guide", X), body `maxHeight: calc(100vh-8rem)`, renders `<GuideView publicMode onGoTo={→signup}>`. publicMode hides the "Still stuck?" authed card. Escape/outside-tap close + body lock.

### Variants & states
- Themes: dark default via `[data-theme]`, light sheet (single markup).
- Header: mobile menu open/closed; scroll shadow not present (static border only — Stitch wanted shadow past 20px scroll, comment says implemented but code shows only border; check in next pass).
- Pricing: present / **absent entirely** if `/api/plans` fails (navigation "Pricing" then scrolls to a nonexistent `#pricing` — silent no-op).
- Guide modal: open/closed, publicMode vs authed content.
- CTAs: hover pairs primary→primary-container ✓, none have `disabled`/loading (landing is static — fine).
- Mobile: nav → hamburger; hero buttons go `w-full sm:w-auto` stacked; ProductPreview collapses (stats 3-up, then bubbles→thread 1-col); features 1-col; pricing 1-col; footer stacks.

### Problems (landing)
| # | Sev | Issue |
|---|---|---|
| L1 | P1 | `/features`, `/pricing`, `/guide`, `/terms`, `/privacy` are in `PUBLIC_PATHS` (App.jsx:265) but the landing NEVER reads `pathname` — every one of those URLs renders the top of the landing. `scrollIntoView` only happens from in-page clicks. Dead URLs. |
| L2 | P1 | No `scroll-margin-top` anywhere (grep: none) — clicking Features/Pricing scrolls the section head under the fixed 64px header. |
| L3 | P1 | `/terms` and `/privacy` URLs don't open the legal modal; footer links work, URLs don't. No `/extension-guide` route exists at all (extension is an authed sidebar section; `/extension` deep link as signed-out just opens the login modal). |
| L4 | P2 | Pricing anchor is a dead scroll target when `/api/plans` fails (section `null`). Needs an honest idle state. |
| L5 | P2 | H1 bypasses the token: inline `clamp(2.2rem,5vw,3.25rem)` instead of `text-display-xl` token (3rem) — token erosion; also "2.0" in the "Academic Co-pilot 2.0" badge is an unverifiable version claim. |
| L6 | P2 | Mixed token systems: trial card paints `bg-sem-deepgreen hover:bg-sem-green text-on-sem-deepgreen` (custom sem roles) while everything else is M3; BTN_SECONDARY uses `text-on-surface` where the M3 pattern suggests `on-surface`/`on-surface-variant` + `bg-surface-container-low` hover (close, but inconsistent with the header's secondary button). |
| L7 | P3 | Footer chip "extension + web" is static — looks like a link, does nothing; footer lacks a sign-in path for mobile users at page bottom (only fixed header offers it). |
| L8 | P3 | Header "shadow past 20px" noted in comments (scroll shadow) — not implemented (border only). |
| L9 | INFO | `ProductPreview` stats (12/7/3) are decorative but read as real product numbers; they're `aria-hidden` + generic labels, acceptable — flag only. |

### Landing REGEN spec (for Google Stitch, next iteration)
Keep: honest copy, live pricing, real logo, code-only product depiction, guide-before-signup modal, all three trust chips (all true).
1. **Header**: unchanged layout; ADD `scroll-margin-top: 88px` (all anchor sections) + scroll-triggered shadow once `window.scrollY > 20`.
2. **Routing fix (with the rewrite, not Stitch)**: on mount, honor `window.location.pathname`: `/features` → scroll to #features (smooth, near-instant), `/pricing` → #pricing, `/guide` → open the guide modal, `/terms` → open legal modal on terms tab, `/privacy` → legal modal on FERPA tab. Replace PUBLIC_PATH dead ends with this one behavior. Social/back-button friendly: pushState then popstate handler.
3. **Pricing**: render section always; if `/api/plans` fails show a 1-line muted note (e.g. "Pricing is temporarily unavailable — please check again shortly.") inside the section so the anchor never dies. Keep live numbers (never hardcode). Popular card: `ring-2 ring-primary/40` + `shadow-md` + scale emphasis; badge row stays inside-card (fixed gutter-misread bug stays fixed).
4. **H1/typography**: use `text-display-xl` at desktop, `text-display-xl--mobile`-style clamp ONLY through a token (define `text-display-xl-mobile` ~2.25rem) — no inline clamp.
5. **Footer**: make the extension chip a real link — new PUBLIC `/#extension-guide` or `/extension` route (see §4); add inline "Sign in" / "Get Started" in footer for bottom-of-page users; move nothing fabricated.
6. **Copy fixes**: badge → "Academic Co-pilot" (no version number); "Three steps to a self-driving coursework pipeline" → keep, it's their product phrase, or soften to "Three steps to a working coursework pipeline" (regen decision: keep — it's brand voice, not a factual claim).
7. **Mobile**: hero text-center? NO — keep left-aligned, tighter px, H1 clamp via token, full-width buttons, ProductPreview directly under copy without the huge mt; features/pricing one column; add sticky bottom "Get Started" bar? No — avoid; the header is already fixed. Keep simple.

---

## 2. AuthModal.jsx (703 lines) — current anatomy

Overlay: `fixed inset-0 z-[100] p-4 bg-black/60 backdrop-blur-sm overflow-y-auto`, `aria-modal`, panel `max-w-md m-auto rounded-3xl bg-surface-container-lowest p-6 sm:p-8` + scoped `@keyframes` entry animations. Backdrop click closes (unless `isMandatory`), Escape closes (unless mandatory), body never locked (backdrop scrolls).

Structure: close X (top-right, hidden if mandatory) → brand banner (AnimatedLogo lg; heading per tab; subtext per tab; "Step 1 of 2 · Legal consent" pill on signup) → **3-way tab pill switcher** ("Sign In & 2FA" / "Create Account" / "Reset Password", `bg-surface-container-low` track, active = lowest+primary+shadow) → **Cloudflare Turnstile** container (login+signup tabs only; lazy-loads `api.js?render=explicit`; widget re-solved after every submission — single-use tokens) → **shared error alert** (`bg-error/15 border-error/30 text-error` + AlertCircle, holds every message of every tab) → active form.

- **Signup form**: Public ID / Username (`User` icon left), Password + eye toggle (`Key` icon), Confirm password + eye toggle (`Lock`), consent checkbox ("Academic Honor Code" + "FERPA / GDPR Terms", amber inline "Check this box to continue."), submit "Create Free Account →"/"Creating Account…". Client rules: len 8+, letter+digit, match, consent required. On success: carries consent to legal gate (`helpotron_signup_consent` in localStorage → PrivacyPolicyModal pre-checks → one Accept click), then auto-login (fresh Turnstile solve) + session handoff `HELPOTRON_SESSION_HANDOFF` postMessage for the browser extension; if auto-login fails: switches to login tab, username prefilled, message "Account created — complete the security check to sign in."
- **Login form**: username + password + "Forgot password?" (→ reset tab); validations: both fields, captcha token if enabled. On `2fa_required` response → **2FA step** replaces the fields inside the login form: card (`bg-surface-container-low border-primary/30`): ShieldCheck chip; "Enter the 6-digit code from your {authenticator app|method} or phone."; single centered input (6-digit, `tracking-[0.5em] font-mono text-xl`, numeric-only, max 6, autoFocus); static pulse line "Hardware / TOTP Synced"; "← Back to password". Submit: "Verify 6-Digit Code & Sign In →"/"Verifying…".
- **Reset form**: email-or-username input (Mail icon), help box "Need instant help? You can also contact Roni directly on Support Chat" — **after 600ms it unconditionally shows success** "Reset Code Dispatched … a 6-digit verification code was sent." → back link.
- Footer: ShieldCheck "Zero Tracking Pixels · FERPA" + mono "Engineered by Solo Dev Roni".

### Problems (auth)
| # | Sev | Issue |
|---|---|---|
| A1 | P1 **honesty/fake** | The whole reset tab is a prop: `handleReset` is a plain `setTimeout(600ms)` — NO api call exists for self-serve reset (api.js only has admin `adminResetPassword`). The success state "a 6-digit verification code was sent" is fabricated. The REAL recovery flow exists: `RecoveryFlowModal` (email code / phone code / ask-the-developer, all wired to the API) — AuthModal simply never uses it. |
| A2 | P1 **2FA spec mismatch** | Stitch `helpotron_2fa_security_1/2` show: 6 segmented cells (`w-12 h-14`, `font-tabular-stat`, dash separator 3+3), auto-advance on type, backspace moves back, error state with shake + inline "Wrong code. Please try again." under the cells + "Try Again" button, secondary block: "Send code via SMS", "Didn't receive a code? / Resend code", and a message/mono-rate legal line. Current port: ONE wide input, no auto-advance, error shown only in the top banner, no resend path (API has `sendChallenge2FA`), no SMS caption. |
| A3 | P2 | Static claim "Hardware / TOTP Synced" — product 2FA methods per api.js are TOTP + SMS only (`setup2FA(method='totp', phone)`); "Hardware" is unverifiable; the code even displays "Synced" with no readiness check. Replace with the actual server `method` value + real state. |
| A4 | P2 | Stitch sign-in reference says "Username or Email" and "student@university.edu" placeholder — product is Public ID **only** (no email signup). The reset tab's email placeholder + "Registered Email or Username" label create false expectations. Never adopt the email field. |
| A5 | P2 | `peReady` pointer-events timing hack (4500ms hard timer + `onAnimationEnd`) exists because keyframe-carried pointer-events stalled in WebKit — regen should use plain opacity/transform animation with no pointer-events animation coupling at all (native end state), dropping the hack stack. |
| A6 | P2 | Tab label "Sign In & 2FA" conflates a security step with the tab; sub-copy mixes `font-body-sm text-xs` (token mismatch); the three tabs make the card top-heavy on <=360px screens (banner + switcher + Turnstile occupy the first fold — WebKit replay comment already documents submit-below-fold on phones). |
| A7 | P3 | Footer "Engineered by Solo Dev Roni" — operator-facing credit inside the auth card; move to landing footer only. |
| A8 | P3 | Turnstile renders for both signup+login but NOT the reset tab, yet signup requires it — inconsistent; on the reset tab a captcha-less fake flow is doubly wrong. |
| A9 | INFO | No demo-mode/guest entry in the auth flow (demo mode + guest banner are authed-only top-bar states; `isGuest` starts true but guest banner renders in the authed shell). This is GOOD for honesty — keep it that way. |

### Auth REGEN spec (Stitch: `helpotron_sign_in` two-pane + `helpotron_2fa_security_1/2` segmented OTP)
**Desktop (≥lg) — two-pane like the reference:**
- Left pane (brand, hidden below lg): `bg-surface` w/ tone-blob background (primary-container/10 blur-[120px] + secondary-blob), AnimatedLogo + wordmark, headline "Master your coursework pipeline." (avoid the reference's "cognitive load" → borrow voice: "Master your coursework."), 2–3 honest trust chips (No email required / No credit card / FERPA-minded privacy), footer note. (No app screenshot with student data — use a blurred, empty-state friendly mock if any; prefer code-only.)
- Right pane: card `max-w-[440px] surface-container-lowest border outline-variant/30 rounded-2xl p-8`: "Welcome back" headline (title-md→headline-lg), sub "Sign in to continue to your study workspace." (matches reference voice). Fields: **PUBLIC ID or username** label (label-caps), input w/ User icon, text-base **16px (iOS zoom guard — keep)**, eye toggle; "Forgot?" as a text link that opens **RecoveryFlowModal** (never a fake inline reset); Turnstile chip (existing widget, keep) with its "Security check required…" caption; primary button full-width h-11 `bg-primary hover:bg-primary-container text-on-primary→on-primary-container rounded-xl` "Sign in →" (keep ArrowRight). Under the card: "New to Helpotron? **Create an account**" (NOT "Request access" — no such flow; keep honest).
- Tabs: keep 2 (Sign in / Create account), pill switcher unchanged, drop the "Reset Password" tab inward to RecoveryFlowModal.

**Create account pane**: current fields + rules (8+ chars letter+digit, confirm match, consent checkbox + amber hint) — restyled to the card system; "Step 1 of 2 · Legal consent" pill kept; submit "Create free account →". Consent carry-over to the legal gate stays (works).

**2FA step (replace current single input; port the Stitch 2FA export faithfully):**
- Card region inside the sign-in pane: ShieldCheck chip + "Two-Factor Authentication" title-md, body "Enter the 6-digit code from your authenticator app." (method from server `res.method`; only render text actually true: TOTP or SMS — never hardware).
- 6 segmented inputs `w-12 h-14 text-center font-tabular-stat bg-surface-container-low border outline-variant rounded-xl focus:border-primary focus:ring-2 ring-primary/50`, 1 char each, `inputMode="numeric"`, `3 + dash + 3` grouping, auto-advance + backspace-backward + paste-spread (copy the reference JS pattern). Hidden `#two-factor-code` mirror keeps the existing React state/redux contract.
- **Error state**: keep cells filled, `border-error bg-error-container/10` on all cells + shake keyframe once; inline `text-error flex gap-1` "Wrong code. Please try again." directly under the cells (remove reliance on the shared top banner); button becomes "Try again".
- Secondary row: "Didn't receive a code?" + "Resend code" (wire `api.sendChallenge2FA(method)` with a 30s cooldown + countdown label — real API, real function), and per reference a small mono-rate legal line only if SMS is actually the method. "← Back to password" kept.
- Success transition: subtle check state (border-sem-green 1s) before `onLoginSuccess` — or keep instant; don't invent animation.

**Shared states**: loading label on submit only; disabled at 6-digit threshold; autoFocus first cell; Escape/backdrop close (non-mandatory); `max-h-[92dvh] overflow-y-auto` panel so phones scroll; keep 16px inputs; remove `peReady` machinery (use a simple 150ms opacity/translate CSS animation — no pointer-events flips).

**Mobile (<lg)**: single centered card, `p-4` page padding; order: small logo (size sm/md centered) → "Welcome back" (text-xl) → card. Banner + switcher are the top fold; consider collapsing the switcher to a 2-pill row under the heading (same as desktop) and pushing Turnstile BELOW the form (widget is wide; it forces a fold bump) — decision for the rewrite. Footer chips ("Zero Tracking Pixels · FERPA") collapse to one line under the button.

---

## 3. CookieBanner.jsx — anatomy, states, problems

Anatomy: fixed `bottom-4 inset-x-4 max-w-4xl rounded-2xl p-5 backdrop-blur-xl` **hardcoded** `bg-[#10121f] border-white/10` (NOT M3 tokens); title row "Student Privacy & Cookie Choice" + purple mono chip "FERPA Compliant" (`bg-purple-500/20 border-purple-500/30`); body "We use essential cookies for secure login and strictly optional anonymous telemetry to improve AI humanizing accuracy. We **never sell student data**, harvest personal essays, or track browsing across external sites."; 3 buttons: "Reject All Optional" (ghost white/10), "Necessary Only" (white/10 + white text), "Accept All & Support Dev" (purple→indigo gradient, glowing). Choice → `localStorage.helpotron_cookie_consent` ('rejected'|'necessary'|'accepted') → unmount; `body.cookie-banner-visible` class reserves bottom scroll space while visible.

States: pre-consent / post-consent (unmount). No decline modal, no per-category picker, no analytics integration visible here.

### Problems
| # | Sev | Issue |
|---|---|---|
| C1 | P1 | Rendered ONLY for authed users: App.jsx:860 `isLoggedIn && termsAccepted && <CookieBanner/>`. The **anonymous landing never shows any consent UI**, even though the landing is the entry surface and the auth modal loads the Cloudflare Turnstile script (third-party challenge widget). Consent surface must cover anonymous visitors too. |
| C2 | P1 | "Accept All & Support Dev" — this is a PATRONAGE claim, not a consent label ("Support Dev" = donation-flavored); "Accept All" implies third-party ad/cookie acceptance that isn't real (only essential + optional telemetry). Misleading on both grounds. |
| C3 | P2 | Fully off-token: hardcoded `#10121f` panel + purple gradient buttons clash with the M3 primary (deep teal) + aurora scheme; needs `bg-surface-container-high`(+blur)/`border-outline-variant/30`, M3 `bg-primary` primary button, `bg-surface-container-low` secondary. |
| C4 | P2 | "Reject All Optional" and "Necessary Only" offer nearly the same thing (reject optional) with different semantics vs "Accept All" — the trio reads like three real choices but is two. Use 2 buttons: "Necessary only" + "Accept all". Keep 3 only if an actual per-purpose toggle sheet exists. |
| C5 | P3 | Copy "improve AI humanizing accuracy" — true per product but reads like a tool pitch; say "anonymous usage analytics to improve Helpotron". |

### CookieBanner REGEN spec
- Show for BOTH anonymous and authed visitors (gate purely on `localStorage`; render it beside the landing too — App.jsx: move it outside the authed branch; keep `body.cookie-banner-visible` spacer).
- M3: panel `fixed bottom-4 inset-x-4 sm:inset-x-6 rounded-2xl border border-outline-variant/30 bg-surface-container-high/90 backdrop-blur-xl p-5 shadow-2xl text-on-surface`; chip `bg-secondary-container/20 text-secondary (or sem-green)` "FERPA-minded" (or keep "FERPA compliant" only while true).
- Actions: `Necessary only` (secondary: `bg-surface-container-low border outline-variant/50`) + `Accept all` (primary `bg-primary hover:bg-primary-container`). Copy: "We use essential cookies for sign-in and optional anonymous usage analytics. We never sell student data." Optional small "Manage" link → would require a real preference sheet: skip unless built (honesty over complexity).
- Mobile: column stack, 2 full-width buttons stacked below the text, `inset-x-4 bottom-4`, tap targets ≥44px.

---

## 4. How the landing links to guide / extension / privacy-terms

- **Guide**: header nav "Guide", hero "Read the Guide", footer "Help Center" → all open the in-page `GuideView publicMode` modal (real, rich: 11 sections incl. Extension card at `guide-ext`) — honest, works. `/guide` URL itself is a dead top-of-landing (L1/L3). Regen: `/guide` opens the modal.
- **Extension guide**: NO public link and NO public page. `/extension` maps to the authed view → signing out deep-links open the login modal. The landing's only "extension + web" mention is an inert footer span; the Guide's Extension card instructs "see Extension view" (auth-gated for a pre-signup reader). Regen: add a public `/extension` route (or `#extension-guide` anchor) rendering a small, real install page (Chrome/Edge/Brave load-unpacked, Firefox temporary add-on — all real steps; optionally reuse `ExtensionInstallView` with a `public` prop stripping the download build button if it needs auth). Link it from the footer chip (make it a real link), the Guide extension card, and the hero trust row only if it earns a slot.
- **Privacy/Terms**: footer buttons both open `PrivacyPolicyModal` (real 5-tab legal: Terms / FERPA / GDPR / Subprocessors table / Billing, mandatory scroll+checkbox+Accept gate for logged-in users with one-click carry from signup consent). `/terms` and `/privacy` URLs do nothing (landing top). Regen: URL opens the modal on the matching tab; also give the legal modal a `tab` initial prop.

---

## 5. M3 class vocabulary available for the regen (index.css `@theme inline`)

Colors: `background, surface, surface-bright/dim, surface-container(-lowest/-low/-high/-highest), primary/primary-container/primary-fixed(-dim), on-primary/on-primary-container/on-primary-fixed(-variant), secondary(-container/-fixed/-fixed-dim), on-secondary(…), tertiary(…), error/error-container/on-error(-container), outline/outline-variant, on-surface(-variant), inverse-*`, plus intentional semantic roles `sem-green, sem-deepgreen, sem-amber, sem-blue, sem-cyan, sem-indigo, sem-slate, sem-gray`, and chart-* family.
Type: `font-display-xl/text-display-xl (48/3.5rem/-0.02em/700)`, `font-headline-lg/text-headline-lg (32/2.5rem)` + `headline-lg-mobile (24)`, `title-md`, `body-lg/md/sm`, `label-caps (12, 0.05em, mono)`, `tabular-stat (JetBrains Mono)`, `code-sm`.
Spacing: `px-container-padding` (24px), `margin-desktop` 32 / `margin-mobile` 16.
Radii: rounded-xl (12) for buttons/inputs, rounded-2xl (16) cards, rounded-3xl bands. Buttons: 44px min height on mobile (h-11), inputs 16px min font (iOS zoom) — both already enforced; keep in regen.

## 6. Top 5 regeneration priorities (B2 verdict)
1. **Kill the fake reset flow** — wire AuthModal "Forgot password?" to the real `RecoveryFlowModal` (email/phone/dev channels all exist); remove the simulated "code was sent" success. (Honesty defect.)
2. **Port the Stitch segmented 6-cell OTP** (`helpotron_2fa_security_1/2`): auto-advance, paste, shake error + inline flag message, Resend via `sendChallenge2FA`, remove fake "Hardware/TOTP Synced".
3. **Make PUBLIC_PATHS real**: `/features`,`/pricing`,`/guide`,`/terms`,`/privacy` deep-link scroll/open the right thing; add `scroll-margin-top`; give `/extension-guide` a genuine public page/anchor; always-show pricing section with an honest offline note.
4. **Re-token CookieBanner** to M3, split it from `isLoggedIn` (show on the landing), reduce to 2 honest buttons, drop "Accept All & Support Dev" patronage label.
5. **Adopt the two-pane sign-in reference** (brand pane + card) at ≥lg, card-only mobile; keep accounts honest (Public ID only — never "Username or Email").
