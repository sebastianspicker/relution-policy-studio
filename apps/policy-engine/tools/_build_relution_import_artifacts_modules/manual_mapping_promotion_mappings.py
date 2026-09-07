"""Cohesive implementation stage 4 for manual_mapping_promotions."""

from typing import Any
from .mapping_exact_targets import mapping_with_target

def manual_promotion_ruleset_mapping(entry: dict[str, Any]) -> dict[str, Any] | None:
    """Convert one validated manual promotion entry to a ruleset mapping."""

    raw_mapping = entry.get("mapping")
    if not isinstance(raw_mapping, dict):
        return None
    kind = raw_mapping.get("kind")
    target = raw_mapping.get("target")
    values = raw_mapping.get("values")
    if (
        not isinstance(kind, str)
        or not isinstance(target, str)
        or not isinstance(values, dict)
    ):
        return None
    mapping = mapping_with_target(kind, target, values, allow_default=False)
    if mapping is None:
        return None
    mapping["match"] = {
        "score": 100,
        "matchedTerms": [
            str(value)
            for value in entry.get("evidenceRefs", [])
            if isinstance(value, str)
        ],
        "valueCompatibility": "manual-reviewed",
        "reason": str(entry.get("reviewerNote", "Manual mapping promotion.")),
    }
    if isinstance(raw_mapping.get("constraints"), list):
        mapping["constraints"] = [
            dict(value)
            for value in raw_mapping["constraints"]
            if isinstance(value, dict)
        ]
    return mapping

