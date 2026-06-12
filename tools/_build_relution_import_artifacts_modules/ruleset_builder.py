"""Build importable Relution rulesets and settings catalogs."""

from __future__ import annotations

import hashlib
import itertools
import re
from typing import Any

from recommendation_mapping import flatten_value_paths

from .artifact_io import (
    build_aggregate_rule,
    build_informational_rule,
    flatten_values,
    normalize_policy_platform,
    path_to_string,
    policy_description,
    policy_name,
    relative_path,
    semantic_concept_ids_for_target_spec,
    slugify,
    stable_json,
    unique_preserving_order,
    unique_single_value,
    variant_id_from_signature,
)
from .artifact_paths import (
    ALL_SOURCES,
    MULTI_INSTANCE_TARGET_TYPES,
    PLATFORM_ORDER,
    SourceConfig,
)
from .mapping_helpers import (
    exact_mappings,
    mapping_target,
    mapping_with_target,
)


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


def ensure_semantic_target(
    targets: dict[str, dict[str, Any]],
    platform: str,
    kind: str,
    target: str,
    field_paths: list[str],
) -> dict[str, Any]:
    """Return or create the semantic-index entry for a Relution target."""

    target_id = semantic_target_id(platform, kind, target, field_paths)
    return targets.setdefault(
        target_id,
        {
            "id": target_id,
            "platform": platform,
            "kind": kind,
            "target": target,
            "fieldPaths": field_paths,
            "labels": [],
            "conceptIds": [],
            "exactRecommendationIds": [],
            "candidateRecommendationIds": [],
        },
    )


def ensure_semantic_concept(
    concepts: dict[str, dict[str, Any]], concept: dict[str, Any]
) -> dict[str, Any]:
    """Return or create a semantic concept while merging labels and terms."""

    concept_id = str(concept["id"])
    entry = concepts.setdefault(concept_id, empty_semantic_concept(concept_id))
    label = concept.get("label")
    if isinstance(label, dict):
        entry["label"] = dict(label)
    entry["matchedTerms"] = unique_preserving_order(
        [
            *entry["matchedTerms"],
            *[
                str(term)
                for term in concept.get("matchedTerms", [])
                if isinstance(term, str)
            ],
        ]
    )
    return entry


def empty_semantic_concept(concept_id: str) -> dict[str, Any]:
    """Create an empty semantic concept accumulator with all link buckets."""

    return {
        "id": concept_id,
        "label": {},
        "matchedTerms": [],
        "relutionTargetIds": [],
        "recommendationIds": [],
        "exactRecommendationIds": [],
        "candidateRecommendationIds": [],
    }


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


