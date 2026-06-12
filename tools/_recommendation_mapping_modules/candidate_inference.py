"""Infer candidate Relution and Apple mappings from recommendation evidence."""

import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

from .mapping_types_and_constants import (
    APPLE_ANALOG_RULES,
    APPLE_MOBILECONFIG_CANDIDATE_RULES,
    APPLE_MOBILECONFIG_EVIDENCE_PATH,
    APPLE_PASSCODE,
    APPLE_SCHEMA_CATALOG_PATH,
    APPLE_SCREEN_SAVER,
    AndroidAnalogRule,
    AppleAnalogRule,
    BSI_CONCEPT_MATCH_REASON,
    DIRECT_SEMANTIC_SOURCES,
    FieldEntry,
    GS_PLUSPLUS_SEMANTIC_SOURCES,
    MANAGEMENT_SUPPORT_CONCEPT_IDS,
    PROCESS_ONLY_TITLE_TERMS,
    RELATED_SEMANTIC_SOURCES,
    SemanticConceptRule,
    TEMPLATE_BUNDLE_PATH,
)
from ._android_analog_rules import ANDROID_ANALOG_RULES, ANDROID_CANDIDATE_RULES
from .semantic_concept_rules import SEMANTIC_CONCEPT_RULES
from .field_matching import (
    apple_schema_mapping,
    merge_apple_schema_mappings,
    relution_fields,
    apple_schema_fields,
    candidate_from_score,
    candidate_key,
    boolean_value_for_field,
    extract_setting_state,
    first_int,
    flatten_value_paths,
    flatten_leaf_items,
    is_exact_label_match,
    kind_priority,
    matched_rule_terms,
    normalize_search_text,
    phrase_groups_match,
    read_json,
    score_fields,
    stable_match_value,
    tokenize,
    unique_preserving_order,
    value_at_path,
    values_from_pairs,
)


def build_setting_index(
    template_bundle_path: Path = TEMPLATE_BUNDLE_PATH,
    apple_schema_catalog_path: Path = APPLE_SCHEMA_CATALOG_PATH,
) -> dict[str, list[FieldEntry]]:
    """Build platform-indexed Relution and Apple field metadata."""
    indexed: dict[str, list[FieldEntry]] = {}
    for field in relution_fields(template_bundle_path):
        for platform in field.platforms:
            indexed.setdefault(platform, []).append(field)
    if apple_schema_catalog_path.exists():
        for field in apple_schema_fields(apple_schema_catalog_path):
            for platform in field.platforms:
                indexed.setdefault(platform, []).append(field)
    for fields in indexed.values():
        fields.sort(key=lambda field: (field.kind, field.target, field.field_path))
    return indexed


