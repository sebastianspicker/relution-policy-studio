"""University profile validation for this domain."""

from __future__ import annotations

import re
from typing import Any, Mapping

from .constants import (
    BINDING_ROLES,
    BYOD_ALLOWED_CAPABILITIES,
    BYOD_PROHIBITIONS,
    CONCRETE_PLATFORMS,
    INTENT_SETTING_CONTRACTS,
    INTENT_SETTING_KEYS,
    LAYER_KEYS,
    MODELS,
    MUTATION_BINDING_ROLES,
    PLATFORMS,
    POLICY_KEYS,
    REQUIRED_WORKFLOW_SUFFIXES,
    WORKFLOW_KEYS,
    WORKFLOW_MINIMUM_ROLES_BY_SUFFIX,
)
from .helpers import (
    add,
    array,
    exact_keys,
    mapping,
    records,
    require_reference,
    require_references,
    string_list,
)
from .validation_shared import ValidationContext


def validate_layers_and_policies(context: ValidationContext) -> None:
    """Validate policy layers, API workflows, and policy intents."""
    root = context.root
    if root is None:
        return
    layers, layer_index = records(root, "policy_layers", LAYER_KEYS, "layer_id", context.errors)
    validate_layers(layers, context.errors)
    workflows, workflow_index = records(
        root, "api_workflows", WORKFLOW_KEYS, "workflow_id", context.errors
    )
    validate_workflows(workflows, workflow_index, context)
    policies, policy_index = records(root, "policy_units", POLICY_KEYS, "policy_id", context.errors)
    validate_policies(policies, layer_index, workflow_index, context)
    context.layer_index = layer_index
    context.policy_index = policy_index


def validate_layers(layers: list[Mapping[str, Any]], errors: list[str]) -> None:
    if valid_layer_orders(layers) != list(range(8)):
        add(
            errors, "$.policy_layers", "must contain each REXP layer order 0 through 7 exactly once"
        )
    for index, layer in enumerate(layers):
        order = layer.get("order")
        if not isinstance(order, int) or isinstance(order, bool) or order not in range(8):
            add(errors, f"$.policy_layers[{index}].order", "must be an integer from 0 through 7")


def valid_layer_orders(layers: list[Mapping[str, Any]]) -> list[int]:
    valid: list[int] = []
    for layer in layers:
        order = layer.get("order")
        if isinstance(order, int) and not isinstance(order, bool):
            valid.append(order)
    return sorted(valid)


def validate_workflows(
    workflows: list[Mapping[str, Any]],
    workflow_index: Mapping[str, Any],
    context: ValidationContext,
) -> None:
    required = {f"{context.institution_code}.{suffix}" for suffix in REQUIRED_WORKFLOW_SUFFIXES}
    missing = sorted(required - set(workflow_index))
    if missing:
        add(
            context.errors,
            "$.api_workflows",
            f"missing required university workflows: {', '.join(missing)}",
        )
    for index, workflow in enumerate(workflows):
        validate_workflow(workflow, index, context)


def validate_workflow(workflow: Mapping[str, Any], index: int, context: ValidationContext) -> None:
    path = f"$.api_workflows[{index}]"
    require_references(
        workflow.get("concept_ids"),
        context.concept_ids,
        context.errors,
        f"{path}.concept_ids",
        nonempty=True,
    )
    roles = set(
        string_list(
            workflow.get("required_roles"), context.errors, f"{path}.required_roles", nonempty=True
        )
    )
    unknown = roles - BINDING_ROLES
    if unknown:
        add(
            context.errors,
            f"{path}.required_roles",
            f"unknown binding roles: {', '.join(sorted(unknown))}",
        )
    validate_workflow_invariants(workflow, path, context.errors)
    suffix = workflow_suffix(workflow.get("workflow_id"), context.institution_code)
    if context.institution_code and isinstance(workflow.get("workflow_id"), str) and not suffix:
        add(
            context.errors,
            f"{path}.workflow_id",
            f"must use the {context.institution_code!r} institution namespace",
        )
    missing = sorted(WORKFLOW_MINIMUM_ROLES_BY_SUFFIX.get(suffix, set()) - roles)
    if missing:
        add(
            context.errors,
            f"{path}.required_roles",
            f"workflow lacks required roles: {', '.join(missing)}",
        )
    validate_mutation_workflow(workflow, path, roles, context.errors)


