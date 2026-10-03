"""Transactional refresh of allowlisted official BSI source bodies."""

from __future__ import annotations

import hashlib
from html.parser import HTMLParser
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, build_opener

from _tooling_text_io import read_json

from .bsi_ruleset_artifacts import write_json
from .bsi_source_core import BSI_DIR, REPO_ROOT


MAX_BSI_DOWNLOAD_BYTES = 50 * 1024 * 1024
STATUS_PATH = (
    REPO_ROOT / "example" / "recommendation-coverage" / "bsi-refresh-status.json"
)


class _HtmlText(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        text = " ".join(data.split())
        if text:
            self.parts.append(text)


def refresh_bsi_sources() -> dict[str, Any]:
    """Attempt every official URL and replace source bodies only as a complete set."""

    sources = read_json(BSI_DIR / "sources.json")
    target = BSI_DIR / "downloads"
    checked_at = (
        datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    )
    checks: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="bsi-refresh-", dir=BSI_DIR.parent) as temp:
        staged = Path(temp) / "downloads"
        staged.mkdir()
        retained_derived = target / "pdf-xlsx-html"
        if retained_derived.exists():
            shutil.copytree(retained_derived, staged / "pdf-xlsx-html")
        manifest = []
        for source in sources:
            try:
                entry = download_source(source, staged, checked_at)
            except Exception as error:
                checks.append(
                    {
                        "sourceId": source["id"],
                        "url": source["url"],
                        "outcome": "failed",
                        "errorType": type(error).__name__,
                        "error": str(error),
                    }
                )
            else:
                manifest.append(entry)
                checks.append(
                    {
                        "sourceId": source["id"],
                        "url": source["url"],
                        "finalUrl": entry["finalUrl"],
                        "outcome": "downloaded",
                        "sha256": entry["sha256"],
                        "sizeBytes": entry["sizeBytes"],
                    }
                )
        failed = [row for row in checks if row["outcome"] == "failed"]
        if failed:
            return {
                "schemaVersion": 1,
                "checkedAt": checked_at[:10],
                "outcome": "failed-retained-previous-snapshot",
                "retainedPreviousSnapshot": True,
                "checks": checks,
            }
        write_json(staged / "manifest.json", manifest)
        backup = Path(temp) / "retained-downloads"
        if target.exists():
            target.replace(backup)
        try:
            staged.replace(target)
        except Exception:
            if backup.exists() and not target.exists():
                backup.replace(target)
            raise
    return {
        "schemaVersion": 1,
        "checkedAt": checked_at[:10],
        "outcome": "refreshed-transactionally",
        "retainedPreviousSnapshot": False,
        "checks": checks,
    }


def download_source(
    source: dict[str, Any], downloads: Path, downloaded_at: str
) -> dict[str, Any]:
    """Download one BSI URL with host, redirect, and size validation."""

    source_id = str(source["id"])
    url = str(source["url"])
    validate_url(url)
    request = Request(url, headers={"User-Agent": "CampusWeave-source-refresh/1.0"})
    with build_opener().open(request, timeout=60) as response:
        validate_url(response.url)
        body = response.read(MAX_BSI_DOWNLOAD_BYTES + 1)
        if len(body) > MAX_BSI_DOWNLOAD_BYTES:
            raise ValueError(f"BSI source {source_id} exceeds download size limit")
        headers = dict(response.headers.items())
        final_url = response.url
    expects_pdf = urlparse(url).path.lower().endswith(".pdf")
    if expects_pdf and not body.startswith(b"%PDF"):
        content_type = headers.get("Content-Type", "unknown")
        raise ValueError(f"Official PDF URL returned non-PDF content ({content_type})")
    suffix = ".pdf" if expects_pdf else ".html"
    raw_path = downloads / "raw" / f"{source_id}{suffix}"
    headers_path = downloads / "headers" / f"{source_id}.headers.txt"
    text_path = downloads / "text" / f"{source_id}.txt"
    for path in (raw_path, headers_path, text_path):
        path.parent.mkdir(parents=True, exist_ok=True)
    raw_path.write_bytes(body)
    headers_path.write_text(
        "".join(f"{key}: {value}\n" for key, value in sorted(headers.items())),
        encoding="utf8",
    )
    text_path.write_text(extract_text(raw_path, body), encoding="utf8")
    return {
        "id": source_id,
        "title": source["title"],
        "url": url,
        "finalUrl": final_url,
        "type": source["type"],
        "scope": source["scope"],
        "documentDate": source.get("document_date"),
        "verifiedAsOf": source.get("verified_as_of"),
        "localPath": relative_path(raw_path),
        "headersPath": relative_path(headers_path),
        "textPath": relative_path(text_path),
        "contentType": headers.get("Content-Type", "application/octet-stream"),
        "sizeBytes": len(body),
        "sha256": hashlib.sha256(body).hexdigest(),
        "downloadedAt": downloaded_at,
        "note": source.get("note"),
    }


def extract_text(path: Path, body: bytes) -> str:
    """Extract searchable HTML or PDF text for the checked source body."""

    if path.suffix == ".pdf":
        result = subprocess.run(
            ["pdftotext", "-layout", str(path), "-"],
            check=True,
            capture_output=True,
        )
        return result.stdout.decode("utf8", errors="replace")
    parser = _HtmlText()
    parser.feed(body.decode("utf8", errors="ignore"))
    return "\n".join(parser.parts)


def validate_url(url: str) -> None:
    """Allow only HTTPS BSI publication hosts."""

    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in {
        "www.bsi.bund.de",
        "bsi.bund.de",
    }:
        raise ValueError("BSI refresh URL must use the official bsi.bund.de HTTPS host")


def relative_path(path: Path) -> str:
    return path.resolve().relative_to(REPO_ROOT).as_posix()


def write_refresh_status(status: dict[str, Any]) -> None:
    """Persist the per-URL refresh outcome for provenance reporting."""

    write_json(STATUS_PATH, status)
