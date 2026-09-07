"""Top-level CIS recommendation mapping orchestration."""
from __future__ import annotations

from typing import Any

from _recommendation_mapping_modules.candidate_inference_exact import infer_exact_boolean_mapping
from _harvest_cis_benchmarks_modules.cis_mapping_analog import add_analog_mappings
from _harvest_cis_benchmarks_modules.cis_mapping_accumulator import add_mapping
from _harvest_cis_benchmarks_modules.cis_mapping_curated import add_curated_exact_mappings
from _harvest_cis_benchmarks_modules.cis_mapping_suggestions import merge_candidates, suggested_mapping_response
from _harvest_cis_benchmarks_modules.cis_mapping_support import add_windows_rexp_mapping

def mapping_for(context: dict[str, Any]) -> dict[str, Any]:
    """Build the Relution mapping response for one harvested CIS recommendation."""
    benchmark = context["benchmark"]
    title = context["title"]
    recommended_value = context["recommendedValue"]
    sections = context["sections"]
    normalized_title = title.lower()
    acc: dict[str, list[dict[str, Any]] | list[str]] = {
        "exactMappings": [],
        "candidates": [],
        "notes": [],
    }
    extra_texts = (
        str(sections.get("description", "")),
        str(sections.get("rationale", "")),
    )

    add_curated_exact_mappings(
        acc, benchmark, normalized_title, title, recommended_value
    )
    add_analog_mappings(acc, benchmark, title, recommended_value)
    add_windows_rexp_mapping(
        acc, benchmark, title, recommended_value, context["windowsRexpEvidence"]
    )

    allowed_kinds = (
        {"relution-native", "apple-schema-profile"}
        if benchmark.platform in {"IOS", "MACOS"}
        else {"relution-native"}
    )
    windows_service_control = (
        benchmark.platform == "WINDOWS" and "service" in normalized_title
    )
    if not acc["exactMappings"] and not windows_service_control:
        inferred_exact = infer_exact_boolean_mapping(
            benchmark.platform,
            title,
            recommended_value,
            context["fieldIndex"],
            {"extraTexts": extra_texts, "allowedKinds": allowed_kinds},
        )
        if inferred_exact is not None:
            add_mapping(acc, inferred_exact)

    if acc["exactMappings"]:
        return {
            "status": "exact",
            "mergeableInImportableRuleset": True,
            "candidates": merge_candidates(
                acc["candidates"], context["semanticCandidates"]
            ),
            "rulesetMappings": acc["exactMappings"],
            "notes": acc["notes"],
        }

    return suggested_mapping_response(
        {
            "acc": acc,
            "benchmark": benchmark,
            "title": title,
            "recommendedValue": recommended_value,
            "sections": sections,
            "fieldIndex": context["fieldIndex"],
            "appleMobileconfigEvidence": context["appleMobileconfigEvidence"],
            "semanticCandidates": context["semanticCandidates"],
            "allowedKinds": allowed_kinds,
            "windowsServiceControl": windows_service_control,
            "extraTexts": extra_texts,
        }
    )
