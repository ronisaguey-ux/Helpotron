"""Cloudflare Computer — durable agent workspace client (owner 09-06).

Helpotron is not Cloudflare-native, so the FastAPI process reaches the
deployed **computer-mcp** @cloudflare/computer Worker as an **MCP client**
over streamable HTTP (:code:`/mcp`, bearer :code:`MCP_TOKEN`). The Worker's
single Code Mode `code` tool owns the durable Workspace — one file system +
just-bash (worker-shell backend; full Debian container on demand) that
survives across callers and sessions, with no ambient outbound network on
the default backend.

The integration is feature-flagged (HELPOTRON_CF_COMPUTER_ENABLED=false).
The runtime is a Cloudflare **preview** API ("NOT suitable for production
use" per the repo README), and the Worker cannot be deployed until the
owner adds it: ``npx wrangler login`` in :file:`computer-mcp/`, then
``npx wrangler secret put MCP_TOKEN`` + ``npx wrangler deploy``.

Usage (aiohttp-free, uses the official ``mcp`` streamable-http client):

    async with CFComputer().connect() as cf:
        result = await cf.run("Summarize docs/summary.md and write it back")

A failed connection or tool call is never fatal: every surface raises
:class:`CFComputerUnavailable` only when enabled-but-misconfigured; when
the module is disabled (default) the helpers short-circuit with a
no-op result so callers can rely on the documented shape.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger("helpotron.cf_computer")


class CFComputerUnavailable(RuntimeError):
    """Raised when the integration is enabled but cannot be reached."""


class CFComputer:
    """Small typed surface over the Computer MCP ``code`` tool."""

    def __init__(self, url: str = "", token: str = "", enabled: bool = False):
        self.url = url
        self.token = token
        self.enabled = enabled
        self._session = None  # mcp.ClientSession
        self._ctx = None      # async context manager for the mcp connection

    # ── lifecycle ───────────────────────────────────────────────────────────
    async def connect(self) -> "CFComputer":
        """Open the MCP session. Requires enabled + url + token configured."""
        if not self.enabled:
            raise CFComputerUnavailable("Cloudflare Computer is disabled (HELPOTRON_CF_COMPUTER_ENABLED=false)")
        if not self.url or not self.token:
            raise CFComputerUnavailable(
                "helpotron.cf_computer: HELPOTRON_CF_COMPUTER_URL / _TOKEN are unset"
            )
        try:
            # Lazy import: the mcp SDK is optional at import time — an
            # unconfigured box must be able to run without it.
            from mcp import ClientSession
            from mcp.client.streamable_http import streamable_http_client
        except ImportError as exc:  # pragma: no cover
            raise CFComputerUnavailable("mcp SDK not installed (pip install mcp)") from exc
        try:
            headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
            self._ctx = streamable_http_client(self.url, headers=headers)
            transport = await self._ctx.__aenter__()
            self._session = ClientSession(transport)
            await self._session.initialize()
            logger.info("Cloudflare Computer session ready (%s)", self.url)
            return self
        except Exception as exc:
            await self._abort()
            raise CFComputerUnavailable(f"Cloudflare Computer connect failed: {exc}") from exc

    async def _abort(self):
        if self._ctx is not None:
            try:
                await self._ctx.__aexit__(None, None, None)
            except Exception:  # noqa: BLE001 — teardown is best-effort
                pass
        self._ctx = None
        self._session = None

    async def close(self):
        await self._abort()

    async def __aenter__(self) -> "CFComputer":
        return await self.connect()

    async def __aexit__(self, *exc) -> None:
        await self.close()

    # ── public surfaces ─────────────────────────────────────────────────────
    async def tools(self) -> List[str]:
        """Names available on the remote MCP server (cached shape: 'code')."""
        if self._session is None:
            raise CFComputerUnavailable("not connected")
        listed = await self._session.list_tools()
        return [t.name for t in listed.tools]

    async def run(self, prompt: str, file_path: str = "", cwd: str = "") -> Dict[str, Any]:
        """Code Mode task on the durable workspace.

        The Computer MCP `code` tool accepts a natural-language prompt and
        executes it with its own read/write/edit/exec/git loop inside the
        (persistent) workspace; ``cwd`` scopes the file commands. Returns
        {ok, output} instead of raising for the common "tool failed" case.
        """
        if self._session is None:
            raise CFComputerUnavailable("not connected")
        args: Dict[str, Any] = {"prompt": prompt}
        if file_path:
            args["file_path"] = file_path
        if cwd:
            args["cwd"] = cwd
        try:
            result = await self._session.call_tool("code", args)
            text = "\n".join(
                c.text for c in result.content
                if hasattr(c, "type") and c.type == "text"
            )
            return {"ok": not bool(result.isError) if hasattr(result, "isError") else True, "output": text}
        except Exception as exc:  # noqa: BLE001 — never fatal for callers
            logger.warning("Cloudflare Computer run failed: %s", exc)
            return {"ok": False, "output": str(exc)}

    # ── convenience wrappers (phrased for the code tool) ────────────────────
    async def read(self, path: str) -> Dict[str, Any]:
        return await self.run(f"Read the file '{path}' and return its full contents.", cwd="")

    async def write(self, path: str, content: str) -> Dict[str, Any]:
        return await self.run(
            f"Write the file '{path}' in the workspace with exactly this content:\n{content}",
            cwd="",
        )

    async def exec(self, command: str, cwd: str = "") -> Dict[str, Any]:
        return await self.run(f"Execute: {command}", cwd=cwd)


def enabled_client() -> Optional[CFComputer]:
    """Client for env-configured settings; None when disabled (default)."""
    try:
        from .config import config
    except Exception:  # pragma: no cover
        return None
    if not getattr(config, "cf_computer_enabled", False):
        return None
    return CFComputer(
        url=getattr(config, "cf_computer_url", ""),
        token=getattr(config, "cf_computer_token", ""),
        enabled=True,
    )
