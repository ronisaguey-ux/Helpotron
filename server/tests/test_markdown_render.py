"""Server-side markdown+math renderer — regression guards."""
from __future__ import annotations

from server.markdown_render import render_reply


def test_plain_text_paragraph():
    assert render_reply("hello world") == "<p>hello world</p>"


def test_inline_math_becomes_mathml():
    out = render_reply("solve $x = \\frac{-b}{2a}$")
    assert "<math" in out and "inline" in out
    assert "\\frac" not in out  # raw LaTeX is gone


def test_display_math_becomes_block_mathml():
    out = render_reply("$$\\int_0^\\infty e^{-x} dx$$")
    assert "<math" in out and "block" in out


def test_markdown_formatting():
    out = render_reply("**bold** *italic* `code`")
    assert "<strong>bold</strong>" in out
    assert "<em>italic</em>" in out
    assert "<code>code</code>" in out


def test_table_renders():
    out = render_reply("| a | b |\n|---|---|\n| 1 | 2 |")
    assert "<table>" in out and "<td>1</td>" in out


def test_link_renders():
    out = render_reply("[x](https://x.com)")
    assert '<a href="https://x.com">' in out


def test_malformed_math_does_not_raise_or_drop():
    # A dollar sign that is not real math, and a broken LaTeX span, both survive.
    out = render_reply("costs $5 today and $\\badtoken{")
    assert "5" in out
    assert "<p>" in out  # still produced a paragraph


def test_empty_returns_empty():
    assert render_reply("") == ""


def test_mixed_math_and_text_preserves_order():
    out = render_reply("first $a+b$ middle **bold** last $c-d$")
    assert out.index("math") < out.index("bold") < out.rindex("math")
