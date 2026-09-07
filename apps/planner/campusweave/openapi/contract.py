from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping, Sequence

from campusweave.json_snapshot import load_strict_json

from .types import (
    FIXED_HTTP_METHOD_FIELDS,
    HTTP_TOKEN,
    OAS_32_FIXED_HTTP_METHOD_FIELDS,
    PATH_ITEM_METADATA_KEYS,
    SUPPORTED_OPENAPI_VERSION,
    Operation,
)


def contract_feature_version(spec: Mapping[str, Any]) -> tuple[str, int, int]:
    """Return and validate the supported contract feature version."""

    swagger = spec.get("swagger")
    if swagger is not None:
        if swagger != "2.0":
            raise ValueError(
                f"unsupported Swagger version {swagger!r}; only Swagger 2.0 is supported"
            )
        return ("swagger", 2, 0)

    openapi = spec.get("openapi")
    if not isinstance(openapi, str):
        raise ValueError("the contract must declare a string 'openapi' or 'swagger' version")
    match = SUPPORTED_OPENAPI_VERSION.fullmatch(openapi)
    if not match:
        raise ValueError(
            f"unsupported OpenAPI version {openapi!r}; supported feature sets are "
            "OpenAPI 3.0, 3.1, and 3.2"
        )
    return ("openapi", 3, int(match.group(1)))


def fixed_http_method_fields(spec: Mapping[str, Any]) -> tuple[str, ...]:
    """Return Path Item fixed HTTP fields for the contract feature version."""

    kind, major, minor = contract_feature_version(spec)
    if kind == "openapi" and (major, minor) >= (3, 2):
        return OAS_32_FIXED_HTTP_METHOD_FIELDS
    return FIXED_HTTP_METHOD_FIELDS


def load_spec(path: Path) -> tuple[dict[str, Any], bytes]:
    """Load and minimally validate an OpenAPI/Swagger JSON document."""

    value, raw = load_strict_json(path)
    if not isinstance(value, dict):
        raise ValueError("the contract root must be a JSON object")
    kind, _, minor = contract_feature_version(value)
    validate_top_level_objects(value)
    validate_contract_surface(value, kind, minor)
    return value, raw


def validate_top_level_objects(spec: Mapping[str, Any]) -> None:
    """Validate the top-level OpenAPI object-valued sections."""

    for key in ("paths", "webhooks", "components"):
        if key in spec and not isinstance(spec[key], dict):
            raise ValueError(f"the top-level '{key}' value must be an object")


def validate_contract_surface(spec: Mapping[str, Any], kind: str, minor: int) -> None:
    """Require the operation-bearing sections available to this OpenAPI version."""

    if "paths" not in spec and (kind == "swagger" or minor == 0):
        raise ValueError("the contract must contain a top-level 'paths' object")
    if (
        kind == "openapi"
        and minor >= 1
        and not any(key in spec for key in ("paths", "components", "webhooks"))
    ):
        raise ValueError(
            "OpenAPI 3.1/3.2 contracts must contain at least one of "
            "'paths', 'components', or 'webhooks'"
        )


def resolve_local_ref(spec: Mapping[str, Any], ref: str) -> Any:
    """Resolve a local JSON Pointer, failing closed for external references."""

    if not ref.startswith("#/"):
        raise ValueError(
            f"operation-bearing object uses unsupported external reference {ref!r}; "
            "bundle it into the contract before catalog generation"
        )

    current: Any = spec
    for raw_token in ref[2:].split("/"):
        token = raw_token.replace("~1", "/").replace("~0", "~")
        if not isinstance(current, Mapping) or token not in current:
            raise ValueError(f"local reference {ref!r} cannot be resolved")
        current = current[token]
    return current


def resolve_path_item(
    spec: Mapping[str, Any],
    path_item: Mapping[str, Any],
    *,
    context: str,
    seen_refs: frozenset[str] = frozenset(),
) -> dict[str, Any]:
    """Resolve local path-item refs and merge allowed sibling keys."""

    ref = path_item.get("$ref")
    if ref is None:
        return dict(path_item)
    if not isinstance(ref, str):
        raise ValueError(f"{context} has a non-string $ref")
    if ref in seen_refs:
        raise ValueError(f"{context} contains a cyclic path-item reference {ref!r}")

    resolved = resolve_local_ref(spec, ref)
    if not isinstance(resolved, Mapping):
        raise ValueError(f"{context} reference {ref!r} does not resolve to an object")
    base = resolve_path_item(
        spec,
        resolved,
        context=context,
        seen_refs=seen_refs | {ref},
    )
    base.update({key: value for key, value in path_item.items() if key != "$ref"})
    return base


