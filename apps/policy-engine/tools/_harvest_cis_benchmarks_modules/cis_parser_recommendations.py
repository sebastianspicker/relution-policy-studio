"""Recommendation record construction and semantic mapping for CIS parsing."""
from __future__ import annotations

import sys
from typing import Any

from _recommendation_mapping_modules.candidate_inference_semantic_candidates import semantic_candidates_for
from _recommendation_mapping_modules.candidate_inference_semantic_concepts import semantic_concepts_for
from _recommendation_mapping_modules.candidate_inference_semantic_output import semantic_evidence_source_records, semantic_metadata_for
from _harvest_cis_benchmarks_modules.cis_text_collections import normalize_space
from _tooling_text_io import slugify
from _harvest_cis_benchmarks_modules.cis_parser_fallbacks import extract_helper_fallbacks
from _harvest_cis_benchmarks_modules.cis_parser_section_text import infer_recommended_value
from _harvest_cis_benchmarks_modules.cis_mapping_core import mapping_for

def benchmark_recommendation_entry(context: dict[str, Any]) -> dict[str, Any]:
    """Build one CIS recommendation with fallback translations and mappings."""
    benchmark = context["benchmark"]
    start = context["start"]
    sections = context["sections"]
    recommended_value = infer_recommended_value(
        start["title"], sections.get("description", "")
    )
    semantic_evidence_sources = cis_semantic_evidence_sources_for(
        start["recommendationId"], start["title"], recommended_value, sections
    )
    semantic_concepts = semantic_concepts_for(
        benchmark.platform, semantic_evidence_sources
    )
    semantic_candidates = cis_semantic_candidates_for(
        benchmark.platform, start["recommendationId"], start["title"], semantic_concepts
    )
    return {
        "id": slugify(f"{benchmark.benchmark_id}-{start['recommendationId']}"),
        "platform": benchmark.platform,
        "osFamily": benchmark.os_family,
        "benchmarkId": benchmark.benchmark_id,
        "benchmarkTitle": benchmark.benchmark_title,
        "benchmarkVersion": benchmark.version,
        "benchmarkDate": benchmark.document_date,
        "managementSurface": benchmark.management_surface,
        "sourcePdfPath": benchmark.source_pdf_path,
        "familySourceId": benchmark.family_source_id,
        "sourceIds": [benchmark.benchmark_id, benchmark.family_source_id],
        "recommendationId": start["recommendationId"],
        "title": start["title"],
        "assessmentStatus": start["assessmentStatus"],
        "profileApplicability": sections.get("profileApplicability", []),
        "description": sections.get("description", ""),
        "rationale": sections.get("rationale", ""),
        "impact": sections.get("impact", ""),
        "audit": sections.get("audit", ""),
        "remediation": sections.get("remediation", ""),
        "defaultValue": sections.get("defaultValue", ""),
        "additionalInformation": sections.get("additionalInformation", ""),
        "references": sections.get("references", []),
        "recommendedValue": recommended_value,
        "fallbackTranslations": extract_helper_fallbacks(
            benchmark, start["recommendationId"], sections
        ),
        "relutionMapping": mapping_for(
            {
                "benchmark": benchmark,
                "recommendationId": start["recommendationId"],
                "title": start["title"],
                "recommendedValue": recommended_value,
                "sections": sections,
                "fieldIndex": context["fieldIndex"],
                "windowsRexpEvidence": context["windowsRexpEvidence"],
                "appleMobileconfigEvidence": context["appleMobileconfigEvidence"],
                "semanticCandidates": semantic_candidates,
            }
        ),
        **semantic_metadata_for(semantic_evidence_sources, semantic_concepts),
    }


def cis_semantic_evidence_sources_for(
    recommendation_id: str,
    title: str,
    recommended_value: str | None,
    sections: dict[str, Any],
) -> list[dict[str, Any]]:
    """Compose weighted CIS text sources for semantic mapping inference."""
    sources = [
        ("cis-title", title, 0.9),
        ("cis-description", str(sections.get("description", "")), 0.82),
        ("cis-rationale", str(sections.get("rationale", "")), 0.78),
        ("cis-audit", str(sections.get("audit", "")), 0.7),
        ("cis-remediation", str(sections.get("remediation", "")), 0.7),
        ("cis-default-value", str(sections.get("defaultValue", "")), 0.55),
        (
            "cis-recommended-value",
            "" if recommended_value is None else recommended_value,
            0.65,
        ),
    ]
    return semantic_evidence_source_records(recommendation_id, sources, normalize_space)


def cis_semantic_candidates_for(
    platform: str,
    recommendation_id: str,
    title: str,
    semantic_concepts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return semantic candidates while excluding Windows helper-only guidance."""
    if is_windows_helper_only_cis_recommendation(platform, recommendation_id, title):
        print(
            f"INFO: skipping helper-only CIS recommendation {recommendation_id}: {title}",
            file=sys.stderr,
        )
        return []
    return semantic_candidates_for(platform, semantic_concepts)


def is_windows_helper_only_cis_recommendation(
    platform: str, recommendation_id: str, title: str
) -> bool:
    """Identify Windows CIS entries that describe helper state, not MDM settings."""
    if platform != "WINDOWS":
        return False
    normalized_title = title.lower()
    return (
        recommendation_id.startswith("2.2.")
        or recommendation_id.startswith("5.")
        or "service" in normalized_title
    )
