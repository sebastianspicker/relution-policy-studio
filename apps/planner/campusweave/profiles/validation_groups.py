"""University profile validation for this domain."""

from __future__ import annotations

from typing import Any, Mapping

from .constants import (
    CONCRETE_PLATFORMS,
    GROUP_KEYS,
    MODELS,
    NON_PROMOTION_RINGS,
    PROMOTION_CHAIN,
    REQUIRED_GROUP_DIMENSIONS,
    RING_KEYS,
    RING_MACHINE_RULES,
)
from .helpers import (
    add,
    array,
    records,
    require_references,
    string_list,
    validate_acyclic,
)
from .validation_shared import ValidationContext


def validate_groups_and_rings(context: ValidationContext) -> None:
    """Validate group and rollout domains and publish their indexes."""
    root = context.root
    if root is None:
        return
    groups, group_index = records(root, "group_blueprints", GROUP_KEYS, "group_id", context.errors)
    assignable_groups = validate_groups(groups, group_index, context.cohort_index, context.errors)
    rings, ring_index = records(root, "rollout_rings", RING_KEYS, "ring_id", context.errors)
    validate_rings(rings, ring_index, context.errors)
    context.group_index = group_index
    context.assignable_groups = assignable_groups
    context.ring_index = ring_index


def validate_groups(
    groups: list[Mapping[str, Any]],
    group_index: Mapping[str, Any],
    cohort_index: Mapping[str, Any],
    errors: list[str],
) -> set[str]:
    dimensions: set[str] = set()
    graph: dict[str, list[str]] = {}
    assignable: set[str] = set()
    for index, group in enumerate(groups):
        validate_group(
            group, index, group_index, cohort_index, errors, dimensions, graph, assignable
        )
    missing_dimensions = sorted(REQUIRED_GROUP_DIMENSIONS - dimensions)
    if missing_dimensions:
        add(
            errors,
            "$.group_blueprints",
            f"missing group dimensions: {', '.join(missing_dimensions)}",
        )
    validate_acyclic(graph, errors, "$.group_blueprints")
    return assignable


def validate_group(
    group: Mapping[str, Any],
    index: int,
    group_index: Mapping[str, Any],
    cohort_index: Mapping[str, Any],
    errors: list[str],
    dimensions: set[str],
    graph: dict[str, list[str]],
    assignable: set[str],
) -> None:
    path = f"$.group_blueprints[{index}]"
    dimension = group.get("primary_dimension")
    if isinstance(dimension, str):
        dimensions.add(dimension)
    references = require_references(
        group.get("referenced_group_ids"), group_index, errors, f"{path}.referenced_group_ids"
    )
    group_id = group.get("group_id")
    if isinstance(group_id, str):
        graph[group_id] = references
    validate_group_structure(group, path, dimension, group_id, errors, assignable)
    validate_group_values(group, path, dimension, references, cohort_index, errors)


def validate_group_structure(
    group: Mapping[str, Any],
    path: str,
    dimension: Any,
    group_id: Any,
    errors: list[str],
    assignable: set[str],
) -> None:
    validate_group_actions_and_assignment(group, path, dimension, group_id, errors, assignable)
    validate_group_membership(group, path, errors)


def validate_group_actions_and_assignment(
    group: Mapping[str, Any],
    path: str,
    dimension: Any,
    group_id: Any,
    errors: list[str],
    assignable: set[str],
) -> None:
    if array(group.get("actions"), errors, f"{path}.actions"):
        add(
            errors, f"{path}.actions", "initial university group blueprints may not contain actions"
        )
    if group.get("target_contract_required") is not True:
        add(errors, f"{path}.target_contract_required", "must be true")
    if group.get("assignment_eligible") is True:
        if dimension != "assignment" or group.get("group_kind") != "assignment_scope":
            add(
                errors,
                f"{path}.assignment_eligible",
                "only assignment-scope intersections may receive policies",
            )
        elif isinstance(group_id, str):
            assignable.add(group_id)


def validate_group_membership(group: Mapping[str, Any], path: str, errors: list[str]) -> None:
    if (
        group.get("membership_mode") == "dynamic"
        and group.get("future_membership_affects_scope") is not True
    ):
        add(
            errors,
            f"{path}.future_membership_affects_scope",
            "dynamic scope must acknowledge future membership",
        )
    validate_group_kind_and_mode(group, path, errors)
    validate_group_membership_fields(group, path, errors)


def validate_group_kind_and_mode(group: Mapping[str, Any], path: str, errors: list[str]) -> None:
    if group.get("group_kind") not in {
        "primitive",
        "assignment_scope",
        "compliance_state",
        "exception",
    }:
        add(errors, f"{path}.group_kind", "is not an allowed group blueprint kind")
    if group.get("membership_mode") not in {"static", "dynamic", "target_contract_required"}:
        add(errors, f"{path}.membership_mode", "is not an allowed membership mode")


def validate_group_membership_fields(
    group: Mapping[str, Any], path: str, errors: list[str]
) -> None:
    if group.get("membership_authority") not in {
        "device_inventory",
        "asset_purpose_register",
        "explicit_ring_register",
        "compliance_observation",
        "approved_exception_register",
        "boolean_intersection",
        "target_contract_required",
    }:
        add(errors, f"{path}.membership_authority", "is not an allowed source of group membership")
    if group.get("filter_tree") is not None and not isinstance(group.get("filter_tree"), Mapping):
        add(errors, f"{path}.filter_tree", "must be an object or null")
    for field in ("future_membership_affects_scope", "assignment_eligible"):
        if not isinstance(group.get(field), bool):
            add(errors, f"{path}.{field}", "must be Boolean")