def workflow_suffix(workflow_id: Any, institution_code: str) -> str:
    if (
        isinstance(workflow_id, str)
        and institution_code
        and workflow_id.startswith(f"{institution_code}.")
    ):
        return workflow_id[len(institution_code) + 1 :]
    return ""


def validate_workflow_invariants(workflow: Mapping[str, Any], path: str, errors: list[str]) -> None:
    expected = {
        "binding_status": "target_contract_required",
        "organization_scope_required": True,
        "exact_target_contract_required": True,
        "output_plan_granularity": "one_resource_one_organization",
        "automatic_retry_allowed": False,
    }
    for field, expected_value in expected.items():
        if workflow.get(field) != expected_value:
            add(errors, f"{path}.{field}", f"must equal {expected_value!r}")


def validate_mutation_workflow(
    workflow: Mapping[str, Any], path: str, roles: set[str], errors: list[str]
) -> None:
    if workflow.get("mutation_capable") is True:
        missing = {"read", "readback", "audit"} - roles
        if missing:
            add(
                errors,
                f"{path}.required_roles",
                f"mutation workflow lacks {', '.join(sorted(missing))}",
            )
        if not roles.intersection(MUTATION_BINDING_ROLES):
            add(
                errors,
                f"{path}.required_roles",
                "mutation-capable workflow must declare a mutation role",
            )
        if not roles.intersection({"rollback", "unassign"}):
            add(
                errors,
                f"{path}.required_roles",
                "mutation workflow needs rollback or an explicit compensating role",
            )
    elif workflow.get("mutation_capable") is not False:
        add(errors, f"{path}.mutation_capable", "must be Boolean")


def validate_policies(
    policies: list[Mapping[str, Any]],
    layer_index: Mapping[str, Any],
    workflow_index: Mapping[str, Any],
    context: ValidationContext,
) -> None:
    state = PolicyState()
    for index, policy in enumerate(policies):
        validate_policy(policy, index, layer_index, workflow_index, context, state)
    validate_policy_coverage(state, context.errors)


class PolicyState:
    def __init__(self) -> None:
        self.setting_writers: dict[tuple[str, str, str, str], str] = {}
        self.capability_writers: dict[tuple[str, str, str, str], str] = {}
        self.corporate_platforms: set[str] = set()
        self.byod_platforms: set[str] = set()
        self.privileged_platforms: set[str] = set()
        self.covered_layers: set[int] = set()


class PolicySettingScope:
    def __init__(self, platform: Any, models: list[str], cohorts: list[str]) -> None:
        self.platform = platform
        self.models = models
        self.cohorts = cohorts


def validate_policy(
    policy: Mapping[str, Any],
    index: int,
    layer_index: Mapping[str, Any],
    workflow_index: Mapping[str, Any],
    context: ValidationContext,
    state: PolicyState,
) -> None:
    path = f"$.policy_units[{index}]"
    platform, models, layer = validate_policy_identity(policy, path, layer_index, context, state)
    cohorts = require_references(
        policy.get("cohort_ids"),
        context.cohort_index,
        context.errors,
        f"{path}.cohort_ids",
        nonempty=True,
    )
    validate_policy_cohorts(models, cohorts, path, context.cohort_index, context.errors)
    require_references(
        policy.get("control_ids"),
        context.control_index,
        context.errors,
        f"{path}.control_ids",
        nonempty=True,
    )
    concepts = require_references(
        policy.get("concept_ids"),
        context.concept_ids,
        context.errors,
        f"{path}.concept_ids",
        nonempty=True,
    )
    workflows = require_references(
        policy.get("workflow_ids"),
        workflow_index,
        context.errors,
        f"{path}.workflow_ids",
        nonempty=True,
    )
    validate_policy_workflows(concepts, workflows, path, context.institution_code, context.errors)
    validate_policy_tiers(policy, path, models, cohorts, context.cohort_index, context.errors)
    validate_policy_invariants(policy, path, context.errors)
    validate_policy_settings(policy, path, platform, models, cohorts, state, context.errors)
    validate_policy_text(policy, path, models, context.errors)


