"""Shared source and metadata helpers for baseline templates."""

from datetime import datetime, timezone
from typing import Any

from .artifact_io_paths import relative_path
from .artifact_io_values import stable_json
from .artifact_paths import SOURCE_CONFIGS
from .baseline_template_constants import SOURCE_PRECEDENCE


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


def generated_timestamp() -> str:
    """Return the UTC timestamp format stored in generated template metadata."""
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
