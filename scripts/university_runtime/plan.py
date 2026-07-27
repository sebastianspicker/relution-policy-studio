"""Deterministic execution-intent compiler for university profiles.

The compiler deliberately stops before target binding. Its output is an
immutable graph of abstract scope, definition, publication-prerequisite, and
assignment intents that can be inspected without network access. Cardinality
remains unresolved, and profile intent never becomes authorization.
"""

from __future__ import annotations

import copy
import re
from collections import defaultdict, deque
from typing import Any, Mapping, Sequence

from .io import canonical_sha256


PLAN_FORMAT = "relution-university-offline-intent-plan-v1"
PLAN_VERSION = "1.0.0"
PLAN_SCHEMA = "urn:campusweave-relution:schema:university-execution-plan:1.0.0"
STEP_KINDS = {
    "group_scope_blueprint",
    "policy_definition_intent",
    "policy_publication_prerequisite",
    "assignment_intent",
}
STEP_STATES = {"unbound"}
ROOT_KEYS = {
    "$schema",
    "schema_version",
    "document_type",
    "plan_status",
    "execution_authorized",
    "network_capable",
    "mutation_capable",
    "profile",
    "runtime_boundary",
    "phases",
    "steps",
    "blockers",
    "plan_sha256",
}
STEP_KEYS = {
    "step_id",
    "kind",
    "intent_id",
    "resource_type",
    "resource_cardinality",
    "dependencies",
    "concept_ids",
    "workflow_ids",
    "required_roles",
    "impact_tier_floor",
    "rollout_ring_id",
    "desired_state",
    "operation_bindings",
    "automatic_retry_allowed",
    "state",
    "blockers",
}


def _strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _workflow_index(profile: Mapping[str, Any]) -> dict[str, Mapping[str, Any]]:
    result: dict[str, Mapping[str, Any]] = {}
    for item in profile.get("api_workflows", []):
        if isinstance(item, Mapping) and isinstance(item.get("workflow_id"), str):
            result[item["workflow_id"]] = item
    return result


def _workflow_metadata(
    workflow_ids: Sequence[str],
    workflows: Mapping[str, Mapping[str, Any]],
) -> tuple[list[str], list[str]]:
    concept_ids: set[str] = set()
    roles: set[str] = set()
    for workflow_id in workflow_ids:
        workflow = workflows.get(workflow_id, {})
        concept_ids.update(_strings(workflow.get("concept_ids")))
        roles.update(_strings(workflow.get("required_roles")))
    return sorted(concept_ids), sorted(roles)


def _group_workflows(profile: Mapping[str, Any]) -> list[str]:
    return sorted(
        item["workflow_id"]
        for item in profile.get("api_workflows", [])
        if isinstance(item, Mapping)
        and isinstance(item.get("workflow_id"), str)
        and ".group." in item["workflow_id"]
    )


def _step_id(kind: str, intent_id: str) -> str:
    return f"{kind}:{intent_id}"


