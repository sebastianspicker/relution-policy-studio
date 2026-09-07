"""Curated Android and macOS vendor recommendation mapping."""

from __future__ import annotations

from typing import Any

from _recommendation_mapping_modules.candidate_inference_android import android_relution_analog_mappings_for, android_relution_candidates_for
from _recommendation_mapping_modules.candidate_inference_index import mapping_candidates as shared_mapping_candidates
from _recommendation_mapping_modules.candidate_inference_semantic_candidates import semantic_candidates_for
from _recommendation_mapping_modules.candidate_inference_semantic_concepts import semantic_concepts_for
from _recommendation_mapping_modules.candidate_inference_semantic_output import semantic_metadata_for
from _recommendation_mapping_modules.field_matching_candidates import candidate_from_mapping

from _harvest_vendor_guidance_modules.common import merge_candidate_lists
from _harvest_vendor_guidance_modules.vendor_mapping_semantic import (
    vendor_relution_mapping,
    vendor_semantic_evidence_sources_for,
)
from _harvest_vendor_guidance_modules.vendor_mapping_text import compact_slug


def build_recommendations(
    field_index: dict[str, list[dict[str, Any]]],
    curated_platform_guidance: list[dict[str, Any]],
    windows_baseline_path: object,
    windows_rexp_evidence_path: object,
    read_json: object,
    workbook_help_by_title: object,
    build_windows_recommendation: object,
    load_windows_custom_csp_evidence: object,
) -> list[dict[str, Any]]:
    """Build curated Android/macOS and Windows vendor recommendations."""

    recommendations: list[dict[str, Any]] = []
    platform_counters = {"ANDROID": 0, "MACOS": 0}
    for guidance in curated_platform_guidance:
        platform = str(guidance["platform"])
        platform_counters[platform] += 1
        recommendations.append(
            build_curated_recommendation(
                guidance, platform_counters[platform], field_index
            )
        )
    help_by_title = workbook_help_by_title()
    windows_rexp_evidence = load_windows_custom_csp_evidence(windows_rexp_evidence_path)
    for index, row in enumerate(read_json(windows_baseline_path), start=1):
        recommendations.append(
            build_windows_recommendation(
                index, row, help_by_title, field_index, windows_rexp_evidence
            )
        )
    return recommendations


def build_curated_recommendation(
    guidance: dict[str, Any], index: int, field_index: dict[str, list[dict[str, Any]]]
) -> dict[str, Any]:
    """Convert one curated vendor guidance row into a normalized recommendation."""

    platform = str(guidance["platform"])
    recommendation_id = (
        f"{platform.lower()}-{index:03d}-{compact_slug(str(guidance['title']))}"
    )
    semantic_context = vendor_semantic_context(recommendation_id, platform, guidance)
    mapping_context = curated_mapping_context(
        platform, guidance, field_index, semantic_context["semanticCandidates"]
    )
    return {
        "id": recommendation_id,
        "platform": platform,
        "sourceIds": list(guidance["sourceIds"]),
        "title": guidance["title"],
        "section": guidance["section"],
        "recommendedValue": guidance["recommendedValue"],
        "reason": guidance["reason"],
        "reasonSource": guidance["reasonSource"],
        "vendor": {"guidanceModel": "equivalent-vendor-guidance-stack"},
        "relutionMapping": vendor_relution_mapping(
            mapping_context["rulesetMappings"],
            mapping_context["matchedCandidates"],
            semantic_context["semanticCandidates"],
            mapping_context["candidates"],
        ),
        **semantic_context["semanticMetadata"],
    }


def vendor_semantic_context(
    recommendation_id: str, platform: str, guidance: dict[str, Any]
) -> dict[str, Any]:
    """Build semantic candidates and metadata for a curated vendor row."""

    semantic_evidence_sources = vendor_semantic_evidence_sources_for(
        recommendation_id,
        {
            "platform": platform,
            "title": str(guidance["title"]),
            "section": str(guidance["section"]),
            "reason": str(guidance["reason"]),
            "recommendedValue": guidance["recommendedValue"],
        },
    )
    semantic_concepts = semantic_concepts_for(platform, semantic_evidence_sources)
    return {
        "semanticCandidates": semantic_candidates_for(platform, semantic_concepts),
        "semanticMetadata": semantic_metadata_for(
            semantic_evidence_sources, semantic_concepts
        ),
    }


def curated_mapping_context(
    platform: str,
    guidance: dict[str, Any],
    field_index: dict[str, list[dict[str, Any]]],
    semantic_candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    """Resolve exact, analog, and semantic mapping candidates for guidance."""

    mapping = guidance.get("mapping")
    analog_mappings = vendor_analog_mappings(platform, guidance, mapping)
    exact_mapping = vendor_exact_mapping(mapping, analog_mappings)
    candidates = shared_mapping_candidates(
        platform,
        str(guidance["title"]),
        str(guidance["section"]),
        field_index,
        {
            "exactMapping": exact_mapping,
            "recommendedValue": guidance["recommendedValue"],
            "extraTexts": (str(guidance["reason"]),),
            "allowedKinds": {"relution-native"},
        },
    )
    matched_candidates = merge_candidate_lists(
        [candidate_from_mapping(entry) for entry in analog_mappings],
        [
            *candidates,
            *android_relution_candidates_for(
                platform, str(guidance["title"]), extra_texts=(str(guidance["reason"]),)
            ),
        ],
    )
    return {
        "matchedCandidates": matched_candidates,
        "candidates": merge_candidate_lists(matched_candidates, semantic_candidates),
        "rulesetMappings": vendor_ruleset_mappings(mapping, analog_mappings),
    }


def vendor_analog_mappings(
    platform: str, guidance: dict[str, Any], mapping: Any
) -> list[dict[str, Any]]:
    """Return Android analog mappings when no exact curated tuple is present."""

    if isinstance(mapping, tuple):
        return []
    return android_relution_analog_mappings_for(
        platform,
        str(guidance["title"]),
        guidance["recommendedValue"],
    )


def vendor_exact_mapping(mapping: Any, analog_mappings: list[dict[str, Any]]) -> Any:
    """Select the exact mapping tuple from curated or analog evidence."""

    if isinstance(mapping, tuple):
        return mapping
    if analog_mappings and isinstance(analog_mappings[0].get("type"), str):
        return analog_mappings[0]["type"], analog_mappings[0]["values"]
    return mapping


def vendor_ruleset_mappings(
    mapping: Any, analog_mappings: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Return ruleset-ready mapping rows for curated or analog vendor mappings."""

    if isinstance(mapping, tuple):
        target_type, values = mapping
        return [{"kind": "relution-native", "type": target_type, "values": values}]
    return list(analog_mappings)
