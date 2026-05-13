def load_recommendations_by_global_id() -> dict[str, dict[str, Any]]:
    recommendations: dict[str, dict[str, Any]] = {}
    for source, config in SOURCE_CONFIGS.items():
        if not config.recommendation_catalog_path.exists():
            continue
        for recommendation in read_json(config.recommendation_catalog_path):
            if not isinstance(recommendation, dict) or not isinstance(recommendation.get("id"), str):
                continue
            global_id = f"{source}:{recommendation['id']}"
            recommendations[global_id] = {**recommendation, "_source": source, "_globalId": global_id}
    return recommendations


def build_relution_mapping_update_artifacts(
    recommendations: dict[str, dict[str, Any]],
    reference_payload: dict[str, Any],
    review_payload: dict[str, Any],
    generated_at: str,
) -> None:
    change_rows = build_relution_mapping_change_rows(recommendations, reference_payload, review_payload)
    change_payload = {
        "version": 1,
        "name": "Recommendation to Relution Mapping Change Report",
        "generatedAt": generated_at,
        "comparisonMode": "current-mapping-baseline",
        "reviewMethod": {
            "mode": "offline-bilingual-reference-matching",
            "externalLlmApi": False,
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
            "changedRecommendations": sum(1 for row in change_rows if row.get("changeClassification") != "unchanged"),
            "bySource": count_by(change_rows, "source"),
            "byPlatform": count_by(change_rows, "platform"),
            "byLanguage": count_by(change_rows, "language"),
            "byCurrentStatus": count_by(change_rows, "currentMappingStatus"),
            "byChangeClassification": count_by(change_rows, "changeClassification"),
        },
    }
    update_rows = build_relution_mapping_update_plan_rows(change_rows)
    update_payload = {
        "version": 1,
        "name": "Recommendation to Relution Mapping Update Plan",
        "generatedAt": generated_at,
        "mode": "offline-safe-mapping-update-plan",
        "description": "Review-gated plan for recommendation-to-Relution mapping drift. Candidate similarity does not promote exact mappings.",
        "inputs": {
            "mappingChangeReportPath": relative_path(RELUTION_MAPPING_CHANGE_REPORT_PATH),
            "exactMappingReferencePath": relative_path(EXACT_MAPPING_REFERENCE_PATH),
            "mappingCandidateReviewPath": relative_path(MAPPING_CANDIDATE_REVIEW_PATH),
            "manualPromotionLedgerPath": relative_path(MANUAL_MAPPING_PROMOTIONS_PATH),
        },
        "rows": update_rows,
        "summary": {
            "totalChangedRecommendations": change_payload["summary"]["changedRecommendations"],
            "proposedUpdates": len(update_rows),
            "bySource": count_by(update_rows, "source"),
            "byPlatform": count_by(update_rows, "platform"),
            "byRequiredAction": count_by(update_rows, "requiredAction"),
            "byConfidenceTier": count_by(update_rows, "confidenceTier"),
        },
    }
    write_json(RELUTION_MAPPING_CHANGE_REPORT_PATH, change_payload)
    write_json(RELUTION_MAPPING_UPDATE_PLAN_PATH, update_payload)


