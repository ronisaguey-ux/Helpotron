// Diagnostic: drag-select text in the live agent chat bubble and verify the
// selection survives mouseup. Creates a fresh account each run.
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = 'http://localhost:5173';
const PU = 'selprobe_' + Date.now().toString(36);
const PW = 'Probe123!';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const page = await browser.newPage();
const log = (s) => console.log('[pg]', s);
const selState = () => page.evaluate(() => {
  const s = window.getSelection();
  const el = document.querySelector('[data-selprobe="1"]');
  return {
    selText: s ? String(s.toString()).slice(0, 90) : null,
    rangeCount: s ? s.rangeCount : -1,
    elPresent: !!el,
    userSelect: el ? getComputedStyle(el).userSelect : null,
  };
});
const dump = async () => {
  const t = await page.locator('body').innerText().catch(() => '');
  fs.writeFileSync('/tmp/selprobe_body.txt', t);
  log('BODY DUMPED -> /tmp/selprobe_body.txt (len=' + t.length + ')');
};
try {
  await page.goto(BASE);
  await page.waitForTimeout(900);
  await page.getByText('Accept', { exact: true }).click({ timeout: 2000 }).catch(() => {});
  log('auth modal visible=' + await page.getByRole('dialog', { name: /Authentication/ }).count());
  const signupTab = page.getByText('Sign up', { exact: false }).first();
  if (await signupTab.count()) { await signupTab.click({ timeout: 2000 }); await page.waitForTimeout(400); }
  const idField = page.locator('input[placeholder*="username" i], input[placeholder*="public" i], input[autocomplete="username"]').first();
  await idField.fill(PU);
  const pwFields = page.locator('input[type="password"]');
  await pwFields.nth(0).fill(PW);
  if (await pwFields.count() > 1) await pwFields.nth(1).fill(PW);
  const consent = page.getByText('I agree to the Academic').first();
  if (await consent.count()) await consent.click();
  await page.getByRole('button', { name: /Create Free Account/i }).first().click({ timeout: 4000 });
  log('submitted signup');
  // wait until auth modal disappears (or terms shows)
  let t0 = Date.now();
  let authed = false;
  while (Date.now() - t0 < 15000) {
    await page.waitForTimeout(500);
    if (await page.getByRole('dialog', { name: /Authentication/ }).count() === 0) { authed = true; break; }
  }
  log('auth closed=' + authed + ' url=' + page.url());
  // terms modal
  const acceptTerms = page.getByRole('button', { name: /Accept Legal Terms/i }).first();
  if (await acceptTerms.count()) {
    const chk = page.locator('.fixed input[type="checkbox"]').first();
    await chk.check({ timeout: 4000 }).catch(() => {});
    await acceptTerms.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
    log('terms accepted');
  }
  // dismiss anything else by Escape
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(800);
  // navigate to My Agent via sidebar nav
  const nav = page.getByRole('button').filter({ hasText: 'My Agent' }).first();
  let t1 = Date.now();
  let navOk = false;
  while (Date.now() - t1 < 10000) {
    if (await nav.count()) { await nav.click({ timeout: 3000 }).catch(() => {}); navOk = true; break; }
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(2500);
  log('navOk=' + navOk + ' url=' + page.url());
  const found = await page.evaluate(() => {
    const hits = [];
    document.querySelectorAll('div,span').forEach((el) => {
      if ((el.textContent || '').includes('personal agent') && hits.length < 3) hits.push({ cls: String(el.className).slice(0, 90), len: (el.textContent || '').length });
    });
    return hits;
  });
  log('seed scan: ' + JSON.stringify(found));
  if (!found.length) {
    log('NO CHAT TEXT — typing a message to create one');
    const input = page.locator('input[aria-label="Agent prompt input"]').first();
    if (await input.count()) {
      await input.fill('Say hi');
      await page.getByRole('button', { name: /Send message to agent/i }).first().click({ timeout: 3000 });
      await page.waitForTimeout(3500);
      const found2 = await page.evaluate(() => {
        const hits = [];
        document.querySelectorAll('div,span').forEach((el) => {
          const t = (el.textContent || '');
          if (t.length > 8 && !t.includes('personal agent') && /yourself|hi|here|agent/i.test(t) && hits.length < 3) hits.push({ cls: String(el.className).slice(0, 70), text: t.slice(0, 60) });
        });
        return hits;
      });
      log('after send: ' + JSON.stringify(found2));
    }
    await page.screenshot({ path: '/tmp/selprobe_state.png', fullPage: true });
    await dump();
  }
  const target = page.locator('div[class*="max-w-[85%]"]').filter({ hasText: /Say hi|Overlord Agent online|Insufficient tokens/i }).first();
  if (!(await target.count())) target = page.locator('div[class*="max-w-[85%]"]').first();
  const n = await target.count();
  log('bubble count=' + n);
  if (!n) {
    log('NO BUBBLE — exiting with screenshot');
    await page.screenshot({ path: '/tmp/selprobe_nobubble.png', fullPage: true });
    process.exit(0);
  }
  await target.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    window.__trace = [];
    window.addEventListener('mouseup', (e) => {
      const el = e.target;
      window.__trace.push({
        tag: el.tagName, cls: String(el.className).slice(0, 60),
        selLen: window.getSelection() ? String(window.getSelection()).length : -1,
      });
    }, true);
  });
  const box = await target.boundingBox();
  log('bubble box=' + JSON.stringify(box));
  if (!box) { log('no bounding box'); process.exit(0); }
  await target.evaluate((el) => el.setAttribute('data-selprobe', '1'));
  const { y } = box;
  // find a point that lands ON TEXT (caretRangeFromPoint) at mid height
  const pts = await page.evaluate(([bx, by, bw, bh]) => {
    const out = [];
    for (let k = 0; k < 30; k++) {
      const px = bx + bw * (k / 30), py = by + bh / 2;
      const r = document.caretRangeFromPoint(px, py);
      if (r) {
        const t = r.startContainer;
        out.push({ px: Math.round(px), inText: t.nodeType === Node.TEXT_NODE && String(t.textContent).trim().length > 0, nodeTxt: String(t.textContent).slice(0, 30) });
        if (out.length > 6) break;
      }
    }
    return out;
  }, [box.x, box.y, box.width, box.height]);
  log('text points: ' + JSON.stringify(pts.slice(0, 4)));
  const x1 = pts[0]?.px ?? box.x + 40;
  const x2 = Math.min(x1 + 200, box.x + box.width - 8);
  const yMid = y + box.height / 2;
  const val = await page.locator('div[data-selprobe="1"]').evaluate((el) => ({
    text: el.textContent.slice(0, 60),
    userSelect: getComputedStyle(el).userSelect,
    pointerEvents: getComputedStyle(el).pointerEvents,
  }));
  log('bubble style: ' + JSON.stringify(val));
  const chain = await page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    const out = [];
    let n = el;
    while (n) {
      const cs = getComputedStyle(n);
      out.push({ tag: n.tagName, cls: String(n.className).slice(0, 70), us: cs.userSelect, wUs: cs.webkitUserSelect, pe: cs.pointerEvents });
      n = n.parentElement;
    }
    return out;
  }, [x1, yMid]);
  log('ancestor chain: ' + JSON.stringify(chain));
  await page.evaluate(() => {
    window.__evts = [];
    ['mousedown', 'mouseup', 'selectstart', 'dragstart'].forEach((t) => {
      window.addEventListener(t, (e) => window.__evts.push({ t, tag: e.target.tagName, cls: String(e.target.className).slice(0, 50), pd: e.defaultPrevented }), true);
    });
  });
  const mid = async (wl) => { await page.waitForTimeout(wl); return selState(); };
  // rAF sampler: record selection length + last mousemove target at each frame
  await page.evaluate(() => {
    window.__samples = [];
    window.__mm = [];
    window.addEventListener('mousemove', (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      window.__mm.push({ x: e.clientX, y: e.clientY, tag: el ? el.tagName : '?', cls: el ? String(el.className).slice(0, 45) : '?' });
      if (window.__mm.length > 40) window.__mm.shift();
    }, true);
    const tick = () => {
      window.__samples.push(String(window.getSelection()).length);
      if (window.__samples.length > 200) window.__samples.shift();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(x1, yMid);
  await page.mouse.down();
  await page.mouse.move(x2, yMid + 1, { steps: 8 });
  await mid(250).then((s) => log('DURING-DRAG: ' + JSON.stringify(s)));
  const smp = await page.evaluate(() => ({ samples: window.__samples.slice(-25), mm: window.__mm.slice(-8) }));
  log('frames: ' + JSON.stringify(smp));
  await page.mouse.up();
  await mid(300).then((s) => log('AFTER-UP  : ' + JSON.stringify(s)));
  const evts = await page.evaluate(() => window.__evts || []);
  log('events: ' + JSON.stringify(evts));
  // a) anchor check right after mousedown (no moves)
  await page.mouse.move(x1, yMid);
  await page.mouse.down();
  await page.waitForTimeout(200);
  log('anchor after mousedown: ' + JSON.stringify(await page.evaluate(() => {
    const s = window.getSelection();
    return { sel: String(s).slice(0, 40), collapsed: s.isCollapsed, anchorTag: s.anchorNode ? s.anchorNode.nodeName : null, anchorTxt: s.anchorNode && s.anchorNode.nodeType === 3 ? String(s.anchorNode.textContent).slice(0, 30) : null };
  })));
  await page.mouse.up();
  // b) dblclick word selection
  await page.mouse.dblclick(x1, yMid);
  await page.waitForTimeout(200);
  log('DBLCLICK sel: ' + JSON.stringify(await page.evaluate(() => ({ len: String(window.getSelection()).length, t: String(window.getSelection()).slice(0, 40) }))));
  await page.mouse.up();
  // c) Ctrl+A on the page body
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(250);
  log('CTRL+A len: ' + await page.evaluate(() => String(window.getSelection()).length));
  await page.mouse.click(10, 10);
  await page.waitForTimeout(150);
  // control: drag-select a NON-bubble heading ("One agent for everything")
  const ctrl = page.getByText(/One agent for everything/i).first();
  if (await ctrl.count()) {
    const cbox = await ctrl.boundingBox();
    log('ctrl box=' + JSON.stringify(cbox));
    const cx1 = cbox.x + 4, cx2 = Math.min(cbox.x + cbox.width, cx1 + 200), cy = cbox.y + cbox.height / 2;
    await page.mouse.move(cx1, cy);
    await page.mouse.down();
    await page.mouse.move(cx2, cy + 1, { steps: 8 });
    await page.waitForTimeout(250);
    const cs = await page.evaluate(() => ({
      sel: String(window.getSelection()).slice(0, 60),
      len: String(window.getSelection()).length,
    }));
    log('CTRL DURING: ' + JSON.stringify(cs));
    await page.mouse.up();
    await page.waitForTimeout(250);
    log('CTRL AFTER : ' + JSON.stringify(await page.evaluate(() => ({ len: String(window.getSelection()).length }))));
  } else {
    log('ctrl heading NOT FOUND');
  }
  const trace = await page.evaluate(() => window.__trace.slice(-4)).catch(() => []);
  log('mouseup trace: ' + JSON.stringify(trace));
  await page.screenshot({ path: '/tmp/selprobe_after.png' });
} catch (e) {
  log('PROBE ERROR: ' + e.message);
  await dump();
  await page.screenshot({ path: '/tmp/selprobe_err.png', fullPage: true });
} finally {
  await browser.close();
}
