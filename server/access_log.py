"""Persistent access / error logging for the Helpotron API.

Why this exists (incident 2026-08-29): the live server's access log was only
ever the process's *stdout*, redirected by whichever launcher happened to start
it (`scripts/start_services.sh` → /tmp/helpotron_backend.log, an ad-hoc run →
/tmp/uvicorn_8000.log, systemd → the journal). When that stdout target was a
scratch file that later got cleaned up, every access log for the running server
was gone with no way to recover it — and the process could not be restarted to
fix it.

The fix is to stop depending on stdout at all. Uvicorn's own `uvicorn.access`
and `uvicorn.error` loggers get a rotating *file* handler attached inside the
app, so the logs land in a stable, writable location no matter how the server
was started (uvicorn CLI, `python -m uvicorn`, systemd, gunicorn worker, or a
test harness) and no matter where stdout points.

Default location is `<repo>/data/logs/` rather than /tmp on purpose:
  * /tmp is wiped on reboot and by cleanup jobs — the original failure;
  * the systemd unit runs with `PrivateTmp=true`, so a /tmp path there is a
    per-service tmpfs that disappears with the service;
  * `data/` is already the project's writable state dir and is listed in the
    unit's `ReadWritePaths=`.

Override with the HELPOTRON_LOG_DIR env var. Failures are never fatal: if the
directory cannot be created or written, the app logs a warning and keeps
running on stdout logging alone.
"""
from __future__ import annotations

import logging
import logging.handlers
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# 10 MB per file, 10 files kept => ~100 MB ceiling per stream.
MAX_BYTES = int(os.getenv("HELPOTRON_LOG_MAX_BYTES", str(10 * 1024 * 1024)))
BACKUP_COUNT = int(os.getenv("HELPOTRON_LOG_BACKUPS", "10"))

# Marker attribute so repeated calls (import + startup hook, or a reload) never
# stack duplicate handlers onto the same logger.
_MARKER = "_helpotron_persistent_handler"

# Timestamps are the point: uvicorn's own access formatter emits none, so a
# stdout capture could never tell you *when* a request happened.
_ACCESS_FMT = logging.Formatter(
    "%(asctime)s %(levelname)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S%z"
)
_ERROR_FMT = logging.Formatter(
    "%(asctime)s %(levelname)s [%(name)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S%z"
)


def log_dir() -> Path:
    """Resolved log directory (env override, else <repo>/data/logs)."""
    return Path(os.getenv("HELPOTRON_LOG_DIR", str(BASE_DIR / "data" / "logs")))


def _attach(logger_name: str, path: Path, formatter: logging.Formatter) -> bool:
    """Attach one rotating file handler to `logger_name`. Idempotent."""
    target = logging.getLogger(logger_name)
    for existing in target.handlers:
        if getattr(existing, _MARKER, None) == str(path):
            return False  # already installed by a previous call
    handler = logging.handlers.RotatingFileHandler(
        path, maxBytes=MAX_BYTES, backupCount=BACKUP_COUNT, encoding="utf-8"
    )
    handler.setFormatter(formatter)
    handler.setLevel(logging.INFO)
    setattr(handler, _MARKER, str(path))
    target.addHandler(handler)
    # uvicorn sets `uvicorn.access` to propagate=False and can leave a logger
    # disabled when a custom log_config is supplied; make sure records actually
    # reach our handler.
    target.disabled = False
    if target.level == logging.NOTSET or target.level > logging.INFO:
        target.setLevel(logging.INFO)
    return True


def install(logger: logging.Logger | None = None) -> dict[str, str]:
    """Install persistent access/error file logging.

    Safe to call more than once and safe to call before or after uvicorn has
    configured logging. Returns a mapping of stream name -> file path for the
    streams that were successfully wired up (empty dict if logging to file is
    unavailable, e.g. a read-only filesystem).
    """
    log = logger or logging.getLogger("helpotron")
    directory = log_dir()
    try:
        directory.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        log.warning(
            "access logging: cannot create log dir %s (%s) — falling back to "
            "stdout logging only. Set HELPOTRON_LOG_DIR to a writable path.",
            directory, exc,
        )
        return {}

    installed: dict[str, str] = {}
    streams = (
        # (logger name, file name, formatter)
        ("uvicorn.access", "access.log", _ACCESS_FMT),
        ("uvicorn.error", "error.log", _ERROR_FMT),
        ("helpotron", "app.log", _ERROR_FMT),
    )
    for name, filename, fmt in streams:
        path = directory / filename
        try:
            _attach(name, path, fmt)
        except OSError as exc:
            log.warning("access logging: cannot open %s (%s)", path, exc)
            continue
        installed[name] = str(path)

    if installed:
        log.info(
            "access logging: persistent logs at %s (rotating, %d bytes x %d)",
            directory, MAX_BYTES, BACKUP_COUNT,
        )
    return installed
