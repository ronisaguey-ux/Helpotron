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

// Expose for the background service worker (chrome.scripting.executeScript).
window.__helpotron_read_assignment = readAssignment;
