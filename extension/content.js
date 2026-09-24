// Helpotron Universal Content Script
// Supports Canvas, Google Classroom, Blackboard, Brightspace, Moodle, Schoology, Google Docs, Notion, and arbitrary websites.

// ── Scrape content retention (08-28 fix: full content, never silently cut) ──
// The old scrapers sliced prompts to 30k/25k/20k characters — beyond that the
// assignment text was dropped from the stored dump with no marker. Real LMS
// pages (pacing guides, packets, rubric+prompt pages) routinely exceed 30k
// chars. The byte storage (assignments.prompt TEXT, dump extracted_text Text)
// has no such limit, so the scrape-side slices were the ONLY truncation.
// Guard is now a generous hard ceiling (pathological multi-MB pages only) and
// any cut is EXPLICITLY marked so the stored content never silently loses tail.
var SCRAPE_TEXT_CAP = 1_000_000; // chars — storage is TEXT; this only bounds megabyte pages

function capScrapeText(s) {
  const t = (s || '').trim();
  if (t.length <= SCRAPE_TEXT_CAP) return t;
  return t.slice(0, SCRAPE_TEXT_CAP) +
    '\n\n[…extension scrape truncated at ' + SCRAPE_TEXT_CAP +
    ' chars — the full page was larger than the scrape guard. Re-scrape only ' +
    'the missing sections, or use the file links below.]';
}

// ── Crawl4AI-style DOM-to-Clean-Markdown Engine ──────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// Server-owned page identity + conversion (owner 2026-09-18)
//
// This file used to carry the real implementations of the four functions below.
// They are now answered by `POST /api/extension/enrich`:
//
//   detectPlatform()        -> server `platform`
//   classifySubject()       -> server `subject`
//   parseCourseUrl()        -> server `course`
//   htmlToCleanMarkdown()   -> server `markdown` / converted fields
//
// The extension's remaining job here is to READ THE DOM, which it must do (it is
// the browser). Every decision about what that DOM MEANS — which LMS it is, what
// subject it belongs to, which course an item is filed under, what boilerplate to
// strip and how to render it — lives on the server, so it can be corrected by a
// deploy instead of a Chrome Web Store review, and a modified client cannot
// loosen it.
//
// `htmlToCleanMarkdown` is kept as a NAME so the scrapers below do not change
// shape, but it no longer converts anything: it returns the element's raw
// `innerHTML`, which `enrichWithServer()` sends for conversion. Returning markup
// instead of Markdown is the whole trick — the conversion policy is gone from
// this file.
// ═══════════════════════════════════════════════════════════════════════════

function htmlToCleanMarkdown(root) {
  if (!root) return '';
  // Raw markup only. The server decides what is boilerplate and how it renders.
  if (typeof root === 'string') return root;
  try {
    return root.innerHTML || root.textContent || '';
  } catch (e) {
    return '';
  }
}

