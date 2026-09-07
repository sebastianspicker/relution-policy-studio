"""Neutral text and JSON helpers shared by repository tooling."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


def slugify(value: str) -> str:
    """Convert identifiers and labels into stable lowercase slug fragments."""
    slug = value.lower().replace(".", "-").replace("_", "-")
    slug = re.sub(r"[^a-z0-9-]+", "-", slug)
    return re.sub(r"-{2,}", "-", slug).strip("-")


def read_json(path: Path) -> Any:
    """Read a UTF-8 JSON artifact from disk."""
    return json.loads(path.read_text(encoding="utf8"))


def write_json(path: Path, payload: Any, *, create_parents: bool = False) -> None:
    """Write a deterministic UTF-8 JSON artifact with a trailing newline."""
    if create_parents:
        path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
