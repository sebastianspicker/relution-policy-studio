"""Cohesive implementation stage 2 for unified_analysis."""

from typing import Any

def build_common_semantic_groups(
    semantic_index: dict[str, Any],
    recommendations: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Group recommendations that share semantic concepts across sources."""
    from .unified_exact_differences import common_group_sort_key
    from .unified_group_projection import common_semantic_group

    concepts = {
        str(concept.get("id")): concept
        for concept in semantic_index.get("concepts", [])
        if isinstance(concept, dict) and isinstance(concept.get("id"), str)
    }
    target_concepts = {
        str(target.get("id")): {
            str(concept_id)
            for concept_id in target.get("conceptIds", [])
            if isinstance(concept_id, str)
        }
        for target in semantic_index.get("relutionTargets", [])
        if isinstance(target, dict) and isinstance(target.get("id"), str)
    }
    groups: dict[tuple[str, str], dict[str, Any]] = {}
    for entry in semantic_index.get("recommendations", []):
        add_common_semantic_group_entry(
            entry, concepts, target_concepts, recommendations, groups
        )

    common_groups: list[dict[str, Any]] = []
    for group in groups.values():
        common_group = common_semantic_group(group, recommendations)
        if common_group is not None:
            common_groups.append(common_group)
    common_groups.sort(key=common_group_sort_key)
    return common_groups

def add_common_semantic_group_entry(
    entry: Any,
    concepts: dict[str, dict[str, Any]],
    target_concepts: dict[str, set[str]],
    recommendations: dict[str, dict[str, Any]],
    groups: dict[tuple[str, str], dict[str, Any]],
) -> None:
    """Add one semantic-index recommendation entry to common-group state."""
    from .unified_analysis_helpers import append_group_target_links, append_unique
    from .unified_group_projection import semantic_group_for_entry

    if (
        not isinstance(entry, dict)
        or not isinstance(entry.get("source"), str)
        or not isinstance(entry.get("platform"), str)
    ):
        return
    source = str(entry["source"])
    global_id = f"{source}:{str(entry.get('recommendationId', ''))}"
    if global_id not in recommendations:
        return
    for concept_id in [
        str(value)
        for value in entry.get("semanticConceptIds", [])
        if isinstance(value, str)
    ]:
        group = semantic_group_for_entry(
            groups, concepts, str(entry["platform"]), concept_id
        )
        append_unique(group["recommendationsBySource"][source], global_id)
        append_group_target_links(
            group,
            entry,
            source,
            concept_id,
            {
                "targetConcepts": target_concepts,
                "keys": ("exactTargetIds", "exactTargetIdsBySource"),
            },
        )
        append_group_target_links(
            group,
            entry,
            source,
            concept_id,
            {
                "targetConcepts": target_concepts,
                "keys": ("candidateTargetIds", "candidateTargetIdsBySource"),
            },
        )

