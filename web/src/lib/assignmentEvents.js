// assignmentEvents.js — pure assignment-lifecycle helpers (operator 08-28).
//
// These functions bridge the assignment-cards payload into the agent chat
// (MyAgentView) and the bubble dashboard (AssignmentCardDashboard). They are
// intentionally free of React/API side effects so the lifecycle math (new
// assignment / due soon / submitted) stays verifiable in isolation.
//
// Ghost-proofing: the /api/assignments/cards payload (server) does not carry
// the `turned_in` flag and does not exclude turned-in rows, while the active
// list endpoint (/api/assignments?history=false) does — so "submitted"
// assignments otherwise stay on the dashboard forever. The client-side rule
// below mirrors the ACTIVE-list semantics: an id in the turned-in history is
// not active, never rendered in bubble cards/counts, and never re-announced
// as new.

/**
 * Normalize a raw cards array: drop non-objects, empty ids (nums and strings)
 * and duplicate ids (first occurrence wins). Returns a NEW array — callers'
 * state is never mutated.
 */
export function normalizeCards(cards) {
  if (!Array.isArray(cards)) return [];
  const seen = new Set();
  const out = [];
  for (const c of cards) {
    if (!c || typeof c !== 'object') continue;
    const raw = c.id;
    if (raw === null || raw === undefined || raw === '') continue;
    // Canonical dedupe key (numeric and string ids coalesce — a scrambled
    // scraper can't slip in a second copy of the same row).
    const idKey = String(raw).trim();
    if (idKey === '' || idKey === 'null' || idKey === 'undefined' || seen.has(idKey)) continue;
    seen.add(idKey);
    out.push({ ...c });
  }
  return out;
}

/**
 * Due-date horizon for "due soon" announcements: due within the next 3 days.
 * A 12h past-grace keeps "due today" items usable without turning the chat
 * into an overdue nag-feed.
 */
export const DUE_SOON_WINDOW_MS = 72 * 60 * 60 * 1000; // 72h
export const DUE_PAST_GRACE_MS = 12 * 60 * 60 * 1000; // 12h

/** Parse a card due_date into epoch ms, or null. Date-only strings are read as
 * LOCAL midnight (new Date('YYYY-MM-DD') is UTC — a west-of-UTC student would
 * see "due yesterday"). */
export function parseDueDate(value) {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || /^(no deadline|none|n\/a|tbd)$/i.test(v)) return null;
  let d = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, day] = v.split('-').map(Number);
    d = new Date(y, m - 1, day);
    // Date rolls over illegal components (month 13, day 45) — reject those
    // instead of silently "normalizing" a ghost deadline into the next month.
    if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== day) return null;
  } else {
    d = new Date(v);
  }
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** True when the due date lands inside the "due soon" window. */
export function isDueSoon(value, nowMs = Date.now()) {
  const dueMs = parseDueDate(value);
  if (dueMs == null) return false;
  return dueMs >= nowMs - DUE_PAST_GRACE_MS && dueMs <= nowMs + DUE_SOON_WINDOW_MS;
}

/** Status labels the cards endpoint uses for turned-in/completed rows. */
export function isFinalStatus(status) {
  const s = (status || '').toLowerCase();
  return s === 'submitted' || s === 'completed' || s === 'graded' || s === 'done';
}

/** Markdown-ish metadata per event type — used by both the formatter and the
 * chat renderer so label/icon can never drift apart. */
export const EVENT_META = {
  created: { label: 'NEW ASSIGNMENT', icon: '📘' },
  due: { label: 'DUE SOON', icon: '⏰' },
  submitted: { label: 'SUBMITTED', icon: '✅' },
};

/**
 * Diff one assignment snapshot against the previous one and return the
 * lifecycle events worth announcing in the chat:
 *   - created   (id was not in the previous snapshot)
 *   - submitted (status moved to a final status, OR the id entered the
 *                turned-in history — turn-in does not touch the status)
 *   - due       (due date inside the due-soon window; announced even on the
 *                first load — it is real state, not spam)
 *
 * @param {object}   opts
 * @param {Map|null} opts.prev            previous id->card map (null = first load)
 * @param {Array}    opts.cards           next snapshot, ALREADY normalized
 * @param {Set}      opts.turnedInIds     ids in the turn-in history (current)
 * @param {Set}      opts.prevTurnedInIds ids in the turn-in history (previous)
 * @param {number}   [opts.nowMs]         epoch ms (testability)
 * @returns {Array<{type: string, card: object}>} deduped events
 */
export function computeAssignmentEvents({
  prev = null,
  cards = [],
  turnedInIds = new Set(),
  prevTurnedInIds = new Set(),
  nowMs = Date.now(),
} = {}) {
  const events = [];
  // Id canonicalization: cards may carry numeric ids while the history payload
  // carries strings (or the reverse) — compare on String ids, like
  // normalizeCards does, or a mixed snapshot silently misses events.
  const tid = new Set([...turnedInIds].map((x) => String(x)));
  const prevTid = new Set([...prevTurnedInIds].map((x) => String(x)));
  for (const card of cards) {
    const was = prev ? prev.get(card.id) : undefined;
    if (prev) {
      if (!was) {
        events.push({ type: 'created', card });
      } else if (!isFinalStatus(was.status) && isFinalStatus(card.status)) {
        events.push({ type: 'submitted', card });
      }
    }
    if (tid.has(String(card.id)) && !prevTid.has(String(card.id))) {
      events.push({ type: 'submitted', card });
    }
    if (isDueSoon(card.due_date, nowMs)) {
      events.push({ type: 'due', card });
    }
  }
  // One bubble per (type, card) per batch.
  const seen = new Set();
  const deduped = events.filter((e) => {
    const key = `${e.type}:${e.card.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Announce order: new work first, then submissions, then due-soon —
  // stable sort, so the chat reads top-down from newest fact.
  const priority = { created: 0, submitted: 1, due: 2 };
  return deduped
    .map((e, index) => ({ e, index }))
    .sort((a, b) => (priority[a.e.type] ?? 9) - (priority[b.e.type] ?? 9) || a.index - b.index)
    .map((x) => x.e);
}

/**
 * Human-readably describe one event (headline + one detail line + label/icon
 * from EVENT_META). Never throws — a malformed event degrades to a neutral
 * assignment line instead of a blank bubble.
 */
export function formatAssignmentEvent(event) {
  const type = event && event.type;
  const card = (event && event.card) || {};
  const name = String(card.name || card.title || '').trim() || `Assignment #${card.id}`;
  const subject = String(card.subject || card.class_code || '').trim();
  const meta = EVENT_META[type] || EVENT_META.created;
  switch (type) {
    case 'created':
      return {
        type, icon: meta.icon, label: meta.label,
        headline: `New assignment created: ${name}`,
        detail: subject ? `${subject} · awaiting action` : 'Awaiting action',
      };
    case 'due':
      return {
        type, icon: meta.icon, label: meta.label,
        headline: `Due soon: ${name}`,
        detail: subject
          ? `${subject} · deadline ${card.due_date || 'today'}`
          : `Deadline ${card.due_date || 'today'}`,
      };
    case 'submitted':
      return {
        type, icon: meta.icon, label: meta.label,
        headline: `Submitted: ${name}`,
        detail: subject ? `${subject} · moved to history` : 'Moved to assignment history',
      };
    default:
      return {
        type: 'created', icon: meta.icon, label: meta.label,
        headline: name,
        detail: subject || 'Assignment',
      };
  }
}
