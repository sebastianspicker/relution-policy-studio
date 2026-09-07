"""Cohesive implementation stage 1 for mapping_review_artifacts."""

from typing import Any
from .artifact_paths import COVERAGE_MATRIX_PATH
from .artifact_paths import EXACT_MAPPING_REFERENCE_PATH
from .artifact_paths import MANUAL_MAPPING_PROMOTIONS_PATH
from .artifact_paths import MAPPING_CANDIDATE_REVIEW_PATH
from .artifact_paths import RULESET_UPDATE_PLAN_PATH
from .artifact_paths import SEMANTIC_INDEX_PATH
from .artifact_paths import SOURCE_CHANGE_REPORT_PATH
from .ruleset_reporting import count_by
from .semantic_review_formatting import count_by_nested_mapping
from datetime import datetime
from .manual_mapping_promotion_storage import ensure_manual_mapping_promotions_file
from .recommendation_catalog import load_recommendations_by_global_id
from .artifact_io_paths import relative_path
from datetime import timezone
from .artifact_io_plans import update_plan_inputs
from .artifact_io_plans import update_plan_payload
from .manual_mapping_promotion_validation import validate_manual_mapping_promotions
from .artifact_io_json import write_json
from .mapping_candidate_review_output import write_mapping_candidate_review_report

def build_mapping_candidate_review_artifacts(
    previous_source_rows: list[dict[str, Any]] | None = None,
) -> tuple[
    dict[str, dict[str, Any]], dict[str, Any], dict[str, Any], str
]:
    """Build exact-reference, candidate-review, and update-plan artifacts."""
    from .mapping_review_rows import build_exact_mapping_reference_rows, build_mapping_candidate_review_rows

    recommendations = load_recommendations_by_global_id()
    exact_references = build_exact_mapping_reference_rows(recommendations)
    ensure_manual_mapping_promotions_file(MANUAL_MAPPING_PROMOTIONS_PATH)
    manual_promotions = validate_manual_mapping_promotions(
        exact_references, MANUAL_MAPPING_PROMOTIONS_PATH
    )
    candidate_rows = build_mapping_candidate_review_rows(
        recommendations, exact_references
    )
    generated_at = (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )

    reference_payload = {
        "version": 1,
        "name": "Exact Mapping Reference",
        "generatedAt": generated_at,
        "description": (
            "Current exact BSI/CIS/vendor mappings used as bilingual reference examples for "
            "offline mapping review."
        ),
        "rows": exact_references,
        "summary": {
            "totalExactMappings": len(exact_references),
            "bySource": count_by(exact_references, "source"),
            "byPlatform": count_by(exact_references, "platform"),
            "byLanguage": count_by(exact_references, "language"),
            "byTargetKind": count_by_nested_mapping(
                exact_references, ("mapping", "kind")
            ),
        },
    }
    review_payload = {
        "version": 1,
        "name": "Offline Bilingual Mapping Candidate Review",
        "generatedAt": generated_at,
        "reviewMethod": {
            "mode": "offline-bilingual-reference-matching",
            "exactPromotion": "validated-manual-ledger-only",
            "note": (
                "Existing exact mappings are reference examples. Candidate similarity never "
                "creates exact mappings by itself."
            ),
        },
        "inputs": {
            "exactMappingReferencePath": relative_path(EXACT_MAPPING_REFERENCE_PATH),
            "manualPromotionLedgerPath": relative_path(MANUAL_MAPPING_PROMOTIONS_PATH),
            "semanticIndexPath": relative_path(SEMANTIC_INDEX_PATH),
            "achievabilityMatrixPath": relative_path(COVERAGE_MATRIX_PATH),
        },
        "manualPromotionLedger": {
            "path": relative_path(MANUAL_MAPPING_PROMOTIONS_PATH),
            "validatedEntries": len(manual_promotions),
        },
        "rows": candidate_rows,
        "summary": {
            "totalReviewedRecommendations": len(candidate_rows),
            "exactReferenceCount": len(exact_references),
            "bySource": count_by(candidate_rows, "source"),
            "byPlatform": count_by(candidate_rows, "platform"),
            "byCurrentStatus": count_by(candidate_rows, "currentMappingStatus"),
            "bySuggestedReviewAction": count_by(
                candidate_rows, "suggestedReviewAction"
            ),
        },
    }

    write_json(EXACT_MAPPING_REFERENCE_PATH, reference_payload)
    write_json(MAPPING_CANDIDATE_REVIEW_PATH, review_payload)
    build_guideline_update_artifacts(
        recommendations,
        reference_payload,
        review_payload,
        generated_at,
        previous_source_rows,
    )
    write_mapping_candidate_review_report(reference_payload, review_payload)
    return recommendations, reference_payload, review_payload, generated_at

def build_guideline_update_artifacts(
    recommendations: dict[str, dict[str, Any]],
    reference_payload: dict[str, Any],
    review_payload: dict[str, Any],
    generated_at: str,
    previous_source_rows: list[dict[str, Any]] | None = None,
) -> None:
    """Build source-change and ruleset-update plan artifacts."""
    from .mapping_source_inventory import build_source_change_rows
    from .mapping_update_planning import build_ruleset_update_plan_rows

    source_rows = build_source_change_rows(recommendations, previous_source_rows)
    source_payload = {
        "version": 1,
        "name": "Guideline Source Change Report",
        "generatedAt": generated_at,
        "comparisonMode": "current-manifest-baseline",
        "description": (
            "Compares current checked-in BSI/CIS/vendor source manifests and maps source "
            "ids to affected recommendations."
        ),
        "rows": source_rows,
        "summary": {
            "totalSources": len(source_rows),
            "bySource": count_by(source_rows, "source"),
            "byClassification": count_by(source_rows, "changeClassification"),
            "byChangeClassification": count_by(source_rows, "changeClassification"),
            "changedSources": sum(
                1
                for row in source_rows
                if row.get("changeClassification") != "unchanged"
            ),
            "affectedRecommendations": len(
                {
                    rec_id
                    for row in source_rows
                    for rec_id in row.get("affectedRecommendationIds", [])
                }
            ),
        },
    }
    update_rows = build_ruleset_update_plan_rows(
        source_rows, recommendations, reference_payload, review_payload
    )
    update_payload = update_plan_payload(
        metadata={
            "name": "Guideline Ruleset Update Plan",
            "generatedAt": generated_at,
            "mode": "offline-safe-update-plan",
            "description": (
                "Machine-readable review plan for source changes. "
                "Candidate similarity does not promote exact mappings."
            ),
        },
        inputs=update_plan_inputs(
            "sourceChangeReportPath",
            SOURCE_CHANGE_REPORT_PATH,
            (
                EXACT_MAPPING_REFERENCE_PATH,
                MAPPING_CANDIDATE_REVIEW_PATH,
                MANUAL_MAPPING_PROMOTIONS_PATH,
            ),
        ),
        rows=update_rows,
        summary={
            "totalUpdateRows": len(update_rows),
            "totalChangedSources": sum(
                1
                for row in source_rows
                if row.get("changeClassification") != "unchanged"
            ),
            "proposedUpdates": len(update_rows),
            "bySource": count_by(update_rows, "source"),
            "byConfidenceTier": count_by(update_rows, "confidenceTier"),
            "byRequiredAction": count_by(update_rows, "requiredAction"),
        },
    )
    write_json(SOURCE_CHANGE_REPORT_PATH, source_payload)
    write_json(RULESET_UPDATE_PLAN_PATH, update_payload)
