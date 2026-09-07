"""Cohesive implementation stage 4 for relution_mapping_updates."""

from typing import Any
from .artifact_paths import PLATFORM_ORDER
from .mapping_update_compatibility import classify_mapping_update
from .mapping_update_confidence import required_action_for_confidence_tier

def build_relution_mapping_update_plan_rows(
    change_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Convert changed mapping rows into manual or safe-update plan rows."""
    from .relution_update_identity import candidate_reference_ids_from_snapshot, relution_mapping_update_reason
    rows: list[dict[str, Any]] = []
    for change_row in change_rows:
        classification = str(change_row.get("changeClassification", "unchanged"))
        if classification == "unchanged":
            continue
        confidence_tier = relution_mapping_confidence_tier(change_row)
        rows.append(
            {
                "source": str(change_row.get("source", "")),
                "recommendationId": str(change_row.get("recommendationId", "")),
                "globalRecommendationId": str(
                    change_row.get("globalRecommendationId", "")
                ),
                "platform": str(change_row.get("platform", "")),
                "language": str(change_row.get("language", "")),
                "changeClassification": classification,
                "currentMappingStatus": str(change_row.get("currentMappingStatus", "")),
                "previousMappingStatus": str(
                    change_row.get("previousMappingStatus", "")
                ),
                "confidenceTier": confidence_tier,
                "requiredAction": required_action_for_confidence_tier(confidence_tier),
                "exactMappingIds": [
                    str(value)
                    for value in change_row.get("exactMappingIds", [])
                    if isinstance(value, str)
                ],
                "candidateReferenceIds": candidate_reference_ids_from_snapshot(
                    change_row
                ),
                "proposedPatch": None,
                "reason": relution_mapping_update_reason(
                    classification, confidence_tier
                ),
            }
        )
    rows.sort(
        key=lambda row: (
            row["source"],
            PLATFORM_ORDER.get(row["platform"], 99),
            row["platform"],
            row["recommendationId"],
        )
    )
    return rows

def relution_mapping_confidence_tier(change_row: dict[str, Any]) -> str:
    """Assign the review tier that controls whether a row can be applied safely."""
    classification = str(change_row.get("changeClassification", "unchanged"))
    if classification in {"semantic-only", "evidence-only"}:
        return "safe-retain"
    if classification == "exact-value-changed" and exact_mapping_value_change_is_safe(
        change_row
    ):
        return "safe-mechanical-update"
    if (
        classification == "status-changed"
        and change_row.get("currentMappingStatus") == "parameterized"
    ):
        return "parameter-needed"
    if classification in {"removed-recommendation", "new-recommendation"}:
        return "gap-or-parser-work"
    return "manual-ledger-needed"

def exact_mapping_value_change_is_safe(change_row: dict[str, Any]) -> bool:
    """Return whether exact mapping value drift keeps the same target identities."""
    from .relution_update_identity import exact_mapping_identity
    previous_mappings = {
        exact_mapping_identity(mapping): mapping
        for mapping in change_row.get("previousExactMappings", [])
        if isinstance(mapping, dict)
    }
    current_mappings = {
        exact_mapping_identity(mapping): mapping
        for mapping in change_row.get("exactMappings", [])
        if isinstance(mapping, dict)
    }
    if not previous_mappings or set(previous_mappings) != set(current_mappings):
        return False
    return all(
        classify_mapping_update(previous_mappings[key], current_mappings[key])
        in {"safe-retain", "safe-mechanical-update"}
        for key in previous_mappings
    )
