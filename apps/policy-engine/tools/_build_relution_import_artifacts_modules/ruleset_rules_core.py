"""Top-level ruleset assembly for generated Relution artifacts."""

from __future__ import annotations

from typing import Any

from .artifact_io_paths import relative_path
from .artifact_paths import SourceConfig
from .ruleset_non_native import build_non_native_aggregate_rules
from .ruleset_rules import (
    aggregate_bundles_by_platform,
    informative_entries_by_platform_for,
    ruleset_policies,
)


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
        "sourceIndexPath": relative_source_index_path(config),
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


def relative_source_index_path(config: SourceConfig) -> str | None:
    """Return the optional source-index path used by a generated ruleset."""

    source_index = config.root / "sources.json"
    return relative_path(source_index) if source_index.exists() else None
