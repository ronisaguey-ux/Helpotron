"""Tests for the direct LaTeX export feature (08-30, user-requested)."""
import pytest

from server.export import (
    markdown_to_latex,
    export_study_guide_latex,
    export_summary_latex,
)


def test_document_skeleton():
    tex = markdown_to_latex("Hello world.")
    assert "\\documentclass[11pt]{article}" in tex
    assert "\\begin{document}" in tex
    assert "\\end{document}" in tex
    assert "Hello world." in tex


def test_h1_becomes_title_and_maketitle():
    tex = markdown_to_latex("# My Guide\n\n## Part A\n\ntext\n")
    assert "\\title{My Guide}" in tex
    assert "\\maketitle" in tex
    assert "\\subsection{Part A}" in tex
    # the title heading itself must not repeat in the body
    assert tex.count("\\title{My Guide}") == 1
    assert "\\section{My Guide}" not in tex


def test_h2_only_doc_shifts_to_section():
    tex = markdown_to_latex("## TOPIC 2.1\n\nSome text.\n")
    assert "\\section{TOPIC 2.1}" in tex
    assert "\\maketitle" not in tex  # no h1 -> no title page block


def test_special_chars_escaped():
    tex = markdown_to_latex("# T\n\n100% & #1 _x_ {y} ~z^2\n")
    assert "100\\%" in tex
    assert "\\&" in tex
    assert "\\#" in tex
    assert "\\_x\\_" in tex  # underscores escaped (italics stay _x_ untouched)
    assert "\\{y\\}" in tex


def test_math_passthrough_intact():
    tex = markdown_to_latex("# T\n\n$E = mc^2$ inline and $$\\int_0^1 x^2 dx$$ block.\n")
    assert "$E = mc^2$" in tex
    assert "$$\\int_0^1 x^2 dx$$" in tex


def test_inline_markup():
    tex = markdown_to_latex("# T\n\n**bold** and *italic* and `code`.\n")
    assert "\\textbf{bold}" in tex
    assert "\\emph{italic}" in tex
    assert "\\texttt{code}" in tex


def test_lists_and_quote_and_rule_and_table():
    tex = markdown_to_latex(
        "# T\n\n"
        "- a\n- b\n\n"
        "1. one\n2. two\n\n"
        "> quote line\n\n"
        "---\n\n"
        "| X | Y |\n|---|---|\n| 1 | 2 |\n\n"
        "- [x] done\n- [ ] todo\n"
    )
    assert "\\begin{itemize}" in tex and "\\item a" in tex
    assert "\\begin{enumerate}" in tex and "\\item one" in tex
    assert "\\begin{quote}" in tex and "quote line" in tex
    assert "\\rule{\\textwidth}{0.4pt}" in tex
    assert "\\begin{tabular}{ll}" in tex
    assert "$\\boxtimes$ done" in tex.replace("   ", " ").replace("  ", " ")
    assert "\\toprule" in tex and "\\bottomrule" in tex


def test_unicode_maps_and_nonbreaking_hyphen():
    tex = markdown_to_latex("# T\n\nA 1607‑1754 range — em – en … dots °C\n")
    assert "‑" not in tex
    assert "1607-1754" in tex
    assert "---" in tex and "--" in tex
    assert "\\ldots{}" in tex
    assert "\\textdegree{}C" in tex


def test_bracket_mismatch_never_crashes():
    # tables are `|`-delimited; braces inside must still escape
    tex = markdown_to_latex("# T\n\n{unbalanced? no, escaped}\n\n| a | b |\n|---|---|\n| c | d |\n")
    assert "\\{unbalanced? no, escaped\\}" in tex
    assert tex.count("{") == tex.count("}")


def test_exporter_helpers():
    md = "# S\n\nBody here.\n"
    assert "Body here." in export_study_guide_latex(md)
    assert "Body here." in export_summary_latex(md)


def test_empty_input():
    tex = markdown_to_latex("")
    assert "\\begin{document}" in tex and "\\end{document}" in tex


def test_real_world_sample():
    sample = (
        "## TOPIC 2.1 \n"
        "The context for the colonization of North America from 1607 to 1754 was "
        "shaped by European exploration, **colonial competition**, and economic "
        "expansion.\n\n"
        "### Key Factor \n"
        "- Mercantilism\n"
        "- Religious conflict ($1690$s)\n"
    )
    tex = markdown_to_latex(sample)
    assert "\\section{TOPIC 2.1}" in tex
    assert "\\subsection{Key Factor}" in tex
    assert "\\textbf{colonial competition}" in tex
    assert "$1690$s" in tex
