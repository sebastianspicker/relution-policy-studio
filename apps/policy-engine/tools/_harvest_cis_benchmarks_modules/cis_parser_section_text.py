"""Text normalization helpers for CIS recommendation sections."""
from __future__ import annotations

import re

from _harvest_cis_benchmarks_modules.cis_text_collections import normalize_space
from _harvest_cis_benchmarks_modules.cis_parser_constants import LIST_ITEM_RE, RECOMMENDED_STATE_RE

def parse_profile_lines(lines: list[str]) -> list[str]:
    """Normalize profile-applicability bullets from a recommendation block."""
    parsed: list[str] = []
    for line in lines:
        normalized = normalize_space(line)
        if not normalized:
            continue
        parsed.append(normalized.lstrip("• ").strip())
    return parsed


def join_section_text(lines: list[str]) -> str:
    """Join section lines into paragraph text while preserving blank breaks."""
    paragraphs: list[str] = []
    buffer: list[str] = []
    for line in lines:
        normalized = normalize_space(line)
        if not normalized:
            if buffer:
                paragraphs.append(" ".join(buffer))
                buffer = []
            continue
        buffer.append(normalized)
    if buffer:
        paragraphs.append(" ".join(buffer))
    return "\n\n".join(paragraphs).strip()


def parse_references(lines: list[str]) -> list[str]:
    """Parse numbered CIS reference lines into stable reference strings."""
    references: list[str] = []
    buffer = ""
    for line in lines:
        normalized = normalize_space(line)
        if not normalized:
            continue
        if LIST_ITEM_RE.match(normalized):
            if buffer:
                references.append(buffer)
            buffer = LIST_ITEM_RE.sub("", normalized, count=1)
            continue
        if buffer:
            buffer = f"{buffer} {normalized}".strip()
    if buffer:
        references.append(buffer)
    return references


def infer_recommended_value(title: str, description: str) -> str | None:
    """Infer the recommended setting value from description text or title."""
    description_match = RECOMMENDED_STATE_RE.search(description)
    if description_match is not None:
        return normalize_space(description_match.group("value")).rstrip(".")
    title_match = re.search(r"is set to ['\"](?P<value>.+?)['\"]", title)
    if title_match is not None:
        return title_match.group("value")
    return None
