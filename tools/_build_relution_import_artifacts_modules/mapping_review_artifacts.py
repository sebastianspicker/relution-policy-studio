# pylint: disable=unused-import
"""Build review artifacts for recommendation-to-Relution mapping changes."""

from datetime import datetime, timezone
import hashlib
from pathlib import Path
from typing import Any

from recommendation_mapping import flatten_value_paths

from .artifact_io import relative_path, update_plan_inputs, update_plan_payload
from .artifact_paths import (
    ALL_SOURCES,
    COVERAGE_MATRIX_PATH,
    EXACT_MAPPING_REFERENCE_PATH,
    MANUAL_MAPPING_PROMOTIONS_PATH,
    MAPPING_CANDIDATE_REVIEW_PATH,
    MAPPING_CANDIDATE_REVIEW_REPORT_PATH,
    PLATFORM_ORDER,
    REPO_ROOT,
    RULESET_UPDATE_PLAN_PATH,
    SEMANTIC_INDEX_PATH,
    SOURCE_CHANGE_REPORT_PATH,
)
from .artifact_io import (
    normalize_policy_platform,
    read_json,
    slugify,
    stable_json,
    write_json,
)
from .mapping_helpers import (
    exact_mappings,
    mapping_target,
)
from recommendation_mapping import (
    unique_preserving_order,
)
from .artifact_pipeline import (
    missing_required_inputs_message,
)
from .manual_mapping_promotions import (  # noqa: F401
    ensure_manual_mapping_promotions_file,
    load_manual_mapping_promotion_entries,
    manual_mapping_promotions_path_label,
    manual_promotion_ruleset_mapping,
    manual_promotion_target_is_valid,
    manual_promotions_by_recommendation,
    validate_manual_mapping_promotion_entry,
    validate_manual_mapping_promotions,
    validated_manual_mapping_platform,
)
from .mapping_candidate_review_output import (
    mapping_candidate_review_row,
    write_mapping_candidate_review_report,
)
from .recommendation_catalog import load_recommendations_by_global_id
from .ruleset_builder import count_by
from .semantic_review_candidates import (  # noqa: F401
    bilingual_tokens,
    count_by_nested_mapping,
    detect_mapping_language,
    exact_mapping_match_evidence,
    extracted_mapping_intent,
    nearest_exact_references,
    ranked_review_candidates,
    recommendation_semantic_concepts,
    recommendation_source_text,
    semantic_review_analysis,
    shorten_review_text,
    suggested_review_action,
)

def build_mapping_candidate_review_artifacts() -> tuple[
    dict[str, dict[str, Any]], dict[str, Any], dict[str, Any], str
]:
    """Build exact-reference, candidate-review, and update-plan artifacts."""

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
            "externalLlmApi": False,
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
        recommendations, reference_payload, review_payload, generated_at
    )
    write_mapping_candidate_review_report(reference_payload, review_payload)
    return recommendations, reference_payload, review_payload, generated_at


def build_guideline_update_artifacts(
    recommendations: dict[str, dict[str, Any]],
    reference_payload: dict[str, Any],
    review_payload: dict[str, Any],
    generated_at: str,
) -> None:
    """Build source-change and ruleset-update plan artifacts."""

    source_rows = build_source_change_rows(recommendations)
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