def resolve_callback_object(
    spec: Mapping[str, Any],
    callback: Mapping[str, Any],
    *,
    context: str,
    seen_refs: frozenset[str] = frozenset(),
) -> dict[str, Any]:
    """Resolve a locally referenced Callback Object."""

    ref = callback.get("$ref")
    if ref is None:
        return dict(callback)
    if not isinstance(ref, str):
        raise ValueError(f"{context} has a non-string $ref")
    if ref in seen_refs:
        raise ValueError(f"{context} contains a cyclic callback reference {ref!r}")

    resolved = resolve_local_ref(spec, ref)
    if not isinstance(resolved, Mapping):
        raise ValueError(f"{context} reference {ref!r} does not resolve to an object")
    base = resolve_callback_object(
        spec,
        resolved,
        context=context,
        seen_refs=seen_refs | {ref},
    )
    base.update(callback_override_items(callback))
    return base


def callback_override_items(callback: Mapping[str, Any]) -> dict[str, Any]:
    """Return callback fields that override a referenced Callback Object."""

    ignored = {"$ref", "summary", "description"}
    return {
        key: value
        for key, value in callback.items()
        if key not in ignored and not key.startswith("x-")
    }


def operations_from_path_item(
    spec: Mapping[str, Any],
    *,
    surface: str,
    path: str,
    raw_item: Mapping[str, Any],
    context: str,
    lineage: str | None,
) -> list[Operation]:
    """Validate one Path Item and return all fixed and additional operations."""

    path_item = resolve_path_item(spec, raw_item, context=context)
    fixed_methods = fixed_http_method_fields(spec)
    validate_path_item_keys(spec, path_item, fixed_methods, context)
    fixed = fixed_operations(surface, path, path_item, context, lineage, fixed_methods)
    return fixed + additional_operations(surface, path, path_item, context, lineage, fixed_methods)


def validate_path_item_keys(
    spec: Mapping[str, Any],
    path_item: Mapping[str, Any],
    fixed_methods: Sequence[str],
    context: str,
) -> None:
    """Reject unknown Path Item fields that could hide an operation."""

    _, major, minor = contract_feature_version(spec)
    allowed = PATH_ITEM_METADATA_KEYS | set(fixed_methods)
    if major == 3 and minor >= 2:
        allowed.add("additionalOperations")
    for key in path_item:
        if not isinstance(key, str) or (key not in allowed and not key.startswith("x-")):
            raise ValueError(
                f"{context} contains unsupported path-item key {key!r}; refusing to risk omitting an operation"
            )


def fixed_operations(
    surface: str,
    path: str,
    path_item: Mapping[str, Any],
    context: str,
    lineage: str | None,
    methods: Sequence[str],
) -> list[Operation]:
    """Build operations declared by standard OpenAPI method fields."""

    operations = []
    for method in methods:
        if method in path_item:
            value = path_item[method]
            if not isinstance(value, Mapping):
                raise ValueError(f"{context}.{method} must be an object")
            operations.append(
                Operation(
                    surface, path, method.upper(), path_item, value, lineage, f"{context}.{method}"
                )
            )
    return operations


def additional_operations(
    surface: str,
    path: str,
    path_item: Mapping[str, Any],
    context: str,
    lineage: str | None,
    fixed_methods: Sequence[str],
) -> list[Operation]:
    """Build OpenAPI 3.2 extension-method operations."""

    additional = path_item.get("additionalOperations", {})
    if not isinstance(additional, Mapping):
        raise ValueError(f"{context}.additionalOperations must be an object")
    fixed_wire_methods = {method.upper() for method in fixed_methods}
    return [
        additional_operation(
            surface, path, path_item, context, lineage, fixed_wire_methods, method, value
        )
        for method, value in sorted(
            additional.items(), key=lambda item: (str(item[0]).casefold(), str(item[0]))
        )
    ]


