"""Export utilities for study materials and deliverables."""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List


def export_flashcards_quizlet(flashcards: List[Dict]) -> str:
    """Export flashcards as Quizlet CSV format (term, definition)."""
    lines = ["term,definition"]
    for card in flashcards:
        q = card.get("q", "")
        a = card.get("a", "")
        lines.append(f'"{q}","{a}"')
    return "\n".join(lines)


def export_flashcards_anki(flashcards: List[Dict]) -> str:
    """Export flashcards as Anki CSV format (front, back)."""
    lines = ["front,back"]
    for card in flashcards:
        q = card.get("q", "")
        a = card.get("a", "")
        lines.append(f'"{q}","{a}"')
    return "\n".join(lines)


def export_practice_test_json(practice_test: Dict) -> str:
    """Export practice test as JSON."""
    return json.dumps(practice_test, indent=2, ensure_ascii=False)


def export_study_guide_markdown(study_guide: str) -> str:
    """Export study guide as Markdown."""
    return study_guide


def export_summary_text(summary: str) -> str:
    """Export summary as plain text."""
    return summary


# ─── LaTeX Export (08-30: direct LaTeX export formatting, user-requested) ────
# Pure markdown → LaTeX conversion for study guides and summaries. Math spans
# ($...$, $$...$$) pass through untouched — the source content already carries
# LaTeX equations, so they survive the conversion natively.

_LATEX_SPECIAL: Dict[str, str] = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}

# Unicode chars that PDFLaTeX's utf8 inputenc cannot render; mapped to TeX-safe
# equivalents. Accented Latin letters are left alone (inputenc handles those).
_UNICODE_MAP: Dict[str, str] = {
    "\u00a0": "~",
    "\u2011": "-",        # non-breaking hyphen
    "\u2012": "--",
    "\u2013": "--",        # en dash
    "\u2014": "---",       # em dash
    "\u2018": "`",         # left single quote
    "\u2019": "'",         # right single quote
    "\u201c": "``",        # left double quote
    "\u201d": "''",        # right double quote
    "\u2026": r"\ldots{}",
    "\u00b0": r"\textdegree{}",
    "\u00d7": r"$\times$",
    "\u2192": r"$\rightarrow$",
    "\u2190": r"$\leftarrow$",
    "\u21d2": r"$\Rightarrow$",
    "\u2264": r"$\leq$",
    "\u2265": r"$\geq$",
    "\u2260": r"$\neq$",
    "\u2248": r"$\approx$",
    "\u2713": r"$\checkmark$",
    "\u2717": r"$\times$",
}

_MATH_RE = re.compile(r"(\$\$.*?\$\$|\\\[.*?\\\]|\\\(.*?\\\)|\$[^$\n]*?\$)", re.S)
_MATH_PLACEHOLDER = "\x00MATH%d\x00"


def _escape_latex(text: str) -> str:
    """Escape LaTeX special characters outside of math spans."""
    out = []
    for ch in text:
        if ch in _UNICODE_MAP:
            out.append(_UNICODE_MAP[ch])
        elif ch in _LATEX_SPECIAL:
            out.append(_LATEX_SPECIAL[ch])
        else:
            out.append(ch)
    return "".join(out)


def _protect_math(text: str) -> str:
    """Replace math spans with placeholders so escaping skips them."""
    spans: List[str] = []

    def _keep(m: "re.Match[str]") -> str:
        idx = len(spans)
        spans.append(m.group(0))
        return _MATH_PLACEHOLDER % idx

    return _MATH_RE.sub(_keep, text), spans


def _restore_math(text: str, spans: List[str]) -> str:
    for i, span in enumerate(spans):
        text = text.replace(_MATH_PLACEHOLDER % i, span)
    return text


def _inline_latex(text: str) -> str:
    """Convert inline markdown emphasis/code to LaTeX (after escaping)."""
    # code spans first (protect from emphasis pass)
    text = re.sub(r"`([^`]+)`", lambda m: r"\texttt{" + m.group(1) + "}", text)
    text = re.sub(r"\*\*([^*]+)\*\*", lambda m: r"\textbf{" + m.group(1) + "}", text)
    text = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", lambda m: r"\emph{" + m.group(1) + "}", text)
    text = re.sub(r"(?<!\~)\~([^~\n]+)\~(?!\~)", lambda m: r"\textasciitilde{}" + m.group(1) + r"\textasciitilde{}", text)
    text = re.sub(r"~~([^~]+)~~", lambda m: r"\sout{" + m.group(1) + "}", text)
    # links [label](url) -> \href{url}{label} (hyperref is in the preamble)
    text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", lambda m: r"\href{" + m.group(2) + "}{" + m.group(1) + "}", text)
    return text


def markdown_to_latex(markdown: str) -> str:
    """Convert a markdown string to a full standalone LaTeX document.

    Supports headings (#-###), bulleted/numbered lists (flat and 2-space
    nested), blockquotes, fenced code blocks, inline code/bold/italic, inline
    and display math, horizontal rules, and pipe tables. Unknown markdown
    degrades gracefully to escaped text.
    """
    if not markdown:
        return _LATEX_PREAMBLE.replace("__TITLE__", "") + "\\end{document}\n"

    text, math_spans = _protect_math(markdown)
    lines = text.split("\n")

    out: List[str] = []
    in_list: str | None = None       # "itemize" | "enumerate"
    list_depth = 0
    in_quote = False
    in_code_block = False
    code_buf: List[str] = []
    in_table = False
    table_rows: List[List[str]] = []

    def _close_list() -> None:
        nonlocal in_list, list_depth
        if in_list:
            out.append("\\end{" + in_list + "}")
            in_list = None
            list_depth = 0

    def _close_quote() -> None:
        nonlocal in_quote
        if in_quote:
            out.append("\\end{quote}")
            in_quote = False

    def _close_table() -> None:
        nonlocal in_table, table_rows
        if in_table:
            _emit_table(table_rows)
            in_table = False
            table_rows = []

    def _emit_table(rows: List[List[str]]) -> None:
        if not rows:
            return
        ncols = max(len(r) for r in rows)
        out.append("\\begin{center}")
        out.append("\\begin{tabular}{" + "l" * ncols + "}")
        out.append("\\toprule")
        for ri, row in enumerate(rows):
            cells = [cell for cell in row] + [""] * (ncols - len(row))
            out.append(" & ".join(cells) + r" \\")
            if ri == 0:
                out.append("\\midrule")
        out.append("\\bottomrule")
        out.append("\\end{tabular}")
        out.append("\\end{center}")

    # First h1 becomes the document title (removed from the body).
    # Deeper heading levels (docs that never use h1, e.g. "## TOPIC 2.1")
    # start at \section instead of \subsection.
    title_raw = ""
    min_level = 7
    for line in lines:
        m = re.match(r"^\s*(\#{1,6})\s+(.*)$", line.strip())
        if m:
            min_level = min(min_level, len(m.group(1)))
            if not title_raw and len(m.group(1)) == 1:
                title_raw = m.group(2).strip()
    if min_level == 1:
        shift = 0
    elif min_level in (2, 3, 4):
        shift = 1
    else:
        shift = 0
    title = _restore_math(_inline_latex(_escape_latex(title_raw)), math_spans)

    for raw in lines:
        line = raw.rstrip()
        stripped = line.strip()

        if in_code_block:
            if stripped.startswith("```"):
                in_code_block = False
                out.append("\\end{verbatim}")
                continue
            code_buf.append(line)
            continue

        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_code_block = True
            code_buf = []
            out.append("\\begin{verbatim}")
            continue

        if not stripped:
            _close_list(); _close_quote(); _close_table()
            out.append("")
            continue

        # Pipe table
        if stripped.startswith("|") and stripped.endswith("|"):
            cells = [c.strip() for c in stripped.strip("|").split("|")]
            if all(re.fullmatch(r":?-{3,}:?", c) for c in cells):
                continue  # separator row
            if in_table:
                table_rows.append([_restore_math(_inline_latex(_escape_latex(c)), math_spans) for c in cells])
            else:
                in_table = True
                table_rows = [[_restore_math(_inline_latex(_escape_latex(c)), math_spans) for c in cells]]
            continue
        if in_table:
            _close_table()

        # Headings
        hm = re.match(r"^(\#{1,6})\s+(.*)$", stripped)
        if hm:
            _close_list(); _close_quote(); _close_table()
            level = len(hm.group(1))
            if title_raw and level == 1 and hm.group(2).strip() == title_raw:
                continue  # title already emitted
            sect = {1 + shift: "section", 2 + shift: "subsection", 3 + shift: "subsubsection"}.get(level, "subsection")
            body = _restore_math(_inline_latex(_escape_latex(hm.group(2).strip())), math_spans)
            out.append("\\" + sect + "{" + body + "}")
            continue

        # Horizontal rule
        if re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", stripped):
            _close_list(); _close_quote()
            out.append("\\noindent\\rule{\\textwidth}{0.4pt}")
            continue

        # Blockquote
        if stripped.startswith(">"):
            if not in_quote:
                _close_list(); _close_table()
                out.append("\\begin{quote}")
                in_quote = True
            body = _restore_math(_inline_latex(_escape_latex(stripped.lstrip("> "))), math_spans)
            out.append(body)
            continue
        if in_quote:
            _close_quote()

        # Checkbox list item (must be checked before the generic bullet rule)
        task = re.match(r"^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$", line)
        if task:
            kind = "itemize"
            if in_list != kind:
                _close_list()
                out.append("\\begin{itemize}")
                in_list = kind
                list_depth = 0
            mark = r"$\square$ " if task.group(1) == " " else r"$\boxtimes$ "
            out.append("\\item " + mark + _restore_math(_inline_latex(_escape_latex(task.group(2))), math_spans))
            continue

        # Lists (detect nesting by 2-space indent)
        indent = len(raw) - len(raw.lstrip(" "))
        depth = indent // 2
        bullet = re.match(r"^\s*[-*+]\s+(.*)$", line) or re.match(r"^\s*\u2022\s+(.*)$", line)
        numbered = re.match(r"^\s*(\d+)[.)]\s+(.*)$", line)
        if bullet or numbered:
            kind = "itemize" if bullet else "enumerate"
            if in_list != kind or depth > list_depth:
                _close_list()
                out.append("\\begin{" + kind + "}")
                in_list = kind
                list_depth = depth
            if depth < list_depth:
                _close_list()
                out.append("\\begin{" + kind + "}")
                in_list = kind
                list_depth = depth
            body = bullet.group(1) if bullet else numbered.group(2)
            body = _restore_math(_inline_latex(_escape_latex(body)), math_spans)
            out.append("\\item " + body)
            continue
        if in_list:
            # non-list line while inside a list closes it (loose markdown)
            _close_list()

        # Plain paragraph
        body = _restore_math(_inline_latex(_escape_latex(stripped)), math_spans)
        out.append(body)

    _close_list(); _close_quote(); _close_table()
    if in_code_block and code_buf:
        out.append("\n".join(code_buf))
        out.append("\\end{verbatim}")

    body = "\n\n".join(l for l in out if l != "")
    preamble = _LATEX_PREAMBLE.replace("__TITLE__", title)
    if not title_raw:
        preamble = preamble.replace("\\begin{document}\n\\maketitle\n", "\\begin{document}\n")
        preamble = preamble.replace("\\date{\\today}\n\n", "\n")
    return preamble + body + "\n\n\\end{document}\n"


