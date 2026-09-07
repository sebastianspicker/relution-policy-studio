"""Cohesive implementation stage 6 for semantic_review_candidates."""

from typing import Any
from _recommendation_mapping_modules.field_matching_tokens import tokenize

def recommendation_source_text(source: str, recommendation: dict[str, Any]) -> str:
    """Extract source-specific text fields used for semantic tokenization."""
    keys_by_source = {
        "bsi": ("title", "requirementText", "reason", "category", "moduleTitle"),
        "cis": (
            "title",
            "description",
            "rationale",
            "audit",
            "remediation",
            "defaultValue",
            "recommendedValue",
        ),
        "vendor": ("title", "section", "reason", "recommendedValue"),
    }
    values: list[str] = []
    for key in keys_by_source.get(source, ("title", "reason")):
        value = recommendation.get(key)
        if isinstance(value, str) and value:
            values.append(value)
    return "\n".join(values)

def bilingual_tokens(source_text: str, recommendation: dict[str, Any]) -> list[str]:
    """Tokenize source text together with localized semantic concept labels."""
    concept_labels = [
        str(label)
        for concept in recommendation_semantic_concepts(recommendation)
        for label in (
            concept.get("label", {}) if isinstance(concept.get("label"), dict) else {}
        ).values()
        if isinstance(label, str)
    ]
    return sorted(tokenize(source_text, *concept_labels))

def recommendation_semantic_concepts(
    recommendation: dict[str, Any],
) -> list[dict[str, Any]]:
    """Return well-formed semantic concept records attached to a recommendation."""
    return [
        concept
        for concept in recommendation.get("semanticConcepts", [])
        if isinstance(concept, dict) and isinstance(concept.get("id"), str)
    ]

def detect_mapping_language(text: str) -> str:
    """Classify mapping text as German, English, mixed, or unknown."""
    normalized = text.lower()
    german_markers = (
        " muss ",
        " sollte ",
        " sollen ",
        " benutz",
        " gerät",
        " geraet",
        " richtlinie",
        " schutz",
        "ä",
        "ö",
        "ü",
        "ß",
    )
    english_markers = (
        " ensure ",
        " enabled",
        " disabled",
        " set to ",
        " require ",
        " block ",
        " allow ",
    )
    has_german = any(marker in f" {normalized} " for marker in german_markers)
    has_english = any(marker in f" {normalized} " for marker in english_markers)
    if has_german and has_english:
        return "mixed"
    if has_german:
        return "de"
    if has_english:
        return "en"
    return "unknown"
