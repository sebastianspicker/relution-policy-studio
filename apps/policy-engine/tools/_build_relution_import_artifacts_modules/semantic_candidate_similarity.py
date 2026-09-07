"""Cohesive implementation stage 2 for semantic_review_candidates."""

from typing import Any
from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order

def candidate_reference_ids(
    spec: dict[str, Any], references: list[dict[str, Any]]
) -> list[str]:
    """Return exact-reference mapping ids whose target fields overlap the candidate."""
    from .semantic_reference_matching import reference_candidate_overlap
    return [
        str(reference["mappingId"])
        for reference in references
        if reference_candidate_overlap(spec, reference) > 0
    ]

def candidate_shared_concepts(
    references: list[dict[str, Any]], semantic_ids: list[str]
) -> list[str]:
    """Return semantic concept ids shared by the recommendation and references."""
    return unique_preserving_order(
        [
            concept_id
            for reference in references
            for concept_id in reference.get("semanticConceptIds", [])
            if isinstance(concept_id, str) and concept_id in semantic_ids
        ]
    )

def candidate_shared_tokens(
    references: list[dict[str, Any]], tokens: list[str]
) -> list[str]:
    """Return normalized bilingual tokens shared by the recommendation and references."""
    return unique_preserving_order(
        [
            token
            for reference in references
            for token in reference.get("normalizedTokens", [])
            if isinstance(token, str) and token in tokens
        ]
    )

def candidate_score_breakdown(
    shared_concepts: list[str],
    shared_tokens: list[str],
    target_overlap: int,
    provenance: str,
) -> dict[str, int]:
    """Score candidate confidence from semantic, token, target, and provenance evidence."""
    return {
        "semanticConcept": min(40, len(shared_concepts) * 40),
        "bilingualToken": min(30, len(shared_tokens) * 3),
        "targetReference": target_overlap,
        "valueCompatibility": 0 if provenance == "current-candidate" else 10,
    }
