"""Cohesive implementation stage 5 for relution_mapping_updates."""

from typing import Any
from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order

def exact_mapping_identity(mapping: dict[str, Any]) -> tuple[str, str, tuple[str, ...]]:
    """Return the target identity used to compare exact mapping value drift."""
    return (
        str(mapping.get("kind", "")),
        str(mapping.get("target", "")),
        tuple(
            str(path) for path in mapping.get("fieldPaths", []) if isinstance(path, str)
        ),
    )

def candidate_reference_ids_from_snapshot(change_row: dict[str, Any]) -> list[str]:
    """Collect unique reference ids from candidate snapshots for update rows."""
    return unique_preserving_order(
        [
            str(reference_id)
            for candidate in change_row.get("candidateMappings", [])
            if isinstance(candidate, dict)
            for reference_id in candidate.get("referenceMappingIds", [])
            if isinstance(reference_id, str)
        ]
    )[:8]

def relution_mapping_update_reason(classification: str, confidence_tier: str) -> str:
    """Explain why a mapping update row is safe, parameterized, or manual."""
    if confidence_tier == "safe-retain":
        return "Mapping targets and values are stable; only semantic or evidence metadata changed."
    if confidence_tier == "safe-mechanical-update":
        return (
            "Exact mapping target and field paths are stable, and value changes are "
            "type-compatible."
        )
    if confidence_tier == "parameter-needed":
        return "Recommendation remains parameterized; local values or evidence are required."
    if confidence_tier == "gap-or-parser-work":
        return (
            "Recommendation appeared or disappeared and needs source or parser inspection "
            "before mapping changes."
        )
    if classification == "candidate-target-changed":
        return (
            "Candidate target drift is advisory and must not promote exact mappings "
            "automatically."
        )
    return "Exact mapping status, target, or value drift requires manual ledger review."
