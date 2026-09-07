#!/usr/bin/env python3
"""Build the tracked MDM PDF provenance manifest from the ignored cache."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import fitz


REPO_ROOT = Path(__file__).resolve().parents[1]
CACHE_ROOT = REPO_ROOT / "private" / "source-pdfs-cache"
OUTPUT = REPO_ROOT / "mdm" / "evidence" / "source-manifest.json"
REQUIRED_MDM_PATH = (
    CACHE_ROOT
    / "official-bsi"
    / "Mindeststandard_Mobile-Device-ManagementV2_0.pdf"
)
PUBLISHER_BY_PATH_FRAGMENT = {
    "cis-references": "CIS",
    "vendor-references": "Microsoft",
}
PUBLISHER_PATH_PATTERN = re.compile(
    "|".join(map(re.escape, PUBLISHER_BY_PATH_FRAGMENT))
)


def sha256_bytes(value: bytes) -> str:
    """Return a lowercase SHA-256 digest."""

    return hashlib.sha256(value).hexdigest()


def publisher_for(path: Path) -> str:
    """Infer the publisher from the cache lane."""

    value = path.as_posix().lower()
    match = PUBLISHER_PATH_PATTERN.search(value)
    return PUBLISHER_BY_PATH_FRAGMENT[match.group()] if match else "BSI"


def licence_for(publisher: str) -> str:
    """Describe the governing source terms without redistributing source text."""

    return {
        "BSI": "BSI publication terms; verify reuse terms before redistribution",
        "CIS": "CIS SecureSuite benchmark licence; local use only; do not redistribute",
        "Microsoft": "Microsoft documentation terms; local evidence only",
    }[publisher]


def version_for(path: Path, metadata: dict[str, Any]) -> str:
    """Extract a stable version label when the filename or PDF supplies one."""

    match = re.search(r"(?:_v|Version[_ -]?)(\d+(?:[._]\d+){1,3})", path.name, re.I)
    if match:
        return match.group(1).replace("_", ".")
    return str(metadata.get("subject") or "not-stated")[:160]


def date_for(metadata: dict[str, Any]) -> str:
    """Return the PDF creation date when present, without claiming publication date."""

    value = str(metadata.get("creationDate") or "")
    match = re.match(r"D:(\d{4})(\d{2})(\d{2})", value)
    return "-".join(match.groups()) if match else "not-stated"


def extract_record(path: Path) -> dict[str, Any]:
    """Hash a PDF and record deterministic page-text extraction evidence."""

    raw = path.read_bytes()
    with fitz.open(stream=raw, filetype="pdf") as document:
        page_text = [page.get_text("text", sort=True).replace("\r\n", "\n") for page in document]
        metadata = document.metadata or {}
        title = str(metadata.get("title") or path.stem).strip()
        pages = document.page_count
    publisher = publisher_for(path)
    is_mdm_standard = path == REQUIRED_MDM_PATH
    return {
        "id": sha256_bytes(path.relative_to(CACHE_ROOT).as_posix().encode("utf8"))[:16],
        "title": (
            "Mindeststandard des BSI für Mobile Device Management"
            if is_mdm_standard
            else title[:240]
        ),
        "publisher": publisher,
        "version": "2.0" if is_mdm_standard else version_for(path, metadata),
        "date": "2022-09-06" if is_mdm_standard else date_for(metadata),
        "sha256": sha256_bytes(raw),
        "local_path": path.relative_to(REPO_ROOT).as_posix(),
        "licence": licence_for(publisher),
        "scope": "offline evidence; normalized controls and short citations only",
        "extraction": {
            "status": "extracted",
            "pages": pages,
            "text_sha256": sha256_bytes("\n\f\n".join(page_text).encode("utf8")),
            "engine": f"PyMuPDF {fitz.VersionBind}",
        },
    }


def main() -> None:
    """Write a stable manifest and retain an explicit row for the missing PDF."""

    paths = sorted(CACHE_ROOT.rglob("*.pdf"), key=lambda item: item.as_posix())
    sources = [extract_record(path) for path in paths]
    if REQUIRED_MDM_PATH not in paths:
        sources.append(
            {
                "id": "bsi-mdm-minimum-standard-v2",
                "title": "Mindeststandard fuer Mobile Device Management",
                "publisher": "BSI",
                "version": "2.0",
                "date": "2022-09-06",
                "sha256": None,
                "local_path": REQUIRED_MDM_PATH.relative_to(REPO_ROOT).as_posix(),
                "licence": licence_for("BSI"),
                "scope": "primary MDM control evidence",
                "source_url": "https://www.bsi.bund.de/SharedDocs/Downloads/DE/BSI/Mindeststandards/Mindeststandard_Mobile-Device-ManagementV2_0.pdf?__blob=publicationFile&v=2",
                "extraction": {"status": "missing_local", "pages": None, "text_sha256": None, "engine": f"PyMuPDF {fitz.VersionBind}"},
            }
        )
    sources.sort(key=lambda item: str(item["local_path"]))
    payload = {
        "schema_version": 1,
        "generated_by": "tools/build_mdm_source_manifest.py",
        "expected_recovered_counts": {"BSI": 121, "CIS": 10, "Microsoft": 1},
        "required_additional_sources": 1,
        "sources": sources,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(f"Wrote {OUTPUT.relative_to(REPO_ROOT)} with {len(sources)} source rows")


if __name__ == "__main__":
    main()
