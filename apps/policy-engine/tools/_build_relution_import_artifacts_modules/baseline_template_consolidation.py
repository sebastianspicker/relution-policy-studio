"""Precedence-aware consolidation of actionable baseline entries."""

from typing import Any

from .artifact_io_values import stable_json
from .baseline_template_constants import (
    MULTI_INSTANCE_CONSOLIDATED_TARGETS,
    SOURCE_PRECEDENCE,
)
from .baseline_template_rules import consolidated_rule_from_entries
from .baseline_template_support import actionable_entry_sort_key
from .baseline_template_suppressions import (
    suppress_import_conflicting_entries,
    suppress_non_importable_entries,
)
from .mapping_exact_targets import mapping_target
from .artifact_io_values import flatten_values
from .baseline_template_suppressions import suppressed_conflict_rule


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