def mapping_candidates(
    platform: str,
    title: str,
    section: str,
    field_index: dict[str, list[FieldEntry]],
    options: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Return ranked mapping candidates for recommendation text and options."""
    options = options or {}
    limit = int(options.get("limit", 5))
    candidates = [
        candidate_from_score(entry)
        for entry in scored_candidate_fields(
            platform, title, section, field_index, options
        )[:limit]
    ]
    candidates = prepend_exact_mapping_candidates(
        candidates, options.get("exactMapping")
    )
    return candidates[:limit]


def scored_candidate_fields(
    platform: str,
    title: str,
    section: str,
    field_index: dict[str, list[FieldEntry]],
    options: dict[str, Any],
) -> list[Any]:
    """Score fields with optional extra text, value, and kind constraints."""
    return score_fields(
        platform,
        title,
        section,
        field_index,
        {
            "extraTexts": tuple(str(text) for text in options.get("extraTexts", ())),
            "recommendedValue": options.get("recommendedValue"),
            "allowedKinds": options.get("allowedKinds"),
        },
    )


def prepend_exact_mapping_candidates(
    candidates: list[dict[str, Any]], exact_mapping: Any
) -> list[dict[str, Any]]:
    """Put caller-provided exact mappings ahead of inferred candidates."""
    if not isinstance(exact_mapping, tuple):
        return candidates
    target, values = exact_mapping
    for path in flatten_value_paths(values):
        exact_candidate = {
            "kind": "relution-native",
            "target": target,
            "fieldPaths": [path],
        }
        candidates = [
            exact_candidate,
            *[
                candidate
                for candidate in candidates
                if candidate_key(candidate) != candidate_key(exact_candidate)
            ],
        ]
    return candidates


def infer_exact_boolean_mapping(
    platform: str,
    title: str,
    recommended_value: Any,
    field_index: dict[str, list[FieldEntry]],
    options: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Infer exact boolean mappings only from unambiguous label/state matches."""
    options = options or {}
    setting_name, state = extract_setting_state(title, recommended_value)
    if state is None or not tokenize(setting_name):
        return None
    best = best_exact_boolean_match(
        platform, setting_name, recommended_value, field_index, options
    )
    if best is None:
        return None
    desired = boolean_value_for_field(setting_name, state, best.field)
    return None if desired is None else exact_boolean_mapping_for_match(best, desired)


def best_exact_boolean_match(
    platform: str,
    setting_name: str,
    recommended_value: Any,
    field_index: dict[str, list[FieldEntry]],
    options: dict[str, Any],
) -> Any | None:
    """Return the best exact boolean field match unless matching is ambiguous."""
    setting_tokens = tokenize(setting_name)
    scored = score_fields(
        platform,
        setting_name,
        str(options.get("section", "")),
        field_index,
        {
            "extraTexts": tuple(str(text) for text in options.get("extraTexts", ())),
            "recommendedValue": recommended_value,
            "allowedKinds": options.get("allowedKinds"),
            "fieldKinds": {"boolean"},
            "minimumScore": 1,
        },
    )
    exact_matches = [
        entry
        for entry in scored
        if is_exact_label_match(setting_tokens, entry.field.label_tokens)
    ]
    if not exact_matches:
        return None
    exact_matches.sort(
        key=lambda entry: (
            kind_priority(entry.field.kind),
            -entry.score,
            entry.field.target,
            entry.field.field_path,
        )
    )
    best = exact_matches[0]
    next_best = exact_matches[1] if len(exact_matches) > 1 else None
    if (
        next_best is not None
        and best.field.kind == next_best.field.kind
        and best.field.label_tokens == next_best.field.label_tokens
    ):
        return None
    return best


def exact_boolean_mapping_for_match(best: Any, desired: Any) -> dict[str, Any] | None:
    """Render an exact mapping from a matched boolean field and desired value."""
    mapping = {
        "kind": best.field.kind,
        "values": value_at_path(best.field.field_path, desired),
        "match": {
            "score": best.score,
            "matchedTerms": list(best.matched_terms),
            "valueCompatibility": best.value_compatibility,
            "reason": (
                "Exact boolean mapping inferred from matching setting label and recommended "
                "state."
            ),
        },
    }
    if best.field.kind == "relution-native":
        mapping["type"] = best.field.target
    elif best.field.kind == "apple-schema-profile":
        mapping["schemaId"] = best.field.target
    elif best.field.kind == "apple-mobileconfig":
        mapping["payloadType"] = best.field.target
    else:
        return None
    return mapping


def apple_schema_analog_mappings_for(
    platform: str,
    title: str,
    recommended_value: Any,
    *,
    extra_texts: tuple[str, ...] = (),
) -> list[dict[str, Any]]:
    """Return curated Apple schema analog mappings for iOS and macOS text."""
    if platform not in {"IOS", "MACOS"}:
        return []
    haystack = normalize_search_text(
        " ".join(
            (title, *(str(text) for text in extra_texts), str(recommended_value or ""))
        )
    )
    mappings: list[dict[str, Any]] = []
    seen: set[tuple[str, tuple[tuple[str, str], ...]]] = set()

    for rule in APPLE_ANALOG_RULES:
        mapping, key = apple_analog_rule_mapping(platform, haystack, rule)
        if mapping is None or key in seen:
            continue
        seen.add(key)
        mappings.append(mapping)

    append_unique_apple_mappings(
        mappings, seen, apple_numeric_analog_mappings_for(platform, haystack)
    )
    return merge_apple_schema_mappings(mappings)


def apple_analog_rule_mapping(
    platform: str, haystack: str, rule: AppleAnalogRule
) -> tuple[dict[str, Any] | None, tuple[str, tuple[tuple[str, str], ...]]]:
    """Apply one curated Apple analog rule and return its dedupe key."""
    key = (
        rule.schema_id,
        tuple(sorted((path, stable_match_value(value)) for path, value in rule.values)),
    )
    if (
        platform not in rule.platforms
        or not phrase_groups_match(haystack, rule.required)
        or any(phrase in haystack for phrase in rule.excluded)
    ):
        return None, key
    mapping: dict[str, Any] = {
        "kind": "apple-schema-profile",
        "schemaId": rule.schema_id,
        "values": values_from_pairs(rule.values),
        "match": {
            "score": 100,
            "matchedTerms": matched_rule_terms(haystack, rule.required),
            "valueCompatibility": "curated-analog",
            "reason": rule.reason,
        },
    }
    if rule.constraints:
        mapping["constraints"] = [
            {"path": path, "operator": operator, "value": value}
            for path, operator, value in rule.constraints
        ]
    return mapping, key


def append_unique_apple_mappings(
    mappings: list[dict[str, Any]],
    seen: set[tuple[str, tuple[tuple[str, str], ...]]],
    candidates: list[dict[str, Any]],
) -> None:
    """Append Apple mappings whose schema/value key has not been seen."""
    for mapping in candidates:
        key = apple_mapping_key(mapping)
        if key in seen:
            continue
        seen.add(key)
        mappings.append(mapping)


def apple_mapping_key(
    mapping: dict[str, Any],
) -> tuple[str, tuple[tuple[str, str], ...]]:
    """Build the schema/value key used to dedupe Apple mappings."""
    return (
        str(mapping.get("schemaId", "")),
        tuple(
            sorted(
                (path, stable_match_value(value))
                for path, value in flatten_leaf_items(mapping.get("values", {}))
            )
        ),
    )


def apple_mobileconfig_candidates_for(
    platform: str,
    title: str,
    *,
    extra_texts: tuple[str, ...] = (),
    evidence_index: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Return mobileconfig candidates backed by harvested Apple evidence."""
    if platform not in {"IOS", "MACOS"}:
        return []
    haystack = normalize_search_text(
        " ".join((title, *(str(text) for text in extra_texts)))
    )
    available_payloads = set(evidence_index or load_apple_mobileconfig_evidence())
    candidates: list[dict[str, Any]] = []
    for (
        platforms,
        payload_type,
        field_paths,
        required,
        note,
    ) in APPLE_MOBILECONFIG_CANDIDATE_RULES:
        if (
            platform not in platforms
            or payload_type not in available_payloads
            or not phrase_groups_match(haystack, required)
        ):
            continue
        candidates.append(
            {
                "kind": "apple-mobileconfig",
                "target": payload_type,
                "fieldPaths": list(field_paths),
                "match": {
                    "score": 90,
                    "matchedTerms": matched_rule_terms(haystack, required),
                    "valueCompatibility": "org-specific-mobileconfig",
                    "reason": note,
                },
            }
        )
    return candidates


def android_relution_analog_mappings_for(
    platform: str,
    title: str,
    recommended_value: Any,
    *,
    extra_texts: tuple[str, ...] = (),
) -> list[dict[str, Any]]:
    """Return curated exact Android Enterprise analog mappings."""
    if platform not in {"ANDROID", "ANDROID_ENTERPRISE"}:
        return []
    haystack = normalize_search_text(
        " ".join(
            (title, *(str(text) for text in extra_texts), str(recommended_value or ""))
        )
    )
    mappings: list[dict[str, Any]] = []
    seen: set[tuple[str, tuple[tuple[str, str], ...]]] = set()

    for rule in ANDROID_ANALOG_RULES:
        if not phrase_groups_match(haystack, rule.required) or any(
            normalize_search_text(phrase) in haystack for phrase in rule.excluded
        ):
            continue
        key = (
            rule.target,
            tuple(
                sorted((path, stable_match_value(value)) for path, value in rule.values)
            ),
        )
        if key in seen:
            continue
        seen.add(key)
        mappings.append(android_relution_mapping(rule, haystack))
    return mappings


def android_relution_candidates_for(
    platform: str,
    title: str,
    *,
    extra_texts: tuple[str, ...] = (),
) -> list[dict[str, Any]]:
    """Return Android Enterprise candidate targets for organization-specific review."""
    if platform not in {"ANDROID", "ANDROID_ENTERPRISE"}:
        return []
    haystack = normalize_search_text(
        " ".join((title, *(str(text) for text in extra_texts)))
    )
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, tuple[str, ...]]] = set()
    for target, field_paths, required, note in ANDROID_CANDIDATE_RULES:
        if not phrase_groups_match(haystack, required):
            continue
        key = (target, field_paths)
        if key in seen:
            continue
        seen.add(key)
        candidates.append(
            {
                "kind": "relution-native",
                "target": target,
                "fieldPaths": list(field_paths),
                "match": {
                    "score": 80,
                    "matchedTerms": matched_rule_terms(haystack, required),
                    "valueCompatibility": "org-specific-android-enterprise",
                    "reason": note,
                },
            }
        )
    return candidates


def semantic_concepts_for(
    platform: str, evidence_sources: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Infer shared semantic concepts from normalized recommendation evidence."""
    if is_process_only_evidence(evidence_sources):
        return []

    normalized_sources = normalized_semantic_sources(evidence_sources)
    if not normalized_sources:
        return []

    all_text = " ".join(source["normalized"] for source in normalized_sources)
    concepts: list[dict[str, Any]] = []
    for rule in SEMANTIC_CONCEPT_RULES:
        if any(normalize_search_text(term) in all_text for term in rule.exclusions):
            continue
        source_matches, related_control_ids = semantic_rule_matches(
            normalized_sources, rule
        )
        if not source_matches:
            continue
        matched = unique_preserving_order(
            [
                term
                for source in source_matches
                for term in source["matchedTerms"]
                if isinstance(term, str)
            ]
        )
        confidence = max(float(source["confidence"]) for source in source_matches)
        candidate_targets = semantic_candidate_targets_for(platform, rule)
        concepts.append(
            {
                "id": rule.concept_id,
                "label": {"de": rule.label_de, "en": rule.label_en},
                "matchedTerms": matched,
                "evidence": source_matches,
                "confidence": round(confidence, 2),
                "relatedGrundschutzPlusPlusControlIds": unique_preserving_order(
                    related_control_ids
                ),
                "candidateTargets": candidate_targets,
            }
        )

    concepts.sort(key=semantic_concept_sort_key)
    return concepts


def semantic_rule_matches(
    normalized_sources: list[dict[str, Any]], rule: SemanticConceptRule
) -> tuple[list[dict[str, Any]], list[str]]:
    """Collect evidence sources that satisfy one semantic concept rule."""
    source_matches: list[dict[str, Any]] = []
    pending_gs_text_matches: list[tuple[dict[str, Any], list[str]]] = []
    related_control_ids: list[str] = []
    for source in normalized_sources:
        match = semantic_source_match(source, rule)
        if match is None:
            continue
        if match["pending"]:
            pending_gs_text_matches.append((source, match["matchedTerms"]))
            continue
        if match["gsControlMatch"]:
            related_control_ids.append(str(source.get("gsControlId", "")))
        source_matches.append(
            semantic_source_evidence(
                source, match["matchedTerms"], match["gsControlMatch"]
            )
        )
    if source_matches and any(
        source["source"] != "grundschutz-plusplus-control" for source in source_matches
    ):
        source_matches.extend(
            semantic_source_evidence(source, matched_terms, False)
            for source, matched_terms in pending_gs_text_matches
        )
    return source_matches, related_control_ids


def semantic_source_match(
    source: dict[str, Any], rule: SemanticConceptRule
) -> dict[str, Any] | None:
    """Match one normalized evidence source against a semantic rule."""
    matched_terms = matched_semantic_terms(source["normalized"], rule.terms)
    gs_control_id = source.get("gsControlId")
    gs_control_match = (
        isinstance(gs_control_id, str) and gs_control_id in rule.gs_controls
    )
    if not matched_terms and not gs_control_match:
        return None
    return {
        "matchedTerms": matched_terms or [gs_control_id],
        "pending": source["source"] == "grundschutz-plusplus-control"
        and not gs_control_match,
        "gsControlMatch": gs_control_match,
    }


def semantic_source_evidence(
    source: dict[str, Any], matched_terms: list[str], gs_control_match: bool
) -> dict[str, Any]:
    """Render one semantic evidence record with confidence and excerpt."""
    gs_control_id = source.get("gsControlId")
    return {
        "source": source["source"],
        **({"sourceId": source["sourceId"]} if source.get("sourceId") else {}),
        **(
            {"gsControlId": gs_control_id}
            if isinstance(gs_control_id, str) and gs_control_id
            else {}
        ),
        **({"modalVerb": source["modalVerb"]} if source.get("modalVerb") else {}),
        **(
            {"securityLevel": source["securityLevel"]}
            if source.get("securityLevel")
            else {}
        ),
        "matchedTerms": matched_terms,
        "confidence": semantic_source_confidence(
            source, matched_terms, gs_control_match
        ),
        "excerpt": shorten_text(source["text"], 260),
    }


def semantic_candidates_for(
    platform: str, concepts: list[dict[str, Any]], *, limit: int = 12
) -> list[dict[str, Any]]:
    """Build review candidates from semantic concepts for one platform."""
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, str, tuple[str, ...]]] = set()
    for concept in concepts:
        for target in concept.get("candidateTargets", []):
            if not isinstance(target, dict) or target.get("platform") != platform:
                continue
            field_paths = tuple(
                str(path)
                for path in target.get("fieldPaths", [])
                if isinstance(path, str)
            )
            candidate = {
                "kind": str(target.get("kind", "")),
                "target": str(target.get("target", "")),
                "fieldPaths": list(field_paths),
                "semanticConceptId": str(concept.get("id", "")),
                "match": {
                    "score": int(round(float(concept.get("confidence", 0.0)) * 100)),
                    "matchedTerms": [
                        str(term)
                        for term in concept.get("matchedTerms", [])
                        if isinstance(term, str)
                    ],
                    "valueCompatibility": "concept-candidate",
                    "reason": f"{BSI_CONCEPT_MATCH_REASON}: {target.get('reason', '')}",
                },
            }
            key = candidate_key(candidate)
            if key in seen:
                continue
            seen.add(key)
            candidates.append(candidate)
    concept_order = {
        str(concept.get("id", "")): index for index, concept in enumerate(concepts)
    }
    candidates.sort(
        key=lambda candidate: semantic_candidate_sort_key(candidate, concept_order)
    )
    return candidates[:limit]


