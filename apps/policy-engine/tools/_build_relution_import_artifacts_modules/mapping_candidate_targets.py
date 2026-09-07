"""Cohesive implementation stage 2 for mapping_helpers."""

from typing import Any

def iter_candidate_mapping_targets(recommendation: dict[str, Any]) -> list[str]:
    """Return candidate target identifiers not already covered by exact mappings."""
    from .mapping_exact_targets import iter_exact_mapping_targets

    exact_targets = set(iter_exact_mapping_targets(recommendation))
    targets = []
    for candidate in recommendation.get("relutionMapping", {}).get("candidates", []):
        if (
            isinstance(candidate, dict)
            and isinstance(candidate.get("target"), str)
            and candidate["target"] not in exact_targets
        ):
            targets.append(candidate["target"])
    return targets

