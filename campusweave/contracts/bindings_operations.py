"""Operation-binding validation for target contract bindings."""

import re
from pathlib import Path
from typing import Any, Mapping

from .catalog import schema_refs, validate_operation_reference
from .catalog_operations import (
    OperationReferenceContext,
    OperationReferencePolicy,
)
from .common import (
    BINDING_ROLE_METHODS,
    BINDING_ROLES,
    CLIENT_OPERATION_SURFACE,
    MUTATING_BINDING_ROLES,
    NON_MUTATING_METHODS,
    READ_LIKE_METHODS,
    READ_ONLY_BINDING_ROLES,
    TARGET_OPERATION_BINDING_KEYS,
    error,
    expect_list,
    expect_mapping,
    require_exact_keys,
    validate_string_array,
)


def validate_operation_bindings(
    binding: Mapping[str, Any],
    location: str,
    digest: str,
    operations: Mapping[str, Mapping[str, Any]],
    path: Path,
    errors: list[str],
) -> tuple[set[str], set[str]]:
    """Validate a binding's operations and return their keys and roles."""

    raw_refs = expect_list(binding.get("operations"), errors, path, f"{location}.operations") or []
    if not raw_refs:
        error(errors, path, f"{location}.operations", "must not be empty")
    state = OperationBindingState()
    for index, raw_ref in enumerate(raw_refs):
        validate_operation_binding(
            raw_ref, f"{location}.operations[{index}]", digest, operations, state, path, errors
        )
    return state.keys, state.roles


class OperationBindingState:
    """Per-binding uniqueness and role compatibility state."""

    def __init__(self) -> None:
        self.keys: set[str] = set()
        self.roles: set[str] = set()
        self.operation_roles: set[tuple[str, str]] = set()
        self.roles_by_key: dict[str, set[str]] = {}


def validate_operation_binding(
    raw_ref: Any,
    location: str,
    digest: str,
    operations: Mapping[str, Mapping[str, Any]],
    state: OperationBindingState,
    path: Path,
    errors: list[str],
) -> None:
    """Validate one operation binding record."""

    ref = expect_mapping(raw_ref, errors, path, location)
    if ref is None:
        return
    require_exact_keys(ref, TARGET_OPERATION_BINDING_KEYS, errors, path, location)
    role = validate_operation_role(ref, location, state, path, errors)
    operation = validate_operation_reference(
        ref,
        OperationReferenceContext(
            path,
            location,
            errors,
            digest,
            operations,
            OperationReferencePolicy(None, allowed_surfaces={CLIENT_OPERATION_SURFACE}),
        ),
    )
    validate_source_contract_proof(ref, location, path, errors)
    track_operation_binding(ref, role, state, location, path, errors)
    if operation is not None:
        validate_operation_contract(ref, operation, role, location, path, errors)


def validate_operation_role(
    ref: Mapping[str, Any],
    location: str,
    state: OperationBindingState,
    path: Path,
    errors: list[str],
) -> Any:
    """Validate and collect the operation role."""

    role = ref.get("role")
    if role not in BINDING_ROLES:
        error(errors, path, f"{location}.role", "is invalid")
    elif isinstance(role, str):
        state.roles.add(role)
    return role


def validate_source_contract_proof(
    ref: Mapping[str, Any], location: str, path: Path, errors: list[str]
) -> None:
    """Require each operation binding to cite a verified source contract."""

    if ref.get("source_contract_verified") is not True:
        error(errors, path, f"{location}.source_contract_verified", "must be true")


def track_operation_binding(
    ref: Mapping[str, Any],
    role: Any,
    state: OperationBindingState,
    location: str,
    path: Path,
    errors: list[str],
) -> None:
    """Track duplicate and incompatible operation role reuse."""

    key = ref.get("operation_key")
    if not isinstance(key, str) or not isinstance(role, str):
        return
    state.keys.add(key)
    operation_role = (key, role)
    if operation_role in state.operation_roles:
        error(errors, path, location, "duplicates an operation key and role in this binding")
    state.operation_roles.add(operation_role)
    roles_for_key = state.roles_by_key.setdefault(key, set())
    compatible_read_reuse = (
        role in READ_ONLY_BINDING_ROLES and roles_for_key <= READ_ONLY_BINDING_ROLES
    )
    if roles_for_key and role not in roles_for_key and not compatible_read_reuse:
        error(
            errors,
            path,
            f"{location}.role",
            "one operation key cannot mix mutation roles or mutation and read-only roles",
        )
    roles_for_key.add(role)


def validate_operation_contract(
    ref: Mapping[str, Any],
    operation: Mapping[str, Any],
    role: Any,
    location: str,
    path: Path,
    errors: list[str],
) -> None:
    """Validate a binding against method, schema, and response catalog details."""

    method = operation.get("method")
    validate_role_method(role, method, location, path, errors)
    validate_schema_references(ref, operation, location, path, errors)
    validate_success_statuses(ref, operation, location, path, errors)


def validate_role_method(
    role: Any, method: Any, location: str, path: Path, errors: list[str]
) -> None:
    """Validate role-specific HTTP method compatibility."""

    allowed_methods = BINDING_ROLE_METHODS.get(role) if isinstance(role, str) else None
    if allowed_methods is not None and method not in allowed_methods:
        error(
            errors,
            path,
            f"{location}.role",
            f"role {role!r} requires one of {', '.join(sorted(allowed_methods))}, not {method!r}",
        )
    if role in MUTATING_BINDING_ROLES and method in NON_MUTATING_METHODS:
        error(
            errors,
            path,
            f"{location}.role",
            f"mutation role {role!r} cannot use non-mutating method {method!r}",
        )
    if role in READ_ONLY_BINDING_ROLES and method not in READ_LIKE_METHODS:
        error(
            errors,
            path,
            f"{location}.role",
            f"read-only role {role!r} cannot use method {method!r}",
        )


def validate_schema_references(
    ref: Mapping[str, Any],
    operation: Mapping[str, Any],
    location: str,
    path: Path,
    errors: list[str],
) -> None:
    """Require request and response references to appear in their own summaries."""

    fields = {
        "request_schema_refs": schema_refs(operation.get("request_body")),
        "response_schema_refs": schema_refs(operation.get("responses")),
    }
    for field, available_refs in fields.items():
        for item in validate_string_array(ref.get(field), errors, path, f"{location}.{field}"):
            if item not in available_refs:
                error(
                    errors,
                    path,
                    f"{location}.{field}",
                    f"reference {item!r} is absent from the operation summary",
                )


def validate_success_statuses(
    ref: Mapping[str, Any],
    operation: Mapping[str, Any],
    location: str,
    path: Path,
    errors: list[str],
) -> None:
    """Require explicit 2xx response statuses declared by the operation."""

    statuses = {
        response.get("status")
        for response in operation.get("responses", [])
        if isinstance(response, Mapping)
    }
    for status in validate_string_array(
        ref.get("expected_success_statuses"),
        errors,
        path,
        f"{location}.expected_success_statuses",
        nonempty=True,
    ):
        if not re.fullmatch(r"2(?:[0-9]{2}|XX)", status):
            error(
                errors,
                path,
                f"{location}.expected_success_statuses",
                f"status {status!r} is not an explicit 2xx success response",
            )
        if status not in statuses:
            error(
                errors,
                path,
                f"{location}.expected_success_statuses",
                f"status {status!r} is absent from the operation",
            )
