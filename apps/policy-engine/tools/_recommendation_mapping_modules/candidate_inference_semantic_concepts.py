"""Semantic Concepts helpers for recommendation mapping."""

from typing import Any
from .semantic_concept_catalog import SEMANTIC_CONCEPT_RULES
from .field_matching_text import normalize_search_text
from ._mapping_lexical_constants import unique_preserving_order

from .candidate_inference_semantic_candidates import (
    semantic_candidate_targets_for,
)

from .candidate_inference_semantic_matching import (
    semantic_rule_matches,
)

from .candidate_inference_semantic_ranking import (
    semantic_concept_sort_key,
)

from .candidate_inference_semantic_sources import (
    is_process_only_evidence,
    normalized_semantic_sources,
)

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
