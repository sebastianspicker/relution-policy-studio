"""Source-rule extraction for baseline-template consolidation."""

from typing import Any

from .baseline_template_constants import SOURCE_PRECEDENCE
from .baseline_template_support import is_actionable_rule
from .mapping_exact_targets import mapping_target


def source_actionable_entries(
    platform: str, source_templates: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    """Extract actionable mapping entries from source templates in precedence order."""
    return [
        entry
        for source, rule in source_platform_rules(platform, source_templates)
        if is_actionable_rule(rule)
        for entry in actionable_entries_for_rule(source, rule)
    ]


def source_platform_rules(
    platform: str, source_templates: dict[str, dict[str, Any]]
) -> list[tuple[str, dict[str, Any]]]:
    """Return dictionary rules for one platform in source precedence order."""
    return [
        (source, rule)
        for source in SOURCE_PRECEDENCE
        for policy in source_templates[source].get("policies", [])
        if policy.get("platform") == platform
        for rule in policy.get("rules", [])
        if isinstance(rule, dict)
    ]


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
