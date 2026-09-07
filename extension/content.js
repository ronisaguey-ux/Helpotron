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

function detectPlatform() {
  const host = window.location.hostname.toLowerCase();
  const path = window.location.pathname.toLowerCase();
  if (host.includes('instructure.com') || host.includes('canvas')) return 'canvas';
  if (host.includes('classroom.google.com')) return 'google_classroom';
  if (host.includes('blackboard') || host.includes('bb.') || path.includes('/webapps/blackboard')) return 'blackboard';
  if (host.includes('brightspace') || host.includes('d2l')) return 'brightspace';
  if (host.includes('moodle') || path.includes('/mod/assign/')) return 'moodle';
  if (host.includes('schoology')) return 'schoology';
  if (host.includes('docs.google.com')) return 'google_docs';
  if (host.includes('notion.so') || host.includes('notion.site')) return 'notion';
  return 'generic';
}

// ── Course context + subject attribution (08-28) ─────────────────────────────
// The scraped page's LMS identity must reach the server so the material lands
// in the RIGHT assignment bubble: the Canvas course id is the dedupe scope and
// the course/subject name is how the bubble gets its topic.

// Client-side mirror of the server's keyword classifier. Course names are the
// best signal ("Algebra 2 Honors Topic 1 Packet" -> Mathematics).
var SUBJECT_HINTS = [
  ['Mathematics', ['algebra', 'geometry', 'calculus', 'trig', 'trigonometr', 'statistic', 'equation', 'theorem', 'linear', 'quadratic', 'function', 'probability', 'arithmetic', 'math', 'integral', 'derivative', 'exponential', 'logarithm']],
  ['Biology', ['cell', 'dna', 'genetics', 'organism', 'biology', 'evolution', 'crispr', 'photosynthesis', 'ecosystem', 'bacteria', 'mitochondria']],
  ['Chemistry', ['chemistry', 'chemical', 'molecule', 'atom', 'compound', 'reaction', 'acid', 'periodic']],
  ['Physics', ['physics', 'motion', 'force', 'kinematics', 'newton', 'velocity', 'acceleration', 'gravity', 'electricity', 'magnet']],
  ['Computer Science', ['algorithm', 'code', 'programming', 'data structure', 'python', 'machine learning', 'neural', 'ap csp', 'apcsp', 'computer science', 'java']],
  ['History', ['history', 'reconstruction', 'civil war', 'president', 'ancient', 'revolution', 'empire', 'world war', 'century', 'antebellum', 'columbian']],
  ['Literature', ['novel', 'literature', 'poem', 'woolf', 'faulkner', 'narrative', 'modernist', 'english literature', 'shakespeare', 'poetry']],
  ['English', ['english', 'grammar', 'essay', 'vocabulary', 'reading', 'writing', 'rhetoric']],
  ['Economics', ['economic', 'inflation', 'gdp', 'macroeconomic', 'microeconomic', 'monetary', 'supply', 'demand', 'market']],
  ['Ethics', ['ethics', 'ethical', 'moral', 'autonomous systems']],
  ['Psychology', ['cognitive', 'behavior', 'psychology', 'bias', 'decision']],
  ['Spanish', ['spanish', 'espanol', 'español', 'conjugat', 'vocabulario']],
  ['French', ['french', 'francais', 'français']],
  ['Health', ['health', 'nutrition', 'p.e.', 'physical education', 'wellness']],
];

function classifySubject(text) {
  const lower = (text || '').toLowerCase();
  for (const [subj, keys] of SUBJECT_HINTS) {
    for (const k of keys) {
      // Word-START boundary so substrings never false-positive:
      // "miscellaneous" must not match the 'cell' keyword.
      const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp('(?:^|[\\s\\W])' + esc).test(lower)) return subj;
    }
  }
  return '';
}