def validate_policy_identity(
    policy: Mapping[str, Any],
    path: str,
    layer_index: Mapping[str, Any],
    context: ValidationContext,
    state: PolicyState,
) -> tuple[Any, list[str], Mapping[str, Any] | None]:
    policy_id = policy.get("policy_id")
    if (
        context.institution_code
        and isinstance(policy_id, str)
        and not policy_id.startswith(f"{context.institution_code}-policy.")
    ):
        add(
            context.errors,
            f"{path}.policy_id",
            f"must use the {context.institution_code!r}-policy namespace",
        )
    layer_id, platform = policy.get("layer_id"), policy.get("platform")
    require_reference(layer_id, layer_index, context.errors, f"{path}.layer_id")
    layer = layer_index.get(layer_id) if isinstance(layer_id, str) else None
    validate_policy_platform(platform, layer, path, context.errors)
    models = validate_policy_models(policy, path, context.errors)
    collect_policy_coverage(platform, models, layer, state)
    return platform, models, layer


def validate_policy_platform(platform: Any, layer: Any, path: str, errors: list[str]) -> None:
    if platform not in PLATFORMS:
        add(errors, f"{path}.platform", "is unknown")
    if platform == "cross_platform_outcome" and (
        not isinstance(layer, Mapping) or layer.get("order") != 6
    ):
        add(errors, f"{path}.platform", "cross-platform outcomes are allowed only at layer 6")


def validate_policy_models(policy: Mapping[str, Any], path: str, errors: list[str]) -> list[str]:
    models = string_list(policy.get("models"), errors, f"{path}.models", nonempty=True)
    if set(models) - MODELS:
        add(errors, f"{path}.models", "contains an unknown device model")
    if "byod" in models and len(models) != 1:
        add(
            errors,
            f"{path}.models",
            "BYOD policy units must be isolated from corporate/device-owner models",
        )
    return models


def collect_policy_coverage(
    platform: Any, models: list[str], layer: Any, state: PolicyState
) -> None:
    if isinstance(layer, Mapping) and isinstance(layer.get("order"), int):
        state.covered_layers.add(layer["order"])
    if platform in CONCRETE_PLATFORMS:
        collect_platform_coverage(str(platform), models, layer, state)


def collect_platform_coverage(
    platform: str, models: list[str], layer: Any, state: PolicyState
) -> None:
    if "corp" in models and isinstance(layer, Mapping) and layer.get("order") == 1:
        state.corporate_platforms.add(platform)
    if "byod" in models:
        state.byod_platforms.add(platform)
    if "privileged" in models:
        state.privileged_platforms.add(platform)


def validate_policy_cohorts(
    models: list[str],
    cohorts: list[str],
    path: str,
    cohort_index: Mapping[str, Mapping[str, Any]],
    errors: list[str],
) -> None:
    for cohort_id in cohorts:
        eligible = cohort_index.get(cohort_id, {}).get("eligible_models")
        eligible_models = set(eligible) if isinstance(eligible, list) else set()
        if not set(models).issubset(eligible_models):
            add(
                errors,
                f"{path}.cohort_ids",
                f"{cohort_id!r} is not eligible for every declared policy model",
            )


def validate_policy_workflows(
    concepts: list[str], workflows: list[str], path: str, code: str, errors: list[str]
) -> None:
    if f"{code}.policy-lifecycle.v1" in workflows:
        add(
            errors,
            f"{path}.workflow_ids",
            "generic lifecycle workflow is forbidden; definition, publication, and assignment stay separate",
        )
    required = (
        (
            any(concept.startswith("policy.") for concept in concepts),
            "policy-definition.v1",
            "policy intent must use the dedicated definition workflow",
        ),
        (
            "policy.lifecycle.versioning_publication" in concepts,
            "policy-publication.v1",
            "publication concept requires the dedicated publication workflow",
        ),
        (
            "policy.assignment.device_group" in concepts,
            "policy-assignment.v1",
            "assignment concept requires the dedicated assignment workflow",
        ),
    )
    for applies, suffix, message in required:
        if applies and f"{code}.{suffix}" not in workflows:
            add(errors, f"{path}.workflow_ids", message)


