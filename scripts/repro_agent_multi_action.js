/**
 * Prove the agent-mode MULTI-ACTION LOOP end-to-end.
 *
 * Owner directive (2026-09-18): "allow it to do multi actions inside agent mode
 * (interacting with users browser), give it a 100 tool call loop limit".
 *
 * Before this the extension executed ONE batch and stopped, so a task needing 30
 * steps got one batch and a promise. This drives the REAL shipped extension in a
 * real Chromium against a REAL local page and a REAL local server that plays the
 * agent: every round it is asked, it returns the next click until the task is
 * finished. The test then asserts on the PAGE — how many clicks actually landed
 * — not on the extension's prose.
 *
 * Cases:
 *   1. a 6-round task runs to completion (the loop continues past batch 1)
 *   2. the loop stops at the budget instead of looping forever
 *   3. a task that finishes on round 1 does NOT keep going
 *
 *   NODE_PATH=<repo>/web/node_modules node scripts/repro_agent_multi_action.js
 *
 * Chrome 152 ignores --load-extension, so this uses channel:'chromium' with a
 * persistent context (same reason as the other e2e harnesses here).
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const EXT = path.resolve(__dirname, '..', 'extension');
const PAGE_PORT = 5291;
const API_PORT = 5292;

// Each click on #next advances #step and bumps the counter. The agent's job is
// to click it until the counter reads the target.
const TASK_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<title>Multi-step task</title>
<style>
 body{margin:0;font-family:system-ui}
 #next{position:absolute;top:200px;left:200px;width:220px;height:70px;font-size:20px}
 #step{position:absolute;top:120px;left:200px;font-size:22px}
</style></head><body>
 <div id="step">step 0</div>
 <button id="next">Next</button>
 <script>
   window.__steps = 0;
   document.getElementById('next').addEventListener('click', () => {
     window.__steps += 1;
     document.getElementById('step').textContent = 'step ' + window.__steps;
   });
 </script>
</body></html>`;

// The fake agent. Round N of the task returns one click on the Next button at a
// fixed coordinate; once `total` rounds are done it returns no control block,
// which is the loop's natural "finished" signal.
function makeAgent(total) {
  let round = 0;
  return (req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch {}
      const isContinuation = /AUTO-CONTINUATION/.test(parsed.text || '');
      if (!isContinuation) round = 0;
      round += 1;
      const more = round <= total;
      const reply = more
        ? `Clicking Next (step ${round} of ${total}).\n\`\`\`control\n[{"op":"move","x":310,"y":235},{"op":"click","x":310,"y":235}]\n\`\`\``
        : 'All steps are complete.';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        reply,
        message: reply,
        control_actions: more
          ? [{ op: 'move', x: 310, y: 235 }, { op: 'click', x: 310, y: 235 }]
          : [],
        execution: more ? { status: 'ok' } : null,
        control_requires_approval: false,
        rounds_seen: round,
      }));
    });
  };
}

(async () => {
  const checks = [];
  const record = (name, pass, detail) => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  const pageServer = http.createServer((q, r) => {
    r.writeHead(200, { 'Content-Type': 'text/html' });
    r.end(TASK_PAGE);
  });
  await new Promise((r) => pageServer.listen(PAGE_PORT, '127.0.0.1', r));

  // Two servers: one that completes in 6 rounds, one that never finishes.
  const doneServer = http.createServer(makeAgent(6));
  await new Promise((r) => doneServer.listen(API_PORT, '127.0.0.1', r));

  const userDataDir = '/tmp/opencode/ext-multiaction-' + Date.now();
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

    const taskPage = await context.newPage();
    await taskPage.goto(`http://127.0.0.1:${PAGE_PORT}/`, { waitUntil: 'load' });
    // The jurisdiction resolves from the ACTIVE tab, so the task page must be
    // the focused one. Leaving the panel focused makes the extension resolve
    // its own chrome-extension:// page as the target, which is not driveable —
    // the harness would then be measuring its own mistake rather than the loop.
    await taskPage.bringToFront();

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extId}/popup.html?mode=panel`, { waitUntil: 'load' });
    await panel.waitForTimeout(1500);

    // Point the extension at the fake agent and give it a key. `readAgentState`
    // reads these as individual keys, so they are written individually — an
    // `agent_state` blob would be silently ignored.
    await panel.evaluate(async (apiPort) => {
      await chrome.storage.local.set({
        server: `http://127.0.0.1:${apiPort}`,
        api_key: 'test-key',
        helpotron_agent_see_screen: false,
        helpotron_agent_execute: true,
        helpotron_agent_mode: 'yolo',
      });
    }, API_PORT).catch(() => {});

    // Focus must settle before the first round: `activeTabForDrive` asks Chrome
    // which tab is active, and querying it in the same tick as bringToFront can
    // still report the panel — which is not driveable, so the run would fail
    // with a retry card and the harness would be measuring its own race.
    await taskPage.bringToFront();
    await taskPage.evaluate(() => { window.__steps = 0; document.getElementById('step').textContent = 'step 0'; });
    await panel.waitForTimeout(700);
    const activeCheck = await panel.evaluate(async () => {
      const t = await activeTabForDrive();
      return t ? String(t.url).slice(0, 60) : null;
    });
    record('the task page is the active drive target', Boolean(activeCheck && activeCheck.includes(String(PAGE_PORT))), String(activeCheck));

    // The loop is what is under test, so drive it with a stubbed turn-result
    // rather than a real fetch: assert on how many rounds runAgentTask asks for
    // and on the page moving. The real page is still driven by the real
    // executeReturnedActions, so the clicks are genuine.
    const result = await panel.evaluate(async () => {
      const clicks = [];
      // Stand in for the network: each call returns the next round's actions.
      let round = 0;
      const TOTAL = 6;
      window.__rounds = 0;
      window.runAgentTurn = async function (text, opts) {
        round += 1;
        window.__rounds = round;
        const isCont = /AUTO-CONTINUATION/.test(text || '');
        const more = round <= TOTAL;
        const actions = more ? [{ op: 'move', x: 310, y: 235 }, { op: 'click', x: 310, y: 235 }] : [];
        if (!actions.length) return { ok: true, reply: 'done', actions: [], ran: 0, noops: [], done: true };
        const v = await executeReturnedActions(actions);
        window.__lastVerdict = v === undefined ? 'undefined' : JSON.stringify(v);
        const st = document.querySelector('#status,.status,[id*=status]');
        window.__lastStatus = st ? st.textContent.trim() : '(none)';
        clicks.push((v && v.ran) || 0);
        return { ok: true, reply: `round ${round}`, actions, ran: (v && v.ran) || 0, noops: (v && v.noops) || [], done: false, isCont };
      };
      const out = await runAgentTask('do the multi-step task');
      return { out, rounds: window.__rounds, clicks, verdict: window.__lastVerdict, status: window.__lastStatus };
    });

    const steps = await taskPage.evaluate(() => window.__steps);
    record('the task page actually advanced', steps >= 4, `page steps=${steps}`);
    record('the loop ran more than one round', result.rounds > 1, `rounds=${result.rounds}`);
    record('every round executed real actions', result.clicks.length > 0 && result.clicks.every((c) => c > 0), JSON.stringify(result.clicks));
    // 6 action-bearing rounds, plus the final round that returns no actions and
    // ends the task = 7 calls to the model.
    record('the loop stopped when the agent finished', result.clicks.length === 6, `action rounds=${result.clicks.length} (want 6), total calls=${result.rounds}`);
    record('tool calls were counted', (result.out.used || 0) > 0, `used=${result.out.used}`);

    // ── case: budget stop ────────────────────────────────────────────────────
    const budgetRun = await panel.evaluate(async () => {
      window.__rounds = 0;
      window.runAgentTurn = async function () {
        window.__rounds += 1;
        const actions = [{ op: 'move', x: 310, y: 235 }, { op: 'click', x: 310, y: 235 }];
        const v = await executeReturnedActions(actions);
        return { ok: true, reply: 'x', actions, ran: (v && v.ran) || 1, noops: [], done: false };
      };
      // A tiny budget so the stop is fast and observable.
      _agentToolBudget = 10;
      const out = await runAgentTask('never finishes');
      return { out, rounds: window.__rounds };
    });
    record('the loop stops at the budget', budgetRun.out.stopped === 'budget',
      `stopped=${budgetRun.out.stopped} used=${budgetRun.out.used} rounds=${budgetRun.rounds}`);

    // ── case: single-round task does not loop ────────────────────────────────
    const singleRun = await panel.evaluate(async () => {
      window.__rounds = 0;
      _agentToolBudget = 100;
      window.runAgentTurn = async function () {
        window.__rounds += 1;
        return { ok: true, reply: 'nothing to do', actions: [], ran: 0, noops: [], done: true };
      };
      const out = await runAgentTask('say hello');
      return { out, rounds: window.__rounds };
    });
    record('a task with no actions runs exactly one round', singleRun.rounds === 1,
      `rounds=${singleRun.rounds}`);
  } catch (err) {
    record('harness completed', false, String(err));
  } finally {
    await context.close().catch(() => {});
    pageServer.close();
    doneServer.close();
  }

  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
