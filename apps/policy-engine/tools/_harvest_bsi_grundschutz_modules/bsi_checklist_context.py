"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from .bsi_source_text import normalize_space, shorten
from .bsi_plusplus_context import matching_plusplus_rules

from typing import Any

def checklist_context_for(
    module_id: str,
    requirement_id: str,
    requirement: dict[str, Any],
    individual_checklists: dict[str, dict[str, Any]],
    policy_relevant_requirements: list[dict[str, Any]],
) -> dict[str, Any]:
    """Attach individual-checklist text and related checklist items to a rule."""

    checklist = individual_checklists.get(module_id)
    checklist_requirement = (
        checklist.get("requirements", {}).get(requirement_id) if checklist else None
    )
    related_items = related_checklist_items_for(
        requirement, policy_relevant_requirements
    )
    context: dict[str, Any] = {
        "individualChecklistSourcePath": checklist.get("sourcePath")
        if checklist
        else None,
        "individualChecklistRequirementType": checklist_requirement.get("type")
        if checklist_requirement
        else None,
        "individualChecklistMatchesDocBook": None,
        "differences": [],
        "relatedChecklistItems": related_items,
    }
    if checklist_requirement is not None:
        docbook_text = normalize_space(str(requirement.get("requirementText", "")))
        checklist_text = normalize_space(str(checklist_requirement.get("text", "")))
        differences = []
        if normalize_space(str(requirement.get("title", ""))) != normalize_space(
            str(checklist_requirement.get("title", ""))
        ):
            differences.append("title")
        if docbook_text != checklist_text:
            differences.append("text")
        context["individualChecklistMatchesDocBook"] = len(differences) == 0
        context["differences"] = differences
        context["individualChecklistTitle"] = checklist_requirement.get("title")
        context["individualChecklistText"] = checklist_text
    return context


def related_checklist_items_for(
    requirement: dict[str, Any], policy_relevant_requirements: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Find nearby checklist requirements that share GS++ match reasons."""
    text = " ".join(
        (
            str(requirement.get("title", "")),
            str(requirement.get("category", "")),
            str(requirement.get("requirementText", "")),
        )
    )
    matched_reasons = {match["reason"] for match in matching_plusplus_rules(text)}
    if not matched_reasons:
        return []
    related = []
    current_id = str(requirement.get("requirementId", ""))
    for item in policy_relevant_requirements:
        if item["requirementId"] == current_id:
            continue
        if not matched_reasons.intersection(item["matchedReasons"]):
            continue
        related.append(
            {
                "moduleId": item["moduleId"],
                "moduleTitle": item["moduleTitle"],
                "requirementId": item["requirementId"],
                "title": item["title"],
                "type": item["type"],
                "sourcePath": item["sourcePath"],
                "matchedReasons": item["matchedReasons"],
                "relatedGrundschutzPlusPlusControlIds": item[
                    "relatedGrundschutzPlusPlusControlIds"
                ],
                "text": shorten(item["text"], 500),
            }
        )
    related.sort(key=lambda entry: (entry["moduleId"], entry["requirementId"]))
    return related[:5]
