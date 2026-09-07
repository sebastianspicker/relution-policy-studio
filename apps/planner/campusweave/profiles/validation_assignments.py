"""University profile validation for this domain."""

from __future__ import annotations

from typing import Any, Mapping

from .constants import (
    ASSIGNMENT_KEYS,
    COMMIT_BOUNDARY_KEYS,
    CONCRETE_PLATFORMS,
    GATE_KEYS,
    MODELS,
    PLATFORMS,
    UNRESOLVED_KEYS,
)
from .helpers import (
    add,
    exact_keys,
    mapping,
    records,
    require_reference,
    require_references,
    scan_commit_boundary,
    string_list,
)
from .validation_shared import ValidationContext


def validate_assignments_and_gates(context: ValidationContext) -> None:
    """Validate assignment and activation domains and publish the gate index."""
    root = context.root
    if root is None:
        return
    assignments, _ = records(
        root, "assignment_intents", ASSIGNMENT_KEYS, "assignment_id", context.errors
    )
    validate_assignments(assignments, context)
    gate_index = validate_gates(context)
    validate_commit_boundary(context)
    validate_unresolved_inputs(context, gate_index)
    scan_commit_boundary(root, context.errors)
    context.gate_index = gate_index


def validate_assignments(assignments: list[Mapping[str, Any]], context: ValidationContext) -> None:
    baseline_platforms: set[str] = set()
    for index, assignment in enumerate(assignments):
        validate_assignment(assignment, index, context, baseline_platforms)
    if baseline_platforms != CONCRETE_PLATFORMS:
        missing = sorted(CONCRETE_PLATFORMS - baseline_platforms)
        add(
            context.errors,
            "$.assignment_intents",
            f"missing LAB intents for corporate baselines: {', '.join(missing)}",
        )


def validate_assignment(
    assignment: Mapping[str, Any],
    index: int,
    context: ValidationContext,
    baseline_platforms: set[str],
) -> None:
    path = f"$.assignment_intents[{index}]"
    policy_id, scope_id = assignment.get("policy_id"), assignment.get("scope_blueprint_id")
    require_reference(policy_id, context.policy_index, context.errors, f"{path}.policy_id")
    require_reference(scope_id, context.group_index, context.errors, f"{path}.scope_blueprint_id")
    if scope_id not in context.assignable_groups:
        add(
            context.errors,
            f"{path}.scope_blueprint_id",
            "must reference an assignable intersection blueprint",
        )
    cohorts = require_references(
        assignment.get("cohort_ids"),
        context.cohort_index,
        context.errors,
        f"{path}.cohort_ids",
        nonempty=True,
    )
    validate_assignment_values(
        assignment, path, cohorts, context.errors, context.cohort_index, context.ring_index
    )
    policy = context.policy_index.get(policy_id) if isinstance(policy_id, str) else None
    if isinstance(policy, Mapping):
        validate_policy_assignment_compatibility(
            assignment, policy, path, cohorts, context, baseline_platforms
        )


def validate_assignment_values(
    assignment: Mapping[str, Any],
    path: str,
    cohorts: list[str],
    errors: list[str],
    cohort_index: Mapping[str, Mapping[str, Any]],
    ring_index: Mapping[str, Any],
) -> None:
    require_reference(assignment.get("ring_id"), ring_index, errors, f"{path}.ring_id")
    if assignment.get("ring_id") != "ring.lab":
        add(errors, f"{path}.ring_id", "commit-safe assignment intent must begin in LAB")
    validate_assignment_invariants(assignment, path, errors)
    validate_assignment_scope(assignment, path, cohorts, cohort_index, errors)


