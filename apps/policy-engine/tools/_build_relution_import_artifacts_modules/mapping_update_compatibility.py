"""Cohesive implementation stage 8 for mapping_review_artifacts."""

from typing import Any
from _recommendation_mapping_modules.field_matching_values import flatten_value_paths
from .mapping_exact_targets import mapping_target

def classify_mapping_update(
    previous_mapping: dict[str, Any], current_mapping: dict[str, Any]
) -> str:
    """Classify exact mapping drift for manual-ledger update decisions."""

    previous_target = previous_mapping.get("target") or mapping_target(previous_mapping)
    current_target = current_mapping.get("target") or mapping_target(current_mapping)
    if (
        previous_mapping.get("kind") != current_mapping.get("kind")
        or previous_target != current_target
    ):
        return "human-review-required"
    previous_paths = flatten_value_paths(previous_mapping.get("values", {}))
    current_paths = flatten_value_paths(current_mapping.get("values", {}))
    if previous_paths != current_paths:
        return "manual-ledger-needed"
    if previous_mapping.get("values") == current_mapping.get("values"):
        return "safe-retain"
    if mapping_values_type_compatible(
        previous_mapping.get("values", {}), current_mapping.get("values", {})
    ):
        return "safe-mechanical-update"
    return "manual-ledger-needed"

def mapping_values_type_compatible(previous: Any, current: Any) -> bool:
    """Return whether two mapping value trees keep the same value types."""

    if isinstance(previous, dict) and isinstance(current, dict):
        if set(previous) != set(current):
            return False
        return all(
            mapping_values_type_compatible(previous[key], current[key])
            for key in previous
        )
    if isinstance(previous, list) and isinstance(current, list):
        return (
            all(isinstance(value, type(previous[0])) for value in current)
            if previous and current
            else True
        )
    return type(previous) is type(current)