def validate_group_values(
    group: Mapping[str, Any],
    path: str,
    dimension: Any,
    references: list[str],
    cohort_index: Mapping[str, Any],
    errors: list[str],
) -> None:
    if dimension not in REQUIRED_GROUP_DIMENSIONS:
        add(errors, f"{path}.primary_dimension", "is not an allowed group dimension")
    values = set(string_list(group.get("values"), errors, f"{path}.values", nonempty=True))
    expected = group_dimension_values(dimension, cohort_index)
    if expected is not None and values != expected:
        messages = {
            "platform": "must enumerate all four concrete platform families",
            "model": "must enumerate all supported design models",
            "cohort": "must enumerate every functional cohort ID",
            "ring": "must enumerate every rollout ring ID",
        }
        add(errors, f"{path}.values", messages[dimension])
    if dimension == "assignment" and not {
        "grp.platform",
        "grp.model",
        "grp.persona",
        "grp.ring",
    }.issubset(set(references)):
        add(
            errors,
            f"{path}.referenced_group_ids",
            "assignment scope must compose platform, model, persona, and ring dimensions",
        )


def group_dimension_values(dimension: Any, cohort_index: Mapping[str, Any]) -> set[str] | None:
    if dimension == "platform":
        return CONCRETE_PLATFORMS
    if dimension == "model":
        return MODELS
    if dimension == "cohort":
        return set(cohort_index)
    if dimension == "ring":
        return set(PROMOTION_CHAIN) | NON_PROMOTION_RINGS
    return None


def validate_rings(
    rings: list[Mapping[str, Any]], ring_index: Mapping[str, Any], errors: list[str]
) -> None:
    if set(ring_index) != set(PROMOTION_CHAIN) | NON_PROMOTION_RINGS:
        add(
            errors,
            "$.rollout_rings",
            "must define exactly LAB, PILOT, EARLY, BROAD, ELEVATED, and QUARANTINE",
        )
    validate_promotion_chain(ring_index, errors)
    validate_non_promotion_rings(ring_index, errors)
    for index, ring in enumerate(rings):
        validate_ring(ring, index, errors)


def validate_promotion_chain(
    ring_index: Mapping[str, Mapping[str, Any]], errors: list[str]
) -> None:
    for ring_id, (order, predecessor, minimum_days) in PROMOTION_CHAIN.items():
        ring = ring_index.get(ring_id)
        if ring is None:
            continue
        validate_promotion_ring(ring, ring_id, order, predecessor, minimum_days, errors)


def validate_promotion_ring(
    ring: Mapping[str, Any],
    ring_id: str,
    order: int,
    predecessor: str | None,
    minimum_days: int,
    errors: list[str],
) -> None:
    if ring.get("promotion_ring") is not True:
        add(errors, f"$.rollout_rings[{ring_id}].promotion_ring", "must be true")
    if ring.get("order") != order or ring.get("predecessor_ring_id") != predecessor:
        add(errors, f"$.rollout_rings[{ring_id}]", "does not match LAB -> PILOT -> EARLY -> BROAD")
    validate_promotion_ring_days(ring, ring_id, minimum_days, errors)


def validate_promotion_ring_days(
    ring: Mapping[str, Any], ring_id: str, minimum_days: int, errors: list[str]
) -> None:
    days = ring.get("minimum_business_days")
    if not isinstance(days, int) or isinstance(days, bool) or days < minimum_days:
        add(
            errors,
            f"$.rollout_rings[{ring_id}].minimum_business_days",
            f"must be at least {minimum_days}",
        )
    if ring_id != "ring.lab" and ring.get("approval_required") is not True:
        add(
            errors,
            f"$.rollout_rings[{ring_id}].approval_required",
            "promotion requires explicit approval",
        )


def validate_non_promotion_rings(
    ring_index: Mapping[str, Mapping[str, Any]], errors: list[str]
) -> None:
    for ring_id in NON_PROMOTION_RINGS:
        ring = ring_index.get(ring_id)
        if ring is not None and (
            ring.get("promotion_ring") is not False
            or ring.get("order") is not None
            or ring.get("predecessor_ring_id") is not None
        ):
            add(errors, f"$.rollout_rings[{ring_id}]", "must remain outside the promotion chain")


def validate_ring(ring: Mapping[str, Any], index: int, errors: list[str]) -> None:
    path = f"$.rollout_rings[{index}]"
    for field in ("promotion_ring", "approval_required"):
        if not isinstance(ring.get(field), bool):
            add(errors, f"{path}.{field}", "must be Boolean")
    validate_ring_machine_rule(ring, path, errors)
    scope_rule = ring.get("scope_rule")
    if not isinstance(scope_rule, str) or not scope_rule:
        add(errors, f"{path}.scope_rule", "must be non-empty")
    string_list(
        ring.get("rollback_thresholds"), errors, f"{path}.rollback_thresholds", nonempty=True
    )


def validate_ring_machine_rule(ring: Mapping[str, Any], path: str, errors: list[str]) -> None:
    ring_id = ring.get("ring_id")
    rule = RING_MACHINE_RULES.get(ring_id) if isinstance(ring_id, str) else None
    if rule is None:
        return
    scope_mode, percentage, minimum_devices, canonical_scope_rule = rule
    expected = {
        "scope_mode": scope_mode,
        "target_percentage": percentage,
        "minimum_devices": minimum_devices,
        "requires_frozen_membership": True,
        "dynamic_membership_allowed": False,
        "promotion_requires_new_plan": True,
    }
    for field, expected_value in expected.items():
        if ring.get(field) != expected_value:
            add(errors, f"{path}.{field}", f"must equal {expected_value!r} for {ring_id}")
    if ring.get("scope_rule") != canonical_scope_rule:
        add(
            errors,
            f"{path}.scope_rule",
            "must equal the canonical non-authoritative summary for scope_mode",
        )
