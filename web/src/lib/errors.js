/**
 * errors.js — the ONE place a caught error becomes words a person can read.
 *
 * Why this exists
 * ---------------
 * Three separate normalisers had grown in the app, and every one of them could
 * put raw backend output on screen:
 *
 *   api.js:259        JSON.stringify(parsed.detail)
 *   api.js:318        JSON.stringify(err.detail)
 *   lib/overlay.js:44 JSON.stringify(err.detail)
 *
 * FastAPI returns `detail` as an ARRAY for validation errors:
 *
 *   {"detail":[{"type":"int_parsing","loc":["path","entry_id"],
 *               "msg":"Input should be a valid integer", "input":"mc_e9f6a3df"}]}
 *
 * so `JSON.stringify` put that literal object in front of the user. That is the
 * owner's report: "the errors literally just flash random backend code on my
 * screen".
 *
 * The contract here
 * -----------------
 *   humanError(err) -> { kind, title, message, hint, actions, canRetry, technical }
 *
 *   * `title` is the CONCISE SHOWCASING — a few words naming what happened.
 *   * `message` (+ `hint`) is the EXPLANATION — always a sentence written for a
 *     person. Never JSON, never a status code, never a stack.
 *   * `actions` is the CALL TO ACTION — an ordered list of what the user can
 *     actually do about THIS kind of error. The first entry is the primary.
 *     A retry is offered on a timeout; a sign-in on an expired session; a cache
 *     clear on a stale deploy; a report on an unexpected server fault. Offering
 *     the same "Try Again" everywhere is what made these screens useless.
 *   * `technical` is the raw detail, kept OFF the screen. It exists so the
 *     "report this" affordance can attach real diagnostics without the user
 *     having to read them.
 *   * `canRetry` tells the UI whether offering a retry is honest.
 *
 * Action `kind` is the finite vocabulary the UI maps to handlers (see
 * lib/errorActions.js). Keeping it here — and the browser work out — makes the
 * whole decision unit-testable without a DOM.
 *
 * Everything is a pure function of (status, detail, message), so it is unit
 * testable without a browser.
 */

// Field names arrive as snake_case from the API; make them readable.
function humanizeField(loc) {
    if (!Array.isArray(loc) || loc.length === 0) return '';
    // FastAPI's loc is ["body"|"query"|"path", ...field path]; the leading scope
    // word carries no meaning for a user.
    const parts = loc.filter((p) => !['body', 'query', 'path', 'header', 'cookie'].includes(p));
    if (!parts.length) return '';
    const last = String(parts[parts.length - 1]);
    return last
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')   // camelCase -> camel Case
        .replace(/[_-]+/g, ' ')
        .trim()
        .toLowerCase();
}

// Turn one FastAPI validation entry into a sentence.
function describeValidation(entry) {
    const field = humanizeField(entry && entry.loc);
    const label = field ? field.charAt(0).toUpperCase() + field.slice(1) : 'That value';
    const type = String((entry && entry.type) || '');
    const msg = String((entry && entry.msg) || '').trim();

    if (type.includes('missing')) return `${label} is required.`;
    if (type.includes('int_parsing') || type.includes('float_parsing')) return `${label} must be a number.`;
    if (type.includes('bool_parsing')) return `${label} must be true or false.`;
    if (type.includes('string_too_short') || type.includes('too_short')) return `${label} is too short.`;
    if (type.includes('string_too_long') || type.includes('too_long')) return `${label} is too long.`;
    if (type.includes('greater_than')) return `${label} is too small.`;
    if (type.includes('less_than')) return `${label} is too large.`;
    if (type.includes('enum')) return `${label} has to be one of the allowed options.`;
    if (type.includes('email')) return `${label} does not look like an email address.`;
    if (type.includes('url')) return `${label} does not look like a link.`;
    if (type.includes('json')) return `We could not read that request. Please reload and try again.`;

    if (msg) {
        // FastAPI's own msg is already a sentence, but it still names internals
        // like `entry_id`. Swap the raw field name for the readable label.
        const readable = field
            ? msg.replace(new RegExp(`\\b${field.replace(/\s+/g, '[ _]?')}\\b`, 'gi'), field)
            : msg;
        return `${label ? label + ': ' : ''}${readable.charAt(0).toLowerCase() + readable.slice(1)}`;
    }
    return `${label} is not valid.`;
}

