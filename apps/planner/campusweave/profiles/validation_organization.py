"""University profile validation for this domain."""

from __future__ import annotations

from typing import Any, Mapping

from .constants import (
    BYOD_PROHIBITIONS,
    COHORT_KEYS,
    DEPARTMENT_RULE_KEYS,
    LOCATION_KEYS,
    MODELS,
    ORG_KEYS,
)
from .helpers import (
    add,
    records,
    require_reference,
    require_references,
    string_list,
    validate_acyclic,
)
from .validation_shared import ValidationContext


def validate_organization_and_cohorts(context: ValidationContext) -> None:
    """Validate the organization domain and publish its indexes."""
    root = context.root
    if root is None:
        return
    locations, location_index = records(
        root, "locations", LOCATION_KEYS, "location_id", context.errors
    )
    validate_locations(locations, context.errors)
    org_units, org_index = records(root, "organization_units", ORG_KEYS, "unit_id", context.errors)
    validate_organization_units(org_units, location_index, context, org_index)
    cohorts, cohort_index = records(
        root, "functional_cohorts", COHORT_KEYS, "cohort_id", context.errors
    )
    validate_cohorts(cohorts, cohort_index, context.errors)
    rules, _ = records(
        root, "department_persona_rules", DEPARTMENT_RULE_KEYS, "rule_id", context.errors
    )
    validate_department_rules(rules, org_index, cohort_index, context.errors)
    context.location_index = location_index
    context.org_index = org_index
    context.cohort_index = cohort_index


def validate_locations(locations: list[Mapping[str, Any]], errors: list[str]) -> None:
    allowed_roles = {"primary", "campus", "administrative", "service"}
    for index, location in enumerate(locations):
        path = f"$.locations[{index}]"
        if location.get("role") not in allowed_roles:
            add(errors, f"{path}.role", "is not an allowed location role")
        if location.get("network_overlay_target_local") is not True:
            add(errors, f"{path}.network_overlay_target_local", "must be true")


def validate_organization_units(
    units: list[Mapping[str, Any]],
    location_index: Mapping[str, Any],
    context: ValidationContext,
    org_index: Mapping[str, Any],
) -> None:
    roots: list[str] = []
    graph: dict[str, list[str]] = {}
    for index, unit in enumerate(units):
        collect_organization_unit(
            unit, index, location_index, context.errors, roots, graph, org_index
        )
    if context.institution_code and roots != [f"ou.{context.institution_code}"]:
        add(
            context.errors,
            "$.organization_units",
            f"must have exactly one institutional root 'ou.{context.institution_code}'",
        )
    validate_acyclic(graph, context.errors, "$.organization_units")


def collect_organization_unit(
    unit: Mapping[str, Any],
    index: int,
    location_index: Mapping[str, Any],
    errors: list[str],
    roots: list[str],
    graph: dict[str, list[str]],
    org_index: Mapping[str, Any],
) -> None:
    path = f"$.organization_units[{index}]"
    unit_id, parent = unit.get("unit_id"), unit.get("parent_unit_id")
    if isinstance(unit_id, str):
        graph[unit_id] = [parent] if isinstance(parent, str) else []
    if parent is None and isinstance(unit_id, str):
        roots.append(unit_id)
    elif parent is not None:
        require_reference(parent, org_index, errors, f"{path}.parent_unit_id")
    require_references(
        unit.get("default_location_ids"), location_index, errors, f"{path}.default_location_ids"
    )
    validate_organization_unit_values(unit, path, errors)


def validate_organization_unit_values(
    unit: Mapping[str, Any], path: str, errors: list[str]
) -> None:
    kinds = {
        "institution",
        "leadership",
        "staff",
        "department",
        "central_unit",
        "library",
        "statutory_function",
    }
    risks = {
        "general",
        "confidential",
        "sensitive_personal",
        "financial",
        "operational",
        "privileged",
        "mixed",
    }
    if unit.get("kind") not in kinds:
        add(errors, f"{path}.kind", "is not an allowed institutional unit kind")
    if unit.get("data_risk") not in risks:
        add(errors, f"{path}.data_risk", "is not an allowed data-risk class")
    if not isinstance(unit.get("assignment_eligible"), bool):
        add(errors, f"{path}.assignment_eligible", "must be Boolean")
    if unit.get("person_fields_present") is not False:
        add(errors, f"{path}.person_fields_present", "must be false")
    string_list(
        unit.get("usability_requirements"), errors, f"{path}.usability_requirements", nonempty=True
    )


def validate_cohorts(
    cohorts: list[Mapping[str, Any]], cohort_index: Mapping[str, Any], errors: list[str]
) -> None:
    if "persona.standard_office" not in cohort_index:
        add(errors, "$.functional_cohorts", "must define persona.standard_office")
    for index, cohort in enumerate(cohorts):
        validate_cohort(cohort, index, errors)


