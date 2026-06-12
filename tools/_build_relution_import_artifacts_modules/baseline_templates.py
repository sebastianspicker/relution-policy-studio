"""Build consolidated and modular Relution baseline template artifacts."""

from datetime import datetime, timezone
from pathlib import Path
from collections.abc import Callable
from typing import Any

from .artifact_io import relative_path
from .artifact_pipeline import (
    REPO_ROOT,
    SOURCE_CONFIGS,
    SourceConfig,
    mapping_target,
    path_to_string,
    slugify,
    stable_json,
    unique_preserving_order,
)
from .mapping_helpers import mapping_with_target
from .ruleset_builder import flatten_values, inflate_values

BASELINE_TEMPLATE_ROOT = REPO_ROOT / "example" / "relution-baseline-templates"
BASELINE_TEMPLATE_SOURCE_ROOT = BASELINE_TEMPLATE_ROOT / "sources"
BASELINE_TEMPLATE_CONSOLIDATED_ROOT = BASELINE_TEMPLATE_ROOT / "consolidated"
BASELINE_TEMPLATE_MODULAR_ROOT = BASELINE_TEMPLATE_ROOT / "modular"
BASELINE_TEMPLATE_TIERED_ROOT = BASELINE_TEMPLATE_ROOT / "tiered"
BASELINE_TEMPLATE_INDEX_PATH = BASELINE_TEMPLATE_ROOT / "index.json"
BASELINE_TEMPLATE_PLATFORMS = ("WINDOWS", "MACOS", "IOS", "ANDROID_ENTERPRISE")
SOURCE_PRECEDENCE = ("bsi", "cis", "vendor")
BASELINE_TIERS = (1, 2, 3)
MULTI_INSTANCE_CONSOLIDATED_TARGETS = {
    ("relution-native", "WINDOWS_CUSTOM_CSP"),
}
MACOS_IMPORT_CONFLICT_PREFERENCES = (
    {
        "preferred": (
            "apple-schema-profile",
            "profile:com.apple.mobiledevice.passwordpolicy",
        ),
        "suppressed": ("relution-native", "IOS_PASSCODE"),
        "reason": (
            "Relution imports the macOS password policy profile as the server-side passcode "
            "singleton."
        ),
    },
    {
        "preferred": ("apple-schema-profile", "profile:com.apple.security.firewall"),
        "suppressed": ("relution-native", "MACOS_FIREWALL"),
        "reason": (
            "Relution imports the macOS firewall profile as the server-side firewall "
            "singleton."
        ),
    },
    {
        "preferred": ("relution-native", "MACOS_RESTRICTION"),
        "suppressed": ("apple-schema-profile", "profile:com.apple.applicationaccess"),
        "reason": (
            "Relution treats macOS restrictions and the application access payload as "
            "conflicting server singletons; the BSI native restriction mapping has "
            "precedence."
        ),
    },
    {
        "preferred": ("relution-native", "MACOS_SCREENSAVER"),
        "suppressed": ("apple-schema-profile", "profile:com.apple.screensaver"),
        "reason": (
            "Relution imports the macOS screensaver profile as the server-side screensaver "
            "singleton; the BSI native screensaver mapping has precedence."
        ),
    },
)
IOS_IMPORT_CONFLICT_PREFERENCES = (
    {
        "preferred": ("relution-native", "IOS_PASSCODE"),
        "suppressed": (
            "apple-schema-profile",
            "profile:com.apple.mobiledevice.passwordpolicy",
        ),
        "reason": (
            "Relution treats the iOS password policy profile and native passcode setting as "
            "conflicting server singletons; the BSI native passcode mapping has precedence."
        ),
    },
    {
        "preferred": ("relution-native", "IOS_RESTRICTION"),
        "suppressed": ("apple-schema-profile", "profile:com.apple.applicationaccess"),
        "reason": (
            "Relution treats the iOS application access payload and native restrictions as "
            "conflicting server singletons; the BSI native restriction mapping has "
            "precedence."
        ),
    },
)
NON_IMPORTABLE_CONSOLIDATED_TARGETS = {
    (
        "IOS",
        "relution-native",
        "IOS_WIFI",
    ): (
        "IOS_WIFI requires organization-specific ssid, encryptionType, and proxyType "
        "values; disableAssociationMACRandomization is retained as informational "
        "guidance instead of an importable singleton."
    ),
}


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
    informational_rules = []
    for source in SOURCE_PRECEDENCE:
        template = source_templates[source]
        for policy in template.get("policies", []):
            if policy.get("platform") != platform:
                continue
            for rule in policy.get("rules", []):
                if not isinstance(rule, dict):
                    continue
                if not is_actionable_rule(rule):
                    informational_rules.append(source_informational_rule(source, rule))

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


