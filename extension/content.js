// Reads the current Canvas page: assignment title, due date, prompt, file links.

function readAssignment() {
  const title =
    document.querySelector('.ig-title')?.innerText?.trim() ||
    document.querySelector('h1.page-title')?.innerText?.trim() ||
    document.title.replace(/ - .*/, '').trim() ||
    'Untitled assignment';

  const dueDate =
    document.querySelector('.ig-due-date')?.innerText?.trim() ||
    document.querySelector('.assignment-due-date')?.innerText?.trim() ||
    document.querySelector('time[data-tooltip]')?.getAttribute('data-tooltip')?.trim() ||
    '';

  const promptEl = document.querySelector('#assignment_description') || document.querySelector('.user_content');
  const prompt = promptEl?.innerText?.trim()?.slice(0, 20000) || '';

  const files = [];
  document.querySelectorAll('a[download], a.file-link, a[href*="/files/"]').forEach((link) => {
    const href = link.href;
    if (href && !files.includes(href)) files.push(href);
  });

  // Canvas courses pages expose the course id; individual assignments embed one too.
  const canvasId =
    document.querySelector('meta[name="course_id"]')?.content ||
    new URLSearchParams(window.location.search).get('assignment_id') ||
    null;

  return { title, dueDate, prompt, files, canvasId };
}

function scrapeAssignmentStealth() {
  const titleElem = document.querySelector('h1.title, .assignment-title, #assignment_show .title, .ig-title');
  const title = titleElem ? titleElem.innerText.trim() : document.title;
  const descElem = document.querySelector('.user_content, #assignment_description, .description');
  const description = descElem ? descElem.innerText.trim() : '';
  const rubricElems = Array.from(document.querySelectorAll('.rubric_criterion, .rubric-criterion, table.rubric'));
  const rubricText = rubricElems.map(e => e.innerText.trim()).join('\n---\n');
  const fileLinks = Array.from(document.querySelectorAll('a.instructure_file_link, a.file_download_btn, a[download], a.file-link, a[href*="/files/"]')).map(a => a.href);
  return { title, description, rubric: rubricText, files: fileLinks, scraped_at: new Date().toISOString() };
}

if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
  const observer = new MutationObserver((mutations, obs) => {
    const readyElement = document.querySelector('.user_content, #assignment_show, .ig-title');
    if (readyElement) {
      window.__helpotronScrapedPayload = scrapeAssignmentStealth();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// Expose for the background service worker (chrome.scripting.executeScript).
window.__helpotron_read_assignment = readAssignment;
window.__helpotron_scrape_stealth = scrapeAssignmentStealth;

