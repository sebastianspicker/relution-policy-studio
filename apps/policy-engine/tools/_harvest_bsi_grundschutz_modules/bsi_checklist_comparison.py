"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order

from .bsi_source_text import normalize_space, shorten
from .bsi_plusplus_context import matching_plusplus_rules

from typing import Any

def checklist_comparison_entry(
    module_id: str,
    checklist: dict[str, Any],
    module_data: dict[str, Any],
    platform_module_ids: set[str],
) -> dict[str, Any]:
    """Summarize one module's checklist coverage and text drift from DocBook."""

    requirements = checklist["requirements"]
    docbook_requirements = module_data["requirements"]
    missing_in_checklist = sorted(set(docbook_requirements) - set(requirements))
    missing_in_docbook = sorted(set(requirements) - set(docbook_requirements))
    text_differences = checklist_text_differences(docbook_requirements, requirements)
    return {
        "moduleId": module_id,
        "moduleTitle": checklist["moduleTitle"],
        "sourcePath": checklist["sourcePath"],
        "docbookRequirementCount": len(docbook_requirements),
        "checklistRequirementCount": len(requirements),
        "missingInChecklist": missing_in_checklist,
        "missingInDocbook": missing_in_docbook,
        "textDifferenceCount": len(text_differences),
        "sampleTextDifferences": text_differences[:5],
        "usedForPlatformPolicies": module_id in platform_module_ids,
    }


def checklist_text_differences(
    docbook_requirements: dict[str, dict[str, Any]],
    checklist_requirements: dict[str, dict[str, Any]],
) -> list[dict[str, str]]:
    """Return shortened DocBook/checklist text mismatches for shared requirements."""
    differences = []
    for requirement_id in sorted(
        set(docbook_requirements) & set(checklist_requirements)
    ):
        docbook = normalize_space(
            str(docbook_requirements[requirement_id].get("requirementText", ""))
        )
        checklist_text = normalize_space(
            str(checklist_requirements[requirement_id].get("text", ""))
        )
        if docbook != checklist_text:
            differences.append(
                {
                    "requirementId": requirement_id,
                    "docbookText": shorten(docbook, 220),
                    "checklistText": shorten(checklist_text, 220),
                }
            )
    return differences


def build_policy_relevant_checklist_items(
    checklists: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Select checklist requirements that lexically map to GS++ policy controls."""
    items: list[dict[str, Any]] = []
    for module_id, checklist in sorted(checklists.items()):
        if not module_id.startswith(("APP.", "OPS.", "SYS.")):
            continue
        for requirement_id, requirement in sorted(checklist["requirements"].items()):
            text = f"{requirement.get('title', '')} {requirement.get('text', '')}"
            matches = matching_plusplus_rules(text)
            if not matches:
                continue
            items.append(
                {
                    "moduleId": module_id,
                    "moduleTitle": checklist["moduleTitle"],
                    "requirementId": requirement_id,
                    "title": requirement["title"],
                    "text": requirement["text"],
                    "type": requirement["type"],
                    "sourcePath": checklist["sourcePath"],
                    "matchedReasons": unique_preserving_order(
                        [match["reason"] for match in matches]
                    ),
                    "relatedGrundschutzPlusPlusControlIds": unique_preserving_order(
                        control_id
                        for match in matches
                        for control_id in match["controlIds"]
                    ),
                }
            )
    return items
