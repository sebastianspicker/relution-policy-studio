"""Conservative conversion from the genuine checked-in v1 profile shape."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from .model import string_list
from .validation import validate_profile


def _objects(value: Any) -> list[Mapping[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, Mapping)]


def _text(value: Any, default: str = "") -> str:
    return value if isinstance(value, str) else default


def _nullable_text(value: Any) -> str | None:
    return value if isinstance(value, str) else None


def _named(
    item: Mapping[str, Any], identifier_field: str, name_field: str = "label"
) -> dict[str, Any]:
    return {"id": _text(item.get(identifier_field)), "name": _text(item.get(name_field))}


def _organizations(profile: Mapping[str, Any]) -> list[dict[str, Any]]:
    result = []
    for item in _objects(profile.get("organization_units")):
        result.append(
            {
                **_named(item, "unit_id"),
                "parent_id": _nullable_text(item.get("parent_unit_id")),
                "description": _nullable_text(item.get("kind")),
                "requirements": string_list(item.get("usability_requirements")),
            }
        )
    return result


def _locations(profile: Mapping[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            **_named(item, "location_id"),
            "organization_id": None,
            "description": _nullable_text(item.get("role")),
            "requirements": [],
        }
        for item in _objects(profile.get("locations"))
    ]


def _cohorts(profile: Mapping[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            **_named(item, "cohort_id"),
            "organization_id": None,
            "location_ids": [],
            "role": None,
            "ownership": None,
            "requirements": string_list(item.get("usability_requirements")),
        }
        for item in _objects(profile.get("functional_cohorts"))
    ]


def _layers(profile: Mapping[str, Any]) -> dict[str, int]:
    result: dict[str, int] = {}
    for item in _objects(profile.get("policy_layers")):
        identifier, order = item.get("layer_id"), item.get("order")
        if isinstance(identifier, str) and isinstance(order, int) and not isinstance(order, bool):
            result[identifier] = order
    return result


def _intent_outcome(item: Mapping[str, Any]) -> str:
    outcomes = [
        setting["desired_outcome"]
        for setting in _objects(item.get("intent_settings"))
        if isinstance(setting.get("desired_outcome"), str) and setting["desired_outcome"].strip()
    ]
    return "; ".join(outcomes) or _text(item.get("label"))


def _intents(profile: Mapping[str, Any]) -> list[dict[str, Any]]:
    layers = _layers(profile)
    assignments = _objects(profile.get("assignment_intents"))
    result = []
    for item in _objects(profile.get("policy_units")):
        identifier = _text(item.get("policy_id"))
        settings = _objects(item.get("intent_settings"))
        result.append(
            {
                **_named(item, "policy_id"),
                "outcome": _intent_outcome(item),
                "platform": _text(item.get("platform")),
                "ownership": None,
                "role": None,
                "cohort_ids": string_list(item.get("cohort_ids")),
                "layer": layers.get(_text(item.get("layer_id"))),
                "scope_ids": sorted(
                    {
                        assignment["scope_blueprint_id"]
                        for assignment in assignments
                        if assignment.get("policy_id") == identifier
                        and isinstance(assignment.get("scope_blueprint_id"), str)
                    }
                ),
                "depends_on": [],
                "requirements": sorted(
                    {
                        setting["setting_key"]
                        for setting in settings
                        if isinstance(setting.get("setting_key"), str)
                    }
                ),
            }
        )
    return result


def _scope_blueprints(profile: Mapping[str, Any]) -> list[dict[str, Any]]:
    result = []
    for item in _objects(profile.get("group_blueprints")):
        dimension = item.get("primary_dimension")
        values = string_list(item.get("values"))
        result.append(
            {
                **_named(item, "group_id"),
                "cohort_ids": values if dimension in {"cohort", "persona"} else [],
                "organization_ids": [],
                "location_ids": values if dimension == "location" else [],
                "platforms": values if dimension == "platform" else [],
                "ownerships": values if dimension == "ownership" else [],
                "roles": values if dimension in {"role", "function"} else [],
                "depends_on": string_list(item.get("referenced_group_ids")),
                "requirements": [value for value in (_text(item.get("membership_mode")),) if value],
            }
        )
    return result


def _assignments(profile: Mapping[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            **_named(item, "assignment_id", "assignment_id"),
            "intent_id": _text(item.get("policy_id")),
            "scope_id": _text(item.get("scope_blueprint_id")),
            "rollout_stage_id": _nullable_text(item.get("ring_id")),
            "requirements": string_list(item.get("notes")),
        }
        for item in _objects(profile.get("assignment_intents"))
    ]


def _rollout_stages(profile: Mapping[str, Any]) -> list[dict[str, Any]]:
    result = []
    for item in _objects(profile.get("rollout_rings")):
        predecessor = item.get("predecessor_ring_id")
        order = item.get("order")
        result.append(
            {
                **_named(item, "ring_id"),
                "order": order if isinstance(order, int) and not isinstance(order, bool) else 0,
                "depends_on": [predecessor] if isinstance(predecessor, str) else [],
                "requirements": string_list(item.get("rollback_thresholds")),
            }
        )
    return result


def _unresolved(profile: Mapping[str, Any]) -> list[dict[str, Any]]:
    result = [
        {
            **_named(item, "input_id", "description"),
            "description": _nullable_text(item.get("description")),
            "related_ids": [],
            "requirements": [value for value in (_text(item.get("resolution_evidence")),) if value],
        }
        for item in _objects(profile.get("unresolved_inputs"))
    ]
    result.append(
        {
            "id": "conversion.v1.ownership-role",
            "name": "Confirm ownership and functional roles",
            "description": (
                "V1 API roles and cohort membership authorities are not functional roles or "
                "setting ownership. Confirm both explicitly before use."
            ),
            "related_ids": [],
            "requirements": ["ownership inventory", "functional role decision"],
        }
    )
    represented = {"platform", "cohort", "persona", "location", "ownership", "role", "function"}
    for item in _objects(profile.get("group_blueprints")):
        if item.get("primary_dimension") not in represented:
            identifier = _text(item.get("group_id"))
            facts = {
                key: item.get(key)
                for key in (
                    "primary_dimension",
                    "values",
                    "referenced_group_ids",
                    "membership_mode",
                )
            }
            result.append(
                {
                    "id": f"conversion.scope.{identifier}",
                    "name": "Review unrepresented legacy scope",
                    "description": json.dumps(facts, ensure_ascii=False, sort_keys=True),
                    "related_ids": [identifier] if identifier else [],
                    "requirements": ["explicit scope interpretation"],
                }
            )
    for item in _objects(profile.get("policy_units")):
        identifier = _text(item.get("policy_id"))
        facts = [
            {
                "setting_key": setting.get("setting_key"),
                "writer_scope": setting.get("writer_scope"),
                "desired_outcome": setting.get("desired_outcome"),
            }
            for setting in _objects(item.get("intent_settings"))
        ]
        if facts:
            result.append(
                {
                    "id": f"conversion.writer.{identifier}",
                    "name": "Review legacy setting writer scopes",
                    "description": json.dumps(facts, ensure_ascii=False, sort_keys=True),
                    "related_ids": [identifier] if identifier else [],
                    "requirements": ["ownership and setting writer review"],
                }
            )
    return result


def _converted_profile(profile: Mapping[str, Any]) -> dict[str, Any]:
    package = profile.get("package") if isinstance(profile.get("package"), Mapping) else {}
    package = package if isinstance(package, Mapping) else {}
    identifier = _text(package.get("package_id"))
    name = _text(package.get("institution_label"))
    return {
        "schema_version": 2,
        "id": f"{identifier}.v2" if identifier else "",
        "name": name,
        "organizations": _organizations(profile),
        "locations": _locations(profile),
        "cohorts": _cohorts(profile),
        "intents": _intents(profile),
        "scope_blueprints": _scope_blueprints(profile),
        "assignments": _assignments(profile),
        "rollout_stages": _rollout_stages(profile),
        "unresolved": _unresolved(profile),
    }


def convert_v1_profile(profile: Any) -> dict[str, Any]:
    """Convert only representable v1 intent and preserve ambiguity as unresolved work."""
    converted = (
        _converted_profile(profile) if isinstance(profile, Mapping) else _converted_profile({})
    )
    validation = validate_profile(converted)
    diagnostics = [
        {
            "severity": "error",
            "code": "conversion.ownership_role_ambiguous",
            "path": "$.unresolved",
            "message": "v1 ownership and API roles require explicit functional interpretation",
        },
        *validation["diagnostics"],
    ]
    return {
        "profile": converted,
        "diagnostics": diagnostics,
        "valid": not any(item["severity"] == "error" for item in diagnostics),
    }
