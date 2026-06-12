"""Compose tiered baseline template variants from source templates."""

from __future__ import annotations

from typing import Any

from .baseline_templates import (
    SOURCE_PRECEDENCE,
    consolidation_metadata,
    consolidate_actionable_entries,
    generated_timestamp,
    grouped_actionable_rules,
    mapping_target,
    module_metadata,
    modular_bundle,
    module_policy,
    module_target_templates,
    platform_label,
    source_actionable_entries,
    tier_label,
    verified_as_of_by_source,
)


def tiered_consolidated_platform_template(
    platform: str, source_templates: dict[str, dict[str, Any]], tier: int
) -> dict[str, Any]:
    """Build the consolidated baseline template for one platform and tier."""

    actionable_entries = tiered_actionable_entries(platform, source_templates, tier)
    consolidated = consolidate_actionable_entries(platform, actionable_entries)
    coverage = tier_coverage(tier, consolidated)
    policies = [
        {
            "platform": platform,
            "name": f"{platform_label(platform)} Tier {tier} Baseline",
            "description": (
                f"{tier_label(tier)}. Generated from BSI, CIS, and vendor guidance "
                "with BSI precedence."
            ),
            "rules": consolidated["rules"] + consolidated["suppressedRules"],
        }
    ]
    return {
        "version": 1,
        "name": f"{platform_label(platform)} Tier {tier} Baseline Template",
        "verifiedAsOf": verified_as_of_by_source(source_templates),
        "baselineTemplate": baseline_template_metadata(
            "tiered-consolidated-platform", platform, tier, coverage
        ),
        "consolidation": consolidation_metadata(
            platform,
            consolidated,
            {source: 0 for source in SOURCE_PRECEDENCE},
        ),
        "policies": policies,
    }


def tiered_modular_bundle_template(
    platform: str, full_template: dict[str, Any], tier: int
) -> dict[str, Any]:
    """Build the modular bundle template for a tiered platform baseline."""

    module_policies = [
        module_policy(platform, key, rules, tier=tier)
        for key, rules in grouped_actionable_rules(full_template)
    ]
    return modular_bundle(
        f"{platform_label(platform)} Tier {tier} Modular Baseline Template",
        full_template,
        baseline_template_metadata(
            "tiered-modular-platform",
            platform,
            tier,
            full_template.get("baselineTemplate", {}).get("tierCoverage", "distinct"),
        ),
        module_policies,
    )


def tiered_modular_target_templates(
    platform: str, full_template: dict[str, Any], tier: int
) -> list[dict[str, Any]]:
    """Build per-module templates for a tiered platform baseline."""

    return module_target_templates(
        platform,
        full_template,
        lambda key, rules: module_policy(platform, key, rules, tier=tier),
        lambda key, rules: baseline_template_metadata(
            "tiered-modular-target",
            platform,
            tier,
            module_tier_coverage(rules),
            {"module": module_metadata(key)},
        ),
    )


def tiered_actionable_entries(
    platform: str, source_templates: dict[str, dict[str, Any]], tier: int
) -> list[dict[str, Any]]:
    """Select source entries included by a baseline tier's precedence policy."""

    entries = source_actionable_entries(platform, source_templates)
    bsi_keys = {
        actionable_entry_key(entry) for entry in entries if entry["source"] == "bsi"
    }
    selected = []
    for entry in entries:
        if entry["source"] == "bsi":
            selected.append(entry)
        elif tier == 1:
            selected.append(entry)
        elif tier == 2 and actionable_entry_key(entry) in bsi_keys:
            selected.append(entry)
    return selected


def baseline_template_metadata(
    kind: str,
    platform: str,
    tier: int,
    coverage: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return shared metadata for a generated tiered template."""

    metadata = {
        "version": 1,
        "kind": kind,
        "platform": platform,
        "tier": tier,
        "tierLabel": tier_label(tier),
        "securityLevel": tier_security_level(tier),
        "tierSourcePolicy": "bsi-cis-vendor",
        "tierCoverage": coverage,
    }
    if extra is not None:
        metadata.update(extra)
    metadata["generatedAt"] = generated_timestamp()
    return metadata


def actionable_entry_key(entry: dict[str, Any]) -> tuple[str, str]:
    """Return the mapping identity used to compare actionable entries."""

    return (entry["mapping"]["kind"], mapping_target(entry["mapping"]) or "")


def tier_security_level(tier: int) -> str:
    """Return the semantic security level label for a baseline tier."""

    return {
        1: "grundschutz",
        2: "standard-hardening",
        3: "basis",
    }[tier]


def tier_coverage(tier: int, consolidated: dict[str, Any]) -> str:
    """Return whether a tier adds distinct CIS/vendor coverage."""

    if tier == 3:
        return "distinct"
    counts = consolidated.get("actionableRuleCounts", {})
    if any(counts.get(source, 0) > 0 for source in ("cis", "vendor")):
        return "distinct"
    return "inherited"


def module_tier_coverage(rules: list[dict[str, Any]]) -> str:
    """Return whether a module contains non-BSI tier coverage."""

    for rule in rules:
        for source_rule in rule.get("sourceRules", []):
            if source_rule.get("source") in {"cis", "vendor"}:
                return "distinct"
    return "inherited"
