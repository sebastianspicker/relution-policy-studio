"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from .bsi_source_text import normalize_space

import re

def build_errata_map(
    errata_text: str, requirement_ids: set[str]
) -> dict[str, list[dict[str, str]]]:
    """Collect errata excerpts keyed by referenced BSI requirement ID."""

    normalized = normalize_space(errata_text)
    errata: dict[str, list[dict[str, str]]] = {}
    for requirement_id in sorted(requirement_ids):
        matches = list(re.finditer(re.escape(requirement_id), normalized))
        if not matches:
            continue
        excerpts: list[dict[str, str]] = []
        seen = set()
        for match in matches:
            start = max(0, match.start() - 320)
            end = min(len(normalized), match.end() + 520)
            excerpt = normalized[start:end].strip()
            if excerpt in seen:
                continue
            seen.add(excerpt)
            excerpts.append(
                {"sourceId": "it-grundschutz-errata-2023", "excerpt": excerpt}
            )
        errata[requirement_id] = excerpts
    return errata
