"""SSRF protection utility for validating outbound HTTP requests.

Guards against Server-Side Request Forgery by ensuring that user-supplied URLs
resolve strictly to public, routable IP addresses. Blocks loopback (127.0.0.0/8, ::1),
private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), link-local/cloud metadata
(169.254.169.254), multicast, IPv4-mapped IPv6, and non-HTTP/HTTPS schemes.
Includes DNS-rebinding protection via literal IP pinning at TCP connect time.
"""
from __future__ import annotations

import ipaddress
import logging
import socket
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import httpcore
import httpx

logger = logging.getLogger("helpotron.ssrf")

BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",
    "metadata.goog",
    "instance-data",
}

DISALLOWED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),     # Carrier-grade NAT
    ipaddress.ip_network("127.0.0.0/8"),      # IPv4 loopback
    ipaddress.ip_network("169.254.0.0/16"),    # Link-local / Cloud metadata
    ipaddress.ip_network("172.16.0.0/12"),    # Private-use networks
    ipaddress.ip_network("192.0.0.0/24"),     # IETF Protocol Assignments
    ipaddress.ip_network("192.0.2.0/24"),     # Documentation (TEST-NET-1)
    ipaddress.ip_network("192.168.0.0/16"),   # Private-use networks
    ipaddress.ip_network("198.18.0.0/15"),    # Network benchmark tests
    ipaddress.ip_network("198.51.100.0/24"),  # Documentation (TEST-NET-2)
    ipaddress.ip_network("203.0.113.0/24"),   # Documentation (TEST-NET-3)
    ipaddress.ip_network("224.0.0.0/4"),      # Multicast
    ipaddress.ip_network("240.0.0.0/4"),      # Reserved
    ipaddress.ip_network("255.255.255.255/32"),
    # IPv6
    ipaddress.ip_network("::1/128"),          # Loopback
    ipaddress.ip_network("::/128"),           # Unspecified
    ipaddress.ip_network("::ffff:0:0/96"),    # IPv4-mapped
    ipaddress.ip_network("64:ff9b::/96"),     # IPv4/IPv6 translation
    ipaddress.ip_network("100::/64"),         # Discard-only prefix
    ipaddress.ip_network("2001::/32"),        # TEREDO
    ipaddress.ip_network("2001:20::/28"),     # ORCHIDv2
    ipaddress.ip_network("2001:db8::/32"),    # Documentation
    ipaddress.ip_network("2002::/16"),        # 6to4
    ipaddress.ip_network("fc00::/7"),         # Unique local address (ULA)
    ipaddress.ip_network("fe80::/10"),        # Link-local unicast
    ipaddress.ip_network("ff00::/8"),         # Multicast
]


