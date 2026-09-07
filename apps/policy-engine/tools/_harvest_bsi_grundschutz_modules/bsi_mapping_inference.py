"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from typing import Any

from _recommendation_mapping_modules.candidate_inference_android import (
    android_relution_analog_mappings_for,
    android_relution_candidates_for,
)
from _recommendation_mapping_modules.candidate_inference_apple_analog import (
    apple_schema_analog_mappings_for,
)
from _recommendation_mapping_modules.candidate_inference_apple_mobileconfig import (
    apple_mobileconfig_candidates_for,
)
from _recommendation_mapping_modules.candidate_inference_index import mapping_candidates

def bsi_inferred_mapping_parts(
    platform: str,
    requirement: dict[str, Any],
    field_index: dict[str, list[Any]],
    apple_mobileconfig_evidence: dict[str, dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Infer candidate and analog mapping evidence for an active BSI requirement."""
    empty = {
        "inferredCandidates": [],
        "androidExactMappings": [],
        "androidCandidates": [],
        "appleExactMappings": [],
        "appleMobileconfigCandidates": [],
    }
    if requirement.get("status") == "retired":
        return empty
    title = str(requirement.get("title", ""))
    extra_texts = (
        str(requirement.get("requirementText", "")),
        str(requirement.get("category", "")),
    )
    return {
        "inferredCandidates": mapping_candidates(
            platform,
            title,
            str(requirement.get("category", "")),
            field_index,
            {"extraTexts": (extra_texts[0],), "limit": 5},
        ),
        "androidExactMappings": android_relution_analog_mappings_for(
            platform, title, None
        ),
        "androidCandidates": android_relution_candidates_for(
            platform, title, extra_texts=extra_texts
        ),
        "appleExactMappings": apple_schema_analog_mappings_for(
            platform, title, None, extra_texts=extra_texts
        ),
        "appleMobileconfigCandidates": apple_mobileconfig_candidates_for(
            platform,
            title,
            extra_texts=extra_texts,
            evidence_index=apple_mobileconfig_evidence,
        ),
    }
