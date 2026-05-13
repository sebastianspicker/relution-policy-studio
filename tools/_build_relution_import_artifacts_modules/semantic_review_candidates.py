def ranked_review_candidates(
    recommendation: dict[str, Any],
    tokens: list[str],
    semantic_ids: list[str],
    nearest_references: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, str, tuple[str, ...]]] = set()
    for candidate in candidate_target_specs(recommendation):
        key = (str(candidate["kind"]), str(candidate["target"]), tuple(str(path) for path in candidate.get("fieldPaths", [])))
        if key in seen:
            continue
        seen.add(key)
        candidates.append(review_candidate_from_spec(candidate, tokens, semantic_ids, nearest_references, "current-candidate"))
    for reference in nearest_references:
        mapping = reference.get("mapping", {})
        if not isinstance(mapping, dict):
            continue
        field_paths = [str(path) for path in mapping.get("fieldPaths", []) if isinstance(path, str)]
        key = (str(mapping.get("kind", "")), str(mapping.get("target", "")), tuple(field_paths))
        if key in seen:
            continue
        seen.add(key)
        candidates.append(
            review_candidate_from_spec(
                {
                    "kind": key[0],
                    "target": key[1],
                    "fieldPaths": field_paths,
                    "semanticConceptId": next(iter(set(semantic_ids) & set(reference.get("semanticConceptIds", []))), ""),
                },
                tokens,
                semantic_ids,
                [reference],
                "nearest-exact-reference",
            )
        )
    candidates.sort(key=lambda candidate: (-int(candidate["score"]), candidate["kind"], candidate["target"], candidate["fieldPaths"]))
    return candidates[:8]


def review_candidate_from_spec(
    spec: dict[str, Any],
    tokens: list[str],
    semantic_ids: list[str],
    references: list[dict[str, Any]],
    provenance: str,
) -> dict[str, Any]:
    reference_ids = [
        str(reference["mappingId"])
        for reference in references
        if reference_candidate_overlap(spec, reference) > 0
    ]
    shared_concepts = unique_preserving_order([
        concept_id
        for reference in references
        for concept_id in reference.get("semanticConceptIds", [])
        if isinstance(concept_id, str) and concept_id in semantic_ids
    ])
    own_concept = candidate_semantic_concept_id(spec, semantic_ids)
    if own_concept and own_concept in semantic_ids and own_concept not in shared_concepts:
        shared_concepts = [own_concept, *shared_concepts]
    shared_tokens = unique_preserving_order([
        token
        for reference in references
        for token in reference.get("normalizedTokens", [])
        if isinstance(token, str) and token in tokens
    ])
    target_overlap = max([reference_candidate_overlap(spec, reference) for reference in references] or [0])
    score_breakdown = {
        "semanticConcept": min(40, len(shared_concepts) * 40),
        "bilingualToken": min(30, len(shared_tokens) * 3),
        "targetReference": target_overlap,
        "valueCompatibility": 0 if provenance == "current-candidate" else 10,
    }
    score = sum(score_breakdown.values())
    match = spec.get("match") if isinstance(spec.get("match"), dict) else {}
    semantic_concept_id = candidate_semantic_concept_id(spec, semantic_ids)
    value_compatibility = str(match.get("valueCompatibility", "reference-candidate" if provenance != "current-candidate" else "unknown"))
    return {
        "kind": str(spec.get("kind", "")),
        "target": str(spec.get("target", "")),
        "fieldPaths": [str(path) for path in spec.get("fieldPaths", []) if isinstance(path, str)],
        "semanticConceptId": semantic_concept_id,
        "provenance": provenance,
        "score": score,
        "scoreBreakdown": score_breakdown,
        "sharedSemanticConceptIds": shared_concepts,
        "sharedTokens": shared_tokens[:12],
        "referenceMappingIds": reference_ids[:5],
        "valueCompatibility": value_compatibility,
        "reason": str(match.get("reason", "Candidate derived from nearest exact mapping reference." if provenance != "current-candidate" else "Existing generated candidate.")),
        "settingMeaning": candidate_setting_meaning(spec, shared_concepts, shared_tokens, provenance),
        "decision": candidate_review_decision(provenance, value_compatibility, shared_concepts, reference_ids, target_overlap),
    }


