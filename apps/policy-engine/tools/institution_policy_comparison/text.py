"""Policy text parsing for institution policy baseline comparison."""

from __future__ import annotations

import re
from typing import Any

from .constants import TARGET_KEYWORDS
from .identifiers import (
    identifier_like_tokens,
    is_policy_id,
)
from .targeting import target_platform
from .utils import (
    normalize_text,
    offset_to_line,
)


def infer_targets(platform: str, block: str) -> list[str]:
    """Infer likely Relution targets from policy text and platform keywords."""

    haystack = normalize_text(block)
    targets = []
    for target, keywords in TARGET_KEYWORDS.items():
        if target_platform(target) != platform:
            continue
        if target in block or any(keyword in haystack for keyword in keywords):
            targets.append(target)
    return sorted(set(targets))


def extract_signal_text(block: str) -> str:
    """Keep the policy section text that is useful for target matching."""

    lines = []
    for line in block.splitlines():
        if re.match(
            (
                "^#{3,4}\\s+(?:Nebenwirkungen|Voraussetzungen|Verifikation|Rollback|Quellen|Cont"
                "rols-Mapping)"
            ),
            line,
        ):
            break
        lines.append(line)
    return "\n".join(lines)


def markdown_headings(text: str, line_starts: list[int]) -> list[dict[str, Any]]:
    """Extract level 2-4 Markdown headings with byte offsets and line numbers."""

    headings = []
    offset = 0
    for line in text.splitlines(keepends=True):
        stripped = line.rstrip("\r\n")
        marker_length = len(stripped) - len(stripped.lstrip("#"))
        if (
            2 <= marker_length <= 4
            and stripped[marker_length : marker_length + 1].isspace()
        ):
            headings.append(
                {
                    "level": marker_length,
                    "title": stripped[marker_length:].strip(),
                    "start": offset,
                    "line": offset_to_line(line_starts, offset),
                }
            )
        offset += len(line)
    return headings


def find_policy_id(text: str) -> str | None:
    """Return the first institution policy id embedded in heading text."""

    for token in identifier_like_tokens(text):
        if is_policy_id(token):
            return token
    return None