def semantic_concepts_for_field(
    platform: str, field: FieldEntry
) -> list[dict[str, Any]]:
    """Infer semantic concepts represented by a Relution or Apple field."""
    source = (
        "apple-schema-field"
        if field.kind == "apple-schema-profile"
        else "relution-field"
    )
    text_parts = [
        field.target,
        field.field_path,
        field.label,
        field.field_kind,
        " ".join(field.enum_values),
    ]
    return semantic_concepts_for(
        platform,
        [
            {
                "source": source,
                "sourceId": f"{field.kind}:{field.target}:{field.field_path}",
                "text": " ".join(part for part in text_parts if part),
                "confidence": 0.72,
            }
        ],
    )


def semantic_no_concept_reason(evidence_sources: list[dict[str, Any]]) -> str:
    """Explain why no semantic concept was emitted for evidence sources."""
    if is_process_only_evidence(evidence_sources):
        return (
            "Process-only physical, power, or emergency-planning wording; no concrete "
            "Relution policy candidate was emitted by the semantic layer."
        )
    return "No curated shared security concept matched the available evidence."


def semantic_metadata_for(
    evidence_sources: list[dict[str, Any]], semantic_concepts: list[dict[str, Any]]
) -> dict[str, Any]:
    """Build semantic metadata for matched or unmatched evidence sources."""
    if semantic_concepts:
        return {"semanticConcepts": semantic_concepts}
    return {"semanticNoConceptReason": semantic_no_concept_reason(evidence_sources)}


