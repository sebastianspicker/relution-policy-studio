"""Cohesive implementation stage 4 for unified_analysis."""

from .artifact_paths import ALL_SOURCES
from .artifact_paths import AUTHORITATIVE_SOURCE
from typing import Any
from _tooling_text_io import slugify


def common_semantic_group(
    group: dict[str, Any], recommendations: dict[str, dict[str, Any]]
) -> dict[str, Any] | None:
    """Render a common semantic group when at least two sources participate."""

    sources = [
        source for source in ALL_SOURCES if group["recommendationsBySource"][source]
    ]
    if len(sources) < 2:
        return None
    return {
        "id": slugify(f"{group['platform']}-{group['conceptId']}"),
        "platform": group["platform"],
        "conceptId": group["conceptId"],
        "label": group["label"],
        "sources": sources,
        "missingSources": [source for source in ALL_SOURCES if source not in sources],
        "authoritativeSource": AUTHORITATIVE_SOURCE
        if AUTHORITATIVE_SOURCE in sources
        else None,
        "sourceCounts": {
            source: len(group["recommendationsBySource"][source]) for source in sources
        },
        "recommendationsBySource": {
            source: sorted(group["recommendationsBySource"][source])
            for source in sources
        },
        "sampleRecommendations": sample_group_recommendations(
            group, recommendations, sources
        ),
        "exactTargetIdsBySource": {
            source: sorted(group["exactTargetIdsBySource"][source])
            for source in sources
        },
        "candidateTargetIdsBySource": {
            source: sorted(group["candidateTargetIdsBySource"][source])
            for source in sources
        },
        "sharedRelutionTargetIds": shared_group_targets(group, sources),
    }

def shared_group_targets(group: dict[str, Any], sources: list[str]) -> list[str]:
    """Return Relution target ids shared by at least two source mappings."""

    all_target_sources: dict[str, set[str]] = {}
    for source in sources:
        for target_id in [
            *group["exactTargetIdsBySource"][source],
            *group["candidateTargetIdsBySource"][source],
        ]:
            all_target_sources.setdefault(target_id, set()).add(source)
    return sorted(
        target_id
        for target_id, target_sources in all_target_sources.items()
        if len(target_sources) >= 2
    )

def sample_group_recommendations(
    group: dict[str, Any],
    recommendations: dict[str, dict[str, Any]],
    sources: list[str],
) -> list[dict[str, Any]]:
    """Collect bounded example recommendations for a common semantic group."""

    samples = []
    for source in sources:
        for global_id in sorted(group["recommendationsBySource"][source])[:3]:
            recommendation = recommendations.get(global_id, {})
            samples.append(
                {
                    "source": source,
                    "recommendationId": str(
                        recommendation.get("id", global_id.split(":", 1)[1])
                    ),
                    "title": str(recommendation.get("title", "")),
                    "mappingStatus": str(
                        recommendation.get("relutionMapping", {}).get("status", "none")
                    ),
                }
            )
    return samples