def validate_policy_tiers(
    policy: Mapping[str, Any],
    path: str,
    models: list[str],
    cohorts: list[str],
    cohort_index: Mapping[str, Mapping[str, Any]],
    errors: list[str],
) -> None:
    baseline, impact = policy.get("baseline_tier"), policy.get("impact_tier_floor")
    validate_policy_tier_values(baseline, impact, path, errors)
    privileged = any(
        cohort_index.get(cohort_id, {}).get("privileged") is True for cohort_id in cohorts
    )
    if baseline == 1 and not (set(models).issubset({"kiosk", "privileged"}) or privileged):
        add(
            errors,
            f"{path}.baseline_tier",
            "Tier 1 policy is not limited to privileged or dedicated scope",
        )


def validate_policy_tier_values(baseline: Any, impact: Any, path: str, errors: list[str]) -> None:
    if not isinstance(baseline, int) or isinstance(baseline, bool) or baseline not in {1, 2, 3}:
        add(errors, f"{path}.baseline_tier", "must be an REXP baseline tier 1, 2, or 3")
    if not isinstance(impact, int) or isinstance(impact, bool) or impact not in {0, 1, 2, 3, 4}:
        add(
            errors,
            f"{path}.impact_tier_floor",
            "must be a Relution mutation impact floor 0 through 4",
        )
    elif impact < 2:
        add(
            errors,
            f"{path}.impact_tier_floor",
            "policy publication/assignment intent cannot be below impact Tier 2",
        )


def validate_policy_invariants(policy: Mapping[str, Any], path: str, errors: list[str]) -> None:
    expected = {
        "payload_mode": "target_contract_required",
        "desired_publication_state": "unpublished",
        "activation_state": "inactive",
    }
    for field, expected_value in expected.items():
        if policy.get(field) != expected_value:
            add(errors, f"{path}.{field}", f"must equal {expected_value!r}")


def validate_policy_settings(
    policy: Mapping[str, Any],
    path: str,
    platform: Any,
    models: list[str],
    cohorts: list[str],
    state: PolicyState,
    errors: list[str],
) -> None:
    settings = array(policy.get("intent_settings"), errors, f"{path}.intent_settings")
    if not settings:
        add(errors, f"{path}.intent_settings", "must contain abstract desired outcomes")
    scope = PolicySettingScope(platform, models, cohorts)
    for index, raw_setting in enumerate(settings):
        validate_policy_setting(
            raw_setting, f"{path}.intent_settings[{index}]", scope, state, errors
        )


def validate_policy_setting(
    raw_setting: Any,
    path: str,
    scope: PolicySettingScope,
    state: PolicyState,
    errors: list[str],
) -> None:
    setting = mapping(raw_setting, errors, path)
    if setting is None:
        return
    exact_keys(setting, INTENT_SETTING_KEYS, errors, path)
    key, writer = setting.get("setting_key"), setting.get("writer_scope")
    if not isinstance(key, str) or not key:
        add(errors, f"{path}.setting_key", "must be a stable abstract key")
        return
    if not isinstance(writer, str) or not writer.startswith("writer."):
        add(errors, f"{path}.writer_scope", "must name one explicit writer scope")
    capabilities = set(
        string_list(setting.get("capability_ids"), errors, f"{path}.capability_ids", nonempty=True)
    )
    validate_capability_ids(capabilities, path, errors)
    validate_setting_contract(setting, key, scope.platform, capabilities, path, errors)
    validate_byod_setting(capabilities, scope.models, path, errors)
    collect_setting_writers(scope, key, capabilities, writer, path, state, errors)


def validate_capability_ids(capabilities: set[str], path: str, errors: list[str]) -> None:
    invalid = sorted(
        item for item in capabilities if re.fullmatch(r"[a-z][a-z0-9_]*", item) is None
    )
    if invalid:
        add(
            errors, f"{path}.capability_ids", f"invalid stable capability IDs: {', '.join(invalid)}"
        )


