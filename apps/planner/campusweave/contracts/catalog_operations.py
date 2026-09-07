"""Generated operation-catalog validation helpers."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from .common import (
    HTTP_METHOD,
    OPERATION_KEY,
    OPERATION_SURFACES,
    SCHEMA_VERSION,
    SHA256,
    error,
    expect_list,
    expect_mapping,
)


@dataclass
class CatalogState:
    """Shared state for generated catalog validation."""

    path: Path
    errors: list[str]
    operations: list[Any]


@dataclass(frozen=True)
class OperationReferencePolicy:
    """Optional requirements for an operation reference."""

    digest_field: str | None
    required_identity: bool = True
    allowed_surfaces: set[str] | None = None


@dataclass
class OperationReferenceContext:
    """Catalog inputs used to resolve an operation reference."""

    path: Path
    location: str
    errors: list[str]
    catalog_digest: str | None
    operations: Mapping[str, Mapping[str, Any]]
    policy: OperationReferencePolicy


def operation_key(operation: Mapping[str, Any]) -> str | None:
    """Recompute the renderer's stable operation key."""
    fields = (
        operation.get("surface"),
        operation.get("source_location"),
        operation.get("lineage") or "",
        operation.get("method"),
        operation.get("path"),
    )
    if not all(isinstance(item, str) for item in fields):
        return None
    raw = json.dumps(list(fields), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return "operation.sha256." + hashlib.sha256(raw).hexdigest()


def validate_catalog(document: Any, path: Path, errors: list[str]) -> dict[str, Mapping[str, Any]]:
    """Validate a generated or fail-closed placeholder operation catalog."""
    root = expect_mapping(document, errors, path, "$")
    if root is None:
        return {}
    status = _validate_catalog_header(root, path, errors)
    operations = expect_list(root.get("operations"), errors, path, "$.operations") or []
    state = CatalogState(path, errors, operations)
    count = root.get("operation_count")
    _validate_operation_count(count, state)
    _validate_catalog_source(root.get("source"), status, count, state)
    indexed = _index_operations(state)
    _validate_contract_count(root.get("contract"), state)
    return indexed


def _validate_catalog_header(root: Mapping[str, Any], path: Path, errors: list[str]) -> Any:
    if root.get("document_type") != "relution_openapi_operation_catalog":
        error(errors, path, "$.document_type", "is not a Relution operation catalog")
    if root.get("schema_version") != SCHEMA_VERSION:
        error(errors, path, "$.schema_version", f"must equal {SCHEMA_VERSION!r}")
    status = root.get("status")
    if status not in {"generated", "not_generated"}:
        error(errors, path, "$.status", "must be 'generated' or 'not_generated'")
    return status


def _validate_operation_count(value: Any, state: CatalogState) -> None:
    if not isinstance(value, int) or isinstance(value, bool):
        error(state.errors, state.path, "$.operation_count", "must be an integer")
    elif value != len(state.operations):
        error(
            state.errors,
            state.path,
            "$.operation_count",
            f"declares {value}, but operations has {len(state.operations)} entries",
        )


def _validate_catalog_source(value: Any, status: Any, count: Any, state: CatalogState) -> None:
    source = expect_mapping(value, state.errors, state.path, "$.source")
    digest = source.get("sha256") if source is not None else None
    if status == "not_generated":
        _validate_placeholder_source(digest, count, state)
    elif not isinstance(digest, str) or not SHA256.fullmatch(digest):
        error(
            state.errors,
            state.path,
            "$.source.sha256",
            "must be a lowercase SHA-256 digest",
        )


def _validate_placeholder_source(digest: Any, count: Any, state: CatalogState) -> None:
    if state.operations:
        error(
            state.errors,
            state.path,
            "$.operations",
            "must be empty while status is not_generated",
        )
    if count != 0:
        error(state.errors, state.path, "$.operation_count", "must be zero while not_generated")
    if digest is not None:
        error(state.errors, state.path, "$.source.sha256", "must be null while not_generated")


def _index_operations(state: CatalogState) -> dict[str, Mapping[str, Any]]:
    indexed: dict[str, Mapping[str, Any]] = {}
    for index, raw_operation in enumerate(state.operations):
        _index_operation(raw_operation, index, indexed, state)
    return indexed


def _index_operation(
    raw_operation: Any,
    index: int,
    indexed: dict[str, Mapping[str, Any]],
    state: CatalogState,
) -> None:
    location = f"$.operations[{index}]"
    operation = expect_mapping(raw_operation, state.errors, state.path, location)
    if operation is None:
        return
    key = operation.get("key")
    if not isinstance(key, str) or not OPERATION_KEY.fullmatch(key):
        error(state.errors, state.path, f"{location}.key", "must be a generated operation key")
        return
    if key in indexed:
        error(state.errors, state.path, f"{location}.key", f"duplicate operation key {key}")
    _validate_operation_identity(operation, key, location, state)
    _validate_operation_shape(operation, location, state)
    indexed[key] = operation


def _validate_operation_identity(
    operation: Mapping[str, Any], key: str, location: str, state: CatalogState
) -> None:
    expected_key = operation_key(operation)
    if expected_key is None:
        error(
            state.errors,
            state.path,
            location,
            "surface, source_location, lineage, method, and path must be typed strings/null",
        )
    elif key != expected_key:
        error(
            state.errors,
            state.path,
            f"{location}.key",
            "does not match operation identity fields",
        )


def _validate_operation_shape(
    operation: Mapping[str, Any], location: str, state: CatalogState
) -> None:
    _validate_surface(operation.get("surface"), location, state)
    _validate_method(operation.get("method"), location, state)
    _validate_path(operation.get("path"), location, state)


def _validate_surface(value: Any, location: str, state: CatalogState) -> None:
    if value not in OPERATION_SURFACES:
        error(state.errors, state.path, f"{location}.surface", "is not a supported surface")


def _validate_method(value: Any, location: str, state: CatalogState) -> None:
    if not isinstance(value, str) or not HTTP_METHOD.fullmatch(value):
        error(state.errors, state.path, f"{location}.method", "must be an uppercase HTTP token")


def _validate_path(value: Any, location: str, state: CatalogState) -> None:
    if not isinstance(value, str) or not value:
        error(state.errors, state.path, f"{location}.path", "must be non-empty")


def _validate_contract_count(value: Any, state: CatalogState) -> None:
    contract = expect_mapping(value, state.errors, state.path, "$.contract")
    if contract is None:
        return
    counts = expect_mapping(contract.get("counts"), state.errors, state.path, "$.contract.counts")
    if counts is not None and counts.get("operations") != len(state.operations):
        error(
            state.errors,
            state.path,
            "$.contract.counts.operations",
            "must equal the operations array length",
        )


def request_body_media_types(value: Any) -> set[str]:
    """Collect effective media types from a generated request-body summary."""
    if not isinstance(value, Mapping):
        return set()
    return _content_media_types(value.get("content")) | _consumed_media_types(value.get("consumes"))


def _content_media_types(value: Any) -> set[str]:
    if not isinstance(value, list):
        return set()
    return {
        item["media_type"]
        for item in value
        if isinstance(item, Mapping) and isinstance(item.get("media_type"), str)
    }


def _consumed_media_types(value: Any) -> set[str]:
    if not isinstance(value, list):
        return set()
    return {item for item in value if isinstance(item, str)}


def validate_operation_reference(
    reference: Any, context: OperationReferenceContext
) -> Mapping[str, Any] | None:
    """Resolve and verify one catalog operation reference."""
    ref = expect_mapping(reference, context.errors, context.path, context.location)
    if ref is None:
        return None
    _validate_reference_requirements(ref, context)
    _validate_reference_surface(ref, context)
    operation = _resolve_reference_operation(ref, context)
    if operation is None:
        return None
    _validate_reference_digest(ref, context)
    _validate_reference_identity(ref, operation, context)
    return operation


def _validate_reference_requirements(
    reference: Mapping[str, Any], context: OperationReferenceContext
) -> None:
    if context.policy.required_identity:
        _validate_identity_fields(reference, context)
    digest_field = context.policy.digest_field
    if digest_field is not None and digest_field not in reference:
        error(context.errors, context.path, f"{context.location}.{digest_field}", "is required")


def _validate_identity_fields(
    reference: Mapping[str, Any], context: OperationReferenceContext
) -> None:
    for field in ("operation_key", "surface", "method", "path", "lineage", "operation_id"):
        if field not in reference:
            error(context.errors, context.path, f"{context.location}.{field}", "is required")


def _validate_reference_surface(
    reference: Mapping[str, Any], context: OperationReferenceContext
) -> None:
    allowed = context.policy.allowed_surfaces
    if allowed is not None and reference.get("surface") not in allowed:
        error(
            context.errors,
            context.path,
            f"{context.location}.surface",
            "may reference only top-level path operations",
        )


def _resolve_reference_operation(
    reference: Mapping[str, Any], context: OperationReferenceContext
) -> Mapping[str, Any] | None:
    key = reference.get("operation_key")
    if not isinstance(key, str) or key not in context.operations:
        error(
            context.errors,
            context.path,
            f"{context.location}.operation_key",
            "does not exist in the catalog",
        )
        return None
    return context.operations[key]


def _validate_reference_digest(
    reference: Mapping[str, Any], context: OperationReferenceContext
) -> None:
    field = context.policy.digest_field
    if field is not None and reference.get(field) != context.catalog_digest:
        error(
            context.errors,
            context.path,
            f"{context.location}.{field}",
            "does not match catalog digest",
        )


def _validate_reference_identity(
    reference: Mapping[str, Any], operation: Mapping[str, Any], context: OperationReferenceContext
) -> None:
    for field in ("surface", "method", "path", "lineage", "operation_id"):
        if reference.get(field) != operation.get(field):
            error(
                context.errors,
                context.path,
                f"{context.location}.{field}",
                "does not match catalog operation",
            )
