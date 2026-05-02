from recommendation_mapping import tokenize


def build_mapping_candidate_review_artifacts() -> None:
    recommendations = load_recommendations_by_global_id()
    exact_references = build_exact_mapping_reference_rows(recommendations)
    manual_promotions = validate_manual_mapping_promotions(exact_references)
    candidate_rows = build_mapping_candidate_review_rows(recommendations, exact_references)
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    reference_payload = {
        "version": 1,
        "name": "Exact Mapping Reference",
        "generatedAt": generated_at,
        "description": "Current exact BSI/CIS/vendor mappings used as bilingual reference examples for offline mapping review.",
        "rows": exact_references,
        "summary": {
            "totalExactMappings": len(exact_references),
            "bySource": count_by(exact_references, "source"),
            "byPlatform": count_by(exact_references, "platform"),
            "byLanguage": count_by(exact_references, "language"),
            "byTargetKind": count_by_nested_mapping(exact_references, ("mapping", "kind")),
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
            "note": "Existing exact mappings are reference examples. Candidate similarity never creates exact mappings by itself.",
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
            "bySuggestedReviewAction": count_by(candidate_rows, "suggestedReviewAction"),
        },
    }

    write_json(EXACT_MAPPING_REFERENCE_PATH, reference_payload)
    write_json(MAPPING_CANDIDATE_REVIEW_PATH, review_payload)
    build_guideline_update_artifacts(recommendations, reference_payload, review_payload, generated_at)
    build_relution_mapping_update_artifacts(recommendations, reference_payload, review_payload, generated_at)
    write_mapping_candidate_review_report(reference_payload, review_payload)


def build_guideline_update_artifacts(
    recommendations: dict[str, dict[str, Any]],
    reference_payload: dict[str, Any],
    review_payload: dict[str, Any],
    generated_at: str,
) -> None:
    source_rows = build_source_change_rows(recommendations)
    source_payload = {
        "version": 1,
        "name": "Guideline Source Change Report",
        "generatedAt": generated_at,
        "comparisonMode": "current-manifest-baseline",
        "description": "Compares current checked-in BSI/CIS/vendor source manifests and maps source ids to affected recommendations.",
        "rows": source_rows,
        "summary": {
            "totalSources": len(source_rows),
            "bySource": count_by(source_rows, "source"),
            "byClassification": count_by(source_rows, "changeClassification"),
            "byChangeClassification": count_by(source_rows, "changeClassification"),
            "changedSources": sum(1 for row in source_rows if row.get("changeClassification") != "unchanged"),
            "affectedRecommendations": len({rec_id for row in source_rows for rec_id in row.get("affectedRecommendationIds", [])}),
        },
    }
    update_rows = build_ruleset_update_plan_rows(source_rows, recommendations, reference_payload, review_payload)
    update_payload = {
        "version": 1,
        "name": "Guideline Ruleset Update Plan",
        "generatedAt": generated_at,
        "mode": "offline-safe-update-plan",
        "description": "Machine-readable review plan for source changes. Candidate similarity does not promote exact mappings.",
        "inputs": {
            "sourceChangeReportPath": relative_path(SOURCE_CHANGE_REPORT_PATH),
            "exactMappingReferencePath": relative_path(EXACT_MAPPING_REFERENCE_PATH),
            "mappingCandidateReviewPath": relative_path(MAPPING_CANDIDATE_REVIEW_PATH),
            "manualPromotionLedgerPath": relative_path(MANUAL_MAPPING_PROMOTIONS_PATH),
        },
        "rows": update_rows,
        "summary": {
            "totalUpdateRows": len(update_rows),
            "totalChangedSources": sum(1 for row in source_rows if row.get("changeClassification") != "unchanged"),
            "proposedUpdates": len(update_rows),
            "bySource": count_by(update_rows, "source"),
            "byConfidenceTier": count_by(update_rows, "confidenceTier"),
            "byRequiredAction": count_by(update_rows, "requiredAction"),
        },
    }
    write_json(SOURCE_CHANGE_REPORT_PATH, source_payload)
    write_json(RULESET_UPDATE_PLAN_PATH, update_payload)


