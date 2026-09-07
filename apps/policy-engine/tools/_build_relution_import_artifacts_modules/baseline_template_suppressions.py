"""Known import-conflict and non-importable baseline suppressions."""

from typing import Any

from .artifact_io_values import path_to_string
from _tooling_text_io import slugify
from .baseline_template_constants import (
    GroupedEntries,
    IOS_IMPORT_CONFLICT_PREFERENCES,
    MACOS_IMPORT_CONFLICT_PREFERENCES,
    NON_IMPORTABLE_CONSOLIDATED_TARGETS,
    SuppressionResult,
)
from .baseline_template_support import source_informational_rule


def suppress_import_conflicting_entries(
    platform: str,
    grouped: GroupedEntries,
) -> SuppressionResult:
    """Suppress known Relution singleton conflicts before template import."""
    preferences = ()
    if platform == "MACOS":
        preferences = MACOS_IMPORT_CONFLICT_PREFERENCES
    elif platform == "IOS":
        preferences = IOS_IMPORT_CONFLICT_PREFERENCES
    if not preferences:
        return grouped, [], []

    filtered, suppressed_rules, suppressed_metadata = suppression_result(grouped)
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
    grouped: GroupedEntries,
) -> SuppressionResult:
    """Suppress exact mappings that need site-specific values before import."""
    filtered, suppressed_rules, suppressed_metadata = suppression_result(grouped)
    for key in list(filtered):
        reason = NON_IMPORTABLE_CONSOLIDATED_TARGETS.get((platform, key[0], key[1]))
        if reason is None:
            continue
        for entry in filtered.pop(key):
            suppressed_rule = suppressed_non_importable_rule(entry, key, reason)
            suppressed_rules.append(suppressed_rule)
            suppressed_metadata.append(suppressed_rule["conflict"])
    return filtered, suppressed_rules, suppressed_metadata


def suppression_result(
    grouped: GroupedEntries,
) -> SuppressionResult:
    """Initialize the independent result collections for suppression passes."""
    return dict(grouped), [], []


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
