/* ht_agent_ext_smoke.mjs — extension Canvas scrape (mock chrome + fake Canvas DOM)
 * + subagent team round-trip (assignment -> agent/start -> status poll) + 2FA/feedback re-probe.
 * Run from web/:  node scripts/ht_agent_ext_smoke.mjs  (adm pw set first: scripts/create_admin.py)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/tmp/ht_dogfood';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5173';
const ADMIN = 'RoniDev', ADMINPW = process.env.ADMIN_PW || 'ChromiumSmoke9!';
const out = { ext: null, teams: null };

// ---------- PART 1: extension content script against fake Canvas DOM ----------
{
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // stub the chrome.* API the content script calls (extension context not needed for DOM logic)
  await page.addInitScript(() => {
    window.chrome = { runtime: { sendMessage: (m, cb) => cb && cb({ ok: true }), onMessage: { addListener: () => {} } }, storage: { local: { get: async () => ({}) } }, tabs: {} };
    window.__capturedMsg = [];
  });
  await page.goto('about:blank');
  await page.evaluate(() => {
    // minimal fake Canvas page DOM
    document.body.innerHTML = `
      <div id="context" role="main">
        <span data-api="courses/1/assignments"></span>
        <div class="assignment">
          <a href="/courses/1/assignments/123">Essay: Gatsby and the American Dream</a>
          <div aria-label="Due: Feb 12 at 11:59pm"></div>
          <span>Points 20</span>
          <strong>Rubric</strong><div class="rubric"><div>Thesis clarity</div></div>
          <iframe src="about:blank" class="doc"></iframe>
        </div>
        <div class="assignment"><a href="/courses/2/assignments/9">Math HW ch 4</a><div aria-label="Due: Feb 14 at 11:59pm"></div></div>
      </div>`;
  });
  await page.addScriptTag({ path: '/home/roni/Roni_Workspace/helpotron/extension/content.js' });
  await page.waitForTimeout(600);
  const res = await page.evaluate(() => {
    const r = window.__helpotron_scrape_universal ? window.__helpotron_scrape_universal() : { error: 'scrape fn missing' };
    return { keys: Object.keys(r), out: r };
  });
  out.ext = { scrapeFn: typeof res.keys, detail: res.out, snippet: JSON.stringify(res.out).slice(0, 400) };
  await browser.close();
}

// ---------- PART 2: subagent teams round-trip + 2FA/feedback re-probe ----------
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const notes = [];
  page.on('response', (r) => { if (r.status() >= 500) notes.push(`5xx ${r.request().method()} ${new URL(r.url()).pathname}`); });

  const login = async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.getByText('Accept', { exact: true }).click({ timeout: 1000 }).catch(() => {});
    const inTab = page.getByText('Sign In', { exact: false }).first();
    if (await inTab.count()) await inTab.click();
    await page.waitForTimeout(400);
    await page.locator('input[autocomplete="username"], input[placeholder*="username" i]').first().fill(ADMIN);
    await page.locator('input[type="password"]').first().fill(ADMINPW);
    await page.getByRole('button', { name: /sign in|log in|login/i }).first().click();
    await page.waitForTimeout(1800);
  };
  await login();

  // create an assignment via API (in-page authenticated fetch)
  let assignment = null;
  try {
    assignment = await page.evaluate(async () => {
      const r = await fetch('/api/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '' }, credentials: 'include', body: JSON.stringify({ public_id: 'RoniDev', title: 'Smoke Team Assignment', content: 'Analyze the role of symbolism in "The Great Gatsby". Produce a thesis, outline, and 3 body paragraphs. Include a rubric with clarity and evidence criteria.', due: '2026-09-01' }) });
      return { status: r.status, body: await r.text().catch(() => '') };
    });
  } catch (e) { assignment = { error: String(e) }; }
  notes.push('assignments POST: ' + JSON.stringify(assignment).slice(0, 260));

  // drive the agent team: find UI entry (Run/Agent/Teams/Pipeline buttons)
  let ui = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, a')].map(x => (x.textContent || '').trim()).filter(t => /run|team|agent|pipeline|generate|analy/i.test(t) && t.length < 24);
    return [...new Set(b)].slice(0, 12);
  });
  notes.push('candidate agent buttons: ' + JSON.stringify(ui));
  // also try POST /api/agent/start directly with fetched assignment id if parseable
  const aid = (assignment && assignment.body || '').match(/(?:assignment_)?id"\s*:\s*"?(\d+)"?/i)?.[1] || null;
  if (aid) {
    const start = await page.evaluate(async (id) => {
      const r = await fetch('/api/agent/start', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '' }, credentials: 'include', body: JSON.stringify({ public_id: 'RoniDev', assignment_id: Number(id) }) });
      return { status: r.status, body: (await r.text()).slice(0, 600) };
    }, aid);
    notes.push('agent/start: ' + JSON.stringify(start));
    const session = (start.body || '').match(/"session_id"\s*:\s*"?([a-z0-9]+)"?/i)?.[1];
    if (session) {
      for (let i = 0; i < 5; i++) {
        await page.waitForTimeout(4000);
        const st = await page.evaluate(async (s) => {
          const r = await fetch('/api/agent/' + s, { credentials: 'include' });
          return { status: r.status, body: (await r.text()).slice(0, 500) };
        }, session);
        notes.push('agent poll ' + i + ': ' + JSON.stringify(st));
        if (/(done|completed|finished|idle)/i.test(st.body)) break;
      }
    }
  }

  // re-probe 2FA settings panel + feedback with explicit path
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByText('Settings', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  const twoFaPresent = await page.getByText(/Two-Factor Authentication|Enable 2FA Protection/i).count();
  const clickable = await page.getByText(/Privacy & Security|Privacy and Security/i).count();
  await page.screenshot({ path: OUT + '/10_settings.png' }).catch(() => {});
  const fb = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button,a,[class*=feedback]')].map(x => (x.textContent || '').trim()).filter(t => /feedback|data lake/i.test(t) && t.length < 30);
    return [...new Set(els)];
  });
  notes.push(`2FA strings visible=${twoFaPresent} privacyLabel=${clickable} feedbackEntries=${JSON.stringify(fb)}`);
  out.teams = { notes };

  await browser.close();
}

console.log(JSON.stringify(out, null, 1));
