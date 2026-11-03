"""Bounded upload reads (V4-A4-09): uploads are streamed in chunks with an early 413,
never read whole into memory before the size check."""
import io
import os
import uuid

import pytest
from fastapi import HTTPException
from starlette.datastructures import UploadFile

from server import assignment_dump as dump_mod
from server import routes_dump
from server import upload_limits
from server.database import SessionLocal, UniversalDumpItem, User


class _CountingFile(io.BytesIO):
    """BytesIO that records how many bytes were actually pulled out of it."""

    def __init__(self, data):
        super().__init__(data)
        self.bytes_read = 0

    def read(self, n=-1):
        chunk = super().read(n)
        self.bytes_read += len(chunk)
        return chunk


def _upload(data: bytes, name="notes.txt", size=None):
    return UploadFile(file=_CountingFile(data), filename=name, size=size)


@pytest.mark.asyncio
async def test_read_capped_returns_bytes_under_limit():
    data = os.urandom(3 * upload_limits.CHUNK_BYTES + 17)
    assert await upload_limits.read_upload_capped(_upload(data), len(data), "big") == data


@pytest.mark.asyncio
async def test_read_capped_stops_early_past_limit(monkeypatch):
    monkeypatch.setattr(upload_limits, "CHUNK_BYTES", 10)
    up = _upload(b"x" * 1000)
    with pytest.raises(HTTPException) as exc:
        await upload_limits.read_upload_capped(up, 25, "too big")
    assert exc.value.status_code == 413
    assert up.file.bytes_read == 30  # stopped at the first chunk past the cap, not 1000


@pytest.mark.asyncio
async def test_declared_size_rejected_without_reading(tmp_path):
    up = _upload(b"x" * 100, size=100)
    with pytest.raises(HTTPException) as exc:
        await upload_limits.stream_upload_to_file(up, str(tmp_path / "f"), 50, "too big")
    assert exc.value.status_code == 413
    assert up.file.bytes_read == 0
    assert not (tmp_path / "f").exists()


@pytest.mark.asyncio
async def test_stream_to_file_removes_partial_on_413(tmp_path, monkeypatch):
    monkeypatch.setattr(upload_limits, "CHUNK_BYTES", 10)
    dest = tmp_path / "partial"
    with pytest.raises(HTTPException) as exc:
        await upload_limits.stream_upload_to_file(_upload(b"y" * 100), str(dest), 25, "too big")
    assert exc.value.status_code == 413
    assert not dest.exists()


@pytest.mark.asyncio
async def test_stream_to_file_copies_exact_bytes(tmp_path):
    data = os.urandom(2 * upload_limits.CHUNK_BYTES + 5)
    dest = tmp_path / "out"
    n = await upload_limits.stream_upload_to_file(_upload(data), str(dest), len(data), "big")
    assert n == len(data)
    assert dest.read_bytes() == data


def _make_user(db):
    user = User(public_id=f"test_upl_{uuid.uuid4().hex[:8]}", plan="free", role="user")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.mark.asyncio
async def test_dump_upload_streams_file_into_dump_dir(tmp_path, monkeypatch):
    tmp_path = tmp_path / "dump"
    tmp_path.mkdir()
    monkeypatch.setattr(dump_mod, "DUMP_DIR", tmp_path)
    monkeypatch.setattr(routes_dump, "DUMP_DIR", tmp_path)

    async def _no_extract(**_kw):
        return "", "test"

    monkeypatch.setattr(dump_mod.AssignmentDumpManager, "extract_text_from_file", staticmethod(_no_extract))
    db = SessionLocal()
    try:
        user = _make_user(db)
        data = b"hello dump " * 1000
        resp = await routes_dump.upload_dump_file(
            file=_upload(data, name="lecture.txt"), assignment_id=None, subject=None,
            current_user=user, db=db,
        )
        item = db.query(UniversalDumpItem).filter(UniversalDumpItem.id == resp["dump_id"]).one()
        assert item.file_size_bytes == len(data)
        assert open(item.file_path, "rb").read() == data
        assert os.path.dirname(item.file_path) == str(tmp_path)
        assert not [p for p in os.listdir(tmp_path) if p.startswith(".incoming-")]
    finally:
        db.close()


@pytest.mark.asyncio
async def test_dump_upload_empty_file_400_and_no_leftover(tmp_path, monkeypatch):
    tmp_path = tmp_path / "dump"
    tmp_path.mkdir()
    monkeypatch.setattr(dump_mod, "DUMP_DIR", tmp_path)
    monkeypatch.setattr(routes_dump, "DUMP_DIR", tmp_path)
    db = SessionLocal()
    try:
        user = _make_user(db)
        with pytest.raises(HTTPException) as exc:
            await routes_dump.upload_dump_file(
                file=_upload(b""), assignment_id=None, subject=None, current_user=user, db=db,
            )
        assert exc.value.status_code == 400
        assert os.listdir(tmp_path) == []
    finally:
        db.close()


@pytest.mark.asyncio
async def test_process_dump_upload_still_accepts_bytes(tmp_path, monkeypatch):
    monkeypatch.setattr(dump_mod, "DUMP_DIR", tmp_path)

    async def _no_extract(**_kw):
        return "", "test"

    monkeypatch.setattr(dump_mod.AssignmentDumpManager, "extract_text_from_file", staticmethod(_no_extract))
    db = SessionLocal()
    try:
        user = _make_user(db)
        item = await dump_mod.assignment_dump_manager.process_dump_upload(
            db=db, user=user, filename="a.txt", content=b"abc",
        )
        assert item.file_size_bytes == 3
        assert open(item.file_path, "rb").read() == b"abc"
    finally:
        db.close()
