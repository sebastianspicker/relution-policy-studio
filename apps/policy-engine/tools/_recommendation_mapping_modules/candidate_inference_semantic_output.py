"""Semantic Output helpers for recommendation mapping."""

from typing import Any
from collections.abc import Callable
from ._mapping_models import FieldEntry

from .candidate_inference_semantic_sources import (
    is_process_only_evidence,
)

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
    from .candidate_inference_semantic_concepts import semantic_concepts_for

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
