"""Reporting helpers for Relution ruleset artifacts."""

from __future__ import annotations

from typing import Any

from .artifact_paths import ALL_SOURCES


def semantic_support_level(
    exact_target_ids: list[str], candidate_target_ids: list[str]
) -> str:
    """Classify semantic support from exact links before candidate links."""

    if exact_target_ids:
        return "exact"
    if candidate_target_ids:
        return "candidate"
    return "concept-only"


def source_recommendation_counts(
    recommendations: dict[str, dict[str, Any]],
) -> dict[str, int]:
    """Count normalized recommendations by configured source id."""

    counts = {source: 0 for source in ALL_SOURCES}
    for recommendation in recommendations.values():
        source = str(recommendation.get("_source", ""))
        if source in counts:
            counts[source] += 1
    return counts


def count_by(entries: list[dict[str, Any]], key: str) -> dict[str, int]:
    """Count report entries by a single string-like field."""

    counts: dict[str, int] = {}
    for entry in entries:
        value = str(entry.get(key, ""))
        counts[value] = counts.get(value, 0) + 1
    return counts


def source_coverage_counts(groups: list[dict[str, Any]]) -> dict[str, int]:
    """Count common semantic groups by participating source combination."""

    counts: dict[str, int] = {}
    for group in groups:
        marker = "+".join(str(source) for source in group.get("sources", []))
        counts[marker] = counts.get(marker, 0) + 1
    return counts


def difference_severity_rank(entry: dict[str, Any]) -> int:
    """Return the stable severity ordering used by analysis reports."""

    return {"error": 0, "warning": 1, "info": 2}.get(str(entry.get("severity", "")), 9)