// Canvas URL shapes: /courses/123/assignments/456 (/quizzes/…, /pages/x, /discussion_topics/…,
// /modules/items/…). Returns {courseId, itemId, itemKind} or nulls outside a course page.
function parseCourseUrl(url) {
  try {
    const u = new URL(url);
    // ORDERING TRAP: 'modules/items' MUST precede 'modules' in the alternation.
    // The regex engine takes the FIRST alternative whose remainder matches, so
    // with 'modules' first, /courses/1/modules/items/44 parses as kind='modules',
    // itemId='items' (regex stops at \/items) — every module item collapsed onto
    // ONE wrong canvas_id ('c1:modules:items'), breaking subject pairing/dedupe.
    const m = u.pathname.match(/^\/courses\/(\d+)\/(assignments|quizzes|pages|discussion_topics|modules\/items|modules|files)\/([^/?#]+)/);
    if (!m) {
      const c = u.pathname.match(/^\/courses\/(\d+)/);
      return { courseId: c ? c[1] : '', itemId: '', itemKind: '', courseUrl: c ? u.origin + c[0] : '' };
    }
    return { courseId: m[1], itemKind: m[2], itemId: decodeURIComponent(m[3]), courseUrl: new URL(`/courses/${m[1]}`, u.origin).href };
  } catch { return { courseId: '', itemId: '', itemKind: '', courseUrl: '' }; }
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
  const { courseId, itemId, itemKind, courseUrl } = parseCourseUrl(window.location.href);
  const courseName = getCourseName();
  // Subject from the COURSE name first (most reliable), then the page title.
  let subject = classifySubject(courseName);
  if (!subject) subject = classifySubject(document.title || '');
  let courseCode = subject ? subject.split(' ')[0].slice(0, 4).toUpperCase() + '-101' : '';
  return {
    platformOrigin: 'canvas',
    courseId,
    itemId,
    itemKind,
    courseUrl,
    courseName,
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

function scrapeAssignmentUniversal() {
  const platform = detectPlatform();
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
      result = scrapeGeneric();
      break;
  }

  result.platform = platform;
  result.url = window.location.href;
  result.scraped_at = new Date().toISOString();
  // LMS identity + topic (08-28): server-side bubble attribution depends on it.
  result.meta = scrapeCourseContext();
  return result;
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
  const prompt = promptEl ? capScrapeText(promptEl.innerText || '') : '';

  const rubrics = Array.from(document.querySelectorAll('.rubric_criterion, .rubric-criterion, table.rubric'))
    .map((e) => e.innerText.trim())
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
    ? capScrapeText(promptEl.innerText || '')
    : (document.body ? capScrapeText(document.body.innerText || '') : '');

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
  const prompt = promptEl?.innerText?.trim() || '';

  const rubrics = Array.from(document.querySelectorAll('.rubric-table, table[summary*="Rubric"]'))
    .map((e) => e.innerText.trim())
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
  const prompt = promptEl?.innerText?.trim() || '';

  const rubrics = Array.from(document.querySelectorAll('.d2l-rubric, d2l-rubric'))
    .map((e) => e.innerText.trim())
    .join('\n---\n');

  return { title, dueDate: '', prompt, rubric: rubrics, files: extractAllFileLinks() };
}

function scrapeMoodle() {
  const title =
    document.querySelector('.activity-header h2, .page-header-headings h1, h1')?.innerText?.trim() ||
    document.title.trim() ||
    'Untitled Moodle Assignment';

  const promptEl = document.querySelector('.activity-description, #intro, .box.py-3.generalbox');
  const prompt = promptEl?.innerText?.trim() || '';

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
    ? capScrapeText(mainEl.innerText || '')
    : capScrapeText(bodyText);

  // Extract tables that resemble rubrics
  const rubrics = Array.from(document.querySelectorAll('table'))
    .filter((tbl) => {
      const text = tbl.innerText.toLowerCase();
      return text.includes('rubric') || text.includes('criteria') || text.includes('points') || text.includes('grade');
    })
    .map((t) => t.innerText.trim())
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
  const base = (typeof scrapeAssignmentUniversal === 'function') ? scrapeAssignmentUniversal() : null;
  if (!base) return null;
  if ((base.prompt || '').trim().length < 200) {
    const main = document.querySelector('article, main, #main-content, #content, .assignment, .post-content, .user_content');
    const altText = (main ? main.innerText : '') || document.body.innerText || '';
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
    const data = (typeof scrapeAssignmentUniversal === 'function')
      ? scrapeAssignmentUniversal()
      : null;
    sendResponse({ success: !!data, assignment: data || null });
  } else if (request && request.action === 'DEEP_SCRAPE_CURRENT_ASSIGNMENT') {
    deepScrapeUniversal().then((data) => sendResponse({ success: !!data, assignment: data || null }));
    return true;
  } else if (request && request.action === 'COLLECT_COURSE_LINKS') {
    sendResponse(collectCourseLinks());
  } else if (request && request.action) {
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
      typoRate: 0.02,
      falseStartRate: 0.015,
      assignmentTitle: '',
      assignmentId: null,
      hudElement: null,
    };
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
      return iframe.contentDocument.body;
    }
    // 2. Generic contenteditable
    const editable = document.querySelector('div[contenteditable="true"], [contenteditable="true"]');
    if (editable) {
      editable.focus();
      return editable;
    }
    return document.activeElement || document.body;
  }

  async insertChar(target, char) {
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

    try {
      document.execCommand('insertText', false, char);
    } catch (e) {}

    try {
      const inputEvent = new InputEvent('input', {
        inputType: 'insertText',
        data: char,
        bubbles: true,
      });
      target.dispatchEvent(inputEvent);
    } catch (e) {}

    const keyup = new KeyboardEvent('keyup', { key: char, code: `Key${char.toUpperCase()}`, keyCode, which: keyCode, bubbles: true, cancelable: true });
    target.dispatchEvent(keyup);
  }

  async deleteChar(target) {
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

  // Per-word realism rolls: at most one neighbour typo and/or one false start
  // per word, decided when the word starts (same semantics as the server's
  // HumanizedTypingSimulator). Rates combine the launch payload with the live
  // HUD toggles so both control paths stay effective.
  computeWordRolls(chars) {
    const rolls = new Map();
    let inWord = false;
    let wordStart = -1;
    for (let i = 0; i <= chars.length; i++) {
      const isBoundary = i >= chars.length || chars[i] === ' ' || chars[i] === '\n';
      if (!inWord && !isBoundary) {
        inWord = true;
        wordStart = i;
      } else if (inWord && isBoundary) {
        const wordLen = i - wordStart;
        const roll = { typoAt: -1, wrongChar: '', falseStart: false };
        if (wordLen > 3) {
          const typoRate = this.config.typosEnabled ? this.state.typoRate : 0;
          const falseStartRate = this.config.falseStarts ? this.state.falseStartRate : 0;
          if (typoRate > 0 && Math.random() < typoRate) {
            const off = 1 + Math.floor(Math.random() * Math.min(wordLen - 1, 4));
            roll.typoAt = wordStart + off;
            roll.wrongChar = this.neighborKey(chars[roll.typoAt]);
          }
          if (falseStartRate > 0 && Math.random() < falseStartRate) {
            roll.falseStart = true;
          }
        }
        rolls.set(wordStart, roll);
        inWord = false;
      }
    }
    return rolls;
  }

  calculateDelay(char, nextChar, wpm, usePauses, useJitter) {
    const baseDelay = Math.max(30, Math.round(12000 / Math.max(20, wpm)));
    let delay = baseDelay;

    if (useJitter) {
      const jitterFactor = 0.65 + Math.random() * 0.70;
      delay = Math.round(delay * jitterFactor);
    }

    if (usePauses) {
      if (char === ' ') {
        delay += Math.floor(70 + Math.random() * 110);
      } else if (['.', '!', '?'].includes(char)) {
        delay += Math.floor(350 + Math.random() * 400);
      } else if ([',', ';', ':', '-'].includes(char)) {
        delay += Math.floor(150 + Math.random() * 150);
      } else if (char === '\n') {
        delay += Math.floor(600 + Math.random() * 500);
      }
    }

    return delay;
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
      wpm: Math.max(20, Math.min(150, Number(payload.wpm) || 65)),
      naturalPauses: payload.naturalPauses !== false,
      jitter: payload.jitter !== false,
      typoRate: Math.max(0, Math.min(0.5, Number(payload.typoRate) || 0)),
      falseStartRate: Math.max(0, Math.min(0.5, Number(payload.falseStartRate) || 0)),
      assignmentTitle: payload.title || 'Assignment Document',
      assignmentId: payload.assignmentId || null,
      hudElement: null,
    };

    this.renderFloatingHUD();
    this.broadcastProgress('started');

    this.runTypingLoop();
    return this.getStatus();
  }

  async runTypingLoop() {
    const target = this.getTargetElement();
    const chars = Array.from(this.state.text);
    const rolls = this.computeWordRolls(chars);

    try {
      for (let i = 0; i < chars.length; i++) {
        if (!this.state.isTyping) break;

        while (this.state.isPaused && this.state.isTyping) {
          await new Promise((r) => setTimeout(r, 200));
        }
        if (!this.state.isTyping) break;

        const char = chars[i];
        const nextChar = chars[i + 1] || '';
        const roll = rolls.get(i);

        // False start: a few keystrokes get retyped away before the word lands.
        if (roll && roll.falseStart) {
          const fragLen = 2 + Math.floor(Math.random() * 3);
          const frag = Array.from({ length: fragLen }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
          for (const fc of frag) await this.insertChar(target, fc);
          await new Promise((r) => setTimeout(r, 320 + Math.random() * 420));
          for (let b = 0; b < fragLen; b++) await this.deleteChar(target);
          await new Promise((r) => setTimeout(r, 450 + Math.random() * 550));
        }

        // Neighbour-key typo: the wrong key lands, a short "double-take"
        // pause, then backspace + the correct character.
        if (roll && roll.typoAt === i && roll.wrongChar && roll.wrongChar !== char) {
          await this.insertChar(target, roll.wrongChar);
          await new Promise((r) => setTimeout(r, 160 + Math.random() * 320));
          await this.deleteChar(target);
          await new Promise((r) => setTimeout(r, 110 + Math.random() * 210));
        }

        await this.insertChar(target, char);
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

        const usePauses = this.state.naturalPauses && this.config.punctuationPauses !== false;
        const useJitter = this.state.jitter && this.config.jitter !== false;
        const delay = this.calculateDelay(char, nextChar, this.state.wpm, usePauses, useJitter);
        await new Promise((r) => setTimeout(r, delay));
      }

      if (this.state.isTyping) {
        this.state.isTyping = false;
        this.state.isPaused = false;
        this.updateFloatingHUD('Completed ✨');
        this.broadcastProgress('completed');
        setTimeout(() => this.removeFloatingHUD(), 5000);
      }
    } catch (err) {
      console.error('[Helpotron Assistive Typing Error]', err);
      this.state.isTyping = false;
      this.updateFloatingHUD('Error occurred');
      this.broadcastProgress('error', String(err));
    }
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
      // 08-31: login is captcha-gated in the web app; the MV3 popup cannot
      // load the Turnstile script, so the web session (public_id +
      // session_token) is handed to the extension after a successful login.
      // Origin is already restricted: this listener only exists on
      // helpotron/localhost pages (guard above), and event.source is window.
      try {
        const p = event.data;
        if (!p.public_id || !p.session_token) return;
        chrome.runtime.sendMessage({
          action: 'storeSession',
          payload: { public_id: p.public_id, session_token: p.session_token, token: p.token || '', server: p.server || '' },
        }, () => {
          window.postMessage({
            type: 'HELPOTRON_SESSION_HANDOFF_RESULT',
            requestId: p.requestId,
            result: { ok: true },
          }, '*');
        });
      } catch (err) {
        window.postMessage({
          type: 'HELPOTRON_SESSION_HANDOFF_RESULT',
          requestId: event.data.requestId,
          result: { ok: false, error: String(err) },
        }, '*');
      }
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
// throttled to one per 500 ms (spec). CDP-synthesized input is NEVER isTrusted,
// so the agent's own clicks/keys/moves can never self-interrupt.
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
