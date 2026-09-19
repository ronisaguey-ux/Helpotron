/**
 * Verify the Dashboard is subject bubbles + working dump-into-subject.
 *
 * Owner's spec (2026-09-19):
 *   "Dashboard = only subject bubbles as medium cards (subject name,
 *    assignments present, assignments active) + dump text/file into a subject
 *    for subagent delegation; remove completed-assignments history at the
 *    bottom."
 *
 * Asserts the SHAPE (bubble grid, counts on each card) and then drives the real
 * dump path — text into a subject, then reads it back out through the same
 * endpoint an agent uses (`/api/dump/list?subject=`), because a dump that the
 * agent cannot see is not delegation, it is a write to nowhere.
 *
 *   NODE_PATH=<repo>/web/node_modules node scripts/repro_dashboard_subjects.js
 *
 * The password is read from mcp/.env at runtime and never printed.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
// :5000 serves the same bundle AND the API, so the read-back fetch below is
// same-origin. From :5173 it is cross-origin and dies with "Failed to fetch".
const BASE = process.env.HT_BASE || 'http://127.0.0.1:5000';
const API = process.env.HT_API || '';   // '' = same origin as BASE
const SUBJECT = 'Biology';

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

  const context = await chromium.launchPersistentContext('/tmp/opencode/dashsubj-' + Date.now(), {
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

  // ── shape ─────────────────────────────────────────────────────────────────
  const cards = await page.evaluate(() => {
    // A subject card is the nearest ancestor that carries the counts line. The
    // `aria-label^="Open "` selector alone also matches the mobile "Open
    // navigation menu" toggle, so the counts are what identify a real card.
    const out = [];
    document.querySelectorAll('button[aria-label^="Open "]').forEach((b) => {
      let el = b.parentElement;
      for (let i = 0; i < 6 && el; i += 1) {
        if (/assignments? present/.test(el.textContent || '')) break;
        el = el.parentElement;
      }
      const text = (el && el.textContent) || '';
      if (!/assignments? present/.test(text)) return;
      out.push({
        title: (b.getAttribute('aria-label') || '').replace(/^Open /, ''),
        hasPresent: /assignments? present/.test(text),
        hasActive: /\d+ active/.test(text),
      });
    });
    return out;
  });
  record('subject bubbles render as cards', cards.length >= 3, `${cards.length} bubbles`);
  record('each card shows "N assignments present"',
    cards.length > 0 && cards.every((c) => c.hasPresent),
    cards.map((c) => `${c.title}:${c.hasPresent ? 'yes' : 'NO'}`).join(', '));
  record('each card shows "N active"',
    cards.length > 0 && cards.every((c) => c.hasActive),
    cards.map((c) => `${c.title}:${c.hasActive ? 'yes' : 'NO'}`).join(', '));

  const biology = cards.find((c) => /biology/i.test(c.title));
  record('a Biology subject exists to dump into', !!biology, biology ? biology.title : 'not found');

  // completed-assignments history must be off this page
  const bodyText = await page.evaluate(() => document.body.innerText);
  record('completed-history panel removed from Dashboard',
    !/Submission Ledger/i.test(bodyText),
    /Submission Ledger/i.test(bodyText) ? 'still present' : 'absent');

  // ── the dump path ─────────────────────────────────────────────────────────
  const dumpBtn = page.locator('button[title^="Dump text or a file into"]').first();
  record('a per-subject Dump action exists', (await dumpBtn.count()) > 0,
    `${await dumpBtn.count()} dump buttons`);
  if (await dumpBtn.count()) {
    await dumpBtn.first().click();
    await page.waitForTimeout(1200);
    const modalOpen = await page.locator('#subjectDumpText').count();
    record('dump modal opens', modalOpen > 0, modalOpen ? 'textarea present' : 'no textarea');

    if (modalOpen) {
      const heading = await page.locator('h3:has-text("Dump into")').first().textContent().catch(() => '');
      record('modal names the subject', /Dump into/.test(heading || ''), heading || '(none)');
      // Read back the subject the modal names — the dump button is per-card, and
      // hardcoding one here would read the wrong subject and look like a failure.
      const dumpSubject = (heading || '').replace(/^\s*Dump into\s*/i, '').trim();

      const marker = `probe-${Date.now()}`;
      await page.fill('#subjectDumpText', `Teacher says the lab report needs glycolysis. ${marker}`);
      await page.locator('button:has-text("Dump it")').first().click();
      await page.waitForTimeout(5000);

      const notice = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('div')).find(
          (d) => /Dumped/.test(d.textContent || '') && d.className.includes('primary'));
        return el ? el.textContent.trim() : '';
      });
      record('dump succeeds in the UI', /Dumped/.test(notice), notice || 'no success notice');

      // Read it back the way an agent would.
      const seen = await page.evaluate(async ([api, subject]) => {
        const r = await fetch(`${api}/api/dump/list?subject=${encodeURIComponent(subject)}&limit=20`, {
          credentials: 'include',
          headers: { 'X-Public-ID': 'RoniDev' },
        });
        if (!r.ok) return { ok: false, status: r.status };
        const j = await r.json();
        return { ok: true, items: (j.items || []).map((i) => i.extracted_text || '') };
      }, [API, dumpSubject]);
      record('dump is readable under that subject (agent path)',
        seen.ok && (seen.items || []).some((t) => t.includes(marker)),
        seen.ok ? `${(seen.items || []).length} dumps read back` : `HTTP ${seen.status}`);
    }
  }

  record('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean');

  const failed = checks.filter((c) => !c.pass).length;
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  await context.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('HARNESS ERROR', e && e.message); process.exit(1); });