def validate_cohort(cohort: Mapping[str, Any], index: int, errors: list[str]) -> None:
    path = f"$.functional_cohorts[{index}]"
    models = string_list(
        cohort.get("eligible_models"), errors, f"{path}.eligible_models", nonempty=True
    )
    validate_cohort_models(cohort, path, models, errors)
    validate_cohort_membership(cohort, path, models, errors)


def validate_cohort_models(
    cohort: Mapping[str, Any], path: str, models: list[str], errors: list[str]
) -> None:
    if set(models) - MODELS:
        add(errors, f"{path}.eligible_models", "contains an unknown device model")
    baseline = cohort.get("default_baseline_tier")
    if not isinstance(baseline, int) or isinstance(baseline, bool) or baseline not in {1, 2, 3}:
        add(errors, f"{path}.default_baseline_tier", "must be an REXP baseline tier 1, 2, or 3")
    if baseline == 1 and not (
        cohort.get("privileged") is True or set(models).issubset({"kiosk", "privileged"})
    ):
        add(
            errors,
            f"{path}.default_baseline_tier",
            "Tier 1 is limited to privileged or dedicated kiosk cohorts",
        )


def validate_cohort_membership(
    cohort: Mapping[str, Any], path: str, models: list[str], errors: list[str]
) -> None:
    if cohort.get("privileged") is True and cohort.get("expiry_required") is not True:
        add(errors, f"{path}.expiry_required", "privileged cohort membership must expire")
    validate_cohort_membership_fields(cohort, path, errors)
    validate_cohort_byod_prohibitions(cohort, path, models, errors)


def validate_cohort_membership_fields(
    cohort: Mapping[str, Any], path: str, errors: list[str]
) -> None:
    if cohort.get("membership_authority") not in {
        "asset_purpose_register",
        "approved_service_register",
    }:
        add(errors, f"{path}.membership_authority", "must be an approved purpose/service register")
    for field in ("privileged", "expiry_required"):
        if not isinstance(cohort.get(field), bool):
            add(errors, f"{path}.{field}", "must be Boolean")
    if cohort.get("organization_derived") is not False:
        add(
            errors,
            f"{path}.organization_derived",
            "department membership must never create a device persona",
        )


def validate_cohort_byod_prohibitions(
    cohort: Mapping[str, Any], path: str, models: list[str], errors: list[str]
) -> None:
    prohibitions = set(
        string_list(
            cohort.get("prohibited_capabilities"), errors, f"{path}.prohibited_capabilities"
        )
    )
    if "byod" in models and not BYOD_PROHIBITIONS.issubset(prohibitions):
        add(
            errors,
            f"{path}.prohibited_capabilities",
            "BYOD must prohibit device-wide and personal-data capabilities",
        )


def validate_department_rules(
    rules: list[Mapping[str, Any]],
    org_index: Mapping[str, Any],
    cohort_index: Mapping[str, Any],
    errors: list[str],
) -> None:
    covered_units: set[str] = set()
    for index, rule in enumerate(rules):
        path = f"$.department_persona_rules[{index}]"
        unit_id = rule.get("unit_id")
        require_reference(unit_id, org_index, errors, f"{path}.unit_id")
        if isinstance(unit_id, str):
            if unit_id in covered_units:
                add(errors, f"{path}.unit_id", "must have only one persona rule per unit")
            covered_units.add(unit_id)
        validate_department_rule(rule, path, cohort_index, errors)


def validate_department_rule(
    rule: Mapping[str, Any], path: str, cohort_index: Mapping[str, Any], errors: list[str]
) -> None:
    permitted = set(
        require_references(
            rule.get("permitted_cohort_ids"),
            cohort_index,
            errors,
            f"{path}.permitted_cohort_ids",
            nonempty=True,
        )
    )
    prohibited = set(
        require_references(
            rule.get("prohibited_cohort_ids"), cohort_index, errors, f"{path}.prohibited_cohort_ids"
        )
    )
    if rule.get("default_cohort_id") != "persona.standard_office":
        add(errors, f"{path}.default_cohort_id", "must be persona.standard_office")
    if "persona.standard_office" not in permitted:
        add(
            errors,
            f"{path}.permitted_cohort_ids",
            "must include the non-activating standard office review default",
        )
    overlap = sorted(permitted & prohibited)
    if overlap:
        add(errors, path, f"permitted and prohibited cohorts overlap: {', '.join(overlap)}")
    if (
        rule.get("activation_mode") != "review_required"
        or rule.get("creates_membership") is not False
    ):
        add(
            errors,
            path,
            "organizational placement may recommend review but must not create membership",
        )
    string_list(
        rule.get("usability_safeguards"), errors, f"{path}.usability_safeguards", nonempty=True
    )
    string_list(
        rule.get("approval_requirements"), errors, f"{path}.approval_requirements", nonempty=True
    )
