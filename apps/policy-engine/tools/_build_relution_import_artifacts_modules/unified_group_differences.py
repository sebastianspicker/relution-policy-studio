"""Cohesive implementation stage 7 for unified_analysis."""

from .artifact_paths import AUTHORITATIVE_SOURCE
from typing import Any
from .ruleset_reporting import semantic_support_level
from _tooling_text_io import slugify

def semantic_group_differences(
    common_groups: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Report BSI-authoritative coverage and support differences by group."""

    differences: list[dict[str, Any]] = []
    for group in common_groups:
        sources = list(group.get("sources", []))
        if AUTHORITATIVE_SOURCE not in sources:
            continue
        if group.get("missingSources"):
            differences.append(
                {
                    "id": slugify(f"coverage-{group['platform']}-{group['conceptId']}"),
                    "type": "source-coverage-gap",
                    "severity": "info",
                    "platform": group["platform"],
                    "conceptId": group["conceptId"],
                    "sources": sources,
                    "missingSources": group["missingSources"],
                    "authoritativeSource": AUTHORITATIVE_SOURCE,
                    "resolution": (
                        "BSI participates in this semantic group; absent CIS/vendor coverage "
                        "is noted, not remapped."
                    ),
                }
            )
        support_by_source = {
            source: semantic_support_level(
                group["exactTargetIdsBySource"].get(source, []),
                group["candidateTargetIdsBySource"].get(source, []),
            )
            for source in sources
        }
        bsi_support = support_by_source.get(AUTHORITATIVE_SOURCE)
        if bsi_support is not None and any(
            level != bsi_support for level in support_by_source.values()
        ):
            differences.append(
                {
                    "id": slugify(f"support-{group['platform']}-{group['conceptId']}"),
                    "type": "mapping-support-difference",
                    "severity": "info",
                    "platform": group["platform"],
                    "conceptId": group["conceptId"],
                    "sources": sources,
                    "supportBySource": support_by_source,
                    "authoritativeSource": AUTHORITATIVE_SOURCE,
                    "resolution": (
                        "Support-level differences are evidence for review; exact mappings remain "
                        "source-owned."
                    ),
                }
            )
    return differences
