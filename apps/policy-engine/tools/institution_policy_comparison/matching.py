"""Target matching and conflict detection for baseline comparisons."""

from __future__ import annotations

from typing import Any

from _build_relution_import_artifacts_modules.artifact_io_values import flatten_values
from .constants import CSP_GENERIC_TERMS
from .utils import identifier_tokens, stable_json


def conflict_for(
    policy: dict[str, Any], target: dict[str, Any]
) -> dict[str, Any] | None:
    """Return value-level differences when an institution policy conflicts."""

    policy_values = policy["settings"].get(target["target"], {})
    if not isinstance(policy_values, dict) or not policy_values:
        return None
    baseline_values = flatten_values(target["values"])
    conflicts = []
    for path, expected in policy_values.items():
        path_tuple = tuple(path.split("."))
        if path_tuple not in baseline_values:
            continue
        observed = baseline_values[path_tuple]
        if stable_json(observed) != stable_json(expected):
            conflicts.append(
                {"path": path, "institutionValue": expected, "baselineValue": observed}
            )
    if not conflicts:
        return None
    return {
        "target": target["target"],
        "ruleId": target["ruleId"],
        "differences": conflicts,
    }


def baseline_target_matches_policy(
    policy: dict[str, Any], target: dict[str, Any]
) -> bool:
    """Check whether a baseline target is represented by an institution policy."""

    if target["target"] not in policy["relutionTargets"]:
        return False
    if target["target"] != "WINDOWS_CUSTOM_CSP":
        return True
    target_name = str(target.get("targetName") or "")
    target_terms = [
        term
        for term in identifier_tokens(target_name)
        if len(term) >= 4 and term not in CSP_GENERIC_TERMS
    ]
    if not target_terms:
        return False
    match_terms = set(policy.get("matchTerms", []))
    matches = match_terms.intersection(target_terms)
    return len(matches) >= min(2, len(target_terms))
