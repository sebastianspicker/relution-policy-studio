#!/usr/bin/env python3
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import itertools
import json
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from recommendation_mapping import build_setting_index, flatten_value_paths, semantic_concepts_for, semantic_concepts_for_field, split_identifier


REPO_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class SourceConfig:
    source: str
    label: str
    root: Path
    recommendation_catalog_path: Path
    ruleset_path: Path
    settings_catalog_path: Path
    baseline_path: Path
    readme_path: Path


SOURCE_CONFIGS: dict[str, SourceConfig] = {
    "bsi": SourceConfig(
        source="bsi",
        label="BSI Grundschutz",
        root=REPO_ROOT / "example" / "bsi-references",
        recommendation_catalog_path=REPO_ROOT / "example" / "bsi-references" / "bsi-recommendations.json",
        ruleset_path=REPO_ROOT / "example" / "bsi-references" / "bsi-relution-ruleset.json",
        settings_catalog_path=REPO_ROOT / "example" / "bsi-references" / "bsi-relution-settings-catalog.json",
        baseline_path=REPO_ROOT / "example" / "bsi-references" / "bsi-relution-baseline.json",
        readme_path=REPO_ROOT / "example" / "bsi-references" / "README.md",
    ),
    "cis": SourceConfig(
        source="cis",
        label="CIS Benchmarks",
        root=REPO_ROOT / "example" / "cis-references",
        recommendation_catalog_path=REPO_ROOT / "example" / "cis-references" / "cis-recommendations.json",
        ruleset_path=REPO_ROOT / "example" / "cis-references" / "cis-relution-ruleset.json",
        settings_catalog_path=REPO_ROOT / "example" / "cis-references" / "cis-relution-settings-catalog.json",
        baseline_path=REPO_ROOT / "example" / "cis-references" / "cis-relution-baseline.json",
        readme_path=REPO_ROOT / "example" / "cis-references" / "README.md",
    ),
    "vendor": SourceConfig(
        source="vendor",
        label="Vendor Guidance",
        root=REPO_ROOT / "example" / "vendor-references",
        recommendation_catalog_path=REPO_ROOT / "example" / "vendor-references" / "vendor-recommendations.json",
        ruleset_path=REPO_ROOT / "example" / "vendor-references" / "vendor-relution-ruleset.json",
        settings_catalog_path=REPO_ROOT / "example" / "vendor-references" / "vendor-relution-settings-catalog.json",
        baseline_path=REPO_ROOT / "example" / "vendor-references" / "vendor-relution-baseline.json",
        readme_path=REPO_ROOT / "example" / "vendor-references" / "README.md",
    ),
}

COVERAGE_MATRIX_PATH = REPO_ROOT / "example" / "recommendation-coverage" / "relution-achievability-matrix.json"
SEMANTIC_INDEX_PATH = REPO_ROOT / "example" / "recommendation-coverage" / "relution-semantic-index.json"
UNIFIED_ANALYSIS_PATH = REPO_ROOT / "example" / "recommendation-coverage" / "unified-recommendation-analysis.json"
UNIFIED_ANALYSIS_REPORT_PATH = REPO_ROOT / "example" / "recommendation-coverage" / "unified-recommendation-analysis.md"
EXACT_MAPPING_REFERENCE_PATH = REPO_ROOT / "example" / "recommendation-coverage" / "exact-mapping-reference.json"
MAPPING_CANDIDATE_REVIEW_PATH = REPO_ROOT / "example" / "recommendation-coverage" / "mapping-candidate-review.json"
MANUAL_MAPPING_PROMOTIONS_PATH = REPO_ROOT / "example" / "recommendation-coverage" / "manual-mapping-promotions.json"
MAPPING_CANDIDATE_REVIEW_REPORT_PATH = REPO_ROOT / "docs" / "MAPPING_CANDIDATE_REVIEW.md"
SOURCE_CHANGE_REPORT_PATH = REPO_ROOT / "example" / "recommendation-coverage" / "source-change-report.json"
RULESET_UPDATE_PLAN_PATH = REPO_ROOT / "example" / "recommendation-coverage" / "ruleset-update-plan.json"
RELUTION_MAPPING_CHANGE_REPORT_PATH = REPO_ROOT / "example" / "recommendation-coverage" / "relution-mapping-change-report.json"
RELUTION_MAPPING_UPDATE_PLAN_PATH = REPO_ROOT / "example" / "recommendation-coverage" / "relution-mapping-update-plan.json"
ALLOWED_MAPPING_STATUSES = {"exact", "parameterized", "partial", "suggested", "none"}
MULTI_INSTANCE_TARGET_TYPES = {"WINDOWS_CUSTOM_CSP"}
AUTHORITATIVE_SOURCE = "bsi"
ALL_SOURCES = ("bsi", "cis", "vendor")