def build_source_change_rows(recommendations: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    recommendation_ids_by_source_id = recommendation_ids_by_source_id_for(recommendations)
    previous_rows = previous_source_change_rows()
    previous_by_key = {
        (str(row.get("source", "")), str(row.get("sourceId", ""))): row
        for row in previous_rows
        if isinstance(row, dict) and row.get("source") and row.get("sourceId")
    }
    rows: list[dict[str, Any]] = []
    current_keys: set[tuple[str, str]] = set()
    for source, manifest_path in source_manifest_paths().items():
        if not manifest_path.exists():
            continue
        manifest = read_json(manifest_path)
        if not isinstance(manifest, list):
            continue
        for entry in manifest:
            if not isinstance(entry, dict):
                continue
            source_id = str(entry.get("id", ""))
            if not source_id:
                continue
            key = (source, source_id)
            current_keys.add(key)
            text_hash = source_text_hash(entry)
            current_snapshot = source_change_snapshot(source, source_id, entry, text_hash)
            previous_snapshot = previous_by_key.get(key, current_snapshot)
            classification = classify_source_change(previous_snapshot, current_snapshot)
            affected_recommendation_ids = recommendation_ids_by_source_id.get((source, source_id), [])
            rows.append(
                {
                    **current_snapshot,
                    "changeClassification": classification,
                    "classification": classification,
                    "previousSha256": str(previous_snapshot.get("sha256", "")),
                    "previousTextSha256": str(previous_snapshot.get("textSha256", "")),
                    "affectedRecommendationIds": affected_recommendation_ids,
                    "affectedRecommendationCount": len(affected_recommendation_ids),
                }
            )
    for key, previous_snapshot in previous_by_key.items():
        if key in current_keys:
            continue
        source, source_id = key
        affected_recommendation_ids = [
            str(recommendation_id)
            for recommendation_id in previous_snapshot.get("affectedRecommendationIds", [])
            if isinstance(recommendation_id, str)
        ]
        if not affected_recommendation_ids:
            affected_recommendation_ids = recommendation_ids_by_source_id.get((source, source_id), [])
        rows.append(
            {
                **source_change_snapshot(source, source_id, previous_snapshot, str(previous_snapshot.get("textSha256", ""))),
                "changeClassification": "removed-source",
                "classification": "removed-source",
                "previousSha256": str(previous_snapshot.get("sha256", "")),
                "previousTextSha256": str(previous_snapshot.get("textSha256", "")),
                "affectedRecommendationIds": affected_recommendation_ids,
                "affectedRecommendationCount": len(affected_recommendation_ids),
            }
        )
    rows.sort(key=lambda row: (row["source"], row["sourceId"]))
    return rows


def previous_source_change_rows() -> list[dict[str, Any]]:
    if not SOURCE_CHANGE_REPORT_PATH.exists():
        return []
    payload = read_json(SOURCE_CHANGE_REPORT_PATH)
    rows = payload.get("rows", []) if isinstance(payload, dict) else []
    return [row for row in rows if isinstance(row, dict)]


def source_change_snapshot(source: str, source_id: str, entry: dict[str, Any], text_hash: str) -> dict[str, Any]:
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
    return {
        "bsi": REPO_ROOT / "example" / "bsi-references" / "downloads" / "manifest.json",
        "cis": REPO_ROOT / "example" / "cis-references" / "downloads" / "manifest.json",
        "vendor": REPO_ROOT / "example" / "vendor-references" / "downloads" / "manifest.json",
    }


def recommendation_ids_by_source_id_for(recommendations: dict[str, dict[str, Any]]) -> dict[tuple[str, str], list[str]]:
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


def classify_source_change(previous: dict[str, Any] | None, current: dict[str, Any] | None) -> str:
    if previous is None and current is None:
        return "unchanged"
    if previous is None:
        return "new-source"
    if current is None:
        return "removed-source"
    if current.get("textPath") and not current.get("textSha256"):
        return "parser-breaking"
    previous_content = (str(previous.get("sha256", "")), str(previous.get("textSha256", "")))
    current_content = (str(current.get("sha256", "")), str(current.get("textSha256", "")))
    if previous_content != current_content:
        return "text-changed"
    metadata_keys = ("url", "finalUrl", "title", "documentDate", "verifiedAsOf", "sizeBytes", "contentType")
    if any(previous.get(key) != current.get(key) for key in metadata_keys):
        return "metadata-only"
    return "unchanged"


def source_text_hash(entry: dict[str, Any]) -> str:
    text_path = str(entry.get("textPath", ""))
    if not text_path:
        return ""
    path = REPO_ROOT / text_path
    if not path.exists() or not path.is_file():
        return ""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_ruleset_update_plan_rows(
    source_rows: list[dict[str, Any]],
    recommendations: dict[str, dict[str, Any]],
    reference_payload: dict[str, Any],
    review_payload: dict[str, Any],
) -> list[dict[str, Any]]:
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
            exact_refs = references_by_recommendation.get(global_id, [])
            review_row = review_by_recommendation.get(global_id)
            confidence_tier = update_confidence_tier(classification, recommendation, exact_refs, review_row)
            rows.append(
                {
                    "source": source,
                    "sourceId": source_row["sourceId"],
                    "recommendationId": recommendation_id,
                    "globalRecommendationId": global_id,
                    "platform": normalize_policy_platform(str(recommendation.get("platform", ""))),
                    "changeClassification": classification,
                    "currentMappingStatus": str(recommendation.get("relutionMapping", {}).get("status", "none")),
                    "confidenceTier": confidence_tier,
                    "requiredAction": required_action_for_confidence_tier(confidence_tier),
                    "sourceProvenance": {
                        "sha256": source_row.get("sha256", ""),
                        "textSha256": source_row.get("textSha256", ""),
                        "verifiedAsOf": source_row.get("verifiedAsOf", ""),
                    },
                    "previousMappingIds": [str(reference["mappingId"]) for reference in exact_refs],
                    "candidateReferenceIds": [
                        str(reference_id)
                        for candidate in (review_row or {}).get("rankedCandidates", [])
                        for reference_id in candidate.get("referenceMappingIds", [])
                    ][:8],
                    "proposedPatch": None,
                    "reason": update_plan_reason(classification, confidence_tier),
                }
            )
    rows.sort(key=lambda row: (row["source"], PLATFORM_ORDER.get(row["platform"], 99), row["platform"], row["recommendationId"], row["sourceId"]))
    return rows


def exact_references_by_recommendation(reference_payload: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in reference_payload.get("rows", []):
        if isinstance(row, dict) and isinstance(row.get("globalRecommendationId"), str):
            grouped.setdefault(str(row["globalRecommendationId"]), []).append(row)
    return grouped


def candidate_review_by_recommendation(review_payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
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
    if change_classification == "metadata-only":
        return "safe-retain"
    if change_classification in {"removed-source", "parser-breaking"}:
        return "gap-or-parser-work"
    if change_classification == "text-changed" and exact_refs:
        return "manual-ledger-needed"
    if change_classification == "text-changed" and review_row is not None:
        if str(recommendation.get("relutionMapping", {}).get("status", "none")) == "parameterized":
            return "parameter-needed"
        return "manual-ledger-needed"
    if change_classification == "new-source":
        return "manual-ledger-needed" if review_row is not None else "gap-or-parser-work"
    return "safe-retain"


def required_action_for_confidence_tier(confidence_tier: str) -> str:
    return {
        "safe-retain": "apply-safe",
        "safe-mechanical-update": "apply-safe",
        "manual-ledger-needed": "review-manual-ledger",
        "parameter-needed": "supply-local-parameters",
        "gap-or-parser-work": "inspect-parser-or-source",
    }.get(confidence_tier, "review")


def update_plan_reason(change_classification: str, confidence_tier: str) -> str:
    if confidence_tier == "safe-retain":
        return "Source metadata changed without content hash drift; current mapping artifacts can be retained."
    if confidence_tier == "safe-mechanical-update":
        return "Target and field paths are stable and the value change is type-compatible."
    if confidence_tier == "manual-ledger-needed":
        return "Changed source text requires human review before exact mapping promotion or value changes."
    if confidence_tier == "parameter-needed":
        return "Recommendation remains parameterized; local values or evidence are required."
    if change_classification == "removed-source":
        return "Source disappeared from the manifest and needs review before mappings are removed."
    return "No reliable mapping update can be inferred automatically."


def classify_mapping_update(previous_mapping: dict[str, Any], current_mapping: dict[str, Any]) -> str:
    previous_target = previous_mapping.get("target") or mapping_target(previous_mapping)
    current_target = current_mapping.get("target") or mapping_target(current_mapping)
    if previous_mapping.get("kind") != current_mapping.get("kind") or previous_target != current_target:
        return "human-review-required"
    previous_paths = flatten_value_paths(previous_mapping.get("values", {}))
    current_paths = flatten_value_paths(current_mapping.get("values", {}))
    if previous_paths != current_paths:
        return "manual-ledger-needed"
    if previous_mapping.get("values") == current_mapping.get("values"):
        return "safe-retain"
    if mapping_values_type_compatible(previous_mapping.get("values", {}), current_mapping.get("values", {})):
        return "safe-mechanical-update"
    return "manual-ledger-needed"


def mapping_values_type_compatible(previous: Any, current: Any) -> bool:
    if isinstance(previous, dict) and isinstance(current, dict):
        if set(previous) != set(current):
            return False
        return all(mapping_values_type_compatible(previous[key], current[key]) for key in previous)
    if isinstance(previous, list) and isinstance(current, list):
        return all(isinstance(value, type(previous[0])) for value in current) if previous and current else True
    return type(previous) is type(current)


def manual_promotions_by_recommendation(source: str) -> dict[str, list[dict[str, Any]]]:
    entries = load_manual_mapping_promotion_entries()
    if not entries:
        return {}
    grouped: dict[str, list[dict[str, Any]]] = {}
    for entry in entries:
        if str(entry.get("source", "")) != source:
            continue
        recommendation_id = str(entry.get("recommendationId", ""))
        mapping = manual_promotion_ruleset_mapping(entry)
        if recommendation_id and mapping is not None:
            grouped.setdefault(recommendation_id, []).append(mapping)
    return grouped


def load_manual_mapping_promotion_entries() -> list[dict[str, Any]]:
    if not MANUAL_MAPPING_PROMOTIONS_PATH.exists():
        return []
    payload = read_json(MANUAL_MAPPING_PROMOTIONS_PATH)
    if not isinstance(payload, dict):
        raise ValueError(f"{relative_path(MANUAL_MAPPING_PROMOTIONS_PATH)} must contain a JSON object")
    entries = payload.get("entries", [])
    if not isinstance(entries, list):
        raise ValueError(f"{relative_path(MANUAL_MAPPING_PROMOTIONS_PATH)} entries must be an array")
    return [entry for entry in entries if isinstance(entry, dict)]


def validate_manual_mapping_promotions(exact_references: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not MANUAL_MAPPING_PROMOTIONS_PATH.exists():
        write_json(
            MANUAL_MAPPING_PROMOTIONS_PATH,
            {
                "version": 1,
                "name": "Manual Mapping Promotions",
                "entries": [],
            },
        )
    payload = read_json(MANUAL_MAPPING_PROMOTIONS_PATH)
    if not isinstance(payload, dict):
        raise ValueError(f"{relative_path(MANUAL_MAPPING_PROMOTIONS_PATH)} must contain a JSON object")
    if payload.get("version") != 1:
        raise ValueError(f"{relative_path(MANUAL_MAPPING_PROMOTIONS_PATH)} version must be 1")
    entries = payload.get("entries", [])
    if not isinstance(entries, list):
        raise ValueError(f"{relative_path(MANUAL_MAPPING_PROMOTIONS_PATH)} entries must be an array")

    references = {str(row["mappingId"]) for row in exact_references}
    recommendations = load_recommendations_by_global_id()
    field_index = build_setting_index()
    errors: list[str] = []
    valid_entries: list[dict[str, Any]] = []
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            errors.append(f"entry {index}: must be an object")
            continue
        source = str(entry.get("source", ""))
        recommendation_id = str(entry.get("recommendationId", ""))
        global_id = f"{source}:{recommendation_id}"
        recommendation = recommendations.get(global_id)
        if source not in ALL_SOURCES:
            errors.append(f"entry {index}: unknown source {source!r}")
        if recommendation is None:
            errors.append(f"entry {index}: unknown recommendation {global_id!r}")
            platform = str(entry.get("platform", ""))
        else:
            platform = normalize_policy_platform(str(recommendation.get("platform", "")))
            if normalize_policy_platform(str(entry.get("platform", platform))) != platform:
                errors.append(f"entry {index}: platform does not match recommendation")
            if str(recommendation.get("relutionMapping", {}).get("status", "none")) == "exact":
                errors.append(f"entry {index}: recommendation is already exact")
        reference_ids = [str(value) for value in entry.get("referenceMappingIds", []) if isinstance(value, str)]
        if not reference_ids or any(reference_id not in references for reference_id in reference_ids):
            errors.append(f"entry {index}: referenceMappingIds must point to exact mapping references")
        mapping = manual_promotion_ruleset_mapping(entry)
        if mapping is None:
            errors.append(f"entry {index}: mapping must include kind, target, and object values")
        elif not manual_promotion_target_is_valid(platform, mapping, field_index):
            errors.append(f"entry {index}: mapping target or field paths are not valid for {platform}")
        if not isinstance(entry.get("reviewerNote"), str) or not str(entry.get("reviewerNote", "")).strip():
            errors.append(f"entry {index}: reviewerNote is required")
        if not isinstance(entry.get("evidenceRefs"), list) or not entry.get("evidenceRefs"):
            errors.append(f"entry {index}: evidenceRefs are required")
        valid_entries.append(entry)
    if errors:
        raise ValueError("Invalid manual mapping promotion ledger:\n" + "\n".join(errors))
    return valid_entries


def manual_promotion_ruleset_mapping(entry: dict[str, Any]) -> dict[str, Any] | None:
    raw_mapping = entry.get("mapping")
    if not isinstance(raw_mapping, dict):
        return None
    kind = raw_mapping.get("kind")
    target = raw_mapping.get("target")
    values = raw_mapping.get("values")
    if not isinstance(kind, str) or not isinstance(target, str) or not isinstance(values, dict):
        return None
    mapping: dict[str, Any] = {
        "kind": kind,
        "values": values,
        "match": {
            "score": 100,
            "matchedTerms": [str(value) for value in entry.get("evidenceRefs", []) if isinstance(value, str)],
            "valueCompatibility": "manual-reviewed",
            "reason": str(entry.get("reviewerNote", "Manual mapping promotion.")),
        },
    }
    if kind == "relution-native":
        mapping["type"] = target
    elif kind == "apple-schema-profile":
        mapping["schemaId"] = target
    elif kind == "apple-mobileconfig":
        mapping["payloadType"] = target
    else:
        return None
    if isinstance(raw_mapping.get("constraints"), list):
        mapping["constraints"] = [dict(value) for value in raw_mapping["constraints"] if isinstance(value, dict)]
    return mapping


def manual_promotion_target_is_valid(platform: str, mapping: dict[str, Any], field_index: dict[str, list[Any]]) -> bool:
    target = mapping_target(mapping)
    if target is None:
        return False
    if mapping.get("kind") == "apple-mobileconfig":
        evidence_path = REPO_ROOT / "example" / "vendor-references" / "downloads" / "derived" / "apple-mobileconfig-evidence.json"
        if not evidence_path.exists():
            return False
        payload = read_json(evidence_path)
        payload_types = {
            str(entry.get("payloadType", ""))
            for entry in payload.get("settings", [])
            if isinstance(entry, dict)
        }
        return target in payload_types
    available_paths = {
        str(field.field_path)
        for field in field_index.get(platform, [])
        if field.kind == mapping.get("kind") and field.target == target
    }
    return bool(available_paths) and all(path in available_paths for path in flatten_value_paths(mapping.get("values", {})))


def build_exact_mapping_reference_rows(recommendations: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
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
            field_paths = unique_preserving_order([
                *flatten_value_paths(mapping.get("values", {})),
                *[str(constraint.get("path")) for constraint in mapping.get("constraints", []) if isinstance(constraint, dict) and isinstance(constraint.get("path"), str)],
            ])
            mapping_id = slugify(f"{global_id}-{mapping['kind']}-{target}-{stable_json(field_paths)}-{stable_json(mapping.get('values', {}))}")
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
                    "semanticConceptIds": [str(concept["id"]) for concept in semantic_concepts],
                    "mapping": {
                        "kind": str(mapping["kind"]),
                        "target": target,
                        "fieldPaths": field_paths,
                        "values": mapping.get("values", {}),
                        **({"constraints": mapping["constraints"]} if isinstance(mapping.get("constraints"), list) else {}),
                    },
                    "matchEvidence": exact_mapping_match_evidence(mapping),
                }
            )
    rows.sort(key=lambda row: (row["source"], PLATFORM_ORDER.get(row["platform"], 99), row["platform"], row["recommendationId"], row["mappingId"]))
    return rows


def build_mapping_candidate_review_rows(
    recommendations: dict[str, dict[str, Any]],
    exact_references: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    references_by_platform: dict[str, list[dict[str, Any]]] = {}
    for reference in exact_references:
        references_by_platform.setdefault(str(reference["platform"]), []).append(reference)

    for global_id, recommendation in sorted(recommendations.items()):
        relution_mapping = recommendation.get("relutionMapping", {})
        current_status = str(relution_mapping.get("status", "none"))
        if current_status == "exact":
            continue
        source = str(recommendation["_source"])
        platform = normalize_policy_platform(str(recommendation.get("platform", "")))
        source_text = recommendation_source_text(source, recommendation)
        tokens = bilingual_tokens(source_text, recommendation)
        semantic_ids = [str(concept["id"]) for concept in recommendation_semantic_concepts(recommendation)]
        nearest_references = nearest_exact_references(
            platform,
            tokens,
            semantic_ids,
            references_by_platform.get(platform, []),
            limit=5,
        )
        ranked_candidates = ranked_review_candidates(recommendation, tokens, semantic_ids, nearest_references)
        extracted_intent = extracted_mapping_intent(source, recommendation, source_text)
        blocked_by = unique_preserving_order([
            *[str(note) for note in relution_mapping.get("notes", []) if isinstance(note, str) and note],
            *[str(reason) for reason in recommendation.get("implementation", {}).get("blockingReasons", []) if isinstance(reason, str) and reason],
        ])
        rows.append(
            {
                "source": source,
                "recommendationId": str(recommendation["id"]),
                "globalRecommendationId": global_id,
                "platform": platform,
                "language": detect_mapping_language(source_text),
                "title": str(recommendation.get("title", "")),
                "currentMappingStatus": current_status,
                "currentImplementationCategory": str(recommendation.get("implementation", {}).get("category", "gap")),
                "extractedIntent": extracted_intent,
                "normalizedTokens": tokens,
                "semanticConceptIds": semantic_ids,
                "semanticAnalysis": semantic_review_analysis(current_status, extracted_intent, semantic_ids, ranked_candidates, nearest_references),
                "nearestExactReferences": nearest_references,
                "rankedCandidates": ranked_candidates,
                "suggestedReviewAction": suggested_review_action(current_status, ranked_candidates, nearest_references),
                "blockedBy": blocked_by,
            }
        )
    rows.sort(key=lambda row: (row["source"], PLATFORM_ORDER.get(row["platform"], 99), row["platform"], row["recommendationId"]))
    return rows


def write_mapping_candidate_review_report(reference_payload: dict[str, Any], review_payload: dict[str, Any]) -> None:
    summary = review_payload["summary"]
    reference_summary = reference_payload["summary"]
    lines = [
        "# Offline Bilingual Mapping Candidate Review",
        "",
        f"Generated: `{review_payload['generatedAt']}`",
        "",
        "## Scope",
        "",
        "This backend artifact uses existing exact BSI, CIS, and vendor mappings as bilingual reference examples. It does not call an external LLM or promote mappings automatically.",
        "",
        "## Summary",
        "",
        f"- Exact reference mappings: `{summary['exactReferenceCount']}`",
        f"- Reviewed non-exact recommendations: `{summary['totalReviewedRecommendations']}`",
        f"- Exact references by source: `{stable_json(reference_summary['bySource'])}`",
        f"- Exact references by language: `{stable_json(reference_summary['byLanguage'])}`",
        f"- Review actions: `{stable_json(summary['bySuggestedReviewAction'])}`",
        "",
        "## Promotion Rule",
        "",
        "Candidate similarity is advisory. Exact mappings require a validated entry in `example/recommendation-coverage/manual-mapping-promotions.json` with explicit evidence and exact-reference links.",
        "",
        "## Guideline Drift Artifacts",
        "",
        "- `example/recommendation-coverage/source-change-report.json` tracks BSI/CIS/vendor source hash drift against the previous generated report.",
        "- `example/recommendation-coverage/ruleset-update-plan.json` turns changed sources into review-gated update rows. Safe rows may be retained mechanically; exact mapping promotions still require the manual ledger.",
        "- `example/recommendation-coverage/relution-mapping-change-report.json` tracks recommendation-to-Relution mapping drift against the previous generated report.",
        "- `example/recommendation-coverage/relution-mapping-update-plan.json` records safe mapping updates separately from manual-ledger review rows.",
        "- `tools/update_guideline_mappings.py --offline --source all` rebuilds these artifacts from checked-in source material. Online refresh currently fails closed for BSI/CIS because no safe downloader is implemented there.",
        "",
        "## Top Review Queues",
        "",
    ]
    queue_counts = summary["bySuggestedReviewAction"]
    for action, count in sorted(queue_counts.items(), key=lambda item: (-item[1], item[0])):
        lines.append(f"- `{action}`: `{count}`")
    MAPPING_CANDIDATE_REVIEW_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    MAPPING_CANDIDATE_REVIEW_REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf8")