def build_relution_mapping_change_rows(
    recommendations: dict[str, dict[str, Any]],
    reference_payload: dict[str, Any],
    review_payload: dict[str, Any],
) -> list[dict[str, Any]]:
    exact_by_recommendation = exact_references_by_recommendation(reference_payload)
    review_by_recommendation = candidate_review_by_recommendation(review_payload)
    previous_rows = previous_relution_mapping_change_rows()
    previous_by_key = {
        str(row.get("globalRecommendationId", "")): row
        for row in previous_rows
        if isinstance(row, dict) and isinstance(row.get("globalRecommendationId"), str)
    }
    rows: list[dict[str, Any]] = []
    current_keys: set[str] = set()
    for global_id, recommendation in sorted(recommendations.items()):
        current_keys.add(global_id)
        exact_refs = exact_by_recommendation.get(global_id, [])
        review_row = review_by_recommendation.get(global_id)
        current_snapshot = relution_mapping_snapshot(recommendation, exact_refs, review_row)
        previous_snapshot = previous_by_key.get(global_id, current_snapshot)
        classification = classify_recommendation_mapping_change(previous_snapshot, current_snapshot)
        rows.append(
            {
                **current_snapshot,
                "changeClassification": classification,
                "classification": classification,
                "previousMappingStatus": str(previous_snapshot.get("currentMappingStatus", "")),
                "previousExactMappings": [
                    mapping
                    for mapping in previous_snapshot.get("exactMappings", [])
                    if isinstance(mapping, dict)
                ],
                "previousExactMappingSignature": str(previous_snapshot.get("exactMappingSignature", "")),
                "previousCandidateMappingSignature": str(previous_snapshot.get("candidateMappingSignature", "")),
            }
        )
    for global_id, previous_snapshot in previous_by_key.items():
        if global_id in current_keys:
            continue
        rows.append(
            {
                **relution_mapping_removed_snapshot(previous_snapshot),
                "changeClassification": "removed-recommendation",
                "classification": "removed-recommendation",
                "previousMappingStatus": str(previous_snapshot.get("currentMappingStatus", "")),
                "previousExactMappings": [
                    mapping
                    for mapping in previous_snapshot.get("exactMappings", [])
                    if isinstance(mapping, dict)
                ],
                "previousExactMappingSignature": str(previous_snapshot.get("exactMappingSignature", "")),
                "previousCandidateMappingSignature": str(previous_snapshot.get("candidateMappingSignature", "")),
            }
        )
    rows.sort(key=lambda row: (row["source"], PLATFORM_ORDER.get(row["platform"], 99), row["platform"], row["recommendationId"]))
    return rows


def previous_relution_mapping_change_rows() -> list[dict[str, Any]]:
    if not RELUTION_MAPPING_CHANGE_REPORT_PATH.exists():
        return []
    payload = read_json(RELUTION_MAPPING_CHANGE_REPORT_PATH)
    rows = payload.get("rows", []) if isinstance(payload, dict) else []
    return [row for row in rows if isinstance(row, dict)]


def relution_mapping_snapshot(
    recommendation: dict[str, Any],
    exact_refs: list[dict[str, Any]],
    review_row: dict[str, Any] | None,
) -> dict[str, Any]:
    source = str(recommendation.get("_source", ""))
    source_text = recommendation_source_text(source, recommendation)
    exact_mappings = [mapping_snapshot(row.get("mapping", {})) for row in exact_refs if isinstance(row.get("mapping"), dict)]
    candidate_mappings = candidate_mapping_snapshots(recommendation, review_row)
    semantic_ids = [str(concept["id"]) for concept in recommendation_semantic_concepts(recommendation)]
    return {
        "source": source,
        "recommendationId": str(recommendation.get("id", "")),
        "globalRecommendationId": str(recommendation.get("_globalId", "")),
        "platform": normalize_policy_platform(str(recommendation.get("platform", ""))),
        "language": detect_mapping_language(source_text),
        "title": str(recommendation.get("title", "")),
        "currentMappingStatus": str(recommendation.get("relutionMapping", {}).get("status", "none")),
        "currentImplementationCategory": str(recommendation.get("implementation", {}).get("category", "gap")),
        "exactMappingIds": [str(row["mappingId"]) for row in exact_refs if isinstance(row.get("mappingId"), str)],
        "exactMappings": exact_mappings,
        "exactMappingSignature": stable_json(exact_mappings),
        "candidateMappings": candidate_mappings,
        "candidateMappingSignature": stable_json(candidate_mappings),
        "semanticConceptIds": semantic_ids,
        "semanticConceptSignature": stable_json(semantic_ids),
        "normalizedTokens": bilingual_tokens(source_text, recommendation),
        "sourceTextSha256": hashlib.sha256(source_text.encode("utf8")).hexdigest(),
    }


