/**
 * reportPayload.test.mjs — the browser half of the sealed error report.
 *
 * Owner requirement (2026-09-23): "when the user reports and sends the real
 * diagnostics, have it send an encrypted hashed json output so the user never
 * sees back end logic ever even when reporting".
 *
 * The server-side round trip is proven in server/tests/test_error_reports.py
 * (including a cross-language test that seals with THIS module and opens with
 * the server code). These cases cover the guarantees that must hold before
 * anything is sent at all: nothing identifying survives, nothing is legible,
 * and a missing key never loses the report.
 *
 * Run: node web/tests/reportPayload.test.mjs
 */
import { buildDiagnostics, sealReport, submitSealedReport } from '../src/lib/reportPayload.js';

let failures = 0;
const ok = (label, cond, detail = '') => {
    if (cond) return;
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
};

// ── Test doubles ────────────────────────────────────────────────────────────

const testKeyBytes = crypto.getRandomValues(new Uint8Array(32));
const testKey = btoa(String.fromCharCode(...testKeyBytes));
const KEY_ID = 'test-key-id-abc';

function decodeB64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function decryptEnvelope(env, keyB64) {
    const key = await crypto.subtle.importKey(
        'raw', decodeB64(keyB64), { name: 'AES-GCM' }, false, ['decrypt'],
    );
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: decodeB64(env.iv) }, key, decodeB64(env.ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(plain));
}

// A realistic error with everything sensitive in it at once.
const error = {
    kind: 'server',
    title: 'Something went wrong on our end',
    message: 'The request was rejected.',
    status: 500,
    technical: JSON.stringify({
        detail: 'traceback at server/main.py:1173',
        token: 'htk_SECRET_VALUE_123',
        db: 'postgres://user:pw@10.0.0.5/helpotron',
    }),
};

const context = {
    surface: 'web',
    publicId: 'RoniDev',
    sessionId: 'sess-abc123',
    breadcrumbs: [{ step: 'opened assignment' }, { email: 'student@example.com' }],
};

/* ── 1. Nothing identifying survives in the clear ───────────────────────── */

const diag = buildDiagnostics(error, context);
const diagJson = JSON.stringify(diag);

ok('buildDiagnostics excludes the identity fields', !diagJson.includes('RoniDev'), diagJson.slice(0, 200));
ok('buildDiagnostics excludes the session id', !diagJson.includes('sess-abc123'));
ok('a nested email is replaced before it is ever encrypted',
    JSON.stringify(diag.breadcrumbs).includes('[hashed]'),
    JSON.stringify(diag.breadcrumbs));
ok('the nested email value itself is gone', !JSON.stringify(diag.breadcrumbs).includes('student@example.com'));

/* ── 2. The envelope is opaque ─────────────────────────────────────────── */

const IDENTITY = { public_id: 'RoniDev', session_id: 'sess-abc123' };
const env = await sealReport(diag, testKey, KEY_ID, IDENTITY);
const envJson = JSON.stringify(env);

for (const secret of ['server/main.py', 'htk_SECRET_VALUE_123', 'postgres://', '10.0.0.5', 'traceback', 'RoniDev', 'student@example.com']) {
    ok(`envelope does not expose ${JSON.stringify(secret)}`, !envJson.includes(secret));
}

ok('the envelope carries a key_id, not the key', env.key_id === KEY_ID);
ok('the key itself is not in the envelope', !envJson.includes(testKey));
ok('the ciphertext is not decodable to plain text by inspection',
    !atob(env.ciphertext).includes('main.py'));

/* ── 3. But it IS decryptable by the holder of the key ─────────────────── */

const opened = await decryptEnvelope(env, testKey);
ok('the server can recover the diagnostics', opened.status === 500);
ok('the server recovers the internal detail', opened.detail.includes('server/main.py'));
ok('identity is not inside the ciphertext either', !JSON.stringify(opened).includes('RoniDev'));
ok('no identity carrier of any kind reaches the server', opened._identity === undefined);

/* ── 4. Correlation without recognition ────────────────────────────────── */

ok('a reporter reference is present', typeof env.reporter_ref === 'string' && env.reporter_ref.length >= 16);
ok('the reporter reference is not the identifier', env.reporter_ref !== 'RoniDev');

const env2 = await sealReport(diag, testKey, KEY_ID, IDENTITY);
ok('two reports from the same person correlate', env.reporter_ref === env2.reporter_ref);
ok('two reports have different ciphertext (fresh IV)', env.ciphertext !== env2.ciphertext);
ok('two reports have different IVs', env.iv !== env2.iv);

/* ── 5. Integrity ──────────────────────────────────────────────────────── */

ok('a digest of the plaintext is sent', /^[0-9a-f]{64}$/.test(env.digest));

/* ── 6. A broken crypto path must not lose the report ──────────────────── */

const calls = [];
const failingApi = {
    createReportKey: async () => { throw new Error('key endpoint down'); },
    submitDataLakeMicrocredits: async (payload) => { calls.push(payload); return { ok: true }; },
};
const res = await submitSealedReport(failingApi, diag, context);
ok('the report is still submitted when sealing fails', calls.length === 1);
ok('an unsealed report is marked as such', calls[0].metadata.sealed === false);
ok('the caller is told it was not sealed', res.sealed === false);
ok('the unsealed fallback still carries no identity',
    !JSON.stringify(calls[0]).includes('RoniDev'));

// And the happy path marks it sealed.
const goodCalls = [];
const goodApi = {
    createReportKey: async () => ({ key_id: KEY_ID, key: testKey }),
    submitDataLakeMicrocredits: async (payload) => { goodCalls.push(payload); return { ok: true }; },
};
const res2 = await submitSealedReport(goodApi, diag, context);
ok('the happy path reports sealed:true', res2.sealed === true);
ok('the stored content line names no internals',
    !/main\.py|traceback|htk_/.test(goodCalls[0].data_content),
    goodCalls[0].data_content);
ok('the stored title is the human headline', goodCalls[0].title === 'Something went wrong on our end');
ok('the raw url with query is not stored', !JSON.stringify(goodCalls[0].metadata).includes('?'));

/* ── 7. Runaway input is bounded ───────────────────────────────────────── */

const huge = buildDiagnostics({ message: 'x'.repeat(10000), technical: 'y'.repeat(100000) });
ok('a runaway message is capped', huge.summary.length <= 600, String(huge.summary.length));
ok('a runaway detail is capped', String(huge.detail).length <= 4100);

const deep = { a: {} };
let cur = deep.a;
for (let i = 0; i < 40; i++) { cur.next = {}; cur = cur.next; }
const deepDiag = buildDiagnostics({ technical: deep });
ok('a deep object does not recurse forever', JSON.stringify(deepDiag).length < 50000);

const manyBreadcrumbs = buildDiagnostics({}, {
    breadcrumbs: Array.from({ length: 500 }, (_, i) => ({ i })),
});
ok('breadcrumbs are capped at 40', manyBreadcrumbs.breadcrumbs.length === 40);

console.log(failures === 0 ? '  all report-payload cases passed' : `  ${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
