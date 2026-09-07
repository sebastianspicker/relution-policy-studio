"""Semantic evidence and mapping envelopes for vendor recommendations."""

from __future__ import annotations

from typing import Any

from _recommendation_mapping_modules.candidate_inference_semantic_output import semantic_evidence_source_records
from _tooling_text_io import read_json

from _harvest_vendor_guidance_modules.common import WINDOWS_WORKBOOK_PATH
from _harvest_vendor_guidance_modules.vendor_mapping_text import normalize_text


def vendor_semantic_evidence_sources_for(
    recommendation_id: str, options: dict[str, Any]
) -> list[dict[str, Any]]:
    """Build semantic evidence rows for vendor recommendation text."""

    sources = [
        ("vendor-title", options["title"], 0.9),
        ("vendor-section", options["section"], 0.78),
        ("vendor-reason", options["reason"], 0.74),
        ("vendor-recommended-value", str(options["recommendedValue"]), 0.62),
        ("vendor-platform", options["platform"], 0.45),
        *[
            (f"vendor-context-{index}", text, 0.58)
            for index, text in enumerate(options.get("extraTexts", ()), start=1)
        ],
    ]
    return semantic_evidence_source_records(recommendation_id, sources, normalize_text)


def vendor_relution_mapping(
    ruleset_mappings: list[dict[str, Any]],
    matched_candidates: list[dict[str, Any]],
    semantic_candidates: list[dict[str, Any]],
    candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build the Relution mapping envelope for a vendor recommendation."""

    return {
        "status": vendor_mapping_status(
            ruleset_mappings, matched_candidates, semantic_candidates
        ),
        "mergeableInImportableRuleset": bool(ruleset_mappings),
        "candidates": candidates,
        "rulesetMappings": ruleset_mappings,
        "notes": [],
    }


def vendor_mapping_status(
    ruleset_mappings: list[dict[str, Any]],
    matched_candidates: list[dict[str, Any]],
    semantic_candidates: list[dict[str, Any]],
) -> str:
    """Classify mapping status from exact, matched, and semantic candidates."""

    if ruleset_mappings:
        return "exact"
    if matched_candidates:
        return "suggested"
    if semantic_candidates:
        return "partial"
    return "none"


def workbook_help_by_title() -> dict[str, str]:
    """Load Windows workbook help text keyed by policy setting title."""

    help_by_title: dict[str, str] = {}
    for row in read_json(WINDOWS_WORKBOOK_PATH):
        title = row.get("Policy Setting Name")
        help_text = row.get("Help Text")
        if isinstance(title, str) and isinstance(help_text, str) and help_text.strip():
            help_by_title.setdefault(title, help_text)
    return help_by_title
