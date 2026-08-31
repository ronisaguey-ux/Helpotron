/* ────────────────────────────────────────────────────────────────────────────
 * qa_sweep.cjs — full authenticated walk of the helpotron SPA with measured
 * layout evidence.
 *
 * Beyond the earlier "does it render" pass this now records, per view:
 *   · console / pageerror / requestfailed
 *   · text-node collisions (overlapping rects of leaf text elements)
 *   · horizontal overflow (scrollWidth > clientWidth) and off-viewport nodes
 *   · CSS custom properties referenced by rendered nodes that resolve to ""
 *
 * Run: node qa_sweep.cjs [baseURL] [user] [pass] [outDir]
 * ────────────────────────────────────────────────────────────────────────── */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const USER = process.argv[3] || 'qa_sweep_081';
const PASS = process.argv[4] || 'QaPass123!';
const OUT = process.argv[5] || '/tmp/worker_qa/sweep';
fs.mkdirSync(OUT, { recursive: true });

/* view, tab, human label for the tab button (tabs are labelled prose, not slugs) */
const VIEWS = [
  ['overview', null, null],
  ['activity', null, null],
  ['agent', null, null],
  ['ai-workspace', null, null],
  ['history', null, null],
  ['library', null, null],
  ['dump', null, null],
  ['datalake', null, null],
  ['inbox', null, null],
  ['automation', null, null],
  ['extension', null, null],
  ['insights', 'overview', 'Overview'],
  ['insights', 'progress', 'Academic Progress'],
  ['insights', 'recommendations', 'Recommendations'],
  ['credits', 'plans', 'Plans & Top-ups'],
  ['credits', 'earn', 'Earn Credits'],
  ['settings', null, null],
  ['monitors', null, null],
  ['privacy', null, null],
  ['terms', null, null],
];

