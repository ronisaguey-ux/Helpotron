"""HTML → Markdown, server-side, stdlib only.

Why this exists
---------------
`content.js` carried `htmlToCleanMarkdown` — a DOM-dependent converter
(cloneNode/querySelectorAll/innerText) that decided what boilerplate to strip and
how a table became a Markdown table. That is a policy decision about a user's
captured material, so it belongs on the server where a fix is a deploy.

The extension now sends raw `innerHTML` (plus its URL, for context) and this
module converts. It uses `html.parser` from the stdlib on purpose: adding
lxml/BeautifulSoup for this would mean a new dependency in the request path for
a job that is a few hundred lines of well-understood parsing.

What it handles: headings, paragraphs, bold/italic, inline code, code blocks,
links, images, ordered/unordered/nested lists, blockquotes, horizontal rules,
line breaks, and tables (including a header row, which Markdown requires and
HTML does not).

What it cannot do, stated plainly rather than silently: `innerText` in a browser
is *rendered* text, so it excludes elements hidden by CSS. A parser sees the
markup and cannot know what CSS hid. The extension therefore sends the stripped
HTML; anything display:none survives here and would not have in the old client
path. `strip_boilerplate` removes the common cases by tag and attribute, which
covers the overwhelming majority of real pages.
"""
from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Dict, List, Optional, Tuple

# Elements whose entire subtree is dropped. Tag name → always drop.
_DROP_TAGS = {
    "script", "style", "noscript", "svg", "iframe", "canvas", "template",
    "header", "footer", "nav", "form", "button", "select", "textarea", "input",
}

# Attribute substrings that mark boilerplate regardless of tag.
_DROP_ATTR_HINTS = ("cookie", "modal", "popup", "advert", "sidebar", "banner")

# ARIA roles that are chrome rather than content.
_DROP_ROLES = {"navigation", "banner", "contentinfo", "search", "menu", "menubar", "dialog"}

_BLOCK_TAGS = {
    "p", "div", "section", "article", "main", "aside", "header", "footer",
    "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
    "pre", "table", "tr", "hr", "br", "figure", "figcaption", "dl", "dt", "dd",
}

_VOID_TAGS = {"br", "hr", "img", "input", "meta", "link", "source", "col"}


def _attr(attrs: List[Tuple[str, Optional[str]]], name: str) -> str:
    for k, v in attrs:
        if k.lower() == name:
            return (v or "").strip()
    return ""


def _should_drop(tag: str, attrs: List[Tuple[str, Optional[str]]]) -> bool:
    """Is this element boilerplate? Tag first, then role/class/id hints."""
    if tag in _DROP_TAGS:
        return True
    role = _attr(attrs, "role").lower()
    if role in _DROP_ROLES:
        return True
    blob = " ".join(
        [(_attr(attrs, "class") or ""), (_attr(attrs, "id") or "")]
    ).lower()
    return any(h in blob for h in _DROP_ATTR_HINTS)


def _escape_cell(text: str) -> str:
    """A pipe inside a cell would split the column, so escape it."""
    return re.sub(r"\s+", " ", text.replace("|", "\\|")).strip()


