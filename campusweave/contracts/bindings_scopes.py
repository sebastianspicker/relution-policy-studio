"""Scope-binding validation for target contract bindings."""

from pathlib import Path
from typing import Any, Mapping

from .common import (
    SCOPE_KINDS,
    SCOPE_LOCATIONS,
    TARGET_SCOPE_BINDING_KEYS,
    error,
    expect_list,
    expect_mapping,
    require_exact_keys,
    validate_string_array,
)


def validate_scope_bindings(
    binding: Mapping[str, Any],
    location: str,
    bound_keys: set[str],
    operations: Mapping[str, Mapping[str, Any]],
    path: Path,
    errors: list[str],
) -> None:
    """Validate a binding's declared target scopes."""

    raw_scopes = (
        expect_list(binding.get("scope_bindings"), errors, path, f"{location}.scope_bindings") or []
    )
    for index, raw_scope in enumerate(raw_scopes):
        validate_scope_binding(
            raw_scope, f"{location}.scope_bindings[{index}]", bound_keys, operations, path, errors
        )


def validate_scope_binding(
    raw_scope: Any,
    location: str,
    bound_keys: set[str],
    operations: Mapping[str, Mapping[str, Any]],
    path: Path,
    errors: list[str],
) -> None:
    """Validate one target scope binding record."""

    scope = expect_mapping(raw_scope, errors, path, location)
    if scope is None:
        return
    require_exact_keys(scope, TARGET_SCOPE_BINDING_KEYS, errors, path, location)
    scope_location = validate_scope_shape(scope, location, path, errors)
    keys = validate_string_array(
        scope.get("operation_keys"), errors, path, f"{location}.operation_keys", nonempty=True
    )
    for key in keys:
        validate_scope_operation(
            key, scope, scope_location, location, bound_keys, operations, path, errors
        )


def validate_scope_shape(
    scope: Mapping[str, Any], location: str, path: Path, errors: list[str]
) -> Any:
    """Validate scope kind, location, source proof, and field-name rules."""

    if scope.get("scope_kind") not in SCOPE_KINDS:
        error(errors, path, f"{location}.scope_kind", "is invalid")
    scope_location = scope.get("location")
    if scope_location not in SCOPE_LOCATIONS:
        error(errors, path, f"{location}.location", "is invalid")
    if scope.get("source_contract_verified") is not True:
        error(errors, path, f"{location}.source_contract_verified", "must be true")
    validate_scope_name(scope.get("name"), scope_location, location, path, errors)
    return scope_location


def validate_scope_name(
    name: Any, scope_location: Any, location: str, path: Path, errors: list[str]
) -> None:
    """Validate scope field-name requirements for each scope location."""

    if scope_location in {"token", "server"} and name is not None:
        error(errors, path, f"{location}.name", "must be null for token/server scope")
    if scope_location in {"path", "query", "header", "request_body"} and (
        not isinstance(name, str) or not name
    ):
        error(errors, path, f"{location}.name", "must be a non-empty contract field name")


def validate_scope_operation(
    key: str,
    scope: Mapping[str, Any],
    scope_location: Any,
    location: str,
    bound_keys: set[str],
    operations: Mapping[str, Mapping[str, Any]],
    path: Path,
    errors: list[str],
) -> None:
    """Validate one scope-to-operation relation."""

    if key not in bound_keys:
        error(
            errors, path, f"{location}.operation_keys", f"{key!r} is not bound under this concept"
        )
        return
    operation = operations.get(key)
    if operation is None:
        return
    if scope_location in {"path", "query", "header"}:
        validate_parameter_scope(key, scope, scope_location, location, operation, path, errors)
    elif scope_location == "request_body":
        validate_request_body_scope(key, location, operation, path, errors)


def validate_parameter_scope(
    key: str,
    scope: Mapping[str, Any],
    scope_location: str,
    location: str,
    operation: Mapping[str, Any],
    path: Path,
    errors: list[str],
) -> None:
    """Require the named parameter to exist on a bound operation."""

    name = scope.get("name")
    parameters = operation.get("parameters")
    items = parameters if isinstance(parameters, list) else []
    if any(parameter_matches(item, name, scope_location) for item in items):
        return
    error(
        errors, path, f"{location}.name", f"{name!r} is not a {scope_location} parameter on {key}"
    )


def parameter_matches(parameter: Any, name: Any, scope_location: str) -> bool:
    """Return whether one catalog parameter matches a declared scope name."""

    if not isinstance(parameter, Mapping):
        return False
    candidate = parameter.get("name")
    names_match = (
        isinstance(candidate, str)
        and isinstance(name, str)
        and (candidate.lower() == name.lower() if scope_location == "header" else candidate == name)
    )
    return parameter.get("in") == scope_location and names_match


def validate_request_body_scope(
    key: str, location: str, operation: Mapping[str, Any], path: Path, errors: list[str]
) -> None:
    """Require a request body on an operation used by a body scope."""

    request_body = operation.get("request_body")
    if not isinstance(request_body, Mapping) or request_body.get("kind") == "none":
        error(
            errors,
            path,
            f"{location}.location",
            f"{key} has no request body for the declared scope binding",
        )
