"""SSRF protection utility for validating outbound HTTP requests.

Guards against Server-Side Request Forgery by ensuring that user-supplied URLs
resolve strictly to public, routable IP addresses. Blocks loopback (127.0.0.0/8, ::1),
private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), link-local/cloud metadata
(169.254.169.254), multicast, IPv4-mapped IPv6, and non-HTTP/HTTPS schemes.
"""
from __future__ import annotations

import ipaddress
import logging
import socket
from urllib.parse import urljoin, urlparse

logger = logging.getLogger("helpotron.ssrf")

BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",
    "metadata.goog",
    "instance-data",
}


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

    hostname_lower = hostname.lower().strip("[]")

    if hostname_lower in BLOCKED_HOSTNAMES:
        return False

    # Check if the hostname itself is directly an IP literal
    try:
        ip_obj = ipaddress.ip_address(hostname_lower)
        if _is_disallowed_ip(ip_obj):
            return False
        return True
    except ValueError:
        pass  # Hostname is a domain name, resolve via DNS

    try:
        addr_info = socket.getaddrinfo(hostname_lower, None, proto=socket.IPPROTO_TCP)
        if not addr_info:
            return False

        for family, _, _, _, sockaddr in addr_info:
            ip_str = sockaddr[0]
            ip_obj = ipaddress.ip_address(ip_str)
            if _is_disallowed_ip(ip_obj):
                return False

        return True
    except (socket.gaierror, socket.herror, Exception) as exc:
        logger.debug("SSRF DNS resolution failed for %s: %s", hostname_lower, exc)
        return False


def _is_disallowed_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Check if an IP address belongs to internal, loopback, link-local, or cloud metadata ranges."""
    # Check IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
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

    # Explicit check for 169.254.169.254 (Cloud metadata)
    if str(ip) == "169.254.169.254":
        return True

    return False


def validate_safe_url(url: str) -> None:
    """Raise ValueError if the URL is not safe for outbound requests."""
    if not is_safe_url(url):
        raise ValueError(f"URL is blocked by SSRF security policy: {url}")


async def check_redirect_ssrf(response) -> None:
    """httpx response hook to validate that HTTP redirects stay within safe public IP boundaries."""
    if response.is_redirect:
        location = response.headers.get("Location")
        if location:
            target_url = urljoin(str(response.url), location)
            if not is_safe_url(target_url):
                raise ValueError(f"Redirect target blocked by SSRF security policy: {target_url}")