// The extension must not guess these any more; it asks.
//
// NOTE: a content script is an isolated world — `background.js` functions like
// `getServer()` are NOT in scope here. Both values are read from
// `chrome.storage.local`, which IS shared, exactly as the rest of this file does.
async function serverPageInfo(body) {
  const { server, api_key } = await chrome.storage.local.get(['server', 'api_key']);
  const srv = (server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
  if (!api_key) return null;
  try {
    const res = await fetch(`${srv}/api/extension/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api_key}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function getCourseName() {
  const els = document.querySelectorAll(
    '#crumb_title a, .context-name, #breadcrumbs a:last-of-type, a[data-course-id] span'
  );
  for (const el of els) {
    const t = (el.innerText || '').trim();
    if (t && t.length > 1 && t.toLowerCase() !== 'dashboard') return t;
  }
  const parts = (document.title || '').split(/[:\-–]/);
  return (parts.length > 1 ? parts[0] : document.title || '').trim().slice(0, 120);
}

  function scrapeCourseContext() {
    // Identity is server-owned. `primeServerIdentity()` fills this in before any
    // scrape runs; before that it is empty rather than guessed, so a scrape that
    // somehow raced the identity request files nothing under a wrong course
    // instead of filing it under an invented one.
    const id = __serverIdentity || {};
    const course = id.course || {};
    const subject = id.subject || '';
    let courseCode = subject ? subject.split(' ')[0].slice(0, 4).toUpperCase() + '-101' : '';
    return {
      platformOrigin: id.platform || 'generic',
      courseId: course.courseId || '',
      itemId: course.itemId || '',
      itemKind: course.itemKind || '',
      courseUrl: course.courseUrl || '',
      courseName: id.name || '',
      subject,
      courseCode,
    };
  }

// Link discovery for the full-course crawl: same course, content pages only.
// Never follows navigation chrome (people, grades, settings) or foreign hosts.
function collectCourseLinks() {
  const ctx = scrapeCourseContext();
  if (!ctx.courseId) return { ok: false, error: 'Not a Canvas course page — open an assignment/module/page inside the course first.', courseId: '', courseUrl: '', links: [] };
  const prefix = new RegExp('^/courses/' + ctx.courseId + '/');
  // Content pages only (kind + real item id/slug); bare index URLs are not
  // scraped as content.
  const allowed = /^\/(assignments|quizzes|pages|discussion_topics|modules(\/items)?|files|content|external_tools|rubrics)\/[^/?#]/;
  // Paginated index listings (e.g. /assignments?page=2) are queued AS INDEX
  // pages for discovery, never scraped as content.
  const listedKinds = /^\/(assignments|modules|pages|quizzes|discussion_topics)$/;
  const seen = new Set();
  const out = [];
  const indexOut = [];
  const indexSeen = new Set();
  document.querySelectorAll('a[href]').forEach((a) => {
    let href = a.href || '';
    if (!href) return;
    try {
      const u = new URL(href, window.location.origin);
      if (u.origin !== window.location.origin) return;
      const p = u.pathname;
      if (!prefix.test(p) || p.includes('/users/') || p.includes('/grades')) return;
      if (allowed.test(p.replace(prefix, '/'))) {
        u.hash = '';
        u.search = '';
        const canon = u.href;
        if (!seen.has(canon)) { seen.add(canon); out.push(canon); }
        return;
      }
      const kindMatch = listedKinds.exec(p.replace(prefix, '/'));
      if (kindMatch) {
        const page = parseInt(u.searchParams.get('page') || '1', 10);
        // Only the first few result pages exist; pages 2-4 cover virtually all
        // Canvas listings and keep the crawl bounded.
        if (page >= 2 && page <= 4) {
          u.hash = '';
          const canon = u.href;
          if (!indexSeen.has(canon)) { indexSeen.add(canon); indexOut.push(canon); }
        }
      }
    } catch { /* skip malformed */ }
  });
  return { ok: true, courseId: ctx.courseId, courseUrl: ctx.courseUrl, courseName: ctx.courseName, subject: ctx.subject, links: out, indexLinks: indexOut };
}

  // ── Server-owned identity ──────────────────────────────────────────────────
  // Which LMS this is, what subject the material belongs to and which course an
  // item is filed under are decided by the server. Cached for the page's life so
  // the sync helpers (`scrapeCourseContext`, `collectCourseLinks`) can read it
  // without becoming async.
  let __serverIdentity = null;
  let __identityPromise = null;

  function _nameCandidates() {
    const out = [];
    try {
      if (typeof getCourseName === 'function') {
        const n = getCourseName();
        if (n) out.push(n);
      }
    } catch (e) { /* no course name on this page */ }
    out.push(document.title || '');
    return out.filter(Boolean);
  }

  async function primeServerIdentity() {
    if (__serverIdentity) return __serverIdentity;
    if (__identityPromise) return __identityPromise;
    __identityPromise = (async () => {
      const info = await serverPageInfo({
        url: window.location.href,
        host: window.location.hostname,
        path: window.location.pathname,
        title: document.title || '',
        name_candidates: _nameCandidates(),
      });
      if (info) __serverIdentity = info;
      return __serverIdentity;
    })();
    return __identityPromise;
  }

  // The fields whose values are raw HTML and must be converted server-side.
  const _HTML_FIELDS = ['title', 'prompt', 'instructions', 'description', 'content',
    'body', 'text', 'rubric', 'attachments', 'blocks', 'sections', 'questions', 'notes'];

  async function _enrich(result) {
    const res = await serverPageInfo({
      url: window.location.href,
      host: window.location.hostname,
      path: window.location.pathname,
      title: document.title || '',
      name_candidates: _nameCandidates(),
      payload: result,
      html_fields: _HTML_FIELDS,
    });
    if (!res || !res.payload) return result;
    const merged = { ...result, ...res.payload };
    merged.meta = {
      ...(result.meta || {}),
      platformOrigin: res.platform || (result.meta || {}).platformOrigin || 'generic',
      subject: res.subject || '',
      courseId: (res.course || {}).courseId || '',
      itemId: (res.course || {}).itemId || '',
      itemKind: (res.course || {}).itemKind || '',
      courseUrl: (res.course || {}).courseUrl || '',
      courseName: res.name || '',
    };
    return merged;
  }

  async function scrapeAssignmentUniversal() {
    // Identity first: the server tells us which scraper applies. A page we cannot
    // identify is not scraped at all, so material is never filed under a guessed
    // platform.
    const id = await primeServerIdentity();
    const platform = (id && id.platform) || '';

    let result = null;

    switch (platform) {
    case 'canvas':
      result = scrapeCanvas();
      break;
    case 'google_classroom':
      result = scrapeGoogleClassroom();
      break;
    case 'blackboard':
      result = scrapeBlackboard();
      break;
    case 'brightspace':
      result = scrapeBrightspace();
      break;
    case 'moodle':
      result = scrapeMoodle();
      break;
    default:
      // No recognised platform — INCLUDING the case where the server could not
      // classify the page at all. That case used to `return null` above, which
      // made `scrapeGeneric()` — the heuristic scraper written for "literally
      // ANY arbitrary webpage" — unreachable for exactly the pages that need it
      // most. The popup then reported "Unparseable Website" for anything the
      // classifier did not recognise; the owner hit this on a Canvas assignment
      // ("it should be able to parse anything").
      //
      // We still never GUESS a platform: an unclassified page is recorded as
      // 'unknown', so attribution stays honest. What changes is that the page's
      // own content is no longer thrown away just because we could not name it.
      result = scrapeGeneric();
      break;
  }

    // Belt and braces: a KNOWN platform whose scraper returned nothing (a
    // selector change on Canvas, say) degrades to the generic heuristic rather
    // than to zero content and an "Unparseable" report.
    if (!result) result = scrapeGeneric();

    // A thin extraction still gets the page's main content appended, the same
    // supplement the deep scraper applies. Long enough to be real prose means
    // the platform scraper did its job and this is skipped.
    if ((result.prompt || '').trim().length < 200) {
      const mainEl = document.querySelector('article, main, #main-content, #content, .assignment, .post-content, .user_content');
      const altText = (mainEl ? htmlToCleanMarkdown(mainEl) : '') || htmlToCleanMarkdown(document.body) || '';
      if (altText.trim().length > (result.prompt || '').trim().length) {
        result.prompt = capScrapeText(altText);
      }
    }

    result.platform = platform || 'unknown';
    result.url = window.location.href;
    result.scraped_at = new Date().toISOString();
    // LMS identity + topic (08-28): server-side bubble attribution depends on it.
    result.meta = scrapeCourseContext();
    // One round trip converts every HTML field to Markdown and re-states the
    // identity, so the client never carries conversion rules.
    return await _enrich(result);
  }

function scrapeCanvas() {
  const title =
    document.querySelector('.ig-title')?.innerText?.trim() ||
    document.querySelector('h1.page-title')?.innerText?.trim() ||
    document.querySelector('h1.title')?.innerText?.trim() ||
    document.title.replace(/ - .*/, '').trim() ||
    'Untitled Canvas Assignment';

  const dueDate =
    document.querySelector('.ig-due-date')?.innerText?.trim() ||
    document.querySelector('.assignment-due-date')?.innerText?.trim() ||
    document.querySelector('time[data-tooltip]')?.getAttribute('data-tooltip')?.trim() ||
    '';

  const promptEl = document.querySelector('#assignment_description, .user_content, .description');
  const prompt = promptEl ? capScrapeText(htmlToCleanMarkdown(promptEl) || promptEl.innerText || '') : '';

  const rubrics = Array.from(document.querySelectorAll('.rubric_criterion, .rubric-criterion, table.rubric'))
    .map((e) => htmlToCleanMarkdown(e) || e.innerText.trim())
    .join('\n---\n');

  const files = extractAllFileLinks();
  return { title, dueDate, prompt, rubric: rubrics, files };
}

function scrapeGoogleClassroom() {
  const title =
    document.querySelector('h1')?.innerText?.trim() ||
    document.querySelector('div[data-assignment-id] h2')?.innerText?.trim() ||
    document.title.replace(/ - Google Classroom/, '').trim() ||
    'Untitled Classroom Assignment';

  const dueDateEl =
    document.querySelector('div[aria-label*="Due"]') ||
    Array.from(document.querySelectorAll('span, div')).find((el) => /due\s+[a-z]{3}\s+\d+/i.test(el.innerText || ''));
  const dueDate = dueDateEl ? dueDateEl.innerText.trim() : '';

  const promptEl = document.querySelector('div[dir="auto"].c3I1v, div[jsname="V67aGc"], .asQXV');
  const prompt = promptEl
    ? capScrapeText(htmlToCleanMarkdown(promptEl) || promptEl.innerText || '')
    : (document.body ? capScrapeText(htmlToCleanMarkdown(document.body) || document.body.innerText || '') : '');

  const files = extractAllFileLinks();
  return { title, dueDate, prompt, rubric: '', files };
}

function scrapeBlackboard() {
  const title =
    document.querySelector('#pageTitleText, .itemInfo h3, h1')?.innerText?.trim() ||
    document.title.trim() ||
    'Untitled Blackboard Assignment';

  const dueDateEl = Array.from(document.querySelectorAll('.details, span, div')).find((el) => /due date:/i.test(el.innerText));
  const dueDate = dueDateEl ? dueDateEl.innerText.trim() : '';

  const promptEl = document.querySelector('.vtbegenerated, .contentList, #content_listContainer');
  const prompt = promptEl ? capScrapeText(htmlToCleanMarkdown(promptEl) || promptEl.innerText?.trim() || '') : '';

  const rubrics = Array.from(document.querySelectorAll('.rubric-table, table[summary*="Rubric"]'))
    .map((e) => htmlToCleanMarkdown(e) || e.innerText.trim())
    .join('\n---\n');

  const files = extractAllFileLinks();
  return { title, dueDate, prompt, rubric: rubrics, files };
}

function scrapeBrightspace() {
  const title =
    document.querySelector('.d2l-page-title, .d2l-heading, h1')?.innerText?.trim() ||
    document.title.trim() ||
    'Untitled Brightspace Assignment';

  const promptEl = document.querySelector('.d2l-htmlblock, .d2l-typography, .d2l-htmleditor');
  const prompt = promptEl ? capScrapeText(htmlToCleanMarkdown(promptEl) || promptEl.innerText?.trim() || '') : '';

  const rubrics = Array.from(document.querySelectorAll('.d2l-rubric, d2l-rubric'))
    .map((e) => htmlToCleanMarkdown(e) || e.innerText.trim())
    .join('\n---\n');

  return { title, dueDate: '', prompt, rubric: rubrics, files: extractAllFileLinks() };
}

function scrapeMoodle() {
  const title =
    document.querySelector('.activity-header h2, .page-header-headings h1, h1')?.innerText?.trim() ||
    document.title.trim() ||
    'Untitled Moodle Assignment';

  const promptEl = document.querySelector('.activity-description, #intro, .box.py-3.generalbox');
  const prompt = promptEl ? capScrapeText(htmlToCleanMarkdown(promptEl) || promptEl.innerText?.trim() || '') : '';

  return { title, dueDate: '', prompt, rubric: '', files: extractAllFileLinks() };
}

function scrapeGeneric() {
  // Intelligent Heuristic Scraper for literally ANY arbitrary webpage
  const title =
    document.querySelector('h1')?.innerText?.trim() ||
    document.querySelector('meta[property="og:title"]')?.content?.trim() ||
    document.title.trim() ||
    'Coursework Document';

  // Find due dates via regex across document
  let dueDate = '';
  const bodyText = document.body ? document.body.innerText : '';
  const dueMatch = bodyText.match(/(?:due date|due|deadline|submission date):\s*([^\n\r\.\,]{3,35})/i);
  if (dueMatch && dueMatch[1]) {
    dueDate = dueMatch[1].trim();
  }

  // Extract main article or body content
  const mainEl = document.querySelector('article, main, #main-content, #content, .assignment, .post-content');
  const prompt = mainEl
    ? capScrapeText(htmlToCleanMarkdown(mainEl) || mainEl.innerText || '')
    : capScrapeText(htmlToCleanMarkdown(document.body) || bodyText);

  // Extract tables that resemble rubrics
  const rubrics = Array.from(document.querySelectorAll('table'))
    .filter((tbl) => {
      const text = tbl.innerText.toLowerCase();
      return text.includes('rubric') || text.includes('criteria') || text.includes('points') || text.includes('grade');
    })
    .map((t) => htmlToCleanMarkdown(t) || t.innerText.trim())
    .join('\n---\n');

  const files = extractAllFileLinks();
  return { title, dueDate, prompt, rubric: rubrics, files };
}

// 08-28: downloadable-file detection (real quick-scrape). Broader than before:
// explicit download markers + Canvas/Drive/OneDrive file routes + ANY link whose
// path (or visible link text) ends in a document/media extension. URLs are
// resolved ABSOLUTE and deduped so the server-side bubble stores real URLs.
var FILE_EXT_RE = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|rtf|txt|csv|md|tex|mobi|epub|odt|ods|odp|key|pages|numbers|png|jpe?g|gif|webp|bmp|svg|tiff?|mp3|wav|m4a|aac|ogg|flac|mp4|mov|avi|mkv|webm|tar|gz|dmg|exe)$/i;

function extractAllFileLinks() {
  const fileHints = [
    'a[download]',
    'a.file-link',
    'a[data-file-id]',
    'a[data-preview-id]',
    'a[href*="/files/"]',
    'a[href*="/download"]',
    'a[href*="download_file"]',
    'a[href*="attachment"]',
    'a[href*="drive.google.com/"]',
    'a[href*="docs.google.com/file"]',
    'a[href*="onedrive.live.com"]',
  ];
  const files = [];
  const seen = new Set();
  const push = (raw, fromText) => {
    if (!raw || raw.startsWith('javascript:') || raw.startsWith('blob:')) return;
    let abs = '';
    try { abs = new URL(raw, window.location.href).href; } catch { return; }
    if (!abs || seen.has(abs)) return;
    const pathPart = abs.split('#')[0].split('?')[0].split('/').pop();
    const isFileByPath = FILE_EXT_RE.test(pathPart);
    const isFileByText = fromText && FILE_EXT_RE.test(String(fromText).trim());
    if (!isFileByPath && !isFileByText) return; // only real files, never nav links
    seen.add(abs);
    files.push(abs);
  };
  document.querySelectorAll(fileHints.join(', ')).forEach((link) => {
    push(link.href || '', link.getAttribute('download') || link.innerText || '');
  });
  document.querySelectorAll('a[href]').forEach((link) => {
    push(link.href || '', link.innerText || link.ariaLabel || '');
  });
  // 08-28 file retention: 100 discovered URLs ride along (server stores up to
  // 200); deep mode hashes/uploads the first fileCap (now 25) — the rest keep
  // their URL + hash records on the bubble.
  return files.slice(0, 100);
}

// ── Deep scrape (08-28): make Quick Scrape REAL ──────────────────────────────
// The old quick scrape ran ONE synchronous DOM snapshot: no wait, no reveal
// clicks, no scrolling for lazy content, no file downloads/hashes. This routine
// drives the page like a person: expand collapsed sections, scroll through
// every step of the document (triggers intersection-observer lazy loads),
// wait for the DOM to settle, THEN extract; finally fetch + sha256 every
// downloadable file through the page's own session so LMS cookies apply.

var DEEP_REVEAL_RE = /^(show|view|read|load|open|see|display|expand|continue)\b.*(more|all|full|details|everything)|^(show all|view all|load more|read more|see more|expand all|continue reading|more)$|more|expand|continue reading|展开|更多|查看全部|显示/i;

function deepVisible(el) {
  const r = el.getBoundingClientRect();
  return r.height > 0 && r.width > 0;
}

function deepRevealCandidates() {
  const sel = 'details:not([open]) summary, button, a[role="button"], [role="button"], [aria-expanded="false"], .expand, .more-link, .see-more';
  const out = [];
  document.querySelectorAll(sel).forEach((el) => {
    const txt = (el.innerText || el.textContent || '').trim();
    if (!txt || txt.length > 60) return;              // real buttons have short labels
    if (!DEEP_REVEAL_RE.test(txt)) return;
    if (!deepVisible(el)) return;
    out.push(el);
  });
  return out;
}

var sleepDeep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deepScrapeUniversal(options) {
  const opts = options || {};
  const maxClicks = opts.maxClicks || 10;
  const scrollSteps = opts.scrollSteps || 8;
  const fileCap = opts.fileCap || 25;
  const settleWindowMs = opts.settleMs || 800;
  const b64Cap = opts.b64Cap || 6_000_000; // base64 byte cap for dump upload (8B -> 6MB: bigger PDFs/packets stream)
  const t0 = performance.now();

  let clicks = 0;
  let scrolls = 0;
  let lastTextLen = -1;
  let stalledRounds = 0;

  const maybeEnd = () => {
    const tl = document.body.innerText.length;
    if (tl === lastTextLen) stalledRounds += 1; else { stalledRounds = 0; lastTextLen = tl; }
    return stalledRounds >= 3;
  };

  // 1. Reveal rounds: expand details/accordions/"show more" buttons.
  for (let round = 0; round < 4 && clicks < maxClicks; round++) {
    const cands = deepRevealCandidates();
    if (cands.length === 0) break;
    let clickedThisRound = 0;
    for (const el of cands) {
      if (clicks >= maxClicks) break;
      try {
        el.click();
        clicks += 1;
        clickedThisRound += 1;
        await sleepDeep(280);
      } catch { /* element may have detached */ }
    }
    if (clickedThisRound === 0) break;
    if (maybeEnd()) break;
  }

  // 2. Scroll EVERY step of the page (lazy-load triggers fire on scroll
  //    position, not on content change — an early break leaves bottom-of-page
  //    sections unloaded). Returns to the top so extraction starts at the top.
  const maxY = Math.max(1, document.body.scrollHeight - window.innerHeight);
  for (let i = 1; i <= scrollSteps; i++) {
    window.scrollTo(0, Math.min(maxY, Math.floor((maxY * i) / scrollSteps)));
    scrolls += 1;
    await sleepDeep(420);
    if (maxY <= 0) break;                                 // no scrollable page at all
    if (Math.floor((maxY * i) / scrollSteps) >= maxY - 2) break; // reached the bottom
  }
  window.scrollTo(0, 0);

  // 3. Settle: wait for a quiet window after the last DOM mutation (frames,
  //    async fetches, scroll listeners) with a hard 4s cap.
  try {
    const done = await new Promise((resolve) => {
      let timer = null;
      const obs = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => { obs.disconnect(); resolve(true); }, settleWindowMs);
      });
      obs.observe(document.body, { subtree: true, childList: true, characterData: true });
      timer = setTimeout(() => { obs.disconnect(); resolve(true); }, 4000);
    });
  } catch { /* extremely odd DOMs — proceed anyway */ }

  // 4. Extract through the EXACT same parser the platform scrapers use (so the
  //    structured shape never diverges between quick and deep mode), then
  //    supplement a thin prompt with the main-content text when available.
    const base = (typeof scrapeAssignmentUniversal === 'function') ? await scrapeAssignmentUniversal() : null;
  if (!base) return null;
  if ((base.prompt || '').trim().length < 200) {
    const main = document.querySelector('article, main, #main-content, #content, .assignment, .post-content, .user_content');
    const altText = (main ? htmlToCleanMarkdown(main) : '') || htmlToCleanMarkdown(document.body) || '';
    if (altText.trim().length > (base.prompt || '').trim().length) {
      base.prompt = capScrapeText(altText);
    }
  }

  // 5. Files: full detection + per-file sha256 via the page's own fetch (the
  //    file URL in an LMS resolves with the user's cookies). Bytes ≤ b64Cap
  //    come back base64 so the service worker can push them into the dump
  //    flow; larger/unauth'd files keep URL + hash on the bubble.
  base.files = extractAllFileLinks();
  base.filesWithMeta = [];
  const budget = performance.now() + 25000; // total hashing budget
  for (const url of base.files.slice(0, fileCap)) {
    if (performance.now() > budget) break;
    const rec = { url, ok: false, filename: decodeURIComponent(url.split('?')[0].split('/').pop() || 'file'), size: 0, sha256: '', contentType: '' };
    try {
      const resp = await Promise.race([
        fetch(url, { credentials: 'include' }),
        sleepDeep(6000).then(() => null),
      ]);
      if (!resp || !resp.ok) {
        rec.error = resp ? `HTTP ${resp.status}` : 'timeout';
        base.filesWithMeta.push(rec);
        continue;
      }
      const buf = new Uint8Array(await resp.arrayBuffer());
      rec.size = buf.byteLength;
      rec.contentType = resp.headers.get('content-type') || '';
      rec.ok = true;
      if (window.crypto && crypto.subtle && rec.size > 0) {
        const digest = await crypto.subtle.digest('SHA-256', buf);
        rec.sha256 = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
      }
      if (rec.size > 0 && rec.size <= b64Cap) {
        let binary = '';
        const CH = 0x8000;
        for (let i = 0; i < buf.length; i += CH) binary += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
        rec.b64 = btoa(binary);
      }
    } catch (e) {
      rec.error = String(e).slice(0, 120);
    }
    base.filesWithMeta.push(rec);
  }

  base.deep = { clicks, scrollSteps: scrolls, totalMs: Math.round(performance.now() - t0), fileHashes: base.filesWithMeta.length };
  return base;
}

// Subagent Tool Execution Helpers
window.__helpotron_read_assignment = scrapeAssignmentUniversal;
window.__helpotron_scrape_universal = scrapeAssignmentUniversal;
window.__helpotron_deep_scrape_universal = deepScrapeUniversal;
window.__helpotron_extract_file_links = extractAllFileLinks;

window.__helpotron_inspect_dom = function (selector) {
  if (!selector) return { error: 'Missing selector' };
  const elements = Array.from(document.querySelectorAll(selector)).map((el) => ({
    tagName: el.tagName,
    text: el.innerText.trim().slice(0, 1000),
    attributes: Array.from(el.attributes).reduce((acc, a) => ({ ...acc, [a.name]: a.value }), {}),
  }));
  return { count: elements.length, elements: elements.slice(0, 20) };
};

window.__helpotron_extract_rubric = function (selector) {
  const target = selector ? document.querySelector(selector) : null;
  const tables = target ? [target] : Array.from(document.querySelectorAll('table, .rubric, .rubric_criterion'));
  const rubricData = tables.map((t) => t.innerText.trim()).filter(Boolean);
  return { rubrics: rubricData };
};


// ── Remediation BATCH-08: runtime message channel (MV3) ─────────────────────
// Complements the window.__helpotron_* globals above — the popup/background
// can now drive scraping over chrome.runtime messaging.
//
// IDEMPOTENCY GUARD (09-07): background.js re-injects content.js on every
// scrape/agent call (`chrome.scripting.executeScript {files:['content.js']}`),
// and a dynamic injection re-RUNS the whole file in the SAME isolated world as
// the manifest content script. Unguarded top-level registrations would
// compound per Scrape click: listener ×N answering every message, the web-app
// bridge re-posting, the interrupt reporter firing through N listeners, N
// keydown handlers on the page. Each registration below is flagged in this
// world (reset on document navigation) so re-injection is a no-op.
if (!window.__helpotron_scrape_channel__) {
  window.__helpotron_scrape_channel__ = true;
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.action === 'SCRAPE_CURRENT_ASSIGNMENT') {
      // The scraper is server-driven now: it awaits page identity before it can
      // choose a platform parser, so this must stay async and return true to
      // keep the message channel open for sendResponse.
      (async () => {
        try {
          const data = (typeof scrapeAssignmentUniversal === 'function')
            ? await scrapeAssignmentUniversal()
            : null;
          sendResponse({ success: !!data, assignment: data || null });
        } catch (e) {
          sendResponse({ success: false, error: String(e) });
        }
      })();
      return true;
    } else if (request && request.action === 'DEEP_SCRAPE_CURRENT_ASSIGNMENT') {
    deepScrapeUniversal().then((data) => sendResponse({ success: !!data, assignment: data || null }));
    return true;
  } else if (request && request.action === 'COLLECT_COURSE_LINKS') {
    sendResponse(collectCourseLinks());
  } else if (request && request.action) {
    // Actions owned by the other listeners registered in this same isolated
    // world (the assistive-typing engine and the agent-drive reporter) must
    // NOT be answered here. chrome.tabs.sendMessage delivers to every listener
    // and the FIRST sendResponse wins, so answering would starve them and hand
    // the caller {success:false, error:'unknown action'}.
    const ownedByOtherListeners =
      request.action === 'START_ASSISTIVE_TYPING' ||
      request.action === 'PAUSE_ASSISTIVE_TYPING' ||
      request.action === 'RESUME_ASSISTIVE_TYPING' ||
      request.action === 'CANCEL_ASSISTIVE_TYPING' ||
      request.action === 'GET_TYPING_STATUS' ||
      request.action === 'BROADCAST_TYPING_PROGRESS';
    if (ownedByOtherListeners) return false;
    sendResponse({ success: false, error: 'unknown action' });
  } else {
    sendResponse({ success: false, error: 'no action' });
  }
  return true; // keep the channel open for the (sync) response
});
}

// ═════════════════════════════════════════════════════════════════════════════
// ── "Launch to Doc" — Assistive Typing Engine for Students with Disabilities ──
// ═════════════════════════════════════════════════════════════════════════════

// Letter pairs that come out fast because the hand already knows them. Drawn
// from the most frequent English digraphs, minus any that sit on one finger.
const FAST_DIGRAPHS = new Set([
  'th', 'he', 'in', 'er', 'an', 'nd', 'ou', 'ea', 'to', 'it',
  'is', 'or', 'ti', 'as', 'te', 'et', 'ng', 'of', 'al', 'de',
  'se', 'le', 'sa', 'si', 'ar', 've', 'ra', 'ld', 'ur',
]);

// Which finger types each key, for the same-finger penalty: 0–3 left hand
// (pinky→index), 4–7 right hand (index→pinky).
const KEY_FINGER = (() => {
  const map = {};
  const groups = [
    ['qaz1', 0], ['wsx2', 1], ['edc3', 2], ['rfvtgb45', 3],
    ['yhnujm67', 4], ['ik8', 5], ['ol9', 6], ['p0', 7],
  ];
  for (const [keys, finger] of groups) {
    for (const k of keys) map[k] = finger;
  }
  return map;
})();

// Measured, not guessed. These are the median gap and the log-normal spread
// after each kind of character, taken from a GPTZero writing report for a real
// 2536-word essay (10,066 Docs revisions, 112 minutes of active editing, scored
// 93/100 human). `sigma` is derived from the measured p90: median * e^(1.2816s).
// `cap` is the only invented number — the real p99 after a full stop ran past
// two minutes, which is a person leaving the desk, not typing.
// Each char type has a [min, median, cap] range the delay is freshly drawn from
// on every letter, so no two gaps repeat yet the tail still matches the report.
// Values are the measured p50/p90 of a real GPTZero 93/100 run. `sigma` turns
// the median into that p90 via log-normal (p90 = median * e^(1.2816*sigma));
// `cap` is the only invented number — the real p99 after a full stop went past
// two minutes, which is a person leaving the desk, not typing.
// The gap-shape model that used to live here (`GAP_SHAPE`) moved to the server
// with the rest of the typing engine — see server/human_profile.py. Nothing in
// this file computes a delay any more; every timing is a value the server sent.
// ═══════════════════════════════════════════════════════════════════════════
// The typing model moved to the server (owner 2026-09-18).
//
// A 35-parameter `HumanProfile` used to live here and decide, for every
// character, the gap, the typo, the false start, the reread and the correction.
// It now lives in `server/human_profile.py`, reached through
// `POST /api/extension/action-stream`, which returns one decision per character.
//
// `startTyping` fetches that plan before it types and indexes it per character.
// There is no local engine and no fallback: without a valid Helpotron API key the
// plan cannot be fetched and typing does not start. Every cadence or
// humanization tweak is therefore a server deploy, not a Chrome Web Store
// review, and a modified client cannot substitute its own rhythm.
// ═══════════════════════════════════════════════════════════════════════════


var GoogleDocsAssistiveTypingEngine = class GoogleDocsAssistiveTypingEngine {
  constructor() {
    this.state = {
      isTyping: false,
      isPaused: false,
      text: '',
      currentIndex: 0,
      totalChars: 0,
      totalWords: 0,
      wordsTyped: 0,
      wpm: 65,
      naturalPauses: true,
      jitter: true,
      typoRate: 0.06,
      falseStartRate: 0.025,
      assignmentTitle: '',
      assignmentId: null,
      hudElement: null,
    };
    // When true, keystrokes are dispatched by the service worker through the
    // Chrome DevTools Protocol (Input.dispatchKeyEvent), which goes through the
    // browser's real input pipeline and therefore produces events with
    // isTrusted:true. The DOM path below dispatches synthetic KeyboardEvents,
    // which are isTrusted:false. Measured: the DOM path yields keydown/keypress/
    // keyup all false; the CDP path yields keydown/keypress/beforeinput/input/
    // keyup all true. The engine still owns WHAT and WHEN to type — this flag
    // only swaps the hand that presses the key.
    this.trustedKeys = false;
    // HUD realism controls live in this.config (persisted per-user); the
    // engine reads the effective rates as state-rate × config-toggle so both
    // the popup payload and the on-page HUD drawer stay in control.
    this.config = {
      wpm: 65,
      typosEnabled: true,
      falseStarts: true,
      punctuationPauses: true,
      thinkingBreaks: true,
      jitter: true,
    };
    this.loadConfig();
    this.setupListeners();
  }

  async loadConfig() {
    try {
      const { helpotron_hud_config } = await chrome.storage.local.get('helpotron_hud_config');
      if (helpotron_hud_config && typeof helpotron_hud_config === 'object') {
        this.config = { ...this.config, ...helpotron_hud_config };
      }
    } catch (e) {}
  }

  saveConfig() {
    try {
      chrome.storage.local.set({ helpotron_hud_config: this.config });
    } catch (e) {}
  }

  setupListeners() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg) return;
      if (msg.action === 'START_ASSISTIVE_TYPING') {
        this.startTyping(msg.payload || {})
          .then((res) => sendResponse({ success: true, ...res }))
          .catch((err) => sendResponse({ success: false, error: String(err) }));
        return true;
      }
      if (msg.action === 'PAUSE_ASSISTIVE_TYPING') {
        this.pauseTyping();
        sendResponse({ success: true, status: 'paused' });
        return true;
      }
      if (msg.action === 'RESUME_ASSISTIVE_TYPING') {
        this.resumeTyping();
        sendResponse({ success: true, status: 'typing' });
        return true;
      }
      if (msg.action === 'CANCEL_ASSISTIVE_TYPING') {
        this.cancelTyping();
        sendResponse({ success: true, status: 'cancelled' });
        return true;
      }
      if (msg.action === 'GET_TYPING_STATUS') {
        sendResponse({ success: true, ...this.getStatus() });
        return true;
      }
    });
  }

  getStatus() {
    const pct = this.state.totalChars > 0
      ? Math.min(100, Math.round((this.state.currentIndex / this.state.totalChars) * 100))
      : 0;
    return {
      isTyping: this.state.isTyping,
      isPaused: this.state.isPaused,
      currentIndex: this.state.currentIndex,
      totalChars: this.state.totalChars,
      wordsTyped: this.state.wordsTyped,
      totalWords: this.state.totalWords,
      percentage: pct,
      wpm: this.state.wpm,
      assignmentTitle: this.state.assignmentTitle,
      assignmentId: this.state.assignmentId,
    };
  }

  getTargetElement() {
    // 1. Google Docs hidden text event target iframe
    const iframe = document.querySelector('iframe.docs-texteventtarget-iframe');
    if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
      iframe.contentDocument.body.focus();
      // Docs paints to a canvas and owns its own caret, so the DOM-selection
      // half of the caret helpers is not just useless here, it is wrong.
      this.isCanvasEditor = true;
      return iframe.contentDocument.body;
    }
    // 2. Generic contenteditable
    const editable = document.querySelector('div[contenteditable="true"], [contenteditable="true"]');
    if (editable) {
      editable.focus();
      this.isCanvasEditor = false;
      return editable;
    }
    this.isCanvasEditor = false;
    return document.activeElement || document.body;
  }

  // ── Trusted keystroke bridge ─────────────────────────────────────────────
  // Ask the service worker to emit one native key event for this tab. Returns
  // false (and drops out of trusted mode) the moment the bridge is unavailable,
  // so the DOM fallback below keeps the typing alive instead of stalling.
  async cdpKey(params) {
    try {
      const r = await chrome.runtime.sendMessage({ type: 'helpotron-cdp-key', params });
      if (r && r.ok) return true;
    } catch (e) { /* worker asleep / no session */ }
    this.trustedKeys = false;
    return false;
  }

  // CDP params that make a text character land as a real key press.
  _cdpCharDown(char) {
    if (char === '\n') {
      return { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13,
               nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' };
    }
    const p = { type: 'keyDown', text: char, unmodifiedText: char };
    if (/^[a-zA-Z]$/.test(char)) {
      p.key = char;
      p.code = `Key${char.toUpperCase()}`;
      p.windowsVirtualKeyCode = char.toUpperCase().charCodeAt(0);
      if (char !== char.toLowerCase()) p.modifiers = 8;   // Shift held for a capital
    } else if (/^[0-9]$/.test(char)) {
      p.key = char;
      p.code = `Digit${char}`;
      p.windowsVirtualKeyCode = char.charCodeAt(0);
    } else if (char === ' ') {
      p.key = ' ';
      p.code = 'Space';
      p.windowsVirtualKeyCode = 32;
    }
    return p;
  }

  async _trustedInsertChar(char) {
    const _t = performance.now();
    const down = this._cdpCharDown(char);
    if (!(await this.cdpKey(down))) return false;
    const up = { type: 'keyUp' };
    if (down.key) { up.key = down.key; up.code = down.code; }
    if (down.windowsVirtualKeyCode) {
      up.windowsVirtualKeyCode = down.windowsVirtualKeyCode;
      up.nativeVirtualKeyCode = down.windowsVirtualKeyCode;
    }
    return this.cdpKey(up);
  }

  async _trustedDeleteChar() {
    const p = { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 };
    if (!(await this.cdpKey({ ...p, type: 'keyDown' }))) return false;
    return this.cdpKey({ ...p, type: 'keyUp' });
  }

  async insertChar(target, char) {
    if (this.trustedKeys && await this._trustedInsertChar(char)) return;
    if (char === '\n') {
      const enterDown = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
      target.dispatchEvent(enterDown);
      const enterPress = new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
      target.dispatchEvent(enterPress);

      try {
        document.execCommand('insertParagraph', false);
      } catch (e) {
        try { document.execCommand('insertText', false, '\n'); } catch (err) {}
      }

      const enterUp = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
      target.dispatchEvent(enterUp);
      return;
    }

    try {
      const beforeInput = new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: char,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(beforeInput);
    } catch (e) {}

    const keyCode = char.charCodeAt(0);
    const keydown = new KeyboardEvent('keydown', { key: char, code: `Key${char.toUpperCase()}`, keyCode, which: keyCode, bubbles: true, cancelable: true });
    target.dispatchEvent(keydown);

    const keypress = new KeyboardEvent('keypress', { key: char, code: `Key${char.toUpperCase()}`, keyCode, which: keyCode, bubbles: true, cancelable: true });
    target.dispatchEvent(keypress);

    // execCommand emits its OWN trusted `input` event when it succeeds, so the
    // manual dispatch below must run only when it did not — otherwise every
    // character fires two input events, the second one isTrusted:false.
    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, char);
    } catch (e) {}

    if (!inserted) {
      try {
        const inputEvent = new InputEvent('input', {
          inputType: 'insertText',
          data: char,
          bubbles: true,
        });
        target.dispatchEvent(inputEvent);
      } catch (e) {}
    }

    const keyup = new KeyboardEvent('keyup', { key: char, code: `Key${char.toUpperCase()}`, keyCode, which: keyCode, bubbles: true, cancelable: true });
    target.dispatchEvent(keyup);
  }

  async deleteChar(target) {
    if (this.trustedKeys && await this._trustedDeleteChar()) return;
    try {
      const beforeInput = new InputEvent('beforeinput', {
        inputType: 'deleteContentBackward',
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(beforeInput);
    } catch (e) {}

    const keydown = new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true, cancelable: true });
    target.dispatchEvent(keydown);
    const keypress = new KeyboardEvent('keypress', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true, cancelable: true });
    target.dispatchEvent(keypress);

    try {
      document.execCommand('delete', false);
    } catch (e) {}

    try {
      const inputEvent = new InputEvent('input', {
        inputType: 'deleteContentBackward',
        bubbles: true,
      });
      target.dispatchEvent(inputEvent);
    } catch (e) {}

    const keyup = new KeyboardEvent('keyup', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true, cancelable: true });
    target.dispatchEvent(keyup);
  }

  // ── Action log ───────────────────────────────────────────────────────────
  //
  // Every action this engine takes, with a monotonic timestamp, so a run can be
  // correlated against whatever a detector reports about it. Without this the
  // only evidence is the finished document, which cannot distinguish "the
  // correction landed as one revision" from "it landed as three".
  //
  // `mech` is the important field: it records the mechanism a character went
  // through (cdp text, cdp key, dom execCommand, dom event), because a detector
  // sees a different revision for each and a single word on the wrong one
  // shows up as a "Large Paste".
  logAction(kind, data) {
    if (!this.actionLog) this.actionLog = [];
    if (this.actionLog.length > 60000) return;   // hard ceiling, never unbounded
    this.actionLog.push(Object.assign({
      t: Math.round(performance.now() - (this.runT0 || 0)),
      kind,
    }, data || {}));
  }

  _selStart() {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) return sel.anchorOffset;
    } catch (e) {}
    return null;
  }

  getActionLog() {
    return { t0: this.runT0 || 0, count: (this.actionLog || []).length, log: this.actionLog || [] };
  }

  // ── Human motion: the hand leaving the keyboard ─────────────────────────
  //
  // A person writing an essay moves the mouse. They reposition the caret,
  // glance at something, click back into the paragraph. The engine's trace had
  // none of it — every event was a keystroke, which is its own signature.
  //
  // Two constraints keep this safe. It is a real pointer move through the
  // debugger's Input domain, so it is a genuine mouse event, not a synthetic
  // one. And it NEVER clicks unless the profile says so, because a stray click
  // in a document moves the caret and a caret in the wrong place corrupts the
  // essay. Movement alone is always safe.
  async humanMouseWander(target, decision) {
    const vp = this.state.viewport || {};
    const w = vp.w || window.innerWidth || 1200;
    const h = vp.h || window.innerHeight || 800;
    // Start from somewhere plausible in the text area, not the current pointer
    // (which the page cannot read and the debugger will not report here).
    const x0 = w * (0.15 + Math.random() * 0.5);
    const y0 = h * (0.25 + Math.random() * 0.4);
    const reach = decision.reach || 120;
    const x1 = Math.max(2, Math.min(w - 2, x0 + (Math.random() - 0.5) * 2 * reach));
    const y1 = Math.max(2, Math.min(h - 2, y0 + (Math.random() - 0.5) * 2 * reach));
    const steps = Math.max(3, Math.min(30, decision.steps || 10));

    this.updateFloatingHUD('Thinking…');
    for (let n = 1; n <= steps; n++) {
      if (!this.state.isTyping) return;
      const t = n / steps;
      // Ease-out: fast at the start of the move, settling onto the target the
      // way a hand does rather than travelling at a constant rate.
      const e = 1 - Math.pow(1 - t, 2);
      // A small arc across the path, so it is a curve and not a straight line.
      const bow = Math.sin(t * Math.PI) * (reach * 0.12);
      const x = x0 + (x1 - x0) * e + bow;
      const y = y0 + (y1 - y0) * e;
      const ok = await this.cdpInput('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
      if (!ok) return;   // no bridge (non-CDP fallback): skip motion entirely
      await new Promise((r) => setTimeout(r, 8 + Math.random() * 26));
    }
    await new Promise((r) => setTimeout(r, decision.hover || 180));
    // Only click when the profile rolled for it, and only as a single left
    // click at the resting point — enough to read as a real repositioning.
    if (decision.click) {
      const p = { x: x1, y: y1, button: 'left', buttons: 1, clickCount: 1 };
      await this.cdpInput('Input.dispatchMouseEvent', { ...p, type: 'mousePressed' });
      await new Promise((r) => setTimeout(r, 40 + Math.random() * 70));
      await this.cdpInput('Input.dispatchMouseEvent', { ...p, buttons: 0, type: 'mouseReleased' });
    }
  }

  // One Input-domain CDP call through the service worker. Returns false when
  // the bridge is unavailable, so the caller can bow out rather than stall.
  async cdpInput(method, params) {
    try {
      const r = await chrome.runtime.sendMessage({ type: 'helpotron-cdp-input', method, params });
      return !!(r && r.ok);
    } catch (e) { return false; }
  }

  // ── Human motion: re-reading and editing what is already on the page ───────
  //
  // GPTZero's typing model reads the SHAPE of the session — pace, rhythm,
  // burstiness, correction behaviour, pauses — and grades a stream that only
  // ever appends as one-dimensional. A person writing an essay periodically
  // stops, moves the caret back into what they already wrote, selects a few
  // words, deletes them, and rewords. That is the one category the engine had
  // none of: measured on the 2026-09-15 run, 770 edits and zero deletions.
  //
  // Deliberately conservative. Every pass restores the source text exactly, so
  // the finished document always matches what was asked for, and the pass
  // aborts if anything about the caret position disagrees with its model of the
  // text — a wrong guess here corrupts the essay, and a corrupted essay is a
  // far worse outcome than a detection score.
  async microEditPass(target, chars, nextIndex, emitted, decision) {
    // Only act on a settled boundary, only late enough that there is something
    // to re-read, and only with a couple of characters to spare.
    if (nextIndex < 80 || nextIndex > chars.length - 40) return emitted;
    if (this.state.paused || !this.state.isTyping) return emitted;

    // Walk back a short distance the way a reader scrolls up a line. The
    // profile picks the depth and how long the read lasts; the fallback keeps
    // this usable if it is ever called without a decision.
    const depth = (decision && decision.depth) ? decision.depth : (12 + Math.floor(Math.random() * 26));
    const backTo = nextIndex - depth;
    if (backTo < 20) return emitted;
    const backChars = emitted - backTo;
    if (backChars < 6 || backChars > 40) return emitted;

    this.updateFloatingHUD('Re-reading…');
    await this.moveCaret(target, false, backChars, false);
    if (!this.state.isTyping) return emitted;
    // Reading it back takes as long as the profile says it does.
    await new Promise((r) => setTimeout(r, (decision && decision.beat) ? decision.beat : (260 + Math.random() * 520)));
    if (decision && decision.mode >= 2) {
      // Look only — move the eye back over the text and return. No edit at all,
      // which is what most re-reads actually are.
      await this.moveCaret(target, true, backChars, false);
      this.updateFloatingHUD();
      return emitted;
    }

    // Pick a short run inside the window that is safe to retype: letters,
    // spaces and simple punctuation only. Never a newline, never the very
    // start, never anything that could be a partial word at the edge.
    const runLen = 2 + Math.floor(Math.random() * 4);
    const start = backTo;
    if (start + runLen > chars.length) return emitted;
    const slice = chars.slice(start, start + runLen);
    if (!/^[A-Za-z][A-Za-z \t.,'-]*$/.test(slice)) return emitted;
    if (start > 0 && /\S/.test(chars[start - 1])) return emitted;   // mid-word

    // Select it, the way a hand does with shift-arrow.
    await this.moveCaret(target, true, runLen, true);
    if (!this.state.isTyping) return emitted;
    await new Promise((r) => setTimeout(r, 140 + Math.random() * 260));

    // Delete the selection, read it once, then retype the SAME text. Nothing
    // about the document changes — what changes is that the replay now has a
    // delete, a thinking pause and a retype in the middle of the page, which is
    // the correction behaviour a real writer produces and an append-only stream
    // never does.
    await this.deleteChar(target);
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 620));
    for (let c = 0; c < runLen; c++) {
      await this.insertChar(target, slice[c]);
      if (c < runLen - 1) {
        await new Promise((r) => setTimeout(r, this._step('fragment_char_ms', 110)));
      }
    }

    // Caret is now exactly where the typing had reached: backChars were
    // consumed by the walk back and runLen retyped, so walk forward by the
    // difference. emitted is unchanged because the same characters still stand.
    const forward = backChars - runLen;
    if (forward > 0) await this.moveCaret(target, true, forward, false);
    await new Promise((r) => setTimeout(r, 120 + Math.random() * 240));
    this.updateFloatingHUD();
    return emitted;
  }

  // ── Caret control ───────────────────────────────────────────────────────────
  // 09-08: corrections used to happen on the spot — wrong key, backspace, right
  // key, all before the next character. Nobody types like that. A real typist
  // runs on for a word or so, sees the mistake, walks the caret back over the
  // good text with the arrow keys, fixes the bad characters in place, and walks
  // forward again. That needs a caret this engine can move, which is what these
  // three do.
  //
  // Both mechanisms fire every time, because the two kinds of editor this runs
  // in answer to different ones:
  //   • Google Docs draws to a canvas and owns its own caret. It reads the
  //     keydown dispatched at its hidden texteventtarget iframe — the same path
  //     that already makes ordinary characters land — so arrows, shift-arrows
  //     and typing over a selection all reach it as key events.
  //   • A plain contenteditable or textarea ignores synthetic key events; the
  //     browser only moves a caret for trusted input. Those need the Selection
  //     (or selectionStart) work done directly.
  // Whichever half does not apply is inert, so both can run unconditionally.

  dispatchKey(target, key, keyCode, shift) {
    if (this.trustedKeys) {
      const p = { key, code: key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
      if (shift) p.modifiers = 8;
      return this.cdpKey({ ...p, type: 'keyDown' }).then(() => this.cdpKey({ ...p, type: 'keyUp' }));
    }
    for (const type of ['keydown', 'keyup']) {
      target.dispatchEvent(new KeyboardEvent(type, {
        key, code: key, keyCode, which: keyCode,
        shiftKey: shift, bubbles: true, cancelable: true,
      }));
    }
    return Promise.resolve();
  }

  // Move the real DOM caret. No-op inside Google Docs, where the hidden iframe
  // body holds no text and the key event above has already done the work.
  nativeCaretMove(target, forward, extend) {
    if (this.isCanvasEditor) return;
    // Under trusted input the key event ABOVE is a real key: the browser moves
    // the caret itself, and doing it again here would move it twice.
    if (this.trustedKeys) return;
    try {
      if (typeof target.selectionStart === 'number') {
        // <textarea> / <input>: the selection is a pair of offsets, not a Selection.
        const start = target.selectionStart;
        const end = target.selectionEnd;
        if (extend) {
          target.setSelectionRange(start, Math.max(start, end + (forward ? 1 : -1)));
        } else {
          const at = Math.max(0, (forward ? end + 1 : start - 1));
          target.setSelectionRange(at, at);
        }
        return;
      }
      const sel = (target.ownerDocument?.defaultView || window).getSelection();
      // Selection.modify is non-standard but is what Chrome gives us for
      // character-granularity movement; there is no standard equivalent.
      if (sel && typeof sel.modify === 'function') {
        sel.modify(extend ? 'extend' : 'move', forward ? 'forward' : 'backward', 'character');
      }
    } catch (e) { /* a hostile editor can throw here; the key event still went out */ }
  }

  async moveCaret(target, forward, count, extend = false) {
    const key = forward ? 'ArrowRight' : 'ArrowLeft';
    const keyCode = forward ? 39 : 37;
    for (let n = 0; n < count; n++) {
      if (!this.state.isTyping) return;
      await this.dispatchKey(target, key, keyCode, extend);
      this.nativeCaretMove(target, forward, extend);
      // Held arrow keys repeat fast — about 30ms apart once the repeat starts.
      await new Promise((r) => setTimeout(r, 26 + Math.random() * 34));
    }
  }

  // Replace `selLen` characters to the right of the caret with `text`, by
  // selecting them and typing over the selection. No backspace is involved:
  // the good text after the mistake is never destroyed and retyped.
  async overtype(target, selLen, text) {
    if (selLen > 0) {
      await this.moveCaret(target, true, selLen, true);
      await new Promise((r) => setTimeout(r, 60 + Math.random() * 90));
    }
    // Correct letter-by-letter at a plausible hand speed.
    // This used to fire each character after only 40-100ms, far below the
    // ~150ms floor measured on real keystrokes. Inside a selection replacement
    // Docs' revision coalescer does not merge that stream, so it records the
    // whole run as ONE insert — and GPTZero labels a multi-character insert
    // with no intervening keystrokes a "Large Paste". That is exactly how the
    // one-word corrections "ity" and "ingenuity" got flagged on the 2026-09-15
    // run while the text itself read as hand-typed.
    for (let i = 0; i < text.length; i++) {
      // Only the first character lands on the selection; after that the
      // selection is gone and the rest are ordinary inserts.
      await this.insertChar(target, text[i]);
      if (i < text.length - 1) {
        await new Promise((r) => setTimeout(r, this._step('fragment_char_ms', 110)));
      }
    }
  }

  // Walk back to a mistake, replace the bad characters in place, walk forward
  // to where the typing had got to, and carry on. Nothing is backspaced: the
  // good text between the mistake and the caret is never destroyed and retyped.
  // Returns the new emitted-character count.
  async repairTypo(target, fix, emitted) {
    const back = emitted - fix.startedAt;
    if (back < 0) return emitted;   // bookkeeping lost — leave the text alone

    this.updateFloatingHUD('Fixing…');
    // The eye lands on it a beat before the hands answer.
    await new Promise((r) => setTimeout(r, 240 + Math.random() * 420));

    // Correct the way a hand does: backspace the bad characters, then type them
    // again. This used to walk the caret back, select the mistake with
    // SHIFT+ARROW and type over the selection, which leaves no
    // deleteContentBackward anywhere in the playback and reads as one
    // select-and-replace tic repeated down the page. Backspace is what a person
    // actually reaches for, and it gives the replay the correction events its
    // model expects. The caret only walks when the mistake is already behind
    // the cursor, which is the same thing a hand does.
    if (back > 0) {
      await this.moveCaret(target, false, back, false);
      if (!this.state.isTyping) return emitted;
    }

    for (let d = 0; d < fix.wrongLen; d++) {
      await this.deleteChar(target);
      await new Promise((r) => setTimeout(r, 46 + Math.random() * 58));
    }
    await new Promise((r) => setTimeout(r, 70 + Math.random() * 130));
    for (let c = 0; c < fix.correct.length; c++) {
      await this.insertChar(target, fix.correct[c]);
      if (c < fix.correct.length - 1) {
        await new Promise((r) => setTimeout(r, this._step('repair_ms', 110)));
      }
    }
    const after = emitted + (fix.correct.length - fix.wrongLen);

    // Back to the end of what had already been typed.
    await new Promise((r) => setTimeout(r, 90 + Math.random() * 160));
    await this.moveCaret(target, true, after - (fix.startedAt + fix.correct.length), false);

    this.updateFloatingHUD();
    return after;
  }

  // Physical-keyboard neighbor substitution: a letter typed one key off.
  neighborKey(ch) {
    if (!ch || !/[a-zA-Z]/.test(ch)) return ch;
    const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
    const lower = ch.toLowerCase();
    for (const row of rows) {
      const idx = row.indexOf(lower);
      if (idx >= 0) {
        const step = Math.random() < 0.5 ? -1 : 1;
        const neighbor = row[idx + step];
        if (neighbor) return ch === ch.toUpperCase() ? neighbor.toUpperCase() : neighbor;
      }
    }
    return ch;
  }

  // Per-word realism rolls, decided when the word starts: at most one typo and
  // at most one false start per word. Rates combine the launch payload with the
  // live HUD toggles so both control paths stay effective.
  //
  // Four kinds of typo, because "wrong neighbouring key" alone reads as one
  // machine tic repeated. In real hands transposition is the most common of the
  // four, so it is weighted heaviest.
  //   substitute — the finger lands one key over        ("wprd" for "word")
  //   transpose  — two letters come out swapped         ("wrod")
  //   double     — a key repeats                        ("woord")
  //   drop       — a key does not register              ("wrd")
  //
  // Every typo is corrected before the run ends; the final document always
  // matches the source text exactly. What varies is WHEN: `fixAfter` is how
  // many more characters get typed before the typist notices and walks back.
  //
  // Two maps, not one. A typo never lands on the first letter of its word, so
  // keying it by the word start meant the loop looked it up at index
  // `wordStart` and then rejected it for having `at !== i` — every typo this
  // engine planned was thrown away unread. A 202-word run came back with zero
  // corrections in it, which is its own kind of tell.
  computeWordRolls(chars) {
    const starts = new Map();   // word start  -> { falseStart }
    const typos = new Map();    // typo index  -> typo
    const typoRate = this.config.typosEnabled ? this.state.typoRate : 0;
    const falseStartRate = this.config.falseStarts ? this.state.falseStartRate : 0;
    let inWord = false;
    let wordStart = -1;

    for (let i = 0; i <= chars.length; i++) {
      const isBoundary = i >= chars.length || chars[i] === ' ' || chars[i] === '\n';
      if (!inWord && !isBoundary) {
        inWord = true;
        wordStart = i;
      } else if (inWord && isBoundary) {
        const wordLen = i - wordStart;

        // Short words get typos too, just less often — the old length>3 gate
        // meant "a", "of" and "the" came out perfect every single time.
        const lengthWeight = wordLen > 3 ? 1 : 0.45;
        if (typoRate > 0 && wordLen >= 2 && Math.random() < typoRate * lengthWeight) {
          const typo = this.planTypo(chars, wordStart, wordLen);
          if (typo) typos.set(typo.at, typo);
        }
        if (falseStartRate > 0 && wordLen > 3 && Math.random() < falseStartRate) {
          starts.set(wordStart, { falseStart: true });
        }
        inWord = false;
      }
    }
    return { starts, typos };
  }

  // Pick one mistake inside the word starting at `wordStart`.
  // Returns { at, kind, typed, correct, fixAfter } where `typed` is what the
  // fingers produce and `correct` is what belongs there. `at` is a source
  // index; the loop consumes `correct.length` source characters at that point
  // and emits `typed` instead.
  planTypo(chars, wordStart, wordLen) {
    // Never on the first letter: a wrong first keystroke reads as a false start,
    // which is already modelled separately.
    const maxOff = Math.min(wordLen - 1, 5);
    const at = wordStart + 1 + Math.floor(Math.random() * Math.max(1, maxOff));
    const here = chars[at];
    const next = chars[at + 1];
    if (!here || here === ' ' || here === '\n') return null;

    // Noticing is not instant. Most mistakes are caught within the word or the
    // next one; a few run on longer. 0 means the fingers stop dead on it.
    const fixAfter = Math.random() < 0.18 ? 0 : 1 + Math.floor(Math.random() * 13);

    // Mix biased to the MEASURED correction shape: across 213 correction
    // events in the owner's own session every single one was ONE backspace,
    // and the longest backspace run in 2,104 characters was 1. A transposition
    // or a doubled letter repairs with TWO, so both are pushed to the margins
    // and the substitute — the one-backspace error — carries the mix.
    const roll = Math.random();
    const canTranspose = next && next !== ' ' && next !== '\n' && next !== here;
    if (roll < 0.06 && canTranspose) {
      return { at, kind: 'transpose', typed: next + here, correct: here + next, fixAfter };
    }
    if (roll < 0.80) {
      const wrong = this.neighborKey(here);
      if (wrong && wrong !== here) {
        return { at, kind: 'substitute', typed: wrong, correct: here, fixAfter };
      }
    }
    if (roll < 0.88 && /[a-z]/i.test(here)) {
      return { at, kind: 'double', typed: here + here, correct: here, fixAfter };
    }
    if (/[a-z]/i.test(here) && wordLen > 3) {
      return { at, kind: 'drop', typed: '', correct: here, fixAfter };
    }
    const wrong = this.neighborKey(here);
    return wrong && wrong !== here
      ? { at, kind: 'substitute', typed: wrong, correct: here, fixAfter }
      : null;
  }

  // ── Speed ───────────────────────────────────────────────────────────────────
  // A typist is not a metronome, and per-character jitter alone does not fix
  // that: jitter is noise around a flat line, and the flatness is what reads as
  // machine. Three things bend the line instead.
  //   drift   — a slow random walk of overall pace across the document
  //   run     — a stretch that comes out markedly faster (a phrase already in
  //             the head) or slower (hunting for the next one)
  //   digraph — "th", "he", "in" roll off the fingers; two letters on the same
  //             finger do not
  // Each returns a multiplier on the base delay, so >1 is slower.



  // Standard normal, Box-Muller. One spare is cached because the transform
  // produces two independent draws per pair of logs and we want the cheap one.

  // 09-08. Rebuilt against a GPTZero writing report for a real 2536-word essay:
  // 10,066 Docs revisions, 112 minutes of active editing, scored 93/100 human.
  // Four things in that data contradict what this function used to assume.
  //
  //   1. People type in bursts, not characters. Docs merged 1.80 characters
  //      into the average revision (40% one, 52% two), and under 1% of gaps
  //      were below 150ms. So a couple of keys land inside Docs' merge window
  //      and then the hand stops. An even stream cannot produce that.
  //   2. Boundaries are not slower, they are streakier. Median gap after a
  //      letter 336ms, after a space 441ms — 1.09x, where this used to apply
  //      3.45x. The difference is all in the tail: p90 921ms against 2354ms.
  //   3. The clock lives in that tail. The slowest 5% of gaps held 68% of the
  //      total elapsed time. A flat rate with jitter cannot make that shape, so
  //      gaps are now drawn from a log-normal rather than computed.
  //   4. Thinking happens at sentence ends. Median gap after a full stop was
  //      2526ms and after a newline 3917ms, against the 350-750ms added here.
  //
  // The author sustained 26 WPM counting every pause. `scale` maps that onto
  // whatever the slider asks for: the shape holds, the clock compresses.

    // Ask the server for this run's typing plan: one decision per character,
    // produced by the 35-parameter model in server/human_profile.py. Returns
    // null when the extension has no server or no API key — the caller treats
    // that as "cannot type" rather than falling back to a local engine.
    async fetchServerPlan(text, opts) {
      const { server, api_key } = await chrome.storage.local.get(['server', 'api_key']);
      if (!server || !api_key) return null;
      const srv = String(server).replace(/\/+$/, '');
      try {
        const res = await fetch(`${srv}/api/extension/action-stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api_key}` },
          body: JSON.stringify({
            text,
            speed: opts.speed,
            natural_pauses: opts.naturalPauses,
            jitter: opts.jitter,
            typo_rate: opts.typoRate,
            false_start_rate: opts.falseStartRate,
          }),
        });
        if (!res.ok) return null;
        return await res.json();
      } catch (e) {
        return null;
      }
    }

    // Sub-step timings for corrections, from the server plan. Falls back to the
    // fitted midpoints ONLY when a plan was fetched but predates the timing
    // block — never as a way to run without a server.
    _step(range, fallback) {
      const t = (this.serverPlan && this.serverPlan.timing) || null;
      const r = t && t[range];
      if (Array.isArray(r) && r.length === 2) return r[0] + Math.random() * (r[1] - r[0]);
      return fallback;
    }

    async startTyping(payload) {
    if (this.state.isTyping) {
      this.cancelTyping();
      await new Promise((r) => setTimeout(r, 100));
    }

    const text = String(payload.text || '').trim();
    if (!text) throw new Error('No text to type');

    const words = text.split(/\s+/).filter(Boolean);
    this.state = {
      isTyping: true,
      isPaused: false,
      text,
      currentIndex: 0,
      totalChars: text.length,
      totalWords: words.length,
      wordsTyped: 0,
      // Broad cadence gear (1.0 = the measured hand). No wpm anywhere in the
      // model; the nominal figure below exists only so the handful of older
      // helpers that still compute a delay from it keep producing sane values.
      gear: Math.max(0.55, Math.min(2.2, Number(payload.speed) || 1.0)),
      wpm: Math.max(20, Math.min(150, 46.5 / Math.max(0.55, Math.min(2.2, Number(payload.speed) || 1.0)))),
      naturalPauses: payload.naturalPauses !== false,
      jitter: payload.jitter !== false,
      typoRate: Math.max(0, Math.min(0.5, Number(payload.typoRate) || 0)),
      falseStartRate: Math.max(0, Math.min(0.5, Number(payload.falseStartRate) || 0)),
      assignmentTitle: payload.title || 'Assignment Document',
      assignmentId: payload.assignmentId || null,
      hudElement: null,
    };
    // Trusted (CDP) keystrokes are opt-in per launch: the worker only offers
    // them once it has successfully attached the debugger to this tab.
    this.trustedKeys = payload.trustedKeys === true;

    // The 35-parameter writing model lives on the SERVER now. This asks for a
    // plan — one decision per character — and the loop below plays it.
    //
    // There is deliberately no local fallback. Without a valid Helpotron API key
    // the extension cannot obtain a plan and typing does not start: the engine,
    // its cadence and its humanization are server-owned, and a client that cannot
    // reach the server has no engine to run. That is the intended property, not a
    // degradation to paper over.
    this.serverPlan = await this.fetchServerPlan(text, {
      speed: this.state.gear,
      naturalPauses: this.state.naturalPauses,
      jitter: this.state.jitter,
      typoRate: this.state.typoRate,
      falseStartRate: this.state.falseStartRate,
    });
    if (!this.serverPlan || !this.serverPlan.decisions || !this.serverPlan.decisions.length) {
      this.state.isTyping = false;
      throw new Error('Typing engine unavailable — connect Helpotron with a valid API key and try again.');
    }

      this.actionLog = [];
      this.runT0 = performance.now();
      this.logAction('run_start', {
        gear: this.state.gear, chars: text.length, words: words.length,
        cfg: { typos: this.config.typosEnabled, falseStarts: this.config.falseStarts,
               microEdits: this.config.microEdits, mouse: this.config.mouseActivity },
      });

    this.renderFloatingHUD();
    this.broadcastProgress('started');

    this.runTypingLoop();
    return this.getStatus();
  }

  async runTypingLoop() {
    const target = this.getTargetElement();
    const chars = Array.from(this.state.text);
    const { starts, typos } = this.computeWordRolls(chars);

    // `emitted` counts the characters standing in the document, which is not
    // the same as the source index once a typo has added or dropped one. The
    // caret walk is measured in emitted characters, so it is tracked separately.
    let emitted = 0;
    let pending = null;   // the one mistake currently waiting to be noticed
    let prevChar = '';

    try {
      for (let i = 0; i < chars.length; i++) {
        if (!this.state.isTyping) break;

        while (this.state.isPaused && this.state.isTyping) {
          await new Promise((r) => setTimeout(r, 200));
        }
        if (!this.state.isTyping) break;

        const char = chars[i];

        // Fix before crossing a line break — arrowing back up over a wrap is
        // not something a typist does for a one-letter slip.
        if (pending && (char === '\n' || emitted - pending.endedAt >= pending.fixAfter)) {
          emitted = await this.repairTypo(target, pending, emitted);
          pending = null;
        }

        // False start: a few keystrokes get retyped away before the word lands.
        // This one keeps its backspaces — undoing a fragment you have not
        // finished is what a false start IS.
        if (starts.get(i)) {
          const fragLen = 2 + Math.floor(Math.random() * 3);
          const frag = Array.from({ length: fragLen }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
          // Space the fragment's letters like real ones — they used to fire
          // back-to-back with no gap at all, a zero-latency burst no hand can
          // produce, which shows up directly in the speed-variance signal.
          for (const fc of frag) {
            await this.insertChar(target, fc);
            await new Promise((r) => setTimeout(r, this._step('fragment_char_ms', 110)));
          }
          await new Promise((r) => setTimeout(r, 320 + Math.random() * 420));
          for (let b = 0; b < fragLen; b++) {
            await this.deleteChar(target);
            await new Promise((r) => setTimeout(r, 44 + Math.random() * 60));
          }
          await new Promise((r) => setTimeout(r, 450 + Math.random() * 550));
        }

        // Typo: emit what the fingers produced instead of what belongs here,
        // and note where it sits so it can be repaired further down the line.
        const typo = typos.get(i);
        if (typo) {
          // Exactly one mistake may be outstanding. A second typo landing on
          // top of an unrepaired one used to overwrite the bookkeeping for the
          // first, which then stood in the finished document forever — a
          // corrupted essay, silently, with no error anywhere.
          if (pending) {
            emitted = await this.repairTypo(target, pending, emitted);
            pending = null;
          }
          for (const tc of typo.typed) {
            await this.insertChar(target, tc);
            emitted += 1;
            await new Promise((r) => setTimeout(r, this._step('fragment_char_ms', 110)));
            prevChar = tc;
          }
          pending = {
            startedAt: emitted - typo.typed.length,
            endedAt: emitted,
            wrongLen: typo.typed.length,
            correct: typo.correct,
            fixAfter: typo.fixAfter,
          };
          // The source characters this typo stood in for are now spoken for.
          i += typo.correct.length - 1;
          this.state.currentIndex = i + 1;

          if (typo.fixAfter === 0) {
            // Caught on the spot — the hands stop, then go back for it.
            await new Promise((r) => setTimeout(r, 180 + Math.random() * 340));
            emitted = await this.repairTypo(target, pending, emitted);
            pending = null;
          }
          continue;
        }

        // Time the keystroke. In Docs the dispatch is not free — the editor
        // relays out its canvas before it returns — and that cost has to come
        // out of the gap, not be added to it.
        const spentAt = performance.now();
        await this.insertChar(target, char);
        const spent = performance.now() - spentAt;
        emitted += 1;
        this.state.currentIndex = i + 1;

        if (char === ' ' || char === '\n' || i === chars.length - 1) {
          const typedSoFar = chars.slice(0, i + 1).join('');
          this.state.wordsTyped = typedSoFar.split(/\s+/).filter(Boolean).length;
        }

        if (this.state.naturalPauses && this.state.wordsTyped > 0 && this.state.wordsTyped % 75 === 0 && char === ' ') {
          this.updateFloatingHUD('Thinking…');
          await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
        }

        if (i % 3 === 0 || char === ' ' || char === '\n' || i === chars.length - 1) {
          this.updateFloatingHUD();
          this.broadcastProgress('typing');
        }

        // The decision for this character comes from the SERVER plan, indexed
        // by position. The model that produced it (server/human_profile.py) is
        // the 35-parameter engine ported out of this file, so the rhythm is
        // unchanged — but it can now be tuned by a deploy instead of a Chrome
        // Web Store review, and a modified client cannot run a different one.
        const atWordEnd = (char === ' ' || char === '\n');
        const decision = this.serverPlan.decisions[i] || { action: 'type', delay: 80 };

        // Physical drift pre-empts the keystroke: the hand leaves the keys for
        // a moment. This is the one behaviour category a stream that only ever
        // appends cannot produce.
        if (decision.action === 'mouse' && this.config && this.config.mouseActivity !== false) {
          await this.humanMouseWander(target, decision);
        } else if (decision.action === 'reread' && !pending
                   && this.config && this.config.microEdits !== false) {
          emitted = await this.microEditPass(target, chars, i + 1, emitted, decision);
        } else if (decision.action === 'nudge') {
          // A caret nudge with no edit — the writer moves without changing text.
          for (let n = 0; n < 1 + Math.floor(Math.random() * 3); n++) {
            await this.dispatchKey(target, 'ArrowLeft', 37, false);
            await new Promise((r) => setTimeout(r, 60 + Math.random() * 180));
          }
          await new Promise((r) => setTimeout(r, 80 + Math.random() * 240));
          for (let n = 0; n < 1 + Math.floor(Math.random() * 3); n++) {
            await this.dispatchKey(target, 'ArrowRight', 39, false);
            await new Promise((r) => setTimeout(r, 60 + Math.random() * 180));
          }
        }

        prevChar = char;
        // Sleep the REMAINDER of the gap. If Docs already burned more than the
        // whole budget, yield and move on rather than falling further behind.
        await new Promise((r) => setTimeout(r, Math.max(4, decision.delay - spent)));
      }

      // Nothing is left standing wrong, whatever the text ended on.
      if (pending && this.state.isTyping) {
        emitted = await this.repairTypo(target, pending, emitted);
        pending = null;
      }

      if (this.state.isTyping) {
        this.state.isTyping = false;
        this.state.isPaused = false;
        this.updateFloatingHUD('Completed ✨');
        this.broadcastProgress('completed');
        setTimeout(() => this.removeFloatingHUD(), 5000);
      }
      this.releaseTrustedKeys();
    } catch (err) {
      console.error('[Helpotron Assistive Typing Error]', err);
      this.state.isTyping = false;
      this.updateFloatingHUD('Error occurred');
      this.broadcastProgress('error', String(err));
      this.releaseTrustedKeys();
    }
  }

  // Tell the worker the trusted-key session is over so it detaches the
  // debugger. A leaked attach locks DevTools on the tab until it closes.
  releaseTrustedKeys() {
    if (!this.trustedKeys) return;
    this.trustedKeys = false;
    try {
      chrome.runtime.sendMessage({ type: 'helpotron-cdp-detach' }).catch(() => {});
    } catch (e) {}
  }

  pauseTyping() {
    if (this.state.isTyping && !this.state.isPaused) {
      this.state.isPaused = true;
      this.updateFloatingHUD('Paused ⏸');
      this.broadcastProgress('paused');
    }
  }

  resumeTyping() {
    if (this.state.isTyping && this.state.isPaused) {
      this.state.isPaused = false;
      this.updateFloatingHUD('Resuming… ▶');
      this.broadcastProgress('resumed');
    }
  }

  cancelTyping() {
    this.state.isTyping = false;
    this.state.isPaused = false;
    this.updateFloatingHUD('Cancelled ⏹');
    this.broadcastProgress('cancelled');
    this.releaseTrustedKeys();
    setTimeout(() => this.removeFloatingHUD(), 1500);
  }

  broadcastProgress(status, error = null) {
    const data = {
      action: 'TYPING_PROGRESS',
      status,
      error,
      ...this.getStatus(),
    };
    try {
      chrome.runtime.sendMessage(data).catch(() => {});
    } catch (e) {}
    try {
      window.postMessage({ type: 'HELPOTRON_TYPING_PROGRESS', payload: data }, '*');
    } catch (e) {}
  }

  renderFloatingHUD() {
    this.removeFloatingHUD();
    this.injectCrossTabHUD();
  }

  removeFloatingHUD() {
    const el = this.state.hudElement || this.hudElement || document.getElementById('helpotron-assistive-hud');
    if (el) { try { el.remove(); } catch (e) { /* ok */ } }
    this.state.hudElement = null;
    this.hudElement = null;
  }

  // Rich HUD card (drag bar, controls, realism drawer, drop zone). Built once
  // per typing run into a container appended to the page; wireHUDEvents() binds
  // its buttons after injection.
  injectCrossTabHUD() {
    const container = document.createElement('div');
    container.id = 'helpotron-assistive-hud';
    container.innerHTML = `
      <div id="hud-card" style="
        background: rgba(15, 23, 42, 0.92);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(139, 92, 246, 0.35);
        border-radius: 14px;
        box-shadow: 0 10px 32px -4px rgba(0, 0, 0, 0.6), 0 0 16px rgba(139, 92, 246, 0.25);
        width: 310px;
        overflow: hidden;
      ">
        <!-- Header / Drag Bar -->
        <div id="hud-header" style="
          padding: 10px 14px;
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.25), rgba(30, 41, 59, 0.6));
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: move;
          user-select: none;
        ">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981;"></span>
            <span style="font-size: 11px; font-weight: 700; color: #c4b5fd; letter-spacing: 0.5px; text-transform: uppercase;">Assistive Typing</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <button id="hud-btn-settings" title="Realism Settings" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 12px; padding: 2px 4px;">⚙️</button>
            <button id="hud-btn-collapse" title="Collapse" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 12px; padding: 2px 4px;">−</button>
            <button id="hud-btn-close" title="Close" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 12px; padding: 2px 4px;">✕</button>
          </div>
        </div>

        <!-- Body Content -->
        <div id="hud-body" style="padding: 14px;">
          <div style="font-size: 12px; font-weight: 600; color: #f1f5f9; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" id="hud-title">
            Document Ready
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-bottom: 8px;">
            <span id="hud-target-badge" style="background: rgba(139, 92, 246, 0.15); color: #c4b5fd; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 10px;">Google Docs</span>
            <span id="hud-wpm-badge" style="color: #a78bfa; font-weight: 600;">65 WPM</span>
          </div>

          <!-- Progress Bar -->
          <div style="background: rgba(255, 255, 255, 0.08); height: 6px; border-radius: 3px; overflow: hidden; margin-bottom: 8px;">
            <div id="hud-progress-fill" style="background: linear-gradient(90deg, #8b5cf6, #06b6d4); width: 0%; height: 100%; transition: width 0.2s ease;"></div>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 10px; color: #64748b; font-family: monospace; margin-bottom: 12px;">
            <span id="hud-pct">0%</span>
            <span id="hud-words">0 / 0 words</span>
            <span id="hud-eta">ETA: --</span>
          </div>

          <!-- Controls -->
          <div style="display: flex; gap: 8px;">
            <button id="hud-btn-toggle" style="flex: 1; padding: 7px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; background: #7c3aed; color: #fff; border: 1px solid rgba(139, 92, 246, 0.4); transition: all 0.15s;">
              ⏸ Pause
            </button>
            <button id="hud-btn-cancel" style="padding: 7px 12px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); transition: all 0.15s;">
              ⏹ Stop
            </button>
          </div>

          <!-- File Drag-and-Drop Zone -->
          <div id="hud-drop-zone" style="margin-top: 10px; padding: 8px; border: 1px dashed rgba(139, 92, 246, 0.4); border-radius: 8px; text-align: center; font-size: 10px; color: #94a3b8; background: rgba(139, 92, 246, 0.05); cursor: pointer;">
            📄 Drop .txt / .md file to type into doc
          </div>

          <!-- Realism Controls Drawer -->
          <div id="hud-settings-drawer" style="display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 10px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span>Speed:</span> <b id="hud-slider-wpm-val">65 WPM</b>
            </div>
            <input type="range" id="hud-slider-wpm" min="25" max="130" value="65" style="width: 100%; margin-bottom: 8px;">

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 6px;">
              <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                <input type="checkbox" id="hud-chk-pauses" checked> Pauses
              </label>
              <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                <input type="checkbox" id="hud-chk-jitter" checked> Jitter Rhythm
              </label>
              <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                <input type="checkbox" id="hud-chk-typos" checked> Typos & Fix
              </label>
              <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                <input type="checkbox" id="hud-chk-falsestarts" checked> False Starts
              </label>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    this.hudElement = container;
    this.state.hudElement = container; // keep both holders in sync: startTyping()
    // zeroes state.hudElement and updateFloatingHUD/updateHUD read different
    // fields (merge artifact), which silently froze the HUD at its first paint.
    this.wireHUDEvents();
    this.updateHUD();
  }

  // Live status updates for the injected HUD. Never rebuilds or hides the
  // card: 'Thinking…' / 'Completed ✨' / 'Paused ⏸' / 'Resuming… ▶' /
  // 'Cancelled ⏹' land in the card title on top of the normal per-char
  // progress refresh (updateHUD()).
  updateFloatingHUD(customStatus = null) {
    const hud = this.hudElement || this.state.hudElement;
    if (!hud) return;
    this.updateHUD();
    const titleEl = hud.querySelector('#hud-title');
    if (titleEl) {
      titleEl.textContent = customStatus || (this.state.isPaused ? 'Paused' : `Typing at ${this.state.wpm} WPM…`);
      titleEl.style.color = customStatus ? '#fde047' : '#f1f5f9';
    }
    const toggleBtn = hud.querySelector('#hud-btn-toggle');
    if (toggleBtn) toggleBtn.textContent = this.state.isPaused ? '▶ Resume' : '⏸ Pause';
  }

  wireHUDEvents() {
    if (!this.hudElement) return;

    // Draggable functionality
    const header = this.hudElement.querySelector('#hud-header');
    let isDragging = false;
    let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.hudElement.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      this.hudElement.style.bottom = 'auto';
      this.hudElement.style.right = 'auto';
      this.hudElement.style.left = `${initialLeft}px`;
      this.hudElement.style.top = `${initialTop}px`;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this.hudElement.style.left = `${initialLeft + dx}px`;
      this.hudElement.style.top = `${initialTop + dy}px`;
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    // Buttons
    this.hudElement.querySelector('#hud-btn-close').addEventListener('click', () => {
      this.hudElement.style.display = 'none';
    });

    const collapseBtn = this.hudElement.querySelector('#hud-btn-collapse');
    const bodyEl = this.hudElement.querySelector('#hud-body');
    collapseBtn.addEventListener('click', () => {
      this.hudCollapsed = !this.hudCollapsed;
      bodyEl.style.display = this.hudCollapsed ? 'none' : 'block';
      collapseBtn.textContent = this.hudCollapsed ? '+' : '−';
    });

    const settingsBtn = this.hudElement.querySelector('#hud-btn-settings');
    const drawerEl = this.hudElement.querySelector('#hud-settings-drawer');
    settingsBtn.addEventListener('click', () => {
      drawerEl.style.display = drawerEl.style.display === 'none' ? 'block' : 'none';
    });

    const toggleBtn = this.hudElement.querySelector('#hud-btn-toggle');
    toggleBtn.addEventListener('click', () => {
      if (this.state.isPaused) {
        this.resumeTyping();
      } else {
        this.pauseTyping();
      }
    });

    this.hudElement.querySelector('#hud-btn-cancel').addEventListener('click', () => {
      this.cancelTyping();
    });

    // Realism Controls Listeners
    const wpmSlider = this.hudElement.querySelector('#hud-slider-wpm');
    const wpmVal = this.hudElement.querySelector('#hud-slider-wpm-val');
    wpmSlider.value = this.config.wpm || 65;
    wpmVal.textContent = `${wpmSlider.value} WPM`;
    wpmSlider.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      this.config.wpm = v;
      this.state.wpm = Math.max(20, Math.min(150, v)); // live: affects the running loop
      wpmVal.textContent = `${v} WPM`;
      this.saveConfig();
      this.updateHUD();
    });

    const hudChkPauses = this.hudElement.querySelector('#hud-chk-pauses');
    const hudChkJitter = this.hudElement.querySelector('#hud-chk-jitter');
    const hudChkTypos = this.hudElement.querySelector('#hud-chk-typos');
    const hudChkFalseStarts = this.hudElement.querySelector('#hud-chk-falsestarts');
    hudChkPauses.checked = this.config.punctuationPauses !== false;
    hudChkJitter.checked = this.config.jitter !== false;
    hudChkTypos.checked = this.config.typosEnabled !== false;
    hudChkFalseStarts.checked = this.config.falseStarts !== false;
    hudChkPauses.addEventListener('change', (e) => {
      this.config.punctuationPauses = e.target.checked;
      this.config.thinkingBreaks = e.target.checked;
      this.saveConfig();
    });
    hudChkJitter.addEventListener('change', (e) => {
      this.config.jitter = e.target.checked;
      this.saveConfig();
    });
    hudChkTypos.addEventListener('change', (e) => {
      this.config.typosEnabled = e.target.checked;
      this.saveConfig();
    });
    hudChkFalseStarts.addEventListener('change', (e) => {
      this.config.falseStarts = e.target.checked;
      this.saveConfig();
    });

    // File Drop Zone
    const dropZone = this.hudElement.querySelector('#hud-drop-zone');
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#a78bfa';
      dropZone.style.background = 'rgba(139, 92, 246, 0.15)';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'rgba(139, 92, 246, 0.4)';
      dropZone.style.background = 'rgba(139, 92, 246, 0.05)';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'rgba(139, 92, 246, 0.4)';
      dropZone.style.background = 'rgba(139, 92, 246, 0.05)';
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        const reader = new FileReader();
        reader.onload = (re) => {
          const text = re.target.result;
          this.startTyping({ text, title: file.name });
        };
        reader.readAsText(file);
      }
    });
  }

  showHUD() {
    if (!this.hudElement) this.injectCrossTabHUD();
    if (this.hudElement) this.hudElement.style.display = 'block';
  }

  updateHUD() {
    if (!this.hudElement) return;

    const status = this.getStatus(); // -> { percentage, currentIndex, totalChars, wpm, … }
    const titleEl = this.hudElement.querySelector('#hud-title');
    const badgeEl = this.hudElement.querySelector('#hud-wpm-badge');
    const targetBadgeEl = this.hudElement.querySelector('#hud-target-badge');
    const fillEl = this.hudElement.querySelector('#hud-progress-fill');
    const pctEl = this.hudElement.querySelector('#hud-pct');
    const wordsEl = this.hudElement.querySelector('#hud-words');
    const etaEl = this.hudElement.querySelector('#hud-eta');
    const toggleBtn = this.hudElement.querySelector('#hud-btn-toggle');

    // ETA is display-only — derived here (getStatus() has no such field; the
    // old code read status.progressPct/status.remainingSeconds which never
    // existed, so the HUD showed "undefined%" / "ETA: undefineds").
    const remainingChars = Math.max(0, (this.state.totalChars || 0) - (this.state.currentIndex || 0));
    const remainingSeconds = this.state.wpm > 0 && this.state.totalChars > 0
      ? Math.ceil(remainingChars / (this.state.wpm / 60))
      : 0;

    if (titleEl) titleEl.textContent = this.state.assignmentTitle || 'Document';
    if (badgeEl) badgeEl.textContent = `${this.config.wpm} WPM`;
    if (targetBadgeEl) {
      const appMap = { gdocs: 'Google Docs', gmail: 'Gmail', notion: 'Notion', word_online: 'Word Online', universal: 'Text Field' };
      targetBadgeEl.textContent = appMap[this.state.targetApp] || 'Editor';
    }
    if (fillEl) fillEl.style.width = `${status.percentage}%`;
    if (pctEl) pctEl.textContent = `${status.percentage}%`;
    if (wordsEl) wordsEl.textContent = `${status.wordsTyped} / ${status.totalWords} w`;
    if (etaEl) etaEl.textContent = `ETA: ${remainingSeconds}s`;

    if (toggleBtn) {
      if (this.state.isPaused) {
        toggleBtn.textContent = '▶ Resume';
        toggleBtn.style.background = '#059669';
      } else {
        toggleBtn.textContent = '⏸ Pause';
        toggleBtn.style.background = '#7c3aed';
      }
    }
  }

  renderThinkingPulse(active) {
    if (!this.hudElement) return;
    const titleEl = this.hudElement.querySelector('#hud-title');
    if (titleEl) {
      if (active) {
        titleEl.textContent = '🤔 Natural cognitive break…';
        titleEl.style.color = '#fde047';
      } else {
        titleEl.textContent = this.state.assignmentTitle || 'Document';
        titleEl.style.color = '#f1f5f9';
      }
    }
  }

  renderCompletionNotice() {
    if (!this.hudElement) return;
    const titleEl = this.hudElement.querySelector('#hud-title');
    if (titleEl) {
      titleEl.textContent = '✨ Assistive typing complete!';
      titleEl.style.color = '#34d399';
    }
  }
}