def validate_assignment_invariants(
    assignment: Mapping[str, Any], path: str, errors: list[str]
) -> None:
    expected = {
        "state": "unbound",
        "requires_published_policy": True,
        "membership_snapshot_required": True,
    }
    for field, expected_value in expected.items():
        if assignment.get(field) != expected_value:
            add(errors, f"{path}.{field}", f"must equal {expected_value!r}")
    impact = assignment.get("impact_tier_floor")
    if not isinstance(impact, int) or isinstance(impact, bool) or impact < 2 or impact > 4:
        add(
            errors, f"{path}.impact_tier_floor", "assignment intent must be impact Tier 2 through 4"
        )
    if assignment.get("model") not in MODELS:
        add(errors, f"{path}.model", "is not an allowed device model")


def validate_assignment_scope(
    assignment: Mapping[str, Any],
    path: str,
    cohorts: list[str],
    cohort_index: Mapping[str, Mapping[str, Any]],
    errors: list[str],
) -> None:
    for cohort_id in cohorts:
        eligible = cohort_index.get(cohort_id, {}).get("eligible_models")
        if isinstance(eligible, list) and assignment.get("model") not in eligible:
            add(
                errors,
                f"{path}.cohort_ids",
                f"{cohort_id!r} is not eligible for the assignment model",
            )
    if assignment.get("platform") not in PLATFORMS:
        add(errors, f"{path}.platform", "is not an allowed platform")
    string_list(assignment.get("notes"), errors, f"{path}.notes")
    if assignment.get("model") in {"shared", "kiosk"}:
        add(
            errors,
            f"{path}.model",
            "shared and kiosk candidates require resolved inventory before any assignment intent",
        )


def validate_policy_assignment_compatibility(
    assignment: Mapping[str, Any],
    policy: Mapping[str, Any],
    path: str,
    cohorts: list[str],
    context: ValidationContext,
    baseline_platforms: set[str],
) -> None:
    validate_assignment_impact(assignment, policy, path, context.errors)
    if assignment.get("platform") != policy.get("platform"):
        add(context.errors, f"{path}.platform", "must match the policy platform")
    policy_models = policy.get("models")
    model = assignment.get("model")
    if (
        not isinstance(policy_models, list)
        or not isinstance(model, str)
        or model not in policy_models
    ):
        add(context.errors, f"{path}.model", "is not eligible for the policy")
    policy_cohorts = policy.get("cohort_ids") if isinstance(policy.get("cohort_ids"), list) else []
    if policy_cohorts and not set(cohorts).issubset(set(policy_cohorts)):
        add(context.errors, f"{path}.cohort_ids", "contains a cohort not eligible for the policy")
    collect_baseline_assignment_platform(
        assignment, policy, context.layer_index, baseline_platforms
    )


def validate_assignment_impact(
    assignment: Mapping[str, Any], policy: Mapping[str, Any], path: str, errors: list[str]
) -> None:
    impact, policy_impact = assignment.get("impact_tier_floor"), policy.get("impact_tier_floor")
    if (
        isinstance(impact, int)
        and not isinstance(impact, bool)
        and isinstance(policy_impact, int)
        and not isinstance(policy_impact, bool)
        and impact < policy_impact
    ):
        add(
            errors,
            f"{path}.impact_tier_floor",
            "must not be lower than the referenced policy impact floor",
        )


def collect_baseline_assignment_platform(
    assignment: Mapping[str, Any],
    policy: Mapping[str, Any],
    layer_index: Mapping[str, Any],
    baseline_platforms: set[str],
) -> None:
    layer_id = policy.get("layer_id")
    layer = layer_index.get(layer_id) if isinstance(layer_id, str) else None
    if (
        assignment.get("model") == "corp"
        and isinstance(layer, Mapping)
        and layer.get("order") == 1
        and assignment.get("platform") in CONCRETE_PLATFORMS
    ):
        baseline_platforms.add(str(assignment.get("platform")))


