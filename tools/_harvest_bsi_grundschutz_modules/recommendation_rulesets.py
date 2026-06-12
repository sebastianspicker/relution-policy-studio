"""Build BSI recommendation catalogs, baselines, and rulesets."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from recommendation_mapping import (
    MANAGEMENT_SUPPORT_CONCEPT_IDS,
    android_relution_analog_mappings_for,
    android_relution_candidates_for,
    apple_mobileconfig_candidates_for,
    apple_schema_analog_mappings_for,
    candidate_from_mapping,
    mapping_candidates,
)

from .curated_mapping_rules import MAPPING_RULES, extra_relution_mapping_metadata
from .source_parsers import (
    BASELINE_PATH,
    BSI_DIR,
    CHECKLIST_COMPARISON_PATH,
    GS_PLUSPLUS_SYSTEMATICS_PATH,
    PLATFORM_TARGETS,
    README_PATH,
    relative_repo_path,
)


def mapping_for(context: dict[str, Any]) -> dict[str, Any]:
    """Build Relution mapping metadata for one BSI requirement context."""
    platform = context["platform"]
    requirement_id = context["requirementId"]
    requirement = context["requirement"]
    field_index = context["fieldIndex"]
    apple_mobileconfig_evidence = context["appleMobileconfigEvidence"]
    semantic_candidates = context["semanticCandidates"]
    mapping = MAPPING_RULES.get((platform, requirement_id))
    inferred = bsi_inferred_mapping_parts(
        platform, requirement, field_index, apple_mobileconfig_evidence
    )
    if mapping is None:
        return bsi_mapping_without_curated_rule(inferred, semantic_candidates)
    override = bsi_exact_override(mapping, inferred, semantic_candidates)
    if override is not None:
        return override
    notes = mapping["notes"]
    if mapping["status"] == "none" and semantic_candidates:
        notes = [
            (
                "BSI/GS++ concept matching found related Relution targets, but exact "
                "remediation requires concrete values and scoped policy decisions."
            )
        ]
    return {
        "status": "partial"
        if mapping["status"] == "none" and semantic_candidates
        else mapping["status"],
        "mergeableInImportableRuleset": mapping["mergeableInImportableRuleset"],
        "candidates": merge_candidates(
            mapping["candidates"],
            [
                *semantic_candidates,
                *inferred["androidCandidates"],
                *inferred["appleMobileconfigCandidates"],
                *inferred["inferredCandidates"],
            ],
        ),
        "rulesetMappings": mapping["rulesetMappings"],
        "notes": notes,
        **extra_relution_mapping_metadata(mapping),
    }


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


def bsi_mapping_without_curated_rule(
    inferred: dict[str, list[dict[str, Any]]], semantic_candidates: list[dict[str, Any]]
) -> dict[str, Any]:
    """Choose inferred exact or partial metadata when no curated rule exists."""
    if inferred["androidExactMappings"]:
        return bsi_exact_mapping(
            inferred["androidExactMappings"],
            [
                *semantic_candidates,
                *inferred["androidCandidates"],
                *inferred["inferredCandidates"],
            ],
            (
                "Curated Android Enterprise analogs cover this enforceable BSI requirement "
                "through Relution native policy settings."
            ),
        )
    if inferred["appleExactMappings"]:
        return bsi_exact_mapping(
            inferred["appleExactMappings"],
            [
                *semantic_candidates,
                *inferred["appleMobileconfigCandidates"],
                *inferred["inferredCandidates"],
            ],
            (
                "Curated Apple profile analogs cover this enforceable requirement through "
                "Relution APPLE_MOBILECONFIG-backed schema profiles."
            ),
        )
    partial = bsi_partial_mapping(inferred, semantic_candidates)
    if partial is not None:
        return partial
    return {
        "status": "none",
        "mergeableInImportableRuleset": False,
        "candidates": [],
        "rulesetMappings": [],
        "notes": [],
    }


def bsi_exact_override(
    mapping: dict[str, Any],
    inferred: dict[str, list[dict[str, Any]]],
    semantic_candidates: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Promote non-exact curated metadata only when inferred exact evidence exists."""
    if mapping["status"] == "exact":
        return None
    if inferred["androidExactMappings"]:
        candidates = [
            *mapping["candidates"],
            *[
                candidate_from_mapping(entry)
                for entry in inferred["androidExactMappings"]
            ],
        ]
        return bsi_exact_mapping(
            inferred["androidExactMappings"],
            [
                *semantic_candidates,
                *inferred["androidCandidates"],
                *inferred["inferredCandidates"],
            ],
            (
                "Curated Android Enterprise analogs cover this enforceable BSI requirement "
                "through Relution native policy settings."
            ),
            candidates,
        )
    if inferred["appleExactMappings"]:
        candidates = [
            *mapping["candidates"],
            *[
                candidate_from_mapping(entry)
                for entry in inferred["appleExactMappings"]
            ],
        ]
        return bsi_exact_mapping(
            inferred["appleExactMappings"],
            [
                *semantic_candidates,
                *inferred["appleMobileconfigCandidates"],
                *inferred["inferredCandidates"],
            ],
            (
                "Curated Apple profile analogs cover this enforceable requirement through "
                "Relution APPLE_MOBILECONFIG-backed schema profiles."
            ),
            candidates,
        )
    return None