_LATEX_PREAMBLE = r"""\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath, amssymb}
\usepackage{booktabs}
\usepackage{enumitem}
\usepackage{hyperref}
\usepackage[normalem]{ulem}

\title{__TITLE__}
\author{}
\date{\today}

\begin{document}
\maketitle

"""


def export_study_guide_latex(study_guide: str) -> str:
    """Export study guide as a standalone LaTeX document."""
    return markdown_to_latex(study_guide)


def export_summary_latex(summary: str) -> str:
    """Export summary as a standalone LaTeX document."""
    return markdown_to_latex(summary)


from .config import BASE_DIR
ALLOWED_EXPORT_DIR = str(BASE_DIR / "exports")


def sanitize_filename(filename: str) -> str:
    """Sanitizes filename and prevents directory traversal attacks."""
    import re
    cleaned = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", filename)
    return os.path.basename(cleaned)


async def generate_export_bundle(assignment_id: int, export_format: str, user: Any) -> str:
    """Generates a local export file bundle for the given assignment strictly within allowed export directory."""
    from pathlib import Path
    safe_base = Path(ALLOWED_EXPORT_DIR).resolve()
    user_subdir = safe_base / sanitize_filename(str(getattr(user, "public_id", "anon")))
    user_subdir.mkdir(parents=True, exist_ok=True)
    
    clean_fmt = sanitize_filename(export_format.lower())
    target_filename = f"assignment_{int(assignment_id)}_bundle.{clean_fmt}"
    target_path = (user_subdir / target_filename).resolve()
    
    # Boundary traversal assertion
    if not str(target_path).startswith(str(safe_base)):
        raise ValueError("Path traversal attempt detected.")
        
    with open(target_path, "w", encoding="utf-8") as f:
        f.write(f"# Helpotron Export Bundle - Assignment {assignment_id}\nUser: {getattr(user, 'public_id', 'user')}\nFormat: {export_format}\nGenerated Successfully.")
    return str(target_path)


async def export_and_relay_telegram(assignment_id: int, export_format: str, db: Any, user: Any) -> str:
    """Generates export deliverable and pushes it to linked Telegram chat if present."""
    file_path = await generate_export_bundle(assignment_id, export_format, user)
    telegram_id = getattr(user, "telegram_id", None)
    notifications_paused = getattr(user, "notifications_paused", False)
    if telegram_id and not notifications_paused:
        try:
            from .telegram_bot import send_document_to_user
            await send_document_to_user(telegram_id, file_path, caption=f"📄 Here is your exported {export_format.upper()} bundle!")
        except Exception:
            pass
    return file_path


async def export_to_google_doc(
    assignment_id: int,
    access_token: str,
    title: str,
    content: str,
    simulation_speed: str = "fast"
) -> Dict[str, Any]:
    """Streams assignment content into Google Docs with authentic typing history."""
    from .gdocs_exporter import gdocs_streamer
    return await gdocs_streamer.stream_assignment_to_doc(
        access_token=access_token,
        title=title,
        content=content,
        simulation_speed=simulation_speed
    )

