"""Bounded reads of multipart uploads.

`await file.read()` pulls the whole part into memory before any size check, so a
caller that sends a multi-GB file makes the worker allocate all of it just to be
told it is too large. These helpers read in fixed chunks and stop at the first
byte past the limit (HTTP 413), so peak memory is bounded by the limit itself
(`read_upload_capped`) or by one chunk (`stream_upload_to_file`).
"""
from __future__ import annotations

import asyncio
import os
from typing import Optional

from fastapi import HTTPException, UploadFile

CHUNK_BYTES = 1024 * 1024


def _too_large(detail: str) -> HTTPException:
    return HTTPException(status_code=413, detail=detail)


def _declared_size(file: UploadFile) -> Optional[int]:
    size = getattr(file, "size", None)
    return size if isinstance(size, int) else None


async def read_upload_capped(file: UploadFile, max_bytes: int, detail: str) -> bytes:
    """Return the upload's bytes, raising 413 as soon as more than max_bytes arrive."""
    declared = _declared_size(file)
    if declared is not None and declared > max_bytes:
        raise _too_large(detail)
    parts = []
    total = 0
    while True:
        chunk = await file.read(CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise _too_large(detail)
        parts.append(chunk)
    return b"".join(parts)


def _write_chunk(fh, chunk: bytes) -> None:
    fh.write(chunk)


async def stream_upload_to_file(file: UploadFile, dest_path: str, max_bytes: int, detail: str) -> int:
    """Copy the upload to dest_path chunk by chunk; return the byte count.

    Raises 413 (and removes the partial file) once max_bytes is exceeded. Disk
    writes run in a worker thread so the event loop is never blocked on I/O.
    """
    declared = _declared_size(file)
    if declared is not None and declared > max_bytes:
        raise _too_large(detail)
    total = 0
    fh = await asyncio.to_thread(open, dest_path, "wb")
    try:
        while True:
            chunk = await file.read(CHUNK_BYTES)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise _too_large(detail)
            await asyncio.to_thread(_write_chunk, fh, chunk)
    except BaseException:
        await asyncio.to_thread(fh.close)
        try:
            os.remove(dest_path)
        except OSError:
            pass
        raise
    await asyncio.to_thread(fh.close)
    return total