def _group_step(
    item: Mapping[str, Any],
    workflow_ids: list[str],
    workflows: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    group_id = str(item["group_id"])
    dependencies = [
        _step_id("group", dependency)
        for dependency in sorted(_strings(item.get("referenced_group_ids")))
    ]
    concept_ids, roles = _workflow_metadata(workflow_ids, workflows)
    return {
        "step_id": _step_id("group", group_id),
        "kind": "group_scope_blueprint",
        "intent_id": group_id,
        "resource_type": "abstract_group_scope",
        "resource_cardinality": "unresolved",
        "dependencies": dependencies,
        "concept_ids": concept_ids,
        "workflow_ids": workflow_ids,
        "required_roles": roles,
        "impact_tier_floor": 2,
        "rollout_ring_id": "ring.lab",
        "desired_state": {
            "group_kind": item.get("group_kind"),
            "membership_mode": item.get("membership_mode"),
            "primary_dimension": item.get("primary_dimension"),
            "values": copy.deepcopy(item.get("values")),
            "referenced_group_ids": copy.deepcopy(item.get("referenced_group_ids")),
            "assignment_eligible": item.get("assignment_eligible"),
        },
        "operation_bindings": [],
        "automatic_retry_allowed": False,
        "state": "unbound",
        "blockers": ["exact_target_contract_and_inventory_binding_required"],
    }


def _policy_step(
    item: Mapping[str, Any],
    workflows: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    policy_id = str(item["policy_id"])
    workflow_ids = sorted(_strings(item.get("workflow_ids")))
    workflow_concepts, roles = _workflow_metadata(workflow_ids, workflows)
    concept_ids = sorted(set(workflow_concepts) | set(_strings(item.get("concept_ids"))))
    return {
        "step_id": _step_id("policy", policy_id),
        "kind": "policy_definition_intent",
        "intent_id": policy_id,
        "resource_type": "abstract_policy_definition",
        "resource_cardinality": "unresolved",
        "dependencies": [],
        "concept_ids": concept_ids,
        "workflow_ids": workflow_ids,
        "required_roles": roles,
        "impact_tier_floor": item.get("impact_tier_floor"),
        "rollout_ring_id": "ring.lab",
        "desired_state": {
            "platform": item.get("platform"),
            "models": copy.deepcopy(item.get("models")),
            "cohort_ids": copy.deepcopy(item.get("cohort_ids")),
            "layer_id": item.get("layer_id"),
            "baseline_tier": item.get("baseline_tier"),
            "intent_settings": copy.deepcopy(item.get("intent_settings")),
            "desired_publication_state": item.get("desired_publication_state"),
            "activation_state": item.get("activation_state"),
        },
        "operation_bindings": [],
        "automatic_retry_allowed": False,
        "state": "unbound",
        "blockers": ["exact_operation_schema_and_before_state_required"],
    }


def _publication_step(
    item: Mapping[str, Any],
    workflows: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    policy_id = str(item["policy_id"])
    workflow_ids = sorted(
        workflow_id
        for workflow_id in _strings(item.get("workflow_ids"))
        if workflow_id.endswith(".policy-publication.v1")
    )
    concept_ids, roles = _workflow_metadata(workflow_ids, workflows)
    return {
        "step_id": _step_id("publication", policy_id),
        "kind": "policy_publication_prerequisite",
        "intent_id": policy_id,
        "resource_type": "abstract_policy_publication",
        "resource_cardinality": "unresolved",
        "dependencies": [_step_id("policy", policy_id)],
        "concept_ids": concept_ids,
        "workflow_ids": workflow_ids,
        "required_roles": roles,
        "impact_tier_floor": item.get("impact_tier_floor"),
        "rollout_ring_id": "ring.lab",
        "desired_state": {
            "policy_id": policy_id,
            "profile_definition_state": item.get("desired_publication_state"),
            "assignment_prerequisite": "one_exact_published_policy_version",
            "requires_separate_target_bound_plan": True,
        },
        "operation_bindings": [],
        "automatic_retry_allowed": False,
        "state": "unbound",
        "blockers": [
            "publication_is_not_authorized_by_the_profile",
            "exact_unpublished_version_readback_and_immediate_approval_required",
        ],
    }


def _assignment_step(
    item: Mapping[str, Any],
    workflows: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    assignment_id = str(item["assignment_id"])
    policy_id = str(item["policy_id"])
    group_id = str(item["scope_blueprint_id"])
    workflow_ids = sorted(
        workflow_id
        for workflow_id in workflows
        if workflow_id.endswith(".policy-assignment.v1")
    )
    concept_ids, roles = _workflow_metadata(workflow_ids, workflows)
    return {
        "step_id": _step_id("assignment", assignment_id),
        "kind": "assignment_intent",
        "intent_id": assignment_id,
        "resource_type": "abstract_policy_group_assignment",
        "resource_cardinality": "unresolved",
        "dependencies": [
            _step_id("group", group_id),
            _step_id("publication", policy_id),
        ],
        "concept_ids": concept_ids,
        "workflow_ids": workflow_ids,
        "required_roles": roles,
        "impact_tier_floor": item.get("impact_tier_floor"),
        "rollout_ring_id": item.get("ring_id"),
        "desired_state": {
            "policy_id": policy_id,
            "scope_blueprint_id": group_id,
            "cohort_ids": copy.deepcopy(item.get("cohort_ids")),
            "model": item.get("model"),
            "platform": item.get("platform"),
            "requires_published_policy": item.get("requires_published_policy"),
            "membership_snapshot_required": item.get("membership_snapshot_required"),
        },
        "operation_bindings": [],
        "automatic_retry_allowed": False,
        "state": "unbound",
        "blockers": [
            "published_policy_readback_required",
            "frozen_group_membership_required",
            "separate_immediate_approval_required",
        ],
    }


def build_execution_plan(profile: Mapping[str, Any], profile_sha256: str) -> dict[str, Any]:
    """Compile a validated commit-safe profile into an offline intent graph."""

    package = profile["package"]
    workflows = _workflow_index(profile)
    group_workflows = _group_workflows(profile)
    steps = [
        *(
            _group_step(item, group_workflows, workflows)
            for item in profile.get("group_blueprints", [])
            if isinstance(item, Mapping)
        ),
        *(
            _policy_step(item, workflows)
            for item in profile.get("policy_units", [])
            if isinstance(item, Mapping)
        ),
        *(
            _publication_step(item, workflows)
            for item in profile.get("policy_units", [])
            if isinstance(item, Mapping)
        ),
        *(
            _assignment_step(item, workflows)
            for item in profile.get("assignment_intents", [])
            if isinstance(item, Mapping)
        ),
    ]
    unresolved = sorted(
        str(item["input_id"])
        for item in profile.get("unresolved_inputs", [])
        if isinstance(item, Mapping) and isinstance(item.get("input_id"), str)
    )
    body: dict[str, Any] = {
        "$schema": PLAN_SCHEMA,
        "schema_version": PLAN_VERSION,
        "document_type": PLAN_FORMAT,
        "plan_status": "offline_valid",
        "execution_authorized": False,
        "network_capable": False,
        "mutation_capable": False,
        "profile": {
            "package_id": package["package_id"],
            "institution_code": package["institution_code"],
            "institution_label": package["institution_label"],
            "schema_version": profile["schema_version"],
            "sha256": profile_sha256,
        },
        "runtime_boundary": {
            "mode": "offline_planning_only",
            "target_contract_status": "unresolved",
            "target_binding_status": "unresolved",
            "inventory_status": "unresolved",
            "approval_status": "absent",
            "live_executor": None,
        },
        "phases": [
            {
                "phase_id": "P0_PROFILE_VALIDATION",
                "depends_on": [],
                "state": "ready",
                "gate_ids": ["G0_OFFLINE_VALID"],
            },
            {
                "phase_id": "P1_TARGET_BINDING",
                "depends_on": ["P0_PROFILE_VALIDATION"],
                "state": "blocked",
                "gate_ids": ["G1_CONTRACT_CURRENT", "G2_INVENTORY_RESOLVED", "G3_PERMISSION_READY"],
            },
            {
                "phase_id": "P2_LAB_PLAN",
                "depends_on": ["P1_TARGET_BINDING"],
                "state": "blocked",
                "gate_ids": ["G4_LAB_BUILD_VALID"],
            },
            {
                "phase_id": "P3_ONE_OBJECT_EXECUTION",
                "depends_on": ["P2_LAB_PLAN"],
                "state": "blocked",
                "gate_ids": ["G5_LAB_MUTATION_VERIFIED", "G6_LAB_ACTIVATED"],
            },
            {
                "phase_id": "P4_ROLLOUT",
                "depends_on": ["P3_ONE_OBJECT_EXECUTION"],
                "state": "blocked",
                "gate_ids": ["G7_PRECEDENCE_PROVEN", "G8_PILOT_APPROVED", "G9_EARLY_APPROVED", "G10_BROAD_APPROVED"],
            },
        ],
        "steps": steps,
        "blockers": [
            "No target context, inventory snapshot, operation binding, request artifact, before state, or approval is part of this offline plan.",
            *(f"Unresolved profile input: {input_id}" for input_id in unresolved),
        ],
    }
    return {**body, "plan_sha256": canonical_sha256(body)}


def _validate_dag(steps: Sequence[Mapping[str, Any]], errors: list[str]) -> None:
    identifiers: set[str] = set()
    for step in steps:
        identifier = step.get("step_id")
        if isinstance(identifier, str):
            identifiers.add(identifier)
    indegree: dict[str, int] = {identifier: 0 for identifier in identifiers}
    outgoing: dict[str, list[str]] = defaultdict(list)
    for step in steps:
        step_id = step.get("step_id")
        if not isinstance(step_id, str):
            continue
        dependencies = step.get("dependencies")
        if not isinstance(dependencies, list):
            errors.append(f"$.steps[{step_id}].dependencies: must be an array")
            continue
        for dependency in dependencies:
            if not isinstance(dependency, str):
                errors.append(f"$.steps[{step_id}].dependencies: values must be stable step IDs")
            elif dependency not in identifiers:
                errors.append(f"$.steps[{step_id}].dependencies: unknown step {dependency!r}")
            elif dependency == step_id:
                errors.append(f"$.steps[{step_id}].dependencies: self dependency is forbidden")
            else:
                indegree[step_id] += 1
                outgoing[dependency].append(step_id)
    queue = deque(sorted(identifier for identifier, count in indegree.items() if count == 0))
    visited = 0
    while queue:
        identifier = queue.popleft()
        visited += 1
        for successor in outgoing[identifier]:
            indegree[successor] -= 1
            if indegree[successor] == 0:
                queue.append(successor)
    if visited != len(identifiers):
        errors.append("$.steps: dependency graph contains a cycle")


def validate_execution_plan(
    document: Any,
    profile: Mapping[str, Any],
    profile_sha256: str,
) -> list[str]:
    """Validate identity, immutability, references, and the zero-execution boundary."""

    errors: list[str] = []
    if not isinstance(document, Mapping):
        return ["$: must be an object"]
    missing = ROOT_KEYS - set(document)
    unknown = set(document) - ROOT_KEYS
    if missing:
        errors.append(f"$: missing keys: {', '.join(sorted(missing))}")
    if unknown:
        errors.append(f"$: unknown keys: {', '.join(sorted(unknown))}")
    if document.get("$schema") != PLAN_SCHEMA:
        errors.append(f"$.$schema: must equal {PLAN_SCHEMA!r}")
    if document.get("schema_version") != PLAN_VERSION:
        errors.append(f"$.schema_version: must equal {PLAN_VERSION!r}")
    if document.get("document_type") != PLAN_FORMAT:
        errors.append("$.document_type: is not a university offline execution plan")
    if document.get("plan_status") != "offline_valid":
        errors.append("$.plan_status: must be offline_valid")
    for field in ("execution_authorized", "network_capable", "mutation_capable"):
        if document.get(field) is not False:
            errors.append(f"$.{field}: must be false in runtime v1")

    profile_ref = document.get("profile")
    package = profile.get("package", {})
    if not isinstance(profile_ref, Mapping):
        errors.append("$.profile: must be an object")
    else:
        expected_profile = {
            "package_id": package.get("package_id"),
            "institution_code": package.get("institution_code"),
            "institution_label": package.get("institution_label"),
            "schema_version": profile.get("schema_version"),
            "sha256": profile_sha256,
        }
        if dict(profile_ref) != expected_profile:
            errors.append("$.profile: does not match the supplied profile identity and digest")

    boundary = document.get("runtime_boundary")
    expected_boundary = {
        "mode": "offline_planning_only",
        "target_contract_status": "unresolved",
        "target_binding_status": "unresolved",
        "inventory_status": "unresolved",
        "approval_status": "absent",
        "live_executor": None,
    }
    if boundary != expected_boundary:
        errors.append("$.runtime_boundary: must remain strictly offline and unresolved")

    raw_steps = document.get("steps")
    steps = raw_steps if isinstance(raw_steps, list) else []
    if not isinstance(raw_steps, list):
        errors.append("$.steps: must be an array")
    identifiers: set[str] = set()
    for index, raw_step in enumerate(steps):
        location = f"$.steps[{index}]"
        if not isinstance(raw_step, Mapping):
            errors.append(f"{location}: must be an object")
            continue
        missing_step = STEP_KEYS - set(raw_step)
        unknown_step = set(raw_step) - STEP_KEYS
        if missing_step:
            errors.append(f"{location}: missing keys: {', '.join(sorted(missing_step))}")
        if unknown_step:
            errors.append(f"{location}: unknown keys: {', '.join(sorted(unknown_step))}")
        step_id = raw_step.get("step_id")
        if not isinstance(step_id, str) or re.fullmatch(
            r"(?:group|policy|publication|assignment):[a-z0-9][a-z0-9._-]*",
            step_id,
        ) is None:
            errors.append(f"{location}.step_id: has an invalid stable ID")
        elif step_id in identifiers:
            errors.append(f"{location}.step_id: duplicate step")
        else:
            identifiers.add(step_id)
        if raw_step.get("kind") not in STEP_KINDS:
            errors.append(f"{location}.kind: is invalid")
        if raw_step.get("state") not in STEP_STATES:
            errors.append(f"{location}.state: must remain unbound")
        if raw_step.get("resource_cardinality") != "unresolved":
            errors.append(f"{location}.resource_cardinality: must remain unresolved")
        if raw_step.get("operation_bindings") != []:
            errors.append(f"{location}.operation_bindings: runtime v1 cannot carry executable bindings")
        if raw_step.get("automatic_retry_allowed") is not False:
            errors.append(f"{location}.automatic_retry_allowed: must be false")
        if not isinstance(raw_step.get("blockers"), list) or not raw_step["blockers"]:
            errors.append(f"{location}.blockers: must state why this step is not executable")
    _validate_dag([step for step in steps if isinstance(step, Mapping)], errors)

    blockers = document.get("blockers")
    if not isinstance(blockers, list) or not blockers:
        errors.append("$.blockers: must state the unresolved target boundary")
    digest = document.get("plan_sha256")
    unsigned = {key: copy.deepcopy(value) for key, value in document.items() if key != "plan_sha256"}
    if not isinstance(digest, str) or re.fullmatch(r"[0-9a-f]{64}", digest) is None:
        errors.append("$.plan_sha256: must be a lowercase SHA-256 digest")
    elif digest != canonical_sha256(unsigned):
        errors.append("$.plan_sha256: does not match the canonical plan payload")
    if document != build_execution_plan(profile, profile_sha256):
        errors.append("$: plan does not equal the deterministic compilation of the supplied profile")
    return sorted(set(errors))


def instantiate_profile(
    template: Mapping[str, Any],
    institution_code: str,
    institution_label: str,
) -> dict[str, Any]:
    """Create a proposal from the reference profile without introducing target data."""

    if (
        len(institution_code) > 48
        or re.fullmatch(r"[a-z0-9][a-z0-9-]*", institution_code) is None
    ):
        raise ValueError(
            "institution code must be at most 48 lowercase letters, digits, or hyphens"
        )
    normalized_label = institution_label.strip()
    if not normalized_label or len(normalized_label) > 200:
        raise ValueError("institution label must contain 1 through 200 characters")
    source_package = template.get("package")
    if not isinstance(source_package, Mapping) or not isinstance(source_package.get("institution_code"), str):
        raise ValueError("template has no institution namespace")
    old_code = source_package["institution_code"]

    def replace(value: Any) -> Any:
        if isinstance(value, list):
            return [replace(item) for item in value]
        if isinstance(value, Mapping):
            return {key: replace(item) for key, item in value.items()}
        if not isinstance(value, str):
            return value
        if value == f"ou.{old_code}":
            return f"ou.{institution_code}"
        if value.startswith(f"{old_code}-policy."):
            return f"{institution_code}-policy.{value.removeprefix(f'{old_code}-policy.')}"
        if value.startswith(f"{old_code}.") and value.endswith(".v1"):
            return f"{institution_code}.{value.removeprefix(f'{old_code}.')}"
        if value == f"private/{old_code}":
            return f"private/{institution_code}"
        return value

    result = replace(template)
    package = result["package"]
    package["package_id"] = f"{institution_code}-relution-desired-state-v1"
    package["institution_code"] = institution_code
    package["institution_label"] = normalized_label
    for unit in result["organization_units"]:
        if unit.get("unit_id") == f"ou.{institution_code}" and unit.get("parent_unit_id") is None:
            unit["label"] = normalized_label
    return result