def validate_gates(context: ValidationContext) -> dict[str, Mapping[str, Any]]:
    root = context.root
    if root is None:
        return {}
    gates, gate_index = records(root, "activation_gates", GATE_KEYS, "gate_id", context.errors)
    expected_ids = {
        f"G{index}_{name}"
        for index, name in enumerate(
            (
                "OFFLINE_VALID",
                "CONTRACT_CURRENT",
                "INVENTORY_RESOLVED",
                "PERMISSION_READY",
                "LAB_BUILD_VALID",
                "LAB_MUTATION_VERIFIED",
                "LAB_ACTIVATED",
                "PRECEDENCE_PROVEN",
                "PILOT_APPROVED",
                "EARLY_APPROVED",
                "BROAD_APPROVED",
            )
        )
    }
    validate_gate_sequence(gates, gate_index, expected_ids, context.errors)
    for index, gate in enumerate(gates):
        validate_gate(gate, index, context.errors)
    return gate_index


def validate_gate_sequence(
    gates: list[Mapping[str, Any]],
    gate_index: Mapping[str, Any],
    expected_ids: set[str],
    errors: list[str],
) -> None:
    if set(gate_index) != expected_ids:
        add(
            errors,
            "$.activation_gates",
            "must define the complete G0 through G10 activation sequence",
        )
    orders = [gate.get("order") for gate in gates]
    if sorted(
        item for item in orders if isinstance(item, int) and not isinstance(item, bool)
    ) != list(range(11)):
        add(errors, "$.activation_gates", "gate orders must cover 0 through 10 exactly once")


def validate_gate(gate: Mapping[str, Any], index: int, errors: list[str]) -> None:
    path = f"$.activation_gates[{index}]"
    if gate.get("status") == "passed":
        add(
            errors,
            f"{path}.status",
            "gate results are target-local evidence and cannot be pre-passed",
        )
    elif gate.get("status") not in {"defined", "blocked"}:
        add(errors, f"{path}.status", "must be defined or blocked")
    string_list(gate.get("required_evidence"), errors, f"{path}.required_evidence", nonempty=True)
    string_list(gate.get("blocks"), errors, f"{path}.blocks")


def validate_commit_boundary(context: ValidationContext) -> None:
    root = context.root
    if root is None:
        return
    boundary = mapping(root.get("commit_boundary"), context.errors, "$.commit_boundary")
    if boundary is None:
        return
    exact_keys(boundary, COMMIT_BOUNDARY_KEYS, context.errors, "$.commit_boundary")
    expected_root = (
        f"private/{context.institution_code}"
        if context.institution_code
        else "private/<institution_code>"
    )
    if boundary.get("target_local_root") != expected_root:
        add(
            context.errors,
            "$.commit_boundary.target_local_root",
            f"must be the ignored target-local root {expected_root}",
        )
    for field in ("commit_safe_classes", "target_local_classes", "forbidden_classes"):
        string_list(
            boundary.get(field), context.errors, f"$.commit_boundary.{field}", nonempty=True
        )


def validate_unresolved_inputs(context: ValidationContext, gate_index: Mapping[str, Any]) -> None:
    root = context.root
    if root is None:
        return
    unresolved, _ = records(root, "unresolved_inputs", UNRESOLVED_KEYS, "input_id", context.errors)
    if not unresolved:
        add(
            context.errors,
            "$.unresolved_inputs",
            "must state the target and inventory evidence still missing",
        )
    for index, item in enumerate(unresolved):
        _validate_unresolved_input(item, index, gate_index, context.errors)


def _validate_unresolved_input(
    item: Mapping[str, Any], index: int, gate_index: Mapping[str, Any], errors: list[str]
) -> None:
    path = f"$.unresolved_inputs[{index}]"
    require_references(
        item.get("blocks_gate_ids"), gate_index, errors, f"{path}.blocks_gate_ids", nonempty=True
    )
    if item.get("status") != "unresolved":
        add(errors, f"{path}.status", "commit-safe target inputs must remain unresolved")
    if not isinstance(item.get("description"), str) or not item["description"]:
        add(errors, f"{path}.description", "must be non-empty")
    if not isinstance(item.get("resolution_evidence"), str) or not item["resolution_evidence"]:
        add(errors, f"{path}.resolution_evidence", "must be non-empty")
