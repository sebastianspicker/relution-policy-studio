"""Downloaded vendor source content handling."""

from __future__ import annotations

from html.parser import HTMLParser
import re
from pathlib import Path
from urllib.request import build_opener

from _harvest_vendor_guidance_modules.vendor_source_safety import (
    trusted_vendor_source_request,
    validate_vendor_source_url,
)


PUBLIC_TOKEN_REDACTIONS: tuple[tuple[bytes, bytes], ...] = (
    (rb"AIza[0-9A-Za-z_-]{30,45}", b"[REDACTED_GOOGLE_API_KEY]"),
    (rb"pk_live_[0-9A-Za-z]{40,120}", b"[REDACTED_STRIPE_PUBLISHABLE_KEY]"),
)
MAX_VENDOR_DOWNLOAD_BYTES = 25 * 1024 * 1024


class TextExtractor(HTMLParser):
    """Collect normalized text content from downloaded vendor HTML."""

    def __init__(self) -> None:
        """Initialize the ordered collection of visible text fragments."""

        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        """Store non-empty parser text with internal whitespace collapsed."""

        text = " ".join(data.split())
        if text:
            self.parts.append(text)

    def text(self) -> str:
        """Return the collected HTML text as newline-separated normalized chunks."""

        return "\n".join(self.parts)


def download_vendor_source(
    source_id: str, url: str
) -> tuple[bytes, dict[str, str], str]:
    """Download a trusted vendor URL with size and final-URL validation."""

    request = trusted_vendor_source_request(url)
    with build_opener().open(request, timeout=60) as response:
        validate_vendor_source_url(response.url)
        body = response.read(MAX_VENDOR_DOWNLOAD_BYTES + 1)
        if len(body) > MAX_VENDOR_DOWNLOAD_BYTES:
            raise ValueError(
                f"Vendor source {source_id} exceeds {MAX_VENDOR_DOWNLOAD_BYTES} bytes"
            )
        return body, dict(response.headers.items()), response.url


def redact_public_tokens(body: bytes) -> bytes:
    """Replace public token-shaped values in downloaded HTML before committing it."""

    redacted = body
    for pattern, replacement in PUBLIC_TOKEN_REDACTIONS:
        redacted = re.sub(pattern, replacement, redacted)
    return redacted


def extract_text(path: Path, body: bytes) -> str:
    """Extract searchable text from a downloaded source body."""

    if path.suffix == ".zip":
        return f"Binary ZIP archive saved at {path.name}."
    parser = TextExtractor()
    parser.feed(body.decode("utf8", errors="ignore"))
    return parser.text()
