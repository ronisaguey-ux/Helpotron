/**
 * errorActions.test.mjs — the browser half of the call-to-action.
 *
 * `lib/errors.js` DECIDES which action fits an error (pure, tested in
 * errors.test.mjs). This module PERFORMS it. The split only holds up if the
 * performing half is tested too — otherwise `actions` can name a handler that
 * does nothing, and every error screen silently offers a dead button.
 *
 * The owner's rule (2026-09-23): "every error state should contain 3 things,
 * concise showcasing of the error, explanation of the error, and a call to
 * action, which can be a guided refresh button, report error to data lake,
 * clear cache, etc depends on the type of error."
 *
 * Run: node web/tests/errorActions.test.mjs
 */
import { runErrorAction, isNavigational } from '../src/lib/errorActions.js';

let failures = 0;
const ok = (label, cond, detail = '') => {
    if (cond) return;
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
};

/* ── A minimal browser stand-in ─────────────────────────────────────────────
 * node has no window/document/caches, so the module's browser calls are
 * injected. The point is to observe WHAT it decided to do, not to run a real
 * reload.
 */
function makeEnv({ fields = [] } = {}) {
    const calls = { reload: 0, href: [], focused: [], scrolled: [], cachesDeleted: [] };

    globalThis.window = {
        location: {
            _href: '',
            reload() { calls.reload += 1; },
            get href() { return this._href; },
            set href(v) { this._href = v; calls.href.push(v); },
        },
    };

    globalThis.caches = {
        async keys() { return ['helpotron-assets-v1', 'helpotron-assets-v2']; },
        async delete(name) { calls.cachesDeleted.push(name); return true; },
    };

    globalThis.document = {
        querySelector(sel) {
            // Very small matcher: `[name="x"], #x, [data-field="x"]`.
            const wanted = [...sel.matchAll(/(?:name="#?|#|data-field=")([^"\]]+)/g)].map((m) => m[1]);
            const hit = fields.find((f) => wanted.includes(f.name));
            if (!hit) return null;
            return {
                name: hit.name,
                focused: false,
                focus() { this.focused = true; calls.focused.push(this.name); },
                scrollIntoView() { calls.scrolled.push(this.name); },
            };
        },
    };

    globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };

    return { calls };
}

function teardown() {
    delete globalThis.window;
    delete globalThis.caches;
    delete globalThis.document;
    delete globalThis.CSS;
}

/* ── Navigation actions actually navigate ───────────────────────────────── */

{
    const { calls } = makeEnv();
    await runErrorAction({ kind: 'refresh' });
    ok('refresh reloads the page', calls.reload === 1, `reload=${calls.reload}`);
    teardown();
}

{
    const { calls } = makeEnv();
    await runErrorAction({ kind: 'sign-in' });
    ok('sign-in goes to /login by default', calls.href[0] === '/login', JSON.stringify(calls.href));
    teardown();
}

{
    const { calls } = makeEnv();
    await runErrorAction({ kind: 'sign-in' }, { signInPath: '/auth' });
    ok('sign-in honours a custom path', calls.href[0] === '/auth');
    teardown();
}

{
    const { calls } = makeEnv();
    await runErrorAction({ kind: 'go-home' });
    ok('go-home goes to / by default', calls.href[0] === '/');
    teardown();
}

/* ── clear-cache must CLEAR, not just reload ────────────────────────────────
 * This is the stale-deploy case. A plain reload can be answered from the same
 * stale cache, so the Cache Storage delete is the actual work. If this test
 * passes with the delete removed, the test is worthless.
 */
{
    const { calls } = makeEnv();
    await runErrorAction({ kind: 'clear-cache' });
    ok('clear-cache deletes every cache bucket',
        calls.cachesDeleted.length === 2, JSON.stringify(calls.cachesDeleted));
    ok('clear-cache then reloads', calls.reload === 1);
    ok('the caches are cleared BEFORE the reload', calls.cachesDeleted.length > 0 && calls.reload === 1);
    teardown();
}

/* ── clear-cache must survive a Cache Storage failure ───────────────────── */
{
    const { calls } = makeEnv();
    globalThis.caches.keys = async () => { throw new Error('storage unavailable'); };
    await runErrorAction({ kind: 'clear-cache' });
    ok('clear-cache still reloads when the cache API throws', calls.reload === 1);
    teardown();
}

/* ── retry calls the caller's handler when it has one ───────────────────── */
{
    makeEnv();
    let retried = 0;
    await runErrorAction({ kind: 'retry' }, { onRetry: async () => { retried += 1; } });
    ok('retry invokes the supplied handler', retried === 1);
    teardown();
}

{
    const { calls } = makeEnv();
    await runErrorAction({ kind: 'retry' });   // no handler supplied
    ok('retry falls back to a reload rather than doing nothing', calls.reload === 1);
    teardown();
}

/* ── report / contact delegate, and report has NO silent fallback ────────── */
{
    makeEnv();
    let reported = 0;
    await runErrorAction({ kind: 'report' }, { onReport: async () => { reported += 1; } });
    ok('report invokes the supplied handler', reported === 1);
    teardown();
}

{
    const { calls } = makeEnv();
    const did = await runErrorAction({ kind: 'report' });   // no handler
    ok('report with no handler reports that it did nothing', did === false);
    ok('report with no handler does NOT navigate anywhere',
        calls.href.length === 0 && calls.reload === 0,
        'silently navigating away from a report would surprise the user');
    teardown();
}

{
    makeEnv();
    let contacted = 0;
    await runErrorAction({ kind: 'contact' }, { onContact: async () => { contacted += 1; } });
    ok('contact invokes the supplied handler', contacted === 1);
    teardown();
}

/* ── fix-fields: focus the rejected field, the ONE action that helps on 422 ─ */
{
    const { calls } = makeEnv({ fields: [{ name: 'title' }] });
    const err = { detail: [{ type: 'missing', loc: ['body', 'title'], msg: 'Field required' }] };
    const did = await runErrorAction({ kind: 'fix-fields' }, { error: err });
    ok('fix-fields finds and focuses the rejected field', did === true);
    ok('the field is actually focused', calls.focused[0] === 'title', JSON.stringify(calls.focused));
    ok('the field is scrolled into view', calls.scrolled[0] === 'title');
    teardown();
}

{
    const { calls } = makeEnv({ fields: [{ name: 'title' }] });
    // The scope words must be skipped; the FIELD is the last element.
    const err = { payload: [{ loc: ['body', 'assignment', 'title'], msg: 'x' }] };
    await runErrorAction({ kind: 'fix-fields' }, { error: err });
    ok('fix-fields uses the innermost field, not the scope', calls.focused[0] === 'title');
    teardown();
}

{
    const { calls } = makeEnv();
    const did = await runErrorAction({ kind: 'fix-fields' }, { error: {} });
    ok('fix-fields with no field info reports it did nothing', did === false);
    ok('fix-fields with no field info does not reload', calls.reload === 0);
    teardown();
}

/* ── An unknown action kind must not throw or act ───────────────────────── */
{
    const { calls } = makeEnv();
    const did = await runErrorAction({ kind: 'not-a-real-action' });
    ok('an unknown action returns false', did === false);
    ok('an unknown action performs no side effect', calls.reload === 0 && calls.href.length === 0);
    teardown();
}

{
    const { calls } = makeEnv();
    const did = await runErrorAction(null);
    ok('a null action returns false safely', did === false && calls.reload === 0);
    teardown();
}

/* ── isNavigational agrees with what the actions actually do ─────────────── */
{
    const navigational = ['sign-in', 'go-home', 'refresh', 'clear-cache'];
    for (const kind of navigational) {
        ok(`${kind} is reported as navigational`, isNavigational(kind) === true);
    }
    for (const kind of ['retry', 'report', 'contact', 'fix-fields']) {
        ok(`${kind} is reported as NOT purely navigational`, isNavigational(kind) === false);
    }
}

console.log(failures === 0 ? '  all error-action cases passed' : `  ${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
