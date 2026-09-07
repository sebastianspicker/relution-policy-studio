"""Semantic-link construction for Relution ruleset artifacts."""

from __future__ import annotations

from typing import Any

from _recommendation_mapping_modules.field_matching_values import flatten_value_paths

from .artifact_io_semantics import semantic_concept_ids_for_target_spec
from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order
from .mapping_exact_targets import exact_mappings, mapping_target
from .ruleset_semantic_core import (
    append_unique,
    empty_semantic_concept,
    ensure_semantic_target,
    semantic_target_id,
)


def add_recommendation_target_link(context: dict[str, Any]) -> str:
    """Link a recommendation to a semantic target and its resolved concepts."""

    targets = context["targets"]
    concepts = context["concepts"]
    platform = context["platform"]
    spec = context["spec"]
    recommendation_id = context["recommendationId"]
    concept_ids = context["conceptIds"]
    link_kind = context["linkKind"]
    target_id = semantic_target_id(
        platform, str(spec["kind"]), str(spec["target"]), list(spec["fieldPaths"])
    )
    target = ensure_semantic_target(
        targets,
        platform,
        str(spec["kind"]),
        str(spec["target"]),
        list(spec["fieldPaths"]),
    )
    recommendation_key = (
        "exactRecommendationIds"
        if link_kind == "exact"
        else "candidateRecommendationIds"
    )
    append_unique(target[recommendation_key], recommendation_id)
    for concept_id in concept_ids:
        if not concept_id:
            continue
        concept = concepts.setdefault(concept_id, empty_semantic_concept(concept_id))
        append_unique(target["conceptIds"], concept_id)
        append_unique(concept["relutionTargetIds"], target_id)
        append_unique(concept["recommendationIds"], recommendation_id)
        append_unique(concept[recommendation_key], recommendation_id)
    return target_id


def target_link_concept_ids(
    targets: dict[str, dict[str, Any]],
    platform: str,
    spec: dict[str, Any],
    raw_semantic_ids: list[str],
) -> list[str]:
    """Resolve concept ids for a recommendation target link in precedence order."""

    target = ensure_semantic_target(
        targets,
        platform,
        str(spec["kind"]),
        str(spec["target"]),
        list(spec["fieldPaths"]),
    )
    target_concept_ids = [
        str(concept_id)
        for concept_id in target.get("conceptIds", [])
        if isinstance(concept_id, str)
    ]
    explicit_concept_id = spec.get("semanticConceptId")
    if isinstance(explicit_concept_id, str) and explicit_concept_id:
        return [explicit_concept_id]
    mapped_concept_ids = semantic_concept_ids_for_target_spec(platform, spec)
    if mapped_concept_ids:
        overlap = [
            concept_id
            for concept_id in raw_semantic_ids
            if concept_id in mapped_concept_ids
        ]
        return unique_preserving_order(overlap or mapped_concept_ids)
    overlap = [
        concept_id
        for concept_id in raw_semantic_ids
        if concept_id in target_concept_ids
    ]
    if overlap:
        return unique_preserving_order(overlap)
    return unique_preserving_order(target_concept_ids)


def exact_target_specs(recommendation: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract exact mapping target specs for semantic-index linking."""

    specs = []
    for mapping in exact_mappings(recommendation):
        target = mapping_target(mapping)
        if target is None:
            continue
        specs.append(
            {
                "kind": str(mapping["kind"]),
                "target": target,
                "fieldPaths": flatten_value_paths(mapping.get("values", {})),
                "values": mapping.get("values", {}),
                **(
                    {"match": mapping["match"]}
                    if isinstance(mapping.get("match"), dict)
                    else {}
                ),
            }
        )
    return specs
