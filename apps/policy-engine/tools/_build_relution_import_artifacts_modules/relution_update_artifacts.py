"""Cohesive implementation stage 1 for relution_mapping_updates."""

from typing import Any
from .artifact_paths import PLATFORM_ORDER
from .artifact_paths import EXACT_MAPPING_REFERENCE_PATH
from .artifact_paths import MANUAL_MAPPING_PROMOTIONS_PATH
from .artifact_paths import MAPPING_CANDIDATE_REVIEW_PATH
from .artifact_paths import RELUTION_MAPPING_CHANGE_REPORT_PATH
from .artifact_paths import RELUTION_MAPPING_UPDATE_PLAN_PATH
from .mapping_update_planning import candidate_review_by_recommendation
from .ruleset_reporting import count_by
from .mapping_update_planning import exact_references_by_recommendation
from .artifact_io_json import read_json
from .artifact_io_paths import relative_path
from .artifact_io_plans import update_plan_inputs
from .artifact_io_plans import update_plan_payload
from .artifact_io_json import write_json

def build_relution_mapping_update_artifacts(
    recommendations: dict[str, dict[str, Any]],
    reference_payload: dict[str, Any],
    review_payload: dict[str, Any],
    generated_at: str,
    previous_mapping_rows: list[dict[str, Any]] | None = None,
) -> None:
    """Write the mapping change report and review-gated update plan artifacts."""
    from .relution_update_planning import build_relution_mapping_update_plan_rows
    change_rows = build_relution_mapping_change_rows(
        recommendations,
        reference_payload,
        review_payload,
        previous_mapping_rows,
    )
    change_payload = {
        "version": 1,
        "name": "Recommendation to Relution Mapping Change Report",
        "generatedAt": generated_at,
        "comparisonMode": "current-mapping-baseline",
        "reviewMethod": {
            "mode": "offline-bilingual-reference-matching",
            "exactPromotion": "validated-manual-ledger-only",
        },
        "inputs": {
            "exactMappingReferencePath": relative_path(EXACT_MAPPING_REFERENCE_PATH),
            "mappingCandidateReviewPath": relative_path(MAPPING_CANDIDATE_REVIEW_PATH),
            "manualPromotionLedgerPath": relative_path(MANUAL_MAPPING_PROMOTIONS_PATH),
        },
        "rows": change_rows,
        "summary": {
            "totalRecommendations": len(change_rows),
            "changedRecommendations": sum(
                1
                for row in change_rows
                if row.get("changeClassification") != "unchanged"
            ),
            "bySource": count_by(change_rows, "source"),
            "byPlatform": count_by(change_rows, "platform"),
            "byLanguage": count_by(change_rows, "language"),
            "byCurrentStatus": count_by(change_rows, "currentMappingStatus"),
            "byChangeClassification": count_by(change_rows, "changeClassification"),
        },
    }
    update_rows = build_relution_mapping_update_plan_rows(change_rows)
    update_payload = update_plan_payload(
        metadata={
            "name": "Recommendation to Relution Mapping Update Plan",
            "generatedAt": generated_at,
            "mode": "offline-safe-mapping-update-plan",
            "description": (
                "Review-gated plan for recommendation-to-Relution mapping drift. "
                "Candidate similarity does not promote exact mappings."
            ),
        },
        inputs=update_plan_inputs(
            "mappingChangeReportPath",
            RELUTION_MAPPING_CHANGE_REPORT_PATH,
            tuple(
                [
                    EXACT_MAPPING_REFERENCE_PATH,
                    MAPPING_CANDIDATE_REVIEW_PATH,
                    MANUAL_MAPPING_PROMOTIONS_PATH,
                ]
            ),
        ),
        rows=update_rows,
        summary={
            "totalChangedRecommendations": change_payload["summary"][
                "changedRecommendations"
            ],
            "proposedUpdates": len(update_rows),
            "bySource": count_by(update_rows, "source"),
            "byPlatform": count_by(update_rows, "platform"),
            "byRequiredAction": count_by(update_rows, "requiredAction"),
            "byConfidenceTier": count_by(update_rows, "confidenceTier"),
        },
    )
    write_json(RELUTION_MAPPING_CHANGE_REPORT_PATH, change_payload)
    write_json(RELUTION_MAPPING_UPDATE_PLAN_PATH, update_payload)

