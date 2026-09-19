/**
 * Reproduce + guard the "it said it scrolled and never did" report.
 *
 * Owner report (2026-09-18): the extension's Study Buddy could not scroll a
 * practice quiz, and the agent said it had scrolled anyway.
 *
 * This drives the REAL shipped extension in a real Chromium against a page
 * taller than the viewport, dispatches a scroll op through the same
 * `executeReturnedActions` path the chat uses, and reads `window.scrollY` back
 * out of the page. It asserts on the PAGE, not on the extension's own prose or
 * status line — the whole bug was that those two disagreed.
 *
 * Cases, each of which has to move the page:
 *   1. a well-formed scroll op (deltas present)
 *   2. the shape the directive literally prints in its prompt:
 *      {"op":"scroll","x":0,"y":0,"deltaX":0,"deltaY":0}
 *
 *   NODE_PATH=<repo>/web/node_modules node scripts/repro_scroll_op.js
 *
 * Chrome 152 ignores --load-extension, so this uses channel:'chromium' with a
 * persistent context (same reason as the other e2e harnesses here).
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const EXT = path.resolve(__dirname, '..', 'extension');
const PORT = 5199;

const TALL_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<title>Tall practice quiz</title>
<style>
  body { margin:0; font-family: system-ui; }
  .hdr { position:sticky; top:0; background:#123; color:#fff; padding:14px; z-index:5; }
  .q { padding:40px 20px; border-bottom:1px solid #ddd; height:260px; }
</style></head><body>
  <div class="hdr">Practice Quiz — 20 questions</div>
  ${Array.from({ length: 20 }, (_, i) =>
    `<div class="q" id="q${i}"><h3>Question ${i + 1}</h3><p>Pick the best answer.</p>
     <label><input type="radio" name="q${i}"> A</label>
     <label><input type="radio" name="q${i}"> B</label></div>`).join('')}
</body></html>`;

(async () => {
  const checks = [];
  const record = (name, pass, detail) => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(TALL_PAGE);
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  const userDataDir = '/tmp/opencode/ext-scroll-repro-' + Date.now();
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });

  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
    const extId = new URL(worker.url()).host;
    record('extension loaded', true, extId);

    const quiz = await context.newPage();
    await quiz.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    await quiz.bringToFront();

    const dims = await quiz.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollable: document.documentElement.scrollHeight - window.innerHeight,
    }));
    record('page is taller than the viewport', dims.scrollable > 400, JSON.stringify(dims));

    // The popup document is where executeReturnedActions lives. Opened as a
    // normal page so the driver survives the awaits (a popup document is
    // destroyed when focus leaves it).
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extId}/popup.html?mode=panel`, { waitUntil: 'load' });
    await panel.waitForTimeout(1200);

    const runScroll = async (op) => {
      // The quiz must stay the ACTIVE tab: the jurisdiction resolves from the
      // active tab, and focusing the panel would make the extension target its
      // own chrome-extension:// page — which is not driveable. The harness must
      // not create the failure it is trying to measure.
      await quiz.bringToFront();
      await quiz.evaluate(() => window.scrollTo(0, 0));
      const res = await panel.evaluate(async (theOp) => {
        if (typeof executeReturnedActions !== 'function') return { error: 'executeReturnedActions not exposed' };
        try {
          // Capture the VERDICT, not just "it did not throw" — {ran:0} means the
          // op was skipped somewhere, which is a different bug from a dispatch
          // that ran and had no effect.
          const verdict = await executeReturnedActions([theOp]);
          return { ok: true, verdict };
        } catch (e) {
          return { error: String(e) };
        }
      }, op);
      await panel.waitForTimeout(600);
      await quiz.bringToFront();
      const y = await quiz.evaluate(() => window.scrollY);
      return { res, y };
    };

    // ── case 1: a well-formed scroll op actually moves the page ───────────────
    const c1 = await runScroll({ op: 'scroll', x: 400, y: 300, deltaX: 0, deltaY: 600 });
    record('scroll op with deltas moves the page', c1.y > 100,
      `scrollY=${c1.y} ${JSON.stringify(c1.res)}`);

    // ── case 2: the literal shape printed in the agent's own prompt ───────────
    // A zero-distance scroll cannot move anything, so the requirement is NOT
    // that the page moves — it is that the extension SAYS SO instead of
    // reporting "executed". That silence is what the owner hit.
    const c2 = await runScroll({ op: 'scroll', x: 0, y: 0, deltaX: 0, deltaY: 0 });
    const verdict2 = c2.res && c2.res.verdict;
    const reportedNoEffect = Boolean(verdict2 && Array.isArray(verdict2.noops) && verdict2.noops.length > 0);
    record('zero-delta scroll is REPORTED, not silently passed off as done',
      c2.y === 0 && reportedNoEffect,
      `scrollY=${c2.y} noops=${JSON.stringify(verdict2 && verdict2.noops)}`);
  } catch (err) {
    record('harness completed', false, String(err));
  } finally {
    await context.close().catch(() => {});
    server.close();
  }

  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
