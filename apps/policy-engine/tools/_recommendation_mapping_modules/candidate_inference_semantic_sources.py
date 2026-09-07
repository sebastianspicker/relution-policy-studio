"""Semantic Sources helpers for recommendation mapping."""

from typing import Any
from ._semantic_matching_metadata import PROCESS_ONLY_TITLE_TERMS
from .field_matching_text import normalize_search_text
import re
from ._mapping_lexical_constants import unique_preserving_order

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
def shorten_text(value: str, limit: int) -> str:
    """Compact text to a bounded excerpt with ellipsis truncation."""
    compact = re.sub(r"\s+", " ", value).strip()
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 3].rstrip()}..."
