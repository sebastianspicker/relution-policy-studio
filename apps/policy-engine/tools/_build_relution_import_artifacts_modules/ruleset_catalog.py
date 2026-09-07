"""Importable Relution setting-catalog construction."""

from __future__ import annotations

import re
from typing import Any

from .artifact_io_values import normalize_policy_platform
from .artifact_io_paths import relative_path
from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order
from .artifact_paths import PLATFORM_ORDER, SourceConfig
from .mapping_exact_targets import exact_mappings
from .ruleset_bundle_groups import build_bundle_group
from .ruleset_catalog_instances import multi_instance_id


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
