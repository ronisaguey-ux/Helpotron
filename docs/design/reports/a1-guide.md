# A1 Report — GuideView.jsx rewrite (Helpotron redesign mission)

File changed: /home/roni/Roni_workspace/helpotron/web/src/components/GuideView.jsx
Build verified: `cd /home/roni/Roni_workspace/helpotron/web && npm run build` — green (10.5s, all chunks built).
Signature unchanged: `export default function GuideView({ onGoTo, publicMode = false })`; same SectionCard layout, same CSS-var token classes, same jump-chip/`helpotron:open-section` behavior, same publicMode-gated "Still stuck?" block. Only content/text/structure changed. No new deps (lucide-react icons only, all already used elsewhere in the repo).

## 1. What the new guide covers (section list)

Jump chips → collapsed cards (each card = what + numbered "How to use it" + **Pro tips** — tips are new; the FAQ card is new):

1. **Start here** — Getting started (first 30 minutes): signup → extension or manual drop → drop coursework → pick direction → study/launch → balances. (6 steps + tips)
2. **My account** — public-ID/password signup, 7-day trial + 100 tokens, Settings tour: Academic Profile, Writing & Output (writing DNA/tone/formality/voice, citation style), Privacy & Security (2FA authenticator/SMS, analytics, Data Lake opt-in, strict anonymity, export all data, GDPR deletion), Notifications channels (browser/in-app/email/Telegram), Telegram integration setup, Appearance; ⌘K search tip.
3. **My Agent** — one agent; Manual / Auto-Pilot / YOLO modes; permission popups (Approve/Deny/Always auto-approve, default auto-approved: humanize, analyze_rubric, draft_section); Model Effort 1–10 (Low/Balanced/High); streaming replies + live Model Reasoning box; attach/dictate/listen/copy/Launch-to-Doc on replies; recent-actions ledger + rollback (undo); assignment event bubbles (new/due/submitted → open or Launch to Doc); Educational Mode toggle; compact history; live token balance.
4. **Agent Configs** — docked panel (xl) / drawer (below 1280px): rename, identities (presets + custom personas), skills (toggle + template-load), permanent memory (add/edit/delete/load into prompt), files (skill/rule/automation/personality, view + load), avatars.
5. **Workspace** — direction picker (do_it_for_me | study_guide | quiz | flashcards | summary | custom; custom → Data Lake route when unbuildable); 3-stage ribbon (Reading & Rubric → Synthesis & Proofs → Lexical Humanizing with "Passed: X% Human Score"); subagent team cards (WAITING/WORKING/COMPLETE/FAILED + % progress); Stop Execution; per-assignment team chat (same thread as My Agent bubble); Mark as done → Move to history → archived; Export JSON; prompt/rubric/attached files/Saved Materials panels; dump provenance line.
6. **Drop Assignment** — PDF/DOCX/TXT, slides, audio (MP3/WAV/M4A/FLAC) auto-transcribed, images (JPG/PNG/TIFF), video (MP4/MOV), voice recording, pasted text; AI pairing vs manual match; send-with-request or bare; token cost; parts handling; "parsing & transcribing" status.
7. **Library** — Study OS & Library panel on the Dashboard, flashcards (front/back), quizzes (question + answer + explanation), study guides, summaries, uploads (lectures/PDFs/scans), upcoming-deadlines calendar; Saved Materials per assignment.
8. **Launch to Doc** — extension required; targets (open tab or docs.new); typing speed WPM; accessibility cadence preset; "Fine-Tuned Realism Controls (9 Dimensions)": punctuation & paragraph pauses, Gaussian keystroke jitter, false starts & micro-backspaces, burst rhythm, fatigue curve, neighbor typo rate; pause/resume/cancel; word count + estimated time; no tracking.
9. **Extension** — Chrome Web Store live listing + manual .zip (latest version) fallback; per-browser install (Chromium load-unpacked w/ chrome://extensions copyable, Firefox about:debugging temporary add-on, Safari Xcode route); one-click scraper for Canvas/Blackboard/Brightspace/Google Classroom (rubrics, due dates, prompts); natural-language scraper direction ("only scrape calculus problem sets"); lecture recorder (timestamped transcripts → Library); server sync origin pill; local & private — never school passwords; auto-update vs .zip reload.
10. **Data Lake** — submit anything; anonymous-ID storage (never public ID); AI reviewer estimate 0–25 micro-credits immediately; Pending → points awarded when used; redeem 1,000 micro-credits = 1 credit ($1 off); opt-in/opt-out + strict anonymity toggles (opt-out keeps submissions already in review); custom-direction routing note.
11. **Credits & Tokens** — tokens = usage (cost sized to work, spent on LLM/audio/vision API), credits = $1.00 discounts; plans Free Trial (7-day, 100 tokens) / Basic 300 / Pro 1,000 / Elite 2,700 per month; top-bar balances; the >100-token approval gate; Billing plan + top-ups; earn credits (payments, referrals, micro-credits).
12. **Referrals** — single-use 40-char codes; friend 30% new / 15% existing; you earn 2/5/10 credits (Basic/Pro/Elite).
13. **Insights** — cross-subject analytics + recommendations.
14. **History** — (new section) mark done → move to history; still openable/exportable; turned-in separated from active.
15. **Settings & safety gates** — AI & Intelligence (mode, auto-approve list, effort, Edu Mode, AI Detection Standard "Write Like a Sample", Minimum human score, Humanizer Skill) + Safety & Approval Gates (LMS submission, external messages/emails, >100 tokens, flagship models, overwriting finalized drafts).
16. **Message Admin** — direct channel, replies in place, popup notices for serious issues.
17. **FAQ / Troubleshooting** — 10 Q&A: no subagent progress (pick a direction); wrong-assignment dump (check provenance line, attach via assignment bubble); out of tokens (plan cycles, admin grant, top-up, gate); Launch to Doc dead (extension, sync origin, target tab); AI-detection flag (Step 3 humanizing, human score line, Minimum human score, humanizer settings — treated as guidance); where materials went (Library + Saved Materials); extension passwords (no); credits vs tokens; stopping unwanted agent actions (Manual mode, permission popups, Stop Execution, ledger undo); broken/unknown → Message Admin.

## 2. Problems with the old guide

- **Missed features entirely**: the assignment workspace, direction picker, 3-stage pipeline, subagent team cards, Stop Execution, mark-done/move-to-history/export lifecycle, History view, agent Configs (identities, skills, memory, files), ledger rollback, permission popups, 2FA, safety gates, Billing plan tiers, drag-attach-to-bubble, ⌘K search — none appeared.
- **Inaccurate navigation**: "Open Library from the sidebar" — there is no sidebar Library item; it lives in Dashboard's Study OS & Library (a sidebar-only view key exists but isn't in the left nav).
- **Incomplete/flat instructions**: My Agent = 4 steps with no modes, effort, permissions, or configs; Dump's file types/kind support/parsing status were unstated; Launch to Doc's "9 Dimensions" list named sub-dimensions only loosely (modal actually labels pause/jitter/backspaces/burst/fatigue/typo-rate as the 9-dimension realism controls, plus WPM and cadence presets).
- **No tips, no FAQ/troubleshooting, no getting-started path** beyond "create account" marked primary — first-run users got no ordering guidance.
- **Old guide over-stated the sidebar**-centric framing in places (e.g. "Track your token balance in the top bar" was right, but "plan refills monthly" floated without the actual tiers).
- Terminology drift: old glossary lacked micro-credits and Public ID; tokens/credits confusion was unaddressed (now an FAQ entry).

