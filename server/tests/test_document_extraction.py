"""Assignment dump document extraction — regression guards.

The bug these guard against: `server/assignment_dump.py` imported `pypdf` for
PDF text extraction, but pypdf is not installed in this venv. The ImportError was
swallowed, and extraction fell through to `open(path).read()` with
`errors="ignore"` — so a real 2 MB assignment was stored as 1,103,733 characters
of raw PDF object syntax (`%PDF-1.7`, `1 0 obj`, `<< /Pages 2 0 R >>`) and fed to
the model in place of the document.

The contract now: extraction returns document text, or an explicit marker saying
the text could not be read. It never returns PDF container syntax.
"""
from __future__ import annotations

import os


import pytest

from server.assignment_dump import (  # noqa: E402
    AssignmentDumpManager,
    _extract_with_anydoc,
)

PDF_SYNTAX_MARKERS = ("%PDF-", " obj", "endobj", "/Type", " xref", "trailer")


def _make_text_pdf(lines) -> bytes:
    """Smallest valid PDF with a real text layer, built by hand.

    Hand-rolled so the test has no dependency on a PDF-writing library (the venv
    has none), which is also why the production path could not write one.
    """
    text_ops = "\n".join(
        f"BT /F1 12 Tf 72 {720 - i * 18} Td ({ln}) Tj ET" for i, ln in enumerate(lines)
    )
    content = text_ops.encode("latin-1")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"

    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_at}\n%%EOF\n"
    ).encode()
    return bytes(out)


@pytest.fixture
def text_pdf(tmp_path):
    path = tmp_path / "assignment.pdf"
    path.write_bytes(_make_text_pdf([
        "Chapter 4 Review Questions",
        "Explain the causes of the Industrial Revolution.",
    ]))
    return str(path)


def test_text_pdf_extracts_content_not_container_syntax(text_pdf):
    """A PDF with a text layer yields its text, never PDF object syntax."""
    result = _extract_with_anydoc(text_pdf)
    assert result, "anydoc returned nothing for a valid text PDF"
    assert "Industrial Revolution" in result
    for marker in PDF_SYNTAX_MARKERS:
        assert marker not in result, f"extraction leaked PDF syntax: {marker!r}"


@pytest.mark.asyncio
async def test_extract_text_from_file_never_returns_pdf_syntax(text_pdf):
    """End-to-end through the dispatcher — the path the API actually calls."""
    text, method = await AssignmentDumpManager.extract_text_from_file(
        text_pdf, "document")
    assert text and len(text.strip()) > 20
    assert "Industrial Revolution" in text
    assert method == "anydoc"
    for marker in PDF_SYNTAX_MARKERS:
        assert marker not in text, f"{method} leaked PDF syntax: {marker!r}"


@pytest.mark.asyncio
async def test_unreadable_pdf_returns_explicit_marker(tmp_path, monkeypatch):
    """When every extractor declines, say so — do not emit binary as text.

    This is the exact behaviour the old fallback got wrong: it returned the
    decoded bytes of the container rather than admitting failure.
    """
    from server import assignment_dump as ad

    bogus = tmp_path / "not-really.pdf"
    bogus.write_bytes(b"%PDF-1.4\n" + os.urandom(4096))

    monkeypatch.setattr(ad, "_extract_with_anydoc", lambda p: None)

    text, method = await AssignmentDumpManager.extract_text_from_file(
        str(bogus), "document")
    assert method in ("pdf_unreadable", "gemini-ocr")
    if method == "pdf_unreadable":
        assert "No text layer" in text
        assert "%PDF-" not in text


def test_anydoc_reads_formats_helpotron_could_not_read(tmp_path):
    """RTF/ODT/EPUB/XLSX were unreadable before — they fell through to a
    one-line placeholder, so a rubric uploaded as RTF carried no content.

    RTF stands in for that group because it is the one member that can be written
    by hand in a test with no extra dependency (the venv has no spreadsheet or
    office writer), and it exercises the same new dispatch branch.
    """
    rtf = tmp_path / "assignment.rtf"
    rtf.write_text(
        r"{\rtf1\ansi\deff0 {\fonttbl {\f0 Times;}} \f0\fs24 "
        r"Chapter 4 Review Questions\par "
        r"Explain the causes of the Industrial Revolution.\par}",
        encoding="utf-8",
    )

    result = _extract_with_anydoc(str(rtf))
    assert result, "anydoc returned nothing for a valid RTF"
    assert "Industrial Revolution" in result


@pytest.mark.asyncio
async def test_rtf_dispatches_through_the_new_branch(tmp_path):
    """The extension list, not just the helper, must route RTF to anydoc."""
    rtf = tmp_path / "assignment.rtf"
    rtf.write_text(
        r"{\rtf1\ansi\deff0 {\fonttbl {\f0 Times;}} \f0\fs24 "
        r"Chapter 4 Review Questions\par "
        r"Explain the causes of the Industrial Revolution.\par}",
        encoding="utf-8",
    )

    text, method = await AssignmentDumpManager.extract_text_from_file(
        str(rtf), "document")
    assert method == "anydoc"
    assert "Industrial Revolution" in text


@pytest.mark.asyncio
async def test_scanned_pdf_routes_to_ocr_not_container_dump(monkeypatch, tmp_path):
    """A scan raises NeedsOcrError; the dispatcher must try OCR or say so.

    The old code has no OCR route at all for PDFs, so this is the behaviour that
    turns five real scanned assignments from 1-11 MB of garbage into either
    transcribed text or an explicit marker.
    """
    from server import assignment_dump as ad

    scan = tmp_path / "scan.pdf"
    scan.write_bytes(b"%PDF-1.4\n" + os.urandom(4096))

    import anydoc

    def _needs_ocr(path):
        raise anydoc.NeedsOcrError("no text layer")

    monkeypatch.setattr(ad, "_extract_with_anydoc", _needs_ocr)

    async def _fake_ocr(file_path, user_id=None, max_pages=25):
        return "Transcribed scanned content about photosynthesis."

    monkeypatch.setattr(
        AssignmentDumpManager, "_ocr_pdf_pages_gemini", staticmethod(_fake_ocr))

    text, method = await AssignmentDumpManager.extract_text_from_file(
        str(scan), "document")
    assert method == "gemini-ocr"
    assert "photosynthesis" in text
    assert "%PDF-" not in text
