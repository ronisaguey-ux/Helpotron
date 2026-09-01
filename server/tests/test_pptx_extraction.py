"""Regression test (operator 08-31): the presentation branch used to read the
.pptx binary as text and filter printable chars, leaving zip signatures and
raw theme XML as the 'slide text' — a real textbook deck generated quiz
questions about theme1.xml internals. _extract_pptx_text must parse the ZIP
package (stdlib) and return the <a:t> runs in true slide order with notes."""
import zipfile

from server.assignment_dump import _extract_pptx_text



def _slide_xml(*runs: str) -> bytes:
    body = "".join(f"<a:t>{r}</a:t>" for r in runs)
    return f"""<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:txBody><a:p>{body}</a:p></a:txBody>
</p:sld>""".encode()


def _note_xml(*runs: str) -> bytes:
    body = "".join(f"<a:t>{r}</a:t>" for r in runs)
    return f"""<?xml version="1.0"?>
<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:txBody><a:p>{body}</a:p></a:txBody>
</p:notes>""".encode()


def _make_pptx(path, slides: list[list[str]], notes: dict[int, list[str]] | None = None):
    with zipfile.ZipFile(path, "w") as zf:
        for i, runs in enumerate(slides, 1):
            zf.writestr(f"ppt/slides/slide{i}.xml", _slide_xml(*runs))
        for idx, runs in (notes or {}).items():
            zf.writestr(f"ppt/notesSlides/notesSlide{idx}.xml", _note_xml(*runs))


def test_extracts_slide_text_and_notes(tmp_path):
    p = tmp_path / "deck.pptx"
    _make_pptx(
        p,
        slides=[["Socialization", "Chapter 1"], ["Defining Society", "shared cultural components"]],
        notes={1: ["the process of learning and socialisation."]},
    )
    text = _extract_pptx_text(str(p))
    assert text is not None
    assert "--- slide 1 ---" in text
    assert "Socialization" in text and "Chapter 1" in text
    assert "--- slide 2 ---" in text
    assert "shared cultural components" in text
    assert "[speaker notes, slide 1] the process of learning and socialisation." in text


def test_slide_order_is_numeric_not_lexicographic(tmp_path):
    p = tmp_path / "deck2.pptx"
    _make_pptx(
        p,
        slides=[["first"], ["second"], ["third"], ["fourth"], ["fifth"], ["sixth"],
                ["seventh"], ["eighth"], ["ninth"], ["tenth"], ["eleventh"], ["twelfth"]],
    )
    text = _extract_pptx_text(str(p))
    assert text.index("--- slide 10 ---") < text.index("--- slide 11 ---")
    assert text.index("--- slide 2 ---") < text.index("--- slide 10 ---")


def test_non_pptx_file_returns_none(tmp_path):
    p = tmp_path / "legacy.ppt"
    p.write_bytes(b"\xd0\xcf\x11\xe0" + b"\x00" * 64)  # OLE magic — not a zip
    assert _extract_pptx_text(str(p)) is None


def test_empty_zip_returns_none(tmp_path):
    p = tmp_path / "empty.pptx"
    with zipfile.ZipFile(p, "w") as zf:
        zf.writestr("README.txt", "not a deck")
    assert _extract_pptx_text(str(p)) is None