def candidate_target_specs(recommendation: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract candidate mapping target specs that are not already exact."""

    exact_target_ids = {
        semantic_target_id(
            normalize_policy_platform(str(recommendation["platform"])),
            spec["kind"],
            spec["target"],
            spec["fieldPaths"],
        )
        for spec in exact_target_specs(recommendation)
    }
    specs = []
    for candidate in recommendation.get("relutionMapping", {}).get("candidates", []):
        if (
            not isinstance(candidate, dict)
            or not isinstance(candidate.get("target"), str)
            or not isinstance(candidate.get("kind"), str)
        ):
            continue
        spec = {
            "kind": str(candidate["kind"]),
            "target": str(candidate["target"]),
            "fieldPaths": [
                str(path)
                for path in candidate.get("fieldPaths", [])
                if isinstance(path, str)
            ],
            **(
                {"match": candidate["match"]}
                if isinstance(candidate.get("match"), dict)
                else {}
            ),
            **(
                {"semanticConceptId": candidate["semanticConceptId"]}
                if isinstance(candidate.get("semanticConceptId"), str)
                else {}
            ),
        }
        if (
            semantic_target_id(
                normalize_policy_platform(str(recommendation["platform"])),
                spec["kind"],
                spec["target"],
                spec["fieldPaths"],
            )
            in exact_target_ids
        ):
            continue
        specs.append(spec)
    return specs


def semantic_target_id(
    platform: str, kind: str, target: str, field_paths: list[str]
) -> str:
    """Build a deterministic semantic target id from platform, type, and paths."""

    path_part = "__".join(field_paths) if field_paths else "target"
    return slugify(f"{platform}-{kind}-{target}-{path_part}")


def append_unique(values: list[Any], value: Any) -> None:
    """Append a value while preserving insertion order and uniqueness."""

    if value not in values:
        values.append(value)


def build_setting_catalog(
    config: SourceConfig,
    recommendations: list[dict[str, Any]],
    verified_as_of: str | None,
) -> dict[str, Any]:
    """Build importable setting bundles and non-importable recommendation rows."""

    groups: dict[tuple[str, str, str | None], list[dict[str, Any]]] = {}
    non_importable: list[dict[str, Any]] = []

    for recommendation in recommendations:
        importable_mappings = importable_native_mappings(recommendation)
        if not importable_mappings:
            non_importable.append(non_importable_recommendation_entry(recommendation))
            continue

        add_importable_mapping_groups(groups, recommendation, importable_mappings)

    bundles: list[dict[str, Any]] = []
    variant_groups: list[dict[str, Any]] = []

    for group_key in sorted(
        groups,
        key=lambda item: (
            PLATFORM_ORDER.get(item[0], 99),
            item[0],
            item[1],
            item[2] or "",
        ),
    ):
        policy_platform, target_type, instance_id = group_key
        group_entries = sorted(
            groups[group_key], key=lambda entry: entry["recommendationId"]
        )
        group_result = build_bundle_group(
            config, policy_platform, target_type, instance_id, group_entries
        )
        bundles.extend(group_result["bundles"])
        if group_result["variantGroup"] is not None:
            variant_groups.append(group_result["variantGroup"])

    bundles.sort(
        key=lambda bundle: (
            PLATFORM_ORDER.get(bundle["policyPlatform"], 99),
            bundle["policyPlatform"],
            bundle["targetType"],
            bundle.get("variantId", ""),
        )
    )
    non_importable.sort(key=lambda entry: entry["recommendationId"])

    return {
        "catalog": {
            "version": 1,
            "name": f"{config.label} Relution Setting Bundles",
            "verifiedAsOf": verified_as_of,
            "sourceRecommendationCatalogPath": relative_path(
                config.recommendation_catalog_path
            ),
            "importableRulesetPath": relative_path(config.ruleset_path),
            "bundles": bundles,
            "variantGroups": variant_groups,
            "nonImportableRecommendations": non_importable,
        }
    }


def non_importable_recommendation_entry(
    recommendation: dict[str, Any],
) -> dict[str, Any]:
    """Render the catalog row for recommendations without importable mappings."""

    relution_mapping = recommendation.get("relutionMapping", {})
    return {
        "recommendationId": recommendation["id"],
        "mappingStatus": relution_mapping.get("status", "none"),
        "candidateTargets": unique_preserving_order(
            candidate.get("target", "")
            for candidate in relution_mapping.get("candidates", [])
            if isinstance(candidate.get("target"), str) and candidate["target"]
        ),
        "notes": list(relution_mapping.get("notes", [])),
    }


def add_importable_mapping_groups(
    groups: dict[tuple[str, str, str | None], list[dict[str, Any]]],
    recommendation: dict[str, Any],
    importable_mappings: list[dict[str, Any]],
) -> None:
    """Group native mappings by policy platform, target type, and instance id."""

    source_platform = str(recommendation["platform"])
    policy_platform = normalize_policy_platform(source_platform)
    for mapping in importable_mappings:
        groups.setdefault(
            (
                policy_platform,
                mapping["type"],
                multi_instance_id(mapping, recommendation["id"]),
            ),
            [],
        ).append(
            {
                "recommendationId": recommendation["id"],
                "sourceIds": list(recommendation.get("sourceIds", [])),
                "sourcePlatform": source_platform,
                "policyPlatform": policy_platform,
                "targetType": mapping["type"],
                "values": mapping["values"],
            }
        )


def importable_native_mappings(recommendation: dict[str, Any]) -> list[dict[str, Any]]:
    """Return exact Relution-native mappings that are safe to emit as settings."""

    mappings = exact_mappings(recommendation)
    return [
        mapping
        for mapping in mappings
        if mapping.get("kind") == "relution-native"
        and isinstance(mapping.get("type"), str)
        and safe_relution_target_type(mapping["type"])
        and isinstance(mapping.get("values"), dict)
    ]


def safe_relution_target_type(target_type: str) -> bool:
    """Accept only target type names safe for generated ids and filenames."""

    return bool(re.fullmatch(r"[A-Z][A-Z0-9_]*(?:--[a-z0-9-]+)?", target_type))


def multi_instance_id(mapping: dict[str, Any], recommendation_id: str) -> str | None:
    """Derive a deterministic id for target types that allow multiple instances."""

    if mapping.get("type") not in MULTI_INSTANCE_TARGET_TYPES:
        return None
    values = mapping.get("values")
    if not isinstance(values, dict):
        return slugify(recommendation_id)
    name = str(values.get("name") or recommendation_id)
    install_sync_ml = str(values.get("installSyncML") or "")
    digest = hashlib.sha256(install_sync_ml.encode("utf8")).hexdigest()[:12]
    return slugify(f"{name}-{digest}")


def build_bundle_group(
    config: SourceConfig,
    policy_platform: str,
    target_type: str,
    instance_id: str | None,
    group_entries: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build one or more setting bundles for a target group."""

    flattened_entries = [
        {
            **entry,
            "flattenedValues": flatten_values(entry["values"]),
        }
        for entry in group_entries
    ]
    conflicting_paths = find_conflicting_paths(flattened_entries)
    base_paths = merged_non_conflicting_paths(flattened_entries, conflicting_paths)

    if not conflicting_paths:
        bundle = make_bundle(
            {
                "config": config,
                "policyPlatform": policy_platform,
                "targetType": target_type,
                "instanceId": instance_id,
                "entries": flattened_entries,
                "basePaths": base_paths,
                "variantId": None,
                "mergeStrategy": "deep-merge",
            }
        )
        return {"bundles": [bundle], "variantGroup": None}

    variants_by_signature = variant_entries_by_signature(
        flattened_entries, conflicting_paths
    )

    bundles: list[dict[str, Any]] = []
    variant_metadata: list[dict[str, Any]] = []
    for signature in sorted(variants_by_signature):
        variant_id = variant_id_from_signature(signature)
        bundle = make_bundle(
            {
                "config": config,
                "policyPlatform": policy_platform,
                "targetType": target_type,
                "instanceId": instance_id,
                "entries": variants_by_signature[signature],
                "basePaths": base_paths,
                "variantId": variant_id,
                "mergeStrategy": "deep-merge-with-explicit-variants",
            }
        )
        bundles.append(bundle)
        variant_metadata.append(
            {
                "bundleId": bundle["bundleId"],
                "variantId": variant_id,
                "importFilePath": bundle["importFilePath"],
            }
        )

    return {
        "bundles": bundles,
        "variantGroup": variant_group_metadata(
            {
                "config": config,
                "policyPlatform": policy_platform,
                "targetType": target_type,
                "instanceId": instance_id,
                "conflictingPaths": conflicting_paths,
                "variantMetadata": variant_metadata,
            }
        ),
    }


def variant_group_metadata(context: dict[str, Any]) -> dict[str, Any]:
    """Render metadata that explains conflicting setting-bundle variants."""

    config = context["config"]
    policy_platform = context["policyPlatform"]
    target_type = context["targetType"]
    instance_id = context["instanceId"]
    instance_suffix = f"-{instance_id}" if instance_id else ""
    return {
        "groupId": slugify(
            f"{config.source}-{policy_platform}-{target_type}{instance_suffix}-variants"
        ),
        "policyPlatform": policy_platform,
        "targetType": target_type,
        "conflictingPaths": [
            path_to_string(path) for path in sorted(context["conflictingPaths"])
        ],
        "variants": context["variantMetadata"],
    }


def make_bundle(context: dict[str, Any]) -> dict[str, Any]:
    """Render a setting bundle from merged base paths and selected entries."""

    config = context["config"]
    policy_platform = context["policyPlatform"]
    target_type = context["targetType"]
    instance_id = context["instanceId"]
    entries = context["entries"]
    variant_id = context["variantId"]
    file_suffix, bundle_suffix = bundle_suffixes(instance_id, variant_id)
    merged_paths = dict(context["basePaths"])
    for entry in entries:
        for path, value in sorted(entry["flattenedValues"].items()):
            merged_paths[path] = value
    return {
        "bundleId": slugify(
            f"{config.source}-{policy_platform}-{target_type}{bundle_suffix}"
        ),
        "source": config.source,
        "sourcePlatform": unique_single_value(
            entry["sourcePlatform"] for entry in entries
        ),
        "policyPlatform": policy_platform,
        "targetType": target_type,
        **({"variantId": variant_id} if variant_id else {}),
        "importFilePath": relative_path(
            config.root
            / "relution-settings"
            / policy_platform
            / f"{target_type}{file_suffix}.json"
        ),
        "details": {"type": target_type, **inflate_values(merged_paths)},
        "derivedFromRecommendationIds": unique_preserving_order(
            entry["recommendationId"] for entry in entries
        ),
        "sourceIds": unique_preserving_order(
            source_id for entry in entries for source_id in entry["sourceIds"]
        ),
        "mergeStrategy": context["mergeStrategy"],
    }


def bundle_suffixes(instance_id: str, variant_id: str) -> tuple[str, str]:
    """Return filename and bundle-id suffixes for instance and variant ids."""

    file_suffix = ""
    bundle_suffix = ""
    if instance_id:
        file_suffix += f"--{instance_id}"
        bundle_suffix += f"-{instance_id}"
    if variant_id:
        file_suffix += f"--{variant_id}"
        bundle_suffix += f"-{variant_id}"
    return file_suffix, bundle_suffix


def find_conflicting_paths(entries: list[dict[str, Any]]) -> set[tuple[str, ...]]:
    """Return flattened value paths with more than one serialized value."""

    values_by_path: dict[tuple[str, ...], set[str]] = {}
    for entry in entries:
        for path, value in entry["flattenedValues"].items():
            values_by_path.setdefault(path, set()).add(stable_json(value))
    return {path for path, values in values_by_path.items() if len(values) > 1}


def merged_non_conflicting_paths(
    entries: list[dict[str, Any]], conflicting_paths: set[tuple[str, ...]]
) -> dict[tuple[str, ...], Any]:
    """Merge flattened paths that are safe to share across all variants."""

    merged: dict[tuple[str, ...], Any] = {}
    for entry in entries:
        for path, value in sorted(entry["flattenedValues"].items()):
            if path in conflicting_paths:
                continue
            merged[path] = value
    return merged


def inflate_values(flattened: dict[tuple[str, ...], Any]) -> dict[str, Any]:
    """Rebuild nested values from flattened tuple paths."""

    root: dict[str, Any] = {}
    for path in sorted(flattened):
        cursor = root
        for key in path[:-1]:
            cursor = cursor.setdefault(key, {})
        cursor[path[-1]] = flattened[path]
    return root


def build_ruleset(
    config: SourceConfig,
    recommendations: list[dict[str, Any]],
    settings_catalog: dict[str, Any],
    verified_as_of: str | None,
) -> dict[str, Any]:
    """Build the importable ruleset that references generated setting bundles."""

    informative_entries_by_platform = informative_entries_by_platform_for(
        config, recommendations
    )
    bundles_by_platform, variant_groups_by_platform = aggregate_bundles_by_platform(
        settings_catalog
    )
    non_native_aggregate_rules = build_non_native_aggregate_rules(
        config, recommendations
    )

    return {
        "version": 1,
        "name": f"{config.label} Relution Ruleset",
        "verifiedAsOf": verified_as_of,
        "sourceIndexPath": relative_path(config.root / "sources.json")
        if (config.root / "sources.json").exists()
        else None,
        "recommendationCatalogPath": relative_path(config.recommendation_catalog_path),
        "policies": ruleset_policies(
            {
                "config": config,
                "settingsCatalog": settings_catalog,
                "informativeEntriesByPlatform": informative_entries_by_platform,
                "bundlesByPlatform": bundles_by_platform,
                "variantGroupsByPlatform": variant_groups_by_platform,
                "nonNativeAggregateRules": non_native_aggregate_rules,
            }
        ),
    }


def ruleset_policies(context: dict[str, Any]) -> list[dict[str, Any]]:
    """Build all platform policies from informational and aggregate rule inputs."""

    informative_entries_by_platform = context["informativeEntriesByPlatform"]
    policies: list[dict[str, Any]] = []
    for platform in sorted(
        informative_entries_by_platform,
        key=lambda value: (PLATFORM_ORDER.get(value, 99), value),
    ):
        policies.extend(
            ruleset_policies_for_platform(
                {
                    "config": context["config"],
                    "settingsCatalog": context["settingsCatalog"],
                    "platform": platform,
                    "informativeEntries": informative_entries_by_platform[platform],
                    "bundles": context["bundlesByPlatform"].get(platform, []),
                    "variantGroups": context["variantGroupsByPlatform"].get(
                        platform, []
                    ),
                    "extraAggregateRules": context["nonNativeAggregateRules"].get(
                        platform, []
                    ),
                }
            )
        )
    return policies


def ruleset_policies_for_platform(context: dict[str, Any]) -> list[dict[str, Any]]:
    """Build policies for one platform, expanding variant combinations."""

    config = context["config"]
    platform = context["platform"]
    rules = (
        informational_rules_for(config, context["informativeEntries"])
        + aggregate_rules_for(context["bundles"])
        + context["extraAggregateRules"]
    )
    sorted_variant_groups = sorted(
        context["variantGroups"],
        key=lambda group: (group["targetType"], group["groupId"]),
    )
    if not sorted_variant_groups:
        return [ruleset_policy(config, platform, None, rules)]
    return [
        ruleset_policy(
            config,
            platform,
            [bundle["variantId"] for bundle in combination if bundle.get("variantId")],
            rules + [build_aggregate_rule(bundle) for bundle in combination],
        )
        for combination in itertools.product(
            *variant_options_for(context["settingsCatalog"], sorted_variant_groups)
        )
    ]


def informative_entries_by_platform_for(
    config: SourceConfig, recommendations: list[dict[str, Any]]
) -> dict[str, list[dict[str, Any]]]:
    """Group recommendations used for informational rules by policy platform."""

    entries_by_platform: dict[str, list[dict[str, Any]]] = {}
    for recommendation in recommendations:
        if config.source == "bsi" and recommendation.get("status") != "active":
            continue
        policy_platform = normalize_policy_platform(str(recommendation["platform"]))
        entries_by_platform.setdefault(policy_platform, []).append(recommendation)
    return entries_by_platform


def aggregate_bundles_by_platform(
    settings_catalog: dict[str, Any],
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, list[dict[str, Any]]]]:
    """Separate always-on bundles and variant groups by policy platform."""

    variant_bundle_ids = {
        variant["bundleId"]
        for group in settings_catalog["variantGroups"]
        for variant in group["variants"]
    }
    bundles_by_platform: dict[str, list[dict[str, Any]]] = {}
    variant_groups_by_platform: dict[str, list[dict[str, Any]]] = {}
    for bundle in settings_catalog["bundles"]:
        if bundle["bundleId"] not in variant_bundle_ids:
            bundles_by_platform.setdefault(bundle["policyPlatform"], []).append(bundle)
    for group in settings_catalog["variantGroups"]:
        variant_groups_by_platform.setdefault(group["policyPlatform"], []).append(group)
    return bundles_by_platform, variant_groups_by_platform


