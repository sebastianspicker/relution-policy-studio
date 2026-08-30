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

from ..private_artifacts import canonical_sha256

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
        workflow_id for workflow_id in workflows if workflow_id.endswith(".policy-assignment.v1")
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
    steps = _build_steps(profile, workflows)
    body = _plan_body(package, profile, profile_sha256, steps)
    return {**body, "plan_sha256": canonical_sha256(body)}


def _build_steps(
    profile: Mapping[str, Any], workflows: Mapping[str, Mapping[str, Any]]
) -> list[dict[str, Any]]:
    group_workflows = _group_workflows(profile)
    groups = _mapped_steps(
        profile.get("group_blueprints"), lambda item: _group_step(item, group_workflows, workflows)
    )
    policies = _mapped_steps(
        profile.get("policy_units"), lambda item: _policy_step(item, workflows)
    )
    publications = _mapped_steps(
        profile.get("policy_units"), lambda item: _publication_step(item, workflows)
    )
    assignments = _mapped_steps(
        profile.get("assignment_intents"), lambda item: _assignment_step(item, workflows)
    )
    return [*groups, *policies, *publications, *assignments]


def _mapped_steps(raw: Any, builder: Any) -> list[dict[str, Any]]:
    return [builder(item) for item in raw or [] if isinstance(item, Mapping)]


def _plan_body(
    package: Mapping[str, Any],
    profile: Mapping[str, Any],
    profile_sha256: str,
    steps: list[dict[str, Any]],
) -> dict[str, Any]:
    unresolved = sorted(
        str(item["input_id"])
        for item in profile.get("unresolved_inputs", [])
        if isinstance(item, Mapping) and isinstance(item.get("input_id"), str)
    )
    return {
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
        "phases": _phases(),
        "steps": steps,
        "blockers": [
            "No target context, inventory snapshot, operation binding, request artifact, before state, or approval is part of this offline plan.",
            *(f"Unresolved profile input: {input_id}" for input_id in unresolved),
        ],
    }


def _phases() -> list[dict[str, Any]]:
    phases = [("P0_PROFILE_VALIDATION", [], "ready", ["G0_OFFLINE_VALID"])]
    phases += [
        (
            "P1_TARGET_BINDING",
            ["P0_PROFILE_VALIDATION"],
            "blocked",
            ["G1_CONTRACT_CURRENT", "G2_INVENTORY_RESOLVED", "G3_PERMISSION_READY"],
        )
    ]
    phases += [("P2_LAB_PLAN", ["P1_TARGET_BINDING"], "blocked", ["G4_LAB_BUILD_VALID"])]
    phases += [
        (
            "P3_ONE_OBJECT_EXECUTION",
            ["P2_LAB_PLAN"],
            "blocked",
            ["G5_LAB_MUTATION_VERIFIED", "G6_LAB_ACTIVATED"],
        )
    ]
    phases += [
        (
            "P4_ROLLOUT",
            ["P3_ONE_OBJECT_EXECUTION"],
            "blocked",
            [
                "G7_PRECEDENCE_PROVEN",
                "G8_PILOT_APPROVED",
                "G9_EARLY_APPROVED",
                "G10_BROAD_APPROVED",
            ],
        )
    ]
    return [
        {"phase_id": id_, "depends_on": deps, "state": state, "gate_ids": gates}
        for id_, deps, state, gates in phases
    ]


def _validate_dag(steps: Sequence[Mapping[str, Any]], errors: list[str]) -> None:
    identifiers = _step_identifiers(steps)
    indegree: dict[str, int] = {identifier: 0 for identifier in identifiers}
    outgoing: dict[str, list[str]] = defaultdict(list)
    for step in steps:
        _add_step_edges(step, identifiers, indegree, outgoing, errors)
    _check_dag_cycles(identifiers, indegree, outgoing, errors)


def _step_identifiers(steps: Sequence[Mapping[str, Any]]) -> set[str]:
    return {step["step_id"] for step in steps if isinstance(step.get("step_id"), str)}


def _add_step_edges(
    step: Mapping[str, Any],
    identifiers: set[str],
    indegree: dict[str, int],
    outgoing: dict[str, list[str]],
    errors: list[str],
) -> None:
    step_id = step.get("step_id")
    if not isinstance(step_id, str):
        return
    dependencies = step.get("dependencies")
    if not isinstance(dependencies, list):
        errors.append(f"$.steps[{step_id}].dependencies: must be an array")
        return
    for dependency in dependencies:
        _add_dependency(step_id, dependency, identifiers, indegree, outgoing, errors)


