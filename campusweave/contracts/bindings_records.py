"""Per-record validation for target contract bindings."""

from pathlib import Path
from typing import Any, Mapping

from .bindings_operations import validate_operation_bindings
from .bindings_scopes import validate_scope_bindings
from .common import (
    BINDING_ROLES,
    TARGET_BINDING_RECORD_KEYS,
    error,
    expect_mapping,
    require_exact_keys,
    validate_string_array,
)


def validate_binding_record(
    raw_binding: Any,
    location: str,
    context: "BindingValidationContext",
    path: Path,
    errors: list[str],
) -> None:
    """Validate one target binding and its operation and scope sections."""

    binding = expect_mapping(raw_binding, errors, path, location)
    if binding is None:
        return
    require_exact_keys(binding, TARGET_BINDING_RECORD_KEYS, errors, path, location)
    validate_binding_identity(binding, location, context, path, errors)
    required_roles = validate_binding_declaration(binding, location, context.status, path, errors)
    bound_keys, bound_roles = validate_operation_bindings(
        binding, location, context.digest, context.operations, path, errors
    )
    validate_missing_roles(required_roles, bound_roles, location, path, errors)
    validate_scope_bindings(binding, location, bound_keys, context.operations, path, errors)


class BindingValidationContext:
    """Cross-record state for one target bindings document."""

    def __init__(
        self,
        concept_ids: set[str],
        digest: str,
        operations: Mapping[str, Mapping[str, Any]],
        status: Any,
        unresolved: list[str],
        seen_keys: set[tuple[str, str | None]],
    ) -> None:
        self.concept_ids = concept_ids
        self.digest = digest
        self.operations = operations
        self.status = status
        self.unresolved = unresolved
        self.seen_keys = seen_keys


def validate_binding_identity(
    binding: Mapping[str, Any],
    location: str,
    context: BindingValidationContext,
    path: Path,
    errors: list[str],
) -> None:
    """Validate a binding's concept and workflow identity."""

    concept_id = binding.get("concept_id")
    workflow_id = binding.get("workflow_id")
    validate_concept_identity(concept_id, workflow_id, location, context, path, errors)
    if concept_id in context.unresolved:
        error(errors, path, f"{location}.concept_id", "cannot be both bound and unresolved")
    validate_workflow_id(workflow_id, location, path, errors)


def validate_concept_identity(
    concept_id: Any,
    workflow_id: Any,
    location: str,
    context: BindingValidationContext,
    path: Path,
    errors: list[str],
) -> None:
    """Validate a concept ID and its uniqueness with the workflow ID."""

    key = (
        concept_id if isinstance(concept_id, str) else "",
        workflow_id if isinstance(workflow_id, str) else None,
    )
    if concept_id not in context.concept_ids:
        error(errors, path, f"{location}.concept_id", f"unknown ID {concept_id!r}")
    elif key in context.seen_keys:
        error(errors, path, location, "duplicate concept/workflow binding")
    else:
        context.seen_keys.add(key)


def validate_workflow_id(workflow_id: Any, location: str, path: Path, errors: list[str]) -> None:
    """Require workflow IDs to be non-empty strings when present."""

    if workflow_id is not None and (not isinstance(workflow_id, str) or not workflow_id):
        error(errors, path, f"{location}.workflow_id", "must be a non-empty string or null")


def validate_binding_declaration(
    binding: Mapping[str, Any], location: str, status: Any, path: Path, errors: list[str]
) -> list[str]:
    """Validate completeness, declared roles, and free-form notes."""

    completeness = binding.get("binding_completeness")
    if completeness not in {"partial", "complete_for_requested_workflow"}:
        error(errors, path, f"{location}.binding_completeness", "is invalid")
    required_roles = validate_string_array(
        binding.get("required_roles"), errors, path, f"{location}.required_roles"
    )
    validate_required_roles(required_roles, location, path, errors)
    validate_complete_binding(
        completeness, binding.get("workflow_id"), required_roles, location, path, errors
    )
    if status == "resolved" and completeness != "complete_for_requested_workflow":
        error(
            errors,
            path,
            f"{location}.binding_completeness",
            "must be complete_for_requested_workflow when resolved",
        )
    validate_string_array(binding.get("notes"), errors, path, f"{location}.notes")
    return required_roles


def validate_required_roles(roles: list[str], location: str, path: Path, errors: list[str]) -> None:
    """Reject unknown declared workflow roles."""

    for role in roles:
        if role not in BINDING_ROLES:
            error(errors, path, f"{location}.required_roles", f"invalid role {role!r}")


def validate_complete_binding(
    completeness: Any,
    workflow_id: Any,
    required_roles: list[str],
    location: str,
    path: Path,
    errors: list[str],
) -> None:
    """Require workflow identity and roles for complete bindings."""

    if completeness != "complete_for_requested_workflow":
        return
    if not isinstance(workflow_id, str) or not workflow_id:
        error(
            errors, path, f"{location}.workflow_id", "is required for a complete workflow binding"
        )
    if not required_roles:
        error(
            errors,
            path,
            f"{location}.required_roles",
            "must declare the complete workflow role set",
        )


def validate_missing_roles(
    required_roles: list[str], bound_roles: set[str], location: str, path: Path, errors: list[str]
) -> None:
    """Ensure every declared workflow role has a bound operation."""

    missing_roles = sorted(set(required_roles) - bound_roles)
    if missing_roles:
        error(
            errors,
            path,
            f"{location}.required_roles",
            f"declared workflow roles are not bound: {', '.join(missing_roles)}",
        )