def build_relution_mapping_change_rows(
    recommendations: dict[str, dict[str, Any]],
    reference_payload: dict[str, Any],
    review_payload: dict[str, Any],
    previous_mapping_rows: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Compare current recommendation mappings with the previous change report."""
    exact_by_recommendation = exact_references_by_recommendation(reference_payload)
    review_by_recommendation = candidate_review_by_recommendation(review_payload)
    previous_by_key = previous_relution_mapping_change_rows_by_key(
        previous_mapping_rows
    )
    rows: list[dict[str, Any]] = []
    current_keys: set[str] = set()
    for global_id, recommendation in sorted(recommendations.items()):
        current_keys.add(global_id)
        rows.append(
            relution_mapping_change_row(
                recommendation,
                exact_by_recommendation.get(global_id, []),
                review_by_recommendation.get(global_id),
                previous_by_key.get(global_id),
            )
        )
    for global_id, previous_snapshot in previous_by_key.items():
        if global_id in current_keys:
            continue
        rows.append(relution_mapping_removed_change_row(previous_snapshot))
    rows.sort(
        key=lambda row: (
            row["source"],
            PLATFORM_ORDER.get(row["platform"], 99),
            row["platform"],
            row["recommendationId"],
        )
    )
    return rows

def previous_relution_mapping_change_rows_by_key(
    previous_rows: list[dict[str, Any]] | None = None,
) -> dict[str, dict[str, Any]]:
    """Return previous change-report rows keyed by global recommendation id."""
    return {
        str(row.get("globalRecommendationId", "")): row
        for row in (
            previous_relution_mapping_change_rows()
            if previous_rows is None
            else previous_rows
        )
        if isinstance(row, dict) and isinstance(row.get("globalRecommendationId"), str)
    }

def previous_relution_mapping_change_rows() -> list[dict[str, Any]]:
    """Read the previous change report rows when the artifact already exists."""
    if not RELUTION_MAPPING_CHANGE_REPORT_PATH.exists():
        return []
    payload = read_json(RELUTION_MAPPING_CHANGE_REPORT_PATH)
    rows = payload.get("rows", []) if isinstance(payload, dict) else []
    return [row for row in rows if isinstance(row, dict)]

def relution_mapping_change_row(
    recommendation: dict[str, Any],
    exact_refs: list[dict[str, Any]],
    review_row: dict[str, Any] | None,
    previous_snapshot: dict[str, Any] | None,
) -> dict[str, Any]:
    """Build one current-vs-previous mapping drift row."""
    from .relution_update_classification import classify_recommendation_mapping_change
    from .relution_update_snapshots import relution_mapping_change_row_payload, relution_mapping_snapshot
    current_snapshot = relution_mapping_snapshot(recommendation, exact_refs, review_row)
    previous_or_current = previous_snapshot or current_snapshot
    classification = classify_recommendation_mapping_change(
        previous_snapshot, current_snapshot
    )
    return relution_mapping_change_row_payload(
        current_snapshot, previous_or_current, classification
    )

def relution_mapping_removed_change_row(
    previous_snapshot: dict[str, Any],
) -> dict[str, Any]:
    """Build a drift row for a recommendation that disappeared from current inputs."""
    from .relution_update_snapshots import relution_mapping_change_row_payload, relution_mapping_removed_snapshot
    return relution_mapping_change_row_payload(
        relution_mapping_removed_snapshot(previous_snapshot),
        previous_snapshot,
        "removed-recommendation",
    )