def _add_dependency(
    step_id: str,
    dependency: Any,
    identifiers: set[str],
    indegree: dict[str, int],
    outgoing: dict[str, list[str]],
    errors: list[str],
) -> None:
    location = f"$.steps[{step_id}].dependencies"
    if not isinstance(dependency, str):
        errors.append(f"{location}: values must be stable step IDs")
    elif dependency not in identifiers:
        errors.append(f"{location}: unknown step {dependency!r}")
    elif dependency == step_id:
        errors.append(f"{location}: self dependency is forbidden")
    else:
        indegree[step_id] += 1
        outgoing[dependency].append(step_id)


def _check_dag_cycles(
    identifiers: set[str],
    indegree: dict[str, int],
    outgoing: dict[str, list[str]],
    errors: list[str],
) -> None:
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


def _validate_plan_root(
    document: Mapping[str, Any], profile: Mapping[str, Any], profile_sha256: str, errors: list[str]
) -> None:
    missing = ROOT_KEYS - set(document)
    unknown = set(document) - ROOT_KEYS
    if missing:
        errors.append(f"$: missing keys: {', '.join(sorted(missing))}")
    if unknown:
        errors.append(f"$: unknown keys: {', '.join(sorted(unknown))}")
    _validate_root_identity(document, errors)
    _validate_root_flags(document, errors)
    _validate_root_profile(document, profile, profile_sha256, errors)
    _validate_root_boundary(document, errors)


def _validate_root_identity(document: Mapping[str, Any], errors: list[str]) -> None:
    expected = {
        "$schema": PLAN_SCHEMA,
        "schema_version": PLAN_VERSION,
        "document_type": PLAN_FORMAT,
        "plan_status": "offline_valid",
    }
    for field, value in expected.items():
        if document.get(field) != value:
            message = {
                "document_type": "$.document_type: is not a university offline execution plan",
                "plan_status": "$.plan_status: must be offline_valid",
            }.get(field)
            errors.append(message or f"$.{field}: must equal {value!r}")


def _validate_root_flags(document: Mapping[str, Any], errors: list[str]) -> None:
    for field in ("execution_authorized", "network_capable", "mutation_capable"):
        if document.get(field) is not False:
            errors.append(f"$.{field}: must be false in runtime v1")


def _validate_root_profile(
    document: Mapping[str, Any], profile: Mapping[str, Any], profile_sha256: str, errors: list[str]
) -> None:
    package = profile.get("package", {})
    expected = {
        "package_id": package.get("package_id"),
        "institution_code": package.get("institution_code"),
        "institution_label": package.get("institution_label"),
        "schema_version": profile.get("schema_version"),
        "sha256": profile_sha256,
    }
    if not isinstance(document.get("profile"), Mapping):
        errors.append("$.profile: must be an object")
    elif dict(document["profile"]) != expected:
        errors.append("$.profile: does not match the supplied profile identity and digest")


def _validate_root_boundary(document: Mapping[str, Any], errors: list[str]) -> None:
    expected = {
        "mode": "offline_planning_only",
        "target_contract_status": "unresolved",
        "target_binding_status": "unresolved",
        "inventory_status": "unresolved",
        "approval_status": "absent",
        "live_executor": None,
    }
    if document.get("runtime_boundary") != expected:
        errors.append("$.runtime_boundary: must remain strictly offline and unresolved")


def _validate_step(
    step: Any, index: int, identifiers: set[str], errors: list[str]
) -> Mapping[str, Any] | None:
    location = f"$.steps[{index}]"
    if not isinstance(step, Mapping):
        errors.append(f"{location}: must be an object")
        return None
    _validate_step_shape(step, location, errors)
    _validate_step_id(step, location, identifiers, errors)
    _validate_step_runtime(step, location, errors)
    return step


def _validate_step_shape(step: Mapping[str, Any], location: str, errors: list[str]) -> None:
    missing = STEP_KEYS - set(step)
    unknown = set(step) - STEP_KEYS
    if missing:
        errors.append(f"{location}: missing keys: {', '.join(sorted(missing))}")
    if unknown:
        errors.append(f"{location}: unknown keys: {', '.join(sorted(unknown))}")


def _validate_step_id(
    step: Mapping[str, Any], location: str, identifiers: set[str], errors: list[str]
) -> None:
    step_id = step.get("step_id")
    if (
        not isinstance(step_id, str)
        or re.fullmatch(r"(?:group|policy|publication|assignment):[a-z0-9][a-z0-9._-]*", step_id)
        is None
    ):
        errors.append(f"{location}.step_id: has an invalid stable ID")
    elif step_id in identifiers:
        errors.append(f"{location}.step_id: duplicate step")
    else:
        identifiers.add(step_id)


