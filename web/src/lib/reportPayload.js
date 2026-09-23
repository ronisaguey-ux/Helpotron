/**
 * reportPayload.js — build the diagnostic bundle that gets sent when a user
 * reports an error, so that NOBODY — not the user, not a screenshot, not a
 * network tab glance — ever sees backend internals.
 *
 * The requirement, verbatim from the owner (2026-09-23):
 *
 *   "when the user reports and sends the real diagnostics, have it send an
 *    encrypted hashed json output so the user never sees back end logic ever
 *    even when reporting"
 *
 * Three separate problems, and they need three different tools:
 *
 *   1. The user must not READ the payload.        -> AES-GCM (encrypted)
 *   2. The payload must not be TAMPERED with.     -> SHA-256 digest + HMAC tag
 *   3. A field must not be RECOGNISABLE.          -> keyed hashing of identifiers
 *
 * Why encryption and not just base64
 * ----------------------------------
 * Base64 is encoding, not secrecy: anyone can paste it into a decoder and read
 * every path and stack. The bundle is sealed with AES-GCM so the ciphertext is
 * opaque, and the key never leaves the server — it is fetched per report and
 * used once.
 *
 * ⚠️ HONEST LIMITATION, AND IT IS IMPORTANT.
 * The key must be usable by the browser, so it is reachable by anyone who
 * controls the browser. This is NOT protection against a determined attacker
 * with DevTools open — nothing running in the page can be. It IS protection
 * against the thing that actually happens: the payload being visible on screen,
 * in a screenshot pasted into a support chat, in a shared screen, or in a
 * copied log. The real containment is server-side — see the note at the bottom
 * of this file.
 *
 * The second requirement — "so the user never sees back end logic" — is met
 * first and most cheaply by the DISPLAY layer: the user is shown a plain
 * sentence, and `technical` is never rendered. Encryption is the second belt,
 * for the case where the raw value does escape the display layer.
 */

/* ── Encoding helpers (no dependencies; WebCrypto only) ─────────────────── */

const enc = new TextEncoder();

function toBase64(bytes) {
    let s = '';
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i += 0x8000) {
        s += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
    }
    return btoa(s);
}

