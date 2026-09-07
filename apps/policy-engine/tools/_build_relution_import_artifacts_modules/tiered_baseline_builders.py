"""Tier-aware baseline template builders."""

from typing import Any

from .baseline_template_constants import SOURCE_PRECEDENCE
from .baseline_template_builders import consolidation_metadata
from .baseline_template_consolidation import consolidate_actionable_entries
from .baseline_template_modules import grouped_actionable_rules
from .baseline_template_modules import module_metadata
from .baseline_template_modules import module_policy
from .baseline_template_builders import modular_bundle
from .baseline_template_builders import module_target_templates
from .baseline_template_labels import platform_label
from .baseline_template_sources import source_actionable_entries
from .baseline_template_modules import tier_label
from .baseline_template_support import verified_as_of_by_source
from .tiered_baseline_metadata import actionable_entry_key, baseline_template_metadata, module_tier_coverage, tier_coverage


def tiered_consolidated_platform_template(platform: str, source_templates: dict[str, dict[str, Any]], tier: int) -> dict[str, Any]:
    """Build the consolidated baseline template for one platform and tier."""
    actionable_entries = tiered_actionable_entries(platform, source_templates, tier)
    consolidated = consolidate_actionable_entries(platform, actionable_entries)
    policies = [{"platform": platform, "name": f"{platform_label(platform)} Tier {tier} Baseline", "description": f"{tier_label(tier)}. Generated from BSI, CIS, and vendor guidance with BSI precedence.", "rules": consolidated["rules"] + consolidated["suppressedRules"]}]
    return {"version": 1, "name": f"{platform_label(platform)} Tier {tier} Baseline Template", "verifiedAsOf": verified_as_of_by_source(source_templates), "baselineTemplate": baseline_template_metadata("tiered-consolidated-platform", platform, tier, tier_coverage(tier, consolidated)), "consolidation": consolidation_metadata(platform, consolidated, {source: 0 for source in SOURCE_PRECEDENCE}), "policies": policies}


def tiered_modular_bundle_template(platform: str, full_template: dict[str, Any], tier: int) -> dict[str, Any]:
    """Build the modular bundle template for a tiered platform baseline."""
    policies = [module_policy(platform, key, rules, tier=tier) for key, rules in grouped_actionable_rules(full_template)]
    return modular_bundle(f"{platform_label(platform)} Tier {tier} Modular Baseline Template", full_template, baseline_template_metadata("tiered-modular-platform", platform, tier, full_template.get("baselineTemplate", {}).get("tierCoverage", "distinct")), policies)


def tiered_modular_target_templates(platform: str, full_template: dict[str, Any], tier: int) -> list[dict[str, Any]]:
    """Build per-module templates for a tiered platform baseline."""
    return module_target_templates(platform, full_template, lambda key, rules: module_policy(platform, key, rules, tier=tier), lambda key, rules: baseline_template_metadata("tiered-modular-target", platform, tier, module_tier_coverage(rules), {"module": module_metadata(key)}))


def tiered_actionable_entries(platform: str, source_templates: dict[str, dict[str, Any]], tier: int) -> list[dict[str, Any]]:
    """Select source entries included by a baseline tier's precedence policy."""
    entries = source_actionable_entries(platform, source_templates)
    bsi_keys = {actionable_entry_key(entry) for entry in entries if entry["source"] == "bsi"}
    return [entry for entry in entries if entry["source"] == "bsi" or tier == 1 or (tier == 2 and actionable_entry_key(entry) in bsi_keys)]
