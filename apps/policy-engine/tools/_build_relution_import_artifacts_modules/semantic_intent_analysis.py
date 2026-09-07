"""Cohesive implementation stage 7 for semantic_review_candidates."""

from typing import Any
from .mapping_exact_targets import exact_mappings

def extracted_mapping_intent(
    source: str, recommendation: dict[str, Any], source_text: str
) -> dict[str, Any]:
    """Extract review-facing action, value, section, and local-parameter signals."""
    return {
        "action": extracted_action(source_text),
        "recommendedValue": recommendation.get("recommendedValue"),
        "hasConcreteValue": recommendation.get("recommendedValue") is not None
        or bool(exact_mappings(recommendation)),
        "sourceSections": source_intent_sections(source, recommendation),
        "localParameterLikely": local_parameter_likely(source_text),
    }

def extracted_action(text: str) -> str:
    """Infer the broad policy action requested by recommendation text."""
    normalized = text.lower()
    if any(
        term in normalized
        for term in (
            "disable",
            "disabled",
            "block",
            "prevent",
            "deaktiv",
            "verhindern",
            "verbieten",
        )
    ):
        return "restrict"
    if any(
        term in normalized
        for term in (
            "enable",
            "enabled",
            "enforce",
            "require",
            "aktiv",
            "erzwingen",
            "muss",
        )
    ):
        return "enforce"
    if any(term in normalized for term in ("audit", "verify", "überprüf", "pruef")):
        return "verify"
    return "unspecified"

def source_intent_sections(source: str, recommendation: dict[str, Any]) -> list[str]:
    """List populated source fields that contributed to extracted intent."""
    sections = {
        "bsi": ("title", "requirementText", "reason"),
        "cis": (
            "title",
            "description",
            "rationale",
            "audit",
            "remediation",
            "recommendedValue",
        ),
        "vendor": ("title", "section", "reason", "recommendedValue"),
    }.get(source, ("title",))
    return [
        key
        for key in sections
        if isinstance(recommendation.get(key), str) and str(recommendation.get(key))
    ]

def local_parameter_likely(text: str) -> bool:
    """Return whether text likely depends on organization-local values."""
    normalized = text.lower()
    return any(
        term in normalized
        for term in (
            "ssid",
            "vpn",
            "certificate",
            "zertifikat",
            "server",
            "gateway",
            "app id",
            "bundle id",
            "organization",
            "institution",
        )
    )

def suggested_review_action(
    current_status: str,
    ranked_candidates: list[dict[str, Any]],
    nearest_references: list[dict[str, Any]],
) -> str:
    """Choose the next manual review action for the current mapping status."""
    if current_status == "parameterized":
        return "supply-local-parameters"
    if ranked_candidates and int(ranked_candidates[0]["score"]) >= 70:
        return "review-near-exact-reference"
    if nearest_references:
        return "review-partial-candidates"
    return "confirm-gap-or-helper"