def relution_mapping_removed_snapshot(previous_snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": str(previous_snapshot.get("source", "")),
        "recommendationId": str(previous_snapshot.get("recommendationId", "")),
        "globalRecommendationId": str(previous_snapshot.get("globalRecommendationId", "")),
        "platform": str(previous_snapshot.get("platform", "")),
        "language": str(previous_snapshot.get("language", "")),
        "title": str(previous_snapshot.get("title", "")),
        "currentMappingStatus": "removed",
        "currentImplementationCategory": "removed",
        "exactMappingIds": [],
        "exactMappings": [],
        "exactMappingSignature": "[]",
        "candidateMappings": [],
        "candidateMappingSignature": "[]",
        "semanticConceptIds": [],
        "semanticConceptSignature": "[]",
        "normalizedTokens": [],
        "sourceTextSha256": "",
    }


def mapping_snapshot(mapping: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": str(mapping.get("kind", "")),
        "target": str(mapping.get("target", mapping_target(mapping) or "")),
        "fieldPaths": [str(path) for path in mapping.get("fieldPaths", []) if isinstance(path, str)],
        "values": mapping.get("values", {}) if isinstance(mapping.get("values"), dict) else {},
        **({"constraints": mapping["constraints"]} if isinstance(mapping.get("constraints"), list) else {}),
    }


def candidate_mapping_snapshots(recommendation: dict[str, Any], review_row: dict[str, Any] | None) -> list[dict[str, Any]]:
    raw_candidates: list[dict[str, Any]] = []
    if isinstance(review_row, dict):
        raw_candidates.extend(candidate for candidate in review_row.get("rankedCandidates", []) if isinstance(candidate, dict))
    if not raw_candidates:
        raw_candidates.extend(candidate_target_specs(recommendation))
    snapshots = [
        {
            "kind": str(candidate.get("kind", "")),
            "target": str(candidate.get("target", "")),
            "fieldPaths": [str(path) for path in candidate.get("fieldPaths", []) if isinstance(path, str)],
            "referenceMappingIds": [str(value) for value in candidate.get("referenceMappingIds", []) if isinstance(value, str)],
            "semanticConceptId": str(candidate.get("semanticConceptId", "")),
        }
        for candidate in raw_candidates
    ]
    snapshots.sort(key=lambda row: (row["kind"], row["target"], row["fieldPaths"], row["referenceMappingIds"], row["semanticConceptId"]))
    return snapshots


def classify_recommendation_mapping_change(previous: dict[str, Any] | None, current: dict[str, Any] | None) -> str:
    if previous is None and current is None:
        return "unchanged"
    if previous is None:
        return "new-recommendation"
    if current is None:
        return "removed-recommendation"
    if previous.get("currentMappingStatus") != current.get("currentMappingStatus"):
        return "status-changed"
    if exact_mapping_target_signature(previous) != exact_mapping_target_signature(current):
        return "exact-target-changed"
    if previous.get("exactMappingSignature") != current.get("exactMappingSignature"):
        return "exact-value-changed"
    if previous.get("candidateMappingSignature") != current.get("candidateMappingSignature"):
        return "candidate-target-changed"
    if previous.get("semanticConceptSignature") != current.get("semanticConceptSignature"):
        return "semantic-only"
    evidence_keys = ("title", "language", "sourceTextSha256")
    if any(previous.get(key) != current.get(key) for key in evidence_keys):
        return "evidence-only"
    return "unchanged"


def exact_mapping_target_signature(snapshot: dict[str, Any]) -> str:
    targets = [
        {
            "kind": str(mapping.get("kind", "")),
            "target": str(mapping.get("target", "")),
            "fieldPaths": [str(path) for path in mapping.get("fieldPaths", []) if isinstance(path, str)],
        }
        for mapping in snapshot.get("exactMappings", [])
        if isinstance(mapping, dict)
    ]
    return stable_json(sorted(targets, key=lambda row: (row["kind"], row["target"], row["fieldPaths"])))


