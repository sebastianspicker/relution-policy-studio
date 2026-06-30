#!/usr/bin/env python3
# pylint: disable=unused-import
"""Build cross-source coverage, semantic index, and analysis artifacts."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from recommendation_mapping import (
    build_setting_index,
    semantic_concepts_for_field,
    unique_preserving_order,
)
from .mapping_helpers import (
    exact_mappings,
    iter_candidate_mapping_targets,
    iter_exact_mapping_targets,
    mapping_target,
)

from .artifact_paths import (  # noqa: F401
    REPO_ROOT,
    SourceConfig,
    SOURCE_CONFIGS,
    COVERAGE_MATRIX_PATH,
    SEMANTIC_INDEX_PATH,
    UNIFIED_ANALYSIS_PATH,
    UNIFIED_ANALYSIS_REPORT_PATH,
    EXACT_MAPPING_REFERENCE_PATH,
    MAPPING_CANDIDATE_REVIEW_PATH,
    MANUAL_MAPPING_PROMOTIONS_PATH,
    MAPPING_CANDIDATE_REVIEW_REPORT_PATH,
    SOURCE_CHANGE_REPORT_PATH,
    RULESET_UPDATE_PLAN_PATH,
    RELUTION_MAPPING_CHANGE_REPORT_PATH,
    RELUTION_MAPPING_UPDATE_PLAN_PATH,
    ALLOWED_MAPPING_STATUSES,
    MULTI_INSTANCE_TARGET_TYPES,
    AUTHORITATIVE_SOURCE,
    ALL_SOURCES,
    PLATFORM_ORDER,
)

from .recommendation_normalization import (  # noqa: F401
    implementation_category,
    implementation_for,
    normalize_fallback_translations,
    normalize_recommendations,
    normalize_relution_mapping,
    optional_dict_entries,
    optional_string_entries,
    record_mapping_diagnostic,
    valid_exact_mappings,
)
from .unified_analysis import (
    build_unified_recommendation_analysis,
    exact_leaf_difference_is_hard,
    write_unified_analysis_report as _write_unified_analysis_report,
)
from .recommendation_catalog import load_recommendations_by_global_id
from .ruleset_builder import (
    append_unique,
    candidate_target_specs,
    count_by,
    difference_severity_rank,
    ensure_semantic_concept,
    ensure_semantic_target,
    exact_target_specs,
    semantic_support_level,
    semantic_target_id,
    source_coverage_counts,
    source_recommendation_counts,
    target_link_concept_ids,
)

_COMPAT_EXPORTS = (REPO_ROOT, SourceConfig, implementation_category, implementation_for)








































def write_unified_analysis_report(payload: dict[str, Any]) -> None:
    """Write the Markdown companion report for unified recommendation analysis."""

    _write_unified_analysis_report(payload)




def required_recommendation_catalog_paths() -> list[tuple[str, Path]]:
    """Return all required source catalogs or fail with a complete missing list."""

    present: list[tuple[str, Path]] = []
    missing: list[tuple[str, Path]] = []
    for source, config in SOURCE_CONFIGS.items():
        if config.recommendation_catalog_path.exists():
            present.append((source, config.recommendation_catalog_path))
        else:
            missing.append((source, config.recommendation_catalog_path))
    if missing:
        raise FileNotFoundError(
            missing_required_inputs_message("recommendation catalogs", present, missing)
        )
    return present


def missing_required_inputs_message(
    label: str, present: list[tuple[str, Path]], missing: list[tuple[str, Path]]
) -> str:
    """Format required-input failures with present and missing source counts."""

    missing_paths = ", ".join(f"{source}:{path}" for source, path in missing)
    return (
        f"Required {label} missing: present={len(present)} missing={len(missing)} "
        f"missingInputs=[{missing_paths}]"
    )


def build_coverage_matrix() -> None:
    """Build the cross-source recommendation achievability matrix artifact."""

    rows: list[dict[str, Any]] = []
    by_source: dict[str, int] = {}
    by_platform: dict[str, int] = {}
    by_category: dict[str, int] = {}
    by_surface: dict[str, int] = {}

    for source, catalog_path in required_recommendation_catalog_paths():
        recommendations = read_json(catalog_path)
        if not isinstance(recommendations, list):
            raise ValueError(
                "Required recommendation catalog malformed: "
                f"source={source} path={catalog_path} expected list"
            )
        for recommendation in recommendations:
            implementation = recommendation.get("implementation", {})
            row = {
                "source": source,
                "recommendationId": recommendation["id"],
                "platform": recommendation["platform"],
                "title": recommendation["title"],
                "category": implementation.get("category", "gap"),
                "surfaces": list(implementation.get("surfaces", [])),
                "importableVia": list(implementation.get("importableVia", [])),
                "mappingStatus": recommendation.get("relutionMapping", {}).get(
                    "status", "none"
                ),
                "targetTypes": unique_preserving_order(
                    iter_exact_mapping_targets(recommendation)
                ),
                "candidateTargetTypes": unique_preserving_order(
                    iter_candidate_mapping_targets(recommendation)
                ),
                "blockingReasons": list(implementation.get("blockingReasons", [])),
            }
            rows.append(row)
            by_source[source] = by_source.get(source, 0) + 1
            by_platform[row["platform"]] = by_platform.get(row["platform"], 0) + 1
            by_category[row["category"]] = by_category.get(row["category"], 0) + 1
            for surface in row["surfaces"]:
                by_surface[surface] = by_surface.get(surface, 0) + 1

    rows.sort(
        key=lambda row: (
            row["source"],
            PLATFORM_ORDER.get(row["platform"], 99),
            row["platform"],
            row["recommendationId"],
        )
    )
    write_json(
        COVERAGE_MATRIX_PATH,
        {
            "version": 1,
            "name": "Relution Recommendation Achievability Matrix",
            "generatedAt": datetime.now(timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z"),
            "rows": rows,
            "summary": {
                "totalRecommendations": len(rows),
                "bySource": by_source,
                "byPlatform": by_platform,
                "byCategory": by_category,
                "bySurface": by_surface,
            },
        },
    )


def build_semantic_index() -> None:
    """Build the bidirectional semantic index linking sources to Relution fields."""

    concepts: dict[str, dict[str, Any]] = {}
    targets: dict[str, dict[str, Any]] = {}
    recommendations_index: list[dict[str, Any]] = []
    by_source: dict[str, int] = {}
    by_platform: dict[str, int] = {}

    for platform, fields in build_setting_index().items():
        add_field_semantic_links(platform, fields, concepts, targets)

    for source, catalog_path in required_recommendation_catalog_paths():
        add_catalog_semantic_links(
            source,
            catalog_path,
            {
                "concepts": concepts,
                "targets": targets,
                "recommendationsIndex": recommendations_index,
                "counters": {"bySource": by_source, "byPlatform": by_platform},
            },
        )

    for collection in (concepts.values(), targets.values()):
        for entry in collection:
            for key, value in entry.items():
                if isinstance(value, list):
                    entry[key] = sorted(value)

    recommendations_index.sort(
        key=lambda entry: (
            entry["source"],
            PLATFORM_ORDER.get(entry["platform"], 99),
            entry["platform"],
            entry["recommendationId"],
        )
    )
    concept_entries = sorted(concepts.values(), key=lambda entry: entry["id"])
    target_entries = sorted(
        targets.values(),
        key=lambda entry: (
            PLATFORM_ORDER.get(entry["platform"], 99),
            entry["platform"],
            entry["kind"],
            entry["target"],
            entry["id"],
        ),
    )
    write_json(
        SEMANTIC_INDEX_PATH,
        {
            "version": 1,
            "name": "Relution Bidirectional Semantic Index",
            "generatedAt": datetime.now(timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z"),
            "concepts": concept_entries,
            "relutionTargets": target_entries,
            "recommendations": recommendations_index,
            "summary": {
                "totalConcepts": len(concept_entries),
                "totalRelutionTargets": len(target_entries),
                "totalRecommendations": len(recommendations_index),
                "bySource": by_source,
                "byPlatform": by_platform,
            },
        },
    )


def add_field_semantic_links(
    platform: str,
    fields: list[Any],
    concepts: dict[str, dict[str, Any]],
    targets: dict[str, dict[str, Any]],
) -> None:
    """Seed semantic concepts and targets from the Relution setting index."""

    policy_platform = normalize_policy_platform(platform)
    for field in fields:
        target_id = semantic_target_id(
            policy_platform, field.kind, field.target, [field.field_path]
        )
        target = ensure_semantic_target(
            targets, policy_platform, field.kind, field.target, [field.field_path]
        )
        append_unique(target["labels"], field.label)
        for concept in semantic_concepts_for_field(platform, field):
            concept_id = str(concept.get("id", ""))
            if not concept_id:
                continue
            ensure_semantic_concept(concepts, concept)
            append_unique(target["conceptIds"], concept_id)
            append_unique(concepts[concept_id]["relutionTargetIds"], target_id)


def add_catalog_semantic_links(
    source: str,
    catalog_path: Path,
    state: dict[str, Any],
) -> None:
    """Add one source catalog to the shared semantic-index construction state."""

    recommendations = read_json(catalog_path)
    if not isinstance(recommendations, list):
        raise ValueError(
            "Required recommendation catalog malformed: "
            f"source={source} path={catalog_path} expected list"
        )
    concepts = state["concepts"]
    targets = state["targets"]
    recommendations_index = state["recommendationsIndex"]
    counters = state["counters"]
    for recommendation in recommendations:
        platform = normalize_policy_platform(str(recommendation["platform"]))
        by_source = counters["bySource"]
        by_platform = counters["byPlatform"]
        by_source[source] = by_source.get(source, 0) + 1
        by_platform[platform] = by_platform.get(platform, 0) + 1
        recommendations_index.append(
            semantic_recommendation_index_entry(
                source, platform, recommendation, concepts, targets
            )
        )


def semantic_recommendation_index_entry(
    source: str,
    platform: str,
    recommendation: dict[str, Any],
    concepts: dict[str, dict[str, Any]],
    targets: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Build one semantic-index recommendation row and update link state."""

    recommendation_id = str(recommendation["id"])
    global_id = f"{source}:{recommendation_id}"
    raw_semantic_ids = ensure_recommendation_concepts(recommendation, concepts)
    link_state = {
        "targets": targets,
        "concepts": concepts,
        "platform": platform,
        "globalId": global_id,
        "rawSemanticIds": raw_semantic_ids,
    }
    exact_target_ids, exact_concept_ids = recommendation_target_links(
        link_state,
        exact_target_specs(recommendation),
        "exact",
    )
    candidate_target_ids: list[str] = []
    candidate_concept_ids: list[str] = []
    if not exact_target_ids:
        candidate_target_ids, candidate_concept_ids = recommendation_target_links(
            link_state,
            candidate_target_specs(recommendation),
            "candidate",
        )
    semantic_ids = recommendation_semantic_ids(
        concepts, global_id, raw_semantic_ids, exact_concept_ids, candidate_concept_ids
    )
    return {
        "source": source,
        "recommendationId": recommendation_id,
        "platform": platform,
        "title": recommendation["title"],
        "semanticConceptIds": unique_preserving_order(semantic_ids),
        "exactTargetIds": unique_preserving_order(exact_target_ids),
        "candidateTargetIds": unique_preserving_order(candidate_target_ids),
    }