def build_source_change_rows(
    recommendations: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Compare current source manifests with previous source-change snapshots."""

    recommendation_ids_by_source_id = recommendation_ids_by_source_id_for(
        recommendations
    )
    previous_by_key = previous_source_change_rows_by_key()
    rows: list[dict[str, Any]] = []
    current_keys: set[tuple[str, str]] = set()
    for source, manifest_path in required_source_manifest_paths():
        manifest = read_json(manifest_path)
        if not isinstance(manifest, list):
            raise ValueError(
                "Required source manifest malformed: "
                f"source={source} path={manifest_path} expected list"
            )
        for entry in manifest:
            if not isinstance(entry, dict):
                continue
            source_id = str(entry.get("id", ""))
            if not source_id:
                continue
            key = (source, source_id)
            current_keys.add(key)
            rows.append(
                current_source_change_row(
                    source,
                    source_id,
                    entry,
                    previous_by_key.get(key),
                    recommendation_ids_by_source_id.get(key, []),
                )
            )
    for key, previous_snapshot in previous_by_key.items():
        if key in current_keys:
            continue
        rows.append(
            removed_source_change_row(
                key, previous_snapshot, recommendation_ids_by_source_id
            )
        )
    rows.sort(key=lambda row: (row["source"], row["sourceId"]))
    return rows


def previous_source_change_rows_by_key() -> dict[tuple[str, str], dict[str, Any]]:
    """Index previous source-change rows by source and source id."""

    return {
        (str(row.get("source", "")), str(row.get("sourceId", ""))): row
        for row in previous_source_change_rows()
        if isinstance(row, dict) and row.get("source") and row.get("sourceId")
    }


def required_source_manifest_paths() -> list[tuple[str, Path]]:
    """Return all required source manifests or fail with a complete missing list."""

    present: list[tuple[str, Path]] = []
    missing: list[tuple[str, Path]] = []
    for source, manifest_path in source_manifest_paths().items():
        if manifest_path.exists():
            present.append((source, manifest_path))
        else:
            missing.append((source, manifest_path))
    if missing:
        raise FileNotFoundError(
            missing_required_inputs_message("source manifests", present, missing)
        )
    return present


def previous_source_change_rows() -> list[dict[str, Any]]:
    """Load prior source-change rows when the report already exists."""

    if not SOURCE_CHANGE_REPORT_PATH.exists():
        return []
    payload = read_json(SOURCE_CHANGE_REPORT_PATH)
    rows = payload.get("rows", []) if isinstance(payload, dict) else []
    return [row for row in rows if isinstance(row, dict)]


def current_source_change_row(
    source: str,
    source_id: str,
    entry: dict[str, Any],
    previous_snapshot: dict[str, Any] | None,
    affected_recommendation_ids: list[str],
) -> dict[str, Any]:
    """Build the source-change row for a source still present in the manifest."""

    current_snapshot = source_change_snapshot(
        source, source_id, entry, source_text_hash(entry)
    )
    previous_or_current = previous_snapshot or current_snapshot
    return source_change_row_payload(
        current_snapshot,
        previous_or_current,
        classify_source_change(previous_snapshot, current_snapshot),
        affected_recommendation_ids,
    )


def removed_source_change_row(
    key: tuple[str, str],
    previous_snapshot: dict[str, Any],
    recommendation_ids_by_source_id: dict[tuple[str, str], list[str]],
) -> dict[str, Any]:
    """Build the source-change row for a source removed from the manifest."""

    source, source_id = key
    affected_recommendation_ids = previous_affected_recommendation_ids(
        previous_snapshot
    )
    if not affected_recommendation_ids:
        affected_recommendation_ids = recommendation_ids_by_source_id.get(key, [])
    return source_change_row_payload(
        source_change_snapshot(
            source,
            source_id,
            previous_snapshot,
            str(previous_snapshot.get("textSha256", "")),
        ),
        previous_snapshot,
        "removed-source",
        affected_recommendation_ids,
    )


def previous_affected_recommendation_ids(
    previous_snapshot: dict[str, Any],
) -> list[str]:
    """Extract affected recommendation ids from a previous source snapshot."""

    return [
        str(recommendation_id)
        for recommendation_id in previous_snapshot.get("affectedRecommendationIds", [])
        if isinstance(recommendation_id, str)
    ]


def source_change_row_payload(
    current_snapshot: dict[str, Any],
    previous_snapshot: dict[str, Any],
    classification: str,
    affected_recommendation_ids: list[str],
) -> dict[str, Any]:
    """Merge current and previous source snapshots into one report row."""

    return {
        **current_snapshot,
        "changeClassification": classification,
        "classification": classification,
        "previousSha256": str(previous_snapshot.get("sha256", "")),
        "previousTextSha256": str(previous_snapshot.get("textSha256", "")),
        "affectedRecommendationIds": affected_recommendation_ids,
        "affectedRecommendationCount": len(affected_recommendation_ids),
    }


def source_change_snapshot(
    source: str, source_id: str, entry: dict[str, Any], text_hash: str
) -> dict[str, Any]:
    """Capture comparable source manifest metadata and text digest fields."""

    return {
        "source": source,
        "sourceId": source_id,
        "title": str(entry.get("title", "")),
        "url": str(entry.get("url", "")),
        "finalUrl": str(entry.get("finalUrl", "")),
        "documentDate": str(entry.get("documentDate", "")),
        "verifiedAsOf": str(entry.get("verifiedAsOf", "")),
        "localPath": str(entry.get("localPath", "")),
        "textPath": str(entry.get("textPath", "")),
        "sha256": str(entry.get("sha256", "")),
        "textSha256": text_hash,
    }


def source_manifest_paths() -> dict[str, Path]:
    """Return checked-in source manifest paths for all recommendation sources."""

    return {
        "bsi": REPO_ROOT / "example" / "bsi-references" / "downloads" / "manifest.json",
        "cis": REPO_ROOT / "example" / "cis-references" / "downloads" / "manifest.json",
        "vendor": REPO_ROOT
        / "example"
        / "vendor-references"
        / "downloads"
        / "manifest.json",
    }


def recommendation_ids_by_source_id_for(
    recommendations: dict[str, dict[str, Any]],
) -> dict[tuple[str, str], list[str]]:
    """Index recommendation ids by source id for source-change impact reports."""

    index: dict[tuple[str, str], list[str]] = {}
    for recommendation in recommendations.values():
        source = str(recommendation.get("_source", ""))
        recommendation_id = str(recommendation.get("id", ""))
        for source_id in recommendation.get("sourceIds", []):
            if isinstance(source_id, str) and source_id:
                index.setdefault((source, source_id), []).append(recommendation_id)
    for key in index:
        index[key] = sorted(set(index[key]))
    return index


def classify_source_change(
    previous: dict[str, Any] | None, current: dict[str, Any] | None
) -> str:
    """Classify source drift as content, metadata, parser, new, or removed."""

    for classification, changed in (
        ("unchanged", previous is None and current is None),
        ("new-source", previous is None),
        ("removed-source", current is None),
    ):
        if changed:
            return classification
    if previous is None or current is None:
        return "unchanged"
    if current.get("textPath") and not current.get("textSha256"):
        return "parser-breaking"
    previous_content = (
        str(previous.get("sha256", "")),
        str(previous.get("textSha256", "")),
    )
    current_content = (
        str(current.get("sha256", "")),
        str(current.get("textSha256", "")),
    )
    if previous_content != current_content:
        return "text-changed"
    metadata_keys = (
        "url",
        "finalUrl",
        "title",
        "documentDate",
        "verifiedAsOf",
        "sizeBytes",
        "contentType",
    )
    if any(previous.get(key) != current.get(key) for key in metadata_keys):
        return "metadata-only"
    return "unchanged"


def source_text_hash(entry: dict[str, Any]) -> str:
    """Hash the harvested source text file declared by a manifest entry."""

    text_path = str(entry.get("textPath", ""))
    if not text_path:
        return ""
    path = REPO_ROOT / text_path
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"source_text_hash: file not found: {path}")
    return hashlib.sha256(path.read_bytes()).hexdigest()


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


def update_confidence_tier(
    change_classification: str,
    recommendation: dict[str, Any],
    exact_refs: list[dict[str, Any]],
    review_row: dict[str, Any] | None,
) -> str:
    """Classify update-plan confidence from source drift and mapping evidence."""

    status = str(recommendation.get("relutionMapping", {}).get("status", "none"))
    decisions = (
        ("safe-retain", change_classification == "metadata-only"),
        (
            "gap-or-parser-work",
            change_classification in {"removed-source", "parser-breaking"},
        ),
        (
            "manual-ledger-needed",
            change_classification == "text-changed" and bool(exact_refs),
        ),
        (
            "parameter-needed",
            change_classification == "text-changed"
            and review_row is not None
            and status == "parameterized",
        ),
        (
            "manual-ledger-needed",
            change_classification == "text-changed" and review_row is not None,
        ),
        (
            "manual-ledger-needed",
            change_classification == "new-source" and review_row is not None,
        ),
        ("gap-or-parser-work", change_classification == "new-source"),
    )
    for confidence_tier, matched in decisions:
        if matched:
            return confidence_tier
    return "safe-retain"


def required_action_for_confidence_tier(confidence_tier: str) -> str:
    """Map update confidence tiers to required review or apply actions."""

    return {
        "safe-retain": "apply-safe",
        "safe-mechanical-update": "apply-safe",
        "manual-ledger-needed": "review-manual-ledger",
        "parameter-needed": "supply-local-parameters",
        "gap-or-parser-work": "inspect-parser-or-source",
    }.get(confidence_tier, "review")


def update_plan_reason(change_classification: str, confidence_tier: str) -> str:
    """Explain why an update-plan row received its confidence tier."""

    if confidence_tier == "safe-retain":
        return (
            "Source metadata changed without content hash drift; current mapping artifacts "
            "can be retained."
        )
    if confidence_tier == "safe-mechanical-update":
        return (
            "Target and field paths are stable and the value change is type-compatible."
        )
    if confidence_tier == "manual-ledger-needed":
        return (
            "Changed source text requires human review before exact mapping promotion or "
            "value changes."
        )
    if confidence_tier == "parameter-needed":
        return "Recommendation remains parameterized; local values or evidence are required."
    if change_classification == "removed-source":
        return "Source disappeared from the manifest and needs review before mappings are removed."
    return "No reliable mapping update can be inferred automatically."


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


def build_exact_mapping_reference_rows(
    recommendations: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build bilingual exact-mapping reference rows for offline review."""

    rows: list[dict[str, Any]] = []
    for global_id, recommendation in sorted(recommendations.items()):
        source = str(recommendation["_source"])
        platform = normalize_policy_platform(str(recommendation.get("platform", "")))
        source_text = recommendation_source_text(source, recommendation)
        language = detect_mapping_language(source_text)
        tokens = bilingual_tokens(source_text, recommendation)
        semantic_concepts = recommendation_semantic_concepts(recommendation)
        for mapping in exact_mappings(recommendation):
            target = mapping_target(mapping)
            if target is None:
                continue
            field_paths = unique_preserving_order(
                [
                    *flatten_value_paths(mapping.get("values", {})),
                    *[
                        str(constraint.get("path"))
                        for constraint in mapping.get("constraints", [])
                        if isinstance(constraint, dict)
                        and isinstance(constraint.get("path"), str)
                    ],
                ]
            )
            mapping_id_parts = (
                global_id,
                mapping["kind"],
                target,
                stable_json(field_paths),
                stable_json(mapping.get("values", {})),
            )
            mapping_id = slugify("-".join(mapping_id_parts))
            rows.append(
                {
                    "mappingId": mapping_id,
                    "source": source,
                    "recommendationId": str(recommendation["id"]),
                    "globalRecommendationId": global_id,
                    "platform": platform,
                    "language": language,
                    "title": str(recommendation.get("title", "")),
                    "sourceText": shorten_review_text(source_text, 700),
                    "normalizedTokens": tokens,
                    "semanticConcepts": semantic_concepts,
                    "semanticConceptIds": [
                        str(concept["id"]) for concept in semantic_concepts
                    ],
                    "mapping": {
                        "kind": str(mapping["kind"]),
                        "target": target,
                        "fieldPaths": field_paths,
                        "values": mapping.get("values", {}),
                        **(
                            {"constraints": mapping["constraints"]}
                            if isinstance(mapping.get("constraints"), list)
                            else {}
                        ),
                    },
                    "matchEvidence": exact_mapping_match_evidence(mapping),
                }
            )
    rows.sort(
        key=lambda row: (
            row["source"],
            PLATFORM_ORDER.get(row["platform"], 99),
            row["platform"],
            row["recommendationId"],
            row["mappingId"],
        )
    )
    return rows


def build_mapping_candidate_review_rows(
    recommendations: dict[str, dict[str, Any]],
    exact_references: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build candidate-review rows for recommendations not already exact."""

    rows: list[dict[str, Any]] = []
    references_by_platform: dict[str, list[dict[str, Any]]] = {}
    for reference in exact_references:
        references_by_platform.setdefault(str(reference["platform"]), []).append(
            reference
        )

    for global_id, recommendation in sorted(recommendations.items()):
        relution_mapping = recommendation.get("relutionMapping", {})
        current_status = str(relution_mapping.get("status", "none"))
        if current_status == "exact":
            continue
        rows.append(
            mapping_candidate_review_row(
                global_id, recommendation, current_status, references_by_platform
            )
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
