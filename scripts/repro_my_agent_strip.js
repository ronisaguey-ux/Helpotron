/**
 * Verify the My Agent strip-down.
 *
 * Owner's spec (2026-09-19):
 *   "My Agent = strip to chat + upload + history rail with date/time + 3-dot
 *    menu per chat (delete/rename/pin) + basic 1-10 effort + 3 modes
 *    (manual/auto/yolo); Educational Mode moves into Config; remove all default
 *    skills/identities — blank slate."
 *
 * Checks the SHAPE in the DOM and then drives the 3-dot menu for real — a menu
 * that renders but does nothing is the exact failure this class of change ships.
 *
 *   NODE_PATH=<repo>/web/node_modules node scripts/repro_my_agent_strip.js
 *
 * The password is read from mcp/.env at runtime and never printed.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const BASE = process.env.HT_BASE || 'http://127.0.0.1:5000';

function adminPassword() {
  for (const rel of ['mcp/.env', '.env']) {
    const p = path.join(REPO, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      if (line.startsWith('HELPOTRON_ADMIN_PASSWORD=')) {
        return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  return '';
}

(async () => {
  const checks = [];
  const record = (name, pass, detail) => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  const pw = adminPassword();
  if (!pw) { console.log('No operator password found — cannot run.'); process.exit(3); }

  const context = await chromium.launchPersistentContext('/tmp/opencode/myagent-' + Date.now(), {
    headless: false,
    channel: 'chromium',
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('helpotron_terms_accepted_v2', 'true');
      localStorage.setItem('helpotron_signup_consent', '1');
    } catch (e) { /* storage unavailable */ }
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.locator('button:has-text("Sign in")').first().click();
  await page.waitForTimeout(1500);
  if (!(await page.locator('#login-public-id').count())) {
    console.log('Login form did not open — aborting.');
    await context.close(); process.exit(2);
  }
  await page.fill('#login-public-id', 'RoniDev');
  await page.fill('#login-passphrase', pw);
  await page.locator('#login-passphrase').press('Enter');
  await page.waitForTimeout(6000);

  const accept = page.locator('button:has-text("Accept & Continue")');
  if (await accept.count()) {
    const box = page.locator('#protocol-consent');
    if (await box.count()) await box.check().catch(() => {});
    await accept.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  await page.locator('button:has-text("My Agent")').first().click().catch(() => {});
  await page.waitForTimeout(3500);

  // ── header: educational moved out ────────────────────────────────────────
  const headerEdu = await page.locator('header button#educationalToggle').count();
  record('Educational Mode is no longer in the chat header', headerEdu === 0,
    headerEdu ? 'still in the header' : 'absent from header');

  // ── effort: a plain 1-10 ─────────────────────────────────────────────────
  const slider = page.locator('#session-effort-slider');
  const sliderCount = await slider.count();
  const sliderRange = sliderCount
    ? await slider.first().evaluate((el) => `${el.min}-${el.max}`)
    : '';
  record('effort is a 1-10 control',
    sliderCount > 0 && sliderRange === '1-10',
    sliderCount ? `range ${sliderRange}` : 'slider not found');

  // The left navigation is ALSO an <aside>, so `querySelector('aside')` returns
  // the nav and the rail's real content never gets read. `placeholder` is an
  // attribute and does not appear in textContent, so identify the rail by the
  // per-chat menus only it contains.
  const railText = await page.evaluate(() => {
    const rail = Array.from(document.querySelectorAll('aside'))
      .find((a) => a.querySelector('button[data-thread-menu]'));
    return rail ? rail.innerText : '';
  });
  record('effort readout no longer claims invented token counts',
    !/tokens?\/turn/i.test(railText),
    /tokens?\/turn/i.test(railText) ? 'still showing ~N tokens/turn' : 'no fabricated figures');

  // ── history rail: date/time + 3-dot menu ─────────────────────────────────
  const hasDateTime = /\d{1,2}:\d{2}|just now|min ago|hr|ago|202\d/.test(railText);
  record('history rail shows a date/time per chat', hasDateTime,
    hasDateTime ? 'timestamp text present' : `rail text: ${railText.slice(0, 120)}`);

  const menuButtons = await page.locator('button[data-thread-menu]').count();
  record('every chat has a 3-dot menu', menuButtons > 0, `${menuButtons} menus`);

  if (menuButtons > 0) {
    await page.locator('button[data-thread-menu]').first().click();
    await page.waitForTimeout(600);
    const items = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="menuitem"]'))
        .map((b) => (b.textContent || '').trim()));
    // The third item is a TOGGLE, so it reads "Pin" or "Unpin" depending on the
    // thread's current state — asserting the literal "Pin" fails on a pinned
    // thread while the menu is behaving correctly.
    const hasToggle = items.some((i) => /^\s*(Un)?pin\s*$/i.test(i));
    record('menu offers rename / pin / delete',
      items.some((i) => /Rename/i.test(i)) && hasToggle && items.some((i) => /Delete/i.test(i)),
      items.join(' | ') || 'no items');

    // The menu was left open by the check above, and clicking the same 3-dot
    // button again TOGGLES IT CLOSED — the next click then waits forever for a
    // menu item that is not on screen. Close it first.
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);
    await page.waitForTimeout(500);

    // ── pin must PERSIST, not just re-render ────────────────────────────────
    // "delete old config didnt last" was the owner's last bug in this panel, so
    // a pin is only done when it survives a reload.
    const pinnedBefore = await page.evaluate(async () => {
      const r = await fetch('/api/agent/threads', { credentials: 'include', headers: { 'X-Public-ID': 'RoniDev' } });
      const j = await r.json();
      const list = j.threads || [];
      return list.length ? { id: list[0].id, pinned: !!list[0].pinned, title: list[0].title } : null;
    });

    if (pinnedBefore) {
      const wasPinned = pinnedBefore.pinned;
      // Click Pin (or Unpin) on the first menu.
      await page.locator('button[data-thread-menu]').first().click();
      await page.waitForTimeout(500);
      const pinItem = page.locator('[role="menuitem"]:has-text("Pin"), [role="menuitem"]:has-text("Unpin")').first();
      await pinItem.click();
      await page.waitForTimeout(1500);

      const after = await page.evaluate(async (id) => {
        const r = await fetch('/api/agent/threads', { credentials: 'include', headers: { 'X-Public-ID': 'RoniDev' } });
        const j = await r.json();
        const t = (j.threads || []).find((x) => x.id === id);
        return t ? !!t.pinned : null;
      }, pinnedBefore.id);
      record('pin persists to the server', after === !wasPinned,
        `${wasPinned ? 'pinned' : 'unpinned'} -> ${after === null ? 'not found' : (after ? 'pinned' : 'unpinned')}`);

      // …and survives a reload.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(6000);
      const afterReload = await page.evaluate(async (id) => {
        const r = await fetch('/api/agent/threads', { credentials: 'include', headers: { 'X-Public-ID': 'RoniDev' } });
        const j = await r.json();
        const t = (j.threads || []).find((x) => x.id === id);
        return t ? !!t.pinned : null;
      }, pinnedBefore.id);
      record('pin survives a reload', afterReload === !wasPinned,
        `${afterReload === null ? 'not found' : (afterReload ? 'still pinned' : 'unpinned')}`);

      // Restore the operator's original state — this harness must not leave a
      // pin behind on the owner's account.
      //
      // The CSRF token is REQUIRED here and is read from the COOKIE, which is the
      // authority (the localStorage copy goes stale after login and every PATCH
      // carrying it bounces 403). A bare fetch without it silently leaves the pin
      // in place — which is exactly what happened the first time this ran.
      const restored = await page.evaluate(async ([id, want]) => {
        const token = (document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/) || [])[1] || '';
        const r = await fetch(`/api/agent/threads/${id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Public-ID': 'RoniDev',
            ...(token ? { 'X-CSRF-Token': decodeURIComponent(token) } : {}),
          },
          body: JSON.stringify({ pinned: want }),
        });
        return r.status;
      }, [pinnedBefore.id, wasPinned]);
      record('harness restored the original pin state', restored === 200,
        `PATCH -> ${restored}`);
    }
  }

  // ── configs: educational + blank slate ───────────────────────────────────
  // A reload lands on the DEFAULT view, so My Agent has to be re-entered before
  // its Configs toggle exists. Without this the toggle reads "not found" and
  // looks like a product bug (the same trap as the agent-config-delete harness).
  await page.locator('button:has-text("My Agent")').first().click().catch(() => {});
  await page.waitForTimeout(3000);

  const cfgBtn = page.locator('button[title="Open Agent Configurations Matrix"]');
  if (await cfgBtn.count()) {
    await cfgBtn.first().click();
    await page.waitForTimeout(1500);

    const behaviourTab = page.locator('button:has-text("Behaviour")');
    record('a Behaviour tab exists in Configs', (await behaviourTab.count()) > 0,
      `${await behaviourTab.count()} tab(s)`);

    if (await behaviourTab.count()) {
      await behaviourTab.first().click();
      await page.waitForTimeout(800);
      const behaviour = await page.evaluate(() =>
        Array.from(document.querySelectorAll('div,button'))
          .map((e) => (e.textContent || '').trim())
          .filter((t) => /Educational mode/i.test(t))
          .slice(0, 1)[0] || '');
      record('Educational Mode lives in Config → Behaviour', /Educational mode/i.test(behaviour),
        behaviour.slice(0, 90) || 'not found');
    }

    const idsTab = page.locator('button:has-text("Identities")');
    if (await idsTab.count()) {
      await idsTab.first().click();
      await page.waitForTimeout(800);
      const body = await page.evaluate(() => {
        const el = document.querySelectorAll('div');
        return Array.from(el).map((e) => e.textContent || '').join(' ');
      });
      // The 5 canned personas must not be rendered any more.
      const canned = ['The Scholar', 'The Editor', 'The Coach', 'Academic Co-Pilot'];
      const present = canned.filter((n) => body.includes(n));
      record('no canned default identities', present.length === 0,
        present.length ? `still present: ${present.join(', ')}` : 'blank slate');
    }

    const skillsTab = page.locator('button:has-text("Skills")');
    if (await skillsTab.count()) {
      await skillsTab.first().click();
      await page.waitForTimeout(800);
      const body = await page.evaluate(() => document.body.innerText);
      const cannedSkills = ['Sandbox Math Verification', 'LaTeX Derivations', 'Humanizer Cadence',
        'Socratic Inquiry', 'Citation Verifier', 'Code Synthesis'];
      const present = cannedSkills.filter((n) => body.includes(n));
      record('no canned default skills', present.length === 0,
        present.length ? `still present: ${present.join(', ')}` : 'blank slate');
    }
  } else {
    record('Configs panel opens', false, 'toggle not found');
  }

  record('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean');

  const failed = checks.filter((c) => !c.pass).length;
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  await context.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('HARNESS ERROR', e && e.message); process.exit(1); });
