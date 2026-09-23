/**
 * errors.test.mjs — the invariant that nothing machine-shaped reaches a user.
 *
 * Regression cover for the owner's report: "the errors literally just flash
 * random backend code on my screen". The culprit was api.js stringifying
 * FastAPI's `detail`, which is an ARRAY for validation errors, so the literal
 * object was rendered as the message.
 *
 * Run: node web/tests/errors.test.mjs
 */
import { humanError, humanMessage } from '../src/lib/errors.js';

let failures = 0;
const ok = (label, cond, detail = '') => {
    if (cond) return;
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
};

// Nothing that looks like machine output may appear in a rendered message.
function leaksIn(s) {
    return [
        /[{}[\]]/.test(s) && 'JSON/bracket',
        /_parsing\b|\bint_parsing\b/.test(s) && 'fastapi type',
        /<[a-z!]/i.test(s) && 'markup',
        /Traceback|File "|line \d+/.test(s) && 'traceback',
        /^\s*HTTP \d{3}/.test(s) && 'status code',
        /\bat [\w.]+\s*\(/.test(s) && 'stack frame',
    ].filter(Boolean);
}

const cases = [
    ['fastapi validation array (the exact owner payload)', {
        status: 422,
        detail: [{ type: 'int_parsing', loc: ['path', 'entry_id'],
            msg: 'Input should be a valid integer, unable to parse string as an integer',
            input: 'mc_e9f6a3df' }],
    }],
    ['missing required field', { status: 422, detail: [{ type: 'missing', loc: ['body', 'title'], msg: 'Field required' }] }],
    ['too short', { status: 422, detail: [{ type: 'string_too_short', loc: ['body', 'password'], msg: 'String should have at least 8 characters' }] }],
    ['wrong password', { status: 401, detail: 'Incorrect password' }],
    ['forbidden', { status: 403, detail: 'Cannot delete resources uploaded by another user' }],
    ['rate limited', { status: 429, detail: null }],
    ['server unavailable', { status: 503, detail: null }],
    ['gateway html page, detail nulled', { status: 502, detail: null }],
    ['network failure', new TypeError('Failed to fetch')],
    ['html leaked into a message', { message: '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>' }],
    ['python traceback in a message', { message: 'Traceback (most recent call last):\n  File "/app/main.py", line 12' }],
    ['object detail with a usable message', { status: 400, detail: { message: 'That assignment already exists.' } }],
    ['screaming-case code', { status: 400, detail: 'ERR_SOMETHING_BROKE' }],
    ['bare url', { status: 400, detail: 'https://internal.service/health' }],
];

for (const [label, err] of cases) {
    const h = humanError(err);
    const leaks = leaksIn(h.message);
    ok(`${label} — no machine output`, leaks.length === 0, `${leaks.join(', ')} in ${JSON.stringify(h.message)}`);
    ok(`${label} — non-empty`, h.message.trim().length > 0);
    ok(`${label} — ends like a sentence`, /[.!?]$/.test(h.message.trim()) || h.message.length < 60);
}

// The technical payload is KEPT, but only for reporting — never for display.
const withDetail = humanError({ status: 422, detail: [{ type: 'missing', loc: ['body', 'title'], msg: 'Field required' }] });
ok('raw detail is preserved for reporting', typeof withDetail.technical === 'string' && withDetail.technical.includes('missing'));
ok('raw detail never equals the displayed message', withDetail.technical !== withDetail.message);

// A 401 must not invite a retry; a 503 should.
ok('401 says sign in, does not offer retry', humanError({ status: 401 }).canRetry === false);
ok('503 offers a retry', humanError({ status: 503 }).canRetry === true);

// humanMessage is the one-liner wrapper.
ok('humanMessage returns the message', humanMessage({ status: 404 }) === humanError({ status: 404 }).message);

// Multi-field validation is summarised, not dumped.
const many = humanError({ status: 422, detail: Array.from({ length: 7 }, (_, i) => ({ type: 'missing', loc: ['body', `f${i}`], msg: 'Field required' })) });
ok('many field errors are summarised', many.message.includes('more'), many.message);
ok('summary is not ridiculously long', many.message.length < 300);

/* ────────────────────────────────────────────────────────────────────────────
 * EVERY ERROR CARRIES A CALL TO ACTION.
 *
 * Owner requirement (2026-09-23): "every error state should contain 3 things,
 * concise showcasing of the error, explanation of the error, and a call to
 * action, which can be a guided refresh button, report error to data lake,
 * clear cache, etc depends on the type of error."
 * ────────────────────────────────────────────────────────────────────────── */

const ALL_KINDS = new Set([
    'retry', 'refresh', 'clear-cache', 'report', 'sign-in', 'go-home', 'contact', 'fix-fields',
]);

// The showcase, the explanation and the action must all be present, for every
// error shape the app can produce.
for (const [label, err] of cases) {
    const h = humanError(err);

    // 1. SHOWCASE — a short headline.
    ok(`${label} — has a concise headline`, typeof h.title === 'string' && h.title.trim().length > 0);
    ok(`${label} — headline is short`, h.title.length <= 48, `${h.title.length} chars: ${h.title}`);

    // 2. EXPLANATION — a sentence.
    ok(`${label} — has an explanation`, typeof h.message === 'string' && h.message.trim().length > 0);

    // 3. CALL TO ACTION — at least one, never an empty list.
    ok(`${label} — offers at least one action`, Array.isArray(h.actions) && h.actions.length >= 1, JSON.stringify(h.actions));
    ok(`${label} — every action has a label`,
        (h.actions || []).every((a) => typeof a.label === 'string' && a.label.trim().length > 0));
    ok(`${label} — every action kind is one the UI implements`,
        (h.actions || []).every((a) => ALL_KINDS.has(a.kind)),
        JSON.stringify((h.actions || []).map((a) => a.kind)));

    // No action label may be machine output either.
    for (const a of h.actions || []) {
        const leaks = leaksIn(a.label);
        ok(`${label} — action label ${a.kind} is clean`, leaks.length === 0, leaks.join(', '));
    }
}

// The action must DEPEND ON THE ERROR. A blanket "Try Again" is the thing the
// owner is complaining about, so these assert the interesting distinctions.
const kindOf = (err) => humanError(err).actions[0].kind;
const kindsOf = (err) => humanError(err).actions.map((a) => a.kind);

ok('401 leads with sign-in, not retry', kindOf({ status: 401 }) === 'sign-in');
ok('403 leads with a way out', kindOf({ status: 403 }) === 'go-home');
ok('404 leads home, not to a retry loop', kindOf({ status: 404 }) === 'go-home');
ok('409 (already changed) reloads instead of retrying', kindsOf({ status: 409 }).includes('refresh'));
ok('413 offers choosing another file', kindOf({ status: 413 }) === 'retry' && humanError({ status: 413 }).actions[0].label.match(/file/i));
ok('422 points at the fields, does NOT retry', kindOf({ status: 422 }) === 'fix-fields');
ok('422 does not offer a meaningless retry', !kindsOf({ status: 422 }).includes('retry'));
ok('429 retries (it is transient)', kindOf({ status: 429 }) === 'retry');
ok('504 retries', kindOf({ status: 504 }) === 'retry');
ok('500 offers a report as well as a retry', kindsOf({ status: 500 }).includes('report'));
ok('503 offers a report', kindsOf({ status: 503 }).includes('report'));
ok('an offline error does NOT offer a report (nothing reached us)', !kindsOf(new TypeError('Failed to fetch')).includes('report'));
ok('an offline error tells the user to check the connection',
    /connection|internet/i.test(humanError(new TypeError('Failed to fetch')).hint));

// A stale deploy is the case a plain retry cannot fix.
const stale = new TypeError('Failed to fetch dynamically imported module: https://x/assets/App-abc123.js');
ok('a stale deploy is recognised', humanError(stale).kind === 'stale-deploy', humanError(stale).kind);
ok('a stale deploy leads with clear-cache, not reload',
    kindOf(stale) === 'clear-cache',
    JSON.stringify(kindsOf(stale)));
ok('a stale deploy is not classified as a network failure', humanError(stale).kind !== 'network');
ok('ChunkLoadError is recognised too',
    humanError({ name: 'ChunkLoadError', message: 'Loading chunk 42 failed' }).kind === 'stale-deploy');
ok('a stale deploy does not offer a plain retry that cannot work',
    !kindsOf(stale).includes('retry'));

// Reporting is offered ONLY where the fault is ours.
const reportOffered = [
    [{ status: 500 }, true],
    [{ status: 503 }, true],
    [stale, true],
    [{ status: 401 }, false],
    [{ status: 403 }, false],
    [{ status: 404 }, false],
    [{ status: 422 }, false],
    [new TypeError('Failed to fetch'), false],
];
for (const [err, expected] of reportOffered) {
    const got = kindsOf(err).includes('report');
    ok(`report ${expected ? 'offered' : 'withheld'} for ${JSON.stringify(err.status || err.name || err)}`,
        got === expected, `got ${got}`);
}

// The showcase is a NAME for the failure, not a code.
ok('no headline repeats an invented ERR_ code',
    cases.every(([, e]) => !/ERR_[A-Z_]+/.test(humanError(e).title)));

console.log(failures === 0 ? `  all cases clean, actions verified` : `  ${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