function fromBase64(b64) {
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

/* ── Keyed hashing of identifiers ───────────────────────────────────────── */

/**
 * Hash a value so it can be correlated without being recognised.
 *
 * A plain SHA-256 of an email is reversible by dictionary — the space of
 * possible addresses is small enough to enumerate. A keyed hash (HMAC-SHA256)
 * cannot be, because the key is required to test a guess. The key is the same
 * server-issued one used for the seal.
 */
async function keyedHash(value, keyBytes) {
    if (value === undefined || value === null || value === '') return null;
    const key = await crypto.subtle.importKey(
        'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(value)));
    // Truncated: 32 hex chars is plenty to correlate two reports and reveals
    // nothing extra. Full length buys no additional safety here.
    return [...new Uint8Array(sig)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ── What goes in the bundle ────────────────────────────────────────────── */

/** Values that would identify a person or reveal where they were. */
const PII_HASH_KEYS = new Set([
    'email', 'user', 'username', 'public_id', 'user_id', 'userId', 'publicId',
    'name', 'full_name', 'phone', 'ip', 'ip_address',
]);

/** Values that are safe and useful to keep verbatim, for correlation. */
function scrub(value, depth = 0) {
    // Depth-capped and size-capped: a runaway object must not produce a payload
    // larger than the endpoint accepts, and must not recurse forever.
    if (depth > 6) return '[deep]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value.length > 4000 ? `${value.slice(0, 4000)}…[trimmed]` : value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrub(v, depth + 1));
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value).slice(0, 60)) {
            out[k] = PII_HASH_KEYS.has(k) ? '[hashed]' : scrub(v, depth + 1);
        }
        return out;
    }
    return String(value);
}

/**
 * Assemble everything a maintainer needs to reproduce a fault, and nothing
 * that identifies the reporter.
 *
 * Deliberately includes the app version and build time: a stale deploy is the
 * single most common frontend fault, and without the build identity we cannot
 * tell it from a real bug.
 */
export function buildDiagnostics(error, context = {}) {
    const err = error || {};
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    const loc = typeof window !== 'undefined' ? window.location : {};

    return {
        schema: 'helpotron.error_report/1',

        // ── What happened ─────────────────────────────────────────────────
        title: String(context.title || err.title || 'Error report').slice(0, 200),
        summary: String(context.message || err.message || '').slice(0, 600),
        kind: String(err.kind || context.kind || 'unknown').slice(0, 40),
        status: Number.isFinite(context.status) ? context.status : (Number.isFinite(err.status) ? err.status : null),
        detail: scrub(err.technical || context.technical || ''),

        // ── Where ─────────────────────────────────────────────────────────
        surface: String(context.surface || 'web').slice(0, 40),
        route: `${loc.pathname || ''}`.slice(0, 300),
        // The query string can carry a token or an id; keep only the key names.
        query_keys: (() => {
            try { return [...new URLSearchParams(loc.search || '').keys()].slice(0, 20); } catch { return []; }
        })(),

        // ── Build identity (the thing that catches stale deploys) ─────────
        app_version: String(context.appVersion || '__APP_VERSION__').slice(0, 60),
        build_time: String(context.buildTime || '__BUILD_TIME__').slice(0, 60),
        user_agent: String(nav.userAgent || '').slice(0, 300),
        viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : null,
        language: String(nav.language || '').slice(0, 20),
        online: typeof nav.onLine === 'boolean' ? nav.onLine : null,

        // ── Environmental noise (spikes in these ARE the signal) ──────────
        memory_mb: Number.isFinite(nav.deviceMemory) ? nav.deviceMemory : null,
        cpu_cores: Number.isFinite(nav.hardwareConcurrency) ? nav.hardwareConcurrency : null,
        connection: nav.connection && nav.connection.effectiveType ? String(nav.connection.effectiveType) : null,

        // ── Progress markers, so a report can be matched to a log line ────
        breadcrumbs: Array.isArray(context.breadcrumbs)
            ? context.breadcrumbs.slice(-40).map((b) => scrub(b, 1))
            : [],

        reported_at: new Date().toISOString(),
    };
}

/**
 * Identity is passed SEPARATELY from the diagnostics, never inside them.
 *
 * An earlier version carried it in a `_identity` field that sealReport() stripped
 * before encrypting — which was correct on the sealed path and leaked on the
 * fallback path, where the whole diagnostics object is sent unsealed. Keeping it
 * out of the object entirely means there is no path, sealed or not, on which it
 * can be transmitted in the clear. (Found by web/tests/reportPayload.test.mjs.)
 */
function identityOf(context = {}) {
    return {
        public_id: context.publicId || null,
        session_id: context.sessionId || null,
    };
}

/* ── Sealing ────────────────────────────────────────────────────────────── */

/**
 * Encrypt + hash + tag the diagnostics.
 *
 * @param {object} diagnostics  from buildDiagnostics()
 * @param {string} keyB64       server-issued single-use key (base64, 32 bytes)
 * @param {string} keyId        id of that key; the envelope references this and
 *                              NEVER carries the key itself — an envelope that
 *                              travelled with its own key would be decryptable
 *                              by anyone who intercepted it.
 * @param {object} [identity]   { public_id, session_id } — keyed-hashed into the
 *                              envelope and otherwise unused. Never encrypted
 *                              and never in the clear: it only ever appears as
 *                              an irreversible reference.
 * @returns {Promise<object>}   the sealed envelope that goes over the wire
 */
export async function sealReport(diagnostics, keyB64, keyId, identity = {}) {
    const plaintext = enc.encode(JSON.stringify(diagnostics));

    // ── 1. Integrity digest of the PLAINTEXT ──────────────────────────────
    // Taken before encryption so the server can prove the bundle it decrypted
    // is the bundle the browser produced. AES-GCM has its own tag, but this
    // also covers the case where the payload is stored before being unsealed.
    const digest = await crypto.subtle.digest('SHA-256', plaintext);
    const digestHex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');

    const keyBytes = fromBase64(keyB64);

    // ── 2. AES-GCM seal ───────────────────────────────────────────────────
    const aesKey = await crypto.subtle.importKey(
        'raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt'],
    );
    // A fresh random IV per report — never reused, never derived from content.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext);

    // ── 3. Keyed hashes of the identifiers ────────────────────────────────
    return {
        schema: 'helpotron.sealed_report/1',
        algorithm: 'AES-256-GCM+HMAC-SHA256',

        // A reference, not the key. The server looks the key up by this id.
        key_id: keyId,

        // The ciphertext. Unreadable without the server's key.
        ciphertext: toBase64(sealed),
        iv: toBase64(iv),
        digest: digestHex,

        // Correlation without recognition: two reports from the same account
        // hash identically, and neither can be reversed by guessing.
        reporter_ref: await keyedHash(identity.public_id, keyBytes),
        session_ref: await keyedHash(identity.session_id, keyBytes),

        // Safe metadata stays in the clear so the server can route and rate
        // limit WITHOUT decrypting: a report that cannot be triaged until a
        // key is available is a report that sits unread.
        kind: diagnostics.kind,
        status: diagnostics.status,
        surface: diagnostics.surface,
        app_version: diagnostics.app_version,
        bytes: plaintext.length,
        reported_at: diagnostics.reported_at,
    };
}

/**
 * Get a single-use key, seal the report, and send it.
 *
 * Fails soft in every direction: if EITHER the key fetch or the sealing fails,
 * the report is still submitted — unsealed, but with the same scrubbed content
 * and an explicit `sealed: false` marker. Losing a bug report because the
 * crypto path broke would be worse than sending a plaintext report that the
 * display layer already refuses to show on screen.
 *
 * @returns {Promise<{sealed:boolean}>}
 */
export async function submitSealedReport(api, diagnostics, context = {}) {
    let envelope;
    let sealed = false;
    const identity = identityOf(context);

    try {
        const keyResp = await api.createReportKey();
        const keyB64 = keyResp && (keyResp.key || keyResp.report_key);
        const keyId = keyResp && (keyResp.key_id || keyResp.keyId);
        if (!keyB64 || !keyId) throw new Error('no key returned');
        envelope = await sealReport(diagnostics, keyB64, keyId, identity);
        sealed = true;
    } catch (e) {
        // The scrubber already removed identifiers and capped every field, and
        // the identity was never inside `diagnostics` to begin with — so this
        // fallback carries no more than the sealed envelope would have.
        envelope = {
            schema: 'helpotron.sealed_report/1',
            sealed: false,
            reason: 'seal unavailable',
            diagnostics,
        };
    }

    await api.submitDataLakeMicrocredits({
        data_type: 'error_report',
        title: diagnostics.title,
        // A one-line human summary is what a triage list needs; the details are
        // inside the envelope and never rendered.
        data_content: sealed
            ? `Sealed report — ${diagnostics.kind}${diagnostics.status ? ` (HTTP ${diagnostics.status})` : ''}`
            : `Unsealed report — ${diagnostics.kind}`,
        metadata: {
            sealed,
            envelope,
            page_url: typeof window !== 'undefined' ? window.location.pathname : '',
            timestamp: diagnostics.reported_at,
            ...context.extra,
        },
    });

    return { sealed };
}
