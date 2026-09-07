"""Semantic Matching helpers for recommendation mapping."""

from typing import Any
from ._mapping_models import SemanticConceptRule

from .candidate_inference_semantic_sources import (
    matched_semantic_terms,
)
from .candidate_inference_semantic_evidence import semantic_source_evidence

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
