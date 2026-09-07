"""Summary calculations for institution policy baseline comparison."""

from __future__ import annotations

from collections import Counter
from typing import Any

from .constants import PLATFORMS


def summarize_by_platform(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Count records overall and by platform."""

    by_platform = Counter(row["platform"] for row in rows)
    return {"total": len(rows), "byPlatform": dict(sorted(by_platform.items()))}


def comparison_summary_by_platform(
    results: list[dict[str, Any]], missing: list[dict[str, Any]]
) -> dict[str, Any]:
    """Summarize comparison statuses and missing targets per platform."""

    summary = {}
    for platform in PLATFORMS:
        platform_results = [row for row in results if row["platform"] == platform]
        summary[platform] = {
            "institutionPolicies": len(platform_results),
            "statusCounts": dict(
                sorted(Counter(row["status"] for row in platform_results).items())
            ),
            "baselineMissingInInstitution": len(
                [row for row in missing if row["platform"] == platform]
            ),
        }
    return summary
