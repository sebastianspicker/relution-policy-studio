"""Index rows for generated baseline-template artifacts."""

from pathlib import Path
from typing import Any

from .artifact_io_paths import relative_path
from .baseline_template_support import is_actionable_rule


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