// The status -> human sentence table. This is the whole point of the module.
const BY_STATUS = {
    400: { title: "That didn't work", message: 'The request was rejected. Check the details and try again.' },
    401: { title: 'Please sign in again', message: 'Your session has expired.', hint: 'Sign in to continue where you left off.', canRetry: false },
    403: { title: 'Not allowed', message: "You don't have permission to do that." },
    404: { title: 'Not found', message: "We couldn't find that. It may have been deleted." },
    405: { title: "That didn't work", message: 'That action is not available here.' },
    408: { title: 'The server took too long', message: 'The request timed out before it finished.', canRetry: true },
    409: { title: 'Already there', message: 'That already exists, so nothing changed.' },
    413: { title: 'That file is too large', message: 'Try a smaller file.' },
    415: { title: "That file type isn't supported", message: 'Try a different format.' },
    422: { title: 'Check the highlighted fields', message: 'Some of what you entered was not accepted.' },
    423: { title: 'Locked', message: 'That is temporarily locked. Try again shortly.', canRetry: true },
    429: { title: 'Too many requests', message: 'Slow down for a moment, then try again.', hint: 'This is a temporary limit, not a problem with your account.', canRetry: true },
    500: { title: 'Something went wrong on our end', message: 'This has been logged.', hint: 'Try again — if it keeps happening, report it so it can be fixed.', canRetry: true },
    501: { title: 'Not available yet', message: 'That feature is not built yet.' },
    502: { title: 'The server is restarting', message: 'It is briefly unavailable. Try again in a few seconds.', canRetry: true },
    503: { title: 'The server is busy', message: 'It is temporarily unavailable. Try again in a few seconds.', canRetry: true },
    504: { title: 'The server took too long', message: 'It did not respond in time. Try again in a few seconds.', canRetry: true },
};