class _MarkdownExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: List[str] = []
        self._drop_depth = 0          # >0 while inside a dropped subtree
        self._list_stack: List[Dict[str, object]] = []
        self._in_pre = 0
        self._href: List[str] = []
        self._img_href = ""
        # table state
        self._table: List[List[str]] = []
        self._row: Optional[List[str]] = None
        self._cell: Optional[List[str]] = None
        self._header_seen = False
        self._in_thead = False
        self._pending_prefix = ""

    # ── helpers ─────────────────────────────────────────────────────────────
    def _emit(self, text: str) -> None:
        if self._drop_depth or not text:
            return
        if self._cell is not None:
            self._cell.append(text)
        else:
            self.out.append(text)

    def _block_break(self) -> None:
        """End the current block, but never accumulate runaway blank lines."""
        if self._drop_depth or self._cell is not None:
            return
        if self.out and not self.out[-1].endswith("\n\n"):
            if self.out[-1].endswith("\n"):
                self.out.append("\n")
            else:
                self.out.append("\n\n")

    def _list_indent(self) -> str:
        return "  " * max(0, len(self._list_stack) - 1)

    # ── parser callbacks ────────────────────────────────────────────────────
    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        if self._drop_depth:
            if tag not in _VOID_TAGS:
                self._drop_depth += 1
            return
        if _should_drop(tag, attrs):
            if tag not in _VOID_TAGS:
                self._drop_depth = 1
            return

        if tag == "pre":
            self._in_pre += 1
            self._block_break()
            self._emit("```\n")
            return
        if tag == "code" and not self._in_pre:
            self._emit("`")
            return
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._block_break()
            self._emit("#" * int(tag[1]) + " ")
            return
        if tag == "hr":
            self._block_break()
            self._emit("---\n\n")
            return
        if tag == "br":
            self._emit("  \n")
            return
        if tag in ("strong", "b"):
            self._emit("**")
            return
        if tag in ("em", "i"):
            self._emit("*")
            return
        if tag == "blockquote":
            self._block_break()
            self._emit("> ")
            return
        if tag == "a":
            self._href.append(_attr(attrs, "href"))
            self._emit("[")
            return
        if tag == "img":
            alt = _attr(attrs, "alt")
            src = _attr(attrs, "src")
            if src:
                self._emit(f"![{alt}]({src})")
            elif alt:
                self._emit(alt)
            return
        if tag in ("ul", "ol"):
            # Never pad before the list: a blank line between the intro sentence
            # and the first item is correct Markdown and matches the source.
            self._list_stack.append({"type": tag, "n": 0})
            return
        if tag == "li":
            if self._cell is None:
                # Break before the marker, never after the item — a blank line
                # between items makes Markdown render a "loose" list (wrapped in
                # <p>), which is not what the page said.
                if self.out and not self.out[-1].endswith("\n"):
                    self.out.append("\n")
                self._emit(self._list_indent())
                if self._list_stack and self._list_stack[-1]["type"] == "ol":
                    self._list_stack[-1]["n"] = int(self._list_stack[-1]["n"]) + 1
                    self._emit(f"{self._list_stack[-1]['n']}. ")
                else:
                    self._emit("- ")
            return
        if tag == "table":
            self._block_break()
            self._table = []
            self._header_seen = False
            return
        if tag == "thead":
            self._in_thead = True
            return
        if tag == "tr":
            if self._cell is None:
                self._row = []
            return
        if tag in ("td", "th"):
            if self._row is None:
                self._row = []
            self._cell = []
            if tag == "th":
                self._header_seen = True
            return
        if tag == "p" or tag == "div" or tag in _BLOCK_TAGS:
            self._block_break()

    def handle_endtag(self, tag: str) -> None:
        if self._drop_depth:
            if tag not in _VOID_TAGS:
                self._drop_depth -= 1
            return

        if tag == "pre":
            self._in_pre = max(0, self._in_pre - 1)
            self._emit("\n```\n\n")
            return
        if tag == "code" and not self._in_pre:
            self._emit("`")
            return
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._block_break()
            return
        if tag in ("strong", "b"):
            self._emit("**")
            return
        if tag in ("em", "i"):
            self._emit("*")
            return
        if tag == "blockquote":
            self._block_break()
            return
        if tag == "a":
            href = self._href.pop() if self._href else ""
            self._emit(f"]({href})" if href else "]")
            return
        if tag in ("ul", "ol"):
            if self._list_stack:
                self._list_stack.pop()
            # Only close the list out when it was the OUTERMOST one. A nested
            # list is still inside its parent item, so padding there would split
            # the parent list into two.
            if not self._list_stack:
                if self.out and not self.out[-1].endswith("\n"):
                    self.out.append("\n")
                if self.out and not self.out[-1].endswith("\n\n"):
                    self.out.append("\n")
            else:
                if self.out and not self.out[-1].endswith("\n"):
                    self.out.append("\n")
            return
        if tag == "li":
            if self._cell is None and self.out and not self.out[-1].endswith("\n"):
                self.out.append("\n")
            return
        if tag == "thead":
            self._in_thead = False
            return
        if tag in ("td", "th"):
            if self._row is not None and self._cell is not None:
                self._row.append(_escape_cell("".join(self._cell)))
            self._cell = None
            return
        if tag == "tr":
            if self._row is not None and any(c for c in self._row):
                self._table.append(self._row)
            self._row = None
            return
        if tag == "table":
            self._flush_table()
            return
        if tag == "p" or tag == "div" or tag in _BLOCK_TAGS:
            self._block_break()

    def handle_data(self, data: str) -> None:
        if self._drop_depth or not data:
            return
        if self._in_pre:
            self._emit(data)
            return
        self._emit(re.sub(r"\s+", " ", data))

    def _flush_table(self) -> None:
        """Render the collected table, inserting the header row Markdown needs."""
        rows = [r for r in self._table if r]
        self._table = []
        if not rows:
            return
        width = max(len(r) for r in rows)
        padded = [r + [""] * (width - len(r)) for r in rows]
        header = padded[0]
        body = padded[1:]
        lines = ["| " + " | ".join(header) + " |",
                 "| " + " | ".join("---" for _ in range(width)) + " |"]
        for r in body:
            lines.append("| " + " | ".join(r) + " |")
        self.out.append("\n".join(lines) + "\n\n")

    def result(self) -> str:
        text = "".join(self.out)
        # Collapse 3+ blank lines, trim trailing spaces per line.
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()


def strip_boilerplate(html: str) -> str:
    """Remove script/style/nav/footer/role/class-hinted subtrees from raw HTML."""
    if not html:
        return ""
    p = _MarkdownExtractor()
    p.feed(html)
    p.close()
    return p.result()


def html_to_markdown(html: str) -> str:
    """Raw HTML → clean Markdown. The public entry point."""
    return strip_boilerplate(html)