def semantic_evidence_source_records(
    recommendation_id: str,
    sources: list[tuple[str, str, float]],
    has_text: Callable[[str], bool],
) -> list[dict[str, Any]]:
    """Build normalized semantic evidence records from source text tuples."""
    return [
        {
            "source": source,
            "sourceId": recommendation_id,
            "text": text,
            "confidence": confidence,
        }
        for source, text, confidence in sources
        if has_text(text)
    ]


def is_process_only_evidence(evidence_sources: list[dict[str, Any]]) -> bool:
    """Detect recommendations whose wording is process-only, not policy-mappable."""
    for source in evidence_sources:
        if source.get("source") in {"bsi-title", "cis-title"}:
            title = normalize_search_text(str(source.get("text", "")))
            return any(
                normalize_search_text(term) in title
                for term in PROCESS_ONLY_TITLE_TERMS
            )
    return False


def semantic_concept_sort_key(concept: dict[str, Any]) -> tuple[int, int, float, str]:
    """Sort concepts by actionability, evidence source quality, and confidence."""
    concept_id = str(concept.get("id", ""))
    return (
        1 if concept_id in MANAGEMENT_SUPPORT_CONCEPT_IDS else 0,
        semantic_concept_source_rank(concept),
        -float(concept.get("confidence", 0.0)),
        concept_id,
    )