def validate_setting_contract(
    setting: Mapping[str, Any],
    key: str,
    platform: Any,
    capabilities: set[str],
    path: str,
    errors: list[str],
) -> None:
    contract = INTENT_SETTING_CONTRACTS.get((key, platform if isinstance(platform, str) else ""))
    if contract is None:
        add(
            errors,
            f"{path}.setting_key",
            "has no canonical university capability contract for this platform",
        )
        return
    expected_capabilities, expected_outcome = contract
    if capabilities != expected_capabilities:
        add(
            errors,
            f"{path}.capability_ids",
            "must equal the canonical capability set for setting_key and platform",
        )
    if setting.get("desired_outcome") != expected_outcome:
        add(
            errors,
            f"{path}.desired_outcome",
            "must equal the canonical non-authoritative summary for setting_key and platform",
        )


def validate_byod_setting(
    capabilities: set[str], models: list[str], path: str, errors: list[str]
) -> None:
    if "byod" not in models:
        return
    prohibited = sorted(capabilities & BYOD_PROHIBITIONS)
    if prohibited:
        add(
            errors,
            f"{path}.capability_ids",
            f"BYOD intent requests prohibited capabilities: {', '.join(prohibited)}",
        )
    unsupported = sorted(capabilities - BYOD_ALLOWED_CAPABILITIES)
    if unsupported:
        add(
            errors,
            f"{path}.capability_ids",
            f"BYOD intent uses capabilities outside the privacy allowlist: {', '.join(unsupported)}",
        )


def collect_setting_writers(
    scope: PolicySettingScope,
    key: str,
    capabilities: set[str],
    writer: Any,
    path: str,
    state: PolicyState,
    errors: list[str],
) -> None:
    for model in scope.models:
        for cohort_id in scope.cohorts:
            collect_effective_writer(
                state.setting_writers,
                (str(scope.platform), model, cohort_id, key),
                writer,
                path,
                "setting",
                errors,
            )
            for capability in capabilities:
                collect_effective_writer(
                    state.capability_writers,
                    (str(scope.platform), model, cohort_id, capability),
                    writer,
                    path,
                    "capability",
                    errors,
                )


def collect_effective_writer(
    writers: dict[tuple[str, str, str, str], str],
    key: tuple[str, str, str, str],
    writer: Any,
    path: str,
    label: str,
    errors: list[str],
) -> None:
    previous = writers.get(key)
    if previous is not None:
        add(errors, path, f"effective {label} already has writer {previous!r}")
    else:
        writers[key] = str(writer)


def validate_policy_text(
    policy: Mapping[str, Any], path: str, models: list[str], errors: list[str]
) -> None:
    string_list(
        policy.get("usability_safeguards"), errors, f"{path}.usability_safeguards", nonempty=True
    )
    exclusions = string_list(policy.get("exclusions"), errors, f"{path}.exclusions")
    if "byod" in models and not any(
        "device-wide" in item.lower() or "personal" in item.lower() for item in exclusions
    ):
        add(
            errors,
            f"{path}.exclusions",
            "BYOD policy must explicitly exclude device-wide or personal scope",
        )


def validate_policy_coverage(state: PolicyState, errors: list[str]) -> None:
    required = (
        (
            state.corporate_platforms,
            CONCRETE_PLATFORMS,
            "missing Tier-2 corporate platform baselines",
        ),
        (
            state.byod_platforms,
            {"ios_ipados", "android_enterprise"},
            "missing privacy-bound BYOD policy units",
        ),
        (
            state.privileged_platforms,
            {"macos", "windows"},
            "missing dedicated privileged policy units",
        ),
    )
    for actual, expected, message in required:
        if actual != expected and message == "missing Tier-2 corporate platform baselines":
            add(errors, "$.policy_units", f"{message}: {', '.join(sorted(expected - actual))}")
        elif message != "missing Tier-2 corporate platform baselines" and not expected.issubset(
            actual
        ):
            add(errors, "$.policy_units", f"{message}: {', '.join(sorted(expected - actual))}")
    if state.covered_layers != set(range(8)):
        missing = sorted(set(range(8)) - state.covered_layers)
        add(
            errors,
            "$.policy_units",
            f"missing policy intent for layers: {', '.join(str(item) for item in missing)}",
        )
