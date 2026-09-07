"""Semantic evidence rendering for recommendation mapping."""

from typing import Any
from .candidate_inference_semantic_sources import semantic_source_confidence, shorten_text


def semantic_source_evidence(
    source: dict[str, Any], matched_terms: list[str], gs_control_match: bool
) -> dict[str, Any]:
    """Render one semantic evidence record with confidence and excerpt."""
    gs_control_id = source.get("gsControlId")
    return {
        "source": source["source"],
        **({"sourceId": source["sourceId"]} if source.get("sourceId") else {}),
        **({"gsControlId": gs_control_id} if isinstance(gs_control_id, str) and gs_control_id else {}),
        **({"modalVerb": source["modalVerb"]} if source.get("modalVerb") else {}),
        **({"securityLevel": source["securityLevel"]} if source.get("securityLevel") else {}),
        "matchedTerms": matched_terms,
        "confidence": semantic_source_confidence(source, matched_terms, gs_control_match),
        "excerpt": shorten_text(source["text"], 260),
    }