def _is_disallowed_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Check if an IP address belongs to internal, loopback, link-local, or cloud metadata ranges."""
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped

    if (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        return True

    for net in DISALLOWED_NETWORKS:
        if ip in net:
            return True

    if str(ip) == "169.254.169.254":
        return True

    return False


def resolve_and_validate_host(host: str, port: int = 80) -> str:
    """Resolve host and validate that ALL resolved IPs are safe public addresses.

    Returns the pinned safe IP address string.
    Raises ValueError if host is blocked or resolves to any disallowed IP.
    """
    if not host or not isinstance(host, str):
        raise ValueError("Invalid host")

    hostname_lower = host.lower().strip("[]").strip()
    if hostname_lower in BLOCKED_HOSTNAMES:
        raise ValueError(f"Host '{host}' is blocked by SSRF security policy")

    try:
        ip_obj = ipaddress.ip_address(hostname_lower)
        if _is_disallowed_ip(ip_obj):
            raise ValueError(f"IP address '{ip_obj}' is blocked by SSRF security policy")
        return str(ip_obj)
    except ValueError:
        pass

    try:
        addr_info = socket.getaddrinfo(hostname_lower, port, proto=socket.IPPROTO_TCP)
    except Exception as exc:
        raise ValueError(f"DNS resolution failed for '{host}': {exc}") from exc

    if not addr_info:
        raise ValueError(f"No IP addresses resolved for '{host}'")

    safe_ips: List[str] = []
    for family, _, _, _, sockaddr in addr_info:
        ip_str = sockaddr[0]
        try:
            ip_obj = ipaddress.ip_address(ip_str)
        except ValueError as exc:
            raise ValueError(f"Invalid resolved IP '{ip_str}' for '{host}'") from exc
        if _is_disallowed_ip(ip_obj):
            raise ValueError(f"Resolved IP '{ip_str}' for host '{host}' is blocked by SSRF security policy")
        safe_ips.append(ip_str)

    if not safe_ips:
        raise ValueError(f"No safe IP addresses found for host '{host}'")

    return safe_ips[0]


def is_safe_url(url: str) -> bool:
    """Return True if the URL scheme is http/https and hostname resolves ONLY to safe public IPs."""
    if not url or not isinstance(url, str):
        return False

    url_str = url.strip()
    try:
        parsed = urlparse(url_str)
    except Exception:
        return False

    scheme = (parsed.scheme or "").lower()
    if scheme not in ("http", "https"):
        return False

    hostname = parsed.hostname
    if not hostname:
        return False

    port = parsed.port or (443 if scheme == "https" else 80)
    try:
        resolve_and_validate_host(hostname, port)
        return True
    except ValueError:
        return False


def validate_safe_url(url: str) -> None:
    """Raise ValueError if the URL is not safe for outbound requests."""
    if not url or not isinstance(url, str):
        raise ValueError("URL is missing or invalid")

    url_str = url.strip()
    try:
        parsed = urlparse(url_str)
    except Exception as exc:
        raise ValueError(f"URL parsing failed: {exc}") from exc

    scheme = (parsed.scheme or "").lower()
    if scheme not in ("http", "https"):
        raise ValueError(f"URL scheme '{scheme}' is not allowed (only http/https)")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL hostname is missing")

    port = parsed.port or (443 if scheme == "https" else 80)
    resolve_and_validate_host(hostname, port)


async def check_redirect_ssrf(response) -> None:
    """httpx response hook to validate that HTTP redirects stay within safe public IP boundaries."""
    if response.is_redirect:
        location = response.headers.get("Location")
        if location:
            target_url = urljoin(str(response.url), location)
            validate_safe_url(target_url)


class SSRFProtectedAnyIOBackend(httpcore.AnyIOBackend):
    """Network backend that enforces strict SSRF checks and pins IP connections."""

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Any = None,
    ) -> httpcore.AsyncNetworkStream:
        pinned_ip = resolve_and_validate_host(host, port)
        return await super().connect_tcp(
            host=pinned_ip,
            port=port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )


class SSRFProtectedSyncBackend(httpcore.SyncBackend):
    """Sync network backend that enforces strict SSRF checks and pins IP connections."""

    def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Any = None,
    ) -> httpcore.NetworkStream:
        pinned_ip = resolve_and_validate_host(host, port)
        return super().connect_tcp(
            host=pinned_ip,
            port=port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )


class SSRFProtectedAsyncTransport(httpx.AsyncHTTPTransport):
    """Async transport that connects to pinned safe IP addresses, preventing DNS rebinding TOCTOU."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pool._network_backend = SSRFProtectedAnyIOBackend()


class SSRFProtectedSyncTransport(httpx.HTTPTransport):
    """Sync transport that connects to pinned safe IP addresses, preventing DNS rebinding TOCTOU."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pool._network_backend = SSRFProtectedSyncBackend()


def create_ssrf_safe_async_client(**kwargs) -> httpx.AsyncClient:
    """Creates an httpx.AsyncClient equipped with DNS rebinding protection, IP pinning, and redirect SSRF guards."""
    if "transport" not in kwargs:
        verify = kwargs.pop("verify", True)
        cert = kwargs.pop("cert", None)
        http1 = kwargs.pop("http1", True)
        http2 = kwargs.pop("http2", False)
        limits = kwargs.pop("limits", httpx.Limits(max_connections=100, max_keepalive_connections=20))
        kwargs["transport"] = SSRFProtectedAsyncTransport(
            verify=verify,
            cert=cert,
            http1=http1,
            http2=http2,
            limits=limits,
        )
    event_hooks = kwargs.setdefault("event_hooks", {})
    response_hooks = event_hooks.setdefault("response", [])
    if check_redirect_ssrf not in response_hooks:
        response_hooks.append(check_redirect_ssrf)
    return httpx.AsyncClient(**kwargs)


def create_ssrf_safe_sync_client(**kwargs) -> httpx.Client:
    """Creates an httpx.Client equipped with DNS rebinding protection, IP pinning, and redirect SSRF guards."""
    if "transport" not in kwargs:
        verify = kwargs.pop("verify", True)
        cert = kwargs.pop("cert", None)
        http1 = kwargs.pop("http1", True)
        http2 = kwargs.pop("http2", False)
        limits = kwargs.pop("limits", httpx.Limits(max_connections=100, max_keepalive_connections=20))
        kwargs["transport"] = SSRFProtectedSyncTransport(
            verify=verify,
            cert=cert,
            http1=http1,
            http2=http2,
            limits=limits,
        )
    return httpx.Client(**kwargs)