// Instantiate and attach
// (08-31 fix: 871ef58 renamed the class to GoogleDocsAssistiveTypingEngine
// but the instantiation still referenced the vanished UnifiedAssistiveTypingEngine
// — ReferenceError at load, so the whole content script never registered its
// listeners and extension-path typing was dead. window handle kept for compat.)
if (!window.__helpotron_unified_typing_engine) {
  window.__helpotron_unified_typing_engine = new GoogleDocsAssistiveTypingEngine();
}

// ═════════════════════════════════════════════════════════════════════════════
// ── Web App PostMessage Bridge (for localhost / helpotron web app) ──────────
// ═════════════════════════════════════════════════════════════════════════════
if (
  !window.__helpotron_webapp_bridge__ &&
  (window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.includes('helpotron'))
) {
  window.__helpotron_webapp_bridge__ = true; // idempotency guard (see BATCH-08 note)
  window.__helpotron_extension_installed = true;
  window.postMessage({ type: 'HELPOTRON_EXTENSION_READY', version: '2.2.0' }, '*');

  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || !event.data.type) return;

    if (event.data.type === 'HELPOTRON_PING') {
      window.postMessage({
        type: 'HELPOTRON_PONG',
        version: '2.2.0',
        capabilities: ['scrape', 'agent', 'launch_to_doc', 'dripwriter_api', 'nine_realism_controls', 'cross_tab_hud'],
      }, '*');
    } else if (event.data.type === 'HELPOTRON_GET_GDOCS_TABS') {
      try {
        chrome.runtime.sendMessage({ action: 'getGDocsTabs' }, (resp) => {
          window.postMessage({
            type: 'HELPOTRON_GDOCS_TABS_RESULT',
            requestId: event.data.requestId,
            tabs: (resp && resp.tabs) || [],
            error: resp && resp.error,
          }, '*');
        });
      } catch (err) {
        window.postMessage({
          type: 'HELPOTRON_GDOCS_TABS_RESULT',
          requestId: event.data.requestId,
          tabs: [],
          error: String(err),
        }, '*');
      }
    } else if (event.data.type === 'HELPOTRON_LAUNCH_TO_DOC') {
      try {
        chrome.runtime.sendMessage({
          action: 'launchToDoc',
          payload: event.data.payload,
        }, (resp) => {
          window.postMessage({
            type: 'HELPOTRON_LAUNCH_TO_DOC_RESULT',
            requestId: event.data.requestId,
            result: resp,
          }, '*');
        });
      } catch (err) {
        window.postMessage({
          type: 'HELPOTRON_LAUNCH_TO_DOC_RESULT',
          requestId: event.data.requestId,
          result: { ok: false, error: String(err) },
        }, '*');
      }
    } else if (event.data.type === 'HELPOTRON_CONTROL_TYPING') {
      try {
        const action = event.data.action === 'pause' ? 'pauseTyping'
                     : event.data.action === 'resume' ? 'resumeTyping'
                     : 'cancelTyping';
        chrome.runtime.sendMessage({
          action,
          tabId: event.data.tabId,
        }, (resp) => {
          window.postMessage({
            type: 'HELPOTRON_CONTROL_TYPING_RESULT',
            requestId: event.data.requestId,
            result: resp,
          }, '*');
        });
      } catch (err) {
        window.postMessage({
          type: 'HELPOTRON_CONTROL_TYPING_RESULT',
          requestId: event.data.requestId,
          result: { ok: false, error: String(err) },
        }, '*');
      }
      } else if (event.data.type === 'HELPOTRON_SESSION_HANDOFF') {
        // The web app used to hand its login session to the extension here,
        // because the MV3 popup cannot load the Turnstile script and so could not
        // log in itself.
        //
        // That is gone: the extension authenticates with a user-issued API key
        // and holds no session at all. A `session_token` is not a credential for
        // it any more, so accepting one would be storing something the extension
        // never uses. Answered for compatibility and deliberately ignored —
        // remove this branch once no shipped page posts it.
        try {
          window.postMessage({
            type: 'HELPOTRON_SESSION_HANDOFF_RESULT',
            requestId: event.data.requestId,
            result: {
              ok: false,
              error: 'The extension connects with an API key now — create one at Settings → API Keys.',
            },
          }, '*');
        } catch (err) { /* nothing to report to */ }
      }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.action === 'BROADCAST_TYPING_PROGRESS') {
      window.postMessage({
        type: 'HELPOTRON_TYPING_PROGRESS',
        payload: msg,
      }, '*');
    }
  });
}

