"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

import re
from pathlib import Path

from _tooling_text_io import slugify as _slugify

from .bsi_plusplus_platform_context import GS_PLUSPLUS_STOPWORDS
from .bsi_source_core import REPO_ROOT


def slugify(value: str) -> str:
    """Expose the shared slugifier to legacy BSI parser consumers."""

    return _slugify(value)


def local_name(tag: str) -> str:
    """Return an XML tag name without its namespace prefix."""

    return tag.split("}", 1)[1] if "}" in tag else tag


def normalize_space(text: str) -> str:
    """Collapse whitespace in extracted source text."""

    return " ".join(text.split())


def relative_repo_path(path: Path) -> str:
    """Return a repository-relative POSIX path for a source artifact."""

    return path.resolve().relative_to(REPO_ROOT).as_posix()


def normalize_for_match(text: str) -> str:
    """Normalize German/English text for token-based matching."""

    normalized = text.lower()
    normalized = (
        normalized.replace("ä", "ae")
        .replace("ö", "oe")
        .replace("ü", "ue")
        .replace("ß", "ss")
    )
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return normalize_space(normalized)


def token_set(text: str) -> set[str]:
    """Return significant normalized tokens for BSI matching."""

    return {
        token
        for token in normalize_for_match(text).split()
        if len(token) >= 5 and token not in GS_PLUSPLUS_STOPWORDS
    }


def shorten(text: str, max_length: int) -> str:
    """Shorten normalized text with an ellipsis when needed."""

    normalized = normalize_space(text)
    if len(normalized) <= max_length:
        return normalized
    return normalized[: max_length - 1].rstrip() + "..."
