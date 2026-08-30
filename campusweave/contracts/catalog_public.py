"""Public API registry validation for machine-readable Relution documents."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlparse

from .common import (
    HTTP_METHOD,
    PUBLIC_API_KEYS,
    PUBLIC_API_OPERATION_KEYS,
    SCHEMA_VERSION,
    error,
    expect_list,
    expect_mapping,
    require_exact_keys,
    validate_string_array,
)


@dataclass
class PublicRegistryState:
    """State collected while validating public API examples."""

    path: Path
    errors: list[str]
    concept_ids: set[str]
    seen_ids: set[str]
    seen_wire_identities: set[tuple[str | None, str]]


def validate_public_api_registry(
    document: Any,
    path: Path,
    errors: list[str],
    concept_ids: set[str],
) -> None:
    """Validate the non-exhaustive, non-executable public API example set."""
    root = expect_mapping(document, errors, path, "$")
    if root is None:
        return
    require_exact_keys(root, PUBLIC_API_KEYS, errors, path, "$")
    _validate_registry_header(root, path, errors)
    operations = expect_list(root.get("operations"), errors, path, "$.operations")
    if operations is None:
        return
    if not operations:
        error(errors, path, "$.operations", "must not be empty")
    state = PublicRegistryState(path, errors, concept_ids, set(), set())
    for index, raw_operation in enumerate(operations):
        _validate_public_operation(raw_operation, index, state)


def _validate_registry_header(root: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    if root.get("schema_version") != SCHEMA_VERSION:
        error(errors, path, "$.schema_version", f"must equal {SCHEMA_VERSION!r}")
    if root.get("product") != "Relution MDM":
        error(errors, path, "$.product", "must equal 'Relution MDM'")
    if root.get("superseded_for_execution_by") != "../generated/API_CATALOG.json":
        error(
            errors,
            path,
            "$.superseded_for_execution_by",
            "must point to ../generated/API_CATALOG.json",
        )


def _validate_public_operation(raw_operation: Any, index: int, state: PublicRegistryState) -> None:
    location = f"$.operations[{index}]"
    operation = expect_mapping(raw_operation, state.errors, state.path, location)
    if operation is None:
        return
    require_exact_keys(operation, PUBLIC_API_OPERATION_KEYS, state.errors, state.path, location)
    _validate_operation_id(operation, location, state)
    _validate_operation_wire(operation, location, state)
    _validate_operation_content(operation, location, state)


def _validate_operation_id(
    operation: Mapping[str, Any], location: str, state: PublicRegistryState
) -> None:
    operation_id = operation.get("id")
    if not isinstance(operation_id, str) or not operation_id:
        error(state.errors, state.path, f"{location}.id", "must be non-empty")
    elif operation_id in state.seen_ids:
        error(state.errors, state.path, f"{location}.id", "must be unique")
    else:
        state.seen_ids.add(operation_id)


def _validate_operation_wire(
    operation: Mapping[str, Any], location: str, state: PublicRegistryState
) -> None:
    method = operation.get("method")
    _validate_method_status(method, operation.get("method_status"), location, state)
    _validate_wire_identity(method, operation.get("path"), location, state)


def _validate_method_status(
    method: Any, method_status: Any, location: str, state: PublicRegistryState
) -> None:
    if method is not None and (not isinstance(method, str) or not HTTP_METHOD.fullmatch(method)):
        error(
            state.errors,
            state.path,
            f"{location}.method",
            "must be null or an uppercase HTTP token",
        )
    if method is None:
        _validate_missing_method_status(method_status, location, state)
    else:
        _validate_documented_method_status(method_status, location, state)


def _validate_missing_method_status(value: Any, location: str, state: PublicRegistryState) -> None:
    if value != "target_contract_required":
        error(
            state.errors,
            state.path,
            f"{location}.method_status",
            "must be target_contract_required when method is null",
        )


def _validate_documented_method_status(
    value: Any, location: str, state: PublicRegistryState
) -> None:
    if value not in {"official_documentation", "officially_documented"}:
        error(
            state.errors,
            state.path,
            f"{location}.method_status",
            "must classify the method as officially documented",
        )


def _validate_wire_identity(
    method: Any,
    operation_path: Any,
    location: str,
    state: PublicRegistryState,
) -> None:
    path = _public_operation_path(operation_path, location, state)
    identity = (method if isinstance(method, str) else None, path)
    if identity in state.seen_wire_identities:
        error(state.errors, state.path, location, "duplicates a method/path example")
    state.seen_wire_identities.add(identity)


def _public_operation_path(value: Any, location: str, state: PublicRegistryState) -> str:
    if isinstance(value, str) and value.startswith("/api/"):
        return value
    error(
        state.errors,
        state.path,
        f"{location}.path",
        "must be an absolute /api/ path",
    )
    return "<invalid>"


def _validate_operation_content(
    operation: Mapping[str, Any], location: str, state: PublicRegistryState
) -> None:
    _validate_execution_status(operation.get("execution_status"), location, state)
    _validate_operation_text(operation, location, state)
    _validate_related_ids(operation.get("related_ids"), location, state)
    validate_string_array(
        operation.get("target_contract_resolution"),
        state.errors,
        state.path,
        f"{location}.target_contract_resolution",
        nonempty=True,
    )
    _validate_evidence(operation.get("evidence"), location, state)


def _validate_execution_status(value: Any, location: str, state: PublicRegistryState) -> None:
    if value not in {
        "target_contract_required",
        "example_only_target_contract_required",
    }:
        error(
            state.errors,
            state.path,
            f"{location}.execution_status",
            "must remain non-executable until target-contract resolution",
        )


def _validate_operation_text(
    operation: Mapping[str, Any], location: str, state: PublicRegistryState
) -> None:
    for field in ("purpose", "boundary"):
        value = operation.get(field)
        if not isinstance(value, str) or not value:
            error(state.errors, state.path, f"{location}.{field}", "must be non-empty")


def _validate_related_ids(value: Any, location: str, state: PublicRegistryState) -> None:
    for related_id in validate_string_array(
        value, state.errors, state.path, f"{location}.related_ids"
    ):
        if related_id not in state.concept_ids:
            error(
                state.errors,
                state.path,
                f"{location}.related_ids",
                f"unknown concept ID {related_id!r}",
            )


def _validate_evidence(value: Any, location: str, state: PublicRegistryState) -> None:
    evidence = expect_list(value, state.errors, state.path, f"{location}.evidence") or []
    if not evidence:
        error(state.errors, state.path, f"{location}.evidence", "must not be empty")
    for index, raw_item in enumerate(evidence):
        _validate_evidence_item(raw_item, f"{location}.evidence[{index}]", state)


def _validate_evidence_item(raw_item: Any, location: str, state: PublicRegistryState) -> None:
    item = expect_mapping(raw_item, state.errors, state.path, location)
    if item is None:
        return
    if item.get("class") != "official_documentation":
        error(state.errors, state.path, f"{location}.class", "must be official_documentation")
    _validate_evidence_url(item.get("url"), location, state)


def _validate_evidence_url(value: Any, location: str, state: PublicRegistryState) -> None:
    parsed_url = urlparse(value) if isinstance(value, str) else None
    if parsed_url is None or parsed_url.scheme != "https":
        error(
            state.errors,
            state.path,
            f"{location}.url",
            "must use HTTPS official hub.relution.io evidence",
        )
        return
    _validate_evidence_host(parsed_url.hostname, location, state)


def _validate_evidence_host(
    hostname: str | None, location: str, state: PublicRegistryState
) -> None:
    if hostname != "hub.relution.io":
        error(
            state.errors,
            state.path,
            f"{location}.url",
            "must use HTTPS official hub.relution.io evidence",
        )