// ── Agent Mode (09-01): user-activity interrupt reporter (additive) ──────────
// Appended as a fully isolated IIFE with only try/catch-guarded chrome.* calls,
// so nothing in this file can break it and it cannot break the file.
//
// Protocol with agent_mode.js (the drive window):
//   {type:'agent-drive', mode:'arm'|'window'|'disarm', active:boolean}
// Any 'agent-drive' message with active=true masks interrupts: while the agent
// is driving, the user's incidental mouse motion must NOT pause it. The first
// genuine user gesture AFTER the drive window (disarm) fires:
//   {type:'agent:user-interrupt'}
// throttled to one per 500 ms (spec). Synthetic events (dispatchEvent) are
// isTrusted:false, so the agent's own DOM-dispatched clicks/keys/moves cannot
// self-interrupt. Note this does NOT cover the CDP path: Input.dispatchMouseEvent
// / Input.dispatchKeyEvent go through the real input pipeline and ARE trusted
// (measured), which is why the drive window is masked while a burst is running.
(function () {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;
    if (window.__helpotron_agent_drive__) return; // idempotency guard (see BATCH-08 note)
    window.__helpotron_agent_drive__ = true;

    let driveArmed = false;          // masked window (agent is driving)
    let lastInterruptAt = 0;         // ms epoch of the last sent interrupt
    const INTERRUPT_THROTTLE_MS = 500;

    chrome.runtime.onMessage.addListener((msg) => {
      try {
        if (!msg || msg.type !== 'agent-drive') return;
        driveArmed = !!msg.active;
      } catch (ignored) { /* never propagate listener errors */ }
    });

    const reportInterrupt = (ev) => {
      try {
        if (!ev.isTrusted) return;       // CDP/synthetic events never interrupt
        if (driveArmed) return;          // inside the drive window: masked
        const now = Date.now();
        if (now - lastInterruptAt < INTERRUPT_THROTTLE_MS) return;
        lastInterruptAt = now;
        chrome.runtime.sendMessage({ type: 'agent:user-interrupt' }, () => {
          void chrome.runtime.lastError; // swallow "receiving end does not exist"
        });
      } catch (ignored) { /* ok */ }
    };

    const onMove = (ev) => reportInterrupt(ev);
    const onDown = (ev) => reportInterrupt(ev);
    const onWheel = (ev) => reportInterrupt(ev);
    const onKey = (ev) => reportInterrupt(ev);

    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mousedown', onDown, { passive: true });
    document.addEventListener('wheel', onWheel, { passive: true });
    document.addEventListener('keydown', onKey);
  } catch (ignored) { /* file-level guard: never throw at parse time either */ }
})();