def semantic_review_analysis(
    current_status: str,
    extracted_intent: dict[str, Any],
    semantic_ids: list[str],
    ranked_candidates: list[dict[str, Any]],
    nearest_references: list[dict[str, Any]],
) -> dict[str, str]:
    action = str(extracted_intent.get("action", "unspecified"))
    has_value = bool(extracted_intent.get("hasConcreteValue", False))
    local_parameter = bool(extracted_intent.get("localParameterLikely", False))
    concept_text = ", ".join(semantic_ids) if semantic_ids else "no curated concept"
    if has_value:
        recommendation_meaning = f"{action} recommendation with a concrete value and concepts: {concept_text}."
    elif local_parameter:
        recommendation_meaning = f"{action} recommendation that depends on local identifiers, scope, or organization-specific values; concepts: {concept_text}."
    else:
        recommendation_meaning = f"{action} recommendation interpreted through concepts: {concept_text}."

    if ranked_candidates:
        top = ranked_candidates[0]
        relution_fit = f"Best Relution candidate is {top['kind']}:{top['target']} with score {top['score']} from {top['provenance']}."
    elif nearest_references:
        relution_fit = "No generated candidate target exists, but nearest exact references give review context."
    else:
        relution_fit = "No Relution candidate or exact-reference context is strong enough in this snapshot."

    if current_status == "parameterized":
        exactness_decision = "parameter candidate: Relution support exists, but local values or evidence are required before exact compliance."
    elif ranked_candidates:
        exactness_decision = "candidate only, not exact: semantic and reference evidence is advisory and cannot create an importable mapping without manual ledger evidence."
    else:
        exactness_decision = "not exact: keep as gap/helper until a concrete Relution setting and values are proven."

    return {
        "recommendationMeaning": recommendation_meaning,
        "relutionFit": relution_fit,
        "exactnessDecision": exactness_decision,
    }


def candidate_setting_meaning(
    spec: dict[str, Any],
    shared_concepts: list[str],
    shared_tokens: list[str],
    provenance: str,
) -> str:
    target = str(spec.get("target", ""))
    paths = [str(path) for path in spec.get("fieldPaths", []) if isinstance(path, str)]
    concept_text = ", ".join(shared_concepts or [str(spec.get("semanticConceptId", ""))]).strip(", ")
    token_text = ", ".join(shared_tokens[:6])
    if concept_text:
        basis = f"matches semantic concept {concept_text}"
    elif token_text:
        basis = f"shares language tokens {token_text}"
    else:
        basis = "is a nearby setting-family candidate"
    return f"{target} fields {', '.join(paths) or 'unknown'} {basis}; provenance: {provenance}."


def candidate_semantic_concept_id(spec: dict[str, Any], semantic_ids: list[str]) -> str:
    explicit = str(spec.get("semanticConceptId", ""))
    if explicit:
        return explicit
    candidate_text = " ".join([
        str(spec.get("target", "")),
        *[str(path) for path in spec.get("fieldPaths", []) if isinstance(path, str)],
    ]).lower()
    markers = {
        "dns_resolution": ("dns", "name resolution"),
        "time_sync": ("time", "date", "timezone"),
        "lock_screen_message": ("lockscreen", "lock_screen", "lock screen", "loginmessage", "login message", "supportmessage", "support message"),
        "network_connectivity": ("vpn", "wifi", "wi-fi", "proxy", "cellular", "apn", "connectivity"),
        "exploit_mitigation": ("exploit", "antivirus", "custom_csp", "custom csp", "networkprotection", "ioav", "pua"),
        "device_attestation_posture": ("advanced_security", "advanced security", "compliance", "bitlocker", "tpm", "system_policy"),
    }
    for concept_id in semantic_ids:
        if any(marker in candidate_text for marker in markers.get(concept_id, ())):
            return concept_id
    return ""


