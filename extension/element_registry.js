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
    '[role="textbox"]', '[role="combobox"]', '[role="searchbox"]',
    '[contenteditable="true"]', '[contenteditable=""]', '[onclick]',
  ].join(',');

  // Bounded so a dense SPA cannot flood the model's context. Reading order
  // (document order, which is close to visual order) means the cap keeps the
  // elements the user is most likely to mean.
  const MAX_INTERACTIVE_ELEMENTS = 60;

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
          let nodes;
          try { nodes = document.querySelectorAll(selector); } catch (e) { return []; }

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
            // element sitting under a modal or overlay is not clickable, and
            // listing it aims the model at a target it cannot hit.
            let top = null;
            try { top = document.elementFromPoint(cx, cy); } catch (e) { top = null; }
            if (top && top !== el && !el.contains(top) && !top.contains(el)) continue;

            let role = (el.getAttribute('role') || '').toLowerCase();
            if (!role) {
              const tag = (el.tagName || '').toLowerCase();
              if (tag === 'a') role = 'link';
              else if (tag === 'textarea') role = 'textbox';
              else if (tag === 'select') role = 'combobox';
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
            const name = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 60);
            // An unlabelled text field is still worth listing (the model may be
            // told to "type in the search box"); an unlabelled link is not.
            if (!name && role !== 'textbox' && role !== 'combobox') continue;

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
  // into the element's CURRENT centre, so the click still lands if the page
  // shifted a few pixels since the frame was captured. An unresolvable ref is
  // left untouched and falls through to the coordinate path unchanged.
  async function resolveActionRefs(tabId, actions) {
    if (!Array.isArray(actions) || !actions.some((op) => op && op.ref !== undefined)) return actions;
    const elements = await collectInteractiveElements(tabId);
    if (!elements.length) return actions;
    return actions.map((op) => {
      if (!op || op.ref === undefined) return op;
      const hit = elements.find((el) => el.ref === Number(op.ref));
      return hit ? Object.assign({}, op, { x: hit.x, y: hit.y }) : op;
    });
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

  window.HelpotronElements = {
    INTERACTIVE_SELECTOR,
    MAX_INTERACTIVE_ELEMENTS,
    collectInteractiveElements,
    resolveActionRefs,
    getTabViewport,
    normalizeFrame,
  };
})();
