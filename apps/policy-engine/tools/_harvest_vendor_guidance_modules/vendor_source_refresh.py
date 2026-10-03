"""Vendor download refresh and alternate-output helpers."""

from __future__ import annotations

import hashlib
import shutil
import tempfile
from pathlib import Path
from typing import Any

from _harvest_vendor_guidance_modules.common import VENDOR_DIR
from _tooling_text_io import read_json
from _harvest_vendor_guidance_modules.vendor_mapping_text import (
    relative_output_path,
    write_json,
)
from _harvest_vendor_guidance_modules.vendor_source_content import (
    download_vendor_source,
    extract_text,
    redact_public_tokens,
)
from _harvest_vendor_guidance_modules.vendor_source_safety import (
    safe_vendor_source_id,
    validate_vendor_source_url,
    vendor_download_path,
)


def copy_downloads(output_vendor_dir: Path) -> None:
    """Copy checked-in vendor downloads into an alternate output tree."""

    source_downloads = VENDOR_DIR / "downloads"
    target_downloads = output_vendor_dir / "downloads"
    if target_downloads.exists():
        shutil.rmtree(target_downloads)
    shutil.copytree(source_downloads, target_downloads)


def refresh_downloads(output_vendor_dir: Path) -> None:
    """Refresh all sources transactionally, retaining the prior set on failure."""

    sources = read_json(VENDOR_DIR / "sources.json")
    output_vendor_dir.mkdir(parents=True, exist_ok=True)
    target = output_vendor_dir / "downloads"
    with tempfile.TemporaryDirectory(
        prefix="vendor-refresh-", dir=output_vendor_dir.parent
    ) as temporary_directory:
        staged_vendor_dir = Path(temporary_directory) / "vendor-references"
        retained_derived = target / "derived"
        if retained_derived.exists():
            shutil.copytree(
                retained_derived,
                staged_vendor_dir / "downloads" / "derived",
            )
        manifest = [
            refresh_vendor_source(source, staged_vendor_dir) for source in sources
        ]
        write_json(staged_vendor_dir / "downloads" / "manifest.json", manifest)
        staged_downloads = staged_vendor_dir / "downloads"
        backup = Path(temporary_directory) / "retained-downloads"
        if target.exists():
            target.replace(backup)
        try:
            staged_downloads.replace(target)
        except Exception:
            if backup.exists() and not target.exists():
                backup.replace(target)
            raise


def refresh_vendor_source(
    source: dict[str, Any], output_vendor_dir: Path
) -> dict[str, Any]:
    """Download one vendor source and return its manifest entry."""

    source_id = safe_vendor_source_id(str(source["id"]))
    url = str(source["url"])
    raw_path, headers_path, text_path = vendor_source_output_paths(
        output_vendor_dir, source_id, url
    )
    body, headers, final_url = download_vendor_source(source_id, url)
    if raw_path.suffix == ".html":
        body = redact_public_tokens(body)
    raw_path.write_bytes(body)
    headers_path.write_text(
        "".join(f"{key}: {value}\n" for key, value in sorted(headers.items())),
        encoding="utf8",
    )
    text_path.write_text(extract_text(raw_path, body), encoding="utf8")
    return {
        "id": source_id,
        "url": url,
        "finalUrl": final_url,
        "localPath": relative_output_path(raw_path, output_vendor_dir),
        "headersPath": relative_output_path(headers_path, output_vendor_dir),
        "textPath": relative_output_path(text_path, output_vendor_dir),
        "contentType": headers.get("Content-Type", "application/octet-stream").split(
            ";"
        )[0],
        "sizeBytes": len(body),
        "sha256": hashlib.sha256(body).hexdigest(),
    }


def vendor_source_output_paths(
    output_vendor_dir: Path, source_id: str, url: str
) -> tuple[Path, Path, Path]:
    """Return confined raw, header, and text paths for a vendor source."""

    validate_vendor_source_url(url)
    raw_suffix = ".zip" if url.lower().endswith(".zip") else ".html"
    paths = (
        vendor_download_path(output_vendor_dir, "raw", f"{source_id}{raw_suffix}"),
        vendor_download_path(output_vendor_dir, "headers", f"{source_id}.headers.txt"),
        vendor_download_path(output_vendor_dir, "text", f"{source_id}.txt"),
    )
    for path in paths:
        path.parent.mkdir(parents=True, exist_ok=True)
    return paths
