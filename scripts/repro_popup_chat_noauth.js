/**
 * Reproduce + guard the "no credential" chat crash.
 *
 * Owner report (2026-09-18): sending a chat message in the extension panel threw
 *
 *   Uncaught (in promise) TypeError: Cannot set properties of null
 *   (setting 'textContent')   at popup.js:3163
 *
 * The line was
 *
 *   typingNode.querySelector('span:last-child').textContent = '…connect…'
 *
 * which can never match. A chat bubble is
 *   [span.chat-sender, span.chat-msg-body, button.copy]
 * so its last child is the copy BUTTON, not a span. The lookup returned null,
 * the assignment threw, and because it happened BEFORE `chatBusy = false` the
 * composer stayed locked — every later send hit `if (chatBusy) return`. The
 * user-visible symptom is a chat that says "Thinking…" forever and stops
 * accepting input.
 *
 * This drives the REAL shipped extension in a real Chromium. It asserts on the
 * DOM rather than on internals: after submitting with no key, the placeholder
 * bubble must carry the "connect" message, not "Thinking…".
 *
 *   NODE_PATH=<repo>/web/node_modules node scripts/repro_popup_chat_noauth.js
 *
 * Chrome 152 ignores --load-extension, so this uses channel:'chromium' with a
 * persistent context (same reason as the other e2e harnesses here).
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const EXT = path.resolve(__dirname, '..', 'extension');

(async () => {
  const checks = [];
  const record = (name, pass, detail) => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  const userDataDir = '/tmp/opencode/ext-chat-repro-' + Date.now();
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = new URL(worker.url()).host;

  // Start from a clean slate: NO api_key, so authToken() resolves null and the
  // submit handler takes exactly the branch the owner crashed on.
  await worker.evaluate(async () => {
    await chrome.storage.local.clear();
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));

  const panelUrl = `chrome-extension://${extId}/popup.html?mode=panel`;
  await page.goto(panelUrl, { waitUntil: 'domcontentloaded' }).catch((e) => {
    console.log('  (panel goto note: ' + String(e).slice(0, 80) + ')');
  });
  // popup.js wires listeners on load; give it a beat.
  await page.waitForTimeout(1500);

  // The chat lives in a hidden view-panel until its nav tab is selected — this
  // is the user path (and the mode the owner was in when it threw).
  await page.click('#tabNavChat').catch(() => {});
  await page.waitForTimeout(400);

  const hasInputs = await page.evaluate(() => ({
    input: !!document.getElementById('popupChatInput'),
    form: !!document.getElementById('popupChatForm'),
    messages: !!document.getElementById('popupChatMessages'),
    visible: !!(document.getElementById('viewChat') &&
                !document.getElementById('viewChat').classList.contains('hidden')),
  }));
  record('the chat composer is present in the panel', hasInputs.input && hasInputs.form,
    JSON.stringify(hasInputs));
  record('the chat tab is reachable in panel mode', hasInputs.visible,
    'viewChat hidden=' + !hasInputs.visible);

  if (!hasInputs.input || !hasInputs.form) {
    console.log('\nCould not drive the composer; aborting.');
    await context.close();
    process.exit(2);
  }

  // Drive it the way a user would.
  await page.fill('#popupChatInput', 'hello agent');
  await page.evaluate(() => {
    document.getElementById('popupChatForm').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(2500);

  const state = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('#popupChatMessages .chat-msg.agent'));
    const last = nodes[nodes.length - 1];
    const body = last ? last.querySelector('.chat-msg-body') : null;
    return {
      agentBubbles: nodes.length,
      lastText: body ? (body.textContent || '').trim() : '',
      // The bubble that is NOT the greeting: what the submit produced.
      allTexts: nodes.map((n) => {
        const b = n.querySelector('.chat-msg-body');
        return b ? (b.textContent || '').trim().slice(0, 60) : '';
      }),
    };
  });

  const produced = state.allTexts.filter((t) => t.startsWith('⚠️'));
  record('submitting with no key shows the connect prompt (not a stuck "Thinking…")',
    produced.length > 0,
    JSON.stringify(state.allTexts.slice(-3)));

  record('no uncaught page error was raised',
    pageErrors.length === 0,
    pageErrors.slice(0, 2).join(' | ') || 'none');

  // The wedge: a second send must still be accepted. With chatBusy stuck true
  // the composer silently ignores input, so a second bubble never appears.
  const before = state.agentBubbles;
  await page.fill('#popupChatInput', 'second message');
  await page.evaluate(() => {
    document.getElementById('popupChatForm').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() =>
    document.querySelectorAll('#popupChatMessages .chat-msg.agent').length);

  record('the composer still accepts a second send (chatBusy not wedged)',
    after > before, `bubbles ${before} -> ${after}`);

  await context.close();

  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  fs.writeFileSync('/tmp/opencode/popup_chat_repro.json', JSON.stringify(checks, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('harness error:', e);
  process.exit(3);
});
