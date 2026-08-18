// Helpotron Universal Content Script
// Supports Canvas, Google Classroom, Blackboard, Brightspace, Moodle, Schoology, Google Docs, Notion, and arbitrary websites.

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
  const prompt = promptEl?.innerText?.trim()?.slice(0, 30000) || '';

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

  const dueDateEl = document.querySelector('div[aria-label*="Due"], span:contains("Due")') ||
    Array.from(document.querySelectorAll('span, div')).find((el) => /due\s+[a-z]{3}\s+\d+/i.test(el.innerText));
  const dueDate = dueDateEl ? dueDateEl.innerText.trim() : '';

  const promptEl = document.querySelector('div[dir="auto"].c3I1v, div[jsname="V67aGc"], .asQXV');
  const prompt = promptEl?.innerText?.trim() || (document.body ? document.body.innerText.slice(0, 20000) : '');

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
    ? mainEl.innerText.trim().slice(0, 30000)
    : bodyText.slice(0, 25000);

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

function extractAllFileLinks() {
  const files = [];
  const patterns = [
    'a[download]',
    'a.file-link',
    'a[href*="/files/"]',
    'a[href$=".pdf"]',
    'a[href$=".docx"]',
    'a[href$=".pptx"]',
    'a[href$=".zip"]',
    'a[href*="drive.google.com"]',
    'a[href*="docs.google.com"]',
  ];

  document.querySelectorAll(patterns.join(', ')).forEach((link) => {
    const href = link.href;
    if (href && !files.includes(href) && !href.startsWith('javascript:')) {
      files.push(href);
    }
  });
  return files.slice(0, 50);
}

// Subagent Tool Execution Helpers
window.__helpotron_read_assignment = scrapeAssignmentUniversal;
window.__helpotron_scrape_universal = scrapeAssignmentUniversal;

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