def ensure_recommendation_concepts(
    recommendation: dict[str, Any], concepts: dict[str, dict[str, Any]]
) -> list[str]:
    """Register declared semantic concepts and return their stable ids."""

    semantic_concepts = [
        concept
        for concept in recommendation.get("semanticConcepts", [])
        if isinstance(concept, dict) and isinstance(concept.get("id"), str)
    ]
    for concept in semantic_concepts:
        ensure_semantic_concept(concepts, concept)
    return [str(concept["id"]) for concept in semantic_concepts]


def recommendation_target_links(
    state: dict[str, Any],
    specs: list[dict[str, Any]],
    link_kind: str,
) -> tuple[list[str], list[str]]:
    """Link recommendation mappings to semantic targets and concepts."""

    target_ids: list[str] = []
    concept_ids: list[str] = []
    targets = state["targets"]
    concepts = state["concepts"]
    platform = state["platform"]
    global_id = state["globalId"]
    raw_semantic_ids = state["rawSemanticIds"]
    for spec in specs:
        linked_concept_ids = target_link_concept_ids(
            targets, platform, spec, raw_semantic_ids
        )
        target_id = ruleset_builder.add_recommendation_target_link(
            {
                "targets": targets,
                "concepts": concepts,
                "platform": platform,
                "spec": spec,
                "recommendationId": global_id,
                "conceptIds": linked_concept_ids,
                "linkKind": link_kind,
            }
        )
        target_ids.append(target_id)
        concept_ids.extend(linked_concept_ids)
    return target_ids, concept_ids


