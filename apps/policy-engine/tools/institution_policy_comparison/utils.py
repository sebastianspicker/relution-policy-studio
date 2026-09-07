"""General-purpose helpers for institution policy baseline comparison."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .constants import PLATFORMS


def first_int(text: str, pattern: str) -> int | None:
    """Return the first captured integer for a regex pattern."""

    match = re.search(pattern, text, re.IGNORECASE)
    return int(match.group(1)) if match else None


def normalize_text(value: str) -> str:
    """Normalize text just enough for keyword containment matching."""

    return value.lower().replace("‑", "-").replace("–", "-")


def identifier_tokens(value: str) -> list[str]:
    """Split identifier-like text into lowercase tokens for matching."""

    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
    return [
        token.lower() for token in re.split(r"[^A-Za-z0-9]+", spaced) if len(token) >= 3
    ]


def one_line(value: str) -> str:
    """Collapse whitespace for short report excerpts."""

    return re.sub(r"\s+", " ", value).strip()


def path_to_string(path: tuple[str, ...]) -> str:
    """Render a flattened value path as dotted text."""

    return ".".join(path)


def line_start_offsets(text: str) -> list[int]:
    """Return offsets for the start of each line."""

    offsets = [0]
    for match in re.finditer(r"\n", text):
        offsets.append(match.end())
    return offsets


def offset_to_line(offsets: list[int], offset: int) -> int:
    """Map a text offset to a one-based line number."""

    line = 1
    for index, start in enumerate(offsets, start=1):
        if start > offset:
            break
        line = index
    return line


def platform_rank(platform: str) -> int:
    """Return stable sort order for known platforms."""

    return PLATFORMS.index(platform) if platform in PLATFORMS else 99


def stable_json(value: Any) -> str:
    """Serialize values deterministically for conflict comparison."""

    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def read_json(path: Path) -> Any:
    """Read a UTF-8 JSON artifact from disk."""

    return json.loads(path.read_text(encoding="utf8"))


def write_json(path: Path, payload: Any) -> None:
    """Write a deterministic UTF-8 JSON artifact."""

    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )

