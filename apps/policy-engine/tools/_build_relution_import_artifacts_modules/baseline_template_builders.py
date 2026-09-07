"""Top-level source, consolidated, and modular template builders."""

from collections.abc import Callable
from typing import Any

from .artifact_io_paths import relative_path
from .artifact_paths import SourceConfig
from .baseline_template_constants import SOURCE_PRECEDENCE
from .baseline_template_consolidation import consolidate_actionable_entries
from .baseline_template_labels import platform_label
from .baseline_template_modules import (
    grouped_actionable_rules,
    module_metadata,
    module_policy,
)
from .baseline_template_sources import source_actionable_entries, source_platform_rules
from .baseline_template_support import (
    generated_timestamp,
    informational_counts_by_source,
    is_actionable_rule,
    source_informational_rule,
    source_references,
    verified_as_of_by_source,
)


def source_platform_template(
    config: SourceConfig, ruleset: dict[str, Any], platform: str
) -> dict[str, Any]:
    """Build one source-specific platform template, including empty-source stubs."""
    policies = [
        dict(policy)
        for policy in ruleset.get("policies", [])
        if policy.get("platform") == platform
    ]
    if not policies:
        policies = [
            {
                "platform": platform,
                "name": f"{platform_label(platform)} {config.label} Baseline",
                "description": (
                    f"No {config.label} recommendations are currently harvested for "
                    f"{platform_label(platform)}."
                ),
                "rules": [],
            }
        ]
    return {
        "version": 1,
        "name": f"{platform_label(platform)} {config.label} Baseline Template",
        "verifiedAsOf": ruleset.get("verifiedAsOf"),
        "sourceIndexPath": ruleset.get("sourceIndexPath"),
        "recommendationCatalogPath": ruleset.get("recommendationCatalogPath"),
        "baselineTemplate": {
            "version": 1,
            "kind": "source-platform",
            "source": config.source,
            "platform": platform,
            "sourceRulesetPath": relative_path(config.ruleset_path),
            "generatedAt": generated_timestamp(),
        },
        "policies": policies,
    }


def consolidated_platform_template(
    platform: str, source_templates: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    """Merge source templates into one platform template with BSI-first precedence."""
    informational_rules = [
        source_informational_rule(source, rule)
        for source, rule in source_platform_rules(platform, source_templates)
        if not is_actionable_rule(rule)
    ]
    actionable_entries = source_actionable_entries(platform, source_templates)
    consolidated = consolidate_actionable_entries(platform, actionable_entries)
    policies = [
        {
            "platform": platform,
            "name": f"{platform_label(platform)} Full Baseline",
            "description": (
                "Generated from BSI, CIS, and vendor guidance. BSI exact mappings take "
                "precedence; lower-priority conflicts stay informational."
            ),
            "rules": informational_rules
            + consolidated["rules"]
            + consolidated["suppressedRules"],
        }
    ]
    return {
        "version": 1,
        "name": f"{platform_label(platform)} Full Baseline Template",
        "verifiedAsOf": verified_as_of_by_source(source_templates),
        "baselineTemplate": {
            "version": 1,
            "kind": "consolidated-platform",
            "platform": platform,
            "generatedAt": generated_timestamp(),
        },
        "consolidation": consolidation_metadata(
            platform,
            consolidated,
            informational_counts_by_source(informational_rules),
        ),
        "policies": policies,
    }


def modular_bundle_template(
    platform: str, full_template: dict[str, Any]
) -> dict[str, Any]:
    """Group a consolidated platform template into module policies by target."""
    module_policies = [
        module_policy(platform, key, rules)
        for key, rules in grouped_actionable_rules(full_template)
    ]
    return modular_bundle(
        f"{platform_label(platform)} Modular Baseline Template",
        full_template,
        baseline_template_metadata("modular-platform", platform),
        module_policies,
    )


def modular_target_templates(
    platform: str, full_template: dict[str, Any]
) -> list[dict[str, Any]]:
    """Build one importable modular baseline template per consolidated target."""
    return module_target_templates(
        platform,
        full_template,
        lambda key, rules: module_policy(platform, key, rules),
        lambda key, _rules: baseline_template_metadata(
            "modular-target", platform, {"module": module_metadata(key)}
        ),
    )


def consolidation_metadata(
    platform: str,
    consolidated: dict[str, Any],
    informational_counts: dict[str, int],
) -> dict[str, Any]:
    """Build shared consolidation metadata for full baseline templates."""
    return {
        "platform": platform,
        "sources": list(SOURCE_PRECEDENCE),
        "precedence": list(SOURCE_PRECEDENCE),
        "sourceReferences": source_references(),
        "actionableRuleCounts": consolidated["actionableRuleCounts"],
        "informationalRuleCounts": informational_counts,
        "suppressedConflictRules": consolidated["suppressedConflictRules"],
    }


def modular_bundle(
    name: str,
    full_template: dict[str, Any],
    baseline_template: dict[str, Any],
    policies: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build the common wrapper for modular baseline bundle templates."""
    return {
        "version": 1,
        "name": name,
        "verifiedAsOf": full_template.get("verifiedAsOf"),
        "baselineTemplate": baseline_template,
        "consolidation": full_template.get("consolidation"),
        "policies": policies,
    }


def module_target_templates(
    platform: str,
    full_template: dict[str, Any],
    policy_for: Callable[[tuple[str, str], list[dict[str, Any]]], dict[str, Any]],
    baseline_template_for: Callable[
        [tuple[str, str], list[dict[str, Any]]], dict[str, Any]
    ],
) -> list[dict[str, Any]]:
    """Build per-target modular templates from grouped actionable rules."""
    templates = []
    for key, rules in grouped_actionable_rules(full_template):
        policy = policy_for(key, rules)
        templates.append(
            module_template(
                platform, full_template, policy, baseline_template_for(key, rules)
            )
        )
    return templates


def baseline_template_metadata(
    kind: str, platform: str, extra: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Build common baseline template metadata for generated baseline files."""
    metadata = {
        "version": 1,
        "kind": kind,
        "platform": platform,
        "generatedAt": generated_timestamp(),
    }
    if extra is not None:
        metadata.update(extra)
    return metadata


def module_template(
    platform: str,
    full_template: dict[str, Any],
    policy: dict[str, Any],
    baseline_template: dict[str, Any],
) -> dict[str, Any]:
    """Build a single modular target template around one generated policy."""
    return {
        "version": 1,
        "name": f"{policy['name']} Module Template",
        "verifiedAsOf": full_template.get("verifiedAsOf"),
        "baselineTemplate": baseline_template,
        "consolidation": module_consolidation(platform, full_template),
        "policies": [policy],
    }


def module_consolidation(
    platform: str, full_template: dict[str, Any]
) -> dict[str, Any]:
    """Copy the consolidation fields needed by per-module templates."""
    consolidation = full_template.get("consolidation", {})
    return {
        "platform": platform,
        "sources": consolidation.get("sources", []),
        "precedence": consolidation.get("precedence", []),
        "sourceReferences": consolidation.get("sourceReferences", {}),
    }
