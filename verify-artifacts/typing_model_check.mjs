// Bookkeeping check for the assistive typing engine.
//
// The engine types mistakes, runs on, then walks the caret back and replaces
// the bad characters in place. That is a lot of index arithmetic on a live
// document, and getting it wrong does not throw — it silently mangles the
// essay. This mirrors the emitted/pending/repair arithmetic from
// extension/content.js against a plain buffer with a caret and asserts the
// finished buffer equals the source text exactly.
//
// Run: node verify-artifacts/typing_model_check.mjs

const FIXTURES = [
  'Apples are one of the most popular fruits in the world.',
  'The mitochondria is the powerhouse of the cell, and it is where respiration happens.',
  'a of the it is to be or not',
  'Photosynthesis converts light energy into chemical energy.\nPlants store it as glucose.',
  'Short.',
  'x y z',
  "Don't underestimate a well-placed comma; it changes everything.",
];

// ── copied from content.js ───────────────────────────────────────────────────
const KEY_NEIGHBORS = {
  a: 'sq', b: 'vn', c: 'xv', d: 'sf', e: 'wr', f: 'dg', g: 'fh', h: 'gj',
  i: 'uo', j: 'hk', k: 'jl', l: 'k', m: 'n', n: 'bm', o: 'ip', p: 'o',
  q: 'wa', r: 'et', s: 'ad', t: 'ry', u: 'yi', v: 'cb', w: 'qe', x: 'zc',
  y: 'tu', z: 'x',
};
function neighborKey(ch) {
  const lower = ch.toLowerCase();
  const opts = KEY_NEIGHBORS[lower];
  if (!opts) return null;
  const pick = opts[Math.floor(Math.random() * opts.length)];
  return ch === lower ? pick : pick.toUpperCase();
}

function planTypo(chars, wordStart, wordLen) {
  const maxOff = Math.min(wordLen - 1, 5);
  const at = wordStart + 1 + Math.floor(Math.random() * Math.max(1, maxOff));
  const here = chars[at];
  const next = chars[at + 1];
  if (!here || here === ' ' || here === '\n') return null;

  const fixAfter = Math.random() < 0.18 ? 0 : 1 + Math.floor(Math.random() * 13);
  const roll = Math.random();
  const canTranspose = next && next !== ' ' && next !== '\n' && next !== here;
  if (roll < 0.40 && canTranspose) {
    return { at, kind: 'transpose', typed: next + here, correct: here + next, fixAfter };
  }
  if (roll < 0.72) {
    const wrong = neighborKey(here);
    if (wrong && wrong !== here) return { at, kind: 'substitute', typed: wrong, correct: here, fixAfter };
  }
  if (roll < 0.88 && /[a-z]/i.test(here)) {
    return { at, kind: 'double', typed: here + here, correct: here, fixAfter };
  }
  if (/[a-z]/i.test(here) && wordLen > 3) {
    return { at, kind: 'drop', typed: '', correct: here, fixAfter };
  }
  const wrong = neighborKey(here);
  return wrong && wrong !== here
    ? { at, kind: 'substitute', typed: wrong, correct: here, fixAfter }
    : null;
}

function computeWordRolls(chars, typoRate) {
  const starts = new Map();
  const typos = new Map();
  let inWord = false;
  let wordStart = -1;
  for (let i = 0; i <= chars.length; i++) {
    const isBoundary = i >= chars.length || chars[i] === ' ' || chars[i] === '\n';
    if (!inWord && !isBoundary) { inWord = true; wordStart = i; }
    else if (inWord && isBoundary) {
      const wordLen = i - wordStart;
      const lengthWeight = wordLen > 3 ? 1 : 0.45;
      if (typoRate > 0 && wordLen >= 2 && Math.random() < typoRate * lengthWeight) {
        const t = planTypo(chars, wordStart, wordLen);
        if (t) typos.set(t.at, t);
      }
      inWord = false;
    }
  }
  return { starts, typos };
}

// ── a document that behaves the way the caret helpers make one behave ────────
class Doc {
  constructor() { this.buf = []; this.caret = 0; this.sel = 0; }
  insert(ch) {
    // Typing over a selection replaces it — same as Docs and contenteditable.
    if (this.sel > 0) { this.buf.splice(this.caret, this.sel); this.sel = 0; }
    this.buf.splice(this.caret, 0, ch);
    this.caret += 1;
  }
  move(forward, count, extend) {
    if (extend) { this.sel = Math.min(count, this.buf.length - this.caret); return; }
    this.sel = 0;
    this.caret = Math.max(0, Math.min(this.buf.length, this.caret + (forward ? count : -count)));
  }
  get text() { return this.buf.join(''); }
}

function overtype(doc, selLen, text) {
  if (selLen > 0) doc.move(true, selLen, true);
  for (const ch of text) doc.insert(ch);
}

function repairTypo(doc, fix, emitted) {
  const back = emitted - fix.startedAt;
  if (back < 0) return emitted;
  doc.move(false, back, false);
  overtype(doc, fix.wrongLen, fix.correct);
  const after = emitted + (fix.correct.length - fix.wrongLen);
  doc.move(true, after - (fix.startedAt + fix.correct.length), false);
  return after;
}

function run(text, typoRate) {
  const chars = Array.from(text);
  const { typos } = computeWordRolls(chars, typoRate);
  const doc = new Doc();
  let emitted = 0;
  let pending = null;
  let typoCount = 0;

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];

    if (pending && (char === '\n' || emitted - pending.endedAt >= pending.fixAfter)) {
      emitted = repairTypo(doc, pending, emitted);
      pending = null;
    }

    const typo = typos.get(i);
    if (typo) {
      if (pending) {
        CLOBBER.n += 1;
        emitted = repairTypo(doc, pending, emitted);
        pending = null;
      }
      typoCount += 1;
      for (const tc of typo.typed) { doc.insert(tc); emitted += 1; }
      pending = {
        startedAt: emitted - typo.typed.length,
        endedAt: emitted,
        wrongLen: typo.typed.length,
        correct: typo.correct,
        fixAfter: typo.fixAfter,
      };
      i += typo.correct.length - 1;
      if (typo.fixAfter === 0) { emitted = repairTypo(doc, pending, emitted); pending = null; }
      continue;
    }

    doc.insert(char);
    emitted += 1;
  }
  if (pending) { emitted = repairTypo(doc, pending, emitted); pending = null; }

  return { out: doc.text, emitted, typoCount };
}

const CLOBBER = { n: 0 };
let fail = 0;
let totalTypos = 0;
let runs = 0;
for (const fixture of FIXTURES) {
  // High rate on purpose: force every typo kind through the arithmetic.
  for (const rate of [0.06, 0.35, 0.9]) {
    for (let trial = 0; trial < 400; trial++) {
      const { out, emitted, typoCount } = run(fixture, rate);
      runs += 1;
      totalTypos += typoCount;
      if (out !== fixture) {
        fail += 1;
        if (fail <= 3) {
          console.error(`MISMATCH rate=${rate}\n  want: ${JSON.stringify(fixture)}\n  got:  ${JSON.stringify(out)}`);
        }
      }
      if (emitted !== Array.from(fixture).length) {
        fail += 1;
        if (fail <= 6) console.error(`EMITTED DRIFT rate=${rate}: ${emitted} vs ${Array.from(fixture).length}`);
      }
    }
  }
}

console.log(`clobbers=${CLOBBER.n} runs=${runs} typos_exercised=${totalTypos} failures=${fail}`);
process.exit(fail === 0 ? 0 : 1);
