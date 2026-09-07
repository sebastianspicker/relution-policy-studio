"""Cohesive implementation stage 6 for mapping_review_artifacts."""

from typing import Any
from .artifact_paths import PLATFORM_ORDER
from .artifact_io_values import normalize_policy_platform

def build_ruleset_update_plan_rows(
    source_rows: list[dict[str, Any]],
    recommendations: dict[str, dict[str, Any]],
    reference_payload: dict[str, Any],
    review_payload: dict[str, Any],
) -> list[dict[str, Any]]:
    """Build update-plan rows for changed sources and affected recommendations."""

    references_by_recommendation = exact_references_by_recommendation(reference_payload)
    review_by_recommendation = candidate_review_by_recommendation(review_payload)
    rows: list[dict[str, Any]] = []
    for source_row in source_rows:
        classification = str(source_row.get("changeClassification", "unchanged"))
        if classification == "unchanged":
            continue
        source = str(source_row["source"])
        for recommendation_id in source_row.get("affectedRecommendationIds", []):
            global_id = f"{source}:{recommendation_id}"
            recommendation = recommendations.get(global_id)
            if recommendation is None:
                continue
            rows.append(
                ruleset_update_plan_row(
                    {
                        "source_row": source_row,
                        "source": source,
                        "recommendation_id": str(recommendation_id),
                        "global_id": global_id,
                        "recommendation": recommendation,
                        "exact_refs": references_by_recommendation.get(global_id, []),
                        "review_row": review_by_recommendation.get(global_id),
                        "classification": classification,
                    }
                )
            )
    rows.sort(
        key=lambda row: (
            row["source"],
            PLATFORM_ORDER.get(row["platform"], 99),
            row["platform"],
            row["recommendationId"],
            row["sourceId"],
        )
    )
    return rows

def ruleset_update_plan_row(context: dict[str, Any]) -> dict[str, Any]:
    """Render one machine-readable ruleset update-plan row."""
    from .mapping_update_confidence import required_action_for_confidence_tier, update_confidence_tier, update_plan_reason

    source_row = context["source_row"]
    recommendation = context["recommendation"]
    exact_refs = context["exact_refs"]
    review_row = context["review_row"]
    classification = context["classification"]
    confidence_tier = update_confidence_tier(
        classification, recommendation, exact_refs, review_row
    )
    return {
        "source": context["source"],
        "sourceId": source_row["sourceId"],
        "recommendationId": context["recommendation_id"],
        "globalRecommendationId": context["global_id"],
        "platform": normalize_policy_platform(str(recommendation.get("platform", ""))),
        "changeClassification": classification,
        "currentMappingStatus": str(
            recommendation.get("relutionMapping", {}).get("status", "none")
        ),
        "confidenceTier": confidence_tier,
        "requiredAction": required_action_for_confidence_tier(confidence_tier),
        "sourceProvenance": {
            "sha256": source_row.get("sha256", ""),
            "textSha256": source_row.get("textSha256", ""),
            "verifiedAsOf": source_row.get("verifiedAsOf", ""),
        },
        "previousMappingIds": [str(reference["mappingId"]) for reference in exact_refs],
        "candidateReferenceIds": candidate_reference_ids(review_row),
        "proposedPatch": None,
        "reason": update_plan_reason(classification, confidence_tier),
    }

def candidate_reference_ids(review_row: dict[str, Any] | None) -> list[str]:
    """Return the bounded reference ids attached to ranked review candidates."""

    return [
        str(reference_id)
        for candidate in (review_row or {}).get("rankedCandidates", [])
        for reference_id in candidate.get("referenceMappingIds", [])
    ][:8]

def exact_references_by_recommendation(
    reference_payload: dict[str, Any],
) -> dict[str, list[dict[str, Any]]]:
    """Group exact mapping reference rows by global recommendation id."""

    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in reference_payload.get("rows", []):
        if isinstance(row, dict) and isinstance(row.get("globalRecommendationId"), str):
            grouped.setdefault(str(row["globalRecommendationId"]), []).append(row)
    return grouped

def candidate_review_by_recommendation(
    review_payload: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    """Index candidate review rows by global recommendation id."""

    return {
        str(row["globalRecommendationId"]): row
        for row in review_payload.get("rows", [])
        if isinstance(row, dict) and isinstance(row.get("globalRecommendationId"), str)
    }
