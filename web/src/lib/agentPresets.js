/**
 * agentPresets.js — the agent's identity and skill library.
 *
 * ── WHY THIS FILE IS EMPTY (owner, 2026-09-19) ──────────────────────────────
 * It used to ship five canned identities (Scholar, Editor, Coach, Co-Pilot,
 * No Identity) and six canned skills (Sandbox Math Verification, LaTeX
 * Derivations, Humanizer Cadence, Socratic Inquiry, Citation Verifier, Code
 * Synthesis), and a new account started with three of the skills switched on.
 *
 * Owner: "remove all default skills/identities — blank slate."
 *
 * The reasoning, because this will be tempting to undo: every one of those
 * presets was a decision made for the user about how their own agent should
 * think and write. They made the Configs panel look populated on a brand-new
 * account — which reads as "these are yours, they came with the product" — and
 * they silently shaped every reply via instructions the user never read or
 * chose. An agent that is genuinely the user's starts with nothing and becomes
 * theirs as they add to it.
 *
 * The exports are kept (empty) rather than deleted so existing imports keep
 * working and a user's OWN saved identities/skills are unaffected: this file was
 * only ever the starting point, never the storage. Saved lists live in
 * `settings.ai.identities` / `settings.ai.skills`.
 */

/** No stock identities. The user's own live in `settings.ai.identities`. */
export const PRESET_PERSONAS = [];

/** Kept for import compatibility — a blank slate means no starter cards. */
export const DEFAULT_IDENTITIES = [];

/** No stock skills, and none enabled by default. */
export const DEFAULT_SKILLS = [];

/**
 * The one identity the agent starts on: none.
 *
 * 'none' is the explicit "no persona injected" state, so a fresh account's agent
 * answers as a plain assistant instead of in a character it was never asked to
 * play. It is not a preset here — nothing to render in the list — it is just the
 * absence of a selection, which the server already understands
 * (`agent_prompt.py`: `persona_id == "none"` skips persona shaping entirely).
 */
export const DEFAULT_IDENTITY_ID = 'none';