def recommendation_semantic_ids(
    concepts: dict[str, dict[str, Any]],
    global_id: str,
    raw_semantic_ids: list[str],
    exact_concept_ids: list[str],
    candidate_concept_ids: list[str],
) -> list[str]:
    """Choose semantic ids from target links, falling back to declared concepts."""

    semantic_ids = unique_preserving_order([*exact_concept_ids, *candidate_concept_ids])
    if semantic_ids:
        return semantic_ids
    for concept_id in unique_preserving_order(raw_semantic_ids):
        ensure_semantic_concept(concepts, {"id": concept_id})
        append_unique(concepts[concept_id]["recommendationIds"], global_id)
    return unique_preserving_order(raw_semantic_ids)


_INTERNAL_EXPORTS = {
    "add_recommendation_target_link",
    "append_unique",
    "candidate_target_specs",
    "count_by",
    "difference_severity_rank",
    "ensure_semantic_concept",
    "ensure_semantic_target",
    "exact_mappings",
    "exact_target_specs",
    "flatten_values",
    "iter_candidate_mapping_targets",
    "iter_exact_mapping_targets",
    "load_recommendations_by_global_id",
    "mapping_target",
    "normalize_policy_platform",
    "path_to_string",
    "read_json",
    "semantic_support_level",
    "semantic_target_id",
    "slugify",
    "source_coverage_counts",
    "source_recommendation_counts",
    "stable_json",
    "target_link_concept_ids",
    "unique_preserving_order",
    "write_json",
    "write_unified_analysis_report",
}
__all__ = [
    name
    for name in globals()
    if not name.startswith("_") and name not in _INTERNAL_EXPORTS
]
