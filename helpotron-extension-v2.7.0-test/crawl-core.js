// Helpotron crawl core (08-28): pure logic shared by the service worker
// (background.js loads it with importScripts) and the node test harness.
// No chrome.* APIs — everything here is deterministic and unit-testable.

// Scope of one crawl = one browser origin + one Canvas course id. Only URLs
// inside that scope (and inside gradeable/content sections) may ever be
// scraped — the crawler must never wander the open internet.
function courseScopeOf(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/courses\/(\d+)/);
    if (!m) return null;
    return { origin: u.origin, courseId: m[1], courseUrl: `${u.origin}/courses/${m[1]}` };
  } catch { return null; }
}

function isScopedContentUrl(rawUrl, scope) {
  if (!scope || !rawUrl) return false;
  try {
    const u = new URL(rawUrl);
    if (u.origin !== scope.origin) return false;
    const base = `/courses/${scope.courseId}/`;
    if (!u.pathname.startsWith(base)) return false;
    const rest = u.pathname.slice(base.length);
    if (!rest) return false; // course home itself: no content, skip
    return /^(assignments\/|quizzes\/|pages\/|discussion_topics\/|modules\/(items\/)?|files\/)/.test(rest);
  } catch { return false; }
}

// robots.txt check: any Disallow rule that matches the crawl path prefix (with
// '*' wildcard support) refuses the crawl. Missing/unparseable robots.txt
// defaults to allowed (Canvas serves a permissive robots.txt anyway). Rules
// are evaluated conservatively: a Disallow under ANY user-agent blocks us.
function isRobotsAllowed(robotsText, crawlPath) {
  const lines = (robotsText || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (!lower.startsWith('disallow:')) continue;
    const rule = line.slice(line.indexOf(':') + 1).trim();
    if (!rule) continue;
    const pattern = rule.replace(/\*/g, '__ANY__');
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/__ANY__/g, '.*');
    try {
      if (new RegExp(`^${escaped}`).test(crawlPath)) return false;
    } catch { /* malformed rule — ignore */ }
  }
  return true;
}

// Parse link targets out of an index page (assignments/modules/pages/quizzes…)
// and add content URLs to `out`. Returns extra paginated index URLs to visit.
function collectIndexLinks(html, scope, out) {
  const extra = [];
  if (!html) return extra;
  const re = /href\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1];
    if (!href || href.startsWith('javascript:') || href.startsWith('#')) continue;
    try {
      const u = new URL(href, scope.courseUrl);
      if (u.origin !== scope.origin) continue;
      const p = u.pathname;
      const base = `/courses/${scope.courseId}/`;
      if (!p.startsWith(base)) continue;
      const rest = p.slice(base.length);
      // Content page: <kind>/<item-id-or-slug> (assignment 1, pages/lecture-2,
      // modules/items/44, quizzes/3, discussion_topics/5, files/…).
      if (/^(assignments|quizzes|pages|discussion_topics|modules\/items|files)\/[^/?#]/.test(rest)) {
        u.hash = '';
        u.search = '';
        const canon = u.href;
        if (!out.includes(canon)) out.push(canon);
        continue;
      }
      // Index listing page (or paginated variant): discover, don't scrape.
      if (/^(assignments|modules|pages|quizzes|discussion_topics)(\?[^?#]*)?$/.test(rest)) {
        const pageNo = /[?&]page=(\d+)/.exec(u.search);
        if (pageNo && Number(pageNo[1]) > 1 && Number(pageNo[1]) <= 4) {
          extra.push(u.href);
        }
      }
    } catch { /* skip */ }
  }
  return extra;
}

// 08-28: attribution for one scraped page. The Canvas context (`meta` from
// content.js) identifies which assignment/course the page came from; the
// server dedupes on canvas_id ("<courseId>:<kind>:<itemId>") and stores the
// detected subject so the material lands in the right bubble (not a NULL
// assignment_id / wrong bubble). Non-course pages send no canvas_id and the
// server falls back to subject keywords from title+prompt.
function buildAssignmentPayload(data, public_id) {
  const meta = (data && data.meta) || {};
  const canvasId = (meta.courseId && meta.itemId && meta.itemKind)
    ? `c${meta.courseId}:${meta.itemKind}:${meta.itemId}`
    : '';
  return {
    public_id,
    canvas_id: canvasId,
    title: (data && data.title) || 'Scraped Coursework',
    due_date: (data && data.dueDate) || '',
    prompt: (data && data.prompt) || '',
    file_urls: (data && data.files) || [],
    // 08-28 real quick-scrape: per-file {url, filename, size, sha256, …}
    // records ride along so the bubble keeps URL + content-hash even when the
    // bytes could not be streamed into the dump flow.
    files_meta: (data && data.filesWithMeta) || [],
    // 08-28: chatbox instruction that produced this scrape — persisted so a
    // follow-up chat message can continue the scrape with full context.
    instruction: (data && data.instruction) || '',
    rubric: (data && data.rubric) || '',
    subject: meta.subject || '',
    course_name: meta.courseName || '',
    course_code: meta.courseCode || '',
    source_url: (data && data.url) || '',
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { courseScopeOf, isScopedContentUrl, isRobotsAllowed, collectIndexLinks, buildAssignmentPayload };
}
