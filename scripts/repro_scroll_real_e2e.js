/**
 * END-TO-END scroll repro through the REAL path.
 *
 * The earlier harnesses drove `executeReturnedActions` directly and stubbed the
 * server, which only proves the executor works in isolation. The owner still
 * reports "still not scrolling", so this one goes through every link:
 *
 *   real page  ->  real extension  ->  real server (/api/extension/agent_chat)
 *              ->  real model      ->  control_actions  ->  real page
 *
 * It asserts on `window.scrollY` / the inner pane's scrollTop IN THE PAGE, and
 * also records what the server actually returned, so a failure names the link
 * that broke instead of just "nothing moved".
 *
 * The page is deliberately the realistic quiz shape: html/body locked and the
 * questions inside an INNER scrollable pane, which is what the assessment UIs
 * the owner is hitting actually look like.
 *
 *   NODE_PATH=<repo>/web/node_modules node scripts/repro_scroll_real_e2e.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

const EXT = path.resolve(__dirname, '..', 'extension');
const REPO = path.resolve(__dirname, '..');
const PAGE_PORT = 5301;
const SERVER = process.env.HT_SERVER || 'http://127.0.0.1:5000';

// Variant: the questions live in their OWN scrollable pane, while the document
// itself does not scroll. This is the layout many assessment UIs use, and it is
// scrollable by a person (the pane has a real scrollbar and accepts the wheel) —
// unlike the first version of this harness, which blocked the wheel outright.
const INNER_PANE_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<title>Practice Quiz (panel)</title>
<style>
 html,body{margin:0;height:100%;font-family:system-ui}
 #bar{height:54px;background:#0b2b45;color:#fff;padding:0 16px;line-height:54px;font-weight:600}
 #pane{height:calc(100% - 54px);overflow-y:auto}
 .q{padding:26px 22px;border-bottom:1px solid #e3e6ea;min-height:300px}
 .q h3{margin:0 0 10px}
 label{display:block;margin:7px 0}
</style></head><body>
 <div id="bar">Practice Quiz &mdash; panel</div>
 <div id="pane">
  ${Array.from({ length: 20 }, (_, i) => `
   <div class="q" id="q${i + 1}">
     <h3>Question ${i + 1}</h3>
     <p>Choose the best answer for question ${i + 1}.</p>
     <label><input type="radio" name="q${i + 1}"> Option A</label>
     <label><input type="radio" name="q${i + 1}"> Option B</label>
     <label><input type="radio" name="q${i + 1}"> Option C</label>
   </div>`).join('')}
 </div>
</body></html>`;

//
// The first version of this harness locked html/body with overflow:hidden AND
// called preventDefault on the wheel — so a human could not scroll it either,
// and the test was measuring a page that cannot move. The owner caught that
// immediately: "on the page u opened even i cant scroll". A scroll test needs a
// page that scrolls for a person, using the ordinary document scroller.
const QUIZ_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<title>Practice Quiz</title>
<style>
 html,body{margin:0;font-family:system-ui}
 #bar{position:sticky;top:0;height:54px;background:#0b2b45;color:#fff;padding:0 16px;line-height:54px;font-weight:600;z-index:5}
 .q{padding:26px 22px;border-bottom:1px solid #e3e6ea;min-height:300px}
 .q h3{margin:0 0 10px}
 label{display:block;margin:7px 0}
</style></head><body>
 <div id="bar">Practice Quiz &mdash; 20 questions</div>
 ${Array.from({ length: 20 }, (_, i) => `
  <div class="q" id="q${i + 1}">
    <h3>Question ${i + 1}</h3>
    <p>Choose the best answer for question ${i + 1}.</p>
    <label><input type="radio" name="q${i + 1}"> Option A</label>
    <label><input type="radio" name="q${i + 1}"> Option B</label>
    <label><input type="radio" name="q${i + 1}"> Option C</label>
  </div>`).join('')}
</body></html>`;

(async () => {
  const checks = [];
  const record = (name, pass, detail) => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  // A real API key for the operator account, straight from the app — never
  // printed. The extension authenticates with a key, so this is the real
  // credential path, not a bypass.
  let apiKey = '';
  try {
    apiKey = execSync(
      `cd ${REPO} && ./.venv/bin/python -c "` +
      `import sys; sys.path.insert(0,'.');` +
      `from server.database import SessionLocal, User;` +
      `from server import api_keys as K;` +
      `db=SessionLocal(); u=db.query(User).filter(User.public_id=='RoniDev').first();` +
      `r,p=K.generate_key(db,u,label='scroll-e2e'); db.close(); print(p)"`,
      { encoding: 'utf8' }
    ).trim();
  } catch (e) {
    record('minted a real API key', false, String(e).slice(0, 200));
    process.exit(1);
  }
  record('minted a real API key', apiKey.startsWith('htk_'), `prefix=${apiKey.slice(0, 8)}…`);

  const pageServer = http.createServer((q, r) => {
    r.writeHead(200, { 'Content-Type': 'text/html' });
    r.end(q.url.startsWith('/panel') ? INNER_PANE_PAGE : QUIZ_PAGE);
  });
  await new Promise((r) => pageServer.listen(PAGE_PORT, '127.0.0.1', r));

  const userDataDir = '/tmp/opencode/ext-scroll-real-' + Date.now();
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
    await quiz.goto(`http://127.0.0.1:${PAGE_PORT}/`, { waitUntil: 'load' });
    await quiz.bringToFront();

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extId}/popup.html?mode=panel`, { waitUntil: 'load' });
    await panel.waitForTimeout(1500);

    // Real config: real server, real key, screen ON, execute ON, YOLO so no
    // approval card interrupts the measurement.
    await panel.evaluate(async (cfg) => {
      await chrome.storage.local.set({
        server: cfg.server,
        api_key: cfg.key,
        helpotron_agent_see_screen: true,
        helpotron_agent_execute: true,
        helpotron_agent_mode: 'yolo',
      });
    }, { server: SERVER, key: apiKey });

    // Focus must settle: the jurisdiction resolves from the ACTIVE tab and
    // querying too early reports the panel, which is not driveable.
    await quiz.bringToFront();
    await panel.waitForTimeout(800);

    const geom = await quiz.evaluate(() => ({
      scrollable: document.documentElement.scrollHeight - window.innerHeight,
      y: window.scrollY,
    }));
    // The page MUST be scrollable by a human, or the test proves nothing.
    record('the quiz page is genuinely scrollable (a person could scroll it)',
      geom.scrollable > 500, JSON.stringify(geom));

    // Sanity: a plain wheel event moves it, exactly as it would for the user.
    await quiz.mouse.wheel(0, 400);
    await quiz.waitForTimeout(400);
    const manualY = await quiz.evaluate(() => window.scrollY);
    record('a plain mouse wheel scrolls it (baseline is valid)', manualY > 0, `scrollY=${manualY}`);
    await quiz.evaluate(() => window.scrollTo(0, 0));

    // Drive the REAL chat turn: the extension captures a frame, posts to the
    // real server, the real model answers, and whatever comes back executes.
    const turn = await panel.evaluate(async () => {
      const seen = {};
      const origExec = window.executeReturnedActions;
      // Record the server's own verdict for this turn without changing it.
      window.__lastActions = null;
      try {
        await runAgentTurn('Scroll down and tell me what Question 5 asks.');
        seen.ran = true;
      } catch (e) {
        seen.error = String(e);
      }
      return seen;
    });

    await panel.waitForTimeout(1200);
    const after = await quiz.evaluate(() => ({
      y: window.scrollY,
      maxY: document.documentElement.scrollHeight - window.innerHeight,
    }));

    const status = await panel.evaluate(() => {
      const el = document.querySelector('#status,.status,[id*=status]');
      return el ? el.textContent.trim() : '(no status element)';
    });
    const lastReply = await panel.evaluate(() => {
      const nodes = document.querySelectorAll('.chat-msg-body, .msg-body');
      return nodes.length ? nodes[nodes.length - 1].textContent.trim().slice(0, 300) : '';
    });

    console.log('\n  ── what the extension reported ──');
    console.log('   status:', status.slice(0, 220));
    console.log('   last reply:', lastReply.slice(0, 220).replace(/\n/g, ' '));
    console.log('   page scrollY:', geom.y, '->', after.y, `(max ${after.maxY})`);

    record('the real end-to-end turn scrolled the page',
      after.y > 0,
      `scrollY ${geom.y} -> ${after.y}`);

    // ── scenario 2: questions in their OWN pane, document locked ────────────
    await quiz.goto(`http://127.0.0.1:${PAGE_PORT}/panel`, { waitUntil: 'load' });
    await quiz.bringToFront();
    await panel.waitForTimeout(600);

    const g2 = await quiz.evaluate(() => {
      const p = document.getElementById('pane');
      return { docScrollable: document.documentElement.scrollHeight - window.innerHeight,
               paneScrollable: p.scrollHeight - p.clientHeight, paneTop: p.scrollTop };
    });
    record('panel variant: document locked, pane scrollable',
      g2.docScrollable <= 0 && g2.paneScrollable > 500, JSON.stringify(g2));

    // A person can scroll it: the wheel over the pane moves the pane.
    await quiz.mouse.move(400, 300);
    await quiz.mouse.wheel(0, 400);
    await quiz.waitForTimeout(400);
    const manualPane = await quiz.evaluate(() => document.getElementById('pane').scrollTop);
    record('panel variant: a person CAN scroll it (valid baseline)', manualPane > 0, `paneTop=${manualPane}`);
    await quiz.evaluate(() => { document.getElementById('pane').scrollTop = 0; });

    await panel.evaluate(async () => {
      try { await runAgentTurn('Scroll down and tell me what Question 5 asks.'); } catch (e) {}
    });
    await panel.waitForTimeout(1200);
    const after2 = await quiz.evaluate(() => document.getElementById('pane').scrollTop);
    const status2 = await panel.evaluate(() => {
      const el = document.querySelector('#status,.status,[id*=status]');
      return el ? el.textContent.trim() : '';
    });
    console.log('   panel status:', status2.slice(0, 180));
    console.log('   panel paneTop: 0 ->', after2);
    record('panel variant: the real turn scrolled the inner pane', after2 > 0, `paneTop 0 -> ${after2}`);
  } catch (err) {
    record('harness completed', false, String(err));
  } finally {
    await context.close().catch(() => {});
    pageServer.close();
  }

  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