PLATFORM_ORDER = {
    "WINDOWS": 0,
    "MACOS": 1,
    "IOS": 2,
    "ANDROID_ENTERPRISE": 3,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Relution import artifacts from harvested recommendation catalogs.")
    parser.add_argument("sources", nargs="*", help="Sources to regenerate. Defaults to all.")
    args = parser.parse_args()

    unknown_sources = [source for source in args.sources if source not in SOURCE_CONFIGS]
    if unknown_sources:
        raise SystemExit(f"unknown source(s): {', '.join(unknown_sources)}")
    selected_sources = args.sources or sorted(SOURCE_CONFIGS)
    for source in selected_sources:
        build_source_artifacts(source)
    write_baseline_templates()


def build_source_artifacts(source: str) -> None:
    config = SOURCE_CONFIGS[source]
    recommendations = normalize_recommendations(config.source, read_json(config.recommendation_catalog_path))
    write_json(config.recommendation_catalog_path, recommendations)
    baseline = read_json(config.baseline_path)
    verified_as_of = baseline.get("verifiedAsOf")
    bundle_result = build_setting_catalog(config, recommendations, verified_as_of)
    write_json(config.settings_catalog_path, bundle_result["catalog"])
    if source == "bsi":
        write_bsi_mandatory_mapping_ledger(recommendations, bundle_result["catalog"])
    write_settings_files(config, bundle_result["catalog"])
    write_json(config.ruleset_path, build_ruleset(config, recommendations, bundle_result["catalog"], verified_as_of))
    update_baseline_summary(config, baseline)
    update_readme(config)
    build_coverage_matrix()
    build_semantic_index()
    build_unified_recommendation_analysis()
    build_mapping_candidate_review_artifacts()


def normalize_recommendations(source: str, recommendations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    manual_promotions = manual_promotions_by_recommendation(source) if "manual_promotions_by_recommendation" in globals() else {}
    for recommendation in recommendations:
        entry = dict(recommendation)
        entry["relutionMapping"] = normalize_relution_mapping(entry, manual_promotions.get(str(entry.get("id", "")), []))
        fallback_translations = normalize_fallback_translations(entry)
        entry["fallbackTranslations"] = fallback_translations
        entry["implementation"] = implementation_for(source, entry, fallback_translations)
        normalized.append(entry)
    return normalized


def normalize_relution_mapping(recommendation: dict[str, Any], manual_promotions: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    raw_mapping = recommendation.get("relutionMapping", {})
    if not isinstance(raw_mapping, dict):
        raw_mapping = {}
    status = str(raw_mapping.get("status", "none"))
    if status not in ALLOWED_MAPPING_STATUSES:
        raise ValueError(f"{recommendation.get('id', '<unknown>')}: unknown Relution mapping status {status!r}")

    candidates = [dict(candidate) for candidate in raw_mapping.get("candidates", []) if isinstance(candidate, dict)]
    ruleset_mappings = [dict(mapping) for mapping in raw_mapping.get("rulesetMappings", []) if isinstance(mapping, dict)]
    notes = [str(note) for note in raw_mapping.get("notes", []) if isinstance(note, str) and note]
    if manual_promotions:
        ruleset_mappings = [
            *ruleset_mappings,
            *manual_promotions,
        ]
        status = "exact"
        notes = unique_preserving_order([*notes, "Exact mapping promoted by validated manual mapping ledger."])
    exact = valid_exact_mappings(status, ruleset_mappings)
    if status == "exact" and not exact:
        raise ValueError(f"{recommendation.get('id', '<unknown>')}: exact mappings require supported non-empty rulesetMappings")
    return {
        "status": status,
        "mergeableInImportableRuleset": bool(exact),
        "candidates": candidates,
        "rulesetMappings": ruleset_mappings,
        "notes": notes,
        **({"parameterRequirements": list(raw_mapping["parameterRequirements"])} if isinstance(raw_mapping.get("parameterRequirements"), list) else {}),
        **({"processSupport": list(raw_mapping["processSupport"])} if isinstance(raw_mapping.get("processSupport"), list) else {}),
    }


def valid_exact_mappings(status: str, mappings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if status != "exact" or not mappings:
        return []
    exact: list[dict[str, Any]] = []
    for mapping in mappings:
        if not isinstance(mapping.get("kind"), str) or mapping_target(mapping) is None or not isinstance(mapping.get("values"), dict):
            return []
        exact.append(mapping)
    return exact


def normalize_fallback_translations(recommendation: dict[str, Any]) -> list[dict[str, Any]]:
    translations = recommendation.get("fallbackTranslations")
    if isinstance(translations, list):
        return [dict(entry) for entry in translations if isinstance(entry, dict)]
    helper_fallbacks = recommendation.get("helperFallbacks")
    if isinstance(helper_fallbacks, list):
        return [dict(entry) for entry in helper_fallbacks if isinstance(entry, dict)]
    return []


def implementation_for(
    source: str,
    recommendation: dict[str, Any],
    fallback_translations: list[dict[str, Any]],
) -> dict[str, Any]:
    relution_mapping = recommendation.get("relutionMapping", {})
    exact = exact_mappings(recommendation)
    exact_surfaces = unique_preserving_order(mapping["kind"] for mapping in exact)
    candidate_surfaces = unique_preserving_order(
        candidate.get("kind")
        for candidate in relution_mapping.get("candidates", [])
        if isinstance(candidate, dict) and isinstance(candidate.get("kind"), str)
    )
    surfaces = unique_preserving_order([*exact_surfaces, *candidate_surfaces, *(["helper"] if fallback_translations else [])])
    importable_via = unique_preserving_order(
        [
            *(["ruleset-import"] if exact else []),
            *(["apply-json"] if any(mapping.get("kind") == "relution-native" for mapping in exact) else []),
        ]
    )
    notes = [str(note) for note in relution_mapping.get("notes", []) if isinstance(note, str) and note]
    if exact:
        category = "relution-achievable"
        blocking_reasons = notes
    elif candidate_surfaces:
        category = "relution-partial"
        blocking_reasons = notes or ["Current repo mappings cover only part of this recommendation."]
    elif relution_mapping.get("status") == "parameterized":
        category = "relution-partial"
        blocking_reasons = notes or ["Relution can support this BSI requirement, but local parameters or process evidence are required."]
    elif fallback_translations:
        category = "helper-only"
        blocking_reasons = notes or ["No exact Relution mapping is available; only structured helper guidance is available."]
    else:
        category = "gap"
        if source == "bsi" and recommendation.get("status") == "retired":
            blocking_reasons = notes or ["This BSI requirement is marked retired and is not emitted as an actionable control."]
        else:
            blocking_reasons = notes or ["No current Relution-native, Apple transport, or helper translation is available in this repo."]
    return {
        "category": category,
        "surfaces": surfaces,
        "importableVia": importable_via,
        "blockingReasons": blocking_reasons,
    }


def build_coverage_matrix() -> None:
    rows: list[dict[str, Any]] = []
    by_source: dict[str, int] = {}
    by_platform: dict[str, int] = {}
    by_category: dict[str, int] = {}
    by_surface: dict[str, int] = {}

    for source, config in SOURCE_CONFIGS.items():
        if not config.recommendation_catalog_path.exists():
            continue
        recommendations = read_json(config.recommendation_catalog_path)
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
                "mappingStatus": recommendation.get("relutionMapping", {}).get("status", "none"),
                "targetTypes": unique_preserving_order(iter_exact_mapping_targets(recommendation)),
                "candidateTargetTypes": unique_preserving_order(iter_candidate_mapping_targets(recommendation)),
                "blockingReasons": list(implementation.get("blockingReasons", [])),
            }
            rows.append(row)
            by_source[source] = by_source.get(source, 0) + 1
            by_platform[row["platform"]] = by_platform.get(row["platform"], 0) + 1
            by_category[row["category"]] = by_category.get(row["category"], 0) + 1
            for surface in row["surfaces"]:
                by_surface[surface] = by_surface.get(surface, 0) + 1

    rows.sort(key=lambda row: (row["source"], PLATFORM_ORDER.get(row["platform"], 99), row["platform"], row["recommendationId"]))
    write_json(
        COVERAGE_MATRIX_PATH,
        {
            "version": 1,
            "name": "Relution Recommendation Achievability Matrix",
            "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
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
    concepts: dict[str, dict[str, Any]] = {}
    targets: dict[str, dict[str, Any]] = {}
    recommendations_index: list[dict[str, Any]] = []
    by_source: dict[str, int] = {}
    by_platform: dict[str, int] = {}

    for platform, fields in build_setting_index().items():
        policy_platform = normalize_policy_platform(platform)
        for field in fields:
            target_id = semantic_target_id(policy_platform, field.kind, field.target, [field.field_path])
            target = ensure_semantic_target(targets, policy_platform, field.kind, field.target, [field.field_path])
            append_unique(target["labels"], field.label)
            for concept in semantic_concepts_for_field(platform, field):
                concept_id = str(concept.get("id", ""))
                if not concept_id:
                    continue
                ensure_semantic_concept(concepts, concept)
                append_unique(target["conceptIds"], concept_id)
                append_unique(concepts[concept_id]["relutionTargetIds"], target_id)

    for source, config in SOURCE_CONFIGS.items():
        if not config.recommendation_catalog_path.exists():
            continue
        for recommendation in read_json(config.recommendation_catalog_path):
            recommendation_id = str(recommendation["id"])
            global_id = f"{source}:{recommendation_id}"
            platform = normalize_policy_platform(str(recommendation["platform"]))
            by_source[source] = by_source.get(source, 0) + 1
            by_platform[platform] = by_platform.get(platform, 0) + 1
            semantic_concepts = [
                concept
                for concept in recommendation.get("semanticConcepts", [])
                if isinstance(concept, dict) and isinstance(concept.get("id"), str)
            ]
            raw_semantic_ids = [str(concept["id"]) for concept in semantic_concepts]
            for concept in semantic_concepts:
                ensure_semantic_concept(concepts, concept)

            exact_target_ids = []
            exact_concept_ids = []
            for spec in exact_target_specs(recommendation):
                linked_concept_ids = target_link_concept_ids(targets, platform, spec, raw_semantic_ids)
                target_id = add_recommendation_target_link(
                    targets,
                    concepts,
                    platform,
                    spec,
                    global_id,
                    linked_concept_ids,
                    link_kind="exact",
                )
                exact_target_ids.append(target_id)
                exact_concept_ids.extend(linked_concept_ids)

            candidate_target_ids = []
            candidate_concept_ids = []
            if not exact_target_ids:
                for spec in candidate_target_specs(recommendation):
                    linked_concept_ids = target_link_concept_ids(targets, platform, spec, raw_semantic_ids)
                    target_id = add_recommendation_target_link(
                        targets,
                        concepts,
                        platform,
                        spec,
                        global_id,
                        linked_concept_ids,
                        link_kind="candidate",
                    )
                    candidate_target_ids.append(target_id)
                    candidate_concept_ids.extend(linked_concept_ids)

            semantic_ids = unique_preserving_order([*exact_concept_ids, *candidate_concept_ids])
            if not semantic_ids:
                semantic_ids = unique_preserving_order(raw_semantic_ids)
                for concept_id in semantic_ids:
                    ensure_semantic_concept(concepts, {"id": concept_id})
                    append_unique(concepts[concept_id]["recommendationIds"], global_id)

            recommendations_index.append(
                {
                    "source": source,
                    "recommendationId": recommendation_id,
                    "platform": platform,
                    "title": recommendation["title"],
                    "semanticConceptIds": unique_preserving_order(semantic_ids),
                    "exactTargetIds": unique_preserving_order(exact_target_ids),
                    "candidateTargetIds": unique_preserving_order(candidate_target_ids),
                }
            )

    for collection in (concepts.values(), targets.values()):
        for entry in collection:
            for key, value in entry.items():
                if isinstance(value, list):
                    entry[key] = sorted(value)

    recommendations_index.sort(key=lambda entry: (entry["source"], PLATFORM_ORDER.get(entry["platform"], 99), entry["platform"], entry["recommendationId"]))
    concept_entries = sorted(concepts.values(), key=lambda entry: entry["id"])
    target_entries = sorted(targets.values(), key=lambda entry: (PLATFORM_ORDER.get(entry["platform"], 99), entry["platform"], entry["kind"], entry["target"], entry["id"]))
    write_json(
        SEMANTIC_INDEX_PATH,
        {
            "version": 1,
            "name": "Relution Bidirectional Semantic Index",
            "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
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


def build_unified_recommendation_analysis() -> None:
    if not SEMANTIC_INDEX_PATH.exists():
        return
    semantic_index = read_json(SEMANTIC_INDEX_PATH)
    recommendations = load_recommendations_by_global_id()
    common_groups = build_common_semantic_groups(semantic_index, recommendations)
    contradictions, exact_differences = analyze_exact_mapping_differences(recommendations)
    semantic_differences = semantic_group_differences(common_groups)
    differences = sorted(
        [*exact_differences, *semantic_differences],
        key=lambda entry: (difference_severity_rank(entry), entry["type"], entry["id"]),
    )
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    payload = {
        "version": 1,
        "name": "Unified Recommendation Semantic Analysis",
        "generatedAt": generated_at,
        "precedence": {
            "authoritativeSource": AUTHORITATIVE_SOURCE,
            "behavior": "rank-and-annotate",
            "note": "BSI is marked as authoritative in differences; source mappings are not rewritten by this artifact.",
        },
        "commonGroups": common_groups,
        "contradictions": contradictions,
        "differences": differences,
        "summary": {
            "totalCommonGroups": len(common_groups),
            "commonGroupsByPlatform": count_by(common_groups, "platform"),
            "commonGroupsBySourceCoverage": source_coverage_counts(common_groups),
            "hardContradictions": len(contradictions),
            "differences": len(differences),
            "bsiAuthoritativeDifferences": sum(1 for entry in differences if entry.get("authoritativeSource") == AUTHORITATIVE_SOURCE),
            "sourceRecommendationCounts": source_recommendation_counts(recommendations),
        },
    }
    write_json(UNIFIED_ANALYSIS_PATH, payload)
    write_unified_analysis_report(payload)


def build_common_semantic_groups(
    semantic_index: dict[str, Any],
    recommendations: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    concepts = {
        str(concept.get("id")): concept
        for concept in semantic_index.get("concepts", [])
        if isinstance(concept, dict) and isinstance(concept.get("id"), str)
    }
    target_concepts = {
        str(target.get("id")): {str(concept_id) for concept_id in target.get("conceptIds", []) if isinstance(concept_id, str)}
        for target in semantic_index.get("relutionTargets", [])
        if isinstance(target, dict) and isinstance(target.get("id"), str)
    }
    groups: dict[tuple[str, str], dict[str, Any]] = {}
    for entry in semantic_index.get("recommendations", []):
        if not isinstance(entry, dict) or not isinstance(entry.get("source"), str) or not isinstance(entry.get("platform"), str):
            continue
        source = str(entry["source"])
        recommendation_id = str(entry.get("recommendationId", ""))
        global_id = f"{source}:{recommendation_id}"
        if global_id not in recommendations:
            continue
        for concept_id in [str(value) for value in entry.get("semanticConceptIds", []) if isinstance(value, str)]:
            key = (str(entry["platform"]), concept_id)
            group = groups.setdefault(
                key,
                {
                    "platform": str(entry["platform"]),
                    "conceptId": concept_id,
                    "label": concepts.get(concept_id, {}).get("label", {}),
                    "recommendationsBySource": {source_name: [] for source_name in ALL_SOURCES},
                    "exactTargetIdsBySource": {source_name: [] for source_name in ALL_SOURCES},
                    "candidateTargetIdsBySource": {source_name: [] for source_name in ALL_SOURCES},
                },
            )
            append_unique(group["recommendationsBySource"][source], global_id)
            for target_id in entry.get("exactTargetIds", []):
                if isinstance(target_id, str) and concept_id in target_concepts.get(target_id, set()):
                    append_unique(group["exactTargetIdsBySource"][source], target_id)
            for target_id in entry.get("candidateTargetIds", []):
                if isinstance(target_id, str) and concept_id in target_concepts.get(target_id, set()):
                    append_unique(group["candidateTargetIdsBySource"][source], target_id)

    common_groups: list[dict[str, Any]] = []
    for group in groups.values():
        sources = [source for source in ALL_SOURCES if group["recommendationsBySource"][source]]
        if len(sources) < 2:
            continue
        all_target_sources: dict[str, set[str]] = {}
        for source in sources:
            for target_id in [*group["exactTargetIdsBySource"][source], *group["candidateTargetIdsBySource"][source]]:
                all_target_sources.setdefault(target_id, set()).add(source)
        shared_targets = sorted(target_id for target_id, target_sources in all_target_sources.items() if len(target_sources) >= 2)
        source_counts = {source: len(group["recommendationsBySource"][source]) for source in sources}
        common_groups.append(
            {
                "id": slugify(f"{group['platform']}-{group['conceptId']}"),
                "platform": group["platform"],
                "conceptId": group["conceptId"],
                "label": group["label"],
                "sources": sources,
                "missingSources": [source for source in ALL_SOURCES if source not in sources],
                "authoritativeSource": AUTHORITATIVE_SOURCE if AUTHORITATIVE_SOURCE in sources else None,
                "sourceCounts": source_counts,
                "recommendationsBySource": {source: sorted(group["recommendationsBySource"][source]) for source in sources},
                "sampleRecommendations": sample_group_recommendations(group, recommendations, sources),
                "exactTargetIdsBySource": {source: sorted(group["exactTargetIdsBySource"][source]) for source in sources},
                "candidateTargetIdsBySource": {source: sorted(group["candidateTargetIdsBySource"][source]) for source in sources},
                "sharedRelutionTargetIds": shared_targets,
            }
        )
    common_groups.sort(key=common_group_sort_key)
    return common_groups


def sample_group_recommendations(
    group: dict[str, Any],
    recommendations: dict[str, dict[str, Any]],
    sources: list[str],
) -> list[dict[str, Any]]:
    samples = []
    for source in sources:
        for global_id in sorted(group["recommendationsBySource"][source])[:3]:
            recommendation = recommendations.get(global_id, {})
            samples.append(
                {
                    "source": source,
                    "recommendationId": str(recommendation.get("id", global_id.split(":", 1)[1])),
                    "title": str(recommendation.get("title", "")),
                    "mappingStatus": str(recommendation.get("relutionMapping", {}).get("status", "none")),
                }
            )
    return samples


def common_group_sort_key(group: dict[str, Any]) -> tuple[int, int, int, str, str]:
    sources = group.get("sources", [])
    return (
        0 if AUTHORITATIVE_SOURCE in sources else 1,
        -len(sources),
        PLATFORM_ORDER.get(str(group.get("platform", "")), 99),
        str(group.get("platform", "")),
        str(group.get("conceptId", "")),
    )


def analyze_exact_mapping_differences(
    recommendations: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    leaves_by_key: dict[tuple[str, str, str, str], list[dict[str, Any]]] = {}
    for recommendation in recommendations.values():
        source = str(recommendation["_source"])
        platform = normalize_policy_platform(str(recommendation.get("platform", "")))
        for mapping in exact_mappings(recommendation):
            target = mapping_target(mapping)
            if target is None:
                continue
            flattened = flatten_values(mapping.get("values", {}))
            constraints = constraints_by_path(mapping)
            for path, value in flattened.items():
                path_string = path_to_string(path)
                leaves_by_key.setdefault((platform, str(mapping["kind"]), target, path_string), []).append(
                    {
                        "source": source,
                        "globalId": recommendation["_globalId"],
                        "recommendationId": recommendation["id"],
                        "title": recommendation["title"],
                        "value": value,
                        "valueSignature": stable_json(value),
                        "constraints": constraints.get(path_string, []),
                    }
                )

    contradictions: list[dict[str, Any]] = []
    differences: list[dict[str, Any]] = []
    for (platform, kind, target, field_path), leaves in sorted(leaves_by_key.items()):
        sources = {leaf["source"] for leaf in leaves}
        if AUTHORITATIVE_SOURCE not in sources or not sources.intersection(set(ALL_SOURCES) - {AUTHORITATIVE_SOURCE}):
            continue
        value_signatures = {leaf["valueSignature"] for leaf in leaves}
        if len(value_signatures) <= 1:
            continue
        entry = exact_value_difference_entry(platform, kind, target, field_path, leaves)
        if exact_leaf_difference_is_hard(leaves):
            entry["id"] = slugify(f"hard-{platform}-{kind}-{target}-{field_path}")
            entry["type"] = "hard-exact-value-contradiction"
            entry["severity"] = "error"
            contradictions.append(entry)
        else:
            entry["id"] = slugify(f"difference-{platform}-{kind}-{target}-{field_path}")
            entry["type"] = "constraint-compatible-exact-value-difference"
            entry["severity"] = "info"
            differences.append(entry)
    return contradictions, differences


def constraints_by_path(mapping: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for constraint in mapping.get("constraints", []):
        if not isinstance(constraint, dict) or not isinstance(constraint.get("path"), str):
            continue
        grouped.setdefault(str(constraint["path"]), []).append(dict(constraint))
    return grouped


def exact_value_difference_entry(
    platform: str,
    kind: str,
    target: str,
    field_path: str,
    leaves: list[dict[str, Any]],
) -> dict[str, Any]:
    values_by_source: dict[str, list[dict[str, Any]]] = {}
    for leaf in leaves:
        values_by_source.setdefault(str(leaf["source"]), []).append(
            {
                "recommendationId": leaf["recommendationId"],
                "title": leaf["title"],
                "value": leaf["value"],
                "constraints": leaf["constraints"],
            }
        )
    return {
        "id": "",
        "type": "",
        "severity": "",
        "platform": platform,
        "kind": kind,
        "target": target,
        "fieldPath": field_path,
        "sources": sorted(values_by_source),
        "authoritativeSource": AUTHORITATIVE_SOURCE,
        "resolution": "BSI is authoritative for interpretation; this analysis does not rewrite CIS or vendor mappings.",
        "valuesBySource": {source: values_by_source[source] for source in sorted(values_by_source)},
    }


def exact_leaf_difference_is_hard(leaves: list[dict[str, Any]]) -> bool:
    bounds = numeric_constraint_bounds(leaves)
    if bounds is not None:
        lower, upper = bounds
        if upper is None or lower is None or lower <= upper:
            return False
    return True


def numeric_constraint_bounds(leaves: list[dict[str, Any]]) -> tuple[float | None, float | None] | None:
    lower: float | None = None
    upper: float | None = None
    saw_numeric_constraint = False
    for leaf in leaves:
        for constraint in leaf.get("constraints", []):
            if not isinstance(constraint, dict):
                continue
            value = constraint.get("value")
            if not isinstance(value, int | float):
                continue
            operator = constraint.get("operator")
            if operator == "atLeast":
                lower = value if lower is None else max(lower, value)
                saw_numeric_constraint = True
            elif operator == "atMost":
                upper = value if upper is None else min(upper, value)
                saw_numeric_constraint = True
    if not saw_numeric_constraint:
        return None
    return lower, upper


def semantic_group_differences(common_groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
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
                    "resolution": "BSI participates in this semantic group; absent CIS/vendor coverage is noted, not remapped.",
                }
            )
        support_by_source = {
            source: semantic_support_level(group["exactTargetIdsBySource"].get(source, []), group["candidateTargetIdsBySource"].get(source, []))
            for source in sources
        }
        bsi_support = support_by_source.get(AUTHORITATIVE_SOURCE)
        if bsi_support is not None and any(level != bsi_support for level in support_by_source.values()):
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
                    "resolution": "Support-level differences are evidence for review; exact mappings remain source-owned.",
                }
            )
    return differences