def candidate_review_decision(
    provenance: str,
    value_compatibility: str,
    shared_concepts: list[str],
    reference_ids: list[str],
    target_overlap: int,
) -> str:
    if value_compatibility in {"manual-reviewed", "curated-analog", "curated-android-analog"} and provenance == "current-candidate":
        return "strong candidate; still non-exact unless present as a ruleset mapping or manual promotion."
    if shared_concepts and reference_ids and target_overlap >= 20:
        return "review candidate against exact references; language and target family align, but values are not proven."
    if shared_concepts:
        return "semantic candidate; concept matches but exact setting values remain unresolved."
    return "weak candidate for review context only."


def nearest_exact_references(
    platform: str,
    tokens: list[str],
    semantic_ids: list[str],
    references: list[dict[str, Any]],
    *,
    limit: int,
) -> list[dict[str, Any]]:
    scored: list[tuple[int, dict[str, Any], list[str], list[str]]] = []
    token_set = set(tokens)
    concept_set = set(semantic_ids)
    for reference in references:
        reference_tokens = {str(token) for token in reference.get("normalizedTokens", []) if isinstance(token, str)}
        reference_concepts = {str(concept) for concept in reference.get("semanticConceptIds", []) if isinstance(concept, str)}
        shared_tokens = sorted(token_set & reference_tokens)
        shared_concepts = sorted(concept_set & reference_concepts)
        score = min(40, len(shared_concepts) * 20) + min(40, len(shared_tokens) * 4)
        if platform == reference.get("platform"):
            score += 20
        if score <= 20:
            continue
        scored.append((score, reference, shared_tokens, shared_concepts))
    scored.sort(key=lambda item: (-item[0], str(item[1]["source"]), str(item[1]["recommendationId"]), str(item[1]["mappingId"])))
    return [
        {
            "mappingId": reference["mappingId"],
            "source": reference["source"],
            "recommendationId": reference["recommendationId"],
            "language": reference["language"],
            "title": reference["title"],
            "score": score,
            "sharedTokens": shared_tokens[:12],
            "sharedSemanticConceptIds": shared_concepts,
            "mapping": reference["mapping"],
        }
        for score, reference, shared_tokens, shared_concepts in scored[:limit]
    ]


def reference_candidate_overlap(spec: dict[str, Any], reference: dict[str, Any]) -> int:
    mapping = reference.get("mapping", {})
    if not isinstance(mapping, dict):
        return 0
    score = 0
    if spec.get("kind") == mapping.get("kind"):
        score += 10
    if spec.get("target") == mapping.get("target"):
        score += 20
    candidate_paths = {str(path) for path in spec.get("fieldPaths", []) if isinstance(path, str)}
    reference_paths = {str(path) for path in mapping.get("fieldPaths", []) if isinstance(path, str)}
    score += min(20, len(candidate_paths & reference_paths) * 10)
    return score


def recommendation_source_text(source: str, recommendation: dict[str, Any]) -> str:
    keys_by_source = {
        "bsi": ("title", "requirementText", "reason", "category", "moduleTitle"),
        "cis": ("title", "description", "rationale", "audit", "remediation", "defaultValue", "recommendedValue"),
        "vendor": ("title", "section", "reason", "recommendedValue"),
    }
    values: list[str] = []
    for key in keys_by_source.get(source, ("title", "reason")):
        value = recommendation.get(key)
        if isinstance(value, str) and value:
            values.append(value)
    return "\n".join(values)


def bilingual_tokens(source_text: str, recommendation: dict[str, Any]) -> list[str]:
    concept_labels = [
        str(label)
        for concept in recommendation_semantic_concepts(recommendation)
        for label in (concept.get("label", {}) if isinstance(concept.get("label"), dict) else {}).values()
        if isinstance(label, str)
    ]
    return sorted(tokenize(source_text, *concept_labels))