function forStatus(status) {
    if (!status) return null;
    return BY_STATUS[status] || (status >= 500
        ? BY_STATUS[500]
        : status >= 400
            ? { title: "That didn't work", message: 'The request was rejected.' }
            : null);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The CALL TO ACTION.
 *
 * Every error state offers exactly the actions that can help with THAT error.
 * The vocabulary is finite on purpose: `kind` names a handler the app already
 * has, so a new error cannot invent an action nobody implements.
 *
 *   retry        run the failed operation again
 *   refresh      reload the page, keeping the session
 *   clear-cache  drop cached assets and reload (stale deploy)
 *   report       send the diagnostics to the data lake
 *   sign-in      go to the sign-in screen
 *   go-home      return to the dashboard
 *   contact      open a help ticket with the developer
 *   fix-fields   put the cursor on the first rejected field
 * ────────────────────────────────────────────────────────────────────────── */

const ACTION_LABELS = {
    retry: 'Try again',
    refresh: 'Reload page',
    'clear-cache': 'Clear cache & reload',
    report: 'Report this',
    'sign-in': 'Sign in',
    'go-home': 'Back to dashboard',
    contact: 'Contact support',
    'fix-fields': 'Check the highlighted fields',
};

const act = (kind, label) => ({ kind, label: label || ACTION_LABELS[kind] });

/**
 * Is this the classic "the app was redeployed while this tab was open" failure?
 *
 * A dynamic `import()` of a hashed Vite chunk 404s once the build it belonged to
 * is replaced. The tab is running stale code; the server is fine. The only
 * action that works is dropping the cached assets.
 */
export function isStaleDeployError(err) {
    if (!err) return false;
    const parts = [err.name, err.message, err.stack].filter(Boolean).map(String);
    return parts.some((p) => /Failed to fetch dynamically imported module|Loading chunk \d+ failed|Loading CSS chunk|ChunkLoadError|Importing a module script failed/i.test(p));
}

/**
 * Classify the error. This is what decides the call to action — two errors with
 * the same status but a different cause must not be offered the same next step
 * (a stale deploy and a crashed server are both "it broke", but only one of them
 * is fixed by clearing the cache).
 */
function kindFor(err, status) {
    if (isStaleDeployError(err)) return 'stale-deploy';
    if (status === 401) return 'auth';
    if (status === 403) return 'permission';
    if (status === 404) return 'notfound';
    if (status === 409) return 'conflict';
    if (status === 413 || status === 415) return 'file';
    if (status === 422 || status === 400) return 'validation';
    if (status === 429) return 'rate-limit';
    if (status === 408 || status === 504) return 'timeout';
    if (status === 500 || status === 501) return 'server';
    if (status === 502 || status === 503) return 'unavailable';
    if (status >= 400 && status < 500) return 'rejected';
    if (status >= 500) return 'server';
    // No status at all: either the network died, or client-side code threw.
    if (looksLikeTransportFailure(err)) return 'network';
    return 'unknown';
}

/**
 * The actions for a kind, most useful first. The first entry is the primary.
 *
 * The judgement encoded here: offer a `report` ONLY where the fault is ours and
 * the user's own retry cannot fix it. Reporting a wrong password or a rejected
 * form field would just train users to file noise.
 */
function actionsFor(kind) {
    switch (kind) {
        case 'auth':
            return [act('sign-in')];
        case 'permission':
            return [act('go-home'), act('contact')];
        case 'notfound':
            return [act('go-home'), act('refresh')];
        case 'validation':
            // Retrying the same input fails identically — the fix is in the form.
            return [act('fix-fields'), act('refresh')];
        case 'rate-limit':
            return [act('retry')];
        case 'conflict':
            // Someone else changed it; the local copy is stale, so re-read.
            return [act('refresh'), act('retry')];
        case 'file':
            return [act('retry', 'Choose another file')];
        case 'timeout':
            return [act('retry'), act('refresh')];
        case 'unavailable':
            return [act('retry'), act('report')];
        case 'server':
            return [act('retry'), act('report')];
        case 'network':
            return [act('retry'), act('contact')];
        case 'stale-deploy':
            // A plain reload can be served from the same stale cache, so
            // clearing it is the action that actually works.
            return [act('clear-cache'), act('report')];
        case 'rejected':
            return [act('retry'), act('report')];
        default:
            // Unknown fault: a retry plus a way to tell us, because we cannot say
            // from here whether it is transient or ours.
            return [act('retry'), act('report')];
    }
}

/**
 * Would a person read this as a sentence, or as machine output?
 *
 * Decides whether a string from the server may be shown at all. Conservative on
 * purpose: a false negative puts a stack trace on someone's screen, while a
 * false positive merely falls back to our own wording. So it rejects anything
 * payload-shaped — markup, JSON, stack frames, a bare URL, a SCREAMING_CASE
 * code, or a multi-line blob.
 */
function looksHuman(text) {
    const s = String(text || '').trim();
    if (!s) return false;
    if (s.length > 240) return false;
    if (s.includes('\n')) return false;                              // a sentence is one line
    if (/[{}[\]]/.test(s)) return false;                             // JSON / array / object
    if (/<\/?[a-z!]/i.test(s)) return false;                         // markup, incl. <!DOCTYPE
    if (/\bat [\w.]+\s*\(/.test(s)) return false;                    // JS stack frame
    if (/(Traceback|File\s+"|line\s+\d+)/.test(s)) return false;     // python traceback
    if (/^https?:\/\//i.test(s)) return false;                       // a bare URL
    if (/^[A-Z0-9_]{4,}$/.test(s)) return false;                     // SCREAMING_CASE code
    return true;
}

// Is this a transport failure rather than an answer from the server?
function looksLikeTransportFailure(err) {
    if (!err) return false;
    if (err.name === 'AbortError') return true;
    if (err instanceof TypeError) return true; // fetch() rejects with TypeError on network failure
    const m = String(err.message || '');
    return /failed to fetch|networkerror|network request failed|load failed|err_connection|err_network|econnrefused|socket hang up|timed? ?out/i.test(m)
        || /the operation was aborted/i.test(m);
}

/**
 * The public entry point.
 *
 * @param {any} err        a caught error (Error, {detail}, or a string)
 * @param {string} [fallback] used only when nothing else can be said
 * @returns {{kind:string,title:string,message:string,hint:string,actions:Array<{kind:string,label:string}>,canRetry:boolean,technical:string}}
 */
export function humanError(err, fallback = 'Something went wrong. Please try again.') {
    const out = {
        kind: 'unknown',
        title: 'Something went wrong',
        message: fallback,
        hint: '',
        actions: [],
        canRetry: false,
        technical: '',
    };

    // `finish` derives kind + actions from the status that was finally inferred,
    // so there is exactly one place that decides the call to action and no exit
    // path can forget it.
    const finish = (e) => {
        const status = Number.isFinite(e.status) ? e.status : undefined;
        out.kind = kindFor(e, status);
        out.actions = actionsFor(out.kind);
        return out;
    };

    if (!err) return finish(err);

    // A bare string is already prose the caller chose.
    if (typeof err === 'string') {
        out.message = err.trim() || fallback;
        return finish(err);
    }

    // Keep the raw detail for reporting, never for display.
    const rawDetail = err.detail !== undefined ? err.detail : (err.payload !== undefined ? err.payload : null);
    out.technical = rawDetail !== null && typeof rawDetail === 'object'
        ? JSON.stringify(rawDetail)
        : String(rawDetail === null ? (err.message || '') : rawDetail);

    // ── 0. A stale-deploy chunk error is not a "server problem" ────────────
    // It arrives as a TypeError from a failed dynamic import, so it would
    // otherwise be classified as a network failure and offered a retry that
    // cannot work — the retry re-requests the same dead chunk.
    if (isStaleDeployError(err)) {
        out.title = 'A new version is available';
        out.message = 'This page is running an older version of the app, so part of it could not load.';
        out.hint = 'Reloading will pick up the latest version. Nothing you have saved is affected.';
        out.canRetry = false;
        return finish(err);
    }

    // ── 1. Transport failure: there was no answer at all ───────────────────
    if (err.status === undefined && looksLikeTransportFailure(err)) {
        out.title = "Can't reach the server";
        out.message = 'The connection failed before the request was answered.';
        out.hint = 'Check your internet connection, then try again.';
        out.canRetry = true;
        return finish(err);
    }

    // ── 2. Validation errors: FastAPI sends an ARRAY of field problems ─────
    if (Array.isArray(rawDetail) && rawDetail.length) {
        const sentences = rawDetail
            .slice(0, 4)
            .map(describeValidation)
            .filter(Boolean);
        const more = rawDetail.length > 4 ? ` (and ${rawDetail.length - 4} more)` : '';
        const base = forStatus(err.status) || BY_STATUS[422];
        out.title = base.title;
        out.message = sentences.length ? sentences.join(' ') + more : base.message;
        out.hint = sentences.length ? '' : base.hint || '';
        out.canRetry = false;
        return finish(err);
    }

    // ── 3. A structured object detail (not an array) ───────────────────────
    if (rawDetail && typeof rawDetail === 'object') {
        // Take the first readable string we can find; never stringify blindly.
        const candidate = ['message', 'error', 'msg', 'reason', 'description']
            .map((k) => rawDetail[k])
            .find((v) => typeof v === 'string' && v.trim());
        const base = forStatus(err.status) || BY_STATUS[400];
        out.title = base.title;
        out.message = candidate && looksHuman(candidate) ? candidate.trim() : base.message;
        out.hint = base.hint || '';
        out.canRetry = Boolean(base.canRetry);
        return finish(err);
    }

    // ── 4. A status plus a plain string detail ─────────────────────────────
    const detailText = typeof rawDetail === 'string' ? rawDetail.trim() : '';
    const status = forStatus(err.status);

    if (status) {
        out.title = status.title;
        out.hint = status.hint || '';
        out.canRetry = Boolean(status.canRetry);
        // A short prose detail from the server is usually written for the user
        // (e.g. "Incorrect password"). Prefer it — but only if it reads like a
        // sentence; anything payload-shaped falls back to our own wording and
        // is kept off-screen in `technical`.
        if (detailText && looksHuman(detailText)) {
            out.message = detailText;
        } else {
            out.message = status.message;
        }
        return finish(err);
    }

    // ── 5. No status: a plain Error from client-side code ──────────────────
    const m = String(err.message || '').trim();
    if (m && looksHuman(m)) {
        out.message = m;
    } else if (m) {
        out.technical = m;
    }
    return finish(err);
}

/** Convenience: just the sentence, for call sites that only render one line. */
export function humanMessage(err, fallback) {
    return humanError(err, fallback).message;
}

export const isAuthError = (err) => Boolean(err) && err.status === 401;
export const isPermissionError = (err) => Boolean(err) && err.status === 403;
export const isNotFoundError = (err) => Boolean(err) && err.status === 404;
export const isRateLimitError = (err) => Boolean(err) && err.status === 429;
export const isServerError = (err) => Boolean(err) && typeof err.status === 'number' && err.status >= 500 && err.status <= 599;
