"""Server-side markdown + LaTeX -> HTML rendering.

This exists to move formatting OFF the clients and onto the server, per the
"thinnest wrapper" directive (2026-09-14). Today the web app renders markdown
with react-markdown + rehype-katex (node_modules) and the extension renders
plain text + math with a 62-file vendored KaTeX bundle — the same reply is
rendered twice, differently, and a formatting or math bug has to be fixed in
both places (an extension fix needs a CWS review).

render_reply() produces one HTML string from the markdown the model already
emits. Both clients inject it (sanitized). After the clients switch, every
math/formatting fix is a server deploy.

Pipeline:
  1. Protect LaTeX math spans ($$...$$ / \[...\] display, $...$ / \(...\) inline)
     with placeholders so the markdown parser cannot mangle backslashes or
     underscores.
  2. markdown-it (commonmark + tables) renders the rest to HTML.
  3. Each placeholder becomes MathML via latex2mathml (native HTML — no client
     JS, no KaTeX). A span the converter cannot parse degrades to escaped code,
     never raises, never drops the user's text.
"""

from __future__ import annotations

import html
import re
from typing import List, Tuple

import latex2mathml.converter as latex2mathml
from markdown_it import MarkdownIt

_md = MarkdownIt("commonmark", {"html": False}).enable("table")

# Display math first, then inline. Two passes avoid the ambiguity of trying to
# backreference a mixed delimiter set in one regex.
_DISPLAY_MATH = re.compile(r"(?:\$\$(.+?)\$\$|\\\[(.+?)\\])", re.S)
_INLINE_MATH = re.compile(r"(?:\$([^$\n]+?)\$|\\\((.+?)\\\))", re.S)

# A plain alphanumeric token markdown-it will leave untouched (a null byte gets
# rewritten to U+FFFD by the parser, so it cannot serve as a placeholder).
_PLACEHOLDER = "MATHPLACEHOLDER{}"


def _convert_math(body: str, display: bool) -> str:
    try:
        return latex2mathml.convert(body, display="block" if display else "inline")
    except Exception:
        # A malformed span is rendered as escaped code, not raised, not dropped.
        return f"<code>{html.escape(body)}</code>"


def _stash_math(text: str, placeholders: List[Tuple[bool, str]]) -> str:
    """Replace each math span with a unique placeholder, recording (display, body)."""

    def _stash_display(m: re.Match) -> str:
        body = m.group(1) or m.group(2)
        placeholders.append((True, body))
        return _PLACEHOLDER.format(len(placeholders) - 1)

    def _stash_inline(m: re.Match) -> str:
        body = m.group(1) or m.group(2)
        placeholders.append((False, body))
        return _PLACEHOLDER.format(len(placeholders) - 1)

    text = _DISPLAY_MATH.sub(_stash_display, text)
    text = _INLINE_MATH.sub(_stash_inline, text)
    return text


def render_reply(text: str) -> str:
    """Render markdown-with-LaTeX to one HTML string."""
    if not text:
        return ""
    placeholders: List[Tuple[bool, str]] = []
    protected = _stash_math(text, placeholders)
    rendered = _md.render(protected)
    for i, (display, body) in enumerate(placeholders):
        rendered = rendered.replace(
            _PLACEHOLDER.format(i), _convert_math(body, display))
    return rendered.strip()


__all__ = ["render_reply"]
