"""Outbound URL and output-path safety for vendor harvesting."""

from __future__ import annotations

import ipaddress
import socket
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request

from _harvest_vendor_guidance_modules.common import SAFE_SOURCE_ID_RE


def safe_vendor_source_id(source_id: str) -> str:
    """Validate a source id before using it in output file names."""

    if not SAFE_SOURCE_ID_RE.fullmatch(source_id):
        raise ValueError(f"Unsafe vendor source id: {source_id}")
    return source_id


def vendor_download_path(output_vendor_dir: Path, subdir: str, file_name: str) -> Path:
    """Build a download output path that cannot escape the downloads root."""

    root = (output_vendor_dir / "downloads").resolve()
    target = (root / subdir / file_name).resolve()
    if target == root or root not in target.parents:
        raise ValueError(f"Vendor download path escapes output directory: {target}")
    return target


def validate_vendor_source_url(url: str) -> None:
    """Reject unsupported, hostless, local, or private vendor source URLs."""

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError(f"Unsupported vendor source URL scheme: {parsed.scheme}")
    if parsed.hostname is None:
        raise ValueError(f"Vendor source URL is missing a hostname: {url}")
    for resolved_ip in resolved_vendor_url_ips(parsed.hostname):
        if (
            resolved_ip.is_private
            or resolved_ip.is_loopback
            or resolved_ip.is_link_local
            or resolved_ip.is_multicast
            or resolved_ip.is_unspecified
        ):
            raise ValueError(
                f"Vendor source URL resolves to a local or private address: {url}"
            )


def trusted_vendor_source_request(url: str) -> Request:
    """Build a request for a validated vendor source URL."""

    validate_vendor_source_url(url)
    return Request(url, headers={"User-Agent": "rexp-studio-vendor-harvester/1.0"})


def resolved_vendor_url_ips(
    hostname: str,
) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    """Resolve a hostname or literal IP for outbound vendor URL safety checks."""

    try:
        return [ipaddress.ip_address(hostname)]
    except ValueError:
        pass
    addresses: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    for result in socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM):
        addresses.append(ipaddress.ip_address(result[4][0]))
    return addresses
