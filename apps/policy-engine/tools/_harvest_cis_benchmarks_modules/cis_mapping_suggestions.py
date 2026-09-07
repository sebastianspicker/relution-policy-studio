"""Suggested CIS mapping result construction and candidate merging."""
from __future__ import annotations

from typing import Any

from _recommendation_mapping_modules.candidate_inference_android import android_relution_candidates_for
from _recommendation_mapping_modules.candidate_inference_apple_mobileconfig import apple_mobileconfig_candidates_for
from _recommendation_mapping_modules.candidate_inference_index import mapping_candidates
from _recommendation_mapping_modules.field_matching_candidates import merge_candidate_lists

def suggested_mapping_response(context: dict[str, Any]) -> dict[str, Any]:
    """Build suggested or partial mapping output from inferred candidates."""
    benchmark = context["benchmark"]
    title = context["title"]
    extra_texts = context["extraTexts"]
    mobileconfig_candidates = apple_mobileconfig_candidates_for(
        benchmark.platform,
        title,
        extra_texts=(str(context["sections"].get("remediation", "")), *extra_texts),
        evidence_index=context["appleMobileconfigEvidence"],
    )
    android_candidates = android_relution_candidates_for(
        benchmark.platform, title, extra_texts=extra_texts
    )
    inferred_candidates = (
        []
        if context["windowsServiceControl"]
        else mapping_candidates(
            benchmark.platform,
            title,
            benchmark.benchmark_title,
            context["fieldIndex"],
            {
                "extraTexts": extra_texts,
                "recommendedValue": context["recommendedValue"],
                "allowedKinds": context["allowedKinds"],
            },
        )
    )
    matched_candidates = merge_candidates(
        [
            *context["acc"]["candidates"],
            *mobileconfig_candidates,
            *android_candidates,
            *inferred_candidates,
        ]
    )
    candidates = merge_candidates(matched_candidates, context["semanticCandidates"])
    notes = context["acc"]["notes"]
    if matched_candidates and not notes:
        notes.append(
            (
                "Bilingual/type-aware setting matching found related Relution/Apple settings, "
                "but this recommendation is not exact without a verified value/polarity match."
            )
        )
    if candidates:
        if context["semanticCandidates"] and not matched_candidates:
            notes.append(
                (
                    "Semantic concept matching found related Relution support surfaces, but no "
                    "exact CIS remediation value was inferred."
                )
            )
        return {
            "status": "suggested" if matched_candidates else "partial",
            "mergeableInImportableRuleset": False,
            "candidates": candidates,
            "rulesetMappings": [],
            "notes": notes,
        }
    return {
        "status": "none",
        "mergeableInImportableRuleset": False,
        "candidates": [],
        "rulesetMappings": [],
        "notes": [],
    }


def merge_candidates(*candidate_groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge candidate groups using the shared deduplication policy."""
    return merge_candidate_lists(*candidate_groups)