def semantic_concept_source_rank(concept: dict[str, Any]) -> int:
    """Rank the strongest evidence-source family attached to a concept."""
    evidence = concept.get("evidence", [])
    sources = {
        str(entry.get("source", "")) for entry in evidence if isinstance(entry, dict)
    }
    if sources.intersection(DIRECT_SEMANTIC_SOURCES):
        return 0
    if sources.intersection(RELATED_SEMANTIC_SOURCES):
        return 1
    if sources.intersection(GS_PLUSPLUS_SEMANTIC_SOURCES):
        return 2
    return 3


def semantic_candidate_sort_key(
    candidate: dict[str, Any], concept_order: dict[str, int]
) -> tuple[int, int, int, str, str]:
    """Sort semantic candidates by concept order, score, kind, and target."""
    concept_id = str(candidate.get("semanticConceptId", ""))
    match = candidate.get("match", {})
    score = int(match.get("score", 0)) if isinstance(match, dict) else 0
    return (
        1 if concept_id in MANAGEMENT_SUPPORT_CONCEPT_IDS else 0,
        concept_order.get(concept_id, 999),
        -score,
        str(candidate.get("kind", "")),
        str(candidate.get("target", "")),
    )


def normalized_semantic_sources(
    evidence_sources: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Normalize semantic evidence text and preserve source metadata."""
    normalized_sources: list[dict[str, Any]] = []
    for source in evidence_sources:
        text = str(source.get("text", ""))
        normalized = normalize_search_text(text)
        if not normalized:
            continue
        normalized_sources.append(
            {
                "source": str(source.get("source", "unknown")),
                "sourceId": str(source.get("sourceId", "")),
                "gsControlId": str(source.get("gsControlId", "")),
                "modalVerb": str(source.get("modalVerb", "")),
                "securityLevel": str(source.get("securityLevel", "")),
                "confidence": float(source.get("confidence", 0.7)),
                "text": text,
                "normalized": normalized,
            }
        )
    return normalized_sources


def matched_semantic_terms(haystack: str, terms: tuple[str, ...]) -> list[str]:
    """Return unique normalized semantic terms contained in the haystack."""
    matched = []
    for term in terms:
        normalized = normalize_search_text(term)
        if normalized and normalized in haystack:
            matched.append(normalized)
    return unique_preserving_order(matched)


def semantic_source_confidence(
    source: dict[str, Any], matched_terms: list[str], gs_control_match: bool
) -> float:
    """Score semantic evidence from base confidence, terms, controls, and modal verbs."""
    confidence = float(source.get("confidence", 0.7))
    if len(matched_terms) >= 2:
        confidence += 0.05
    if gs_control_match:
        confidence += 0.08
    if source.get("modalVerb") == "MUSS":
        confidence += 0.05
    elif source.get("modalVerb") == "SOLLTE":
        confidence += 0.03
    if normalize_search_text(str(source.get("securityLevel", ""))) == "erhoeht":
        confidence += 0.04
    return min(confidence, 0.99)


def semantic_candidate_targets_for(
    platform: str, rule: SemanticConceptRule
) -> list[dict[str, Any]]:
    """Return semantic rule targets applicable to one platform."""
    targets = []
    for target in rule.targets:
        if platform not in target.platforms:
            continue
        targets.append(
            {
                "platform": platform,
                "kind": target.kind,
                "target": target.target,
                "fieldPaths": list(target.field_paths),
                "reason": target.note,
            }
        )
    return targets


def shorten_text(value: str, limit: int) -> str:
    """Compact text to a bounded excerpt with ellipsis truncation."""
    compact = re.sub(r"\s+", " ", value).strip()
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 3].rstrip()}..."


def android_relution_mapping(rule: AndroidAnalogRule, haystack: str) -> dict[str, Any]:
    """Render an exact Android Relution mapping from a curated analog rule."""
    mapping: dict[str, Any] = {
        "kind": "relution-native",
        "type": rule.target,
        "values": values_from_pairs(rule.values),
        "match": {
            "score": 100,
            "matchedTerms": matched_rule_terms(haystack, rule.required),
            "valueCompatibility": "curated-android-analog",
            "reason": rule.reason,
        },
    }
    if rule.constraints:
        mapping["constraints"] = [
            {"path": path, "operator": operator, "value": value}
            for path, operator, value in rule.constraints
        ]
    return mapping


def load_apple_mobileconfig_evidence(
    evidence_path: Path = APPLE_MOBILECONFIG_EVIDENCE_PATH,
) -> dict[str, dict[str, Any]]:
    """Load harvested mobileconfig-backed Apple payload evidence by payload type."""
    if not evidence_path.exists():
        return {}
    evidence = read_json(evidence_path)
    settings = evidence.get("settings", []) if isinstance(evidence, dict) else []
    loaded: dict[str, dict[str, Any]] = {}
    for setting in settings:
        if (
            not isinstance(setting, dict)
            or setting.get("status") != "mobileconfig-backed"
        ):
            continue
        payload_type = setting.get("payloadType")
        if isinstance(payload_type, str) and payload_type:
            loaded[payload_type] = setting
    return loaded


def apple_numeric_analog_mappings_for(
    platform: str, haystack: str
) -> list[dict[str, Any]]:
    """Return numeric Apple analog mappings for supported Apple platforms."""
    mappings: list[dict[str, Any]] = []
    if platform == "IOS":
        mappings.extend(ios_numeric_analog_mappings(haystack))
    if platform == "MACOS":
        mappings.extend(macos_numeric_analog_mappings(haystack))
    return mappings


def ios_numeric_analog_mappings(haystack: str) -> list[dict[str, Any]]:
    """Infer iOS passcode numeric analog mappings from normalized text."""
    mappings: list[dict[str, Any]] = []
    if "require alphanumeric value" in haystack and "enabled" in haystack:
        mappings.append(
            apple_schema_mapping(
                APPLE_PASSCODE,
                {"requireAlphanumeric": True},
                ("requireAlphanumeric",),
                reason="Curated Apple passcode analog matched alphanumeric requirement.",
            )
        )
    if (
        "minimum passcode length" in haystack or "minimum password length" in haystack
    ) and (minimum := first_int(haystack)) is not None:
        mappings.append(
            apple_schema_mapping(
                APPLE_PASSCODE,
                {"minLength": minimum},
                ("minLength",),
                constraints=(("minLength", "atLeast", minimum),),
                reason="Curated Apple passcode analog matched minimum length requirement.",
            )
        )
    if (
        "maximum auto-lock" in haystack
        or "maximum minutes of inactivity until screen locks" in haystack
    ) and (maximum := first_int(haystack)) is not None:
        mappings.append(
            apple_schema_mapping(
                APPLE_PASSCODE,
                {"maxInactivity": maximum},
                ("maxInactivity",),
                constraints=(("maxInactivity", "atMost", maximum),),
                reason="Curated Apple passcode analog matched auto-lock maximum requirement.",
            )
        )
    if "maximum grace period for device lock" in haystack and "immediately" in haystack:
        mappings.append(
            apple_schema_mapping(
                APPLE_PASSCODE,
                {"maxGracePeriod": 0},
                ("maxGracePeriod",),
                reason="Curated Apple passcode analog matched immediate device-lock grace period.",
            )
        )
    if (
        "maximum number of failed attempts" in haystack
        and (attempts := first_int(haystack)) is not None
    ):
        mappings.append(
            apple_schema_mapping(
                APPLE_PASSCODE,
                {"maxFailedAttempts": attempts},
                ("maxFailedAttempts",),
                reason="Curated Apple passcode analog matched failed-attempt limit.",
            )
        )
    return mappings


def macos_numeric_analog_mappings(haystack: str) -> list[dict[str, Any]]:
    """Infer macOS screen-saver numeric analog mappings from normalized text."""
    mappings: list[dict[str, Any]] = []
    if (
        "inactivity interval" in haystack
        and "screen saver" in haystack
        and (minutes := first_int(haystack)) is not None
    ):
        seconds = minutes * 60
        mappings.append(
            apple_schema_mapping(
                APPLE_SCREEN_SAVER,
                {"idleTime": seconds},
                ("idleTime",),
                constraints=(("idleTime", "atMost", seconds),),
                reason="Curated Apple screen-saver analog matched inactivity interval requirement.",
            )
        )
    if (
        "require password after screen saver begins" in haystack
        or "display is turned off" in haystack
    ):
        delay = 0 if "immediately" in haystack else first_int(haystack)
        if delay is not None:
            mappings.append(
                apple_schema_mapping(
                    APPLE_SCREEN_SAVER,
                    {"askForPassword": True, "askForPasswordDelay": delay},
                    ("askForPassword", "askForPasswordDelay"),
                    constraints=(("askForPasswordDelay", "atMost", delay),),
                    reason=(
                        "Curated Apple screen-saver analog matched password-after-saver "
                        "requirement."
                    ),
                )
            )
    return mappings