def informational_rules_for(
    config: SourceConfig, recommendations: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Build sorted informational rules for source recommendations."""

    return [
        build_informational_rule(config.source, recommendation)
        for recommendation in sorted(recommendations, key=lambda entry: entry["id"])
    ]


def aggregate_rules_for(bundles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build sorted aggregate rules for setting bundles."""

    return [
        build_aggregate_rule(bundle)
        for bundle in sorted(
            bundles,
            key=lambda bundle: (bundle["targetType"], bundle.get("variantId", "")),
        )
    ]


def variant_options_for(
    settings_catalog: dict[str, Any], variant_groups: list[dict[str, Any]]
) -> list[list[dict[str, Any]]]:
    """Resolve variant-group metadata to concrete bundle option lists."""

    bundles_by_id = {
        bundle["bundleId"]: bundle for bundle in settings_catalog["bundles"]
    }
    return [
        [
            bundles_by_id[variant["bundleId"]]
            for variant in sorted(
                group["variants"], key=lambda variant: variant["variantId"]
            )
        ]
        for group in variant_groups
    ]


def ruleset_policy(
    config: SourceConfig,
    platform: str,
    variant_ids: list[str] | None,
    rules: list[dict[str, Any]],
) -> dict[str, Any]:
    """Render one ruleset policy with source-specific naming."""

    return {
        "platform": platform,
        "name": policy_name(config.source, platform, variant_ids),
        "description": policy_description(config.source, variant_ids),
        "rules": rules,
    }


def build_non_native_aggregate_rules(
    config: SourceConfig,
    recommendations: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Build aggregate rules for exact non-native mappings by platform."""

    groups: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for recommendation in recommendations:
        if config.source == "bsi" and recommendation.get("status") != "active":
            continue
        policy_platform = normalize_policy_platform(str(recommendation["platform"]))
        for mapping in exact_mappings(recommendation):
            if mapping.get("kind") == "relution-native":
                continue
            target = mapping_target(mapping)
            if target is None:
                continue
            groups.setdefault(
                (policy_platform, str(mapping["kind"]), target), []
            ).append(
                {
                    "mapping": mapping,
                    "recommendationId": recommendation["id"],
                    "sourceIds": list(recommendation.get("sourceIds", [])),
                    "flattenedValues": flatten_values(mapping["values"]),
                }
            )

    rules_by_platform: dict[str, list[dict[str, Any]]] = {}
    for (policy_platform, mapping_kind, target), entries in sorted(groups.items()):
        rules_by_platform.setdefault(policy_platform, []).extend(
            non_native_aggregate_rules_for_group(mapping_kind, target, entries)
        )
    return rules_by_platform


def non_native_aggregate_rules_for_group(
    mapping_kind: str, target: str, entries: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Build aggregate rules for one non-native mapping group."""

    conflicts = find_conflicting_paths(entries)
    if not conflicts:
        return [
            build_non_native_aggregate_rule(
                mapping_kind, target, entries, variant_id=None
            )
        ]
    rules: list[dict[str, Any]] = []
    for signature, signature_entries in sorted(
        variant_entries_by_signature(entries, conflicts).items()
    ):
        rules.append(
            build_non_native_aggregate_rule(
                mapping_kind,
                target,
                signature_entries,
                variant_id=variant_id_from_signature(signature),
            )
        )
    return rules


def variant_entries_by_signature(
    entries: list[dict[str, Any]],
    conflicts: set[tuple[str, ...]],
) -> dict[tuple[tuple[str, str], ...], list[dict[str, Any]]]:
    """Group entries by serialized values at conflicting paths."""

    variants_by_signature: dict[tuple[tuple[str, str], ...], list[dict[str, Any]]] = {}
    for entry in entries:
        if not any(path in entry["flattenedValues"] for path in conflicts):
            continue
        signature = variant_signature(entry, conflicts)
        variants_by_signature.setdefault(signature, []).append(entry)
    return variants_by_signature


def variant_signature(
    entry: dict[str, Any], conflicts: set[tuple[str, ...]]
) -> tuple[tuple[str, str], ...]:
    """Return the stable conflict-value signature for one variant entry."""

    return tuple(
        sorted(
            (path_to_string(path), stable_json(entry["flattenedValues"][path]))
            for path in conflicts
            if path in entry["flattenedValues"]
        )
    )


def build_non_native_aggregate_rule(
    mapping_kind: str,
    target: str,
    entries: list[dict[str, Any]],
    variant_id: str | None,
) -> dict[str, Any]:
    """Render one non-native aggregate rule, preserving variant identity."""

    merged_paths: dict[tuple[str, ...], Any] = {}
    for entry in entries:
        for path, value in sorted(entry["flattenedValues"].items()):
            merged_paths[path] = value
    values = inflate_values(merged_paths)
    mapping = mapping_with_target(mapping_kind, target, values)
    if mapping is None:
        raise ValueError(f"Unsupported mapping kind: {mapping_kind}")
    variant_suffix = f"-{variant_id}" if variant_id else ""
    title_suffix = f" ({variant_id})" if variant_id else ""
    return {
        "id": slugify(f"{mapping_kind}-{target}{variant_suffix}-aggregate"),
        "title": f"Relution aggregate: {target}{title_suffix}",
        "informational": False,
        "reason": (
            f"Aggregates exact {mapping_kind} mappings from "
            f"{', '.join(unique_preserving_order(entry['recommendationId'] for entry in entries))}."
        ),
        "sourceIds": unique_preserving_order(
            source_id for entry in entries for source_id in entry["sourceIds"]
        ),
        "mappings": [mapping],
        **({"variantId": variant_id} if variant_id else {}),
    }
