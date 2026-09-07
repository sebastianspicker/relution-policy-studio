"""Platform policy assembly for generated Relution rulesets."""

from __future__ import annotations

import itertools
from typing import Any

from .artifact_io_rules import build_aggregate_rule
from .artifact_io_values import normalize_policy_platform
from .artifact_paths import PLATFORM_ORDER, SourceConfig
from .ruleset_policy_helpers import (
    aggregate_rules_for,
    informational_rules_for,
    ruleset_policy,
    variant_options_for,
)


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
