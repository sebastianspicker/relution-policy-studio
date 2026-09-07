"""Cohesive implementation stage 5 for mapping_review_artifacts."""

from typing import Any
from .artifact_paths import REPO_ROOT
import hashlib

def classify_source_change(
    previous: dict[str, Any] | None, current: dict[str, Any] | None
) -> str:
    """Classify source drift as content, metadata, parser, new, or removed."""

    for classification, changed in (
        ("unchanged", previous is None and current is None),
        ("new-source", previous is None),
        ("removed-source", current is None),
    ):
        if changed:
            return classification
    if previous is None or current is None:
        return "unchanged"
    if current.get("textPath") and not current.get("textSha256"):
        return "parser-breaking"
    previous_content = (
        str(previous.get("sha256", "")),
        str(previous.get("textSha256", "")),
    )
    current_content = (
        str(current.get("sha256", "")),
        str(current.get("textSha256", "")),
    )
    if previous_content != current_content:
        return "text-changed"
    metadata_keys = (
        "url",
        "finalUrl",
        "title",
        "documentDate",
        "verifiedAsOf",
        "sizeBytes",
        "contentType",
    )
    if any(previous.get(key) != current.get(key) for key in metadata_keys):
        return "metadata-only"
    return "unchanged"

def source_text_hash(entry: dict[str, Any]) -> str:
    """Hash the harvested source text file declared by a manifest entry."""

    text_path = str(entry.get("textPath", ""))
    if not text_path:
        return ""
    path = REPO_ROOT / text_path
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"source_text_hash: file not found: {path}")
    return hashlib.sha256(path.read_bytes()).hexdigest()
