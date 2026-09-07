"""Generated Relution baseline harvesting for policy comparisons."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterator

from _build_relution_import_artifacts_modules.artifact_io_values import flatten_values
from .constants import REPO_ROOT
from .summary import summarize_by_platform
from .utils import path_to_string, read_json


def harvest_relution_baseline_index(index_path: Path) -> dict[str, Any]:
    """Build a normalized index of actionable generated baseline targets."""

    template_index = read_json(index_path)
    actionable_targets = []
    suppressed_conflicts = []
    for platform, rule in _iter_consolidated_platform_rules(template_index):
        if rule.get("conflict") is not None:
            suppressed_conflicts.append({"platform": platform, **rule["conflict"]})
        if not is_actionable(rule):
            continue
        for mapping in rule.get("mappings", []):
            mapping_record = _build_actionable_mapping_record(platform, rule, mapping)
            if mapping_record is not None:
                actionable_targets.append(mapping_record)
    return {
        "version": 1,
        "name": "Generated Relution Baseline Index",
        "baselineTemplateIndexPath": index_path.relative_to(REPO_ROOT).as_posix(),
        "generatedAt": template_index.get("generatedAt"),
        "actionableTargets": actionable_targets,
        "suppressedConflicts": suppressed_conflicts,
        "summary": summarize_by_platform(actionable_targets),
    }


def _iter_consolidated_platform_rules(
    template_index: dict[str, Any],
) -> Iterator[tuple[str, dict[str, Any]]]:
    """Yield consolidated template rules in their platform, policy, and rule order."""

    for entry in template_index["consolidatedTemplates"]:
        ruleset = read_json(REPO_ROOT / entry["path"])
        platform = entry["platform"]
        for policy in ruleset.get("policies", []):
            for rule in policy.get("rules", []):
                yield platform, rule


def _build_actionable_mapping_record(
    platform: str, rule: dict[str, Any], mapping: dict[str, Any]
) -> dict[str, Any] | None:
    """Build one actionable mapping record when its target is supported."""

    target = mapping_target(mapping)
    if target is None:
        return None
    return {
        "platform": platform,
        "ruleId": rule["id"],
        "title": rule["title"],
        "kind": mapping.get("kind"),
        "target": target,
        "targetName": mapping.get("values", {}).get("name")
        if isinstance(mapping.get("values"), dict)
        else None,
        "fieldPaths": sorted(
            path_to_string(path) for path in flatten_values(mapping.get("values", {}))
        ),
        "values": mapping.get("values", {}),
        "sources": sorted(
            {
                source_rule.get("source")
                for source_rule in rule.get("sourceRules", [])
                if source_rule.get("source")
            }
        ),
        "sourceRules": rule.get("sourceRules", []),
    }


def is_actionable(rule: dict[str, Any]) -> bool:
    """Return true for baseline rules that carry concrete mappings."""

    return (
        rule.get("informational") is not True
        and isinstance(rule.get("mappings"), list)
        and len(rule["mappings"]) > 0
    )


def mapping_target(mapping: dict[str, Any]) -> str | None:
    """Return the target identifier from any supported mapping shape."""

    for key in ("type", "payloadType", "schemaId"):
        if isinstance(mapping.get(key), str):
            return mapping[key]
    return None
