"""Cohesive implementation stage 6 for unified_analysis."""

from .artifact_paths import AUTHORITATIVE_SOURCE
from typing import Any

def exact_value_difference_entry(
    platform: str,
    kind: str,
    target: str,
    field_path: str,
    leaves: list[dict[str, Any]],
) -> dict[str, Any]:
    """Render a source-by-source exact-value difference for review."""

    values_by_source: dict[str, list[dict[str, Any]]] = {}
    for leaf in leaves:
        values_by_source.setdefault(str(leaf["source"]), []).append(
            {
                "recommendationId": leaf["recommendationId"],
                "title": leaf["title"],
                "value": leaf["value"],
                "constraints": leaf["constraints"],
            }
        )
    return {
        "id": "",
        "type": "",
        "severity": "",
        "platform": platform,
        "kind": kind,
        "target": target,
        "fieldPath": field_path,
        "sources": sorted(values_by_source),
        "authoritativeSource": AUTHORITATIVE_SOURCE,
        "resolution": (
            "BSI is authoritative for interpretation; this analysis does not rewrite CIS or "
            "vendor mappings."
        ),
        "valuesBySource": {
            source: values_by_source[source] for source in sorted(values_by_source)
        },
    }

def exact_leaf_difference_is_hard(leaves: list[dict[str, Any]]) -> bool:
    """Classify exact-value differences as hard unless constraints overlap."""

    bounds = numeric_constraint_bounds(leaves)
    if bounds is not None:
        lower, upper = bounds
        if upper is None or lower is None or lower <= upper:
            return False
    return True

def numeric_constraint_bounds(
    leaves: list[dict[str, Any]],
) -> tuple[float | None, float | None] | None:
    """Return combined numeric bounds when exact leaves carry constraints."""

    lower: float | None = None
    upper: float | None = None
    saw_numeric_constraint = False
    for leaf in leaves:
        for constraint in leaf.get("constraints", []):
            if not isinstance(constraint, dict):
                continue
            value = constraint.get("value")
            if not isinstance(value, int | float):
                continue
            operator = constraint.get("operator")
            if operator == "atLeast":
                lower = value if lower is None else max(lower, value)
                saw_numeric_constraint = True
            elif operator == "atMost":
                upper = value if upper is None else min(upper, value)
                saw_numeric_constraint = True
    if not saw_numeric_constraint:
        return None
    return lower, upper

