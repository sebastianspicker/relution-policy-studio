"""Cohesive implementation stage 1 for semantic_review_candidates."""

from typing import Any
from .ruleset_semantic_targets import candidate_target_specs

def ranked_review_candidates(
    recommendation: dict[str, Any],
    tokens: list[str],
    semantic_ids: list[str],
    nearest_references: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return the strongest unique generated and reference-backed review candidates."""
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, str, tuple[str, ...]]] = set()
    for candidate in candidate_target_specs(recommendation):
        key = (
            str(candidate["kind"]),
            str(candidate["target"]),
            tuple(str(path) for path in candidate.get("fieldPaths", [])),
        )
        if key in seen:
            continue
        seen.add(key)
        candidates.append(
            review_candidate_from_spec(
                candidate, tokens, semantic_ids, nearest_references, "current-candidate"
            )
        )
    for reference in nearest_references:
        mapping = reference.get("mapping", {})
        if not isinstance(mapping, dict):
            continue
        field_paths = [
            str(path) for path in mapping.get("fieldPaths", []) if isinstance(path, str)
        ]
        key = (
            str(mapping.get("kind", "")),
            str(mapping.get("target", "")),
            tuple(field_paths),
        )
        if key in seen:
            continue
        seen.add(key)
        candidates.append(
            review_candidate_from_spec(
                {
                    "kind": key[0],
                    "target": key[1],
                    "fieldPaths": field_paths,
                    "semanticConceptId": next(
                        iter(
                            set(semantic_ids)
                            & set(reference.get("semanticConceptIds", []))
                        ),
                        "",
                    ),
                },
                tokens,
                semantic_ids,
                [reference],
                "nearest-exact-reference",
            )
        )
    candidates.sort(
        key=lambda candidate: (
            -int(candidate["score"]),
            candidate["kind"],
            candidate["target"],
            candidate["fieldPaths"],
        )
    )
    return candidates[:8]

def review_candidate_from_spec(
    spec: dict[str, Any],
    tokens: list[str],
    semantic_ids: list[str],
    references: list[dict[str, Any]],
    provenance: str,
) -> dict[str, Any]:
    """Build the review row that explains a candidate target and its evidence."""
    from .semantic_candidate_similarity import candidate_reference_ids, candidate_score_breakdown, candidate_shared_concepts, candidate_shared_tokens
    from .semantic_reference_matching import reference_candidate_overlap
    from .semantic_review_analysis import candidate_setting_meaning
    from .semantic_review_decisions import candidate_review_decision, candidate_semantic_concept_id
    reference_ids = candidate_reference_ids(spec, references)
    shared_concepts = candidate_shared_concepts(references, semantic_ids)
    own_concept = candidate_semantic_concept_id(spec, semantic_ids)
    if (
        own_concept
        and own_concept in semantic_ids
        and own_concept not in shared_concepts
    ):
        shared_concepts = [own_concept, *shared_concepts]
    shared_tokens = candidate_shared_tokens(references, tokens)
    target_overlap = max(
        [reference_candidate_overlap(spec, reference) for reference in references]
        or [0]
    )
    score_breakdown = candidate_score_breakdown(
        shared_concepts, shared_tokens, target_overlap, provenance
    )
    score = sum(score_breakdown.values())
    match = spec.get("match") if isinstance(spec.get("match"), dict) else {}
    semantic_concept_id = candidate_semantic_concept_id(spec, semantic_ids)
    value_compatibility = str(
        match.get(
            "valueCompatibility",
            "reference-candidate" if provenance != "current-candidate" else "unknown",
        )
    )
    return {
        "kind": str(spec.get("kind", "")),
        "target": str(spec.get("target", "")),
        "fieldPaths": [
            str(path) for path in spec.get("fieldPaths", []) if isinstance(path, str)
        ],
        "semanticConceptId": semantic_concept_id,
        "provenance": provenance,
        "score": score,
        "scoreBreakdown": score_breakdown,
        "sharedSemanticConceptIds": shared_concepts,
        "sharedTokens": shared_tokens[:12],
        "referenceMappingIds": reference_ids[:5],
        "valueCompatibility": value_compatibility,
        "reason": str(
            match.get(
                "reason",
                "Candidate derived from nearest exact mapping reference."
                if provenance != "current-candidate"
                else "Existing generated candidate.",
            )
        ),
        "settingMeaning": candidate_setting_meaning(
            spec, shared_concepts, shared_tokens, provenance
        ),
        "decision": candidate_review_decision(
            provenance,
            value_compatibility,
            shared_concepts,
            reference_ids,
            target_overlap,
        ),
    }
