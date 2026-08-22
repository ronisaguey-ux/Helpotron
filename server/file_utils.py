"""Upload path sanitization (remediation BATCH-03).

Plan section: `sanitize_upload_path` rejects directory-traversal filenames
(``../../etc/passwd``), absolute paths, backslashes, null bytes and other
path separators before the app ever joins them to a storage root.
"""
from __future__ import annotations

import os
from typing import Optional

# Null bytes, control chars, backslashes (Windows separators) and leading
# slashes are never acceptable in an upload filename.
_UNSAFE_CHARS = ('\x00', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07',
                 '\x08', '\x0b', '\x0c', '\x0e', '\x0f', '\x10', '\x11', '\x12',
                 '\x13', '\x14', '\x15', '\x16', '\x17', '\x18', '\x19', '\x1a',
                 '\x1b', '\x1c', '\x1d', '\x1e', '\x1f', '\x7f', '\\')


# Raised by sanitize_upload_path on unsafe paths. Plain ValueError so
# tracebacks surface the familiar exception name to callers and log
# scanners; the alias gives app code a stable symbol to catch on.
UploadPathError = ValueError


def sanitize_upload_path(filename: str, base_dir: Optional[str] = None) -> str:
    """Validate a client-supplied upload filename and return the safe relative
    path under the storage root.

    Traversal components (``..``) are rejected outright — never silently
    stripped. Absolute paths, backslashes, null bytes and control characters
    are rejected too. When ``base_dir`` is given the final joined path is
    also resolved and checked to stay inside the storage root.

    Raises:
        UploadPathError (subclass of ValueError): on any of the above.
    """
    if not isinstance(filename, str) or not filename.strip():
        raise UploadPathError('Upload filename must be a non-empty string')

    name = filename.strip()

    if any(ch in _UNSAFE_CHARS for ch in name):
        raise UploadPathError('Upload filename contains disallowed characters')

    if name.startswith('/') or name.startswith('~'):
        raise UploadPathError('Upload filename must be relative, not absolute')

    parts = name.split('/')
    if any(part in ('', '.', '..') for part in parts):
        raise UploadPathError('Upload filename must not contain traversal components')

    joined = os.path.join(*parts)

    if base_dir is not None:
        root = os.path.realpath(base_dir)
        resolved = os.path.realpath(os.path.join(root, joined))
        if resolved != root and not resolved.startswith(root + os.sep):
            raise UploadPathError('Upload path escapes the storage root')

    return joined