def grouped_actionable_rules(
    template: dict[str, Any],
) -> list[tuple[tuple[str, str], list[dict[str, Any]]]]:
    """Group actionable rules by mapping kind and Relution target."""
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for policy in template.get("policies", []):
        for rule in policy.get("rules", []):
            if not isinstance(rule, dict) or not is_actionable_rule(rule):
                continue
            mapping = first_rule_mapping(rule)
            if mapping is None:
                continue
            key = (str(mapping.get("kind")), mapping_target(mapping) or "")
            grouped.setdefault(key, []).append(rule)
    return sorted(grouped.items(), key=lambda item: item[0])


def module_policy(
    platform: str,
    key: tuple[str, str],
    rules: list[dict[str, Any]],
    tier: int | None = None,
) -> dict[str, Any]:
    """Build a modular policy block for one target and optional baseline tier."""
    module = module_metadata(key)
    tier_prefix = "" if tier is None else f"Tier {tier} "
    tier_sentence = "" if tier is None else f" {tier_label(tier)}."
    description = (
        f"Modular {platform_label(platform)} baseline block for {module['target']}."
        f"{tier_sentence} Generated from the consolidated non-conflicting baseline."
    )
    return {
        "platform": platform,
        "name": f"{platform_label(platform)} {tier_prefix}Baseline - {module['label']}",
        "description": description,
        "rules": rules,
    }


