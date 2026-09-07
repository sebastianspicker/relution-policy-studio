"""Non-native mapping aggregation for generated Relution rulesets."""

from __future__ import annotations

from typing import Any

from .artifact_io_values import flatten_values
from .artifact_io_values import normalize_policy_platform
from _tooling_text_io import slugify
from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order
from .artifact_io_values import variant_id_from_signature
from .artifact_paths import SourceConfig
from .mapping_exact_targets import exact_mappings, mapping_target, mapping_with_target
from .ruleset_bundle_helpers import (
    find_conflicting_paths,
    inflate_values,
    variant_entries_by_signature,
)


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
