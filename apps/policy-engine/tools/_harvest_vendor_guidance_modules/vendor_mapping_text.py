"""Text and JSON helpers shared by vendor mapping modules."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from _tooling_text_io import write_json as _write_json

def tokenize(value: str) -> set[str]:
    """Tokenize vendor and Relution field text for simple matching."""

    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
    return {
        token for token in re.split(r"[^a-z0-9]+", spaced.lower()) if len(token) > 2
    }


def compact_slug(value: str) -> str:
    """Build a compact alphanumeric id suffix from a title."""

    return re.sub(r"[^a-z0-9]+", "", value.lower())[:48]


def normalize_text(value: str) -> str:
    """Collapse whitespace in vendor source text."""

    return " ".join(value.split())


def relative_output_path(path: Path, output_vendor_dir: Path) -> str:
    """Return a path relative to the generated example root."""

    return path.relative_to(output_vendor_dir.parents[1]).as_posix()


def write_json(path: Path, payload: Any) -> None:
    """Write a deterministic JSON artifact, creating its parent directory."""

    _write_json(path, payload, create_parents=True)
