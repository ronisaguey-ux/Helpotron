// element_registry.js — live DOM element registry (accuracy upgrade, 09-10).
//
// WHY THIS EXISTS
// The agent's control coordinates used to come from a vision model reading a
// screenshot, which makes every x/y a PIXEL GUESS. That guess is the single
// largest source of the "the cursor moved but the click missed" failure: the
// model is estimating where a control sits in a JPEG, and it is routinely off
// by enough to land on padding or a neighbouring element. The page itself
// knows exactly where its controls are.
//
// This module enumerates the real interactive elements with their true
// getBoundingClientRect centres and hands that list to the server, which gives
// it to the model as authoritative. A click then aims at a MEASURED
// coordinate instead of an estimated one.
//
// SHARED ON PURPOSE: popup.js and agent_mode.js are separate implementations
// with separate executors, and the list is produced at capture time but
// resolved again at dispatch time. Those two enumerations MUST agree, or a ref
// silently points at the wrong element. One file, loaded by both pages, is what
// guarantees that.
//
// Everything here is additive: an empty list (no debugger, an unreachable tab,
// a page that is mid-navigation) leaves the original coordinate path untouched.
(function () {
  'use strict';

  // The interactive surface worth telling the model about. Kept in sync with
  // the executor's own snap selector so a listed element is always a legitimate
  // click target.
  const INTERACTIVE_SELECTOR = [
    'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
    'summary', 'label', '[role="button"]', '[role="link"]', '[role="tab"]',
    '[role="menuitem"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
    '[role="textbox"]', '[role="combobox"]', '[role="searchbox"]', '[role="option"]',
    '[role="treeitem"]', '[contenteditable="true"]', '[contenteditable=""]', '[onclick]',
    'g-more-button', 'g-raised-button', 'g-flat-button',
    '[jsaction*="click"]', '[jsaction*="trigger:"]', '[aria-expanded]',
    '[data-action]', '[data-ved]'
  ].join(',');

  // Bounded to 5000 items so complex and dense pages are captured in full without truncation.
  const MAX_INTERACTIVE_ELEMENTS = 5000;

  // Runs through chrome.scripting rather than the debugger so the list can be
  // gathered BEFORE a run attaches anything, and so a read never depends on
  // debugger state. Resolves to [] for any tab it cannot reach (chrome://, a
  // refused frame, a page mid-navigation) — it never throws into the caller.
  async function collectInteractiveElements(tabId, limit) {
    if (!chrome.scripting || tabId === undefined || tabId === null) return [];
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        args: [INTERACTIVE_SELECTOR, Number(limit) || MAX_INTERACTIVE_ELEMENTS],
        func: (selector, maxItems) => {
          const vw = window.innerWidth || 0;
          const vh = window.innerHeight || 0;
          const out = [];
          const seen = new Set();

          // Shadow-DOM piercing (ported from Stagehand, browserbase/stagehand,
          // MIT). `document.querySelectorAll` only sees the light DOM; a page
          // built of web components — YouTube, Google apps, most 2026 SPAs —
          // hides its controls inside shadow roots the flat query never enters,
          // so the agent was handed a list with the very button the user asked
          // for MISSING, and had to guess a coordinate. Walk every shadow root
          // (open AND closed via chrome.dom, an extension-only API) and query
          // each root, so the element list is the page the user actually sees.
          const openOrClosedShadowRoot = (el) => {
            try {
              if (typeof globalThis.chrome !== 'undefined' && chrome.dom && chrome.dom.openOrClosedShadowRoot) {
                const r = chrome.dom.openOrClosedShadowRoot(el);
                if (r) return r;
              }
            } catch (e) { /* fall through to open roots */ }
            try { return el.shadowRoot || null; } catch (e) { return null; }
          };

          const nodes = [];
          const seenRoots = new WeakSet();
          const queue = [document];
          while (queue.length && nodes.length < maxItems * 4) {
            const root = queue.shift();
            if (!root || seenRoots.has(root)) continue;
            seenRoots.add(root);
            try {
              const matches = root.querySelectorAll(selector);
              for (let i = 0; i < matches.length && nodes.length < maxItems * 4; i++) {
                const m = matches[i];
                if (seen.has(m)) continue;
                seen.add(m);
                nodes.push(m);
              }
            } catch (e) { /* invalid selector in this root — skip */ }

            // Enqueue nested shadow roots for the next pass.
            try {
              const doc = root instanceof Document ? root : (root.host ? root.host.ownerDocument : document);
              const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
              let n;
              while ((n = walker.nextNode())) {
                if (!(n instanceof Element)) continue;
                const sr = openOrClosedShadowRoot(n);
                if (sr) queue.push(sr);
              }
            } catch (e) { /* traversal failure — skip this subtree */ }
          }

          for (const el of nodes) {
            if (out.length >= maxItems) break;

            let r;
            try { r = el.getBoundingClientRect(); } catch (e) { continue; }
            if (!r || r.width < 4 || r.height < 4) continue;
            // Off-viewport elements cannot be clicked without scrolling first,
            // and listing them invites the model to click into empty space.
            if (r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) continue;

            let cs = null;
            try { cs = getComputedStyle(el); } catch (e) { cs = null; }
            if (cs && (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0)) continue;
            if (el.disabled || el.getAttribute('aria-hidden') === 'true') continue;

            const cx = Math.round(Math.max(0, Math.min(vw - 1, r.left + r.width / 2)));
            const cy = Math.round(Math.max(0, Math.min(vh - 1, r.top + r.height / 2)));

            // Only list what a click at that centre would actually reach: an
            // element sitting under a modal or overlay is not clickable. Allow
            // descendant text nodes, icons, or component wrappers. Pierces
            // shadow roots: elementFromPoint stops at a shadow host, so drill
            // into the host's root and re-test the point there.
            let top = null;
            try {
              top = document.elementFromPoint(cx, cy);
              while (top && top.shadowRoot) {
                const inner = top.shadowRoot.elementFromPoint(cx, cy);
                if (!inner || inner === top) break;
                top = inner;
              }
            } catch (e) { top = null; }
            if (top && top !== el && !el.contains(top) && !top.contains(el)) {
              const compEl = el.closest('button, [role="button"], a, g-more-button, g-raised-button, [jsaction*="click"]');
              const compTop = top.closest('button, [role="button"], a, g-more-button, g-raised-button, [jsaction*="click"]');
              if (!compEl || compEl !== compTop) continue;
            }

            let role = (el.getAttribute('role') || '').toLowerCase();
            if (!role) {
              const tag = (el.tagName || '').toLowerCase();
              if (tag === 'a') role = 'link';
              else if (tag === 'textarea') role = 'textbox';
              else if (tag === 'select') role = 'combobox';
              else if (tag === 'button' || tag === 'g-more-button' || tag === 'g-raised-button' || tag === 'g-flat-button') role = 'button';
              else if (tag === 'input') {
                const t = (el.getAttribute('type') || 'text').toLowerCase();
                role = ({
                  checkbox: 'checkbox', radio: 'radio', submit: 'button',
                  button: 'button', reset: 'button', search: 'searchbox',
                  email: 'textbox', password: 'textbox', tel: 'textbox',
                  url: 'textbox', number: 'textbox',
                })[t] || 'textbox';
              } else role = tag;
            }

            const raw = (
              el.getAttribute('aria-label') ||
              el.getAttribute('placeholder') ||
              el.getAttribute('title') ||
              (el.tagName === 'INPUT' ? el.value : '') ||
              el.innerText || el.textContent ||
              el.getAttribute('name') || ''
            );
            let name = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 60);

            // Preserve icon buttons or SVG buttons without text (e.g. search magnifying glasses, submit icons)
            if (!name && role === 'button') {
              const svg = el.querySelector('svg, img, i');
              const cls = ((el.className || '') + ' ' + (svg ? (svg.className || '') : '')).toLowerCase();
              const type = (el.getAttribute('type') || '').toLowerCase();
              if (type === 'submit' || /search|magnif|find|query/i.test(cls)) {
                name = 'Search button';
              } else if (/submit/i.test(cls)) {
                name = 'Submit button';
              } else if (/close|dismiss|clear/i.test(cls)) {
                name = 'Close button';
              } else if (/menu|nav|drawer/i.test(cls)) {
                name = 'Menu button';
              } else if (svg || el.tagName === 'BUTTON') {
                name = 'Button';
              }
            }

            // An unlabelled text field or button is still worth listing; an unlabelled link is not.
            if (!name && role !== 'textbox' && role !== 'combobox' && role !== 'button') continue;

            const key = role + '|' + name + '|' + cx + ',' + cy;
            if (seen.has(key)) continue;
            seen.add(key);

            out.push({
              ref: out.length,
              name: name || role,
              role: role,
              x: cx, y: cy,
              w: Math.round(r.width), h: Math.round(r.height),
            });
          }

          // Also collect custom cursor:pointer elements if space remains
          if (out.length < maxItems) {
            let pointerNodes = [];
            try { pointerNodes = document.querySelectorAll('div, span, li'); } catch (e) { pointerNodes = []; }
            for (const pel of pointerNodes) {
              if (out.length >= maxItems) break;
              let cs = null;
              try { cs = getComputedStyle(pel); } catch (e) { continue; }
              if (cs && cs.cursor === 'pointer' && pel.tagName !== 'BODY' && pel.tagName !== 'HTML') {
                if (pel.closest('a, button, input, select, textarea, [role="button"], g-more-button')) continue;
                let r;
                try { r = pel.getBoundingClientRect(); } catch (e) { continue; }
                if (!r || r.width < 12 || r.height < 12 || r.width > 900 || r.height > 500) continue;
                if (r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) continue;
                const cx = Math.round(Math.max(0, Math.min(vw - 1, r.left + r.width / 2)));
                const cy = Math.round(Math.max(0, Math.min(vh - 1, r.top + r.height / 2)));
                const raw = (pel.getAttribute('aria-label') || pel.innerText || pel.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
                if (!raw) continue;
                const key = 'button|' + raw + '|' + cx + ',' + cy;
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({
                  ref: out.length,
                  name: raw,
                  role: 'button',
                  x: cx, y: cy,
                  w: Math.round(r.width), h: Math.round(r.height),
                });
              }
            }
          }

          return out;
        },
      });
      const list = results && results[0] && results[0].result;
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  // A model handed the element list may answer with {"op":"click","ref":N}
  // instead of x/y. Re-enumerate at dispatch time and translate the ref back
  // Set-of-Marks (SoM) visual grounding — inject numbered markers onto interactive
  // elements before taking a screenshot, so the vision model sees the exact badge number
  // on every button/input. Removed immediately after capture so the user's page stays clean.
  const SOM_CONTAINER_ID = '__helpotron_som_overlay__';

  async function injectSetOfMarks(tabId, elements) {
    if (!chrome.scripting || !tabId || !Array.isArray(elements) || !elements.length) return false;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        args: [SOM_CONTAINER_ID, elements.slice(0, 150)],
        func: (containerId, items) => {
          let c = document.getElementById(containerId);
          if (c) c.remove();
          c = document.createElement('div');
          c.id = containerId;
          c.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483640;';
          for (const it of items) {
            if (it.ref === undefined || it.x === undefined || it.y === undefined) continue;
            const badge = document.createElement('div');
            badge.innerText = `${it.ref}`;
            const bx = Math.max(0, Math.round(it.x - (it.w || 0) / 2));
            const by = Math.max(0, Math.round(it.y - (it.h || 0) / 2));
            badge.style.cssText = `
              position: fixed;
              left: ${bx}px;
              top: ${by}px;
              background: rgba(15, 23, 42, 0.92);
              color: #38bdf8;
              border: 1.5px solid #0284c7;
              border-radius: 4px;
              padding: 1px 4px;
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              font-size: 11px;
              font-weight: 700;
              line-height: 13px;
              box-shadow: 0 2px 6px rgba(0,0,0,0.6);
              pointer-events: none;
              white-space: nowrap;
            `;
            c.appendChild(badge);
          }
          document.documentElement.appendChild(c);
          void c.offsetHeight;
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  async function removeSetOfMarks(tabId) {
    if (!chrome.scripting || !tabId) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        args: [SOM_CONTAINER_ID],
        func: (containerId) => {
          const c = document.getElementById(containerId);
          if (c) c.remove();
        },
      });
    } catch {}
  }

  // The tab's own CSS viewport — the ONE coordinate space every other piece
  // (DOM element centres, the server's clamp, CDP mouse dispatch) already uses.
  // The captured frame does NOT: captureVisibleTab / Page.captureScreenshot
  // return DEVICE pixels (CSS × devicePixelRatio), so on any display whose
  // scale factor is not 1 the frame and the click live in different spaces and
  // every aim is off by exactly that ratio. Read the viewport here so the
  // caller can put the frame into it before anything measures off the image.
  async function getTabViewport(tabId) {
    if (!chrome.scripting || tabId === undefined || tabId === null) return null;
    try {
      const res = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          width: window.innerWidth || 0,
          height: window.innerHeight || 0,
          dpr: window.devicePixelRatio || 1,
        }),
      });
      const v = res && res[0] && res[0].result;
      if (v && v.width > 0 && v.height > 0) {
        return { width: Number(v.width), height: Number(v.height), dpr: Number(v.dpr) || 1 };
      }
    } catch (e) { /* not scriptable (chrome://, no host permission) */ }
    return null;
  }

  // Resize a captured frame to exactly (w × h) so one image pixel IS one CSS
  // pixel. Undo the device-pixel capture and any transport downscale in a
  // single step; the model then reads coordinates in the same space the DOM
  // list and the mouse dispatch use, which is what stops the cursor landing
  // "somewhere else". Never throws: a decode failure returns the input frame
  // unchanged rather than losing the turn.
  function normalizeFrame(dataUrl, w, h) {
    return new Promise((resolve) => {
      try {
        const cw = Math.max(1, Math.round(Number(w) || 0));
        const ch = Math.max(1, Math.round(Number(h) || 0));
        if (!dataUrl || !cw || !ch) { resolve(dataUrl); return; }
        const img = new Image();
        img.onload = () => {
          try {
            const c = document.createElement('canvas');
            c.width = cw;
            c.height = ch;
            c.getContext('2d').drawImage(img, 0, 0, cw, ch);
            resolve(c.toDataURL('image/jpeg', 0.7));
          } catch (e) { resolve(dataUrl); }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      } catch (e) { resolve(dataUrl); }
    });
  }

  // Stagehand-style semantic observer: finds elements by fuzzy text, aria-label, role or title
  async function observeSemanticElement(tabId, query) {
    if (!chrome.scripting || !tabId || !query) return null;
    try {
      const q = String(query).toLowerCase().trim();
      const res = await chrome.scripting.executeScript({
        target: { tabId },
        args: [INTERACTIVE_SELECTOR, q],
        func: (sel, targetText) => {
          const openOrClosedShadowRoot = (el) => {
            try {
              if (typeof globalThis.chrome !== 'undefined' && chrome.dom && chrome.dom.openOrClosedShadowRoot) {
                const r = chrome.dom.openOrClosedShadowRoot(el);
                if (r) return r;
              }
            } catch (e) { /* fall through */ }
            try { return el.shadowRoot || null; } catch (e) { return null; }
          };

          // Pierces shadow roots so a target inside a web component is found,
          // and — ported from Stagehand's text resolver — ties on score go to
          // the SMALLEST element (the deepest, most specific match), not the
          // first big wrapper whose innerText merely contains the needle.
          const nodes = [];
          const seenRoots = new WeakSet();
          const queue = [document];
          while (queue.length) {
            const root = queue.shift();
            if (!root || seenRoots.has(root)) continue;
            seenRoots.add(root);
            try {
              const m = root.querySelectorAll(sel);
              for (let i = 0; i < m.length; i++) nodes.push(m[i]);
            } catch (e) { /* skip */ }
            try {
              const doc = root instanceof Document ? root : (root.host ? root.host.ownerDocument : document);
              const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
              let n;
              while ((n = walker.nextNode())) {
                if (!(n instanceof Element)) continue;
                const sr = openOrClosedShadowRoot(n);
                if (sr) queue.push(sr);
              }
            } catch (e) { /* skip */ }
          }

          let best = null;
          // Start at 0, not -1, and require a real match below. With -1 as the
          // floor every element scored 0 beat it, so a target that matched
          // NOTHING still returned the last element scanned — a name the model
          // got slightly wrong silently clicked a random control. That is the
          // "it clicks randomly on my screen" report: an unmatched target must
          // resolve to NOTHING, so the caller can report the miss instead of
          // firing at whatever happened to be scanned last.
          let bestScore = 0;
          // Minimum score for a name to be considered a match at all (the same
          // contains-level threshold bestMatch uses).
          const MIN_MATCH_SCORE = 60;
          let bestArea = Infinity;
          for (const el of nodes) {
            let r = null;
            try { r = el.getBoundingClientRect(); } catch (e) { continue; }
            if (!r || r.width < 4 || r.height < 4) continue;
            if (r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) continue;
            const raw = (
              el.getAttribute('aria-label') ||
              el.getAttribute('placeholder') ||
              el.getAttribute('title') ||
              el.innerText || el.textContent || ''
            ).toLowerCase().trim();
            if (!raw) continue;
            let score = 0;
            if (raw === targetText) score = 100;
            else if (raw.startsWith(targetText) || targetText.startsWith(raw)) score = 80;
            else if (raw.includes(targetText) || targetText.includes(raw)) score = 60;
            if (score < MIN_MATCH_SCORE) continue;
            const area = r.width * r.height;
            if (score > bestScore || (score === bestScore && area < bestArea)) {
              bestScore = score;
              bestArea = area;
              best = {
                x: Math.round(r.left + r.width / 2),
                y: Math.round(r.top + r.height / 2),
                w: Math.round(r.width),
                h: Math.round(r.height),
                name: raw.slice(0, 60),
                role: el.getAttribute('role') || el.tagName.toLowerCase(),
              };
            }
          }
          return best;
        },
      });
      return res && res[0] && res[0].result;
    } catch {
      return null;
    }
  }

  // A model handed the element list may answer with {"op":"click","ref":N}
  // instead of x/y. Re-enumerate at dispatch time and translate the ref back
  // into the element's CURRENT centre, so the click still lands if the page
  // shifted a few pixels since the frame was captured. If ref shifted or is missing,
  // observeSemanticElement dynamically heals the selector by text match.
  async function resolveActionRefs(tabId, actions) {
    if (!Array.isArray(actions)) return actions;
    const hasRefs = actions.some((op) => op && op.ref !== undefined);
    const hasTargets = actions.some((op) => op && (op.target || op.text_target || op.name));
    if (!hasRefs && !hasTargets) return actions;

    const elements = await collectInteractiveElements(tabId);

    // Stagehand-style semantic grounding: score each element against the
    // target string (exact > starts-with > contains) and take the best, so a
    // target like "Search button" lands on the search button and not the first
    // element whose name merely contains "button". A strong score on a name is
    // trusted; a weak one falls through to the deep text/aria/role observer.
    function bestMatch(query) {
      const q = String(query).toLowerCase().trim();
      if (!q) return null;
      let best = null, bestScore = 0;
      for (const el of elements) {
        const name = String(el.name || '').toLowerCase().trim();
        if (!name) continue;
        let score = 0;
        if (name === q) score = 100;
        else if (name.startsWith(q) || q.startsWith(name)) score = 80;
        else if (name.includes(q) || q.includes(name)) score = 60;
        // Favour short, exact names over long noisy ones at equal score.
        if (score > bestScore || (score === bestScore && best && name.length < best.name.length)) {
          bestScore = score;
          best = el;
        }
      }
      return bestScore >= 60 ? best : null;
    }

    return Promise.all(actions.map(async (op) => {
      if (!op) return op;
      if (op.ref !== undefined) {
        const hit = elements.find((el) => el.ref === Number(op.ref));
        if (hit) return Object.assign({}, op, { x: hit.x, y: hit.y });
      }
      const targetQuery = op.target || op.text_target || op.name;
      if (targetQuery) {
        const hit = bestMatch(targetQuery);
        if (hit) return Object.assign({}, op, { x: hit.x, y: hit.y });
        // Fallback: deep live semantic observation (fuzzy text/aria/role/title).
        const obs = await observeSemanticElement(tabId, targetQuery);
        if (obs) return Object.assign({}, op, { x: obs.x, y: obs.y });
      }
      // Nothing resolved this op: it is a DOM-anchored op (ref/target) that
      // could not be matched against the live page. MARK it. Without this it
      // reached the dispatcher with no x/y, Math.round(undefined * scale) gave
      // NaN, CDP silently ignored the event, and the user saw the debugger
      // attach and then absolutely nothing happen. An unresolved op must be
      // visible, never a silent no-op.
      if (op.ref !== undefined || targetQuery) {
        return Object.assign({}, op, { _unresolved: true });
      }
      return op;
    }));
  }

  window.HelpotronElements = {
    INTERACTIVE_SELECTOR,
    MAX_INTERACTIVE_ELEMENTS,
    collectInteractiveElements,
    resolveActionRefs,
    getTabViewport,
    normalizeFrame,
    injectSetOfMarks,
    removeSetOfMarks,
    observeSemanticElement,
  };

  window.getTabViewport = getTabViewport;
  window.normalizeFrame = normalizeFrame;
  window.collectInteractiveElements = collectInteractiveElements;
  window.resolveActionRefs = resolveActionRefs;
  window.injectSetOfMarks = injectSetOfMarks;
  window.removeSetOfMarks = removeSetOfMarks;
  window.observeSemanticElement = observeSemanticElement;
})();
