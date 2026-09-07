"""Setting-bundle and variant-group construction."""

from __future__ import annotations

from typing import Any

from .artifact_io_values import flatten_values
from .artifact_io_values import path_to_string
from .artifact_io_paths import relative_path
from _tooling_text_io import slugify
from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order
from .artifact_io_values import unique_single_value
from .artifact_io_values import variant_id_from_signature
from .artifact_paths import SourceConfig
from .ruleset_bundle_helpers import (
    find_conflicting_paths,
    inflate_values,
    merged_non_conflicting_paths,
    variant_entries_by_signature,
)


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
