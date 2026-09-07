"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from .bsi_oscal_properties import first_part, prop_value, prop_values
from .bsi_plusplus_platform_context import GS_PLUSPLUS_RELATED_CONTROL_RULES
from .bsi_source_collections import split_values
from .bsi_source_text import normalize_space

from typing import Any

def parse_plusplus_control(
    control: dict[str, Any], group_path: tuple[dict[str, str], ...]
) -> dict[str, Any]:
    """Extract policy-relevant GS++ control fields from one OSCAL control node."""

    statement = first_part(control, "statement")
    guidance = first_part(control, "guidance")
    statement_props = statement.get("props", []) if isinstance(statement, dict) else []
    control_props = control.get("props", [])
    top_group = group_path[0] if group_path else {"id": "", "title": ""}
    leaf_group = group_path[-1] if group_path else {"id": "", "title": ""}
    target_categories = split_values(
        prop_values(statement_props, "target_object_categories")
    )
    return {
        "id": str(control.get("id", "")),
        "title": str(control.get("title", "")),
        "class": control.get("class"),
        "practiceId": top_group["id"],
        "practiceTitle": top_group["title"],
        "controlGroupId": leaf_group["id"],
        "controlGroupTitle": leaf_group["title"],
        "securityLevel": prop_value(control_props, "sec_level"),
        "effortLevel": prop_value(control_props, "effort_level"),
        "modalVerb": prop_value(statement_props, "modal_verb"),
        "actionWord": prop_value(statement_props, "action_word"),
        "result": prop_value(statement_props, "result"),
        "resultSpecification": prop_value(statement_props, "result_specification"),
        "targetObjectCategories": target_categories,
        "documentation": prop_values(statement_props, "documentation"),
        "tags": split_values(prop_values(control_props, "tags")),
        "parameters": [
            {
                "id": str(parameter.get("id", "")),
                "label": str(parameter.get("label", "")),
                "values": [
                    str(value)
                    for value in parameter.get("values", [])
                    if isinstance(value, str)
                ],
            }
            for parameter in control.get("params", [])
            if isinstance(parameter, dict)
        ],
        "statement": normalize_space(str(statement.get("prose", "")))
        if isinstance(statement, dict)
        else "",
        "guidance": normalize_space(str(guidance.get("prose", "")))
        if isinstance(guidance, dict)
        else "",
    }


def policy_relevant_plusplus_control_ids(
    controls_by_id: dict[str, dict[str, Any]],
) -> set[str]:
    """Return curated GS++ controls that exist in the parsed catalog."""
    control_ids = {
        control_id
        for rule in GS_PLUSPLUS_RELATED_CONTROL_RULES
        for control_id in rule["controlIds"]
    }
    return {control_id for control_id in control_ids if control_id in controls_by_id}
