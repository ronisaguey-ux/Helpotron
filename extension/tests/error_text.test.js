// The extension's error formatter.
//
// Owner report (2026-09-23): "the errors literally just flash random backend code
// on my screen, which is tragic". FastAPI returns `detail` as an ARRAY for
// request-validation failures, and `typeof [] === 'object'`, so any render that
// trusts the type prints the literal payload or the string "[object Object]".
//
// Every case below is a payload the API actually produces. Run:
//   node --test extension/tests/error_text.test.js

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const SL = require(path.join(__dirname, '..', 'server_logic.js'));
const humanErrorText = SL.humanErrorText;
const looksHumanMessage = SL.looksHumanMessage;

// Unmistakably machine output — nothing here may ever reach a user.
const MACHINE = /[{}[\]<>]|^\s*\{|"loc"|"msg"|type":|Traceback|at \w+\.\w+\(/;

function rendered(label, detail, status) {
  const out = humanErrorText(detail, status);
  assert.strictEqual(typeof out, 'string', `${label}: must return a string`);
  assert.ok(out.trim().length > 0, `${label}: must not be empty`);
  assert.ok(!MACHINE.test(out), `${label}: leaked machine output -> ${JSON.stringify(out)}`);
  assert.ok(!/\[object Object\]/.test(out), `${label}: printed [object Object]`);
  assert.ok(!/^\s*HTTP \d+\s*$/.test(out), `${label}: status code is not a message`);
  return out;
}

// ── The exact shape that caused the report ──────────────────────────────────

test('FastAPI validation array renders as prose, never as JSON', () => {
  const detail = [{
    type: 'missing', loc: ['body', 'f0'], msg: 'Field required',
    input: {}, url: 'https://errors.pydantic.dev/2/v/missing',
  }];
  const out = rendered('validation array', detail, 422);
  assert.strictEqual(out, 'Field required (f0)');
  assert.ok(!out.includes('pydantic'), 'must not leak the docs URL');
});

test('the raw payload never survives, even as a substring', () => {
  const detail = [{ type: 'int_parsing', loc: ['path', 'entry_id'], msg: 'Input should be a valid integer' }];
  const out = humanErrorText(detail, 422);
  assert.ok(!out.includes('int_parsing'), `leaked the error type: ${out}`);
  assert.ok(!out.includes('loc'), `leaked the field key: ${out}`);
});

test('several field errors become one line, capped at three', () => {
  const detail = ['a', 'b', 'c', 'd', 'e'].map((f) => ({ loc: ['body', f], msg: `${f} is required` }));
  const out = rendered('many fields', detail, 422);
  assert.strictEqual(out.split(';').length, 3, 'caps at three so it stays one readable line');
});

// ── Ordinary server messages are preserved verbatim ─────────────────────────

test('a plain string detail is kept', () => {
  assert.strictEqual(humanErrorText('Assignment not found', 404), 'Assignment not found');
});

test('a nested message key is unwrapped', () => {
  assert.strictEqual(humanErrorText({ message: 'Token limit reached' }, 402), 'Token limit reached');
  assert.strictEqual(humanErrorText({ error: 'Key revoked' }, 401), 'Key revoked');
});

// ── Anything that looks like code falls back to a sentence ──────────────────

test('an object with no usable message yields a status sentence', () => {
  const out = rendered('opaque object', { code: 'ERR_AUTH_LEASE_EXPIRED', node: 'router-7' }, 500);
  assert.strictEqual(out, 'The server hit an internal error.');
});

test('a SCREAMING_CASE code is rejected as not-human', () => {
  assert.strictEqual(looksHumanMessage('ERR_ROUTER_NODE_UNRESOLVED'), false);
  assert.strictEqual(humanErrorText('ERR_ROUTER_NODE_UNRESOLVED', 500), 'The server hit an internal error.');
});

test('a traceback is rejected', () => {
  const tb = 'Traceback (most recent call last):\n  File "main.py", line 9';
  assert.strictEqual(looksHumanMessage(tb), false);
  assert.strictEqual(humanErrorText(tb, 500), 'The server hit an internal error.');
});

test('markup and URLs are rejected as messages', () => {
  assert.strictEqual(looksHumanMessage('<div class="error">boom</div>'), false);
  assert.strictEqual(looksHumanMessage('https://errors.pydantic.dev/2/v/missing'), false);
});

test('a multi-line dump is rejected (it would break the chat bubble)', () => {
  assert.strictEqual(looksHumanMessage('line one\nline two'), false);
});

// ── The fallback always names the status, and never just the number ─────────

test('a known status has its own sentence', () => {
  assert.match(humanErrorText(undefined, 401), /key/i);
  assert.match(humanErrorText(undefined, 429), /too many requests/i);
  assert.match(humanErrorText(undefined, 503), /temporarily unavailable/i);
});

test('an unknown status still reads as a sentence', () => {
  const out = rendered('unknown status', undefined, 418);
  assert.strictEqual(out, 'Something went wrong (HTTP 418).');
});

test('no status and no detail at all still yields a sentence', () => {
  assert.strictEqual(humanErrorText(undefined, undefined), 'Something went wrong.');
});

// ── Every shape the endpoint can send, swept ───────────────────────────────

test('no input shape leaks machine output', () => {
  const shapes = [
    undefined, null, '', 'ok', 0, false, [], {},
    [{ msg: 'Field required' }],
    [{ loc: ['body', 'x'], msg: 'Field required' }],
    [{ detail: { nested: true } }],
    { detail: [{ msg: 'x' }] },
    { message: '' },
    { message: '   ' },
    { code: 500, stack: 'at foo()' },
    '\n\n',
    '{"detail":"raw"}',
    ['<b>bold</b>'],
  ];
  for (const s of shapes) {
    for (const status of [undefined, 400, 422, 500, 999]) {
      rendered(`shape ${JSON.stringify(s)} @${status}`, s, status);
    }
  }
});