def recommendation_semantic_concepts(recommendation: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        concept
        for concept in recommendation.get("semanticConcepts", [])
        if isinstance(concept, dict) and isinstance(concept.get("id"), str)
    ]


def detect_mapping_language(text: str) -> str:
    normalized = text.lower()
    german_markers = (" muss ", " sollte ", " sollen ", " benutz", " gerät", " geraet", " richtlinie", " schutz", "ä", "ö", "ü", "ß")
    english_markers = (" ensure ", " enabled", " disabled", " set to ", " require ", " block ", " allow ")
    has_german = any(marker in f" {normalized} " for marker in german_markers)
    has_english = any(marker in f" {normalized} " for marker in english_markers)
    if has_german and has_english:
        return "mixed"
    if has_german:
        return "de"
    if has_english:
        return "en"
    return "unknown"


def extracted_mapping_intent(source: str, recommendation: dict[str, Any], source_text: str) -> dict[str, Any]:
    return {
        "action": extracted_action(source_text),
        "recommendedValue": recommendation.get("recommendedValue"),
        "hasConcreteValue": recommendation.get("recommendedValue") is not None or bool(exact_mappings(recommendation)),
        "sourceSections": source_intent_sections(source, recommendation),
        "localParameterLikely": local_parameter_likely(source_text),
    }


def extracted_action(text: str) -> str:
    normalized = text.lower()
    if any(term in normalized for term in ("disable", "disabled", "block", "prevent", "deaktiv", "verhindern", "verbieten")):
        return "restrict"
    if any(term in normalized for term in ("enable", "enabled", "enforce", "require", "aktiv", "erzwingen", "muss")):
        return "enforce"
    if any(term in normalized for term in ("audit", "verify", "überprüf", "pruef")):
        return "verify"
    return "unspecified"


def source_intent_sections(source: str, recommendation: dict[str, Any]) -> list[str]:
    sections = {
        "bsi": ("title", "requirementText", "reason"),
        "cis": ("title", "description", "rationale", "audit", "remediation", "recommendedValue"),
        "vendor": ("title", "section", "reason", "recommendedValue"),
    }.get(source, ("title",))
    return [key for key in sections if isinstance(recommendation.get(key), str) and str(recommendation.get(key))]


def local_parameter_likely(text: str) -> bool:
    normalized = text.lower()
    return any(term in normalized for term in ("ssid", "vpn", "certificate", "zertifikat", "server", "gateway", "app id", "bundle id", "organization", "institution"))


def suggested_review_action(
    current_status: str,
    ranked_candidates: list[dict[str, Any]],
    nearest_references: list[dict[str, Any]],
) -> str:
    if current_status == "parameterized":
        return "supply-local-parameters"
    if ranked_candidates and int(ranked_candidates[0]["score"]) >= 70:
        return "review-near-exact-reference"
    if nearest_references:
        return "review-partial-candidates"
    return "confirm-gap-or-helper"


def exact_mapping_match_evidence(mapping: dict[str, Any]) -> dict[str, Any]:
    match = mapping.get("match") if isinstance(mapping.get("match"), dict) else {}
    return {
        "matchedTerms": [str(term) for term in match.get("matchedTerms", []) if isinstance(term, str)],
        "valueCompatibility": str(match.get("valueCompatibility", "exact")),
        "reason": str(match.get("reason", "Exact mapping is present in the committed recommendation catalog.")),
    }


def count_by_nested_mapping(rows: list[dict[str, Any]], path: tuple[str, ...]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        value: Any = row
        for key in path:
            value = value.get(key, {}) if isinstance(value, dict) else {}
        marker = str(value)
        counts[marker] = counts.get(marker, 0) + 1
    return dict(sorted(counts.items()))


def shorten_review_text(text: str, limit: int) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 1].rstrip() + "…"
