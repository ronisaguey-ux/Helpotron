// The approval double-click guard.
//
// A decision card asks the agent to allow or deny something, and the decision is sent to the
// server the moment the button is clicked. Nothing stopped a second click — so a fast
// Approve-then-Reject, or a double-tap on Approve, could answer the SAME request twice and
// tell the agent both things.
//
// This test drives the SHIPPED loop rather than a copy, and it asserts the part that a
// grep-for-the-identifier check cannot see: that clicking ONE button disables the OTHERS.
// The first version of this guard queried '[data-approval-btn]', an attribute that exists
// nowhere, so it silently fell back to disabling only the clicked button — a green test
// against a half-broken feature. Hence the explicit cross-button assertions below.
//
// Run: node --test extension/tests/approval_guard.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const IDS = ['approvalApprove', 'approvalReject', 'approvalNeutral', 'approvalApproveAuto'];

function makeButtons() {
    return IDS.map((id) => ({
        id,
        disabled: false,
        dataset: {},
        _handlers: [],
        addEventListener(_ev, fn) { this._handlers.push(fn); },
        click() { this._handlers.forEach((h) => h()); },
    }));
}

// Pull the shipped approval wiring (the ID list, the button table and the function that
// uses them) straight out of popup.js, so the test cannot drift from the real code.
function extractWiring() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');
    const start = src.indexOf('const approvalButtons = [');
    assert.ok(start !== -1, 'the approval button table must exist in popup.js');
    const fnStart = src.indexOf('function wireApprovalButtons(', start);
    assert.ok(fnStart !== -1, 'wireApprovalButtons must exist — the loop must be a named, testable unit');
    const open = src.indexOf('{', fnStart);
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    assert.ok(end !== -1, 'could not walk the function body');
    // Everything from the button table through the closing brace of the function.
    return src.slice(start, end);
}

// Load the shipped wiring into a vm with a minimal document.
function loadShipped() {
    const body = extractWiring();

    const buttons = makeButtons();
    const answered = [];
    const sandbox = {
        document: { getElementById: (id) => buttons.find((b) => b.id === id) || null },
        answerFromButton: (decision, opts) => answered.push(decision),
        setTimeout: (fn) => { sandbox.__pending.push(fn); return 0; },
        __pending: [],
    };
    vm.createContext(sandbox);
    vm.runInContext(body + '; wireApprovalButtons();', sandbox);
    return { buttons, answered, sandbox };
}

test('a double click on one approval button sends ONE decision', () => {
    const { buttons, answered } = loadShipped();
    const approve = buttons.find((b) => b.id === 'approvalApprove');
    approve.click();
    approve.click();
    assert.deepStrictEqual(answered, ['allow'], 'the second click must not send a second decision');
});

test('clicking Approve then Reject sends only the FIRST decision', () => {
    // The dangerous case, and the one the first version of this guard missed: two DIFFERENT
    // buttons, so protecting only the clicked one lets it straight through.
    const { buttons, answered } = loadShipped();
    buttons.find((b) => b.id === 'approvalApprove').click();
    buttons.find((b) => b.id === 'approvalReject').click();
    assert.deepStrictEqual(answered, ['allow'], 'the agent must never be told both allow and deny');
});

test('one click disables EVERY approval control, not just the clicked one', () => {
    const { buttons } = loadShipped();
    buttons.find((b) => b.id === 'approvalNeutral').click();
    for (const b of buttons) {
        assert.strictEqual(b.disabled, true, `${b.id} must be disabled while a decision is in flight`);
    }
});

test('the controls are restored, so the card is not left permanently dead', () => {
    const { buttons, sandbox } = loadShipped();
    buttons.find((b) => b.id === 'approvalApprove').click();
    assert.ok(sandbox.__pending.length > 0, 'a restore must be scheduled');
    sandbox.__pending.forEach((fn) => fn());
    for (const b of buttons) {
        assert.strictEqual(b.disabled, false, `${b.id} must come back`);
        assert.ok(!b.dataset.approvalInFlight, 'the in-flight marker must be cleared');
    }
});

test('a throw from answerFromButton still restores the controls', () => {
    // A card that wedges itself permanently would be worse than the double-fire being fixed.
    const body = extractWiring();
    const buttons = makeButtons();
    const sandbox = {
        document: { getElementById: (id) => buttons.find((b) => b.id === id) || null },
        answerFromButton: () => { throw new Error('server unreachable'); },
        setTimeout: (fn) => { sandbox.__pending.push(fn); return 0; },
        __pending: [],
    };
    vm.createContext(sandbox);
    vm.runInContext(body + '; wireApprovalButtons();', sandbox);
    assert.throws(() => buttons[0].click(), /server unreachable/);
    sandbox.__pending.forEach((fn) => fn());
    for (const b of buttons) {
        assert.strictEqual(b.disabled, false, 'a failed send must not leave the card dead');
    }
});

test('agent_mode.js wires the SAME guard onto its own approval card', () => {
    // The two surfaces share the card contract, so a fix in one and not the other is the
    // same bug waiting on the other screen.
    const src = fs.readFileSync(path.join(__dirname, '..', 'agent_mode.js'), 'utf8');
    assert.match(src, /approvalInFlight/, 'agent_mode.js must carry the same guard');
    assert.ok(!/if \(el\) el\.addEventListener\('click', \(\) => answerAgentApprovalFromButton/.test(src),
        'the unguarded one-line wiring must be gone');
});