def additional_operation(
    surface: str,
    path: str,
    path_item: Mapping[str, Any],
    context: str,
    lineage: str | None,
    fixed_methods: set[str],
    method: Any,
    value: Any,
) -> Operation:
    """Validate and build one extension-method operation."""

    location = f"{context}.additionalOperations"
    if not isinstance(method, str) or not HTTP_TOKEN.fullmatch(method):
        raise ValueError(f"{location} contains invalid HTTP method {method!r}")
    if method != method.upper():
        raise ValueError(f"{location} method {method!r} must use uppercase wire-method spelling")
    if method.upper() in fixed_methods:
        raise ValueError(f"{location} duplicates fixed HTTP method {method!r}")
    if not isinstance(value, Mapping):
        raise ValueError(f"{location}.{method} must be an object")
    return Operation(surface, path, method, path_item, value, lineage, f"{location}.{method}")


def collect_operations(spec: Mapping[str, Any]) -> list[Operation]:
    """Collect every operation from paths, webhooks, and recursive callbacks."""

    operations: list[Operation] = []
    for surface in ("paths", "webhooks"):
        collect_surface_operations(spec, surface, operations)
    return operations


def collect_surface_operations(
    spec: Mapping[str, Any], surface: str, operations: list[Operation]
) -> None:
    """Collect one top-level operation surface."""

    collection = spec.get(surface) or {}
    if not isinstance(collection, Mapping):
        raise ValueError(f"top-level {surface!r} must be an object")
    for path, raw_item in sorted(collection.items(), key=lambda item: str(item[0])):
        if not isinstance(path, str):
            raise ValueError(f"{surface} contains a non-string path key")
        context = f"{surface}.{path}"
        if not isinstance(raw_item, Mapping):
            raise ValueError(f"{context} must be an object")
        collect_path_item_operations(
            spec, operations, surface, path, raw_item, context, None, frozenset()
        )


def collect_path_item_operations(
    spec: Mapping[str, Any],
    operations: list[Operation],
    surface: str,
    path: str,
    raw_item: Mapping[str, Any],
    context: str,
    lineage: str | None,
    ancestors: frozenset[int],
) -> None:
    """Append one Path Item's operations and recursively collect callbacks."""

    for operation in operations_from_path_item(
        spec, surface=surface, path=path, raw_item=raw_item, context=context, lineage=lineage
    ):
        operation_id = id(operation.operation)
        if operation_id in ancestors:
            raise ValueError(f"{context}.{operation.method} contains a cyclic callback operation")
        operations.append(operation)
        collect_operation_callbacks(spec, operations, operation, ancestors | {operation_id})


def collect_operation_callbacks(
    spec: Mapping[str, Any],
    operations: list[Operation],
    operation: Operation,
    ancestors: frozenset[int],
) -> None:
    """Collect recursive callback Path Items from an operation."""

    callbacks = operation.operation.get("callbacks", {})
    if not isinstance(callbacks, Mapping):
        raise ValueError(f"{operation.location}.callbacks must be an object")
    for name, callback in sorted(callbacks.items(), key=lambda item: str(item[0])):
        collect_named_callback(spec, operations, operation, ancestors, name, callback)


def collect_named_callback(
    spec: Mapping[str, Any],
    operations: list[Operation],
    operation: Operation,
    ancestors: frozenset[int],
    name: Any,
    raw_callback: Any,
) -> None:
    """Validate one callback and recurse into its callback expressions."""

    context = f"{operation.location}.callbacks.{name}"
    if not isinstance(name, str):
        raise ValueError(f"{operation.location} contains a non-string callback name")
    if not isinstance(raw_callback, Mapping):
        raise ValueError(f"{context} must be an object")
    callback = resolve_callback_object(spec, raw_callback, context=context)
    for expression, path_item in sorted(callback.items(), key=lambda item: str(item[0])):
        if isinstance(expression, str) and expression.startswith("x-"):
            continue
        if not isinstance(expression, str):
            raise ValueError(f"{context} contains a non-string callback expression")
        if not isinstance(path_item, Mapping):
            raise ValueError(f"{context}.{expression} must be a Path Item object")
        collect_path_item_operations(
            spec,
            operations,
            "callbacks",
            expression,
            path_item,
            f"{context}.{expression}",
            callback_lineage(operation, name),
            ancestors,
        )


def callback_lineage(operation: Operation, name: str) -> str:
    """Return the stable parent chain for a callback operation."""

    parent = operation.operation.get("operationId") or f"{operation.method} {operation.path}"
    current = f"{parent} → {name}"
    return f"{operation.lineage} → {current}" if operation.lineage else current