## 3. Contribution to the regeneration spec (Google Stitch, v4)

Guide page — desktop + mobile. Keep it reference-first and scannable; the page must read like a TOC, not a wall of text.

**Overall layout (desktop ≥1280px)**
- Two-column master: sticky left rail (nav + section map, 260px) + main column (max-w ~880px) with the guide content; right rail avoided — the guide is single-flow.
- Top: sticky page header (title, subtitle "Every feature in plain words", glossary terms inline) with a search/filter input ("filter sections") — filters the section map and jumps to first hit; hide on mobile (search moves into the header row).
- Section map: chip grid (icon + label) with one highlighted "Start here" pill; clicking expands the card AND smooth-scrolls; active section highlighted in the rail.
- Cards: one per feature area, collapsible (accordion, chevron), **first card (Getting started) expanded by default**; each has a leading 40px icon tile, title, one-paragraph plain-words summary, and explicit "How to use it" numbered steps + "Pro tips" bullet list. Content lives in a typed content model: `{ id, icon, title, chip, what, steps[], tips[], faqs?[] }` — identical to this rewrite's shape, so the migration is direct.
- Bottom: Troubleshooting & FAQ accordion (10 questions), then a CTA band — primary: "Message Admin", secondary: "Ask My Agent"; pre-signup (public mode) shows "Create account" + "See plans" instead.

**Component inventory (v4)**
1. `GuideHeader` — sticky, glass, title/subtitle/glossary pill row.
2. `SectionMap` — chip rail (horizontal scroll on mobile, wrap grid on desktop).
3. `FeatureCard` — collapsible card: icon tile, title, summary; internal `StepList` (numbered, mono numerals), `TipList` (bullet), `FaqBlock` (Q/A).
4. `GuideSearch` — combobox over section chips, ⌘K-enabled, filters cards.
5. `HelpBand` — CTA card; public/gated variants; admin-only promo slot (reserved for future).
6. `StickyRail` (desktop only) — mini map: current-section indicator while scrolling (IntersectionObserver).

**States**
- Collapsed: one-line tile (icon + title + chevron), zero dead space.
- Expanded: padding p-6→p-8, steps numbered, tips accented.
- Jump: chip click → expand + smooth scroll (event-driven, keeps user's stored collapse pref).
- Search: no match → empty state with "Message Admin" action.
- FAQ answers: collapsible inline (h3 with chevron; one open at a time optional).
- Accessibility: cards as `<section aria-labelledby>`; chips as buttons; keyboard: Tab through, Enter/Space expand; `:focus-visible` ring; 44px touch targets on mobile.

**Mobile variant (<768px)**
- Header: compact — title + glossary chips (wrap, no rail); search field remains but first.
- Section map: sticky top horizontal chip scroller with fade-left/right edges; "Start here" pinned first.
- Cards: full-width, padding p-5, icon 32px; steps/tips single column; FAQ per-question disclosure (tap to open, chevron).
- HelpBand: stacked full-width buttons (44px min-height), glossary collapsible behind "What is X?" disclosure.

**Tokens/style** — M3 role tokens (bg-surface-container-lowest/low/high, text-on-surface, text-on-surface-variant, font-label-caps, font-body-sm, rounded-2xl/3xl cards, outline-variant/30 borders); one accent for primary actions ("Start here", CTA); semantic tint chips (info/ok/danger) for pipeline statuses inside the Workspace card; light/dark via existing token swap — no hard-coded colors. No AI-generated imagery; icons from lucide (already the repo's set).
