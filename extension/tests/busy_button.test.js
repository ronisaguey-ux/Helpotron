// withBusy — the extension's button busy-state helper.
//
// Owner report (2026-09-23): the extension is "crowded and clunky". The clunky
// half was that the primary buttons (Scrape, Crawl, Start Typing, the two
// refresh links) ran for seconds with the control unchanged and still
// clickable — so a click looked ignored and invited a second one.
//
// popup.js is a classic browser script that touches `document` and `chrome` at
// load, so it cannot simply be required. The function under test is pure with
// respect to a button element, so it is loaded into a vm with a minimal stub.
// Run: node --test extension/tests/busy_button.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');

// Pull just the withBusy declaration out of popup.js so the test cannot drift
// from the shipped source (a copy would silently pass after an edit).
function extractWithBusy() {
  const start = SRC.indexOf('async function withBusy(');
  assert.ok(start !== -1, 'withBusy must exist in popup.js');
  // Walk braces from the opening { of the function body.
  const open = SRC.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') {
      depth--;
      if (depth === 0) return SRC.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced braces in withBusy');
}

// withBusy reads this constant, so it has to come along or the vm throws.
const BUSY_CONST = (SRC.match(/const\s+BUSY_LABEL_DELAY_MS\s*=\s*\d+;/) || [''])[0];
assert.ok(BUSY_CONST, 'BUSY_LABEL_DELAY_MS must exist in popup.js');

const WITH_BUSY = BUSY_CONST + '\n' + extractWithBusy();

function makeButton() {
  const attrs = {};
  return {
    innerHTML: '<svg class="ic"></svg><span>Scrape current thing only</span>',
    disabled: false,
    dataset: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    setAttribute(k, v) { attrs[k] = v; },
    removeAttribute(k) { delete attrs[k]; },
    getAttribute(k) { return attrs[k]; },
    _attrs: attrs,
  };
}

function load() {
  // The shipped withBusy delays the visible label by BUSY_LABEL_DELAY_MS, so the
  // vm needs real timers.
  const ctx = { console, setTimeout, clearTimeout };
  vm.createContext(ctx);
  vm.runInContext(WITH_BUSY + '\n;globalThis.__wb = withBusy;', ctx);
  return ctx.__wb;
}

// How long the shipped helper waits before swapping the label.
const LABEL_DELAY = Number(
  (SRC.match(/BUSY_LABEL_DELAY_MS\s*=\s*(\d+)/) || [])[1] || 400,
);

test('the button is disabled IMMEDIATELY — that is what stops a double submit', async () => {
  const withBusy = load();
  const btn = makeButton();
  let seen = null;
  await withBusy(btn, 'Reading the tab…', async () => {
    seen = { disabled: btn.disabled, busy: btn.dataset.busy, aria: btn._attrs['aria-busy'] };
  });
  assert.strictEqual(seen.disabled, true, 'must be disabled while running');
  assert.strictEqual(seen.busy, '1', 'must be marked busy');
  assert.strictEqual(seen.aria, 'true', 'must be announced busy');
});

test('a slow action shows a spinner and names it', async () => {
  const withBusy = load();
  const btn = makeButton();
  let mid = null;
  await withBusy(btn, 'Reading the tab…', async () => {
    await new Promise((r) => setTimeout(r, LABEL_DELAY + 60));
    mid = btn.innerHTML;
  });
  assert.match(mid, /btn-spinner/, 'must show a spinner once it is slow enough');
  assert.match(mid, /Reading the tab…/, 'must name the action');
});

test('a fast action shows NO flash — the sub-1s rule', async () => {
  const withBusy = load();
  const btn = makeButton();
  const before = btn.innerHTML;
  let during = null;
  // Observe MID-FLIGHT. Asserting on the final innerHTML would be vacuous: it is
  // restored either way, so that check passes whether or not a flash occurred.
  await withBusy(btn, 'Working…', async () => { during = btn.innerHTML; });
  assert.strictEqual(during, before,
    'a quick action must not flash a busy label that immediately disappears');
});

test('the original markup is restored afterwards', async () => {
  const withBusy = load();
  const btn = makeButton();
  const before = btn.innerHTML;
  await withBusy(btn, 'Working…', async () => {});
  assert.strictEqual(btn.innerHTML, before, 'markup must be identical');
  assert.strictEqual(btn.disabled, false, 'must be re-enabled');
  assert.strictEqual(btn.dataset.busy, '0');
  assert.strictEqual(btn._attrs['aria-busy'], undefined, 'aria-busy must be cleared');
  assert.strictEqual(btn.classList.contains('is-busy'), false);
});

test('a second click while busy is ignored — the action runs once', async () => {
  const withBusy = load();
  const btn = makeButton();
  let runs = 0;
  const slow = () => withBusy(btn, 'Working…', async () => {
    runs++;
    await new Promise((r) => setTimeout(r, 25));
  });
  const first = slow();
  const second = slow();          // arrives while the first is in flight
  await Promise.all([first, second]);
  assert.strictEqual(runs, 1, 'the double click must not run the action twice');
});

test('a real double click in the same tick also runs once', async () => {
  const withBusy = load();
  const btn = makeButton();
  let runs = 0;
  const click = () => withBusy(btn, 'Working…', async () => { runs++; });
  await Promise.all([click(), click(), click()]);
  assert.strictEqual(runs, 1);
});

test('the button is restored even when the action throws', async () => {
  const withBusy = load();
  const btn = makeButton();
  const before = btn.innerHTML;
  await assert.rejects(
    () => withBusy(btn, 'Working…', async () => { throw new Error('network down'); }),
    /network down/,
  );
  assert.strictEqual(btn.disabled, false, 'a failure must not leave it stuck disabled');
  assert.strictEqual(btn.innerHTML, before);
  assert.strictEqual(btn.dataset.busy, '0', 'a failure must not wedge the guard');
});

test('the value the action returns is passed through', async () => {
  const withBusy = load();
  const btn = makeButton();
  assert.strictEqual(await withBusy(btn, 'Working…', async () => 42), 42);
});

test('a missing button still runs the action', async () => {
  const withBusy = load();
  let ran = false;
  await withBusy(null, 'Working…', async () => { ran = true; });
  assert.strictEqual(ran, true, 'a null button must not swallow the action');
});

test('after an error the button is usable again', async () => {
  const withBusy = load();
  const btn = makeButton();
  await withBusy(btn, 'A', async () => { throw new Error('x'); }).catch(() => {});
  let ran = false;
  await withBusy(btn, 'B', async () => { ran = true; });
  assert.strictEqual(ran, true, 'the guard must release after a failure');
});
