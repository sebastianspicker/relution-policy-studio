"""Small policy-rendering helpers for Relution rulesets."""

from __future__ import annotations

from typing import Any

from .artifact_io_rules import build_aggregate_rule
from .artifact_io_rules import build_informational_rule
from .artifact_io_rule_text import policy_description
from .artifact_io_rule_text import policy_name
from .artifact_paths import SourceConfig


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
