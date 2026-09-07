"""Cohesive implementation stage 3 for unified_analysis."""

from .artifact_paths import ALL_SOURCES
from typing import Any

def append_unique(values: list[Any], value: Any) -> None:
    """Append a value only when it is not already present."""

    if value not in values:
        values.append(value)

def semantic_group_for_entry(
    groups: dict[tuple[str, str], dict[str, Any]],
    concepts: dict[str, dict[str, Any]],
    platform: str,
    concept_id: str,
) -> dict[str, Any]:
    """Return the accumulator for a platform and semantic concept pair."""

    return groups.setdefault(
        (platform, concept_id),
        {
            "platform": platform,
            "conceptId": concept_id,
            "label": concepts.get(concept_id, {}).get("label", {}),
            "recommendationsBySource": {source_name: [] for source_name in ALL_SOURCES},
            "exactTargetIdsBySource": {source_name: [] for source_name in ALL_SOURCES},
            "candidateTargetIdsBySource": {
                source_name: [] for source_name in ALL_SOURCES
            },
        },
    )

def append_group_target_links(
    group: dict[str, Any],
    entry: dict[str, Any],
    source: str,
    concept_id: str,
    state: dict[str, Any],
) -> None:
    """Append target ids that actually carry the grouped semantic concept."""

    target_concepts = state["targetConcepts"]
    entry_key, group_key = state["keys"]
    for target_id in entry.get(entry_key, []):
        if isinstance(target_id, str) and concept_id in target_concepts.get(
            target_id, set()
        ):
            append_unique(group[group_key][source], target_id)

