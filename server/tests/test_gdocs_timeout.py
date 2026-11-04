"""Audit V5-A4-11: Google Docs export calls must carry a timeout.

Both Docs API calls used a bare `aiohttp.ClientSession()`, which defaults to a
300s total timeout, inside an export that retries up to 3 times — a stalled
Docs API could hold a request for 15 minutes. This pins the timeout on the
sessions the client actually uses.
"""
import aiohttp

from server.gdocs_exporter import _DOCS_TIMEOUT, gdocs_streamer


class _Recorder:
    """Captures the ClientSession kwargs the exporter passes."""

    def __init__(self):
        self.kwargs = []


def test_docs_timeout_is_bounded():
    assert isinstance(_DOCS_TIMEOUT, aiohttp.ClientTimeout)
    assert _DOCS_TIMEOUT.total == 30
    assert _DOCS_TIMEOUT.connect == 10


def test_create_document_passes_the_timeout(monkeypatch):
    rec = _Recorder()

    class FakeResp:
        status = 200

        async def json(self):
            return {"documentId": "abc123"}

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

    class FakeSession:
        def __init__(self, **kwargs):
            rec.kwargs.append(kwargs)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        def post(self, *a, **kw):
            return FakeResp()

    monkeypatch.setattr(aiohttp, "ClientSession", FakeSession)

    import asyncio
    out = asyncio.run(gdocs_streamer.create_document("token", "Title"))
    assert out["document_id"] == "abc123"
    assert rec.kwargs and rec.kwargs[0]["timeout"] is _DOCS_TIMEOUT


def test_batch_update_passes_the_timeout(monkeypatch):
    rec = _Recorder()

    class FakeResp:
        status = 200

    class FakeSession:
        def __init__(self, **kwargs):
            rec.kwargs.append(kwargs)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        def post(self, *a, **kw):
            class _Ctx:
                async def __aenter__(self_inner):
                    return FakeResp()

                async def __aexit__(self_inner, *a):
                    return False

            return _Ctx()

    monkeypatch.setattr(aiohttp, "ClientSession", FakeSession)

    import asyncio
    ok = asyncio.run(gdocs_streamer.execute_batch_update("token", "doc", []))
    assert ok is True
    assert rec.kwargs and rec.kwargs[0]["timeout"] is _DOCS_TIMEOUT
