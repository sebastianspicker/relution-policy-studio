"""Cohesive implementation stage 8 for semantic_review_candidates."""

from typing import Any
import re

def exact_mapping_match_evidence(mapping: dict[str, Any]) -> dict[str, Any]:
    """Normalize exact mapping evidence for generated review artifacts."""
    match = mapping.get("match") if isinstance(mapping.get("match"), dict) else {}
    return {
        "matchedTerms": [
            str(term) for term in match.get("matchedTerms", []) if isinstance(term, str)
        ],
        "valueCompatibility": str(match.get("valueCompatibility", "exact")),
        "reason": str(
            match.get(
                "reason",
                "Exact mapping is present in the committed recommendation catalog.",
            )
        ),
    }

def count_by_nested_mapping(
    rows: list[dict[str, Any]], path: tuple[str, ...]
) -> dict[str, int]:
    """Count rows by a nested dictionary path for review summary tables."""
    counts: dict[str, int] = {}
    for row in rows:
        value: Any = row
        for key in path:
            value = value.get(key, {}) if isinstance(value, dict) else {}
        marker = str(value)
        counts[marker] = counts.get(marker, 0) + 1
    return dict(sorted(counts.items()))

def shorten_review_text(text: str, limit: int) -> str:
    """Collapse review text to a single bounded line for generated artifacts."""
    normalized = re.sub(r"\s+", " ", text).strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 1].rstrip() + "…"

