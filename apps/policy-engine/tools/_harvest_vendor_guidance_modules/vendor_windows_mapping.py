"""Windows-specific vendor recommendation mapping."""

from __future__ import annotations

from typing import Any

from _recommendation_mapping_modules.candidate_inference_exact import infer_exact_boolean_mapping
from _recommendation_mapping_modules.candidate_inference_index import mapping_candidates as shared_mapping_candidates
from _recommendation_mapping_modules.candidate_inference_semantic_candidates import semantic_candidates_for
from _recommendation_mapping_modules.candidate_inference_semantic_concepts import semantic_concepts_for
from _recommendation_mapping_modules.candidate_inference_semantic_output import semantic_metadata_for
from _recommendation_mapping_modules.field_matching_windows_csp import windows_custom_csp_mapping_for

from _harvest_vendor_guidance_modules.common import (
    WINDOWS_BASELINE_NAME,
    WINDOWS_EXACT_BY_ID,
    merge_candidate_lists,
)
from _harvest_vendor_guidance_modules.vendor_mapping_semantic import (
    vendor_relution_mapping,
    vendor_semantic_evidence_sources_for,
)
from _harvest_vendor_guidance_modules.vendor_mapping_text import (
    compact_slug,
    normalize_text,
)


def build_windows_recommendation(
    index: int,
    row: dict[str, Any],
    help_by_title: dict[str, str],
    field_index: dict[str, list[dict[str, Any]]],
    windows_rexp_evidence: dict[frozenset[str], list[dict[str, Any]]],
) -> dict[str, Any]:
    """Build one normalized Windows vendor recommendation with mapping metadata."""

    title = str(row["title"])
    section = str(row["section"])
    recommendation_id = f"windows-{index:04d}-{compact_slug(title)}"
    exact = WINDOWS_EXACT_BY_ID.get(recommendation_id)
    source_context = windows_source_context(title, help_by_title)
    semantic_evidence_sources = windows_semantic_evidence_sources(
        recommendation_id, title, section, row, source_context["reason"]
    )
    semantic_concepts = semantic_concepts_for("WINDOWS", semantic_evidence_sources)
    semantic_candidates = semantic_candidates_for("WINDOWS", semantic_concepts)
    mapping_context = windows_mapping_context(
        {
            "row": row,
            "title": title,
            "section": section,
            "reason": source_context["reason"],
            "exact": exact,
            "fieldIndex": field_index,
            "windowsRexpEvidence": windows_rexp_evidence,
            "semanticCandidates": semantic_candidates,
        }
    )
    semantic_metadata = semantic_metadata_for(
        semantic_evidence_sources, semantic_concepts
    )
    return {
        "id": recommendation_id,
        "platform": "WINDOWS",
        "sourceIds": source_context["sourceIds"],
        "title": title,
        "section": section,
        "recommendedValue": row["recommendedValue"],
        "reason": source_context["reason"],
        "reasonSource": source_context["reasonSource"],
        "vendor": {
            "baseline": WINDOWS_BASELINE_NAME,
            "parentTitle": row.get("parentTitle"),
        },
        "relutionMapping": vendor_relution_mapping(
            mapping_context["rulesetMappings"],
            mapping_context["matchedCandidates"],
            semantic_candidates,
            mapping_context["candidates"],
        ),
        **semantic_metadata,
    }


def windows_source_context(title: str, help_by_title: dict[str, str]) -> dict[str, Any]:
    """Select source ids and reason text for a Windows baseline row."""

    help_text = help_by_title.get(title)
    source_ids = ["microsoft-intune-windows-mdm-baseline-settings"]
    if help_text:
        source_ids.append("microsoft-windows-11-24h2-security-baseline-zip")
        return {
            "sourceIds": source_ids,
            "reason": normalize_text(help_text),
            "reasonSource": "microsoft-windows-11-24h2-security-baseline-zip",
        }
    return {
        "sourceIds": source_ids,
        "reason": "Microsoft lists this as a default setting in the current Windows 11 version 25H2 Intune MDM baseline for managed Windows devices.",
        "reasonSource": "microsoft-intune-windows-mdm-baseline-settings",
    }


def windows_semantic_evidence_sources(
    recommendation_id: str, title: str, section: str, row: dict[str, Any], reason: str
) -> list[dict[str, Any]]:
    """Build semantic evidence sources for Windows vendor mapping."""

    return vendor_semantic_evidence_sources_for(
        recommendation_id,
        {
            "platform": "WINDOWS",
            "title": title,
            "section": section,
            "reason": reason,
            "recommendedValue": row["recommendedValue"],
            "extraTexts": (str(row.get("parentTitle") or ""),),
        },
    )


def windows_mapping_context(context: dict[str, Any]) -> dict[str, Any]:
    """Resolve exact, inferred, and semantic Windows mapping candidates."""

    rexp_exact, inferred_exact = inferred_windows_exact_mappings(context)
    mapping = windows_mapping_tuple(context["exact"], rexp_exact, inferred_exact)
    matched_candidates = shared_mapping_candidates(
        "WINDOWS",
        context["title"],
        context["section"],
        context["fieldIndex"],
        {
            "exactMapping": mapping,
            "recommendedValue": context["row"]["recommendedValue"],
            "extraTexts": (context["reason"],),
            "allowedKinds": {"relution-native"},
        },
    )
    return {
        "matchedCandidates": matched_candidates,
        "candidates": merge_candidate_lists(
            matched_candidates, context["semanticCandidates"]
        ),
        "rulesetMappings": windows_ruleset_mappings(
            context["exact"], rexp_exact, inferred_exact
        ),
    }


def inferred_windows_exact_mappings(
    context: dict[str, Any],
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Infer exact Windows mappings from REXP evidence or boolean fields."""

    row = context["row"]
    exact = context["exact"]
    if exact is not None:
        return None, None
    rexp_exact = windows_custom_csp_mapping_for(
        context["title"],
        row["recommendedValue"],
        context["windowsRexpEvidence"],
        parent_title=str(row.get("parentTitle") or ""),
    )
    if rexp_exact is not None:
        return rexp_exact, None
    return None, infer_exact_boolean_mapping(
        "WINDOWS",
        context["title"],
        row["recommendedValue"],
        context["fieldIndex"],
        {
            "section": context["section"],
            "extraTexts": (context["reason"],),
            "allowedKinds": {"relution-native"},
        },
    )


def windows_mapping_tuple(
    exact: dict[str, Any] | None,
    rexp_exact: dict[str, Any] | None,
    inferred_exact: dict[str, Any] | None,
) -> tuple[Any, Any] | None:
    """Return the exact mapping tuple used by the shared candidate scorer."""

    if exact is not None:
        return exact["type"], exact["values"]
    if rexp_exact is not None and isinstance(rexp_exact.get("type"), str):
        return rexp_exact["type"], rexp_exact["values"]
    if inferred_exact is not None and isinstance(inferred_exact.get("type"), str):
        return inferred_exact["type"], inferred_exact["values"]
    return None


def windows_ruleset_mappings(
    exact: dict[str, Any] | None,
    rexp_exact: dict[str, Any] | None,
    inferred_exact: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    """Return importable Windows ruleset mappings in precedence order."""

    if exact is not None:
        return [
            {
                "kind": "relution-native",
                "type": exact["type"],
                "values": exact["values"],
            }
        ]
    if rexp_exact is not None:
        return [rexp_exact]
    return [] if inferred_exact is None else [inferred_exact]