/* ── in-page probe: geometry + token diagnostics ─────────────────────────── */
function probe() {
  const vw = window.innerWidth;
  const isVisible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  /* leaf text nodes only — parents legitimately contain their children */
  const leaves = [...document.querySelectorAll('body *')].filter((el) => {
    if (!isVisible(el)) return false;
    if (/^(SCRIPT|STYLE|SVG|PATH|BR|IMG|INPUT)$/.test(el.tagName)) return false;
    const t = (el.textContent || '').trim();
    if (!t || t.length > 160) return false;
    return ![...el.children].some((c) => (c.textContent || '').trim() === t);
  });

  const label = (el) => `${el.tagName.toLowerCase()}"${(el.textContent || '').trim().slice(0, 44)}"`;

  /* collisions: two text leaves whose rects intersect by >25% of the smaller */
  const collisions = [];
  for (let i = 0; i < leaves.length; i++) {
    const a = leaves[i].getBoundingClientRect();
    for (let j = i + 1; j < leaves.length; j++) {
      const b = leaves[j].getBoundingClientRect();
      if (leaves[i].contains(leaves[j]) || leaves[j].contains(leaves[i])) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox <= 1 || oy <= 1) continue;
      const inter = ox * oy;
      const smaller = Math.min(a.width * a.height, b.width * b.height);
      if (smaller > 0 && inter / smaller > 0.25) {
        collisions.push({
          a: label(leaves[i]), b: label(leaves[j]),
          overlap: +(inter / smaller).toFixed(2),
          at: { x: Math.round(Math.max(a.left, b.left)), y: Math.round(Math.max(a.top, b.top)) },
        });
      }
    }
  }

  /* Horizontal overflow. Three patterns in this app overflow BY DESIGN and
   * drowned the real findings 3:1 in the 08-31 baseline, so they are excluded
   * (each verified by hand first — see the notes):
   *   · `sr-only` skip link — clipped to 1px until focused, where it renders
   *     at its full 198x44 (confirmed by tabbing to it).
   *   · a clipping ancestor (`overflow: hidden`, e.g. Tailwind `truncate`) —
   *     the content is deliberately cut and an ellipsis is shown.
   *   · a child pulled past the padding edge by a negative margin or a negative
   *     inset, e.g. the SectionCard chevron's `-mr-1.5` optical alignment, or
   *     the absolutely-positioned `-inset-1` gradient halo behind the logo and
   *     the nav buttons — a decorative bleed that is supposed to sit outside
   *     the element it glows around.
   * Everything else is reported. */
  const OVERHANG = /(^|\s)-(m[rltbxy]?|inset(-[xy])?|top|right|bottom|left)-/;
  const overflow = [...document.querySelectorAll('body *')]
    .filter((el) => isVisible(el) && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0)
    .filter((el) => !/auto|scroll|hidden|clip/.test(getComputedStyle(el).overflowX))
    .filter((el) => !el.matches('.sr-only'))
    .filter((el) => {
      /* the bleed may be the element itself (SectionCard chevron carries the
       * negative margin) or any descendant (the logo halo is a grandchild),
       * and it propagates scrollWidth up every ancestor in between. */
      const cls = (n) => String(n.className?.baseVal ?? n.className ?? '');
      if (OVERHANG.test(cls(el))) return false;
      return ![...el.querySelectorAll('*')].some((c) => OVERHANG.test(cls(c)));
    })
    .slice(0, 12)
    .map((el) => ({ el: label(el), scrollW: el.scrollWidth, clientW: el.clientWidth }));

  const offscreen = leaves
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.right > vw + 2 || r.left < -2)
    .slice(0, 12)
    .map(({ el, r }) => ({ el: label(el), right: Math.round(r.right), vw }));

  /* custom properties referenced in class/style that resolve to "" */
  const wanted = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const src = `${el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || ''} ${el.getAttribute('style') || ''}`;
    for (const m of String(src).matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) wanted.add(m[1]);
  }
  const rootCS = getComputedStyle(document.documentElement);
  const bodyCS = getComputedStyle(document.body);
  const unresolved = [...wanted].filter(
    (v) => !rootCS.getPropertyValue(v).trim() && !bodyCS.getPropertyValue(v).trim(),
  );

  /* fully transparent panels that are meant to be opaque surfaces */
  /* Panels that name a background token but paint nothing — the `--bg-canvas`
   * class of bug. `focus:`-prefixed backgrounds (skip link) only paint when
   * focused, so they are not ghosts. */
  const ghostPanels = [...document.querySelectorAll('[class*="bg-[var("]')]
    .filter(isVisible)
    .filter((el) => !/(^|\s)(focus|hover|active|group-hover)[:-]/.test(String(el.className || '')))
    .filter((el) => getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)')
    .slice(0, 10)
    .map((el) => ({ el: label(el), cls: String(el.className).slice(0, 90) }));

  return {
    h2: document.querySelector('h1,h2,h3')?.textContent?.slice(0, 90) || null,
    textLen: document.body.innerText.length,
    collisions: collisions.slice(0, 12),
    overflow,
    offscreen,
    unresolvedVars: unresolved,
    ghostPanels,
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const report = [];
  let current = 'boot';
  const errors = { console: [], page: [], requests: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') errors.console.push({ view: current, text: m.text().slice(0, 300) });
  });
  page.on('pageerror', (e) => errors.page.push({ view: current, text: String(e).slice(0, 300) }));
  page.on('requestfailed', (r) =>
    errors.requests.push({ view: current, url: r.url().slice(0, 200), err: r.failure()?.errorText }));

  // ── login ──
  current = 'login';
  await page.goto(`${BASE}/?signin=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  /* Records which tab the modal actually lands on for a sign-in intent. */
  const landedOn = await page.evaluate(() =>
    document.querySelector('[role="dialog"] h2')?.textContent?.trim() || null);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click().catch(() => {});
  await page.waitForTimeout(300);
  await page.fill('#login-username', USER);
  await page.fill('#login-password', PASS);
  await page.getByRole('button', { name: /Sign in to Workspace/i }).click();
  await page.waitForTimeout(2600);

  // legal gate — checkbox arrives unticked for API-created accounts
  const box = page.locator('input[type="checkbox"]').first();
  if (await box.isVisible().catch(() => false)) {
    await box.check().catch(() => {});
    await page.getByRole('button', { name: /Accept & Continue/i }).click().catch(() => {});
  }
  await page.waitForTimeout(1200);
  // decline non-essential cookies so the banner stops covering the fold
  await page.getByRole('button', { name: /^Reject$/i }).click().catch(() => {});
  await page.waitForTimeout(400);

  const authed = await page.evaluate(() => !!document.querySelector('.nav-item'));
  report.push({ view: 'login', signinIntentLandedOn: landedOn, authed });

  // ── every view ──
  for (const [view, tab, tabLabel] of VIEWS) {
    current = `${view}${tab ? ':' + tab : ''}`;
    await page.evaluate(([v, t]) => window.__helpotron_nav && window.__helpotron_nav(v, t || undefined),
      [view, tab]);
    await page.waitForTimeout(900);
    if (tabLabel) {
      await page.getByRole('tab', { name: tabLabel }).click().catch(async () => {
        await page.getByRole('button', { name: tabLabel }).first().click().catch(() => {});
      });
      await page.waitForTimeout(700);
    }
    await page.waitForTimeout(500);
    const info = await page.evaluate(probe);
    await page.screenshot({ path: `${OUT}/${current.replace(':', '-')}.png` });
    report.push({ view: current, ...info });
  }

  const out = { base: BASE, when: new Date().toISOString(), report, errors };
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(out, null, 1));

  // ── console summary ──
  const bad = report.filter((r) => (r.collisions?.length || r.overflow?.length
    || r.offscreen?.length || r.unresolvedVars?.length || r.ghostPanels?.length));
  console.log(`\n=== ${BASE} — ${report.length - 1} views ===`);
  console.log(`errors: console=${errors.console.length} page=${errors.page.length} requests=${errors.requests.length}`);
  for (const r of bad) {
    console.log(`\n## ${r.view}`);
    if (r.collisions?.length) console.log(`  COLLISION x${r.collisions.length}: ` +
      r.collisions.map((c) => `${c.a} ↔ ${c.b} (${c.overlap})`).join(' | ').slice(0, 400));
    if (r.overflow?.length) console.log(`  OVERFLOW: ` + r.overflow.map((o) => `${o.el} ${o.scrollW}>${o.clientW}`).join(' | ').slice(0, 300));
    if (r.offscreen?.length) console.log(`  OFFSCREEN: ` + r.offscreen.map((o) => `${o.el} right=${o.right}`).join(' | ').slice(0, 300));
    if (r.unresolvedVars?.length) console.log(`  UNRESOLVED VARS: ${r.unresolvedVars.join(', ')}`);
    if (r.ghostPanels?.length) console.log(`  TRANSPARENT PANELS: ` + r.ghostPanels.map((g) => g.el).join(' | ').slice(0, 300));
  }
  for (const e of errors.console.slice(0, 15)) console.log(`  [console:${e.view}] ${e.text}`);
  for (const e of errors.page.slice(0, 15)) console.log(`  [pageerror:${e.view}] ${e.text}`);
  for (const e of errors.requests.slice(0, 15)) console.log(`  [reqfail:${e.view}] ${e.url} ${e.err}`);
  console.log(`\nreport → ${OUT}/report.json`);
  await browser.close();
})().catch((e) => { console.error('SWEEP FAILED:', e); process.exit(1); });