def build_relution_mapping_update_plan_rows(change_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
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
                "globalRecommendationId": str(change_row.get("globalRecommendationId", "")),
                "platform": str(change_row.get("platform", "")),
                "language": str(change_row.get("language", "")),
                "changeClassification": classification,
                "currentMappingStatus": str(change_row.get("currentMappingStatus", "")),
                "previousMappingStatus": str(change_row.get("previousMappingStatus", "")),
                "confidenceTier": confidence_tier,
                "requiredAction": required_action_for_confidence_tier(confidence_tier),
                "exactMappingIds": [str(value) for value in change_row.get("exactMappingIds", []) if isinstance(value, str)],
                "candidateReferenceIds": candidate_reference_ids_from_snapshot(change_row),
                "proposedPatch": None,
                "reason": relution_mapping_update_reason(classification, confidence_tier),
            }
        )
    rows.sort(key=lambda row: (row["source"], PLATFORM_ORDER.get(row["platform"], 99), row["platform"], row["recommendationId"]))
    return rows


def relution_mapping_confidence_tier(change_row: dict[str, Any]) -> str:
    classification = str(change_row.get("changeClassification", "unchanged"))
    if classification in {"semantic-only", "evidence-only"}:
        return "safe-retain"
    if classification == "exact-value-changed" and exact_mapping_value_change_is_safe(change_row):
        return "safe-mechanical-update"
    if classification == "status-changed" and change_row.get("currentMappingStatus") == "parameterized":
        return "parameter-needed"
    if classification in {"removed-recommendation", "new-recommendation"}:
        return "gap-or-parser-work"
    return "manual-ledger-needed"


def exact_mapping_value_change_is_safe(change_row: dict[str, Any]) -> bool:
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
    return all(classify_mapping_update(previous_mappings[key], current_mappings[key]) in {"safe-retain", "safe-mechanical-update"} for key in previous_mappings)


def exact_mapping_identity(mapping: dict[str, Any]) -> tuple[str, str, tuple[str, ...]]:
    return (
        str(mapping.get("kind", "")),
        str(mapping.get("target", "")),
        tuple(str(path) for path in mapping.get("fieldPaths", []) if isinstance(path, str)),
    )


def candidate_reference_ids_from_snapshot(change_row: dict[str, Any]) -> list[str]:
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
    if confidence_tier == "safe-retain":
        return "Mapping targets and values are stable; only semantic or evidence metadata changed."
    if confidence_tier == "safe-mechanical-update":
        return "Exact mapping target and field paths are stable, and value changes are type-compatible."
    if confidence_tier == "parameter-needed":
        return "Recommendation remains parameterized; local values or evidence are required."
    if confidence_tier == "gap-or-parser-work":
        return "Recommendation appeared or disappeared and needs source or parser inspection before mapping changes."
    if classification == "candidate-target-changed":
        return "Candidate target drift is advisory and must not promote exact mappings automatically."
    return "Exact mapping status, target, or value drift requires manual ledger review."


def apply_safe_relution_mapping_updates(selected_sources: list[str] | None = None) -> dict[str, Any]:
    if not RELUTION_MAPPING_UPDATE_PLAN_PATH.exists():
        raise ValueError(f"{relative_path(RELUTION_MAPPING_UPDATE_PLAN_PATH)} does not exist; build artifacts first")
    payload = read_json(RELUTION_MAPPING_UPDATE_PLAN_PATH)
    if not isinstance(payload, dict):
        raise ValueError(f"{relative_path(RELUTION_MAPPING_UPDATE_PLAN_PATH)} must contain a JSON object")
    source_filter = set(selected_sources or ALL_SOURCES)
    applied = 0
    skipped = 0
    rows: list[dict[str, Any]] = []
    for raw_row in payload.get("rows", []):
        if not isinstance(raw_row, dict):
            continue
        row = dict(raw_row)
        if row.get("source") not in source_filter:
            row["applicationStatus"] = "skipped-source-filter"
            skipped += 1
        elif row.get("requiredAction") == "apply-safe":
            row["applicationStatus"] = "applied"
            applied += 1
        else:
            row["applicationStatus"] = "skipped-review-required"
            skipped += 1
        rows.append(row)
    payload["rows"] = rows
    payload["applySummary"] = {
        "mode": "apply-safe",
        "selectedSources": sorted(source_filter),
        "appliedRows": applied,
        "skippedRows": skipped,
        "reviewRequiredRows": sum(1 for row in rows if row.get("applicationStatus") == "skipped-review-required"),
    }
    write_json(RELUTION_MAPPING_UPDATE_PLAN_PATH, payload)
    return payload["applySummary"]