def _validate_step_runtime(step: Mapping[str, Any], location: str, errors: list[str]) -> None:
    checks = (
        ("kind", step.get("kind") not in STEP_KINDS, "is invalid"),
        ("state", step.get("state") not in STEP_STATES, "must remain unbound"),
        (
            "resource_cardinality",
            step.get("resource_cardinality") != "unresolved",
            "must remain unresolved",
        ),
        (
            "operation_bindings",
            step.get("operation_bindings") != [],
            "runtime v1 cannot carry executable bindings",
        ),
        (
            "automatic_retry_allowed",
            step.get("automatic_retry_allowed") is not False,
            "must be false",
        ),
    )
    for field, invalid, message in checks:
        if invalid:
            errors.append(f"{location}.{field}: {message}")
    if not isinstance(step.get("blockers"), list) or not step["blockers"]:
        errors.append(f"{location}.blockers: must state why this step is not executable")


def _validate_plan_digest(
    document: Mapping[str, Any], profile: Mapping[str, Any], profile_sha256: str, errors: list[str]
) -> None:
    blockers = document.get("blockers")
    if not isinstance(blockers, list) or not blockers:
        errors.append("$.blockers: must state the unresolved target boundary")
    _validate_plan_digest_value(document, errors)
    if document != build_execution_plan(profile, profile_sha256):
        errors.append(
            "$: plan does not equal the deterministic compilation of the supplied profile"
        )


def _validate_plan_digest_value(document: Mapping[str, Any], errors: list[str]) -> None:
    digest = document.get("plan_sha256")
    unsigned = {
        key: copy.deepcopy(value) for key, value in document.items() if key != "plan_sha256"
    }
    if not isinstance(digest, str) or re.fullmatch(r"[0-9a-f]{64}", digest) is None:
        errors.append("$.plan_sha256: must be a lowercase SHA-256 digest")
    elif digest != canonical_sha256(unsigned):
        errors.append("$.plan_sha256: does not match the canonical plan payload")


def validate_execution_plan(
    document: Any,
    profile: Mapping[str, Any],
    profile_sha256: str,
) -> list[str]:
    """Validate identity, immutability, references, and the zero-execution boundary."""

    errors: list[str] = []
    if not isinstance(document, Mapping):
        return ["$: must be an object"]
    raw_steps = document.get("steps")
    steps = raw_steps if isinstance(raw_steps, list) else []
    _validate_plan_root(document, profile, profile_sha256, errors)
    if not isinstance(raw_steps, list):
        errors.append("$.steps: must be an array")
    identifiers: set[str] = set()
    for index, raw_step in enumerate(steps):
        _validate_step(raw_step, index, identifiers, errors)
    _validate_dag([step for step in steps if isinstance(step, Mapping)], errors)
    _validate_plan_digest(document, profile, profile_sha256, errors)
    return sorted(set(errors))


def instantiate_profile(
    template: Mapping[str, Any],
    institution_code: str,
    institution_label: str,
) -> dict[str, Any]:
    """Create a proposal from the reference profile without introducing target data."""

    _validate_institution_code(institution_code)
    normalized_label = _normalize_institution_label(institution_label)
    source_package = template.get("package")
    if not isinstance(source_package, Mapping) or not isinstance(
        source_package.get("institution_code"), str
    ):
        raise ValueError("template has no institution namespace")
    old_code = source_package["institution_code"]

    result = _replace_profile_values(template, old_code, institution_code)
    package = result["package"]
    package["package_id"] = f"{institution_code}-relution-desired-state-v1"
    package["institution_code"] = institution_code
    package["institution_label"] = normalized_label
    for unit in result["organization_units"]:
        if unit.get("unit_id") == f"ou.{institution_code}" and unit.get("parent_unit_id") is None:
            unit["label"] = normalized_label
    return result


def _validate_institution_code(value: str) -> None:
    if len(value) > 48 or re.fullmatch(r"[a-z0-9][a-z0-9-]*", value) is None:
        raise ValueError(
            "institution code must be at most 48 lowercase letters, digits, or hyphens"
        )


def _normalize_institution_label(value: str) -> str:
    normalized = value.strip()
    if not normalized or len(normalized) > 200:
        raise ValueError("institution label must contain 1 through 200 characters")
    return normalized


def _replace_profile_values(value: Any, old_code: str, new_code: str) -> Any:
    if isinstance(value, list):
        return [_replace_profile_values(item, old_code, new_code) for item in value]
    if isinstance(value, Mapping):
        return {
            key: _replace_profile_values(item, old_code, new_code) for key, item in value.items()
        }
    if not isinstance(value, str):
        return value
    return _replace_profile_string(value, old_code, new_code)


def _replace_profile_string(value: str, old_code: str, new_code: str) -> str:
    substitutions = {
        f"ou.{old_code}": f"ou.{new_code}",
        f"private/{old_code}": f"private/{new_code}",
    }
    if value in substitutions:
        return substitutions[value]
    if value.startswith(f"{old_code}-policy."):
        return f"{new_code}-policy.{value.removeprefix(f'{old_code}-policy.')}"
    if value.startswith(f"{old_code}.") and value.endswith(".v1"):
        return f"{new_code}.{value.removeprefix(f'{old_code}.')}"
    return value