def source_actionable_entries(
    platform: str, source_templates: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    """Extract actionable mapping entries from source templates in precedence order."""
    actionable_entries = []
    for source in SOURCE_PRECEDENCE:
        template = source_templates[source]
        for policy in template.get("policies", []):
            if policy.get("platform") != platform:
                continue
            for rule in policy.get("rules", []):
                if isinstance(rule, dict) and is_actionable_rule(rule):
                    actionable_entries.extend(actionable_entries_for_rule(source, rule))
    return actionable_entries


def tier_label(tier: int) -> str:
    """Return the generated-template label for a BSI baseline tier."""
    return {
        1: "Tier 1 - most restrictive Grundschutz baseline",
        2: "Tier 2 - strengthened BSI baseline",
        3: "Tier 3 - minimum secure BSI Basis baseline",
    }[tier]


def module_metadata(key: tuple[str, str]) -> dict[str, str]:
    """Describe a modular template target in stable slug and display forms."""
    kind, target = key
    return {
        "kind": kind,
        "target": target,
        "slug": slugify(f"{kind}-{target}"),
        "label": target_label(target),
    }


def first_rule_mapping(rule: dict[str, Any]) -> dict[str, Any] | None:
    """Return the first structured mapping attached to a generated ruleset rule."""
    mappings = rule.get("mappings")
    if not isinstance(mappings, list):
        return None
    for mapping in mappings:
        if isinstance(mapping, dict):
            return mapping
    return None


def consolidate_actionable_entries(
    platform: str, entries: list[dict[str, Any]]
) -> dict[str, Any]:
    """Apply source precedence and suppression rules to actionable entries."""
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
    multi_instance_rules = []
    suppressed_rules = []
    suppressed_metadata = []
    actionable_counts = {source: 0 for source in SOURCE_PRECEDENCE}

    for entry in sorted(entries, key=actionable_entry_sort_key):
        key = (entry["mapping"]["kind"], mapping_target(entry["mapping"]) or "")
        if key in MULTI_INSTANCE_CONSOLIDATED_TARGETS:
            multi_instance_rules.append(
                consolidated_rule_from_entries(
                    platform, key, [entry], entry["source"], entry["rule"]["id"]
                )
            )
            actionable_counts[entry["source"]] += 1
            continue
        grouped.setdefault(key, []).append(entry)

    grouped = apply_actionable_suppression(
        platform, grouped, suppressed_rules, suppressed_metadata
    )

    consolidated_rules = []
    for key, group_entries in sorted(grouped.items(), key=lambda item: item[0]):
        accepted, suppressed = consolidated_actionable_group(key, group_entries)
        for suppressed_rule in suppressed:
            suppressed_rules.append(suppressed_rule)
            suppressed_metadata.append(suppressed_rule["conflict"])
        if accepted:
            consolidated_rules.append(
                consolidated_rule_from_entries(platform, key, accepted, None, None)
            )
            for entry in accepted:
                actionable_counts[entry["source"]] += 1

    return {
        "rules": sorted(
            consolidated_rules + multi_instance_rules, key=lambda rule: rule["id"]
        ),
        "suppressedRules": sorted(suppressed_rules, key=lambda rule: rule["id"]),
        "suppressedConflictRules": sorted(
            suppressed_metadata, key=lambda entry: entry["ruleId"]
        ),
        "actionableRuleCounts": actionable_counts,
    }


def apply_actionable_suppression(
    platform: str,
    grouped: dict[tuple[str, str], list[dict[str, Any]]],
    suppressed_rules: list[dict[str, Any]],
    suppressed_metadata: list[dict[str, Any]],
) -> dict[tuple[str, str], list[dict[str, Any]]]:
    """Remove entries that cannot safely share the consolidated import template."""
    grouped, rules, metadata = suppress_import_conflicting_entries(platform, grouped)
    suppressed_rules.extend(rules)
    suppressed_metadata.extend(metadata)
    grouped, rules, metadata = suppress_non_importable_entries(platform, grouped)
    suppressed_rules.extend(rules)
    suppressed_metadata.extend(metadata)
    return grouped


def consolidated_actionable_group(
    key: tuple[str, str],
    group_entries: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Merge compatible target entries and suppress conflicting value paths."""
    accepted = []
    suppressed = []
    merged_paths: dict[tuple[str, ...], Any] = {}
    for entry in sorted(group_entries, key=actionable_entry_sort_key):
        flattened = flatten_values(entry["mapping"].get("values", {}))
        conflicts = [
            path
            for path, value in flattened.items()
            if path in merged_paths
            and stable_json(merged_paths[path]) != stable_json(value)
        ]
        if conflicts:
            suppressed.append(suppressed_conflict_rule(entry, key, conflicts))
            continue
        accepted.append(entry)
        for path, value in flattened.items():
            merged_paths[path] = value
    return accepted, suppressed


def actionable_entries_for_rule(
    source: str, rule: dict[str, Any]
) -> list[dict[str, Any]]:
    """Expand one source rule into one actionable entry per target mapping."""
    entries = []
    for mapping in rule.get("mappings", []):
        if not isinstance(mapping, dict) or mapping_target(mapping) is None:
            continue
        entries.append({"source": source, "rule": rule, "mapping": mapping})
    return entries


def suppress_import_conflicting_entries(
    platform: str,
    grouped: dict[tuple[str, str], list[dict[str, Any]]],
) -> tuple[
    dict[tuple[str, str], list[dict[str, Any]]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    """Suppress known Relution singleton conflicts before template import."""
    preferences = ()
    if platform == "MACOS":
        preferences = MACOS_IMPORT_CONFLICT_PREFERENCES
    elif platform == "IOS":
        preferences = IOS_IMPORT_CONFLICT_PREFERENCES
    if not preferences:
        return grouped, [], []

    suppressed_rules = []
    suppressed_metadata = []
    filtered = dict(grouped)
    for preference in preferences:
        preferred_key = preference["preferred"]
        suppressed_key = preference["suppressed"]
        if preferred_key not in filtered or suppressed_key not in filtered:
            continue
        for entry in filtered.pop(suppressed_key):
            suppressed_rule = suppressed_import_conflict_rule(
                entry, suppressed_key, preferred_key, preference["reason"]
            )
            suppressed_rules.append(suppressed_rule)
            suppressed_metadata.append(suppressed_rule["conflict"])
    return filtered, suppressed_rules, suppressed_metadata


def suppress_non_importable_entries(
    platform: str,
    grouped: dict[tuple[str, str], list[dict[str, Any]]],
) -> tuple[
    dict[tuple[str, str], list[dict[str, Any]]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    """Suppress exact mappings that need site-specific values before import."""
    suppressed_rules = []
    suppressed_metadata = []
    filtered = dict(grouped)
    for key in list(filtered):
        reason = NON_IMPORTABLE_CONSOLIDATED_TARGETS.get((platform, key[0], key[1]))
        if reason is None:
            continue
        for entry in filtered.pop(key):
            suppressed_rule = suppressed_non_importable_rule(entry, key, reason)
            suppressed_rules.append(suppressed_rule)
            suppressed_metadata.append(suppressed_rule["conflict"])
    return filtered, suppressed_rules, suppressed_metadata


def consolidated_rule_from_entries(
    platform: str,
    key: tuple[str, str],
    entries: list[dict[str, Any]],
    forced_source: str | None,
    forced_rule_id: str | None,
) -> dict[str, Any]:
    """Build the importable aggregate rule for accepted same-target entries."""
    mapping_kind, target = key
    flattened: dict[tuple[str, ...], Any] = {}
    for entry in entries:
        flattened.update(flatten_values(entry["mapping"].get("values", {})))
    mapping = mapping_with_target(mapping_kind, target, inflate_values(flattened))
    if mapping is None:
        raise ValueError(f"Unsupported mapping kind: {mapping_kind}")
    source_part = forced_source or "merged"
    rule_part = forced_rule_id or target
    return {
        "id": slugify(
            f"consolidated-{platform}-{mapping_kind}-{source_part}-{rule_part}"
        ),
        "title": f"Consolidated Relution aggregate: {target}",
        "informational": False,
        "reason": (
            "Consolidates exact mappings from "
            f"{', '.join(unique_preserving_order(entry['source'] for entry in entries))}."
        ),
        "sourceIds": unique_preserving_order(
            source_id
            for entry in entries
            for source_id in entry["rule"].get("sourceIds", [])
        ),
        "sourceRules": [
            {
                "source": entry["source"],
                "ruleId": entry["rule"]["id"],
                "title": entry["rule"].get("title", ""),
            }
            for entry in entries
        ],
        "mappings": [mapping],
    }


def suppressed_import_conflict_rule(
    entry: dict[str, Any],
    suppressed_key: tuple[str, str],
    preferred_key: tuple[str, str],
    reason: str,
) -> dict[str, Any]:
    """Represent a known singleton conflict as informational generated guidance."""
    source = entry["source"]
    rule = entry["rule"]
    conflict = {
        "source": source,
        "ruleId": rule["id"],
        "target": suppressed_key[1],
        "preferredTarget": preferred_key[1],
        "reason": reason,
    }
    return {
        **source_informational_rule(source, rule),
        "id": slugify(f"suppressed-import-conflict-{source}-{rule['id']}"),
        "title": f"Suppressed import conflict: {rule.get('title', rule['id'])}",
        "conflict": conflict,
    }


def suppressed_non_importable_rule(
    entry: dict[str, Any], key: tuple[str, str], reason: str
) -> dict[str, Any]:
    """Represent an exact but non-importable mapping as informational guidance."""
    source = entry["source"]
    rule = entry["rule"]
    conflict = {
        "source": source,
        "ruleId": rule["id"],
        "target": key[1],
        "reason": reason,
    }
    return {
        **source_informational_rule(source, rule),
        "id": slugify(f"suppressed-non-importable-{source}-{rule['id']}"),
        "title": f"Suppressed non-importable mapping: {rule.get('title', rule['id'])}",
        "conflict": conflict,
    }


def suppressed_conflict_rule(
    entry: dict[str, Any], key: tuple[str, str], conflicts: list[tuple[str, ...]]
) -> dict[str, Any]:
    """Represent a lower-precedence value conflict as informational guidance."""
    source = entry["source"]
    rule = entry["rule"]
    target = key[1]
    conflict = {
        "source": source,
        "ruleId": rule["id"],
        "target": target,
        "conflictingPaths": [path_to_string(path) for path in sorted(conflicts)],
        "reason": (
            "Suppressed from consolidated import because a higher-precedence exact mapping "
            "already set a different value."
        ),
    }
    return {
        **source_informational_rule(source, rule),
        "id": slugify(f"suppressed-{source}-{rule['id']}"),
        "title": f"Suppressed conflict: {rule.get('title', rule['id'])}",
        "conflict": conflict,
    }


def source_informational_rule(source: str, rule: dict[str, Any]) -> dict[str, Any]:
    """Copy a source rule into the consolidated template without import mappings."""
    copied = dict(rule)
    copied["id"] = f"{source}:{rule.get('id', '')}"
    copied["informational"] = True
    copied["mappings"] = []
    copied["source"] = source
    return copied


def is_actionable_rule(rule: dict[str, Any]) -> bool:
    """Return whether a generated rule still carries importable mappings."""
    return (
        rule.get("informational") is not True
        and isinstance(rule.get("mappings"), list)
        and len(rule["mappings"]) > 0
    )


def actionable_entry_sort_key(entry: dict[str, Any]) -> tuple[int, str, str]:
    """Sort actionable entries deterministically by precedence, rule, and values."""
    return (
        SOURCE_PRECEDENCE.index(entry["source"]),
        entry["rule"].get("id", ""),
        stable_json(entry["mapping"].get("values", {})),
    )


def informational_counts_by_source(rules: list[dict[str, Any]]) -> dict[str, int]:
    """Count informational rules per source for consolidation metadata."""
    counts = {source: 0 for source in SOURCE_PRECEDENCE}
    for rule in rules:
        source = str(rule.get("source", ""))
        if source in counts:
            counts[source] += 1
    return counts


def verified_as_of_by_source(
    source_templates: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Preserve per-source verification dates in consolidated templates."""
    return {
        source: template.get("verifiedAsOf")
        for source, template in source_templates.items()
    }


def source_references() -> dict[str, dict[str, str]]:
    """Expose stable generated-artifact references for each guidance source."""
    return {
        source: {
            "baselinePath": relative_path(config.baseline_path),
            "recommendationCatalogPath": relative_path(
                config.recommendation_catalog_path
            ),
            "rulesetPath": relative_path(config.ruleset_path),
        }
        for source, config in SOURCE_CONFIGS.items()
    }


def index_entry(
    path: Path, template: dict[str, Any], *, platform: str, source: str | None = None
) -> dict[str, Any]:
    """Summarize a generated baseline template for the template index."""
    rules = [
        rule
        for policy in template.get("policies", [])
        for rule in policy.get("rules", [])
    ]
    entry = {
        "path": relative_path(path),
        "platform": platform,
        "policyCount": len(template.get("policies", [])),
        "ruleCount": len(rules),
        "actionableRuleCount": len(
            [rule for rule in rules if is_actionable_rule(rule)]
        ),
        "informationalRuleCount": len(
            [rule for rule in rules if not is_actionable_rule(rule)]
        ),
    }
    if source is not None:
        entry["source"] = source
    baseline_template = template.get("baselineTemplate")
    if isinstance(baseline_template, dict) and isinstance(
        baseline_template.get("module"), dict
    ):
        entry["module"] = baseline_template["module"]
    if isinstance(baseline_template, dict) and isinstance(
        baseline_template.get("tier"), int
    ):
        entry["tier"] = baseline_template["tier"]
        entry["tierLabel"] = baseline_template.get("tierLabel")
        entry["securityLevel"] = baseline_template.get("securityLevel")
        entry["tierSourcePolicy"] = baseline_template.get("tierSourcePolicy")
        entry["tierCoverage"] = baseline_template.get("tierCoverage")
    if isinstance(template.get("consolidation"), dict):
        entry["suppressedConflictRuleCount"] = len(
            template["consolidation"].get("suppressedConflictRules", [])
        )
    return entry


def platform_label(platform: str) -> str:
    """Return the generated-artifact display label for a platform code."""
    return {
        "WINDOWS": "Windows",
        "MACOS": "macOS",
        "IOS": "iOS",
        "ANDROID_ENTERPRISE": "Android Enterprise",
    }[platform]


def platform_slug(platform: str) -> str:
    """Convert a platform code into a generated path slug."""
    return platform.lower().replace("_", "-")


def target_label(target: str) -> str:
    """Return a human-readable label for a Relution or Apple payload target."""
    if target.startswith("profile:"):
        return (
            target.removeprefix("profile:")
            .replace("com.apple.", "Apple ")
            .replace(".", " ")
            .title()
        )
    if target.startswith("com.apple."):
        return target.replace("com.apple.", "Apple ").replace(".", " ").title()
    if target.startswith("IOS_"):
        return "iOS " + target.removeprefix("IOS_").replace("_", " ").title()
    if target.startswith("IPADOS_"):
        return "iPadOS " + target.removeprefix("IPADOS_").replace("_", " ").title()
    if target.startswith("MACOS_"):
        return "macOS " + target.removeprefix("MACOS_").replace("_", " ").title()
    return target.replace("_", " ").title()


def generated_timestamp() -> str:
    """Return the UTC timestamp format stored in generated template metadata."""
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


__all__ = [
    name
    for name in globals()
    if not name.startswith("_")
    and name not in {"source_actionable_entries", "tier_label"}
]