def bsi_exact_mapping(
    exact_mappings: list[dict[str, Any]],
    inferred_candidates: list[dict[str, Any]],
    note: str,
    base_candidates: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Return importable exact mapping metadata with merged review candidates."""
    candidates = (
        base_candidates
        if base_candidates is not None
        else [candidate_from_mapping(entry) for entry in exact_mappings]
    )
    return {
        "status": "exact",
        "mergeableInImportableRuleset": True,
        "candidates": merge_candidates(candidates, inferred_candidates),
        "rulesetMappings": exact_mappings,
        "notes": [note],
    }


def bsi_partial_mapping(
    inferred: dict[str, list[dict[str, Any]]], semantic_candidates: list[dict[str, Any]]
) -> dict[str, Any] | None:
    """Return partial metadata when related targets exist without exact values."""
    if inferred["androidCandidates"]:
        return bsi_partial_response(
            merge_candidates(
                inferred["androidCandidates"],
                [*semantic_candidates, *inferred["inferredCandidates"]],
            ),
            (
                "Bilingual Android Enterprise setting matching found related Relution settings, "
                "but the BSI requirement is broader or lacks concrete enforceable values."
            ),
        )
    if inferred["inferredCandidates"]:
        candidates = merge_candidates(
            inferred["inferredCandidates"],
            [
                *semantic_candidates,
                *inferred["appleMobileconfigCandidates"],
                *inferred["androidCandidates"],
            ],
        )
        return bsi_partial_response(
            candidates,
            (
                "Bilingual setting-name matching found related Relution/Apple settings, but the "
                "BSI requirement is broader or lacks a concrete enforceable value."
            ),
        )
    if inferred["appleMobileconfigCandidates"]:
        return bsi_partial_response(
            merge_candidates(
                inferred["appleMobileconfigCandidates"], semantic_candidates
            ),
            (
                "Relution can import a related Apple .mobileconfig payload, but the BSI "
                "requirement needs organization-specific values before it can be exact."
            ),
        )
    if semantic_candidates:
        return bsi_partial_response(
            semantic_candidates,
            (
                "BSI/GS++ concept matching found related Relution targets, but exact "
                "remediation requires concrete values and scoped policy decisions."
            ),
        )
    return None


def bsi_partial_response(candidates: list[dict[str, Any]], note: str) -> dict[str, Any]:
    """Build a non-importable partial mapping response with review candidates."""
    return {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": candidates,
        "rulesetMappings": [],
        "notes": [note],
    }


def merge_candidates(
    existing: list[dict[str, Any]], inferred: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Merge candidate rows by kind and target while preserving useful field paths."""
    merged: list[dict[str, Any]] = []
    seen: dict[tuple[str, str], dict[str, Any]] = {}
    ordered_existing = (
        sorted(existing, key=candidate_sort_key)
        if any("semanticConceptId" in candidate for candidate in existing)
        else existing
    )
    for candidate in [*ordered_existing, *sorted(inferred, key=candidate_sort_key)]:
        key = (str(candidate.get("kind", "")), str(candidate.get("target", "")))
        if key in seen:
            merge_candidate_field_paths(seen[key], candidate)
            continue
        stored = dict(candidate)
        stored["fieldPaths"] = [
            str(path)
            for path in candidate.get("fieldPaths", [])
            if isinstance(path, str)
        ]
        seen[key] = stored
        merged.append(stored)
    return merged[:8]


def candidate_sort_key(candidate: dict[str, Any]) -> tuple[int, int, str, str]:
    """Sort stronger curated and semantic candidates ahead of weak name matches."""
    match = candidate.get("match", {})
    compatibility = (
        str(match.get("valueCompatibility", "")) if isinstance(match, dict) else ""
    )
    score = int(match.get("score", 0)) if isinstance(match, dict) else 0
    concept_id = str(candidate.get("semanticConceptId", ""))
    if compatibility in {"curated-analog", "curated-android-analog"}:
        band = 0
    elif compatibility == "concept-candidate":
        band = 3 if concept_id in MANAGEMENT_SUPPORT_CONCEPT_IDS else 2
    else:
        band = 1
    return (
        band,
        -score,
        str(candidate.get("kind", "")),
        str(candidate.get("target", "")),
    )


def merge_candidate_field_paths(
    existing: dict[str, Any], duplicate: dict[str, Any]
) -> None:
    """Append unique field paths from a duplicate candidate into the stored row."""
    paths = [
        str(path) for path in existing.get("fieldPaths", []) if isinstance(path, str)
    ]
    seen = set(paths)
    for path in duplicate.get("fieldPaths", []):
        if not isinstance(path, str) or path in seen:
            continue
        seen.add(path)
        paths.append(path)
    existing["fieldPaths"] = paths


def build_ruleset(recommendations: list[dict[str, Any]]) -> dict[str, Any]:
    """Build the importable BSI Relution ruleset with informational partial rules."""
    policies = []
    for platform in PLATFORM_TARGETS:
        platform_recommendations = [
            entry
            for entry in recommendations
            if entry["platform"] == platform.platform and entry["status"] == "active"
        ]
        policies.append(
            {
                "platform": platform.platform,
                "name": platform.policy_name,
                "description": platform.policy_description,
                "rules": [
                    {
                        "id": entry["id"],
                        "title": f"{entry['requirementId']} {entry['title']}",
                        "informational": entry["relutionMapping"]["status"] != "exact",
                        "reason": entry["reason"],
                        "section": entry["category"],
                        "recommendedValue": entry["requirementText"],
                        "sourceIds": entry["sourceIds"],
                        "mappingStatus": entry["relutionMapping"]["status"],
                        "grundschutzKompendium": entry.get("grundschutzKompendium"),
                        "grundschutzPlusPlus": entry.get("grundschutzPlusPlus"),
                        "semanticConcepts": entry.get("semanticConcepts", []),
                        "semanticNoConceptReason": entry.get("semanticNoConceptReason"),
                        "mappings": entry["relutionMapping"]["rulesetMappings"],
                    }
                    for entry in platform_recommendations
                ],
            }
        )
    return {
        "version": 1,
        "name": "BSI Grundschutz OS Baseline",
        "verifiedAsOf": "2026-04-24",
        "sourceIndexPath": "example/bsi-references/sources.json",
        "recommendationCatalogPath": "example/bsi-references/bsi-recommendations.json",
        "policies": policies,
    }


def update_baseline_summary(
    recommendations: list[dict[str, Any]],
    plusplus_systematics: dict[str, Any],
    checklist_comparison: dict[str, Any],
) -> None:
    """Update the BSI baseline summary with recommendation and source counts."""
    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf8"))
    counts_by_platform: dict[str, int] = {}
    for recommendation in recommendations:
        counts_by_platform[recommendation["platform"]] = (
            counts_by_platform.get(recommendation["platform"], 0) + 1
        )
    baseline["recommendationCatalogPath"] = (
        "example/bsi-references/bsi-recommendations.json"
    )
    baseline["importableRulesetPath"] = (
        "example/bsi-references/bsi-relution-ruleset.json"
    )
    baseline["recommendationCounts"] = {
        "total": len(recommendations),
        "active": sum(1 for entry in recommendations if entry["status"] == "active"),
        "retired": sum(1 for entry in recommendations if entry["status"] == "retired"),
        "byPlatform": counts_by_platform,
    }
    baseline["downloadCount"] = len(
        json.loads((BSI_DIR / "downloads" / "manifest.json").read_text(encoding="utf8"))
    )
    baseline["grundschutzKompendiumChecklists"] = {
        "comparisonPath": relative_repo_path(CHECKLIST_COMPARISON_PATH),
        "individualWorkbookCount": checklist_comparison["individualWorkbookCount"],
        "individualRequirementCount": checklist_comparison[
            "individualRequirementCount"
        ],
        "policyRelevantRequirementCount": checklist_comparison[
            "policyRelevantRequirementCount"
        ],
        "sourceDirectory": checklist_comparison["sourceDirectory"],
        "consolidatedThreatWorkbookPath": checklist_comparison[
            "consolidatedThreatWorkbookPath"
        ],
    }
    baseline["grundschutzPlusPlus"] = {
        "systematicsPath": relative_repo_path(GS_PLUSPLUS_SYSTEMATICS_PATH),
        "catalogTitle": plusplus_systematics["catalog"]["title"],
        "catalogVersion": plusplus_systematics["catalog"]["version"],
        "catalogLastModified": plusplus_systematics["catalog"]["lastModified"],
        "methodDocument": plusplus_systematics["methodology"]["documentTitle"],
        "methodVersion": plusplus_systematics["methodology"]["documentVersion"],
        "methodDate": plusplus_systematics["methodology"]["documentDate"],
        "status": plusplus_systematics["methodology"]["status"],
        "controlCount": plusplus_systematics["counts"]["controls"],
        "practiceGroupCount": plusplus_systematics["counts"]["practiceGroups"],
        "policyRelevantControlCount": len(
            plusplus_systematics["policyRelevantControlIds"]
        ),
        "modalVerbDefinitions": plusplus_systematics["methodology"][
            "modalVerbDefinitions"
        ],
        "policyEditorUse": plusplus_systematics["methodology"]["policyEditorUse"],
    }
    write_json(BASELINE_PATH, baseline)


def update_readme() -> None:
    """Ensure the BSI README mentions generated recommendation and ruleset artifacts."""
    readme = README_PATH.read_text(encoding="utf8")
    if "bsi-recommendations.json" in readme and "bsi-relution-ruleset.json" in readme:
        return
    insertion = """
- `bsi-recommendations.json`: per-platform BSI Grundschutz recommendation catalog derived from the saved DocBook XML and checklist workbook, including threat linkage, errata overlays, and Relution mapping metadata.
- `bsi-relution-ruleset.json`: importable Relution ruleset built from the active BSI requirements. Only exact Relution mappings are actionable; the rest stay informational with preserved metadata.
- `tools/harvest_bsi_grundschutz.py`: reproducible extractor for the local BSI XML/XLSX/text corpus.
""".strip()
    readme = readme.replace(
        (
            "- `bsi-relution-baseline.json`: consolidated 2023 baseline plus 2025 "
            "errata/checklist layer, normalized for Relution-oriented consumption"
        ),
        (
            "- `bsi-relution-baseline.json`: consolidated 2023 baseline plus 2025 "
            "errata/checklist layer, normalized for Relution-oriented consumption\n"
        )
        + insertion,
    )
    README_PATH.write_text(readme, encoding="utf8")


def write_json(path: Path, payload: Any) -> None:
    """Write stable UTF-8 JSON for generated BSI artifacts."""
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
