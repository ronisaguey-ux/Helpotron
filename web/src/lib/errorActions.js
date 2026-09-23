/**
 * errorActions.js — the browser half of the error call-to-action.
 *
 * `lib/errors.js` decides WHICH action fits an error (pure, testable, no DOM).
 * This module performs it. Keeping the two apart is what lets the decision be
 * unit-tested without a browser, and what stops a component from inventing an
 * action that nothing implements.
 *
 * The vocabulary is closed:
 *   retry · refresh · clear-cache · report · sign-in · go-home · contact ·
 *   fix-fields
 */

/** Cache Storage names a stale deploy could be served from. */
async function clearCaches() {
    // Cache Storage is where a service worker parks old asset bundles. Clearing
    // it is the difference between "reload" and "reload the NEW code".
    if (typeof caches === 'undefined') return;
    try {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
    } catch {
        // A failure here must not stop the reload — the reload may still fix it.
    }
}

/**
 * Perform one action.
 *
 * @param {{kind:string,label:string}} action  from humanError().actions
 * @param {object} ctx
 * @param {Function} [ctx.onRetry]      rerun the failed operation
 * @param {string}  [ctx.signInPath]    where the sign-in screen lives
 * @param {string}  [ctx.homePath]      the dashboard
 * @param {Function} [ctx.onContact]    open a help ticket
 * @param {Function} [ctx.onReport]     send the sealed report
 * @param {object}  [ctx.error]         the error being handled
 * @returns {Promise<boolean>} true when the action did something
 */
export async function runErrorAction(action, ctx = {}) {
    const kind = action && action.kind;

    switch (kind) {
        case 'retry':
            if (typeof ctx.onRetry === 'function') {
                await ctx.onRetry();
                return true;
            }
            // No handler was supplied: reloading re-runs the load that failed.
            window.location.reload();
            return true;

        case 'refresh':
            window.location.reload();
            return true;

        case 'clear-cache':
            // The stale-deploy case. `reload()` alone can be answered from the
            // same old cache, so the caches are dropped first. `reload(true)`
            // is deliberately NOT used — it is deprecated and a no-op in
            // current browsers, so the Cache Storage delete is the real work.
            await clearCaches();
            window.location.reload();
            return true;

        case 'report':
            if (typeof ctx.onReport === 'function') {
                await ctx.onReport();
                return true;
            }
            return false;

        case 'sign-in':
            window.location.href = ctx.signInPath || '/login';
            return true;

        case 'go-home':
            window.location.href = ctx.homePath || '/';
            return true;

        case 'contact':
            if (typeof ctx.onContact === 'function') {
                await ctx.onContact();
                return true;
            }
            // Fall back to the public help-ticket page rather than doing nothing.
            window.location.href = ctx.contactPath || '/help';
            return true;

        case 'fix-fields': {
            // Put the user where the problem is. A validation failure is the one
            // error the user can resolve, so the useful action is focus, not a
            // reload. The first entry of a FastAPI loc array names the field.
            const detail = ctx.error && (ctx.error.detail || ctx.error.payload);
            const first = Array.isArray(detail) && detail.length ? detail[0] : null;
            const loc = first && Array.isArray(first.loc) ? first.loc : null;
            const field = loc
                ? loc.filter((p) => !['body', 'query', 'path', 'header', 'cookie'].includes(p)).pop()
                : null;
            if (!field) return false;

            const escaped = (typeof CSS !== 'undefined' && CSS.escape)
                ? CSS.escape(String(field))
                : String(field).replace(/["\\]/g, '\\$&');
            const el = document.querySelector(`[name="${escaped}"], #${escaped}, [data-field="${escaped}"]`);
            if (el) {
                el.focus();
                if (typeof el.scrollIntoView === 'function') {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return true;
            }
            return false;
        }

        default:
            return false;
    }
}

/** True when an action needs no async work — lets a UI render it as a link. */
export function isNavigational(kind) {
    return kind === 'sign-in' || kind === 'go-home' || kind === 'refresh' || kind === 'clear-cache';
}
